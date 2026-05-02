import { Product, CartItemConfig } from '../types';

/**
 * Returns the effective base price for a product.
 * Falls back to `product.price` when `product.basePrice` is not set.
 */
export function getBasePrice(product: Product): number {
  return product.basePrice ?? product.price;
}

/**
 * Calculates the total price for a cart entry.
 *
 * Formula per product type:
 *   TYPE 1 → basePrice × quantity
 *   TYPE 2 → basePrice × length × quantity
 *   TYPE 3 + is_foam_range → foamUnitPrice × quantity («Бодох»)
 *   TYPE 3 (бусад) → basePrice × height × (width ?? 1) × quantity
 *   TYPE 4 → basePrice × quantity
 *
 * Add new types here to keep pricing logic in one place.
 */
export function calculateTotal(
  product: Product,
  config: CartItemConfig,
  quantity: number,
): number {
  const base = getBasePrice(product);
  const type = product.productType ?? 1;

  switch (type) {
    case 2: {
      const len = config.length ?? 1;
      return base * len * quantity;
    }
    case 3: {
      if (product.is_foam_range === true) {
        const fu = config.foamUnitPrice;
        if (fu != null && Number.isFinite(fu)) {
          return Math.max(0, Math.round(fu * quantity));
        }
        return 0;
      }
      const h = config.height ?? 1;
      const w = config.width ?? 1;
      return base * h * w * quantity;
    }
    case 1:
    case 4:
    default:
      return base * quantity;
  }
}

/**
 * Human-readable label for a config field set, shown in the cart drawer.
 * Returns null when there are no custom fields.
 */
export function configLabel(product: Product, config: CartItemConfig): string | null {
  const type = product.productType ?? 1;
  const parts: string[] = [];

  if (type === 2 && config.length != null) {
    parts.push(`Урт: ${config.length}см`);
  }
  if (type === 3) {
    if (config.height != null) parts.push(`Өндөр: ${config.height}см`);
    if (config.width != null) parts.push(`Өргөн: ${config.width}см`);
    if (config.foamTotalArea != null)
      parts.push(`Талбай: ${config.foamTotalArea.toLocaleString(undefined, { maximumFractionDigits: 4 })}`);
  }
  if (type === 4 && config.colorCode) {
    parts.push(`Өнгийн код: ${config.colorCode}`);
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}