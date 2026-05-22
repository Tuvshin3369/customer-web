/**
 * Харилцагчийн customer_status → брэнд бүрээр V1 (бөөнөөр) эсвэл V2 (loyalty interval) давуу эрх.
 */

import type { Product } from '../types';

async function parseJsonSafely(res: Response): Promise<unknown> {
  const raw = await res.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export type LoyaltyPrivilegeRow =
  | { kind: 'none' }
  | { kind: 'v1'; customerWholesalePct: number }
  | { kind: 'v2'; loyaltyDiscountPercent: number };

export interface CustomerLoyaltyContext {
  /** Брэнд бүрээр давуу эрх — зөвхөн нэмэлт SKU дээр V1/V2 */
  privilegesByBrand: Record<string, LoyaltyPrivilegeRow>;
  /** brand_id → customer_status.can_get_raw_materials=1 */
  rawMaterialsByBrand: Record<string, boolean>;
  /** brand_id хоосон мөрөнд can_get_raw_materials=1 — бүх брэнд */
  rawMaterialsAnyBrand: boolean;
}

export const EMPTY_CUSTOMER_LOYALTY_CONTEXT: CustomerLoyaltyContext = Object.freeze({
  privilegesByBrand: {},
  rawMaterialsByBrand: {},
  rawMaterialsAnyBrand: false,
});

export function canGetRawMaterialsForBrand(
  ctx: CustomerLoyaltyContext | null | undefined,
  brandId: string | null | undefined,
): boolean {
  if (!ctx) return false;
  if (ctx.rawMaterialsAnyBrand) return true;
  if (!brandId?.trim()) return false;
  return ctx.rawMaterialsByBrand[brandId.trim()] === true;
}

function pickDiscountPercentForVolume(
  volume: number,
  rows: readonly { min_amount: number; max_amount: number; discount_percent: number }[],
): number {
  if (rows.length === 0) return 0;
  const v = Number.isFinite(volume) ? volume : 0;
  const sorted = [...rows].sort((a, b) => a.min_amount - b.min_amount || a.max_amount - b.max_amount);
  for (const r of sorted) {
    const min = r.min_amount;
    const max = r.max_amount;
    const inLo = v >= min;
    const inHi = Number.isFinite(max) ? v <= max : true;
    if (inLo && inHi) return Math.min(100, Math.max(0, Number(r.discount_percent) || 0));
  }
  return 0;
}

interface StatusApiRow {
  brand_id?: unknown;
  wholesale_price?: unknown;
  can_get_discount?: unknown;
  can_get_raw_materials?: unknown;
}

function flagIsOn(v: unknown): boolean {
  return v === true || v === 1 || v === '1';
}

function buildRawMaterialsAccess(rows: unknown): {
  rawMaterialsByBrand: Record<string, boolean>;
  rawMaterialsAnyBrand: boolean;
} {
  const rawMaterialsByBrand: Record<string, boolean> = {};
  let rawMaterialsAnyBrand = false;
  if (!Array.isArray(rows)) {
    return { rawMaterialsByBrand, rawMaterialsAnyBrand };
  }
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as StatusApiRow;
    if (!flagIsOn(row.can_get_raw_materials)) continue;
    const bid = row.brand_id != null ? String(row.brand_id).trim() : '';
    if (!bid) {
      rawMaterialsAnyBrand = true;
      continue;
    }
    rawMaterialsByBrand[bid] = true;
  }
  return { rawMaterialsByBrand, rawMaterialsAnyBrand };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function sumSaleRowAmount(row: Record<string, unknown>): number {
  const keys = [
    'sold_price',
    'line_total',
    'total_amount',
    'grand_total',
    'payment_amount',
    'pay_amount',
    'amount',
    'total_price',
  ];
  for (const k of keys) {
    const n = num(row[k]);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return 0;
}

/** `sales`-ийн мөрүүдээс харилцагчийн брэнд тус бүрийн нийлбэр худалдан авалт (байхгүй бол {}) */
async function fetchBrandSpendTotals(params: {
  restBase: string;
  anonKey: string;
  customerId: string;
}): Promise<Record<string, number>> {
  const { restBase, anonKey, customerId } = params;
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    Accept: 'application/json',
  };
  const totals: Record<string, number> = {};
  /** Багана зөрөх тохиолдол REST алдааг алгасна */
  const trySelect = async (select: string): Promise<void> => {
    const query = new URLSearchParams({
      select,
      customer_id: `eq.${customerId}`,
    });
    const res = await fetch(`${restBase}/rest/v1/sales?${query}`, { headers });
    const json = await parseJsonSafely(res);
    if (!res.ok || !Array.isArray(json)) return;
    for (const raw of json as Record<string, unknown>[]) {
      const bid = raw.brand_id != null && String(raw.brand_id).trim() !== ''
        ? String(raw.brand_id).trim()
        : '';
      if (!bid) continue;
      totals[bid] = (totals[bid] ?? 0) + sumSaleRowAmount(raw);
    }
  };

  try {
    await trySelect('brand_id,sold_price,product_number,total_amount,amount,line_total,payment_amount,grand_total,total_price');
  } catch {
    try {
      await trySelect('*');
    } catch {
      /* */
    }
  }
  return totals;
}

export async function fetchCustomerLoyaltyContext(restBaseRaw: string, anonKeyRaw: string, customerIdRaw: string): Promise<CustomerLoyaltyContext> {
  const restBase = restBaseRaw.replace(/\/$/, '').trim();
  const anonKey = anonKeyRaw.trim();
  const customerId = customerIdRaw.trim();
  if (!restBase || !anonKey || !customerId) {
    return { privilegesByBrand: {}, rawMaterialsByBrand: {}, rawMaterialsAnyBrand: false };
  }

  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    Accept: 'application/json',
  };

  const stQ = new URLSearchParams({
    select: 'brand_id,wholesale_price,can_get_discount,can_get_raw_materials',
    customer_id: `eq.${customerId}`,
  });

  let statusRows: unknown;
  try {
    const res = await fetch(`${restBase}/rest/v1/customer_status?${stQ}`, { headers });
    statusRows = await parseJsonSafely(res);
    if (!res.ok || !Array.isArray(statusRows)) statusRows = [];
  } catch {
    statusRows = [];
  }

  const byBrandRaw = new Map<string, StatusApiRow>();
  for (const raw of statusRows as StatusApiRow[]) {
    if (!raw || typeof raw !== 'object') continue;
    const bid = raw.brand_id != null ? String(raw.brand_id).trim() : '';
    if (!bid) continue;
    byBrandRaw.set(bid, raw);
  }

  const { rawMaterialsByBrand, rawMaterialsAnyBrand } = buildRawMaterialsAccess(statusRows);

  if (byBrandRaw.size === 0) {
    return { privilegesByBrand: {}, rawMaterialsByBrand, rawMaterialsAnyBrand };
  }

  const privilegesByBrand: Record<string, LoyaltyPrivilegeRow> = {};
  const brandsV2NeedingIntervals: string[] = [];

  for (const [bid, row] of byBrandRaw.entries()) {
    const wRaw = row.wholesale_price;
    const wHas = wRaw != null && wRaw !== '' && !Number.isNaN(num(wRaw));

    /** V1: wholesale_price утга заавал бөөнөийн хямдрал (V1 / V2 зэрэг байх боломжгүй) */
    if (wHas) {
      const wp = Math.min(100, Math.max(0, num(wRaw)));
      if (!Number.isNaN(wp)) {
        privilegesByBrand[bid] = { kind: 'v1', customerWholesalePct: wp };
        continue;
      }
    }

    if (row.can_get_discount === true) {
      brandsV2NeedingIntervals.push(bid);
    } else {
      privilegesByBrand[bid] = { kind: 'none' };
    }
  }

  if (brandsV2NeedingIntervals.length === 0) {
    return { privilegesByBrand, rawMaterialsByBrand, rawMaterialsAnyBrand };
  }

  const spendByBrand =
    brandsV2NeedingIntervals.length > 0
      ? await fetchBrandSpendTotals({ restBase, anonKey, customerId })
      : {};

  const discountBuckets = new Map<string, { min_amount: number; max_amount: number; discount_percent: number }[]>();
  if (brandsV2NeedingIntervals.length > 0) {
    const inList = `(${brandsV2NeedingIntervals.join(',')})`;
    const dq = new URLSearchParams({
      select: 'brand_id,min_amount,max_amount,discount_percent',
      brand_id: `in.${inList}`,
      order: 'min_amount.asc',
    });
    try {
      const dres = await fetch(`${restBase}/rest/v1/discounts?${dq}`, { headers });
      const djson = await parseJsonSafely(dres);
      if (dres.ok && Array.isArray(djson)) {
        for (const raw of djson as Record<string, unknown>[]) {
          const b = raw.brand_id != null ? String(raw.brand_id).trim() : '';
          if (!b) continue;
          const min = num(raw.min_amount);
          const maxN = num(raw.max_amount);
          const dp = num(raw.discount_percent);
          if (Number.isNaN(min)) continue;
          const max = Number.isNaN(maxN) ? Number.POSITIVE_INFINITY : maxN;
          const arr = discountBuckets.get(b) ?? [];
          arr.push({
            min_amount: min,
            max_amount: max,
            discount_percent: Number.isNaN(dp) ? 0 : dp,
          });
          discountBuckets.set(b, arr);
        }
      }
    } catch {
      /* */
    }
  }

  for (const bid of brandsV2NeedingIntervals) {
    const vol = spendByBrand[bid] ?? 0;
    const buckets = discountBuckets.get(bid) ?? [];
    const tierPct = pickDiscountPercentForVolume(vol, buckets);
    privilegesByBrand[bid] = { kind: 'v2', loyaltyDiscountPercent: tierPct };
  }

  return { privilegesByBrand, rawMaterialsByBrand, rawMaterialsAnyBrand };
}

/**
 * is_foam_range картууд — нэмэлт давуу хувийн дэлгэцийн хувь (нэгж бодохоос үл хамааруулна).
 */
export function loyaltyPreviewPercentForProductBrand(
  brandId: string | null | undefined,
  ctx: CustomerLoyaltyContext | null | undefined,
): number | undefined {
  if (!ctx) return undefined;
  const bid = brandId?.trim();
  if (!bid) return undefined;
  const row = ctx.privilegesByBrand[bid];
  if (row?.kind === 'v1' && row.customerWholesalePct != null && Number.isFinite(row.customerWholesalePct)) {
    const p = Math.min(100, Math.max(0, row.customerWholesalePct));
    return p > 0 ? p : undefined;
  }
  if (row?.kind === 'v2' && row.loyaltyDiscountPercent != null && Number.isFinite(row.loyaltyDiscountPercent)) {
    const p = Math.min(100, Math.max(0, row.loyaltyDiscountPercent));
    return p > 0 ? p : undefined;
  }
  return undefined;
}

/** UI / cart — идэвхтэй хөнгөлөлтийн эсвэл зураасан үнийн хувийг нэгтгэх */
export function productCardDiscountPercent(
  p: Pick<Product, 'loyaltyPriceMode' | 'retailPrice' | 'price' | 'basePrice' | 'oldPrice' | 'discount'>,
): number {
  if (p.loyaltyPriceMode === 'v1' || p.loyaltyPriceMode === 'v2') {
    const list = p.retailPrice ?? p.oldPrice ?? p.price;
    const sale = p.basePrice ?? p.price;
    if (list > 0 && sale < list) {
      return Math.round(((list - sale) / list) * 100 * 100) / 100;
    }
    return 0;
  }
  return p.discount ?? 0;
}
