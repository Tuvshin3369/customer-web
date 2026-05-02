// ─── Product Types ────────────────────────────────────────────────────────────
// 1 = Quantity only
// 2 = Length (required) + Quantity
// 3 = Height (required) + Width (optional) + Quantity
// 4 = Color Code (text) + Quantity
export type ProductType = 1 | 2 | 3 | 4;

/** foam_range хүснэгт — барааны нийт талбайн интервал / нэгж хувь */
export interface FoamRangeRow {
  min_amount: number;
  /** Дээд хязгааргүй бол Number.POSITIVE_INFINITY */
  max_amount: number;
  /** Нэгж үнэнд: нийт_талбай × price */
  price: number;
}

// ─── Child Product ────────────────────────────────────────────────────────────
// Simplified product variant under a parent product.
export interface ChildProduct {
  id: number | string;
  name: string;
  stock: number;
  price: number;
  imageUrl: string;
  images?: string[];   // optional gallery images; falls back to [imageUrl]
}

export interface Product {
  id: number | string;
  store_id?: string;   // UUID from stores table in Supabase
  /** categories.id — UI-д category_name-ээр солигдоно */
  categoryId?: string;
  /** «Бүх бараа» эрэмбэ: categories.sequence_number-ийн дараа products.display_order */
  displayOrder?: number;
  name: string;
  category: string;
  price: number;       // display / original price (kept for backward compat)
  basePrice?: number;  // unit price used for calculations; falls back to price
  oldPrice?: number;
  /** Нийт хөнгөлөлтийн хувь (барааны discount + брэндийн online_discount_percent) */
  discount?: number;
  stock: number;
  imageCount?: number;
  imageUrl: string;
  images?: string[];
  /** products.product_manual — заавар (ихэнхдээ PDF URL) */
  manualUrl?: string;
  productType?: ProductType; // defaults to 1 when absent
  /** true бол захиалгын модалд өнгийн кодын форм (productType 4-тэй ижил) */
  is_coded_paint?: boolean;
  /** true бол өндөр/өргөн (productType 3-тай ижил) */
  is_foam_range?: boolean;
  /** is_foam_range: санал болгох өргөн = өндөр × ratio (products.ratio) */
  ratio?: number;
  /** is_foam_range: нийт талбай = өндөр × өргөн × waste */
  waste?: number;
  /** is_foam_range: foam_range хүснэгтээс (min_amount, max_amount, price) */
  foamRange?: FoamRangeRow[];
  /** true бол урт (productType 2-той ижил) */
  is_calculate_length?: boolean;
  // ── Parent product fields ─────────────────────────────────────────────────
  /** related_product_* эсвэл children — ProductConfigModal-д «Нэмэлт бараа авах» */
  isParent?: boolean;
  children?: ChildProduct[];
}

// ─── Cart Config ──────────────────────────────────────────────────────────────
// Custom measurement / option fields collected in the config modal
export interface CartItemConfig {
  length?: number;    // TYPE 2
  height?: number;    // TYPE 3
  width?: number;     // TYPE 3 (optional)
  colorCode?: string; // TYPE 4
  /** is_foam_range: «Бодох»-ийн дараах нэгж үнэ (1 ширхэг) */
  foamUnitPrice?: number;
  /** is_foam_range: өндөр×өргөн×waste */
  foamTotalArea?: number;
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