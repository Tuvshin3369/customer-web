import type { Product } from '../types';

function flagIsOn(v: unknown): boolean {
  return v === true || v === 1 || v === '1';
}

/** Хөөс / урт бараа — үлдэгдлийн шалгалтаас чөлөөлнө */
function exemptFromStockCheck(p: {
  is_foam_range?: boolean;
  is_calculate_length?: boolean;
}): boolean {
  return p.is_foam_range === true || p.is_calculate_length === true;
}

export interface CatalogVisibilityOptions {
  /** customer_status.can_get_raw_materials=1 — зочин/бусад харилцагчид false */
  canGetRawMaterials?: boolean;
}

/**
 * Дэлгэцийн каталогт харуулах эсэх.
 * Нуух: is_inactive=1 | is_pigment=1 | is_service=1 | is_raw_material=1 (эрхгүй) | үлдэгдэл=0
 */
export function isCatalogProductVisible(
  p: Pick<
    Product,
    | 'is_inactive'
    | 'is_pigment'
    | 'is_service'
    | 'is_raw_material'
    | 'is_foam_range'
    | 'is_calculate_length'
    | 'stock'
  >,
  opts?: CatalogVisibilityOptions,
): boolean {
  if (flagIsOn(p.is_inactive)) return false;
  if (flagIsOn(p.is_pigment)) return false;
  if (p.is_service === true || flagIsOn(p.is_service)) return false;
  const isRaw = flagIsOn(p.is_raw_material);
  if (isRaw && !opts?.canGetRawMaterials) return false;
  /** Түүхий эд — эрхтэй харилцагчид үлдэгдэл 0 ч каталогт */
  if (isRaw && opts?.canGetRawMaterials) return true;
  if (!exemptFromStockCheck(p) && (p.stock ?? 0) <= 0) return false;
  return true;
}

/** Холбогдох бараа (child) — ижил дүрэм, хөөс/уртгүй */
export function isCatalogChildRowVisible(
  row: Record<string, unknown>,
  stock: number,
  opts?: CatalogVisibilityOptions,
): boolean {
  if (flagIsOn(row.is_inactive)) return false;
  if (flagIsOn(row.is_pigment)) return false;
  if (row.is_service === true || flagIsOn(row.is_service)) return false;
  const foam = row.is_foam_range === true;
  const length = row.is_calculate_length === true;
  if (!foam && !length && stock <= 0) return false;
  return true;
}

/** Нэмэлт бараа (child) — түүхий эдийн шүүлт */
export function filterCatalogChildren<T extends { is_raw_material?: boolean | number }>(
  children: T[] | undefined,
  opts?: CatalogVisibilityOptions,
): T[] | undefined {
  if (!children?.length) return children;
  const out = children.filter(
    (c) => !flagIsOn(c.is_raw_material) || !!opts?.canGetRawMaterials,
  );
  return out.length > 0 ? out : undefined;
}
