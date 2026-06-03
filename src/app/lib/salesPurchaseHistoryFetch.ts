/**
 * Худалдан авалтын түүх — `sales` хүснэгтээс нэвтэрсэн харилцагчийн мөрүүд.
 *
 * grouping: аль болох `document_id`, `sale_document_id`, … дээр суурьлана;
 *            байхгүй бол создан_at (сек) + branch_id + employee_id + ecommerce_phone гэж нэг суурьтай.
 *
 * Дэлгүүрийн нэр: branch_id → branches.store_id → stores.name
 *                 (employee / product дамжуулан store_id resolve)
 *
 * RLS: `sales` дээр anon SELECT харилцагчийн `customer_id`-аар шүүх policy шаардлагатай.
 */

import { buildCreditTransferNote } from './creditTransferNote';
import {
  fetchCustomerProfileByGoogleId,
  fetchCustomerProfileByPhone,
  resolveCustomerIdForOnlineOrder,
} from './customersRegister';
import {
  buildSaleLineExtraInfo,
  type SaleLineExtraFields,
  type SaleLineProductMeta,
} from '../utils/saleLineExtraInfo';
import { buildSaleProductPrintName } from '../utils/saleProductPrintName';

export type PurchaseCreditType = 'paid' | 'partial' | 'credit';

export interface PurchaseHistorySaleProduct {
  name: string;
  quantity: number;
  price: number;
  /** Барааны нэрний доор — өнгийн код, хөөс, урт (сагс/захиалга шиг) */
  extraInfo?: string | null;
  /** Хэвлэл — «Зарлагын баримт» форматтай нэр */
  printName?: string;
}

/** Зээл товчны панел — дансны мэдээлэл (гол салбар) */
export interface PurchaseSaleBankInfo {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
}

/** UI / print-тай тохируулсан нэг захиалга (sales мөрүүдийн бүлэг) */
export interface PurchaseHistoryGroupedSale {
  id: string;
  date: string;
  store: string;
  phone: string; /** sales.ecommerce_phone — null бол хоосон */
  note?: string;
  creditType: PurchaseCreditType;
  creditAmount?: number;
  products: PurchaseHistorySaleProduct[];
  /** Зээл товч дарахад PaymentInfoCard-д */
  bankInfo?: PurchaseSaleBankInfo;
  /** Гүйлгээний утга — «Зээл төлөв -» + created_at + утас */
  transferNote?: string;
  /** Борлуулалтын created_at (ISO) */
  createdAtIso: string;
  /** Хэвлэх — sales.sales_id (PK) жагсаалт */
  salesRowIds: string[];
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

/** PostgREST `in.(...)` — UUID-г хашилттай */
function formatPostgrestInList(values: string[]): string {
  return values
    .map((v) => {
      const s = v.trim();
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
        return `"${s}"`;
      }
      return s;
    })
    .join(',');
}

/** `payment_history.sales_id` → `sales.id` (PK) */
function pickSaleRowId(row: Record<string, unknown>): string {
  for (const k of ['id', 'sales_id', 'sale_id'] as const) {
    const v = row[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return '';
}

function inferCreditFromPaymentAmount(
  creditAmount: number,
  orderTotalRounded: number,
): { creditType: PurchaseCreditType; creditAmount?: number } {
  if (creditAmount <= 0.01) return { creditType: 'paid' };
  const rounded = Math.round(creditAmount);
  if (orderTotalRounded > 0 && rounded < orderTotalRounded * 0.999) {
    return { creditType: 'partial', creditAmount: rounded };
  }
  return { creditType: 'credit', creditAmount: rounded };
}

interface StoreCreditTypes {
  typeIds: string[];
  typeNames: string[];
}

/** `payment_history.payment_type` → `payment_types.id` (UUID) */
const DEFAULT_PAYMENT_HISTORY_COLS: PaymentHistoryCols = {
  saleCol: 'sales_id',
  typeIdCol: 'payment_type',
  typeNameCol: null,
  amountCol: 'payment_amount',
};

/** Дэлгүүр бүрт `payment_types.is_credit=true` төлбөрийн төрөл */
async function fetchCreditPaymentTypesByStoreIds(
  env: SupabaseEnv,
  storeIds: string[],
): Promise<Record<string, StoreCreditTypes>> {
  const out: Record<string, StoreCreditTypes> = {};
  if (storeIds.length === 0) return out;
  const headers = restGetHeaders(env.anonKey);

  const ingest = (json: unknown): void => {
    if (!Array.isArray(json)) return;
    for (const row of json as Record<string, unknown>[]) {
      const sid = row.store_id != null ? String(row.store_id).trim() : '';
      if (!sid) continue;
      const bucket = out[sid] ?? { typeIds: [], typeNames: [] };
      const id = row.id != null ? String(row.id).trim() : '';
      if (id && !bucket.typeIds.includes(id)) bucket.typeIds.push(id);
      const nm =
        typeof row.type === 'string'
          ? row.type.trim()
          : row.type != null
            ? String(row.type).trim()
            : '';
      if (nm && !bucket.typeNames.includes(nm)) bucket.typeNames.push(nm);
      out[sid] = bucket;
    }
  };

  for (let i = 0; i < storeIds.length; i += FETCH_CHUNK) {
    const chunk = storeIds.slice(i, i + FETCH_CHUNK);
    const q = new URLSearchParams({
      select: 'id,store_id,type,is_credit',
      store_id: `in.(${formatPostgrestInList(chunk)})`,
      is_credit: 'eq.true',
    });
    try {
      const res = await fetch(`${env.restBase}/rest/v1/payment_types?${q.toString()}`, {
        headers,
      });
      const json = await parseJsonSafely(res);
      if (res.ok) {
        ingest(json);
        continue;
      }
      /** store_id шүүлт алдаатай бол бүх зээлийн төрлийг авч client-side шүүнэ */
      const qAll = new URLSearchParams({
        select: 'id,store_id,type,is_credit',
        is_credit: 'eq.true',
      });
      const resAll = await fetch(`${env.restBase}/rest/v1/payment_types?${qAll.toString()}`, {
        headers,
      });
      const jsonAll = await parseJsonSafely(resAll);
      if (!resAll.ok || !Array.isArray(jsonAll)) continue;
      const chunkSet = new Set(chunk);
      ingest(
        (jsonAll as Record<string, unknown>[]).filter(
          (r) => r.store_id != null && chunkSet.has(String(r.store_id).trim()),
        ),
      );
    } catch {
      /* */
    }
  }
  return out;
}

interface PaymentHistoryCols {
  saleCol: string;
  typeIdCol: string | null;
  typeNameCol: string | null;
  amountCol: string;
}

let paymentHistoryColsCache: PaymentHistoryCols | null = null;

async function detectPaymentHistoryCols(env: SupabaseEnv): Promise<PaymentHistoryCols> {
  if (paymentHistoryColsCache) return paymentHistoryColsCache;
  const headers = restGetHeaders(env.anonKey);
  try {
    const q = new URLSearchParams({ select: '*', limit: '1' });
    const res = await fetch(`${env.restBase}/rest/v1/payment_history?${q.toString()}`, {
      headers,
    });
    const json = await parseJsonSafely(res);
    if (!res.ok || !Array.isArray(json) || json.length === 0) {
      paymentHistoryColsCache = DEFAULT_PAYMENT_HISTORY_COLS;
      return paymentHistoryColsCache;
    }
    const keys = Object.keys(json[0] as Record<string, unknown>);
    const saleCol =
      keys.find((k) => k === 'sales_id') ??
      keys.find((k) => k === 'sale_id') ??
      keys.find((k) => /sale.*id/i.test(k)) ??
      DEFAULT_PAYMENT_HISTORY_COLS.saleCol;
    const typeIdCol =
      keys.find((k) => k === 'payment_type_id') ??
      keys.find((k) => k === 'payment_types_id') ??
      keys.find((k) => k === 'payment_type') ??
      keys.find((k) => k === 'type_id') ??
      null;
    const typeNameCol =
      keys.find((k) => k === 'payment_type_name') ??
      keys.find((k) => k === 'type_name') ??
      null;
    const amountCol =
      keys.find((k) => k === 'payment_amount') ??
      keys.find((k) => k === 'amount') ??
      DEFAULT_PAYMENT_HISTORY_COLS.amountCol;
    paymentHistoryColsCache = {
      saleCol,
      typeIdCol,
      typeNameCol,
      amountCol,
    };
    return paymentHistoryColsCache;
  } catch {
    paymentHistoryColsCache = DEFAULT_PAYMENT_HISTORY_COLS;
    return paymentHistoryColsCache;
  }
}

function paymentRowMatchesStoreCredit(
  row: Record<string, unknown>,
  cols: PaymentHistoryCols,
  credit: StoreCreditTypes | undefined,
): boolean {
  if (!credit || (credit.typeIds.length === 0 && credit.typeNames.length === 0)) return false;

  if (cols.typeIdCol) {
    const pt = row[cols.typeIdCol];
    const ptStr = pt != null ? String(pt).trim() : '';
    if (ptStr && credit.typeIds.includes(ptStr)) return true;
  }
  if (cols.typeNameCol) {
    const pt = row[cols.typeNameCol];
    const ptStr = pt != null ? String(pt).trim() : '';
    if (ptStr && credit.typeNames.some((n) => n === ptStr)) return true;
  }
  return false;
}

/**
 * `payment_history`-аас борлуулалт бүрийн зээлийн `payment_amount` нийлбэр.
 * branch_id → store_id → тухайн дэлгүүрийн `is_credit=true` төрөлтэй таарна.
 */
async function fetchCreditAmountBySaleIds(
  env: SupabaseEnv,
  saleIds: string[],
  saleIdToStoreId: Record<string, string>,
  creditByStore: Record<string, StoreCreditTypes>,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (saleIds.length === 0) return out;

  const cols = await detectPaymentHistoryCols(env);

  const headers = restGetHeaders(env.anonKey);
  const select = [...new Set([cols.saleCol, cols.amountCol, cols.typeIdCol, cols.typeNameCol])]
    .filter((c): c is string => !!c)
    .join(',');

  const allCreditTypeIds = [
    ...new Set(Object.values(creditByStore).flatMap((c) => c.typeIds)),
  ];

  for (let i = 0; i < saleIds.length; i += FETCH_CHUNK) {
    const chunk = saleIds.slice(i, i + FETCH_CHUNK);
    const q = new URLSearchParams({
      select,
      [cols.saleCol]: `in.(${formatPostgrestInList(chunk)})`,
    });
    if (cols.typeIdCol && allCreditTypeIds.length > 0) {
      q.set(cols.typeIdCol, `in.(${formatPostgrestInList(allCreditTypeIds)})`);
    }
    try {
      const res = await fetch(`${env.restBase}/rest/v1/payment_history?${q.toString()}`, {
        headers,
      });
      const json = await parseJsonSafely(res);
      if (!res.ok || !Array.isArray(json)) continue;
      for (const row of json as Record<string, unknown>[]) {
        const saleId =
          row[cols.saleCol] != null ? String(row[cols.saleCol]).trim() : '';
        if (!saleId) continue;
        const storeId = saleIdToStoreId[saleId] ?? '';
        const credit = storeId ? creditByStore[storeId] : undefined;
        if (!paymentRowMatchesStoreCredit(row, cols, credit)) continue;
        const amt = num(row[cols.amountCol]);
        out[saleId] = (out[saleId] ?? 0) + amt;
      }
    } catch {
      /* */
    }
  }

  for (const k of Object.keys(out)) {
    out[k] = Math.round(out[k]);
  }
  return out;
}

const FETCH_CHUNK = 80;

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
      id: `in.(${formatPostgrestInList(chunk)})`,
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
): Promise<{
  storeByPid: Record<string, string>;
  nameByPid: Record<string, string>;
  metaByPid: Record<string, SaleLineProductMeta>;
}> {
  const storeByPid: Record<string, string> = {};
  const nameByPid: Record<string, string> = {};
  const metaByPid: Record<string, SaleLineProductMeta> = {};
  if (ids.length === 0) return { storeByPid, nameByPid, metaByPid };
  const headers = restGetHeaders(env.anonKey);
  for (let i = 0; i < ids.length; i += FETCH_CHUNK) {
    const chunk = ids.slice(i, i + FETCH_CHUNK);
    const q = new URLSearchParams({
      select: 'id,store_id,product_name,is_coded_paint,is_foam_range,is_calculate_length,waste,is_pigment',
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
        const wasteRaw = num(row.waste);
        metaByPid[id] = {
          is_coded_paint: row.is_coded_paint === true,
          is_foam_range: row.is_foam_range === true,
          is_calculate_length: row.is_calculate_length === true,
          is_pigment:
            row.is_pigment === true ||
            row.is_pigment === 1 ||
            row.is_pigment === '1',
          waste: wasteRaw > 0 ? wasteRaw : null,
        };
      }
    } catch {
      /* */
    }
  }
  return { storeByPid, nameByPid, metaByPid };
}

async function fetchCodedPaintCodesByIds(
  env: SupabaseEnv,
  ids: string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (ids.length === 0) return out;
  const headers = restGetHeaders(env.anonKey);
  for (let i = 0; i < ids.length; i += FETCH_CHUNK) {
    const chunk = ids.slice(i, i + FETCH_CHUNK);
    const q = new URLSearchParams({
      select: 'id,color_code',
      id: `in.(${chunk.join(',')})`,
    });
    try {
      const res = await fetch(`${env.restBase}/rest/v1/coded_paints?${q.toString()}`, { headers });
      const json = await parseJsonSafely(res);
      if (!res.ok || !Array.isArray(json)) continue;
      for (const row of json as Record<string, unknown>[]) {
        const id = row.id != null ? String(row.id) : '';
        const code =
          row.color_code != null ? String(row.color_code).trim() : '';
        if (id && code) out[id] = code;
      }
    } catch {
      /* RLS / сүлжээ */
    }
  }
  return out;
}

function saleExtraFieldsFromRow(row: Record<string, unknown>): SaleLineExtraFields {
  const coded_paint_id =
    row.coded_paint_id != null && String(row.coded_paint_id).trim()
      ? String(row.coded_paint_id).trim()
      : null;
  const foam_size =
    typeof row.foam_size === 'string' && row.foam_size.trim()
      ? row.foam_size.trim()
      : null;
  const lengthRaw = row.length_meter;
  const length_meter =
    lengthRaw != null && Number.isFinite(Number(lengthRaw)) ? Number(lengthRaw) : null;
  return { coded_paint_id, foam_size, length_meter };
}

/** branch_id → store_id (зээлийн дансны гол салбар сонгоход) */
async function fetchBranchStoreIdByIds(
  env: SupabaseEnv,
  ids: string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (ids.length === 0) return out;
  const headers = restGetHeaders(env.anonKey);
  for (let i = 0; i < ids.length; i += FETCH_CHUNK) {
    const chunk = ids.slice(i, i + FETCH_CHUNK);
    const q = new URLSearchParams({
      select: 'id,store_id',
      id: `in.(${formatPostgrestInList(chunk)})`,
    });
    try {
      const res = await fetch(`${env.restBase}/rest/v1/branches?${q.toString()}`, { headers });
      const json = await parseJsonSafely(res);
      if (!res.ok || !Array.isArray(json)) continue;
      for (const row of json as Record<string, unknown>[]) {
        const id = row.id != null ? String(row.id) : '';
        const sid =
          row.store_id != null && String(row.store_id).trim()
            ? String(row.store_id).trim()
            : '';
        if (id && sid) out[id] = sid;
      }
    } catch {
      /* */
    }
  }
  return out;
}

function resolveStoreIdForRow(
  row: Record<string, unknown>,
  branchStoreById: Record<string, string>,
  branchByEmp: Record<string, string>,
  storeByEmp: Record<string, string>,
  storeByPid: Record<string, string>,
): string {
  const direct =
    row.store_id != null && String(row.store_id).trim()
      ? String(row.store_id).trim()
      : '';
  if (direct) return direct;

  const bid = row.branch_id != null ? String(row.branch_id).trim() : '';
  if (bid && branchStoreById[bid]) return branchStoreById[bid];

  const eid = row.employee_id != null ? String(row.employee_id).trim() : '';
  if (eid) {
    const eb = branchByEmp[eid];
    if (eb && branchStoreById[eb]) return branchStoreById[eb];
    const es = storeByEmp[eid];
    if (es) return es;
  }

  const pid = row.product_id != null ? String(row.product_id).trim() : '';
  if (pid && storeByPid[pid]) return storeByPid[pid];

  return '';
}

/** `customers.phone` — гүйлгээний утгад эхний сонголт */
async function fetchCustomerPhoneById(
  env: SupabaseEnv,
  customerId: string,
): Promise<string> {
  if (!customerId.trim()) return '';
  const headers = restGetHeaders(env.anonKey);
  const q = new URLSearchParams({
    select: 'phone',
    id: `eq.${customerId}`,
    limit: '1',
  });
  try {
    const res = await fetch(`${env.restBase}/rest/v1/customers?${q.toString()}`, { headers });
    const json = await parseJsonSafely(res);
    if (!res.ok || !Array.isArray(json) || json.length === 0) return '';
    return stringifyPhone((json[0] as Record<string, unknown>).phone);
  } catch {
    return '';
  }
}

/** Зочин эсвэл register хоосон → хувийн данс, бусад → байгууллагын данс */
async function fetchCustomerHasCompanyRegister(params: {
  isLoggedIn: boolean;
  phone: number | null;
  googleId: string | null;
}): Promise<boolean> {
  if (!params.isLoggedIn) return false;
  try {
    const gid = params.googleId?.trim();
    if (gid) {
      const s = await fetchCustomerProfileByGoogleId(gid);
      return (s.register?.trim() ?? '').length > 0;
    }
    if (params.phone != null && params.phone > 0) {
      const s = await fetchCustomerProfileByPhone(params.phone);
      return (s.register?.trim() ?? '').length > 0;
    }
  } catch {
    /* */
  }
  return false;
}

/**
 * Дэлгүүр бүрийн `branches.is_main_branch=true` салбараас дансны мэдээлэл.
 * usePersonalAccount: зочин эсвэл customers.register=null
 */
async function fetchMainBranchBankByStoreIds(
  env: SupabaseEnv,
  storeIds: string[],
  usePersonalAccount: boolean,
): Promise<Record<string, PurchaseSaleBankInfo>> {
  const out: Record<string, PurchaseSaleBankInfo> = {};
  if (storeIds.length === 0) return out;
  const headers = restGetHeaders(env.anonKey);

  for (let i = 0; i < storeIds.length; i += FETCH_CHUNK) {
    const chunk = storeIds.slice(i, i + FETCH_CHUNK);
    const q = new URLSearchParams({
      select:
        'store_id,personal_name,personal_bank,personal_account,company_name,company_bank,company_account',
      store_id: `in.(${chunk.join(',')})`,
      is_main_branch: 'eq.true',
    });
    try {
      const res = await fetch(`${env.restBase}/rest/v1/branches?${q.toString()}`, { headers });
      const json = await parseJsonSafely(res);
      if (!res.ok || !Array.isArray(json)) continue;
      for (const row of json as Record<string, unknown>[]) {
        const sid = row.store_id != null ? String(row.store_id).trim() : '';
        if (!sid || out[sid]) continue;
        const pick = (k: string): string => {
          const v = row[k];
          return typeof v === 'string' ? v.trim() : v != null ? String(v).trim() : '';
        };
        const accountHolder = usePersonalAccount
          ? pick('personal_name')
          : pick('company_name');
        const bankName = usePersonalAccount ? pick('personal_bank') : pick('company_bank');
        const accountNumber = usePersonalAccount
          ? pick('personal_account')
          : pick('company_account');
        if (accountHolder || bankName || accountNumber) {
          out[sid] = {
            accountHolder: accountHolder || '—',
            bankName: bankName || '—',
            accountNumber: accountNumber || '—',
          };
        }
      }
    } catch {
      /* */
    }
  }
  return out;
}

function resolveStoreNameForRow(
  row: Record<string, unknown>,
  branchStoreById: Record<string, string>,
  branchByEmp: Record<string, string>,
  storeByEmp: Record<string, string>,
  storeByPid: Record<string, string>,
  storeNames: Record<string, string>,
): string {
  const storeId = resolveStoreIdForRow(
    row,
    branchStoreById,
    branchByEmp,
    storeByEmp,
    storeByPid,
  );
  if (storeId && storeNames[storeId]) return storeNames[storeId];
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

  const customerPhoneFromDb = await fetchCustomerPhoneById(env, customerId);
  const customerPhoneFallback =
    params.phone != null && params.phone > 0
      ? stringifyPhone(params.phone)
      : customerPhoneFromDb;

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
  const codedPaintIds = [
    ...new Set(
      rows
        .map((r) =>
          r.coded_paint_id != null && String(r.coded_paint_id).trim()
            ? String(r.coded_paint_id).trim()
            : '',
        )
        .filter(Boolean),
    ),
  ];

  const usePersonalBank = !params.isLoggedIn;

  const [branchStoreById, empHints, prodHints, codedCodeById, hasCompanyRegister] = await Promise.all([
    fetchBranchStoreIdByIds(env, branchIds),
    fetchEmployeesBranchHints(env, empIds),
    fetchProductsStoreAndName(env, prodIds),
    fetchCodedPaintCodesByIds(env, codedPaintIds),
    usePersonalBank
      ? Promise.resolve(false)
      : fetchCustomerHasCompanyRegister({
          isLoggedIn: params.isLoggedIn,
          phone: params.phone,
          googleId: params.googleId,
        }),
  ]);

  const storeIdSet = new Set<string>(
    [
      ...Object.values(prodHints.storeByPid),
      ...Object.values(empHints.storeByEmp),
      ...Object.values(branchStoreById),
    ].filter(Boolean),
  );
  const [storeNames, bankByStoreId] = await Promise.all([
    fetchStoresByIds(env, [...storeIdSet]),
    fetchMainBranchBankByStoreIds(env, [...storeIdSet], usePersonalBank || !hasCompanyRegister),
  ]);

  const saleIdToStoreId: Record<string, string> = {};
  const allSaleIds: string[] = [];
  for (const raw of rows) {
    const saleId = pickSaleRowId(raw);
    if (!saleId) continue;
    const storeId = resolveStoreIdForRow(
      raw,
      branchStoreById,
      empHints.branchByEmp,
      empHints.storeByEmp,
      prodHints.storeByPid,
    );
    if (storeId) saleIdToStoreId[saleId] = storeId;
    allSaleIds.push(saleId);
  }
  const uniqueSaleIds = [...new Set(allSaleIds)];
  const uniqueStoreIds = [...new Set(Object.values(saleIdToStoreId))];
  const creditByStore = await fetchCreditPaymentTypesByStoreIds(env, uniqueStoreIds);
  const creditAmountBySaleId = await fetchCreditAmountBySaleIds(
    env,
    uniqueSaleIds,
    saleIdToStoreId,
    creditByStore,
  );

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

    /** Борлуулалтын мөр / хэвлэл — зөвхөн sales.ecommerce_phone */
    let phone = stringifyPhone(head.ecommerce_phone);
    if (!phone) {
      for (const r of arr) {
        const p = stringifyPhone(r.ecommerce_phone);
        if (p) {
          phone = p;
          break;
        }
      }
    }

    /** Гүйлгээний утга — customers.phone эхний сонголт, байхгүй бол ecommerce_phone */
    let phoneForTransfer = customerPhoneFallback;
    if (!phoneForTransfer) phoneForTransfer = phone;

    const transferNote = buildCreditTransferNote(created, phoneForTransfer);
    const store = resolveStoreNameForRow(
      head,
      branchStoreById,
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
      const meta = pid ? prodHints.metaByPid[pid] : undefined;
      const fields = saleExtraFieldsFromRow(r);
      const extraInfo = buildSaleLineExtraInfo(
        meta,
        fields,
        codedCodeById,
        { requireProductFlags: false },
      );
      const printName = buildSaleProductPrintName(nm, meta, fields, codedCodeById);
      return { name: nm, quantity: qty, price, extraInfo, printName };
    });

    const orderTotal = products.reduce((s, p) => s + p.price * p.quantity, 0);
    const orderTotalR = Math.round(orderTotal);

    let groupCreditSum = 0;
    const seenSaleIds = new Set<string>();
    for (const r of arr) {
      const sid = pickSaleRowId(r);
      if (!sid || seenSaleIds.has(sid)) continue;
      seenSaleIds.add(sid);
      groupCreditSum += creditAmountBySaleId[sid] ?? 0;
    }
    const { creditType, creditAmount } = inferCreditFromPaymentAmount(
      groupCreditSum,
      orderTotalR,
    );

    let bankInfo: PurchaseSaleBankInfo | undefined;
    for (const r of arr) {
      const sid = resolveStoreIdForRow(
        r,
        branchStoreById,
        empHints.branchByEmp,
        empHints.storeByEmp,
        prodHints.storeByPid,
      );
      if (sid && bankByStoreId[sid]) {
        bankInfo = bankByStoreId[sid];
        break;
      }
    }

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

    const salesRowIds: string[] = [];
    for (const r of arr) {
      const sid = pickSaleRowId(r);
      if (sid && !salesRowIds.includes(sid)) salesRowIds.push(sid);
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
      bankInfo,
      transferNote,
      createdAtIso: created,
      salesRowIds,
    });
  }

  result.sort((a, b) => b.date.localeCompare(a.date));
  return result;
}
