import type { ChildProduct, Product } from '../types';
import type { CustomerLoyaltyContext } from '../lib/customerLoyaltyContext';

function roundMoney(n: number): number {
  return Math.max(0, Math.round(n));
}

function intReportPercent(n: unknown): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.min(100, Math.max(0, Math.round(x)));
}

/** products.discount + brands.online_discount_percent (loyalty-с өмнөх нэгж) */
export function plannedStandardSaleBaseFromRetail(
  retail: number,
  catalogDiscountPct: number,
  onlinePct: number,
): number {
  const r = retail > 0 ? retail : 0;
  const d = Math.min(100, Math.max(0, catalogDiscountPct + onlinePct));
  if (r <= 0) return 0;
  return d > 0 ? roundMoney(r * (1 - d / 100)) : r;
}

function freezeCatalogStandardChildProduct(c: ChildProduct): ChildProduct {
  const retail = c.retailPrice != null && c.retailPrice > 0 ? c.retailPrice : c.price;
  const pd = c.catalogDiscountPct ?? 0;
  const od = c.onlineDiscountPctAtFetch ?? 0;
  const planned =
    c.plannedStandardBaseUnit ?? plannedStandardSaleBaseFromRetail(retail, pd, od);
  return {
    ...c,
    retailPrice: retail > 0 ? retail : undefined,
    plannedStandardBaseUnit: planned,
    price: planned,
    loyaltyPriceMode: undefined,
    loyaltyReportWholesalePct: undefined,
    loyaltyReportRetailDiscountPct: undefined,
  };
}

/** Нэвтрэлт / сагсын дахин тооцоололд loyalty давхардуулахгүйн тулд эх стандарт урсгалыг сэргээнэ */
export function freezeCatalogStandardProductTree(p: Product): Product {
  const retail = p.retailPrice ?? p.price;
  const pd = p.catalogDiscountPct ?? 0;
  const od = p.onlineDiscountPctAtFetch ?? 0;
  const planned =
    p.plannedStandardBaseUnit ?? plannedStandardSaleBaseFromRetail(retail > 0 ? retail : 0, pd, od);
  const totalD = Math.min(100, Math.max(0, pd + od));
  const hasDisc = totalD > 0 && retail > 0;

  const ch = p.children?.map((c) => freezeCatalogStandardChildProduct(c));

  return {
    ...p,
    retailPrice: retail > 0 ? retail : undefined,
    plannedStandardBaseUnit: planned,
    price: retail,
    basePrice: hasDisc ? planned : retail,
    oldPrice: hasDisc ? retail : undefined,
    discount: hasDisc ? Math.round(totalD * 100) / 100 : undefined,
    loyaltyPriceMode: undefined,
    loyaltyReportWholesalePct: undefined,
    loyaltyReportRetailDiscountPct: undefined,
    ...(ch ? { children: ch } : {}),
  };
}

export function repricedProductForLoyalty(
  p: Product,
  ctx: CustomerLoyaltyContext | null,
): Product {
  return applyLoyaltyToProduct(freezeCatalogStandardProductTree(p), ctx);
}

export interface FoamCatalogLoyaltyResult {
  saleUnit: number;
  loyaltyPriceMode?: 'v1' | 'v2';
  /** Тайлан: V1 → wholesale_discount_percent, V2 → product_discount_percent (int) */
  appliedLoyaltyPercent?: number;
}

/**
 * Хөөс: DB-д retail/wholesale байхгүй тул «Бодох»-оор гарсан стандарт нэгж үнэ дээр V1/V2 хувийг хэрэглэнэ.
 * V1: стандарт_n × (100 − customer_status.wholesale_price)%
 * V2: стандарт_n × (100 − loyalty tier discount_percent)%
 */
export function applyFoamCatalogUnitToLoyalty(
  standardFoamUnit: number,
  brandId: string | null | undefined,
  ctx: CustomerLoyaltyContext | null,
): FoamCatalogLoyaltyResult {
  const u = Number(standardFoamUnit);
  if (!Number.isFinite(u) || u <= 0) {
    return { saleUnit: Math.max(0, Math.round(u)) };
  }
  const base = Math.max(0, Math.round(u));
  if (!ctx) return { saleUnit: base };

  const bid = brandId?.trim();
  if (!bid) return { saleUnit: base };

  const row = ctx.privilegesByBrand[bid];
  if (!row || row.kind === 'none') return { saleUnit: base };

  if (row.kind === 'v1') {
    const pctRaw = row.customerWholesalePct;
    if (pctRaw == null || !Number.isFinite(pctRaw)) return { saleUnit: base };
    const pct = Math.min(100, Math.max(0, pctRaw));
    return {
      saleUnit: roundMoney(base * (1 - pct / 100)),
      loyaltyPriceMode: 'v1',
      appliedLoyaltyPercent: intReportPercent(pct),
    };
  }

  if (row.kind === 'v2') {
    const pct = Math.min(100, Math.max(0, row.loyaltyDiscountPercent ?? 0));
    return {
      saleUnit: roundMoney(base * (1 - pct / 100)),
      loyaltyPriceMode: 'v2',
      appliedLoyaltyPercent: intReportPercent(row.loyaltyDiscountPercent ?? pct),
    };
  }

  return { saleUnit: base };
}

/** Хөөсний UI — стандарт vs зарах нэгжийн ялгаанаас хувь */
export function foamCatalogDiscountPercent(standardUnit: number, saleUnit: number): number {
  const s = Number(standardUnit);
  const x = Number(saleUnit);
  if (!Number.isFinite(s) || s <= 0 || !Number.isFinite(x) || x >= s) return 0;
  return Math.round(((s - x) / s) * 100 * 100) / 100;
}

/**
 * Жижүүрийг бараандаа хуваарилна — нэг SKU дээр V1 давуу эрх давхардаагүй.
 */
export function applyLoyaltyToProduct(p: Product, ctx: CustomerLoyaltyContext | null): Product {
  if (!ctx || p.is_service === true || p.is_foam_range === true) return p;
  const bid = p.brandId?.trim();
  if (!bid) return p;

  const row = ctx.privilegesByBrand[bid];
  if (!row || row.kind === 'none') {
    const ch = p.children?.map((c) => applyLoyaltyToChildProduct(c, ctx));
    return ch ? { ...p, children: ch } : p;
  }

  const retail = p.retailPrice ?? p.price;
  const wholesale = p.wholesalePrice ?? 0;

  if (row.kind === 'v1') {
    if (!(row.customerWholesalePct != null && Number.isFinite(row.customerWholesalePct))) {
      const ch = p.children?.map((c) => applyLoyaltyToChildProduct(c, ctx));
      return ch ? { ...p, children: ch } : p;
    }
    const pct = Math.min(100, Math.max(0, row.customerWholesalePct));
    /** Бөөнөийн үнэ байхгүй бол жагсаалтын үнэ дээр V1 хувийг хэрэглэнэ (catalog discount орлохгүй) */
    const baseForV1 = wholesale > 0 ? wholesale : retail > 0 ? retail : 0;
    if (!(baseForV1 > 0)) {
      const ch = p.children?.map((c) => applyLoyaltyToChildProduct(c, ctx));
      return ch ? { ...p, children: ch } : p;
    }
    const saleUnit = roundMoney(baseForV1 * (1 - pct / 100));
    const ch = p.children?.map((c) => applyLoyaltyToChildProduct(c, ctx));
    return {
      ...p,
      price: retail,
      basePrice: saleUnit,
      oldPrice: retail,
      loyaltyPriceMode: 'v1',
      discount: undefined,
      loyaltyReportWholesalePct: intReportPercent(row.customerWholesalePct),
      loyaltyReportRetailDiscountPct: undefined,
      ...(ch ? { children: ch } : {}),
    };
  }

  if (row.kind === 'v2') {
    if (!(retail > 0)) {
      const ch = p.children?.map((c) => applyLoyaltyToChildProduct(c, ctx));
      return ch ? { ...p, children: ch } : p;
    }
    const pct = Math.min(100, Math.max(0, row.loyaltyDiscountPercent ?? 0));
    const saleUnit = roundMoney(retail * (1 - pct / 100));
    const ch = p.children?.map((c) => applyLoyaltyToChildProduct(c, ctx));
    return {
      ...p,
      price: retail,
      basePrice: saleUnit,
      oldPrice: retail,
      loyaltyPriceMode: 'v2',
      discount: undefined,
      loyaltyReportRetailDiscountPct: intReportPercent(row.loyaltyDiscountPercent ?? pct),
      loyaltyReportWholesalePct: undefined,
      ...(ch ? { children: ch } : {}),
    };
  }

  return p;
}

export function applyLoyaltyToChildProduct(c: ChildProduct, ctx: CustomerLoyaltyContext | null): ChildProduct {
  if (!ctx) return c;
  const bid = c.brandId?.trim();
  if (!bid) return c;

  const row = ctx.privilegesByBrand[bid];
  if (!row || row.kind === 'none') return c;

  const plannedStd = c.plannedStandardBaseUnit ?? c.price;
  const retail = c.retailPrice ?? c.price;
  const wholesale = c.wholesalePrice ?? 0;

  if (row.kind === 'v1') {
    if (!(row.customerWholesalePct != null && Number.isFinite(row.customerWholesalePct))) {
      return c;
    }
    const pct = Math.min(100, Math.max(0, row.customerWholesalePct));
    const listRetail =
      c.retailPrice != null && c.retailPrice > 0 ? c.retailPrice : retail > 0 ? retail : 0;
    const baseForV1 = wholesale > 0 ? wholesale : listRetail;
    if (!(baseForV1 > 0)) return c;
    return {
      ...c,
      price: roundMoney(baseForV1 * (1 - pct / 100)),
      plannedStandardBaseUnit: plannedStd,
      retailPrice: listRetail > 0 ? listRetail : retail > 0 ? retail : c.retailPrice,
      loyaltyPriceMode: 'v1',
      loyaltyReportWholesalePct: intReportPercent(row.customerWholesalePct),
      loyaltyReportRetailDiscountPct: undefined,
    };
  }

  if (row.kind === 'v2') {
    const pct = Math.min(100, Math.max(0, row.loyaltyDiscountPercent ?? 0));
    return {
      ...c,
      price: retail > 0 ? roundMoney(retail * (1 - pct / 100)) : c.price,
      plannedStandardBaseUnit: plannedStd,
      retailPrice: retail,
      loyaltyPriceMode: 'v2',
      loyaltyReportRetailDiscountPct: intReportPercent(row.loyaltyDiscountPercent ?? pct),
      loyaltyReportWholesalePct: undefined,
    };
  }

  return c;
}

/** Картад түргэн коэффициент (жижиг бичигтүүдээс давхардлыг суутгана) */
export function effectiveRetailListUnit(product: Pick<Product, 'retailPrice' | 'price' | 'oldPrice'>): number {
  const r = product.retailPrice ?? product.oldPrice ?? product.price;
  return r > 0 ? r : product.price;
}

export function loyaltyDisplayDiscountPercent(product: Pick<Product, 'loyaltyPriceMode' | 'retailPrice' | 'price' | 'basePrice' | 'oldPrice'>): number {
  if ((product.loyaltyPriceMode !== 'v1' && product.loyaltyPriceMode !== 'v2') || product.loyaltyPriceMode == null) {
    return 0;
  }
  const list = effectiveRetailListUnit(product);
  const sale = product.basePrice ?? product.price;
  if (!(list > 0) || !(sale >= 0) || sale >= list) return 0;
  return Math.round(((list - sale) / list) * 100 * 100) / 100;
}

export function loyaltyDisplayDiscountPercentChild(
  c: Pick<ChildProduct, 'loyaltyPriceMode' | 'retailPrice' | 'price'>,
): number {
  if ((c.loyaltyPriceMode !== 'v1' && c.loyaltyPriceMode !== 'v2') || c.loyaltyPriceMode == null) return 0;
  const list = c.retailPrice ?? c.price;
  const sale = c.price;
  if (!(list > 0)) return 0;
  if (!(sale >= 0) || sale >= list) return 0;
  return Math.round(((list - sale) / list) * 100 * 100) / 100;
}
