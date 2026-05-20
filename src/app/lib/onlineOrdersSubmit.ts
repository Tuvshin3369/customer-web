import type { CartItem, Product } from '../types';
import { calculateTotal } from '../utils/priceCalc';

export type CheckoutDeliveryKind = 'pickup' | 'taxi' | 'delivery';

/** `online_orders.delivery_type` — хадгалах утга (англи дотоод утгас ангилах) */
export type OnlineOrdersDeliveryType = 'Ирнэ' | 'Такси' | 'Хүргэх';

export function deliveryTypeForOnlineOrders(kind: CheckoutDeliveryKind): OnlineOrdersDeliveryType {
  switch (kind) {
    case 'pickup':
      return 'Ирнэ';
    case 'taxi':
      return 'Такси';
    case 'delivery':
      return 'Хүргэх';
  }
}
function messageFromRest(json: unknown, status: number): string {
  if (json && typeof json === 'object' && 'message' in json) {
    const m = (json as { message: unknown }).message;
    if (typeof m === 'string' && m.trim()) return m.trim();
  }
  return `HTTP ${status}`;
}

/**
 * `online_orders.system_price`-ийн мөрийн нийлбэр — ямар ч нөхцөлд (**V1**, **V2**, эсвэл
 * давуу эрхгүй) **зөвхөн жагсаалтын анхдагч** `products.retail_price`-аас тооцогдсон.
 * Catalog/онлайны хөнгөлөлт, давуу эрх, бөөний үнэн дээр суурилтгүй (`wholesale`-г үл ашиглана).
 *
 * Тоо баримжаа (ургын урт өргөн, өнгийн код ба үйлчилгээний нэмэлтийн нийлбэр гэх мэт) нь зарах
 * мөрний `calculateTotal` логиктой адилхан хэвээр; нэгжийн үнэлгээ нь **жагсаалтын retail** төдий.
 */
function lineSystemTotalRetailPriceOnly(item: CartItem): number {
  const qty = Math.max(1, item.quantity);
  const p = item.product;
  const cfg = item.config;

  const listRetailRaw = Number(p.retailPrice ?? p.price ?? 0);
  if (!Number.isFinite(listRetailRaw) || listRetailRaw <= 0) {
    return 0;
  }
  const listRetail = Math.max(0, Math.round(listRetailRaw));

  const type = p.productType ?? 1;
  /** Хөөс: талбай/foam_unit ашиглахгүй, зөвхөн SKU-ийн retail × тоо ширхэг */
  if (type === 3 && p.is_foam_range === true) {
    return Math.max(0, Math.round(listRetail * qty));
  }

  const synth: Product = {
    ...p,
    price: listRetail,
    basePrice: listRetail,
    wholesalePrice: undefined,
    loyaltyPriceMode: undefined,
    discount: undefined,
    oldPrice: undefined,
    catalogDiscountPct: undefined,
    onlineDiscountPctAtFetch: undefined,
    plannedStandardBaseUnit: undefined,
  };

  return calculateTotal(synth, cfg, qty);
}

function lineSellingAndSystemTotals(item: CartItem): { soldTotal: number; systemTotal: number } {
  const soldTotal = calculateTotal(item.product, item.config, item.quantity);
  const systemTotal = lineSystemTotalRetailPriceOnly(item);

  return { soldTotal, systemTotal };
}

/**
 * Жагсаалтын нэгжээс зарах нэгж хүртэлх **бодит** хямдралын хувь (0–100, бүхэл тоо).
 * retail → sold нь системийн retail-с нэгж (system_price/unit) ба sold_price/unit.
 */
function percentDiscountedFromRetailUnit(unitSold: number, unitRetailList: number): number {
  const r = Number(unitRetailList);
  const s = Number(unitSold);
  if (!Number.isFinite(r) || r <= 0 || !Number.isFinite(s) || s < 0) return 0;
  if (s >= r) return 0;
  return Math.min(100, Math.max(0, Math.round(100 - (s * 100) / r)));
}

function foamSizeCell(item: CartItem): string | null {
  const c = item.config;
  if (c.height == null || !Number.isFinite(c.height)) return null;
  const w = c.width != null && Number.isFinite(c.width) ? c.width : undefined;
  if (w !== undefined && w > 0) return `${c.height},${w}`;
  return String(c.height);
}

function lengthMeterCell(item: CartItem): number | null {
  const L = item.config.length;
  if (L == null || !Number.isFinite(L)) return null;
  return L;
}

export function cartItemsToOnlineOrderRows(opts: {
  items: CartItem[];
  fallbackStoreId: string | null;
  customerId: string;
  ecommercePhone: number;
  ecommerceName: string | null;
  ecommerceRegister: string | null;
  noteTrimmed: string | null;
  deliveryType: CheckoutDeliveryKind;
  locationLat: number | null;
  locationLng: number | null;
}): Record<string, unknown>[] {
  const phone = opts.ecommercePhone;
  if (!Number.isFinite(phone)) {
    throw new Error('Утасны дугаарыг тохируулна уу.');
  }
  const isDelivery = opts.deliveryType === 'delivery';
  const lat = isDelivery ? opts.locationLat : null;
  const lng = isDelivery ? opts.locationLng : null;
  const deliveryTypeDb = deliveryTypeForOnlineOrders(opts.deliveryType);
  const name = opts.ecommerceName?.trim();
  const reg = opts.ecommerceRegister?.trim();
  const note = opts.noteTrimmed?.trim();

  const rows: Record<string, unknown>[] = [];

  for (const item of opts.items) {
    const pid = String(item.product.id ?? '').trim();
    if (!pid) continue;

    const storeIdRaw = item.product.store_id ?? opts.fallbackStoreId;
    const storeId = storeIdRaw != null ? String(storeIdRaw).trim() : '';
    if (!storeId) continue;

    const q = Math.max(1, item.quantity);

    const { soldTotal, systemTotal } = lineSellingAndSystemTotals(item);
    const unitSold = Math.max(0, Math.round(soldTotal / q));
    const unitSystem = Math.max(0, Math.round(systemTotal / q));

    const rp = Math.round(Number(item.product.receivedPrice ?? 0));
    let received_price = Number.isFinite(rp) ? rp : 0;

    const isCoded = item.product.is_coded_paint === true;
    const codeTrim = item.config.colorCode?.trim() ?? '';
    const hasCode = codeTrim.length > 0;

    let coded_paint_id: string | null = null;
    if (item.config.codedPaintId?.trim()) {
      coded_paint_id = item.config.codedPaintId.trim();
    }

    let coded_price: number | null = null;
    let service_price: number | null = null;
    if (isCoded && hasCode) {
      coded_price = Math.round(Number(item.config.codedPaintListPrice ?? 0));
      service_price = Math.round(Number(item.product.servicePrice ?? 0));
    }

    /** Өнгийн код оруулсан: барааны received_price + coded (config-оос) */
    if (hasCode) {
      const add = Math.round(Number(item.config.codedPaintListPrice ?? 0));
      received_price = received_price + (Number.isFinite(add) ? add : 0);
    }

    const foam_size = foamSizeCell(item);
    const length_meter = lengthMeterCell(item);

    const pctClamp = (v: unknown): number => {
      const n = Number(v);
      if (!Number.isFinite(n)) return 0;
      return Math.min(100, Math.max(0, Math.round(n)));
    };
    const loyaltyMode = item.product.loyaltyPriceMode;

    let wholesale_discount_percent = 0;
    let product_discount_percent = 0;
    let additional_discount_percent = 0;
    if (loyaltyMode === 'v1') {
      /** V1: customer_status-хувь биш — жагсаалтын retail нэгж (system_price) vs зарах sold нэгж */
      wholesale_discount_percent =
        unitSystem > 0 ? percentDiscountedFromRetailUnit(unitSold, unitSystem) : 0;
    } else if (loyaltyMode === 'v2') {
      /** V2: харилцагчийн бодит «авсан» хямдралын хувь (жагсаалтын retail нэгж vs sold нэгж) */
      additional_discount_percent =
        unitSystem > 0 ? percentDiscountedFromRetailUnit(unitSold, unitSystem) : 0;
    } else {
      /** V1/V2 биш эсвэл нэвтрээгүй: products.discount ба online_discount Percent-ийн нийлбэр → product_discount_percent */
      const cat = Number(item.product.catalogDiscountPct ?? 0);
      const onl = Number(item.product.onlineDiscountPctAtFetch ?? 0);
      if (cat > 0 || onl > 0) {
        const sum =
          Number.isFinite(cat) && Number.isFinite(onl)
            ? Math.min(100, Math.max(0, cat + onl))
            : 0;
        product_discount_percent = pctClamp(sum);
      }
      additional_discount_percent = 0;
    }

    rows.push({
      store_id: storeId,
      sales_type: true,
      customer_id: opts.customerId,
      product_id: pid,
      coded_paint_id,
      coded_price,
      service_price,
      product_number: q,
      received_price,
      /** Өнгийн кодтой захиалга */
      is_pigment: hasCode,
      system_price: unitSystem,
      sold_price: unitSold,
      foam_size,
      length_meter,
      ecommerce_phone: phone,
      ecommerce_name: name && name.length > 0 ? name : null,
      ecommerce_register: reg && reg.length > 0 ? reg : null,
      /** Төлбөр төлөгдөөгүй захиалга */
      ecommerce_payment_status: false,
      is_delivery: isDelivery,
      delivery_type: deliveryTypeDb,
      ecommerce_delivery_location_lat: lat,
      ecommerce_delivery_location_lng: lng,
      vat_percent: 0,
      product_discount_percent,
      wholesale_discount_percent,
      additional_discount_percent,
      note: note && note.length > 0 ? note : null,
    });
  }

  return rows;
}

/** Supabase REST: онлайн захиалгын мөрүүд bulk insert */
export async function bulkInsertOnlineOrders(
  rows: Record<string, unknown>[],
): Promise<void> {
  if (rows.length === 0) {
    throw new Error('Захиалгын мөр байхгүй байна.');
  }
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!supabaseUrl?.trim() || !anonKey?.trim()) {
    throw new Error('Supabase тохиргоо (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) дутуу байна.');
  }
  const restBase = supabaseUrl.replace(/\/$/, '');
  const res = await fetch(`${restBase}/rest/v1/online_orders`, {
    method: 'POST',
    headers: {
      apikey: anonKey.trim(),
      Authorization: `Bearer ${anonKey.trim()}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (res.ok) return;
  const json = await res.json().catch(() => null);
  throw new Error(messageFromRest(json, res.status));
}
