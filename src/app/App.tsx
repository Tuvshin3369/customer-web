'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Check, ShoppingCart } from 'lucide-react';
import { Header } from './components/Header';
import { SearchBar } from './components/SearchBar';
import { BrandFilter } from './components/BrandFilter';
import { CategoryTabs } from './components/CategoryTabs';
import { ProductGrid } from './components/ProductGrid';
import { BottomNavigation } from './components/BottomNavigation';
import { BranchModal } from './components/BranchModal';
import { LoginModal } from './components/LoginModal';
import { RegisterModal } from './components/RegisterModal';
import { CartDrawer } from './components/CartDrawer';
import { ProductConfigModal } from './components/ProductConfigModal';
import { ChildSelectionModal } from './components/ChildSelectionModal';
import { CheckoutModal } from './components/CheckoutModal';
import { CarModal } from './components/CarModal';
import { UserMenuSheet } from './components/UserMenuSheet';
import { ProfilePage } from './components/ProfilePage';
import { MyOrdersPage } from './components/MyOrdersPage';
import { PurchaseHistoryPage } from './components/PurchaseHistoryPage';
import { ForgotPasswordModal } from './components/ForgotPasswordModal';
import { GuestOrdersPage } from './components/GuestOrdersPage';
import { JobsPage } from './components/JobsPage';
import { ApplicationPage } from './components/ApplicationPage';
import { Product, CartItem, ChildProduct } from './types';
import { calculateTotal } from './utils/priceCalc';

const SELECTED_STORE_STORAGE_KEY = 'customer-web-selected-store-id';

interface StoreFromApi {
  id: string;
  name: string;
  facebook_messenger_url: string | null;
}

interface BrandRow {
  id: string;
  brand_name: string;
  order_number: number;
  /** Онлайн зарах нэмэлт хөнгөлөлтийн хувь */
  online_discount_percent: number;
}

interface CategoryRow {
  id: string;
  category_name: string;
  sequence_number: number;
}

async function parseJsonSafely(res: Response): Promise<unknown> {
  const raw = await res.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`HTTP ${res.status}`);
  }
}

function numField(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * product_images-аас бүх зургийн URL (дараалал хадгалагдана, давхардлыг алгасна).
 */
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
          /* зөв JSON биш */
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

function firstUrlFromProductImages(value: unknown): string {
  return allUrlsFromProductImages(value)[0] ?? '';
}

const GOODS_BALANCE_CHUNK = 80;

/**
 * goods_balance: branch_id + product_id бүрт үлдэгдэл.
 * Нэг барааны бүх салбарын үлдэгдлийг product_id-ээр нийлбэрлэнэ.
 */
async function fetchGoodsBalanceTotals(
  restBase: string,
  anonKey: string,
  productIds: string[],
): Promise<Record<string, number>> {
  const totals: Record<string, number> = {};
  if (productIds.length === 0) return totals;
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    Accept: 'application/json',
  };
  for (let i = 0; i < productIds.length; i += GOODS_BALANCE_CHUNK) {
    const chunk = productIds.slice(i, i + GOODS_BALANCE_CHUNK);
    const query = new URLSearchParams({
      select: 'branch_id,product_id,goods_balance',
      product_id: `in.(${chunk.join(',')})`,
    });
    try {
      const res = await fetch(`${restBase}/rest/v1/goods_balance?${query.toString()}`, { headers });
      const json = await parseJsonSafely(res);
      if (!res.ok || !Array.isArray(json)) continue;
      for (const row of json as Record<string, unknown>[]) {
        const pid = row.product_id != null ? String(row.product_id) : '';
        if (!pid) continue;
        totals[pid] = (totals[pid] ?? 0) + numField(row.goods_balance, 0);
      }
    } catch {
      /* RLS эсвэл хүснэгтийн нэр */
    }
  }
  return totals;
}

const RELATED_PRODUCT_KEYS = [
  'related_product_1_id',
  'related_product_2_id',
  'related_product_3_id',
  'related_product_4_id',
] as const;

const PRODUCTS_LIST_SELECT =
  'id,product_name,product_images,product_manual,retail_price,discount,category_id,brand_id,store_id,display_order,is_coded_paint,is_foam_range,is_calculate_length,related_product_1_id,related_product_2_id,related_product_3_id,related_product_4_id';

function mapRowToChildProduct(
  row: Record<string, unknown>,
  pid: string,
  onlinePct: number,
  stock: number,
): ChildProduct | null {
  const nm =
    typeof row.product_name === 'string'
      ? row.product_name.trim()
      : String(row.product_name ?? '');
  if (!nm) return null;
  const imageUrls = allUrlsFromProductImages(row.product_images);
  const img = imageUrls[0] || 'https://via.placeholder.com/400x500?text=No+Image';
  const retail = numField(row.retail_price, 0);
  const productDisc = numField(row.discount, 0);
  const totalDisc = Math.min(100, Math.max(0, productDisc + onlinePct));
  const hasDisc = totalDisc > 0 && retail > 0;
  const price = hasDisc ? Math.round(retail * (1 - totalDisc / 100)) : retail;
  return {
    id: pid,
    name: nm,
    stock,
    price,
    imageUrl: img,
    images: imageUrls.length > 0 ? imageUrls : undefined,
  };
}

async function fetchProductRowsByIds(
  restBase: string,
  anonKey: string,
  ids: string[],
  storeId: string,
  select: string,
): Promise<Record<string, Record<string, unknown>>> {
  const out: Record<string, Record<string, unknown>> = {};
  if (ids.length === 0) return out;
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    Accept: 'application/json',
  };
  for (let i = 0; i < ids.length; i += GOODS_BALANCE_CHUNK) {
    const chunk = ids.slice(i, i + GOODS_BALANCE_CHUNK);
    const query = new URLSearchParams({
      select,
      id: `in.(${chunk.join(',')})`,
      store_id: `eq.${storeId}`,
      is_inactive: 'eq.false',
    });
    try {
      const res = await fetch(`${restBase}/rest/v1/products?${query.toString()}`, { headers });
      const json = await parseJsonSafely(res);
      if (!res.ok || !Array.isArray(json)) continue;
      for (const raw of json as Record<string, unknown>[]) {
        const id = raw.id != null ? String(raw.id) : '';
        if (id) out[id] = raw;
      }
    } catch {
      /* RLS */
    }
  }
  return out;
}

export default function App() {
  // ── Filters ──────────────────────────────────────────────────────────────
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState('Бүх бараа');
  const [searchQuery,      setSearchQuery]      = useState('');

  // ── Modals ───────────────────────────────────────────────────────────────
  const [isBranchModalOpen,    setIsBranchModalOpen]    = useState(false);
  const [isLoginModalOpen,     setIsLoginModalOpen]     = useState(false);
  const [isRegisterModalOpen,  setIsRegisterModalOpen]  = useState(false);
  const [isCartOpen,           setIsCartOpen]           = useState(false);
  const [isCheckoutOpen,       setIsCheckoutOpen]       = useState(false);
  const [isCarModalOpen,       setIsCarModalOpen]       = useState(false);
  const [isUserMenuOpen,       setIsUserMenuOpen]       = useState(false);
  const [isProfileOpen,        setIsProfileOpen]        = useState(false);
  const [isMyOrdersOpen,       setIsMyOrdersOpen]       = useState(false);
  const [isHistoryOpen,        setIsHistoryOpen]        = useState(false);
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  const [isGuestOrdersOpen,    setIsGuestOrdersOpen]    = useState(false);
  const [isJobsOpen,           setIsJobsOpen]           = useState(false);
  const [isApplicationOpen,    setIsApplicationOpen]    = useState(false);

  // ── Cart store lock — сагсанд бараа байхад өөр дэлгүүр сонгохыг хориглоно ──
  const [activeCartStoreId, setActiveCartStoreId] = useState<string | null>(null);
  const [lockedStoreDisplayName, setLockedStoreDisplayName] = useState<string | null>(null);
  // Toast shown when user tries to switch to a locked-out store
  const [showLockedToast, setShowLockedToast] = useState(false);

  // ── Cart state — declared here so the effects below can reference it ──────
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  // ── Дэлгүүрүүд (stores) — hamburger + Messenger URL ───────────────────────
  const [stores, setStores] = useState<StoreFromApi[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);

  const [brandRows, setBrandRows] = useState<BrandRow[]>([]);
  const [categoryRows, setCategoryRows] = useState<CategoryRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  async function fetchStores() {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!supabaseUrl || !supabaseAnonKey) {
      setStores([]);
      setSelectedStoreId(null);
      return;
    }
    try {
      const query = new URLSearchParams({
        select: 'id,name,facebook_messenger_url',
        order: 'name.asc',
      });
      const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/stores?${query.toString()}`, {
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
          Accept: 'application/json',
        },
      });
      const json = await parseJsonSafely(res);
      if (!res.ok) {
        throw new Error((json as { message?: string } | null)?.message || `HTTP ${res.status}`);
      }
      if (!Array.isArray(json)) {
        setStores([]);
        setSelectedStoreId(null);
        return;
      }
      const mapped: StoreFromApi[] = json
        .map((row: Record<string, unknown>) => {
          const urlRaw = row.facebook_messenger_url;
          const urlStr = typeof urlRaw === 'string' && urlRaw.trim() ? urlRaw.trim() : null;
          return {
            id: row.id != null ? String(row.id) : '',
            name: typeof row.name === 'string' ? row.name.trim() : '',
            facebook_messenger_url: urlStr,
          };
        })
        .filter((r) => r.id.length > 0 && r.name.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name, 'mn'));
      setStores(mapped);

      let savedId: string | null = null;
      try {
        savedId = window.localStorage.getItem(SELECTED_STORE_STORAGE_KEY);
      } catch {
        /* private mode */
      }
      const nextId =
        savedId && mapped.some((s) => s.id === savedId) ? savedId : (mapped[0]?.id ?? null);
      setSelectedStoreId(nextId);
      if (nextId) {
        try {
          window.localStorage.setItem(SELECTED_STORE_STORAGE_KEY, nextId);
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      console.error('fetchStores error:', err);
      setStores([]);
      setSelectedStoreId(null);
    }
  }

  useEffect(() => {
    fetchStores();
  }, []);

  function handleStoreSelect(id: string) {
    if (cartItems.length > 0 && activeCartStoreId != null && id !== activeCartStoreId) {
      fireLockedToast();
      return;
    }
    setSelectedStoreId(id);
    try {
      window.localStorage.setItem(SELECTED_STORE_STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  }

  const fetchBrandsForStore = useCallback(async (storeId: string | null) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!storeId || !supabaseUrl || !supabaseAnonKey) {
      setBrandRows([]);
      setSelectedBrandId('');
      return;
    }
    try {
      const query = new URLSearchParams({
        select: 'id,brand_name,order_number,online_discount_percent',
        store_id: `eq.${storeId}`,
        is_online_active: 'eq.true',
        order: 'order_number.asc',
      });
      const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/brands?${query.toString()}`, {
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
          Accept: 'application/json',
        },
      });
      const json = await parseJsonSafely(res);
      if (!res.ok) {
        throw new Error((json as { message?: string } | null)?.message || `HTTP ${res.status}`);
      }
      if (!Array.isArray(json)) {
        setBrandRows([]);
        setSelectedBrandId('');
        return;
      }
      const mapped: BrandRow[] = json
        .map((row: Record<string, unknown>) => ({
          id: row.id != null ? String(row.id) : '',
          brand_name: typeof row.brand_name === 'string' ? row.brand_name.trim() : '',
          order_number: typeof row.order_number === 'number' && Number.isFinite(row.order_number)
            ? row.order_number
            : Number(row.order_number ?? 0),
          online_discount_percent: numField(row.online_discount_percent, 0),
        }))
        .filter((r) => r.id.length > 0 && r.brand_name.length > 0);
      setBrandRows(mapped);
      setSelectedBrandId((prev) => {
        if (prev && mapped.some((b) => b.id === prev)) return prev;
        return mapped[0]?.id ?? '';
      });
    } catch (err) {
      console.error('fetchBrandsForStore error:', err);
      setBrandRows([]);
      setSelectedBrandId('');
    }
  }, []);

  useEffect(() => {
    fetchBrandsForStore(selectedStoreId);
  }, [selectedStoreId, fetchBrandsForStore]);

  const fetchCategoriesForBrand = useCallback(async (brandId: string | null) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!brandId || !supabaseUrl || !supabaseAnonKey) {
      setCategoryRows([]);
      return;
    }
    try {
      const query = new URLSearchParams({
        select: 'id,category_name,sequence_number',
        brand_id: `eq.${brandId}`,
        order: 'sequence_number.asc',
      });
      const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/categories?${query.toString()}`, {
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
          Accept: 'application/json',
        },
      });
      const json = await parseJsonSafely(res);
      if (!res.ok) {
        throw new Error((json as { message?: string } | null)?.message || `HTTP ${res.status}`);
      }
      if (!Array.isArray(json)) {
        setCategoryRows([]);
        return;
      }
      const mapped: CategoryRow[] = json
        .map((row: Record<string, unknown>) => ({
          id: row.id != null ? String(row.id) : '',
          category_name: typeof row.category_name === 'string' ? row.category_name.trim() : '',
          sequence_number:
            typeof row.sequence_number === 'number' && Number.isFinite(row.sequence_number)
              ? row.sequence_number
              : Number(row.sequence_number ?? 0),
        }))
        .filter((r) => r.id.length > 0 && r.category_name.length > 0);
      setCategoryRows(mapped);
    } catch (err) {
      console.error('fetchCategoriesForBrand error:', err);
      setCategoryRows([]);
    }
  }, []);

  useEffect(() => {
    fetchCategoriesForBrand(selectedBrandId || null);
  }, [selectedBrandId, fetchCategoriesForBrand]);

  const selectedBrandOnlineDiscount = useMemo(() => {
    const b = brandRows.find((x) => x.id === selectedBrandId);
    return b != null ? numField(b.online_discount_percent, 0) : 0;
  }, [brandRows, selectedBrandId]);

  const fetchProductsForBrand = useCallback(async () => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!selectedStoreId || !selectedBrandId || !supabaseUrl || !supabaseAnonKey) {
      setProducts([]);
      return;
    }
    const restBase = supabaseUrl.replace(/\/$/, '');
    const onlinePct = selectedBrandOnlineDiscount;
    try {
      const query = new URLSearchParams({
        select: PRODUCTS_LIST_SELECT,
        store_id: `eq.${selectedStoreId}`,
        brand_id: `eq.${selectedBrandId}`,
        is_inactive: 'eq.false',
        order: 'display_order.asc',
      });
      const res = await fetch(`${restBase}/rest/v1/products?${query.toString()}`, {
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
          Accept: 'application/json',
        },
      });
      const json = await parseJsonSafely(res);
      if (!res.ok) {
        throw new Error((json as { message?: string } | null)?.message || `HTTP ${res.status}`);
      }
      const rows = Array.isArray(json) ? json : [];
      const productIds = rows
        .map((r) => (r as Record<string, unknown>).id)
        .filter((id) => id != null && id !== '')
        .map(String);
      const relatedIdSet = new Set<string>();
      for (const r of rows as Record<string, unknown>[]) {
        const selfId = r.id != null ? String(r.id) : '';
        for (const key of RELATED_PRODUCT_KEYS) {
          const v = r[key];
          if (v == null || v === '') continue;
          const rid = String(v);
          if (rid !== selfId) relatedIdSet.add(rid);
        }
      }
      const balanceIds = [...new Set([...productIds, ...relatedIdSet])];
      const balanceByProduct = await fetchGoodsBalanceTotals(restBase, supabaseAnonKey, balanceIds);

      const relatedRowById =
        relatedIdSet.size > 0 && selectedStoreId
          ? await fetchProductRowsByIds(
              restBase,
              supabaseAnonKey,
              [...relatedIdSet],
              selectedStoreId,
              PRODUCTS_LIST_SELECT,
            )
          : {};

      const mapped: Product[] = (rows as Record<string, unknown>[])
        .map((row) => {
          const cid = row.category_id != null && row.category_id !== '' ? String(row.category_id) : '';
          const pid = row.id != null ? String(row.id) : '';
          const nm =
            typeof row.product_name === 'string'
              ? row.product_name.trim()
              : String(row.product_name ?? '');
          const imageUrls = allUrlsFromProductImages(row.product_images);
          const img = imageUrls[0] || 'https://via.placeholder.com/400x500?text=No+Image';
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
          const seenRel = new Set<string>();
          const relatedIdsOrdered: string[] = [];
          for (const key of RELATED_PRODUCT_KEYS) {
            const v = row[key];
            if (v == null || v === '') continue;
            const rid = String(v);
            if (rid === pid || seenRel.has(rid)) continue;
            seenRel.add(rid);
            relatedIdsOrdered.push(rid);
          }
          const children: ChildProduct[] = [];
          for (const rid of relatedIdsOrdered) {
            const rrow = relatedRowById[rid];
            if (!rrow) continue;
            const child = mapRowToChildProduct(
              rrow,
              rid,
              onlinePct,
              balanceByProduct[rid] ?? 0,
            );
            if (child) children.push(child);
          }
          return {
            id: pid,
            store_id: selectedStoreId,
            categoryId: cid || undefined,
            displayOrder: numField(row.display_order, 0),
            is_coded_paint: row.is_coded_paint === true,
            is_foam_range: row.is_foam_range === true,
            is_calculate_length: row.is_calculate_length === true,
            name: nm,
            category: 'Бусад',
            price: retail,
            basePrice: hasDisc ? saleRounded : retail,
            oldPrice: hasDisc ? retail : undefined,
            discount: hasDisc ? Math.round(totalDisc * 100) / 100 : undefined,
            stock: balanceByProduct[pid] ?? 0,
            imageUrl: img,
            images: imageUrls.length > 0 ? imageUrls : undefined,
            manualUrl,
            isParent: children.length > 0,
            children: children.length > 0 ? children : undefined,
          } satisfies Product;
        })
        .filter((p) => p.id.length > 0 && p.name.length > 0);
      setProducts(mapped);
    } catch (err) {
      console.error('fetchProductsForBrand error:', err);
      setProducts([]);
    }
  }, [selectedStoreId, selectedBrandId, selectedBrandOnlineDiscount]);

  useEffect(() => {
    fetchProductsForBrand();
  }, [fetchProductsForBrand]);

  useEffect(() => {
    setSelectedCategory('Бүх бараа');
  }, [selectedBrandId]);

  function fireLockedToast() {
    setShowLockedToast(true);
    setTimeout(() => setShowLockedToast(false), 2200);
  }

  useEffect(() => {
    if (cartItems.length === 0) {
      setActiveCartStoreId(null);
      setLockedStoreDisplayName(null);
    }
  }, [cartItems.length]);

  // ── Home toast (shown after profile save) ────────────────────────────────
  const [showHomeToast, setShowHomeToast] = useState(false);
  const [homeTabKey,    setHomeTabKey]    = useState(0);

  // ── Auth state (UI only) ─────────────────────────────────────────────────
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  /** Нэвтрэхэд утасны дугаар (хоосон бол «Хэрэглэгч») */
  const [loggedInUserLabel, setLoggedInUserLabel] = useState<string | null>(null);

  function handleLoginSuccess(ctx?: { phoneDisplay: string }) {
    setIsLoggedIn(true);
    const t = ctx?.phoneDisplay?.trim() ?? '';
    setLoggedInUserLabel(t.length > 0 ? t : null);
  }
  function handleLogout() {
    setIsLoggedIn(false);
    setLoggedInUserLabel(null);
  }

  function handleOpenProfile() {
    setIsUserMenuOpen(false);
    setIsProfileOpen(true);
  }

  function handleOpenMyOrders() {
    setIsUserMenuOpen(false);
    setIsMyOrdersOpen(true);
  }

  function handleOpenHistory() {
    setIsUserMenuOpen(false);
    setIsHistoryOpen(true);
  }

  function handleOpenApplication() {
    setIsUserMenuOpen(false);
    setIsApplicationOpen(true);
  }

  // ── Profile save → navigate to Home ──────────────────────────────────────
  function handleProfileSaveSuccess() {
    setIsProfileOpen(false);
    setTimeout(() => {
      setSearchQuery('');
      setSelectedCategory('Бүх бараа');
      setHomeTabKey(k => k + 1);
      setShowHomeToast(true);
      setTimeout(() => setShowHomeToast(false), 2000);
    }, 300);
  }

  // ── Config / child modals ────────────────────────────────────────────────
  const [configProduct, setConfigProduct] = useState<Product | null>(null);
  const [parentProduct, setParentProduct] = useState<Product | null>(null);

  const cartCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems],
  );

  const cartGrandTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.totalPrice, 0),
    [cartItems],
  );

  function handleCheckout() {
    setIsCartOpen(false);
    setTimeout(() => setIsCheckoutOpen(true), 120);
  }

  function handleConfigureProduct(product: Product) { setConfigProduct(product); }

  function handleAddConfiguredItem(item: CartItem) {
    if (cartItems.length === 0) {
      if (selectedStoreId) setActiveCartStoreId(selectedStoreId);
      const nm = stores.find((s) => s.id === selectedStoreId)?.name?.trim();
      if (nm) setLockedStoreDisplayName(nm);
    }
    setCartItems((prev) => [...prev, item]);
  }

  function handleAddChildItems(items: CartItem[]) {
    if (cartItems.length === 0 && items.length > 0) {
      if (selectedStoreId) setActiveCartStoreId(selectedStoreId);
      const nm = stores.find((s) => s.id === selectedStoreId)?.name?.trim();
      if (nm) setLockedStoreDisplayName(nm);
    }
    setCartItems((prev) => [...prev, ...items]);
  }

  function handleUpdateQuantity(cartItemId: string, quantity: number) {
    setCartItems(prev =>
      prev.map(item => {
        if (item.cartItemId !== cartItemId) return item;
        return { ...item, quantity, totalPrice: calculateTotal(item.product, item.config, quantity) };
      }),
    );
  }

  function handleRemoveItem(cartItemId: string) {
    setCartItems((prev) => {
      const next = prev.filter((item) => item.cartItemId !== cartItemId);
      if (next.length === 0) {
        setActiveCartStoreId(null);
        setLockedStoreDisplayName(null);
      }
      return next;
    });
  }

  const brandChipOptions = useMemo(
    () => brandRows.map((b) => ({ id: b.id, brandName: b.brand_name })),
    [brandRows],
  );

  const activeBrandDisplayName = useMemo(
    () => brandRows.find((b) => b.id === selectedBrandId)?.brand_name ?? '',
    [brandRows, selectedBrandId],
  );

  const categoryNameById = useMemo(() => {
    const m: Record<string, string> = {};
    categoryRows.forEach((c) => {
      m[c.id] = c.category_name;
    });
    return m;
  }, [categoryRows]);

  const categorySequenceById = useMemo(() => {
    const m: Record<string, number> = {};
    categoryRows.forEach((c) => {
      m[c.id] = c.sequence_number;
    });
    return m;
  }, [categoryRows]);

  const productsLabeled = useMemo(
    () =>
      products.map((p) => {
        const cid = p.categoryId != null && p.categoryId !== '' ? String(p.categoryId) : '';
        const label = cid && categoryNameById[cid] ? categoryNameById[cid] : 'Бусад';
        return { ...p, category: label };
      }),
    [products, categoryNameById],
  );

  const categoryNames = useMemo(
    () => categoryRows.map((c) => c.category_name),
    [categoryRows],
  );

  const currentProducts = useMemo(() => {
    const unknownCategorySeq = Number.MAX_SAFE_INTEGER;
    const byCategoryThenDisplay = (a: Product, b: Product) => {
      const seqA =
        a.categoryId != null && categorySequenceById[a.categoryId] != null
          ? categorySequenceById[a.categoryId]
          : unknownCategorySeq;
      const seqB =
        b.categoryId != null && categorySequenceById[b.categoryId] != null
          ? categorySequenceById[b.categoryId]
          : unknownCategorySeq;
      if (seqA !== seqB) return seqA - seqB;
      const dA = a.displayOrder ?? 0;
      const dB = b.displayOrder ?? 0;
      if (dA !== dB) return dA - dB;
      return String(a.id).localeCompare(String(b.id));
    };
    const byDisplayOnly = (a: Product, b: Product) => {
      const dA = a.displayOrder ?? 0;
      const dB = b.displayOrder ?? 0;
      if (dA !== dB) return dA - dB;
      return String(a.id).localeCompare(String(b.id));
    };

    if (selectedCategory === 'Бүх бараа') {
      return [...productsLabeled].sort(byCategoryThenDisplay);
    }
    return [...productsLabeled.filter((p) => p.category === selectedCategory)].sort(byDisplayOnly);
  }, [productsLabeled, selectedCategory, categorySequenceById]);

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return currentProducts;
    const q = searchQuery.toLowerCase();
    return currentProducts.filter(p => p.name.toLowerCase().includes(q));
  }, [currentProducts, searchQuery]);

  const storePickerItems = useMemo(
    () => [...stores].sort((a, b) => a.name.localeCompare(b.name, 'mn')).map(({ id, name }) => ({ id, name })),
    [stores],
  );

  const selectedStore = useMemo(
    () => stores.find((s) => s.id === selectedStoreId) ?? null,
    [stores, selectedStoreId],
  );

  const messengerUrl = useMemo(() => {
    const u = selectedStore?.facebook_messenger_url?.trim();
    return u && u.length > 0 ? u : null;
  }, [selectedStore]);

  const headerTitle = useMemo(() => selectedStore?.name ?? '', [selectedStore]);

  const handleBrandChange = (brandId: string) => {
    setSelectedBrandId(brandId);
    setSelectedCategory('Бүх бараа');
    setSearchQuery('');
  };

  const handleHomeClick = () => {
    setSearchQuery('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Home toast (post-profile-save feedback) ──────────────────────── */}
      <div
        aria-live="polite"
        className="fixed top-16 inset-x-0 z-[200] flex justify-center px-4 pointer-events-none"
        style={{
          opacity:    showHomeToast ? 1 : 0,
          transform:  showHomeToast ? 'translateY(0)' : 'translateY(-8px)',
          transition: 'opacity 0.2s ease, transform 0.2s ease',
        }}
      >
        <div className="flex items-center gap-2 bg-gray-900/90 text-white text-xs px-4 py-2.5 rounded-full shadow-lg backdrop-blur-sm">
          <Check className="w-3.5 h-3.5 text-green-400 shrink-0" />
          Профайлын мэдээлэл шинэчлэгдлээ
        </div>
      </div>

      {/* ── Store-locked toast ────────────────────────────────────────────── */}
      <div
        aria-live="assertive"
        className="fixed bottom-24 inset-x-0 z-[200] flex justify-center px-4 pointer-events-none"
        style={{
          opacity:    showLockedToast ? 1 : 0,
          transform:  showLockedToast ? 'translateY(0)' : 'translateY(10px)',
          transition: 'opacity 0.2s ease, transform 0.2s ease',
        }}
      >
        <div className="flex items-center gap-2 bg-gray-900/92 text-white text-xs px-4 py-2.5 rounded-full shadow-lg backdrop-blur-sm">
          <ShoppingCart className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          Эхлээд сагсаа хоослоно уу
        </div>
      </div>

      {/* ── Header — receives store name (headerTitle), not brand name ───── */}
      <Header
        brandName={headerTitle}
        onContactClick={() => setIsBranchModalOpen(true)}
        storePickerItems={storePickerItems}
        selectedStoreId={selectedStoreId}
        onStoreSelect={handleStoreSelect}
        messengerUrl={messengerUrl}
        onHomeClick={handleHomeClick}
        onCarClick={() => setIsCarModalOpen(true)}
        onJobsClick={() => setIsJobsOpen(true)}
        onCartClick={() => setIsCartOpen(true)}
        onLoginClick={() => setIsLoginModalOpen(true)}
        onLogout={handleLogout}
        onProfileClick={handleOpenProfile}
        onApplicationClick={handleOpenApplication}
        onMyOrdersClick={handleOpenMyOrders}
        onHistoryClick={handleOpenHistory}
        onGuestOrdersClick={() => setIsGuestOrdersOpen(true)}
        isLoggedIn={isLoggedIn}
        loggedInUserLabel={loggedInUserLabel}
        cartCount={cartCount}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* SearchBar — mobile only; tablet/desktop search lives inside Header */}
      <div className="md:hidden">
        <SearchBar value={searchQuery} onChange={setSearchQuery} />
      </div>

      {/* ── Content filters (all breakpoints) ────────────────────────────── */}
      <BrandFilter
        brands={brandChipOptions}
        activeBrandId={selectedBrandId || null}
        onBrandChange={handleBrandChange}
        lockedStore={cartItems.length > 0 ? lockedStoreDisplayName : null}
        onBlockedClick={fireLockedToast}
      />
      <CategoryTabs
        categories={categoryNames}
        activeCategory={selectedCategory}
        onCategoryChange={cat => { setSelectedCategory(cat); setSearchQuery(''); }}
      />
      <ProductGrid
        products={filteredProducts}
        onConfigureProduct={handleConfigureProduct}
      />

      {/* ── Bottom navigation (hidden on lg+) ────────────────────────────── */}
      <BottomNavigation
        onLoginClick={() => setIsLoginModalOpen(true)}
        onHomeClick={handleHomeClick}
        onCarClick={() => setIsCarModalOpen(true)}
        onJobsClick={() => setIsJobsOpen(true)}
        onCartClick={() => setIsCartOpen(true)}
        onProfileClick={() => setIsUserMenuOpen(true)}
        onOrdersClick={() => setIsGuestOrdersOpen(true)}
        isLoggedIn={isLoggedIn}
        cartCount={cartCount}
        forceActiveTab={homeTabKey > 0 ? 'home' : undefined}
      />

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      <BranchModal
        isOpen={isBranchModalOpen}
        onClose={() => setIsBranchModalOpen(false)}
        storeName={headerTitle}
        storeId={selectedStoreId}
      />
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onRegisterClick={() => setIsRegisterModalOpen(true)}
        onLoginSuccess={handleLoginSuccess}
        onForgotClick={() => setIsForgotPasswordOpen(true)}
      />
      <RegisterModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        onLoginClick={() => setIsLoginModalOpen(true)}
      />
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onClearCart={() => {
          setCartItems([]);
          setActiveCartStoreId(null);
          setLockedStoreDisplayName(null);
          // Close every page/modal so the user lands on Home
          setIsCartOpen(false);
          setIsProfileOpen(false);
          setIsMyOrdersOpen(false);
          setIsHistoryOpen(false);
          setIsCheckoutOpen(false);
          setIsUserMenuOpen(false);
          // Reset filters to default home state
          setSearchQuery('');
          setSelectedCategory('Бүх бараа');
        }}
        onCheckout={handleCheckout}
      />
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)
        }
        items={cartItems}
        grandTotal={cartGrandTotal}
      />
      <CarModal
        isOpen={isCarModalOpen}
        onClose={() => setIsCarModalOpen(false)}
      />
      <UserMenuSheet
        isOpen={isUserMenuOpen}
        onClose={() => setIsUserMenuOpen(false)}
        onLogout={handleLogout}
        onProfileClick={handleOpenProfile}
        onApplicationClick={handleOpenApplication}
        onMyOrdersClick={handleOpenMyOrders}
        onHistoryClick={handleOpenHistory}
        loggedInUserLabel={loggedInUserLabel}
      />
      <ProfilePage
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        onSaveSuccess={handleProfileSaveSuccess}
      />
      <ProductConfigModal
        product={configProduct}
        isOpen={configProduct !== null}
        onClose={() => setConfigProduct(null)}
        onConfirm={handleAddConfiguredItem}
      />
      <ChildSelectionModal
        parentProduct={parentProduct}
        isOpen={parentProduct !== null}
        onClose={() => setParentProduct(null)}
        onAddItems={handleAddChildItems}
        brandName={activeBrandDisplayName}
      />
      <MyOrdersPage
        isOpen={isMyOrdersOpen}
        onClose={() => setIsMyOrdersOpen(false)}
      />
      <PurchaseHistoryPage
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
      />
      <ForgotPasswordModal
        isOpen={isForgotPasswordOpen}
        onClose={() => setIsForgotPasswordOpen(false)}
        onBackToLogin={() => setIsLoginModalOpen(true)}
      />
      <GuestOrdersPage
        isOpen={isGuestOrdersOpen}
        onClose={() => setIsGuestOrdersOpen(false)}
      />
      <JobsPage
        isOpen={isJobsOpen}
        onClose={() => setIsJobsOpen(false)}
      />
      <ApplicationPage
        isOpen={isApplicationOpen}
        onClose={() => setIsApplicationOpen(false)}
      />
    </div>
  );
}