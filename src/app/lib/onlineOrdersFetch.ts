/**
 * online_orders — «Миний захиалгууд» (нэвтэрсэн: customer_id) болон зочны
 * «Захиалга» хайлт (ecommerce_phone).
 *
 * Логик:
 *  - Нэвтэрсэн: `customer_id`-аар шүүж,
 *  - Зочин: `ecommerce_phone`-оор шүүж,
 *    нэг бөөнөөр оруулсан мөрүүдийг (нэг захиалга) дараах түлхүүрээр бүлэглэнэ:
 *    нэг бөөнөөр оруулсан мөрүүдийг (нэг захиалга) дараах түлхүүрээр бүлэглэнэ:
 *      store_id | ecommerce_phone | delivery_type | note | created_at (секунд хүртэл)
 *  - stores.name-аар дэлгүүрийн нэр, products.product_name-аар барааны нэрийг тус тус татна.
 *
 * Supabase RLS:
 *  - SELECT: customer_id-аар хайх тул anon SELECT policy (эсвэл RPC) шаардлагатай.
 *  - DELETE: тухайн мөрийг устгахад anon DELETE policy шаардлагатай.
 *  - Жишээ policy-уудыг `supabase/online_orders.sql`-аас үзнэ үү.
 */

import { phoneToInt64, resolveCustomerIdForOnlineOrder } from './customersRegister';
import {
  buildSaleLineExtraInfo,
  type SaleLineExtraFields,
  type SaleLineProductMeta,
} from '../utils/saleLineExtraInfo';

export type DeliveryType = 'pickup' | 'taxi' | 'delivery';

export interface OnlineOrderProduct {
  name: string;
  quantity: number;
  price: number;
  /**
   * Барааны нэрний доор харагдах нэмэлт мэдээлэл — гүйцээгдэхгүй бол `null`.
   * Жишээ:
   *  - "Өнгөний код: NR8012"
   *  - "Өндөр: 10см · Өргөн: 15см · Талбай: 187.5"
   *  - "Урт: 3.6см"
   */
  extraInfo: string | null;
}

export interface OnlineOrderGroup {
  /** Бүлгийн харагдах ID — `ORD-XXXXXXXX` (эхний мөрийн UUID-ийн 8 тэмдэгт) */
  id: string;
  /** "YYYY.MM.DD HH:MM" формат */
  date: string;
  /** stores.name */
  store: string;
  /** ecommerce_phone (хариулга — энгийн string) */
  phone: string;
  deliveryType: DeliveryType;
  /** online_orders.note (хоосон утгыг алгасна) */
  note?: string;
  products: OnlineOrderProduct[];
  /** Бүлэгт хамаарах online_orders.id-ууд — устгахад ашиглана */
  rowIds: string[];
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

function deliveryTypeFromDb(value: unknown): DeliveryType {
  const v = typeof value === 'string' ? value.trim() : '';
  if (v === 'Хүргэх') return 'delivery';
  if (v === 'Такси') return 'taxi';
  return 'pickup';
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatCreatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** ISO timestamp-ийг секунд нарийвчлалтай truncate хийж бүлэглэлд ашиглана. */
function truncateIsoToSeconds(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  d.setMilliseconds(0);
  return d.toISOString();
}

function shortIdFromUuid(uuid: string): string {
  const clean = uuid.replace(/-/g, '');
  return `ORD-${clean.slice(0, 8).toUpperCase()}`;
}

interface OnlineOrderRow {
  id: string;
  store_id: string;
  product_id: string;
  product_number: number;
  sold_price: number;
  ecommerce_phone: string;
  delivery_type: string | null;
  note: string | null;
  created_at: string;
  /** Өнгийн код холбоо (`is_coded_paint`) */
  coded_paint_id: string | null;
  /** Хөөсний өндөр×өргөн (`is_foam_range`), формат: "h,w" эсвэл "h" */
  foam_size: string | null;
  /** Уртын утга (`is_calculate_length`) */
  length_meter: number | null;
}

interface ProductMeta extends SaleLineProductMeta {
  name: string;
}

function nullableNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapRow(raw: Record<string, unknown>): OnlineOrderRow | null {
  const id = raw.id != null ? String(raw.id) : '';
  if (!id) return null;
  const store_id = raw.store_id != null ? String(raw.store_id) : '';
  const product_id = raw.product_id != null ? String(raw.product_id) : '';
  const product_number = Number(raw.product_number);
  const sold_price = Number(raw.sold_price);
  const phoneRaw = raw.ecommerce_phone;
  const ecommerce_phone =
    phoneRaw == null
      ? ''
      : typeof phoneRaw === 'number'
        ? String(phoneRaw)
        : String(phoneRaw).trim();
  const delivery_type =
    typeof raw.delivery_type === 'string' && raw.delivery_type.trim()
      ? raw.delivery_type.trim()
      : null;
  const note =
    typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim() : null;
  const created_at =
    typeof raw.created_at === 'string' ? raw.created_at : '';
  const coded_paint_id =
    raw.coded_paint_id != null && String(raw.coded_paint_id).trim()
      ? String(raw.coded_paint_id).trim()
      : null;
  const foam_size =
    typeof raw.foam_size === 'string' && raw.foam_size.trim()
      ? raw.foam_size.trim()
      : null;
  const length_meter = nullableNum(raw.length_meter);
  return {
    id,
    store_id,
    product_id,
    product_number: Number.isFinite(product_number) ? product_number : 0,
    sold_price: Number.isFinite(sold_price) ? sold_price : 0,
    ecommerce_phone,
    delivery_type,
    note,
    created_at,
    coded_paint_id,
    foam_size,
    length_meter,
  };
}

const FETCH_CHUNK = 80;

async function fetchStoresByIds(
  env: SupabaseEnv,
  ids: string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (ids.length === 0) return out;
  const headers = restGetHeaders(env.anonKey);
  for (let i = 0; i < ids.length; i += FETCH_CHUNK) {
    const chunk = ids.slice(i, i + FETCH_CHUNK);
    const q = new URLSearchParams({
      select: 'id,name',
      id: `in.(${chunk.join(',')})`,
    });
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
      /* RLS / сүлжээ */
    }
  }
  return out;
}

async function fetchProductMetaByIds(
  env: SupabaseEnv,
  ids: string[],
): Promise<Record<string, ProductMeta>> {
  const out: Record<string, ProductMeta> = {};
  if (ids.length === 0) return out;
  const headers = restGetHeaders(env.anonKey);
  for (let i = 0; i < ids.length; i += FETCH_CHUNK) {
    const chunk = ids.slice(i, i + FETCH_CHUNK);
    const q = new URLSearchParams({
      select: 'id,product_name,is_coded_paint,is_foam_range,is_calculate_length,waste',
      id: `in.(${chunk.join(',')})`,
    });
    try {
      const res = await fetch(`${env.restBase}/rest/v1/products?${q.toString()}`, { headers });
      const json = await parseJsonSafely(res);
      if (!res.ok || !Array.isArray(json)) continue;
      for (const row of json as Record<string, unknown>[]) {
        const id = row.id != null ? String(row.id) : '';
        const name = typeof row.product_name === 'string' ? row.product_name.trim() : '';
        if (!id) continue;
        out[id] = {
          name,
          is_coded_paint: row.is_coded_paint === true,
          is_foam_range: row.is_foam_range === true,
          is_calculate_length: row.is_calculate_length === true,
          waste: nullableNum(row.waste),
        };
      }
    } catch {
      /* RLS / сүлжээ */
    }
  }
  return out;
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
      const res = await fetch(`${env.restBase}/rest/v1/coded_paints?${q.toString()}`, {
        headers,
      });
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

/**
 * Барааны нэрний доор харагдах нэмэлт мэдээллийн мөр. Зөвхөн products-ын төрлийн
 * туг + тухайн online_orders-ын талбар хоёулаа бөглөгдсөн үед буцаана.
 */
function buildExtraInfo(
  meta: ProductMeta | undefined,
  row: OnlineOrderRow,
  codeById: Record<string, string>,
): string | null {
  const fields: SaleLineExtraFields = {
    coded_paint_id: row.coded_paint_id,
    foam_size: row.foam_size,
    length_meter: row.length_meter,
  };
  return buildSaleLineExtraInfo(meta, fields, codeById, { requireProductFlags: true });
}

const ONLINE_ORDER_SELECT =
  'id,store_id,product_id,product_number,sold_price,ecommerce_phone,delivery_type,note,created_at,coded_paint_id,foam_size,length_meter';

/**
 * `online_orders` мөрүүдийг (аль хэдийн шүүлт хийгдсэн) бүлэглж `OnlineOrderGroup[]` болгоно.
 */
async function buildOnlineOrderGroupsFromRows(
  env: SupabaseEnv,
  rows: OnlineOrderRow[],
): Promise<OnlineOrderGroup[]> {
  if (rows.length === 0) return [];

  const storeIds = [...new Set(rows.map((r) => r.store_id).filter((s) => s.length > 0))];
  const productIds = [...new Set(rows.map((r) => r.product_id).filter((s) => s.length > 0))];
  const codedPaintIds = [
    ...new Set(
      rows
        .map((r) => r.coded_paint_id)
        .filter((s): s is string => typeof s === 'string' && s.length > 0),
    ),
  ];
  const [storeNameById, productMetaById, codedCodeById] = await Promise.all([
    fetchStoresByIds(env, storeIds),
    fetchProductMetaByIds(env, productIds),
    fetchCodedPaintCodesByIds(env, codedPaintIds),
  ]);

  /** Бүлгийн түлхүүр: бөөнөөр оруулсан мөрүүд секундийн дотор адил гэж үзнэ. */
  const groups = new Map<string, OnlineOrderRow[]>();
  for (const r of rows) {
    const key = [
      r.store_id,
      r.ecommerce_phone,
      r.delivery_type ?? '',
      r.note ?? '',
      truncateIsoToSeconds(r.created_at),
    ].join('|');
    const arr = groups.get(key);
    if (arr) arr.push(r);
    else groups.set(key, [r]);
  }

  const result: OnlineOrderGroup[] = [];
  for (const arr of groups.values()) {
    arr.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const head = arr[0];
    const products: OnlineOrderProduct[] = arr.map((r) => {
      const meta = productMetaById[r.product_id];
      return {
        name: meta?.name ?? '—',
        quantity: r.product_number,
        price: r.sold_price,
        extraInfo: buildExtraInfo(meta, r, codedCodeById),
      };
    });
    result.push({
      id: shortIdFromUuid(head.id),
      date: formatCreatedAt(head.created_at),
      store: storeNameById[head.store_id] ?? '—',
      phone: head.ecommerce_phone,
      deliveryType: deliveryTypeFromDb(head.delivery_type),
      note: head.note ?? undefined,
      products,
      rowIds: arr.map((r) => r.id),
    });
  }

  /** Хамгийн сүүлийн захиалга эхэндээ */
  result.sort((a, b) => b.date.localeCompare(a.date));
  return result;
}

/**
 * Зочин / нэвтрээгүй: `online_orders.ecommerce_phone`-аар (DB int8) хайж ижил бүлэглэлттэй жагсаалт буцаана.
 */
export async function fetchOnlineOrdersByEcommercePhone(phoneInput: string): Promise<OnlineOrderGroup[]> {
  const phoneNum = phoneToInt64(phoneInput);
  if (Number.isNaN(phoneNum)) {
    throw new Error('Утасны дугаар буруу байна.');
  }

  const env = getSupabaseEnv();
  const headers = restGetHeaders(env.anonKey);
  const q = new URLSearchParams({
    select: ONLINE_ORDER_SELECT,
    ecommerce_phone: `eq.${phoneNum}`,
    order: 'created_at.desc',
  });
  const res = await fetch(`${env.restBase}/rest/v1/online_orders?${q.toString()}`, {
    headers,
  });
  const json = await parseJsonSafely(res);
  if (!res.ok) {
    throw new Error(formatPostgrestError(json, res) || 'Захиалгуудыг татаж чадсангүй.');
  }
  if (!Array.isArray(json)) return [];

  const rows = (json as Record<string, unknown>[])
    .map(mapRow)
    .filter((r): r is OnlineOrderRow => r != null);

  return buildOnlineOrderGroupsFromRows(env, rows);
}

/**
 * Нэвтэрсэн харилцагчийн `customer_id`-ийг (phone эсвэл google_id-аар) шийдэж,
 * online_orders-аас бүх мөрийг татна. Дараа нь нэг захиалга болгон бүлэглэнэ.
 */
export async function fetchOnlineOrdersForCustomer(params: {
  isLoggedIn: boolean;
  phone: number | null;
  googleId: string | null;
}): Promise<OnlineOrderGroup[]> {
  if (!params.isLoggedIn) return [];

  const env = getSupabaseEnv();

  const customerId = await resolveCustomerIdForOnlineOrder({
    isLoggedIn: true,
    phone: params.phone,
    googleId: params.googleId,
  });

  const headers = restGetHeaders(env.anonKey);
  const q = new URLSearchParams({
    select: ONLINE_ORDER_SELECT,
    customer_id: `eq.${customerId}`,
    order: 'created_at.desc',
  });
  const res = await fetch(`${env.restBase}/rest/v1/online_orders?${q.toString()}`, {
    headers,
  });
  const json = await parseJsonSafely(res);
  if (!res.ok) {
    throw new Error(formatPostgrestError(json, res) || 'Захиалгуудыг татаж чадсангүй.');
  }
  if (!Array.isArray(json)) return [];

  const rows = (json as Record<string, unknown>[])
    .map(mapRow)
    .filter((r): r is OnlineOrderRow => r != null);

  return buildOnlineOrderGroupsFromRows(env, rows);
}

/** Тухайн захиалгын бүх online_orders мөрийг устгана. */
export async function deleteOnlineOrdersByIds(rowIds: string[]): Promise<void> {
  const ids = rowIds.map((s) => s.trim()).filter((s) => s.length > 0);
  if (ids.length === 0) return;
  const env = getSupabaseEnv();
  const q = new URLSearchParams({ id: `in.(${ids.join(',')})` });
  const res = await fetch(`${env.restBase}/rest/v1/online_orders?${q.toString()}`, {
    method: 'DELETE',
    headers: {
      apikey: env.anonKey,
      Authorization: `Bearer ${env.anonKey}`,
      Accept: 'application/json',
      Prefer: 'return=minimal',
    },
  });
  if (!res.ok) {
    const json = await parseJsonSafely(res);
    throw new Error(formatPostgrestError(json, res) || 'Захиалгыг устгаж чадсангүй.');
  }
}
