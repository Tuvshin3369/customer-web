/**
 * Худалдан авалтын түүх — `sales` хүснэгтээс нэвтэрсэн харилцагчийн мөрүүд.
 *
 * grouping: аль болох `document_id`, `sale_document_id`, … дээр суурьлана;
 *            байхгүй бол создан_at (сек) + branch_id + employee_id + ecommerce_phone гэж нэг суурьтай.
 *
 * Дэлгүүрийн нэр: branch_id → branches.name → employee.branch_id дамжуулаад →
 *                 эцэслэн product_id→products.store_id→stores.name
 *
 * RLS: `sales` дээр anon SELECT харилцагчийн `customer_id`-аар шүүх policy шаардлагатай.
 */

import { resolveCustomerIdForOnlineOrder } from './customersRegister';

export type PurchaseCreditType = 'paid' | 'partial' | 'credit';

export interface PurchaseHistorySaleProduct {
  name: string;
  quantity: number;
  price: number;
}

/** UI / print-тай тохируулсан нэг захиалга (sales мөрүүдийн бүлэг) */
export interface PurchaseHistoryGroupedSale {
  id: string;
  date: string;
  store: string;
  phone: string;
  note?: string;
  creditType: PurchaseCreditType;
  creditAmount?: number;
  products: PurchaseHistorySaleProduct[];
}

interface SupabaseEnv {
  restBase: string;
  anonKey: string;
}

function getSupabaseEnv(): SupabaseEnv {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!supabaseUrl?.trim() || !anonKey?.trim()) {
    throw new Error('Supabase тохиргоо (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) дутуу байна.');
  }
  return { restBase: supabaseUrl.replace(/\/$/, ''), anonKey: anonKey.trim() };
}

function restGetHeaders(anonKey: string): HeadersInit {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    Accept: 'application/json',
  };
}

/** Өндөр урсгалт үндсэн sales query — pagination range */
function restSalesListHeaders(anonKey: string): HeadersInit {
  return {
    ...restGetHeaders(anonKey),
    Prefer: 'count=estimated',
    Range: '0-5999',
  };
}

async function parseJsonSafely(res: Response): Promise<unknown> {
  const raw = await res.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function formatPostgrestError(json: unknown, res: Response): string {
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    const m = typeof o.message === 'string' ? o.message.trim() : '';
    if (m) return m;
  }
  return `HTTP ${res.status}`;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function stringifyPhone(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'number') return Number.isFinite(raw) ? String(Math.trunc(raw)) : '';
  const s = String(raw).trim();
  return s;
}

function simpleHashPositive(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Local calendar day → UTC ISO inclusive bounds for filtering `created_at` */
export function utcDayBoundsIso(dateYYYYMMDD: string): { gte: string; lte: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateYYYYMMDD.trim());
  if (!m) {
    const now = new Date();
    const y = now.getFullYear();
    const mo = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return utcDayBoundsIso(`${y}-${mo}-${d}`);
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const start = new Date(y, mo - 1, d, 0, 0, 0, 0);
  const end = new Date(y, mo - 1, d, 23, 59, 59, 999);
  return { gte: start.toISOString(), lte: end.toISOString() };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDisplayDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function firstNonEmptyString(row: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
}

function saleGroupKey(row: Record<string, unknown>): string {
  const doc = firstNonEmptyString(row, [
    'sale_document_id',
    'document_id',
    'order_id',
    'sale_group_id',
    'parent_sale_id',
    'sale_parent_id',
    'receipt_no',
    'receipt_number',
    'group_id',
  ]);
  if (doc !== null) return `doc:${doc}`;

  const createdRaw =
    typeof row.created_at === 'string'
      ? row.created_at
      : typeof row.sold_date === 'string'
        ? row.sold_date
        : '';
  const trunc = createdRaw ? createdRaw.slice(0, 19) : 'na';

  const branch = row.branch_id != null ? String(row.branch_id) : '';
  const emp = row.employee_id != null ? String(row.employee_id) : '';
  const phone = stringifyPhone(row.ecommerce_phone);
  return `${trunc}|${branch}|${emp}|${phone}`;
}

function inferCredit(head: Record<string, unknown>, orderTotalRounded: number): {
  creditType: PurchaseCreditType;
  creditAmount?: number;
} {
  /** Төлөгдсөн бүрэн бол */
  const paidFlags = [
    head.payment_completed,
    head.is_paid,
    head.payment_complete,
    head.fully_paid,
    head.ecommerce_payment_status,
  ];
  const explicitPaid =
    paidFlags.some((x) => x === true || x === 1 || String(x).toLowerCase() === 'true')
      ? true
      : paidFlags.some((x) => x === false || x === 0) ? false : null;

  const debtCandidates = [
    head.remaining_debt,
    head.remainder_amount,
    head.remaining_amount,
    head.debt_amount,
    head.unpaid_amount,
    head.balance_due,
    head.loan_balance,
    head.outstanding_balance,
    head.credit_remainder,
  ];
  let debt = 0;
  for (const c of debtCandidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0.01) {
      debt = Math.max(debt, n);
    }
  }

  /** Хэсэг хуваарилсан */
  const partialFlag =
    head.is_partial_payment === true ||
    head.partial_payment === true ||
    head.pay_kind === 'partial' ||
    String(head.pay_type ?? '').toLowerCase() === 'partial';

  if (explicitPaid === true || (explicitPaid !== false && debt <= 0.01 && !partialFlag))
    return { creditType: 'paid' };

  if (partialFlag || (debt > 0 && orderTotalRounded > 0 && debt < orderTotalRounded * 0.999)) {
    return { creditType: 'partial', creditAmount: Math.round(Math.max(0, debt)) };
  }
  /** Бүрэн зээлийн үлдэгдэлтэй */
  if (debt > 0) {
    return { creditType: 'credit' };
  }
  return { creditType: 'credit' };
}

const FETCH_CHUNK = 80;

async function fetchBranchesByIds(
  env: SupabaseEnv,
  ids: string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (ids.length === 0) return out;
  const headers = restGetHeaders(env.anonKey);
  for (let i = 0; i < ids.length; i += FETCH_CHUNK) {
    const chunk = ids.slice(i, i + FETCH_CHUNK);

    let json: unknown | null = null;
    let ok = false;

    try {
      const q1 = new URLSearchParams({ select: 'id,name', id: `in.(${chunk.join(',')})` });
      const res = await fetch(`${env.restBase}/rest/v1/branches?${q1.toString()}`, { headers });
      json = await parseJsonSafely(res);
      ok = res.ok && Array.isArray(json);
    } catch {
      ok = false;
    }

    if (!ok) {
      try {
        const q2 = new URLSearchParams({ select: 'id,branch_name', id: `in.(${chunk.join(',')})` });
        const res2 = await fetch(`${env.restBase}/rest/v1/branches?${q2.toString()}`, { headers });
        json = await parseJsonSafely(res2);
        ok = res2.ok && Array.isArray(json);
      } catch {
        ok = false;
      }
    }

    if (!ok || !Array.isArray(json)) continue;
    for (const row of json as Record<string, unknown>[]) {
      const id = row.id != null ? String(row.id) : '';
      const nm =
        typeof row.name === 'string'
          ? row.name.trim()
          : typeof row.branch_name === 'string'
            ? row.branch_name.trim()
            : '';
      if (id && nm) out[id] = nm;
    }
  }
  return out;
}

async function fetchEmployeesBranchHints(
  env: SupabaseEnv,
  ids: string[],
): Promise<{ branchByEmp: Record<string, string>; storeByEmp: Record<string, string> }> {
  const branchByEmp: Record<string, string> = {};
  const storeByEmp: Record<string, string> = {};
  if (ids.length === 0) return { branchByEmp, storeByEmp };
  const headers = restGetHeaders(env.anonKey);
  for (let i = 0; i < ids.length; i += FETCH_CHUNK) {
    const chunk = ids.slice(i, i + FETCH_CHUNK);
    const q = new URLSearchParams({
      id: `in.(${chunk.join(',')})`,
      select: 'id,branch_id,store_id',
    });
    try {
      const res = await fetch(`${env.restBase}/rest/v1/employees?${q.toString()}`, { headers });
      const json = await parseJsonSafely(res);
      if (!res.ok || !Array.isArray(json)) continue;
      for (const row of json as Record<string, unknown>[]) {
        const id = row.id != null ? String(row.id) : '';
        if (!id) continue;
        const bid = row.branch_id != null && String(row.branch_id).trim()
          ? String(row.branch_id).trim()
          : '';
        const sid = row.store_id != null && String(row.store_id).trim()
          ? String(row.store_id).trim()
          : '';
        if (bid) branchByEmp[id] = bid;
        if (sid) storeByEmp[id] = sid;
      }
    } catch {
      /* табл аль хэдийн байхгүй */
    }
  }
  return { branchByEmp, storeByEmp };
}

async function fetchStoresByIds(
  env: SupabaseEnv,
  ids: string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (ids.length === 0) return out;
  const headers = restGetHeaders(env.anonKey);
  for (let i = 0; i < ids.length; i += FETCH_CHUNK) {
    const chunk = ids.slice(i, i + FETCH_CHUNK);
    const q = new URLSearchParams({ select: 'id,name', id: `in.(${chunk.join(',')})` });
    try {
      const res = await fetch(`${env.restBase}/rest/v1/stores?${q.toString()}`, { headers });
      const json = await parseJsonSafely(res);
      if (!res.ok || !Array.isArray(json)) continue;
      for (const row of json as Record<string, unknown>[]) {
        const id = row.id != null ? String(row.id) : '';
        const name = typeof row.name === 'string' ? row.name.trim() : '';
        if (id && name) out[id] = name;
      }
    } catch {
      /* */
    }
  }
  return out;
}

async function fetchProductsStoreAndName(
  env: SupabaseEnv,
  ids: string[],
): Promise<{ storeByPid: Record<string, string>; nameByPid: Record<string, string> }> {
  const storeByPid: Record<string, string> = {};
  const nameByPid: Record<string, string> = {};
  if (ids.length === 0) return { storeByPid, nameByPid };
  const headers = restGetHeaders(env.anonKey);
  for (let i = 0; i < ids.length; i += FETCH_CHUNK) {
    const chunk = ids.slice(i, i + FETCH_CHUNK);
    const q = new URLSearchParams({
      select: 'id,store_id,product_name',
      id: `in.(${chunk.join(',')})`,
    });
    try {
      const res = await fetch(`${env.restBase}/rest/v1/products?${q.toString()}`, { headers });
      const json = await parseJsonSafely(res);
      if (!res.ok || !Array.isArray(json)) continue;
      for (const row of json as Record<string, unknown>[]) {
        const id = row.id != null ? String(row.id) : '';
        if (!id) continue;
        const sid =
          row.store_id != null && String(row.store_id).trim()
            ? String(row.store_id).trim()
            : '';
        const nm =
          typeof row.product_name === 'string' ? row.product_name.trim() : '';
        if (sid) storeByPid[id] = sid;
        if (nm) nameByPid[id] = nm;
      }
    } catch {
      /* */
    }
  }
  return { storeByPid, nameByPid };
}

function resolveStoreNameForRow(
  row: Record<string, unknown>,
  branchNames: Record<string, string>,
  branchByEmp: Record<string, string>,
  storeByEmp: Record<string, string>,
  storeByPid: Record<string, string>,
  storeNames: Record<string, string>,
): string {
  const bid = row.branch_id != null ? String(row.branch_id).trim() : '';
  if (bid && branchNames[bid]) return branchNames[bid];

  const eid = row.employee_id != null ? String(row.employee_id).trim() : '';
  if (eid) {
    const eb = branchByEmp[eid];
    if (eb && branchNames[eb]) return branchNames[eb];
    const es = storeByEmp[eid];
    if (es && storeNames[es]) return storeNames[es];
  }

  const pid = row.product_id != null ? String(row.product_id).trim() : '';
  if (pid && storeByPid[pid]) {
    const sid = storeByPid[pid];
    if (storeNames[sid]) return storeNames[sid];
  }

  return '—';
}

function resolveProductPrice(row: Record<string, unknown>): number {
  /** Unit sold price fallback */
  const unit = num(row.sold_price ?? row.price ?? row.unit_price ?? row.sale_price);
  if (unit > 0) return Math.round(unit);
  /** Line total ÷ qty */
  const qty = Math.max(
    1,
    Math.round(num(row.product_number ?? row.quantity ?? row.qty ?? row.product_qty)),
  );
  const line = num(row.line_total ?? row.total_amount ?? row.amount ?? row.payment_amount ?? 0);
  if (line > 0) return Math.max(1, Math.round(line / qty));
  return 0;
}

export async function fetchSalesPurchaseHistoryGrouped(params: {
  isLoggedIn: boolean;
  phone: number | null;
  googleId: string | null;
  dateFrom: string;
  dateTo: string;
}): Promise<PurchaseHistoryGroupedSale[]> {
  if (!params.isLoggedIn) return [];

  const env = getSupabaseEnv();
  const customerId = await resolveCustomerIdForOnlineOrder({
    isLoggedIn: true,
    phone: params.phone,
    googleId: params.googleId,
  });

  const fromKey = (params.dateFrom.split('T')[0] ?? params.dateFrom).trim();
  const toKey = (params.dateTo.split('T')[0] ?? params.dateTo).trim();
  const fromBounds = utcDayBoundsIso(fromKey);
  const toBounds = utcDayBoundsIso(toKey);

  const headers = restSalesListHeaders(env.anonKey);
  const qp = new URLSearchParams({
    customer_id: `eq.${customerId}`,
    order: 'created_at.desc',
  });
  qp.append('created_at', `gte.${fromBounds.gte}`);
  qp.append('created_at', `lte.${toBounds.lte}`);

  /** Бүх талбарууд — баганы нэр бааз бүрт өөр байж болох тул * */
  qp.set('select', '*');

  const res = await fetch(`${env.restBase}/rest/v1/sales?${qp.toString()}`, { headers });
  const json = await parseJsonSafely(res);
  if (!res.ok) {
    throw new Error(formatPostgrestError(json, res) || 'Худалдан авалтын мэдээлэл унших боломжгүй.');
  }
  if (!Array.isArray(json) || json.length === 0) return [];

  const rows = json as Record<string, unknown>[];
  const branchIds = [...new Set(
    rows.map((r) => (r.branch_id != null ? String(r.branch_id).trim() : '')).filter(Boolean),
  )];
  const empIds = [...new Set(
    rows.map((r) => (r.employee_id != null ? String(r.employee_id).trim() : '')).filter(Boolean),
  )];
  const prodIds = [...new Set(
    rows.map((r) => (r.product_id != null ? String(r.product_id).trim() : '')).filter(Boolean),
  )];

  const [branchNames, empHints, prodHints] = await Promise.all([
    fetchBranchesByIds(env, branchIds),
    fetchEmployeesBranchHints(env, empIds),
    fetchProductsStoreAndName(env, prodIds),
  ]);

  const storeIdSet = new Set<string>(
    [...Object.values(prodHints.storeByPid), ...Object.values(empHints.storeByEmp)].filter(Boolean),
  );
  const storeNames = await fetchStoresByIds(env, [...storeIdSet]);

  const groups = new Map<string, Record<string, unknown>[]>();
  for (const raw of rows) {
    const k = saleGroupKey(raw);
    const arr = groups.get(k);
    if (arr) arr.push(raw);
    else groups.set(k, [raw]);
  }

  const result: PurchaseHistoryGroupedSale[] = [];

  for (const [gk, arrRaw] of groups) {
    const arr = [...arrRaw].sort(
      (a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')),
    );
    const head = arr[0];
    const created =
      typeof head.created_at === 'string'
        ? head.created_at
        : typeof head.sold_date === 'string'
          ? head.sold_date
          : new Date().toISOString();

    const phone = stringifyPhone(head.ecommerce_phone);
    const store = resolveStoreNameForRow(
      head,
      branchNames,
      empHints.branchByEmp,
      empHints.storeByEmp,
      prodHints.storeByPid,
      storeNames,
    );

    /** Тэмдэглэлүүдийн нэгтгэл — хоосныг үл авах */
    const notesSet = new Set<string>();
    for (const r of arr) {
      const n = typeof r.note === 'string' ? r.note.trim() : '';
      if (n) notesSet.add(n);
    }
    const noteJoined = [...notesSet].join(' · ');

    const products: PurchaseHistorySaleProduct[] = arr.map((r) => {
      const pid = r.product_id != null ? String(r.product_id) : '';
      const fromJoin = pid && prodHints.nameByPid[pid] ? prodHints.nameByPid[pid] : '';
      const pnameRaw = typeof r.product_name === 'string' ? String(r.product_name).trim() : '';
      let nm = fromJoin || pnameRaw || (pid ? '—' : 'Бараа');
      if (!nm) nm = '—';

      const qty = Math.max(1, Math.round(num(r.product_number ?? r.quantity ?? r.qty ?? 1)));
      const price = resolveProductPrice(r);
      return { name: nm, quantity: qty, price };
    });

    const orderTotal = products.reduce((s, p) => s + p.price * p.quantity, 0);
    const orderTotalR = Math.round(orderTotal);

    const { creditType, creditAmount } = inferCredit(head, orderTotalR);

    const rowIdCanon =
      typeof head.id === 'string'
        ? head.id.replace(/-/g, '').toUpperCase()
        : head.id != null
          ? String(head.id).toUpperCase()
          : '';
    let displayId: string;
    if (rowIdCanon.length >= 8) displayId = `SAL-${rowIdCanon.slice(0, 8)}`;
    else {
      const h = simpleHashPositive(`${gk}:${created}`)
        .toString(36)
        .toUpperCase()
        .padStart(8, '0')
        .slice(0, 8);
      displayId = `SAL-${h}`;
    }

    result.push({
      id: displayId,
      date: formatDisplayDate(created),
      store,
      phone,
      creditType,
      creditAmount,
      note: noteJoined || undefined,
      products,
    });
  }

  result.sort((a, b) => b.date.localeCompare(a.date));
  return result;
}
