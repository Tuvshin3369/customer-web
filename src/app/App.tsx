'use client';

import { useState, useMemo, useEffect } from 'react';
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
import { mockBrands } from './data';
import { Product, CartItem } from './types';
import { calculateTotal } from './utils/priceCalc';

// ── Brand → Store display mapping (UI-only, hardcoded) ───────────────────────
// When a brand chip is active, the Header shows the store name, NOT the brand name.
// Switching between brands within the same store keeps the title unchanged.
const BRAND_TO_STORE: Record<string, string> = {
  'MODERN UI':    'Store A',
  'LUXURY':       'Store A',
  'ACTIVE':       'Store A',
  'SPORT PRO':    'Store B',
  'URBAN STYLE':  'Store B',
  'CLASSIC LINE': 'Store B',
  'TECH ZONE':    'Store B',
  'PREMIUM LAB':  'Store B',
};

const SELECTED_STORE_STORAGE_KEY = 'customer-web-selected-store-id';

interface StoreFromApi {
  id: string;
  name: string;
  facebook_messenger_url: string | null;
}

export default function App() {
  // ── Filters ──────────────────────────────────────────────────────────────
  const [selectedBrand,    setSelectedBrand]    = useState('MODERN UI');
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

  // ── Cart store lock (UI only) ─────────────────────────────────────────────
  // Set to the store name of the first cart item; null when cart is empty.
  const [activeCartStore, setActiveCartStore] = useState<string | null>(null);
  // Toast shown when user tries to switch to a locked-out store
  const [showLockedToast, setShowLockedToast] = useState(false);

  // ── Cart state — declared here so the effects below can reference it ──────
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  // ── Дэлгүүрүүд (stores) — hamburger + Messenger URL ───────────────────────
  const [stores, setStores] = useState<StoreFromApi[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);

  async function parseJsonSafely(res: Response) {
    const raw = await res.text();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(`HTTP ${res.status}`);
    }
  }

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
    setSelectedStoreId(id);
    try {
      window.localStorage.setItem(SELECTED_STORE_STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  }

  function fireLockedToast() {
    setShowLockedToast(true);
    setTimeout(() => setShowLockedToast(false), 2200);
  }

  // Auto-reset lock when cart empties
  useEffect(() => {
    if (cartItems.length === 0) setActiveCartStore(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartItems.length]);

  // Auto-switch brand if the locked store doesn't include the current brand
  useEffect(() => {
    if (!activeCartStore) return;
    if ((BRAND_TO_STORE[selectedBrand] ?? '') !== activeCartStore) {
      const first = Object.keys(BRAND_TO_STORE).find(b => BRAND_TO_STORE[b] === activeCartStore);
      if (first) { setSelectedBrand(first); setSelectedCategory('Бүх бараа'); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCartStore]);

  // ── Home toast (shown after profile save) ────────────────────────────────
  const [showHomeToast, setShowHomeToast] = useState(false);
  const [homeTabKey,    setHomeTabKey]    = useState(0);

  // ── Auth state (UI only) ─────────────────────────────────────────────────
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  function handleLoginSuccess() { setIsLoggedIn(true); }
  function handleLogout()        { setIsLoggedIn(false); }

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
    // Lock store on first add
    if (cartItems.length === 0) {
      const store = BRAND_TO_STORE[selectedBrand];
      if (store) setActiveCartStore(store);
    }
    setCartItems(prev => [...prev, item]);
  }

  function handleAddChildItems(items: CartItem[]) {
    // Lock store on first add
    if (cartItems.length === 0 && items.length > 0) {
      const store = BRAND_TO_STORE[selectedBrand];
      if (store) setActiveCartStore(store);
    }
    setCartItems(prev => [...prev, ...items]);
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
    setCartItems(prev => {
      const next = prev.filter(item => item.cartItemId !== cartItemId);
      if (next.length === 0) setActiveCartStore(null);
      return next;
    });
  }

  // ── Brand / category / product derivations ───────────────────────────────
  const brandNames = useMemo(() => mockBrands.map(b => b.name), []);

  // Visible brand chips — filtered to active store when cart is locked
  const visibleBrandNames = useMemo(
    () =>
      activeCartStore
        ? brandNames.filter(b => (BRAND_TO_STORE[b] ?? '') === activeCartStore)
        : brandNames,
    [brandNames, activeCartStore],
  );

  const currentBrand = useMemo(
    () => mockBrands.find(b => b.name === selectedBrand),
    [selectedBrand],
  );

  const categoryNames = useMemo(
    () => currentBrand?.categories.map(c => c.name) || [],
    [currentBrand],
  );

  const currentProducts = useMemo(() => {
    if (!currentBrand) return [];
    if (selectedCategory === 'Бүх бараа') {
      const all: Product[] = [];
      currentBrand.categories.forEach(c => all.push(...c.products));
      return all;
    }
    return currentBrand.categories.find(c => c.name === selectedCategory)?.products || [];
  }, [currentBrand, selectedCategory]);

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

  // ── Header title — сонгосон дэлгүүр (stores.name), эсвэл брэндийн store mapping ──
  const headerTitle = useMemo(
    () => selectedStore?.name || (BRAND_TO_STORE[selectedBrand] ?? selectedBrand),
    [selectedStore, selectedBrand],
  );

  const handleBrandChange = (brand: string) => {
    // Guard: block cross-store navigation when cart is locked
    if (activeCartStore && (BRAND_TO_STORE[brand] ?? '') !== activeCartStore) {
      fireLockedToast();
      return;
    }
    setSelectedBrand(brand);
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
        brands={visibleBrandNames}
        activeBrand={selectedBrand}
        onBrandChange={handleBrandChange}
        lockedStore={activeCartStore}
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
          // Clear cart data
          setCartItems([]);
          setActiveCartStore(null);
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
        brandName={selectedBrand}
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