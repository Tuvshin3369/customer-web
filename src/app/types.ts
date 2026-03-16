// ─── Product Types ────────────────────────────────────────────────────────────
// 1 = Quantity only
// 2 = Length (required) + Quantity
// 3 = Height (required) + Width (optional) + Quantity
// 4 = Color Code (text) + Quantity
export type ProductType = 1 | 2 | 3 | 4;

// ─── Child Product ────────────────────────────────────────────────────────────
// Simplified product variant under a parent product.
export interface ChildProduct {
  id: number;
  name: string;
  stock: number;
  price: number;
  imageUrl: string;
  images?: string[];   // optional gallery images; falls back to [imageUrl]
}

export interface Product {
  id: number;
  store_id?: string;   // UUID from stores table in Supabase
  name: string;
  category: string;
  price: number;       // display / original price (kept for backward compat)
  basePrice?: number;  // unit price used for calculations; falls back to price
  oldPrice?: number;
  discount?: number;
  stock: number;
  imageCount?: number;
  imageUrl: string;
  images?: string[];
  manualUrl?: string;
  productType?: ProductType; // defaults to 1 when absent
  // ── Parent product fields ─────────────────────────────────────────────────
  isParent?: boolean;          // when true → opens ChildSelectionModal
  children?: ChildProduct[];   // max 4 children displayed
}

// ─── Cart Config ──────────────────────────────────────────────────────────────
// Custom measurement / option fields collected in the config modal
export interface CartItemConfig {
  length?: number;    // TYPE 2
  height?: number;    // TYPE 3
  width?: number;     // TYPE 3 (optional)
  colorCode?: string; // TYPE 4
}

// ─── Cart Item ────────────────────────────────────────────────────────────────
// Each entry in the cart is keyed by a unique cartItemId so the same product
// can appear multiple times with different configurations.
export interface CartItem {
  cartItemId: string;   // unique per cart entry, e.g. `${productId}-${Date.now()}`
  product: Product;
  quantity: number;
  config: CartItemConfig;
  totalPrice: number;   // pre-calculated; updated whenever quantity changes
}

// ─── Domain types ─────────────────────────────────────────────────────────────
export interface Category {
  name: string;
  products: Product[];
}

export interface Brand {
  name: string;
  categories: Category[];
}