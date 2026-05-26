import type { CartItem, Product } from '../types';
import { calculateTotal } from '../utils/priceCalc';
import { DELIVERY_IMAGE_PLACEHOLDER } from '../utils/offlineImagePlaceholders';
import { productThumbnailUrlForPrimary } from '../utils/productThumbnailUrl';

export const DELIVERY_SERVICE_CART_ITEM_ID = '__delivery_service__';

function numField(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** product_images → URL жагсаалт (App.tsx-тэй ижил бүтэц) */
function urlsFromProductImages(value: unknown): string[] {
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
          /* not JSON */
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

/** REST products мөрийг сагсны delivery мөр болгох */
export function parseDeliveryServiceProductRow(
  row: Record<string, unknown>,
  cartStoreId: string | null,
): Product | null {
  const pid = row.id != null ? String(row.id) : '';
  if (!pid) return null;
  const nm =
    typeof row.product_name === 'string'
      ? row.product_name.trim()
      : String(row.product_name ?? '');
  if (!nm) return null;
  const urls = urlsFromProductImages(row.product_images);
  const img = urls[0] || DELIVERY_IMAGE_PLACEHOLDER;
  const listThumb = productThumbnailUrlForPrimary(img, DELIVERY_IMAGE_PLACEHOLDER);
  const retail = numField(row.retail_price, 0);
  return {
    id: pid,
    store_id: cartStoreId ?? undefined,
    name: nm,
    category: 'Хүргэлт',
    is_service: true,
    price: retail,
    basePrice: 0,
    receivedPrice: numField(row.received_price, 0),
    stock: 999_999,
    imageUrl: img,
    ...(listThumb ? { thumbnailUrl: listThumb } : {}),
    images: urls.length > 0 ? urls : undefined,
    productType: 1,
  };
}

/**
 * Сагсны дэлгүүрийн `store_id` — зөвхөн жинхэнэ бараанаас (`is_service` биш).
 * Хүргэлтийн service мөр (`is_service=1`) store_id-гүй тул алгасна.
 */
export function resolveCartStoreId(items: CartItem[]): string | null {
  for (const item of items) {
    if (item.cartItemId === DELIVERY_SERVICE_CART_ITEM_ID) continue;
    if (item.product.is_service === true) continue;
    const sid = item.product.store_id?.trim();
    if (sid) return sid;
  }
  return null;
}

export function buildDeliveryServiceCartItem(
  template: Product,
  transportFeePerCar: number,
  carCount: number,
): CartItem {
  const fee = Math.max(0, Math.round(transportFeePerCar)); /* үнэгүй хүргэлт: 0 */
  const qty = Math.max(1, carCount);
  const product: Product = {
    ...template,
    is_service: true,
    price: fee,
    basePrice: fee,
    productType: 1,
  };
  return {
    cartItemId: DELIVERY_SERVICE_CART_ITEM_ID,
    product,
    quantity: qty,
    config: {},
    totalPrice: calculateTotal(product, {}, qty),
  };
}
