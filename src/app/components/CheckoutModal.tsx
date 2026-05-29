import { useState, useMemo, useEffect, useRef } from 'react';
import {
  X, Phone, Building2, FileText, Hash, Map,
  MapPin, Navigation, Truck, CheckCircle2, AlertCircle,
  Loader2, RefreshCw, Store, ChevronLeft, ChevronDown,
  Copy, Check, History,
} from 'lucide-react';
import type { CartItem, Product } from '../types';
import {
  DELIVERY_SERVICE_CART_ITEM_ID,
  buildDeliveryServiceCartItem,
  parseDeliveryServiceProductRow,
  resolveCartStoreId,
} from '../lib/deliveryServiceCart';
import { MapPickerModal, PickedLocation } from './MapPickerModal';
import { calculateDistanceKm } from '../utils/haversine';
import { PaymentInfoCard } from './PaymentInfoCard';
import { buildOnlineTransferNote } from '../lib/creditTransferNote';
import {
  fetchCustomerProfileByPhone,
  fetchCustomerProfileByGoogleId,
  resolveCustomerIdForOnlineOrder,
  phoneToInt64,
} from '../lib/customersRegister';
import {
  bulkInsertOnlineOrders,
  cartItemsToOnlineOrderRows,
} from '../lib/onlineOrdersSubmit';
import { fetchLastDeliveryLocationFromSales } from '../lib/fetchLastDeliveryLocation';
import {
  looksLikeCoordinateAddress,
  reverseGeocodeLatLng,
} from '../lib/reverseGeocodeGoogle';
import {
  findCartStockViolations,
  formatCartStockViolationMessage,
} from '../utils/cartStockLimits';

function normalizePhoneDigits(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === 'bigint') {
    const s = raw.toString();
    return /^\d+$/.test(s) ? s : null;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (!Number.isInteger(raw) || raw < 0) return null;
    const s = String(Math.trunc(raw));
    return s.length > 0 && /^\d+$/.test(s) ? s : null;
  }
  if (typeof raw === 'string') {
    const d = raw.trim().replace(/\D/g, '');
    return d.length > 0 ? d : null;
  }
  return null;
}

function formatPhoneForDisplay(digits: string | null): string {
  if (!digits) return '';
  const d = digits.replace(/\D/g, '');
  if (d.length === 8) return `${d.slice(0, 4)} ${d.slice(4)}`;
  return d;
}

async function parseRestJson(res: Response): Promise<unknown> {
  const raw = await res.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Тээврийн хөлсийг ₮1000-р дугуйлах (тэнцүү .5 → доош: 7500→7000, 7501→8000). */
function roundTransportFeeToMnt1000(rawFee: number): number {
  if (!Number.isFinite(rawFee) || rawFee <= 0) return 0;
  const n = rawFee / 1000;
  const floor = Math.floor(n);
  const frac = n - floor;
  if (frac < 0.5) return floor * 1000;
  if (frac > 0.5) return (floor + 1) * 1000;
  return floor * 1000;
}

// ─── Types ────────────────────────────────────────────────────────────────────
type DeliveryType  = 'pickup' | 'taxi' | 'delivery';
type WizardStep    = 1 | 2 | 3;

interface StoreConfig {
  base_price_per_km:       number;
  min_delivery_fee:        number;
  free_delivery_threshold: number;
  /** stores.has_delivery=1 үед «Хүргүүлнэ» идэвхтэй */
  has_delivery?:           boolean | number | null;
}

function isStoreDeliveryEnabled(store: StoreConfig | null): boolean {
  if (!store) return false;
  const h = store.has_delivery;
  if (h === true || h === 1 || h === '1') return true;
  if (h === false || h === 0 || h === '0') return false;
  return Number(h) === 1;
}

function storeRowToConfig(row: Record<string, unknown>): StoreConfig {
  const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    base_price_per_km: num(row.base_price_per_km),
    min_delivery_fee: num(row.min_delivery_fee),
    free_delivery_threshold: num(row.free_delivery_threshold),
    has_delivery: row.has_delivery as StoreConfig['has_delivery'],
  };
}

/** Гол салбар — төлбөрийн данс, утас */
interface MainBranchPaymentRow {
  phoneDigits: string | null;
  company_bank: string;
  company_name: string;
  company_account: string;
  personal_bank: string;
  personal_name: string;
  personal_account: string;
}

/** Гол салбарын координатаас хүргэлтийн цэг хүртэлх зай */
interface MainBranchRoute {
  distanceKm: number;
  displayKm:  number;
}

interface GeoLocation {
  lat:     number;
  lng:     number;
  address: string;
}

export interface CheckoutModalProps {
  isOpen:     boolean;
  onClose:    () => void;
  items:      CartItem[];
  grandTotal: number;
  /** Хүргэлт сонгосон үед is_service мөрийг сагсанд синк */
  onSyncDeliveryServiceLine?: (item: CartItem | null) => void;
  /** Сагснаас хүргэлтийн мөрийг хасахад нэмэгдэнэ (checkout доторх хүргэлтийг цуцлах) */
  deliveryUiCancelNonce?: number;
  /** Төлбөрийн данс: байгууллага vs хувь хүн */
  isLoggedIn?: boolean;
  customerPhone?: number | null;
  customerGoogleId?: string | null;
  /** Амжилттай илгээсний дараа модалыг хаахад (сагс хоослох г.м.) */
  onOrderSuccessClose?: () => void;
}

// ─── Step meta ────────────────────────────────────────────────────────────────
const STEP_LABELS: Record<WizardStep, string> = {
  1: 'Хүлээн авах',
  2: 'Хүргэлт',
  3: 'Төлбөр',
};

/** Такси — ачилтын коэффициентийн нийлбэр (тоо × loading_coefficient) дээд хязгаар */
const TAXI_MAX_LOADING_SUM = 0.15;

// ─── Main component ───────────────────────────────────────────────────────────
export function CheckoutModal({
  isOpen,
  onClose,
  items,
  grandTotal,
  onSyncDeliveryServiceLine,
  deliveryUiCancelNonce = 0,
  isLoggedIn = false,
  customerPhone = null,
  customerGoogleId = null,
  onOrderSuccessClose,
}: CheckoutModalProps) {

  /** products.store_id — зөвхөн is_service биш бараанаас (нэг дэлгүүр) */
  const storeId = useMemo(() => resolveCartStoreId(items), [items]);

  // ── Sheet animation ────────────────────────────────────────────────────────
  const [mounted,  setMounted]  = useState(false);
  const [visible,  setVisible]  = useState(false);

  // ── Refs for auto-focus ────────────────────────────────────────────────────
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const handledDeliveryCancelNonceRef = useRef(0);

  // ── Wizard step + fade transition ─────────────────────────────────────────
  const [step,        setStep]        = useState<WizardStep>(1);
  const [stepVisible, setStepVisible] = useState(true);

  function goToStep(next: WizardStep) {
    setSubmitOrderError('');
    setStepVisible(false);
    setTimeout(() => {
      setStep(next);
      setStepVisible(true);
    }, 160);
  }

  /** Гол салбар (is_main_branch) — хүргэлтийн эхлэх цэг */
  const [mainBranchOrigin, setMainBranchOrigin] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  // ── Store config (fetched from DB — pricing) ──────────────────────────────
  const [store,          setStore]          = useState<StoreConfig | null>(null);
  const [isLoadingStore, setIsLoadingStore] = useState(false);
  const [storeError,     setStoreError]     = useState('');

  // Төлбөрийн алхам — stores.store_rules, гол салбарын данс/утас (REST)
  const [storeRulesText, setStoreRulesText] = useState<string | null>(null);
  const [mainBranchPayment, setMainBranchPayment] = useState<MainBranchPaymentRow | null>(null);
  const [customerRegisterDb, setCustomerRegisterDb] = useState<string | null>(null);
  const [paymentDisplayError, setPaymentDisplayError] = useState('');
  const [isLoadingPaymentDisplay, setIsLoadingPaymentDisplay] = useState(false);
  const [rulesSheetOpen, setRulesSheetOpen] = useState(false);

  const [deliveryServiceTemplate, setDeliveryServiceTemplate] = useState<Product | null>(null);

  // ── Step 1 — ХҮЛЭЭН АВАХ ─────────────────────────────────────────────────
  const [phone,        setPhone]        = useState('');
  const [orgName,      setOrgName]      = useState('');
  const [register,     setRegister]     = useState('');
  const [note,         setNote]         = useState('');
  const [phoneError,   setPhoneError]   = useState('');
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [orgExpanded,  setOrgExpanded]  = useState(false);

  // ── Step 2 — ХҮРГЭЛТ ─────────────────────────────────────────────────────
  const [deliveryType,  setDeliveryType]  = useState<DeliveryType>('pickup');
  const [location,      setLocation]      = useState<GeoLocation | null>(null);
  const [isLocating,    setIsLocating]    = useState(false);
  const [locationError, setLocationError] = useState('');
  const [isMapOpen,     setIsMapOpen]     = useState(false);
  const [lastDeliveryLocation, setLastDeliveryLocation] = useState<GeoLocation | null>(null);
  const [lastDeliveryLoading, setLastDeliveryLoading] = useState(false);

  // ── Step 3 — ТӨЛБӨР ──────────────────────────────────────────────────────
  // (no paymentMethod state needed anymore)

  // ── Submit ────────────────────────────────────────────────────────────────
  const [submitted, setSubmitted] = useState(false);
  /** online_orders INSERT — алдаа (step 3) */
  const [submitOrderError, setSubmitOrderError] = useState('');
  const [submitOrderBusy, setSubmitOrderBusy] = useState(false);
  const [copiedTotal,  setCopiedTotal]  = useState(false);

  function handleCopyTotal() {
    const text = finalTotal.toLocaleString();
    navigator.clipboard.writeText(text).catch(() => {
      try {
        const el = document.createElement('textarea');
        el.value = text;
        el.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
        document.body.appendChild(el);
        el.focus(); el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      } catch { /* silent */ }
    });
    setCopiedTotal(true);
    setTimeout(() => setCopiedTotal(false), 1500);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  REACTIVE CALCULATION CHAIN
  // ────────────────────────────────────────────────────────────────────────���

  const merchandiseTotal = useMemo(
    () =>
      items
        .filter((i) => !i.product.is_service)
        .reduce((s, i) => s + i.totalPrice, 0),
    [items],
  );

  const isFreeDelivery = useMemo<boolean>(() => {
    if (deliveryType !== 'delivery' || !store) return false;
    return store.free_delivery_threshold > 0 && merchandiseTotal >= store.free_delivery_threshold;
  }, [deliveryType, store, merchandiseTotal]);

  const mainBranchRoute = useMemo<MainBranchRoute | null>(() => {
    if (deliveryType !== 'delivery' || !location || !mainBranchOrigin) return null;
    const d = calculateDistanceKm(
      mainBranchOrigin.lat,
      mainBranchOrigin.lng,
      location.lat,
      location.lng,
    );
    return { distanceKm: d, displayKm: Number(d.toFixed(1)) };
  }, [deliveryType, location, mainBranchOrigin]);

  const transportFeePerCar = useMemo<number>(() => {
    if (deliveryType !== 'delivery' || !mainBranchRoute || !store) return 0;
    if (isFreeDelivery) return 0;
    const calculatedFee = mainBranchRoute.distanceKm * store.base_price_per_km;
    const rawFee        = Math.max(calculatedFee, store.min_delivery_fee ?? 0);
    return roundTransportFeeToMnt1000(rawFee);
  }, [deliveryType, mainBranchRoute, store, isFreeDelivery]);

  /** products.loading_coefficient × тоо — is_service биш бараанууд */
  const cartLoadingCoeffSum = useMemo(() => {
    let sum = 0;
    for (const item of items) {
      if (item.product.is_service) continue;
      if (item.cartItemId === DELIVERY_SERVICE_CART_ITEM_ID) continue;
      const coeff = item.product.loadingCoefficient;
      if (coeff == null || !Number.isFinite(coeff) || coeff < 0) continue;
      sum += item.quantity * coeff;
    }
    return sum;
  }, [items]);

  const taxiOptionEnabled = cartLoadingCoeffSum <= TAXI_MAX_LOADING_SUM;

  const deliveryCarCount = useMemo<number>(() => {
    const ceiled = Math.ceil(cartLoadingCoeffSum);
    const hasPhysical = items.some((i) => !i.product.is_service);
    if (!hasPhysical) return 1;
    return Math.max(1, ceiled);
  }, [items, cartLoadingCoeffSum]);

  const totalDeliveryCharge = useMemo<number>(() => {
    if (deliveryType !== 'delivery' || isFreeDelivery) return 0;
    return transportFeePerCar * deliveryCarCount;
  }, [deliveryType, isFreeDelivery, transportFeePerCar, deliveryCarCount]);

  /** Сагсанд хүргэлтийн мөр орсон тул дахин нэмэхгүй */
  const finalTotal = useMemo(() => grandTotal, [grandTotal]);

  /** Гүйлгээний утга — customers.phone → google_id → зочны ecommerce_phone (формын утас) */
  const onlineTransferIdentifier = useMemo(() => {
    if (isLoggedIn) {
      if (customerPhone != null && Number.isFinite(customerPhone) && customerPhone > 0) {
        return String(customerPhone);
      }
      const gid = customerGoogleId?.trim();
      if (gid) return gid;
    }
    const guestPhone = phone.trim();
    return guestPhone.length > 0 ? guestPhone : undefined;
  }, [isLoggedIn, customerPhone, customerGoogleId, phone]);

  useEffect(() => {
    if (!isOpen) {
      setDeliveryServiceTemplate(null);
      return;
    }
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!supabaseUrl?.trim() || !supabaseAnonKey?.trim()) {
      setDeliveryServiceTemplate(null);
      return;
    }
    let cancelled = false;
    const restBase = supabaseUrl.replace(/\/$/, '');
    const headers = {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      Accept: 'application/json',
    };
    void (async () => {
      const pq = new URLSearchParams({
        select: 'id,product_name,product_images,retail_price,received_price',
        is_service: 'eq.true',
        limit: '1',
      });
      try {
        const res = await fetch(`${restBase}/rest/v1/products?${pq}`, { headers });
        const json = await parseRestJson(res);
        if (cancelled) return;
        if (!res.ok || !Array.isArray(json) || json.length === 0) {
          setDeliveryServiceTemplate(null);
          return;
        }
        const row = json[0] as Record<string, unknown>;
        setDeliveryServiceTemplate(parseDeliveryServiceProductRow(row, storeId));
      } catch {
        if (!cancelled) setDeliveryServiceTemplate(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, storeId]);

  useEffect(() => {
    if (!isOpen) return;
    if (deliveryUiCancelNonce === handledDeliveryCancelNonceRef.current) return;
    handledDeliveryCancelNonceRef.current = deliveryUiCancelNonce;
    setDeliveryType('pickup');
    setLocation(null);
    setLocationError('');
    setStep((s) => (s === 3 ? 2 : s));
  }, [isOpen, deliveryUiCancelNonce]);

  const paymentBankDetails = useMemo(() => {
    const m = mainBranchPayment;
    const hasCompanyReg =
      isLoggedIn && (customerRegisterDb?.trim() ?? '').length > 0;
    if (!m) {
      return {
        bankName: '—',
        accountHolder: '—',
        accountNumber: '—',
        mainPhoneDigits: null as string | null,
      };
    }
    if (hasCompanyReg) {
      return {
        bankName: m.company_bank || '—',
        accountHolder: m.company_name || '—',
        accountNumber: m.company_account || '—',
        mainPhoneDigits: m.phoneDigits,
      };
    }
    return {
      bankName: m.personal_bank || '—',
      accountHolder: m.personal_name || '—',
      accountNumber: m.personal_account || '—',
      mainPhoneDigits: m.phoneDigits,
    };
  }, [isLoggedIn, customerRegisterDb, mainBranchPayment]);

  // ── Fetch store config (stores.has_delivery г.м.) — Supabase REST ─────────
  async function fetchStore() {
    if (!storeId) {
      setStore(null);
      setStoreError('Сагсанд дэлгүүрийн бараа олдсонгүй (store_id).');
      return;
    }
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!supabaseUrl?.trim() || !supabaseAnonKey?.trim()) {
      setStoreError('Supabase тохиргоо дутуу байна.');
      return;
    }
    setIsLoadingStore(true);
    setStoreError('');
    try {
      const restBase = supabaseUrl.replace(/\/$/, '');
      const headers = {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        Accept: 'application/json',
      };
      const q = new URLSearchParams({
        select: 'base_price_per_km,min_delivery_fee,free_delivery_threshold,has_delivery',
        id: `eq.${storeId}`,
        limit: '1',
      });
      const res = await fetch(`${restBase}/rest/v1/stores?${q.toString()}`, { headers });
      const json = await parseRestJson(res);
      if (!res.ok || !Array.isArray(json) || json.length === 0) {
        throw new Error('Дэлгүүрийн тохиргоо олдсонгүй.');
      }
      setStore(storeRowToConfig(json[0] as Record<string, unknown>));
    } catch (err: unknown) {
      console.error('fetchStore error:', err);
      setStore(null);
      const msg = err instanceof Error ? err.message : 'Дэлгүүрийн тохиргоо ачааллаж чадсангүй';
      setStoreError(msg);
    } finally {
      setIsLoadingStore(false);
    }
  }

  async function fetchPaymentDisplayContext() {
    if (!storeId) {
      setStoreRulesText(null);
      setMainBranchPayment(null);
      setMainBranchOrigin(null);
      setPaymentDisplayError('');
      return;
    }
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!supabaseUrl?.trim() || !supabaseAnonKey?.trim()) {
      setPaymentDisplayError('Supabase тохиргоо дутуу байна.');
      return;
    }
    const restBase = supabaseUrl.replace(/\/$/, '');
    const headers = {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      Accept: 'application/json',
    };
    setIsLoadingPaymentDisplay(true);
    setPaymentDisplayError('');
    try {
      const sq = new URLSearchParams({
        select: 'store_rules',
        id: `eq.${storeId}`,
        limit: '1',
      });
      const sres = await fetch(`${restBase}/rest/v1/stores?${sq}`, { headers });
      const sjson = await parseRestJson(sres);
      if (sres.ok && Array.isArray(sjson) && sjson.length > 0) {
        const raw = (sjson[0] as Record<string, unknown>).store_rules;
        const t = typeof raw === 'string' ? raw.trim() : raw != null ? String(raw).trim() : '';
        setStoreRulesText(t.length > 0 ? t : null);
      } else {
        setStoreRulesText(null);
      }

      const bq = new URLSearchParams({
        select:
          'phone_1,company_bank,company_name,company_account,personal_bank,personal_name,personal_account,address_lat,address_lng',
        store_id: `eq.${storeId}`,
        is_main_branch: 'eq.true',
        limit: '1',
      });
      const bres = await fetch(`${restBase}/rest/v1/branches?${bq}`, { headers });
      const bjson = await parseRestJson(bres);
      if (!bres.ok) {
        throw new Error(
          (bjson as { message?: string } | null)?.message || `Салбар HTTP ${bres.status}`,
        );
      }
      if (Array.isArray(bjson) && bjson.length > 0) {
        const row = bjson[0] as Record<string, unknown>;
        const norm = (v: unknown) => {
          if (v == null) return '';
          return String(v).trim();
        };
        setMainBranchPayment({
          phoneDigits: normalizePhoneDigits(row.phone_1),
          company_bank: norm(row.company_bank),
          company_name: norm(row.company_name),
          company_account: norm(row.company_account),
          personal_bank: norm(row.personal_bank),
          personal_name: norm(row.personal_name),
          personal_account: norm(row.personal_account),
        });
        const lat = Number(row.address_lat);
        const lng = Number(row.address_lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          setMainBranchOrigin({ lat, lng });
        } else {
          setMainBranchOrigin(null);
        }
      } else {
        setMainBranchPayment(null);
        setMainBranchOrigin(null);
      }
    } catch (err: unknown) {
      console.error('fetchPaymentDisplayContext error:', err);
      setPaymentDisplayError(err instanceof Error ? err.message : 'Төлбөрийн мэдээлэл ачаалахад алдаа');
      setStoreRulesText(null);
      setMainBranchPayment(null);
      setMainBranchOrigin(null);
    } finally {
      setIsLoadingPaymentDisplay(false);
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      // Reset all fields
      setStep(1); setStepVisible(true);
      setPhone(''); setOrgName(''); setRegister(''); setNote('');
      setPhoneError(''); setPhoneTouched(false);
      const hasServiceLine = items.some(
        (i) => i.cartItemId === DELIVERY_SERVICE_CART_ITEM_ID || i.product.is_service === true,
      );
      setDeliveryType('pickup');
      setLocation(null); setLocationError('');
      setIsMapOpen(false);
      setSubmitted(false);
      setSubmitOrderError('');
      setSubmitOrderBusy(false);
      setOrgExpanded(false);
      setRulesSheetOpen(false);
      setStoreRulesText(null);
      setMainBranchPayment(null);
      setMainBranchOrigin(null);
      setCustomerRegisterDb(null);
      setPaymentDisplayError('');
      handledDeliveryCancelNonceRef.current = deliveryUiCancelNonce;
      void fetchStore();
      void fetchPaymentDisplayContext();
      // Auto-focus phone field after the slide-up animation completes
      const focusTimer = setTimeout(() => phoneInputRef.current?.focus(), 420);
      return () => clearTimeout(focusTimer);
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 380);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setCustomerRegisterDb(null);
    if (!isLoggedIn) return;
    let cancelled = false;
    void (async () => {
      try {
        const gid = customerGoogleId?.trim() ?? '';
        if (gid) {
          const s = await fetchCustomerProfileByGoogleId(gid);
          if (!cancelled) {
            const r = s.register?.trim() ?? '';
            setCustomerRegisterDb(r.length > 0 ? r : null);
          }
          return;
        }
        if (customerPhone != null && Number.isFinite(customerPhone) && customerPhone > 0) {
          const s = await fetchCustomerProfileByPhone(customerPhone);
          if (!cancelled) {
            const r = s.register?.trim() ?? '';
            setCustomerRegisterDb(r.length > 0 ? r : null);
          }
        }
      } catch {
        if (!cancelled) setCustomerRegisterDb(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, isLoggedIn, customerGoogleId, customerPhone]);

  /** stores.has_delivery — «Хүргүүлнэ» зөвшөөрөл, сагсанд service мөр байвал автомат сонголт */
  useEffect(() => {
    if (!isOpen || !store) return;
    if (!isStoreDeliveryEnabled(store)) {
      setDeliveryType((prev) => {
        if (prev !== 'delivery') return prev;
        setLocation(null);
        setLocationError('');
        onSyncDeliveryServiceLine?.(null);
        return 'pickup';
      });
      return;
    }
    const hasServiceLine = items.some(
      (i) => i.cartItemId === DELIVERY_SERVICE_CART_ITEM_ID || i.product.is_service === true,
    );
    if (hasServiceLine) {
      setDeliveryType((prev) => (prev === 'pickup' ? 'delivery' : prev));
    }
  }, [isOpen, store, items, onSyncDeliveryServiceLine]);

  /** Ачилт > 0.15 бол «Такси»-г болиулж pickup руу */
  useEffect(() => {
    if (!isOpen) return;
    if (cartLoadingCoeffSum <= TAXI_MAX_LOADING_SUM) return;
    setDeliveryType((prev) => (prev === 'taxi' ? 'pickup' : prev));
  }, [isOpen, cartLoadingCoeffSum]);

  // Body scroll lock
  useEffect(() => {
    if (isOpen) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top      = `-${scrollY}px`;
      document.body.style.width    = '100%';
    } else {
      const scrollY = Math.abs(parseInt(document.body.style.top || '0', 10));
      document.body.style.position = '';
      document.body.style.top      = '';
      document.body.style.width    = '';
      window.scrollTo(0, scrollY);
    }
    return () => {
      document.body.style.position = '';
      document.body.style.top      = '';
      document.body.style.width    = '';
    };
  }, [isOpen]);

  /** Нэвтэрсэн харилцагчийн сүүлийн хүргэлтийн байршил (`sales`) */
  useEffect(() => {
    if (!isOpen || !isLoggedIn) {
      setLastDeliveryLocation(null);
      setLastDeliveryLoading(false);
      return;
    }
    let cancelled = false;
    setLastDeliveryLoading(true);
    void fetchLastDeliveryLocationFromSales({
      isLoggedIn: true,
      phone: customerPhone,
      googleId: customerGoogleId,
    })
      .then((loc) => {
        if (!cancelled) setLastDeliveryLocation(loc);
      })
      .catch(() => {
        if (!cancelled) setLastDeliveryLocation(null);
      })
      .finally(() => {
        if (!cancelled) setLastDeliveryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, isLoggedIn, customerPhone, customerGoogleId]);

  // ── Validation helpers ─────────────────────────────────────────────────
  function validatePhone(val: string) {
    if (!val.trim()) return 'Утасны дугаар оруулна уу.';
    if (!/^\d{8}$/.test(val.replace(/\s/g, ''))) return '8 оронтой дугаар оруулна уу.';
    return '';
  }

  function handlePhoneChange(val: string) {
    const digits = val.replace(/\D/g, '').slice(0, 8);
    setPhone(digits);
    if (phoneTouched) setPhoneError(validatePhone(digits));
  }

  function handlePhoneBlur() {
    setPhoneTouched(true);
    setPhoneError(validatePhone(phone));
  }

  // ── Geolocation ──────────────────────────────────────────────────────────
  function handleGeolocate() {
    if (!navigator.geolocation) {
      setLocationError('Таны төхөөрөмж байршил тодохойлохыг дэмждэггүй.');
      return;
    }
    setIsLocating(true);
    setLocationError('');
    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude: lat, longitude: lng } }) => {
        void (async () => {
          try {
            const address = await reverseGeocodeLatLng(lat, lng);
            setLocation({ lat, lng, address });
          } catch {
            setLocation({ lat, lng, address: `${lat.toFixed(5)}, ${lng.toFixed(5)}` });
          } finally {
            setIsLocating(false);
          }
        })();
      },
      () => {
        setLocationError('Байршил тодорхойлж чадсангүй. Дахин оролдоно уу.');
        setIsLocating(false);
      },
      { timeout: 10_000 },
    );
  }

  function handleLastDeliveryLocation() {
    if (!lastDeliveryLocation) return;
    setLocationError('');
    const { lat, lng, address } = lastDeliveryLocation;
    if (looksLikeCoordinateAddress(address)) {
      setIsLocating(true);
      void reverseGeocodeLatLng(lat, lng)
        .then((resolved) => setLocation({ lat, lng, address: resolved }))
        .catch(() => setLocation(lastDeliveryLocation))
        .finally(() => setIsLocating(false));
      return;
    }
    setLocation(lastDeliveryLocation);
  }

  const lastDeliveryOptionEnabled = isLoggedIn && lastDeliveryLocation != null && !lastDeliveryLoading;

  const deliveryOptionEnabled = !isLoadingStore && isStoreDeliveryEnabled(store);

  function handleDeliveryChange(val: DeliveryType) {
    if (val === 'delivery' && !deliveryOptionEnabled) return;
    if (val === 'taxi' && !taxiOptionEnabled) return;
    setDeliveryType(val);
    if (val !== 'delivery') {
      setLocation(null); setLocationError('');
      onSyncDeliveryServiceLine?.(null);
    }
  }

  // ── Step navigation ────────────��─────────────────────────────────────────
  function handleStep1Next() {
    const err = validatePhone(phone);
    setPhoneTouched(true);
    setPhoneError(err);
    if (err) return;
    goToStep(2);
  }

  function handleStep2Next() {
    if (deliveryType === 'delivery') {
      if (!location) {
        setLocationError('Хүргэлтийн байршил сонгоно уу.');
        return;
      }
      if (!deliveryServiceTemplate) {
        setLocationError('Хүргэлтийн барааны мэдээлэл ачаалагдаагүй байна.');
        return;
      }
      if (!isFreeDelivery && (!mainBranchRoute || !store)) {
        setLocationError('Хүргэлтийн тооцоо бэлэн биш байна.');
        return;
      }
      const item = buildDeliveryServiceCartItem(
        deliveryServiceTemplate,
        transportFeePerCar,
        deliveryCarCount,
      );
      onSyncDeliveryServiceLine?.(item);
    } else {
      onSyncDeliveryServiceLine?.(null);
    }
    setLocationError('');
    goToStep(3);
  }

  async function handleSubmit() {
    setSubmitOrderError('');
    const pErr = validatePhone(phone);
    if (pErr) {
      setPhoneTouched(true);
      setPhoneError(pErr);
      setSubmitOrderError(pErr);
      return;
    }
    const sidNow = items.find((i) => !i.product.is_service)?.product?.store_id ?? items[0]?.product?.store_id ?? null;
    if (sidNow == null || String(sidNow).trim() === '') {
      setSubmitOrderError(
        'Дэлгүүрийн мэдээлэл олдсонгүй. Сагсандаа бараа нэмээд дахин оролдоно уу.',
      );
      return;
    }

    const stockViolations = findCartStockViolations(items);
    if (stockViolations.length > 0) {
      setSubmitOrderError(formatCartStockViolationMessage(stockViolations));
      return;
    }

    setSubmitOrderBusy(true);
    try {
      const customerId = await resolveCustomerIdForOnlineOrder({
        isLoggedIn,
        phone: customerPhone ?? null,
        googleId: customerGoogleId ?? null,
      });
      const phoneNum = phoneToInt64(phone);
      if (Number.isNaN(phoneNum)) {
        throw new Error('Утасны дугаар тохируулахад алдаа гарлаа.');
      }
      const lat =
        deliveryType === 'delivery' && location?.lat != null && Number.isFinite(location.lat)
          ? location.lat
          : null;
      const lng =
        deliveryType === 'delivery' && location?.lng != null && Number.isFinite(location.lng)
          ? location.lng
          : null;

      const orgT = orgName.trim();
      const regT = register.trim();
      const noteT = note.trim();

      const rows = cartItemsToOnlineOrderRows({
        items,
        fallbackStoreId: String(sidNow).trim(),
        customerId,
        ecommercePhone: phoneNum,
        ecommerceName: orgT.length > 0 ? orgT : null,
        ecommerceRegister: regT.length > 0 ? regT.toUpperCase() : null,
        noteTrimmed: noteT.length > 0 ? noteT : null,
        deliveryType,
        locationLat: lat,
        locationLng: lng,
      });
      if (rows.length === 0) {
        throw new Error('Илгээх захиалгын мөр олдсонгүй.');
      }

      await bulkInsertOnlineOrders(rows);
      setSubmitted(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Захиалга илгээхэд алдаа гарлаа.';
      setSubmitOrderError(msg);
      console.error('online_orders insert:', e);
    } finally {
      setSubmitOrderBusy(false);
    }
  }

  const isLoading = isLoadingStore || isLoadingPaymentDisplay;

  function dismissCheckout() {
    if (submitted) {
      onOrderSuccessClose?.();
    }
    onClose();
  }

  function retryDeliveryPricingData() {
    void fetchStore();
    void fetchPaymentDisplayContext();
  }

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-[140] flex items-end justify-center md:items-center">

      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-350"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={dismissCheckout}
      />

      {/* Sheet */}
      <div
        className="relative w-full max-w-[375px] md:max-w-[480px] lg:max-w-[560px] bg-white rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col"
        style={{
          maxHeight: '95vh',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.38s cubic-bezier(0.32,0.72,0,1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle — mobile only */}
        <div className="flex justify-center pt-3 pb-1 shrink-0 md:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            {/* Back arrow on steps 2 & 3 (when not submitted) */}
            {!submitted && step > 1 && (
              <button
                onClick={() => goToStep((step - 1) as WizardStep)}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              </button>
            )}
            <h2 className="text-base font-semibold text-gray-900">
              {submitted ? 'Захиалга' : STEP_LABELS[step]}
            </h2>
            {isLoading && !submitted && (
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
            )}
          </div>
          <button
            onClick={dismissCheckout}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Progress indicator (hidden when submitted) */}
        {!submitted && (
          <div className="shrink-0 px-5 pt-4 pb-3">
            <WizardProgress currentStep={step} />
          </div>
        )}

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div
            style={{
              opacity:    stepVisible ? 1 : 0,
              transform:  stepVisible ? 'translateY(0)' : 'translateY(6px)',
              transition: 'opacity 0.16s ease, transform 0.16s ease',
            }}
          >
            {submitted ? (
              /* ── Success screen ──────────────────────────────────────── */
              <div className="flex flex-col items-center justify-center gap-4 py-16 px-6 text-center">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                </div>
                <p className="text-base font-semibold text-gray-900">Захиалга илгээгдлээ!</p>
                <p className="text-sm text-gray-500 leading-relaxed">
                  Таны захиалгыг хүлээж авлаа.<br />Удахгүй холбоо барина.
                </p>
                <button
                  onClick={dismissCheckout}
                  className="mt-2 px-8 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
                >
                  Хаах
                </button>
              </div>

            ) : step === 1 ? (
              /* ═════════════════════════════════════════════════════════
                 STEP 1 — ХҮЛЭЭН АВАХ
              ══════════════════════════════════════════════════════════ */
              <div className="px-5 pt-2 pb-6 space-y-4">

                {/* Phone */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Утасны дугаар <span className="text-red-500">*</span>
                  </label>
                  <div className={`flex items-center gap-2.5 border rounded-xl px-3.5 py-3 transition-colors ${
                    phoneError
                      ? 'border-red-400 bg-red-50'
                      : 'border-gray-200 bg-gray-50 focus-within:border-blue-500 focus-within:bg-white'
                  }`}>
                    <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                    <input
                      type="tel" inputMode="numeric" placeholder="9900 0000"
                      ref={phoneInputRef}
                      value={phone}
                      onChange={e => handlePhoneChange(e.target.value)}
                      onBlur={handlePhoneBlur}
                      className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
                    />
                  </div>
                  {phoneError && (
                    <p className="flex items-center gap-1 text-xs text-red-500 mt-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      {phoneError}
                    </p>
                  )}
                </div>

                {/* "Байгууллага бол..." collapsible */}
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOrgExpanded(v => !v)}
                    className="w-full flex items-center justify-between px-3.5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-gray-400" />
                      <span className="text-xs font-medium text-gray-600">Байгууллага бол...</span>
                    </div>
                    <ChevronDown
                      className="w-4 h-4 text-gray-400 transition-transform duration-200"
                      style={{ transform: orgExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                    />
                  </button>

                  <div
                    style={{
                      maxHeight: orgExpanded ? '220px' : '0px',
                      overflow:  'hidden',
                      transition: 'max-height 0.18s cubic-bezier(0.4,0,0.2,1)',
                    }}
                  >
                    <div className="px-3.5 pt-3 pb-4 space-y-3 bg-white">
                      {/* Org name */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">
                          Байгууллагын нэр
                        </label>
                        <div className="flex items-center gap-2.5 border border-gray-200 bg-gray-50 focus-within:border-blue-500 focus-within:bg-white rounded-xl px-3.5 py-3 transition-colors">
                          <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
                          <input
                            type="text" placeholder="Компанийн нэр"
                            value={orgName} onChange={e => setOrgName(e.target.value)}
                            className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
                          />
                        </div>
                      </div>
                      {/* Register */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">
                          Регистер
                        </label>
                        <div className="flex items-center gap-2.5 border border-gray-200 bg-gray-50 focus-within:border-blue-500 focus-within:bg-white rounded-xl px-3.5 py-3 transition-colors">
                          <Hash className="w-4 h-4 text-gray-400 shrink-0" />
                          <input
                            type="text" placeholder="АА00000000"
                            value={register} onChange={e => setRegister(e.target.value.toUpperCase())}
                            className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Note */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Тэмдэглэл <span className="text-gray-400 text-[10px] ml-1">(заавал биш)</span>
                  </label>
                  <div className="flex items-start gap-2.5 border border-gray-200 bg-gray-50 focus-within:border-blue-500 focus-within:bg-white rounded-xl px-3.5 py-3 transition-colors">
                    <FileText className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                    <textarea
                      rows={2} placeholder="Дараа санахын тулд хаана юунд авсан г.м та энд тэмдэглэж болно"
                      value={note} onChange={e => setNote(e.target.value)}
                      className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none resize-none"
                    />
                  </div>
                </div>
              </div>

            ) : step === 2 ? (
              /* ══════════════════════════════════════════════════════════
                 STEP 2 — ХҮРГЭЛТ
              ══════════════════════════════════════════════════════════ */
              <div className="px-5 pt-2 pb-6 space-y-3">

                {/* Error banners — shown only here where delivery data matters */}
                {(paymentDisplayError || storeError) && (
                  <div className="space-y-2">
                    {paymentDisplayError && (
                      <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
                        <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                        <p className="flex-1 text-xs text-red-600 leading-snug">{paymentDisplayError}</p>
                        <button type="button" onClick={() => void fetchPaymentDisplayContext()} className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-red-500 hover:text-red-700">
                          <RefreshCw className="w-3 h-3" /> Retry
                        </button>
                      </div>
                    )}
                    {storeError && (
                      <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
                        <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                        <p className="flex-1 text-xs text-red-600 leading-snug">{storeError}</p>
                        <button type="button" onClick={() => void fetchStore()} className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-red-500 hover:text-red-700">
                          <RefreshCw className="w-3 h-3" /> Retry
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Delivery type cards */}
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      {
                        value: 'pickup' as const,
                        label: 'Очиж авах',
                        sub:   'Та дэлгүүрээс авна',
                        icon:  <Store className="w-4 h-4" />,
                        badge: <span className="text-[10px] font-bold text-green-600">Үнэгүй</span>,
                      },
                      {
                        value: 'taxi' as const,
                        label: 'Такси',
                        sub:   'Та такси төлнө',
                        icon:  <Truck className="w-4 h-4" />,
                        badge: <span className="text-[10px] font-bold text-green-600">Үнэгүй</span>,
                      },
                      {
                        value: 'delivery' as const,
                        label: 'Хүргүүлнэ',
                        sub: (
                          <>
                            Маргааш нь хүргэнэ
                            <br />
                            ( Даваа-д амарна )
                          </>
                        ),
                        icon:  <MapPin className="w-4 h-4" />,
                        badge:
                          isLoadingStore || isLoadingPaymentDisplay ? (
                            <Loader2 className="w-3 h-3 animate-spin text-gray-300" />
                          ) : (
                            <span className="text-[10px] font-bold text-green-600">км тооцно</span>
                          ),
                      },
                    ] as const
                  ).map(({ value, label, sub, icon, badge }) => {
                    const isDeliveryOption = value === 'delivery';
                    const isTaxiOption = value === 'taxi';
                    const optionDisabled =
                      (isTaxiOption && !taxiOptionEnabled) ||
                      (isDeliveryOption && !deliveryOptionEnabled);
                    const disabledSub = isTaxiOption && !taxiOptionEnabled
                      ? 'Таксинд ачих дээд хэмжээнээс хэтэрсэн'
                      : isDeliveryOption && !deliveryOptionEnabled
                        ? 'Энэ дэлгүүрт идэвхгүй'
                        : sub;
                    return (
                    <button
                      key={value}
                      type="button"
                      disabled={optionDisabled}
                      onClick={() => handleDeliveryChange(value)}
                      className={`flex flex-col items-start gap-2 p-3 rounded-xl border text-left transition-colors ${
                        optionDisabled
                          ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                          : deliveryType === value
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                      }`}
                    >
                      <div className={
                        optionDisabled
                          ? 'text-gray-300'
                          : deliveryType === value
                            ? 'text-blue-600'
                            : 'text-gray-400'
                      }>
                        {icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold leading-tight ${
                          optionDisabled
                            ? 'text-gray-400'
                            : deliveryType === value
                              ? 'text-blue-700'
                              : 'text-gray-700'
                        }`}>
                          {label}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">
                          {disabledSub}
                        </p>
                      </div>
                      {badge}
                    </button>
                    );
                  })}
                </div>

                {/* Очиж авах info */}
                {deliveryType === 'pickup' && (
                  <div className="flex items-start gap-2.5 bg-green-50 border border-green-200 rounded-xl px-3.5 py-3">
                    <Store className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-green-700 leading-relaxed">Дэгүүрээс өөрөө авна</p>
                  </div>
                )}

                {/* Такси info */}
                {deliveryType === 'taxi' && (
                  <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3">
                    <Truck className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 leading-relaxed">Таксины төлбөрийг жолоочид төлнө</p>
                  </div>
                )}

                {/* Хүргүүлнэ — free threshold progress */}
                {deliveryType === 'delivery' && store && store.free_delivery_threshold > 0 && (
                  <FreeDeliveryProgress
                    cartTotal={merchandiseTotal}
                    threshold={store.free_delivery_threshold}
                    isFree={isFreeDelivery}
                  />
                )}

                {/* Хүргүүлнэ — location picker */}
                {deliveryType === 'delivery' && (
                  <div className="space-y-2.5">
                    <p className="text-xs font-medium text-gray-600">Хүргэлтийн байршил</p>

                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setIsMapOpen(true)}
                        className="flex items-center justify-center gap-1.5 w-full border border-gray-200 bg-gray-50 hover:bg-gray-100 active:opacity-70 rounded-xl px-2.5 py-2.5 transition-colors"
                      >
                        <Map className="w-4 h-4 text-gray-500 shrink-0" />
                        <span className="text-xs text-gray-700 font-medium text-center leading-tight">
                          Google map
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={handleGeolocate}
                        disabled={isLocating}
                        className="flex items-center justify-center gap-1.5 w-full border border-blue-200 bg-blue-50 hover:bg-blue-100 active:opacity-70 rounded-xl px-2.5 py-2.5 transition-colors disabled:opacity-50"
                      >
                        <Navigation className={`w-4 h-4 text-blue-600 shrink-0 ${isLocating ? 'animate-pulse' : ''}`} />
                        <span className="text-xs font-medium text-blue-700 text-center leading-tight">
                          {isLocating ? 'Тодорхойлж…' : 'Миний байршил'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={handleLastDeliveryLocation}
                        disabled={!lastDeliveryOptionEnabled || isLocating}
                        className={`flex items-center justify-center gap-1.5 w-full border rounded-xl px-2.5 py-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          lastDeliveryOptionEnabled
                            ? 'border-violet-200 bg-violet-50 hover:bg-violet-100 active:opacity-70'
                            : 'border-gray-200 bg-gray-50'
                        }`}
                      >
                        {lastDeliveryLoading ? (
                          <Loader2 className="w-4 h-4 text-gray-400 shrink-0 animate-spin" />
                        ) : (
                          <History className={`w-4 h-4 shrink-0 ${lastDeliveryOptionEnabled ? 'text-violet-600' : 'text-gray-300'}`} />
                        )}
                        <span
                          className={`text-xs font-medium text-center leading-tight ${
                            lastDeliveryOptionEnabled ? 'text-violet-700' : 'text-gray-400'
                          }`}
                        >
                          {lastDeliveryLoading ? 'Шалгаж…' : 'Сүүлд хүргэсэн байршил'}
                        </span>
                      </button>
                    </div>

                    {location ? (
                      <div className="flex items-start gap-2.5 bg-green-50 border border-green-200 rounded-xl px-3.5 py-3">
                        <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-green-700 mb-0.5">Байршил сонголоо</p>
                          <p className="text-sm text-green-800 leading-snug">{location.address}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsMapOpen(true)}
                          className="shrink-0 text-[10px] font-semibold text-green-600 bg-green-100 hover:bg-green-200 rounded-lg px-2 py-1 transition-colors"
                        >
                          Өөрчлөх
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-dashed border-amber-300 bg-amber-50">
                        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                        <p className="text-xs text-amber-600 font-medium">Байршил сонгоно уу</p>
                      </div>
                    )}

                    {locationError && (
                      <p className="flex items-center gap-1 text-xs text-red-500">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        {locationError}
                      </p>
                    )}

                    <DeliveryChargeSummaryCard
                      location={location}
                      isLoading={isLoading}
                      dataError={paymentDisplayError || storeError}
                      hasMainBranchGeo={mainBranchOrigin != null}
                      store={store}
                      transportFeePerCar={transportFeePerCar}
                      carCount={deliveryCarCount}
                      totalDelivery={totalDeliveryCharge}
                      isFreeDelivery={isFreeDelivery}
                      onRetry={retryDeliveryPricingData}
                    />
                  </div>
                )}
              </div>

            ) : (
              /* ══════════════════════════════════════════════════════════
                 STEP 3 — ТӨЛБӨР
              ══════════════════════════════════════════════════════════ */
              <div className="px-5 pt-2 pb-6 space-y-4">

                {paymentDisplayError && (
                  <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5">
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                    <p className="text-xs text-amber-800 leading-snug">{paymentDisplayError}</p>
                  </div>
                )}

                {submitOrderError && (
                  <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="flex-1 text-xs text-red-700 leading-snug">{submitOrderError}</p>
                  </div>
                )}

                {isLoadingPaymentDisplay && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    Төлбөрийн мэдээлэл ачаалж байна…
                  </div>
                )}

                {/* Contact message */}
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3.5 space-y-3">
                  <p className="text-sm text-gray-700 leading-relaxed">
                    Захиалга өгсөнд баярлалаа. Танд асуух зүйл эсвэл захиалгаа илгээж, доорх дансаар төлбөрөө төлсөн бол утсаар холбогдоорой.
                  </p>
                  {paymentBankDetails.mainPhoneDigits ? (
                    <a
                      href={`tel:${paymentBankDetails.mainPhoneDigits}`}
                      className="flex items-center justify-center gap-2 w-full bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold py-3 rounded-xl transition-colors shadow-sm"
                    >
                      <Phone className="w-4 h-4" />
                      Залгах {formatPhoneForDisplay(paymentBankDetails.mainPhoneDigits)}
                    </a>
                  ) : (
                    <p className="text-xs text-center text-gray-500">
                      Гол салбарын утас тохируулаагүй байна.
                    </p>
                  )}
                </div>

                {/* Bank details — гол салбарын бодит данс */}
                <PaymentInfoCard
                  bankName={paymentBankDetails.bankName}
                  accountHolder={paymentBankDetails.accountHolder}
                  accountNumber={paymentBankDetails.accountNumber}
                  transferNote={buildOnlineTransferNote(
                    new Date().toISOString(),
                    onlineTransferIdentifier,
                  )}
                  showTransferWarning={!onlineTransferIdentifier}
                  totalAmount={finalTotal}
                  onCopyTotal={handleCopyTotal}
                  copiedTotal={copiedTotal}
                />
              </div>
            )}
          </div>
        </div>

        {/* ── Sticky footer — step-specific buttons (hidden when submitted) ──── */}
        {!submitted && (
          <div className="shrink-0 border-t border-gray-100 px-5 pt-3 pb-6 bg-white">
            {step === 1 && (
              <button
                onClick={handleStep1Next}
                className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800
                           text-white text-sm font-semibold py-3.5 rounded-xl
                           transition-colors shadow-sm"
              >
                Хүргэлт сонгох
              </button>
            )}

            {step === 2 && (
              <div className="flex gap-3">
                <button
                  onClick={() => goToStep(1)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 active:bg-gray-300
                             text-gray-700 text-sm font-semibold py-3.5 rounded-xl
                             transition-colors"
                >
                  Буцах
                </button>
                <button
                  onClick={handleStep2Next}
                  className="flex-[2] bg-blue-600 hover:bg-blue-700 active:bg-blue-800
                             text-white text-sm font-semibold py-3.5 rounded-xl
                             transition-colors shadow-sm"
                >
                  Төлбөр төлөх
                </button>
              </div>
            )}

            {step === 3 && (
              <div className="flex flex-col gap-2.5">
                {/* Terms text button — left-aligned, above action buttons */}
                <button
                  type="button"
                  className="self-start bg-transparent border-0 p-0 text-blue-600
                             cursor-pointer hover:underline"
                  style={{ fontSize: 13 }}
                  onClick={() => setRulesSheetOpen(true)}
                >
                  Үйлчилгээний журам
                </button>

                <div className="flex gap-3">
                  <button
                    onClick={() => goToStep(2)}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 active:bg-gray-300
                               text-gray-700 text-sm font-semibold py-3.5 rounded-xl
                               transition-colors"
                  >
                    Буцах
                  </button>
                  <button
                    type="button"
                    disabled={submitOrderBusy}
                    onClick={() => { void handleSubmit(); }}
                    className={`flex-[2] flex items-center justify-center gap-2 text-sm font-semibold py-3.5 rounded-xl
                               transition-colors shadow-sm ${submitOrderBusy
                      ? 'bg-blue-400 text-white cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white'
                    }`}
                  >
                    {submitOrderBusy && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                    {submitOrderBusy ? 'Илгээж байна…' : 'Захиалга илгээх'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Үйлчилгээний журам — stores.store_rules */}
      {rulesSheetOpen && (
        <div className="fixed inset-0 z-[190] flex items-end md:items-center justify-center md:p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
            aria-label="Хаах"
            onClick={() => setRulesSheetOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md max-h-[min(85vh,560px)] md:rounded-2xl rounded-t-2xl bg-white shadow-2xl flex flex-col md:mt-0 mt-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
              <h3 className="text-sm font-semibold text-gray-900">Үйлчилгээний журам</h3>
              <button
                type="button"
                onClick={() => setRulesSheetOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {storeRulesText?.trim()
                  ? storeRulesText
                  : 'Агуулга тохируулаагүй байна. (stores.store_rules)'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Map picker — z-[160] floats above checkout z-[140] */}
      <MapPickerModal
        isOpen={isMapOpen}
        onClose={() => setIsMapOpen(false)}
        onConfirm={(picked: PickedLocation) => {
          void (async () => {
            let address = picked.address?.trim() ?? '';
            if (!address || looksLikeCoordinateAddress(address)) {
              address = await reverseGeocodeLatLng(picked.lat, picked.lng);
            }
            setLocation({ lat: picked.lat, lng: picked.lng, address });
            setLocationError('');
          })();
        }}
        initialLat={location?.lat ?? null}
        initialLng={location?.lng ?? null}
      />
    </div>
  );
}

// ─── Wizard progress indicator ────────────────────────────────────────────────
function WizardProgress({ currentStep }: { currentStep: WizardStep }) {
  const steps: { id: WizardStep; label: string }[] = [
    { id: 1, label: 'Хүлээн авах' },
    { id: 2, label: 'Хүргэлт' },
    { id: 3, label: 'Төлбөр' },
  ];

  return (
    <div className="flex items-center">
      {steps.map(({ id, label }, idx) => {
        const isCompleted = currentStep > id;
        const isActive    = currentStep === id;

        return (
          <div key={id} className="flex items-center flex-1 last:flex-none">
            {/* Circle + label */}
            <div className="flex flex-col items-center gap-1 min-w-0">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all duration-200 ${
                isCompleted
                  ? 'bg-blue-600 text-white'
                  : isActive
                  ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                  : 'bg-gray-100 text-gray-400'
              }`}>
                {isCompleted
                  ? <CheckCircle2 className="w-4 h-4" />
                  : id}
              </div>
              <span className={`text-[10px] font-medium leading-tight text-center transition-colors duration-200 ${
                isActive    ? 'text-blue-700' :
                isCompleted ? 'text-blue-500' : 'text-gray-400'
              }`}>
                {label}
              </span>
            </div>

            {/* Connector line (not after last step) */}
            {idx < steps.length - 1 && (
              <div className="flex-1 h-px mx-1.5 mb-4 transition-colors duration-200"
                style={{ backgroundColor: currentStep > id ? '#2563eb' : '#e5e7eb' }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Free delivery progress bar ���──────────────────────────────────────────────
function FreeDeliveryProgress({
  cartTotal, threshold, isFree,
}: {
  cartTotal: number;
  threshold: number;
  isFree:    boolean;
}) {
  const progressPercent = Math.min((cartTotal / threshold) * 100, 100);
  const remaining       = Math.max(threshold - cartTotal, 0);

  if (isFree) {
    return (
      <div className="flex items-center gap-2.5 bg-green-50 border border-green-200 rounded-xl px-3.5 py-3">
        <span className="text-base leading-none select-none">🎉</span>
        <p className="text-xs font-semibold text-green-700">Та үнэгүй хүргэлт авлаа!</p>
      </div>
    );
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl px-3.5 py-3 space-y-2">
      <p className="text-xs font-medium text-blue-700">
        Үнэгүй хүргэлт авахад{' '}
        <span className="font-bold">{remaining.toLocaleString()}₮</span>{' '}
        дутуу байна
      </p>
      <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-blue-600 transition-all duration-500 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-blue-400">₮{cartTotal.toLocaleString()}</span>
        <span className="text-[10px] text-blue-400">₮{threshold.toLocaleString()}</span>
      </div>
    </div>
  );
}

// ─── Хүргэлтийн төлбөрийн товч хураангуй (нэг машин, машины тоо, нийт) ─────
interface DeliveryChargeSummaryCardProps {
  location:             GeoLocation | null;
  isLoading:            boolean;
  dataError:            string;
  hasMainBranchGeo:     boolean;
  store:                StoreConfig | null;
  transportFeePerCar:   number;
  carCount:             number;
  totalDelivery:        number;
  isFreeDelivery:       boolean;
  onRetry:              () => void;
}

function DeliveryChargeSummaryCard({
  location,
  isLoading,
  dataError,
  hasMainBranchGeo,
  store,
  transportFeePerCar,
  carCount,
  totalDelivery,
  isFreeDelivery,
  onRetry,
}: DeliveryChargeSummaryCardProps) {
  if (!location) return null;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2.5 bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-3">
        <Loader2 className="w-4 h-4 text-gray-400 animate-spin shrink-0" />
        <p className="text-xs text-gray-400">Тооцоолж байна…</p>
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
        <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
        <p className="flex-1 text-xs text-red-600">Мэдээлэл ачаалагдсангүй</p>
        <button type="button" onClick={onRetry} className="text-[11px] font-semibold text-red-500 hover:text-red-700 flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Retry
        </button>
      </div>
    );
  }

  if (!store || !hasMainBranchGeo) {
    return (
      <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5">
        <Store className="w-4 h-4 text-gray-300 shrink-0" />
        <p className="text-xs text-gray-400">Гол салбарын байршил эсвэл дэлгүүрийн тохиргоо олдсонгүй</p>
      </div>
    );
  }

  if (isFreeDelivery) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl px-3.5 py-3 space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-green-700">Тээврийн хөлс</span>
          <span className="font-semibold text-green-800">Үнэгүй</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-green-700">Машины тоо</span>
          <span className="font-semibold text-green-900">{carCount}</span>
        </div>
        <div className="flex justify-between text-xs pt-1 border-t border-green-200">
          <span className="font-semibold text-green-800">Нийт хүргэлт</span>
          <span className="font-bold text-green-900">₮0</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl px-3.5 py-3 space-y-2">
      <div className="flex justify-between text-xs">
        <span className="text-blue-700">Тээврийн хөлс</span>
        <span className="font-semibold text-blue-900">₮{transportFeePerCar.toLocaleString()}</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-blue-700">Машины тоо</span>
        <span className="font-semibold text-blue-900">{carCount}</span>
      </div>
      <div className="flex justify-between text-xs pt-1 border-t border-blue-200">
        <span className="font-semibold text-blue-800">Нийт хүргэлт</span>
        <span className="font-bold text-blue-900">₮{totalDelivery.toLocaleString()}</span>
      </div>
    </div>
  );
}