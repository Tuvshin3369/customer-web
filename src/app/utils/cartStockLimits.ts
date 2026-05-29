import type { CartItem } from '../types';
import { DELIVERY_SERVICE_CART_ITEM_ID } from '../lib/deliveryServiceCart';
import { displayStock } from './displayStock';

function isStockTrackedLine(item: CartItem): boolean {
  return (
    item.product.is_service !== true &&
    item.cartItemId !== DELIVERY_SERVICE_CART_ITEM_ID
  );
}

/** Сагсанд ижил барааны (product.id) нийт тоо — service мөрүүдийг тооцохгүй. */
export function cartQuantityForProductId(
  items: CartItem[],
  productId: string | number,
  excludeCartItemId?: string,
): number {
  const pid = String(productId);
  return items
    .filter(
      (i) =>
        isStockTrackedLine(i) &&
        String(i.product.id) === pid &&
        (!excludeCartItemId || i.cartItemId !== excludeCartItemId),
    )
    .reduce((sum, i) => sum + i.quantity, 0);
}

/** Шинэ мөр нэмэхэд сагсанд үлдсэн боломжит тоо (дэлгэцийн үлдэгдэл − сагсанд байгаа). */
export function remainingStockForProduct(
  items: CartItem[],
  productId: string | number,
  stock: number | null | undefined,
  excludeCartItemId?: string,
): number {
  const limit = displayStock(stock);
  const inCart = cartQuantityForProductId(items, productId, excludeCartItemId);
  return Math.max(0, limit - inCart);
}

/** Сагсны нэг мөрийн дээд хязгаар (бусад мөрүүдийн тоог хассан). */
export function maxQuantityForCartLine(item: CartItem, items: CartItem[]): number {
  if (!isStockTrackedLine(item)) return 99999;
  return remainingStockForProduct(items, item.product.id, item.product.stock, item.cartItemId);
}

export function clampCartLineQuantity(
  item: CartItem,
  items: CartItem[],
  requestedQty: number,
): number {
  if (!isStockTrackedLine(item)) {
    return Math.max(1, Math.min(99999, Math.trunc(requestedQty)));
  }
  const max = maxQuantityForCartLine(item, items);
  if (max <= 0) return Math.max(1, item.quantity);
  return Math.min(max, Math.max(1, Math.trunc(requestedQty)));
}

/** Шинэ cart мөр нэмэхэд тоо ширхгийг үлдэгдлээр хязгаарлана; 0 бол null. */
export function clampNewCartItem(
  item: CartItem,
  items: CartItem[],
): CartItem | null {
  if (!isStockTrackedLine(item)) return item;
  const max = remainingStockForProduct(items, item.product.id, item.product.stock);
  if (max <= 0) return null;
  const qty = Math.min(item.quantity, max);
  if (qty <= 0) return null;
  return { ...item, quantity: qty };
}

export interface CartStockViolation {
  productId: string;
  name: string;
  requested: number;
  limit: number;
}

/** Захиалга илгээхээс өмнө сагсны нийт тоо үлдэгдлөөс их эсэхийг шалгана. */
export function findCartStockViolations(items: CartItem[]): CartStockViolation[] {
  const byProduct = new Map<string, { name: string; qty: number; stock: number }>();

  for (const item of items) {
    if (!isStockTrackedLine(item)) continue;
    const pid = String(item.product.id);
    const stock = displayStock(item.product.stock);
    const cur = byProduct.get(pid);
    if (cur) {
      cur.qty += item.quantity;
    } else {
      byProduct.set(pid, { name: item.product.name, qty: item.quantity, stock });
    }
  }

  const out: CartStockViolation[] = [];
  for (const [productId, { name, qty, stock }] of byProduct) {
    if (qty > stock) {
      out.push({ productId, name, requested: qty, limit: stock });
    }
  }
  return out;
}

export function formatCartStockViolationMessage(violations: CartStockViolation[]): string {
  if (violations.length === 0) return '';
  const first = violations[0];
  if (violations.length === 1) {
    return `«${first.name}» барааны үлдэгдэл ${first.limit} — сагсанд ${first.requested} ширхэг байна. Тоо ширхгийг багасгаад дахин оролдоно уу.`;
  }
  return `${violations.length} барааны тоо ширхэг үлдэгдлөөс их байна. Сагсаа шалгаад дахин оролдоно уу.`;
}
