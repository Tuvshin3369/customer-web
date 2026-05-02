/**
 * Admin-web SaleForm.calculatePrice (is_coded_paint)-тай ижил төсөөтэй логик.
 * @see Admin-web/src/components/SaleForm.tsx
 */
import type { Product } from '../types';

const PLACEHOLDER = 'https://via.placeholder.com/400x500?text=No+Image';

const RESOLVED_PRODUCT_SELECT =
  'id,product_name,product_images,product_manual,retail_price,discount,category_id,brand_id,store_id,display_order,is_coded_paint,is_foam_range,is_calculate_length,ratio,waste,group_id,service_price,is_pigment,related_product_1_id,related_product_2_id,related_product_3_id,related_product_4_id';

function numField(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function allUrlsFromProductImages(value: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (u: string) => {
    const t = u.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  function walk(v: unknown): void {
    if (v == null) return;
    if (typeof v === 'string') {
      const s = v.trim();
      if (!s) return;
      if (s.startsWith('[') || s.startsWith('{')) {
        try {
          walk(JSON.parse(s) as unknown);
          return;
        } catch {
          /* */
        }
      }
      push(s);
      return;
    }
    if (!Array.isArray(v)) return;
    for (const item of v) {
      if (typeof item === 'string') push(item);
      else if (item && typeof item === 'object' && 'url' in item && typeof (item as { url: unknown }).url === 'string') {
        push((item as { url: string }).url);
      }
    }
  }

  walk(value);
  return out;
}

function mapRowToProduct(
  row: Record<string, unknown>,
  storeId: string,
  onlinePct: number,
  stock: number,
): Product | null {
  const pid = row.id != null ? String(row.id) : '';
  if (!pid) return null;
  const nm =
    typeof row.product_name === 'string'
      ? row.product_name.trim()
      : String(row.product_name ?? '');
  if (!nm) return null;
  const imageUrls = allUrlsFromProductImages(row.product_images);
  const img = imageUrls[0] || PLACEHOLDER;
  const retail = numField(row.retail_price, 0);
  const productDisc = numField(row.discount, 0);
  const totalDiscRaw = productDisc + onlinePct;
  const totalDisc = Math.min(100, Math.max(0, totalDiscRaw));
  const hasDisc = totalDisc > 0 && retail > 0;
  const saleUnit = hasDisc ? retail * (1 - totalDisc / 100) : retail;
  const saleRounded = Math.round(saleUnit);
  const manualRaw =
    typeof row.product_manual === 'string' ? row.product_manual.trim() : '';
  const manualUrl = manualRaw.length > 0 ? manualRaw : undefined;
  const cid = row.category_id != null && row.category_id !== '' ? String(row.category_id) : '';
  const gid = row.group_id != null && row.group_id !== '' ? String(row.group_id) : undefined;
  const bid = row.brand_id != null && row.brand_id !== '' ? String(row.brand_id) : undefined;

  return {
    id: pid,
    store_id: storeId,
    categoryId: cid || undefined,
    brandId: bid,
    displayOrder: numField(row.display_order, 0),
    is_coded_paint: row.is_coded_paint === true,
    is_foam_range: row.is_foam_range === true,
    is_calculate_length: row.is_calculate_length === true,
    ratio: (() => {
      const r = numField(row.ratio, 0);
      return r > 0 ? r : undefined;
    })(),
    waste: (() => {
      const w = numField(row.waste, 0);
      return w > 0 ? w : undefined;
    })(),
    groupId: gid,
    servicePrice: numField(row.service_price, 0),
    is_pigment: row.is_pigment === true,
    name: nm,
    category: 'Бусад',
    price: retail,
    basePrice: hasDisc ? saleRounded : retail,
    oldPrice: hasDisc ? retail : undefined,
    discount: hasDisc ? Math.round(totalDisc * 100) / 100 : undefined,
    stock,
    imageUrl: img,
    images: imageUrls.length > 0 ? imageUrls : undefined,
    manualUrl,
  };
}

async function restGetJson(restBase: string, anonKey: string, pathAndQuery: string): Promise<unknown> {
  const res = await fetch(`${restBase}${pathAndQuery}`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: 'application/json',
    },
  });
  const raw = await res.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function fetchGoodsBalanceSum(restBase: string, anonKey: string, productId: string): Promise<number> {
  const q = new URLSearchParams({
    select: 'goods_balance',
    product_id: `eq.${productId}`,
  });
  const json = await restGetJson(restBase, anonKey, `/rest/v1/goods_balance?${q.toString()}`);
  if (!Array.isArray(json)) return 0;
  return json.reduce(
    (s, row) => s + numField((row as Record<string, unknown>).goods_balance, 0),
    0,
  );
}

function codedUnitPrice(
  pigment: boolean,
  basePrice: number,
  servicePrice: number,
  codedPrice: number,
): number {
  const c = Number(codedPrice) || 0;
  if (pigment) {
    return Math.max(0, Math.round((servicePrice || 0) + c));
  }
  return Math.max(0, Math.round(basePrice + (servicePrice || 0) + c));
}

export type CodedPaintResolveResult =
  | { ok: true; unitPrice: number; resolvedProduct: Product | null }
  | { ok: false; message: string };

export async function resolveCodedPaintPricing(
  restBase: string,
  anonKey: string,
  ctx: {
    storeId: string;
    brandId?: string;
    onlineDiscountPercent: number;
    product: Product;
    colorCode: string;
  },
): Promise<CodedPaintResolveResult> {
  const code = ctx.colorCode.trim();
  if (!code) return { ok: false, message: 'Өнгийн код оруулна уу.' };

  const groupId = ctx.product.groupId?.trim();
  if (!groupId) {
    return { ok: false, message: 'Энэ бараа группт холбогдоогүй байна.' };
  }

  const gq = new URLSearchParams({
    select: 'group_number,product_number',
    id: `eq.${groupId}`,
  });
  const groupRows = (await restGetJson(restBase, anonKey, `/rest/v1/groups?${gq}`)) as unknown;
  const currentGroup = Array.isArray(groupRows) && groupRows.length > 0
    ? (groupRows[0] as Record<string, unknown>)
    : null;

  if (!currentGroup) {
    return { ok: false, message: 'Группын мэдээлэл олдсонгүй.' };
  }

  const gn = currentGroup.group_number;
  const pn = currentGroup.product_number;
  if (gn == null || pn == null) {
    return { ok: false, message: 'Группын дугаар буруу байна.' };
  }

  const pigment = ctx.product.is_pigment === true;
  const base = ctx.product.basePrice ?? ctx.product.price;
  const service = ctx.product.servicePrice ?? 0;

  const exactQ = new URLSearchParams({
    select: 'id,price',
    color_code: `eq.${code}`,
    group_number: `eq.${gn}`,
    item_number: `eq.${pn}`,
  });
  const exactRows = (await restGetJson(
    restBase,
    anonKey,
    `/rest/v1/coded_paints?${exactQ}`,
  )) as unknown;

  if (Array.isArray(exactRows) && exactRows.length > 0) {
    const row = exactRows[0] as Record<string, unknown>;
    const codedPrice = numField(row.price, 0);
    return {
      ok: true,
      unitPrice: codedUnitPrice(pigment, base, service, codedPrice),
      resolvedProduct: null,
    };
  }

  const listQ = new URLSearchParams({
    select: 'id,item_number,price',
    color_code: `eq.${code}`,
    group_number: `eq.${gn}`,
  });
  const listRows = (await restGetJson(restBase, anonKey, `/rest/v1/coded_paints?${listQ}`)) as unknown;
  if (!Array.isArray(listRows) || listRows.length === 0) {
    return { ok: false, message: 'Энэ кодтой coded_paints мөр олдсонгүй.' };
  }

  const codedPaint =
    listRows.find((r) => (r as Record<string, unknown>).item_number != pn) ??
    (listRows[0] as Record<string, unknown>);

  if (!codedPaint || typeof codedPaint !== 'object') {
    return { ok: false, message: 'Өнгийн код тохирохгүй байна.' };
  }

  const cp = codedPaint as Record<string, unknown>;
  const itemNum = cp.item_number;
  const codedPriceFb = numField(cp.price, 0);

  const mgQ = new URLSearchParams({
    select: 'id',
    group_number: `eq.${gn}`,
    product_number: `eq.${itemNum}`,
  });
  const mgRows = (await restGetJson(restBase, anonKey, `/rest/v1/groups?${mgQ}`)) as unknown;
  const matchingGroup =
    Array.isArray(mgRows) && mgRows.length > 0 ? (mgRows[0] as Record<string, unknown>) : null;

  if (!matchingGroup?.id) {
    return { ok: false, message: 'Тохирох барааны групп олдсонгүй.' };
  }

  const mgId = String(matchingGroup.id);

  const pq = new URLSearchParams({
    select: RESOLVED_PRODUCT_SELECT,
    store_id: `eq.${ctx.storeId}`,
    group_id: `eq.${mgId}`,
    is_inactive: 'eq.false',
  });
  if (ctx.brandId) pq.set('brand_id', `eq.${ctx.brandId}`);

  const prodRows = (await restGetJson(restBase, anonKey, `/rest/v1/products?${pq}`)) as unknown;
  if (!Array.isArray(prodRows) || prodRows.length === 0) {
    return { ok: false, message: 'Тохирох бараа (products) олдсонгүй.' };
  }

  const pr = prodRows[0] as Record<string, unknown>;
  const newPid = pr.id != null ? String(pr.id) : '';
  if (!newPid) {
    return { ok: false, message: 'Барааны ID олдсонгүй.' };
  }

  const stock = await fetchGoodsBalanceSum(restBase, anonKey, newPid);
  const mapped = mapRowToProduct(pr, ctx.storeId, ctx.onlineDiscountPercent, stock);
  if (!mapped) {
    return { ok: false, message: 'Барааны мэдээлэл уншихад алдаа.' };
  }

  const mpBase = mapped.basePrice ?? mapped.price;
  const mpService = mapped.servicePrice ?? 0;
  const mpPigment = mapped.is_pigment === true;

  return {
    ok: true,
    unitPrice: codedUnitPrice(mpPigment, mpBase, mpService, codedPriceFb),
    resolvedProduct: mapped.id !== ctx.product.id ? mapped : null,
  };
}

// ─── Code талбар: санал хайлт (products.group_id → group_number → coded_paints) ─

export interface CodedPaintSuggestionRow {
  id: string;
  color_code: string;
  color_name: string | null;
  item_number: string;
}

/** `products.group_id` → `groups.group_number`, `groups.product_number` */
export async function fetchGroupMetaByProductGroupId(
  restBase: string,
  anonKey: string,
  groupId: string,
): Promise<{ group_number: string; product_number: string } | null> {
  const gid = groupId.trim();
  if (!gid) return null;
  const q = new URLSearchParams({ select: 'group_number,product_number', id: `eq.${gid}` });
  const json = await restGetJson(restBase, anonKey, `/rest/v1/groups?${q}`);
  if (!Array.isArray(json) || json.length === 0) return null;
  const row = json[0] as Record<string, unknown>;
  const gn = row.group_number;
  const pn = row.product_number;
  if (gn == null || pn == null) return null;
  return { group_number: String(gn), product_number: String(pn) };
}

/** @deprecated — fetchGroupMetaByProductGroupId ашиглана */
export async function fetchGroupNumberByGroupId(
  restBase: string,
  anonKey: string,
  groupId: string,
): Promise<string | null> {
  const m = await fetchGroupMetaByProductGroupId(restBase, anonKey, groupId);
  return m?.group_number ?? null;
}

function escapeIlikePattern(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Оруулсан тэмдэгтийг агуулсан color_code мөрүүд, зөвхөн тухайн барааны group_number дотор.
 */
export async function searchCodedPaintsContaining(
  restBase: string,
  anonKey: string,
  groupNumber: string,
  needle: string,
): Promise<CodedPaintSuggestionRow[]> {
  const t = needle.trim();
  if (!t || !groupNumber) return [];
  const safe = escapeIlikePattern(t);
  const pattern = `%${safe}%`;
  const qs = [
    'select=id,color_code,color_name,item_number',
    `group_number=eq.${encodeURIComponent(groupNumber)}`,
    `color_code=ilike.${encodeURIComponent(pattern)}`,
    'order=color_code.asc',
    'limit=100',
  ].join('&');
  const json = await restGetJson(restBase, anonKey, `/rest/v1/coded_paints?${qs}`);
  if (!Array.isArray(json)) return [];
  const out: CodedPaintSuggestionRow[] = [];
  for (const raw of json) {
    const row = raw as Record<string, unknown>;
    const id = row.id != null ? String(row.id) : '';
    const cc =
      typeof row.color_code === 'string'
        ? row.color_code
        : row.color_code != null
          ? String(row.color_code)
          : '';
    if (!id || !cc) continue;
    const cn =
      typeof row.color_name === 'string'
        ? row.color_name
        : row.color_name != null
          ? String(row.color_name)
          : null;
    const inum = row.item_number;
    if (inum == null) continue;
    const itemStr = String(inum);
    out.push({
      id,
      color_code: cc,
      color_name: cn && cn.trim() ? cn : null,
      item_number: itemStr,
    });
  }
  return out;
}

/** Яг таарах кодын item_number (нэг мөр). */
export async function fetchCodedPaintItemNumberExact(
  restBase: string,
  anonKey: string,
  groupNumber: string,
  colorCodeExact: string,
): Promise<string | null> {
  const code = colorCodeExact.trim();
  if (!code || !groupNumber) return null;
  const q = [
    'select=item_number',
    `group_number=eq.${encodeURIComponent(groupNumber)}`,
    `color_code=eq.${encodeURIComponent(code)}`,
    'limit=1',
  ].join('&');
  const json = await restGetJson(restBase, anonKey, `/rest/v1/coded_paints?${q}`);
  if (!Array.isArray(json) || json.length === 0) return null;
  const inum = (json[0] as Record<string, unknown>).item_number;
  if (inum == null) return null;
  return String(inum);
}

/**
 * groups.product_number !== coded_paints.item_number бол
 * groups(group_number, product_number=item_number)-аас бараа олж буцаана.
 * Таарвал null (эх бараа хэвээр).
 */
export async function resolvePaintCatalogProductForCode(
  restBase: string,
  anonKey: string,
  ctx: {
    storeId: string;
    brandId?: string;
    onlineDiscountPercent: number;
    anchorProduct: Product;
    codedItemNumber: string | number;
  },
): Promise<Product | null> {
  const gid = ctx.anchorProduct.groupId?.trim();
  if (!gid) return null;
  const meta = await fetchGroupMetaByProductGroupId(restBase, anonKey, gid);
  if (!meta) return null;
  const itemStr = String(ctx.codedItemNumber);
  if (meta.product_number === itemStr) return null;

  const mgQ = new URLSearchParams({
    select: 'id',
    group_number: `eq.${meta.group_number}`,
    product_number: `eq.${itemStr}`,
  });
  const mgRows = (await restGetJson(restBase, anonKey, `/rest/v1/groups?${mgQ}`)) as unknown;
  const matchingGroup =
    Array.isArray(mgRows) && mgRows.length > 0 ? (mgRows[0] as Record<string, unknown>) : null;
  if (!matchingGroup?.id) return null;

  const mgId = String(matchingGroup.id);
  const pq = new URLSearchParams({
    select: RESOLVED_PRODUCT_SELECT,
    store_id: `eq.${ctx.storeId}`,
    group_id: `eq.${mgId}`,
    is_inactive: 'eq.false',
  });
  if (ctx.brandId) pq.set('brand_id', `eq.${ctx.brandId}`);

  const prodRows = (await restGetJson(restBase, anonKey, `/rest/v1/products?${pq}`)) as unknown;
  if (!Array.isArray(prodRows) || prodRows.length === 0) return null;

  const pr = prodRows[0] as Record<string, unknown>;
  const newPid = pr.id != null ? String(pr.id) : '';
  if (!newPid) return null;

  const stock = await fetchGoodsBalanceSum(restBase, anonKey, newPid);
  return mapRowToProduct(pr, ctx.storeId, ctx.onlineDiscountPercent, stock);
}
