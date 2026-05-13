import type { CartItem } from '../types';

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

function lineUnitSellingPrice(item: CartItem): number {
  const q = Math.max(1, item.quantity);
  return Math.max(0, Math.round(item.totalPrice / q));
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
    const unit = lineUnitSellingPrice(item);
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

    const pct = (v: unknown): number => {
      const n = Number(v);
      if (!Number.isFinite(n)) return 0;
      return Math.min(100, Math.max(0, Math.round(n)));
    };
    /** Product.discount — барааны нийт хөнгөлөлтийн хувь (байхгүй бол 0) */
    const productDiscountPct = pct(item.product.discount);

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
      system_price: unit,
      sold_price: unit,
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
      product_discount_percent: productDiscountPct,
      wholesale_discount_percent: 0,
      additional_discount_percent: 0,
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
