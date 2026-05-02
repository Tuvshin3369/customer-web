import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { X, Plus, Minus, ShoppingCart, Ruler, Maximize2, Palette, FileText } from 'lucide-react';
import { Product, ProductType, CartItem, CartItemConfig } from '../types';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { getBasePrice, calculateTotal } from '../utils/priceCalc';
import { findFoamTierForArea } from '../utils/foamRange';
import {
  fetchGroupNumberByGroupId,
  fetchCodedPaintByExactCode,
  resolvePaintCatalogProductForCode,
  searchCodedPaintsContaining,
  type CodedPaintSuggestionRow,
  type CodedPaintRgb,
} from '../utils/codedPaintPricing';
import { ProductGallery } from './ProductGallery';
import { ProductManualSheet } from './ProductManualSheet';

interface ProductConfigModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (item: CartItem) => void;
  /** Кодоор бараа солих REST дуудлага */
  storeId?: string | null;
  brandId?: string;
  onlineDiscountPercent?: number;
}

/** is_foam_range: өргөний санал — өндөр × ratio */
function formatSuggestedWidthCm(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  const x = Math.round(n * 100) / 100;
  return Number.isInteger(x) ? String(x) : x.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

// ─── Shared numeric input row (+ / - + keyboard) ─────────────────────────────
interface QtyInputProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}

function QtyInput({ value, onChange, min = 1, max = 99999 }: QtyInputProps) {
  const [raw, setRaw] = useState(String(value));

  // Keep raw in sync when parent resets
  useEffect(() => { setRaw(String(value)); }, [value]);

  function commit(str: string) {
    const parsed = parseInt(str, 10);
    if (!isNaN(parsed)) {
      onChange(Math.min(max, Math.max(min, parsed)));
    } else {
      setRaw(String(value)); // revert to last good value
    }
  }

  return (
    <div className="flex items-center gap-1.5 bg-gray-100 rounded-xl p-1">
      {/* Decrement */}
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-8 h-8 flex items-center justify-center rounded-lg bg-white shadow-sm text-gray-600 hover:text-red-500 hover:bg-red-50 transition-colors active:scale-90"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>

      {/* Editable number */}
      <input
        type="text"
        inputMode="numeric"
        value={raw}
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9]/g, '');
          setRaw(v);
          if (v !== '') {
            const n = parseInt(v, 10);
            if (!isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
          }
        }}
        onBlur={() => commit(raw)}
        onFocus={(e) => e.target.select()}
        className="w-14 text-center text-sm font-semibold text-gray-800 bg-transparent outline-none"
      />

      {/* Increment */}
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        className="w-8 h-8 flex items-center justify-center rounded-lg bg-white shadow-sm text-gray-600 hover:text-blue-600 hover:bg-blue-50 transition-colors active:scale-90"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── Numeric dimension input ────────────────────────────────────────────────
interface DimInputProps {
  label: string;
  unit?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  error?: string;
  icon?: React.ReactNode;
  placeholder?: string;
  focusRef?: React.RefObject<HTMLInputElement>;
}

function DimInput({
  label, unit = 'м', value, onChange,
  required, error, icon, placeholder = '0.00', focusRef,
}: DimInputProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
        {!required && <span className="text-gray-400 text-[10px] ml-1">(заавал биш)</span>}
      </label>
      <div
        className={`flex items-center gap-2.5 border rounded-xl px-3.5 py-3 transition-colors ${
          error
            ? 'border-red-400 bg-red-50'
            : 'border-gray-200 bg-gray-50 focus-within:border-blue-500 focus-within:bg-white'
        }`}
      >
        {icon && <span className="text-gray-400 shrink-0">{icon}</span>}
        <input
          ref={focusRef}
          type="text"
          inputMode="decimal"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
          className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
        />
        <span className="text-xs text-gray-400 shrink-0">{unit}</span>
      </div>
      {error && <p className="text-xs text-red-500 mt-1 pl-0.5">{error}</p>}
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────
export function ProductConfigModal({
  product,
  isOpen,
  onClose,
  onConfirm,
  storeId = null,
  brandId: brandIdProp,
  onlineDiscountPercent = 0,
}: ProductConfigModalProps) {
  const [mounted, setMounted]   = useState(false);
  const [visible, setVisible]   = useState(false);

  // ── Field state ─────────────────────────────────────────────────────────
  const [quantity,  setQuantity]  = useState(1);
  const [length,    setLength]    = useState('');
  const [height,    setHeight]    = useState('');
  const [width,     setWidth]     = useState('');
  const [colorCode, setColorCode] = useState('');
  /** is_foam_range: «Бодох»-оор — нэгж үнэ (1 ширхэг, ₮) */
  const [foamUnitPrice, setFoamUnitPrice] = useState<number | null>(null);
  const [foamTotalArea, setFoamTotalArea] = useState<number | null>(null);
  const [foamCalcError, setFoamCalcError] = useState<string | null>(null);

  // ── Refs for auto-focus ─────────────────────────────────────────────────
  const heightInputRef = useRef<HTMLInputElement>(null);
  const lengthInputRef = useRef<HTMLInputElement>(null);
  /** true бол өргөнийг гараар зассан — өндөр өөрчлөхөд автомат саналыг давтахгүй */
  const widthTouchedRef = useRef(false);
  const codeSuggestWrapRef = useRef<HTMLDivElement>(null);

  const [isManualSheetOpen, setIsManualSheetOpen] = useState(false);

  // ── Gallery state ──────────────────────────────────────────────────────
  const [isGalleryOpen,  setIsGalleryOpen]  = useState(false);
  const [galleryIndex,   setGalleryIndex]   = useState(0);
  // Holds whichever image set is currently open (parent or a child)
  const [galleryImages,  setGalleryImages]  = useState<string[]>([]);

  // ── Child product quantities (isParent products only) ────────────────────
  const [childQtys, setChildQtys] = useState<Record<number, number>>({});

  const [paintGroupNumber, setPaintGroupNumber] = useState<string | null>(null);
  const [codeSuggestions, setCodeSuggestions] = useState<CodedPaintSuggestionRow[]>([]);
  const [showCodeSuggestions, setShowCodeSuggestions] = useState(false);
  const [codeSuggestLoading, setCodeSuggestLoading] = useState(false);
  /** coded_paints r,g,b — урьдчилан харах дугуй */
  const [codedPaintPreviewRgb, setCodedPaintPreviewRgb] = useState<CodedPaintRgb | null>(null);
  /** Код ба groups.product_number зөрөх үед сагс / UI-д ашиглах бараа */
  const [resolvedPaintProduct, setResolvedPaintProduct] = useState<Product | null>(null);

  // ── Validation errors ───────────────────────────────────────────────────
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const type: ProductType = product?.is_coded_paint === true
    ? 4
    : product?.is_foam_range === true
      ? 3
      : product?.is_calculate_length === true
        ? 2
        : 1;

  const effectiveProduct = useMemo((): Product | null => {
    if (!product) return null;
    return resolvedPaintProduct ?? product;
  }, [product, resolvedPaintProduct]);

  const productForPricing = useMemo((): Product | null => {
    if (!effectiveProduct) return null;
    return { ...effectiveProduct, productType: type };
  }, [effectiveProduct, type]);

  const foamRatio = useMemo((): number | null => {
    if (!product || product.is_foam_range !== true) return null;
    const r = product.ratio;
    return typeof r === 'number' && r > 0 && Number.isFinite(r) ? r : null;
  }, [product]);

  // Derive image list — always at least the primary imageUrl (кодоор сольсон барааны зураг)
  const productImages = effectiveProduct
    ? (effectiveProduct.images && effectiveProduct.images.length > 0
        ? effectiveProduct.images
        : [effectiveProduct.imageUrl])
    : [];
  const imageTotal = productImages.length;

  // ── Animation lifecycle ─────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      // Reset form on every open
      setQuantity(1);
      setLength(''); setHeight(''); setWidth(''); setColorCode('');
      setFoamUnitPrice(null);
      setFoamTotalArea(null);
      setFoamCalcError(null);
      widthTouchedRef.current = false;
      setErrors({}); setTouched({});
      setIsManualSheetOpen(false);
      setGalleryIndex(0);
      setGalleryImages([]);
      setChildQtys({});
      setPaintGroupNumber(null);
      setCodeSuggestions([]);
      setShowCodeSuggestions(false);
      setCodeSuggestLoading(false);
      setResolvedPaintProduct(null);
      setCodedPaintPreviewRgb(null);
      const eff =
        product?.is_coded_paint === true
          ? 4
          : product?.is_foam_range === true
            ? 3
            : product?.is_calculate_length === true
              ? 2
              : 1;
      const focusTimer = setTimeout(() => {
        if (eff === 2) lengthInputRef.current?.focus();
        else if (eff === 3) heightInputRef.current?.focus();
      }, 420);
      return () => clearTimeout(focusTimer);
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 380);
      return () => clearTimeout(t);
    }
  }, [isOpen, product?.id]);

  // is_coded_paint: сонгосон барааны group_id → groups.group_number
  useEffect(() => {
    if (!isOpen || type !== 4 || product?.is_coded_paint !== true) {
      setPaintGroupNumber(null);
      return;
    }
    const gid = product.groupId?.trim();
    if (!gid) {
      setPaintGroupNumber(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
      if (!url || !key) {
        if (!cancelled) setPaintGroupNumber(null);
        return;
      }
      const gn = await fetchGroupNumberByGroupId(url, key, gid);
      if (!cancelled) setPaintGroupNumber(gn);
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, type, product?.is_coded_paint, product?.groupId]);

  // Code: coded_paints.color_code (ilike) + group_number
  useEffect(() => {
    if (!isOpen || type !== 4 || product?.is_coded_paint !== true) {
      setCodeSuggestions([]);
      setCodeSuggestLoading(false);
      return;
    }
    const needle = colorCode.trim();
    if (!needle || paintGroupNumber == null) {
      setCodeSuggestions([]);
      setCodeSuggestLoading(false);
      setShowCodeSuggestions(false);
      return;
    }

    let cancelled = false;
    setCodeSuggestLoading(true);
    const tm = window.setTimeout(() => {
      void (async () => {
        const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
        const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
        if (!url || !key) {
          if (!cancelled) {
            setCodeSuggestions([]);
            setCodeSuggestLoading(false);
          }
          return;
        }
        try {
          const rows = await searchCodedPaintsContaining(url, key, paintGroupNumber, needle);
          if (!cancelled) {
            setCodeSuggestions(rows);
            setShowCodeSuggestions(rows.length > 0);
          }
        } catch {
          if (!cancelled) {
            setCodeSuggestions([]);
            setShowCodeSuggestions(false);
          }
        } finally {
          if (!cancelled) setCodeSuggestLoading(false);
        }
      })();
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(tm);
    };
  }, [isOpen, type, product?.is_coded_paint, paintGroupNumber, colorCode]);

  const tryResolvePaintFromCode = useCallback(
    async (exactCode: string, itemNumberHint?: string | null) => {
      if (!product || type !== 4 || product.is_coded_paint !== true) return;
      const code = exactCode.trim();
      if (!code) {
        setResolvedPaintProduct(null);
        setCodedPaintPreviewRgb(null);
        return;
      }
      const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
      const sid = storeId != null ? String(storeId).trim() : '';
      if (!url || !key || !sid || paintGroupNumber == null) return;

      let itemNum =
        itemNumberHint != null && String(itemNumberHint).trim() ? String(itemNumberHint).trim() : '';
      if (!itemNum) {
        const meta = await fetchCodedPaintByExactCode(url, key, paintGroupNumber, code);
        if (!meta) {
          setResolvedPaintProduct(null);
          setCodedPaintPreviewRgb(null);
          return;
        }
        itemNum = meta.item_number;
        setCodedPaintPreviewRgb(meta.rgb);
      }

      try {
        const resolved = await resolvePaintCatalogProductForCode(url, key, {
          storeId: sid,
          brandId: brandIdProp ?? product.brandId,
          onlineDiscountPercent,
          anchorProduct: product,
          codedItemNumber: itemNum,
        });
        setResolvedPaintProduct(resolved);
      } catch {
        setResolvedPaintProduct(null);
      }
    },
    [product, type, paintGroupNumber, storeId, brandIdProp, onlineDiscountPercent],
  );

  useEffect(() => {
    if (resolvedPaintProduct) setChildQtys({});
  }, [resolvedPaintProduct]);

  useEffect(() => {
    if (!showCodeSuggestions) return;
    function onDoc(ev: MouseEvent) {
      const el = codeSuggestWrapRef.current;
      if (el && !el.contains(ev.target as Node)) setShowCodeSuggestions(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [showCodeSuggestions]);

  // Body scroll lock
  useEffect(() => {
    if (isOpen) {
      // Store current scroll position and freeze the page in place
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top      = `-${scrollY}px`;
      document.body.style.width    = '100%';
      document.body.classList.add('overflow-hidden');
    } else {
      // Restore scroll position exactly where the user left off
      const scrollY = Math.abs(parseInt(document.body.style.top || '0', 10));
      document.body.style.position = '';
      document.body.style.top      = '';
      document.body.style.width    = '';
      document.body.classList.remove('overflow-hidden');
      window.scrollTo(0, scrollY);
    }
    return () => {
      document.body.style.position = '';
      document.body.style.top      = '';
      document.body.style.width    = '';
      document.body.classList.remove('overflow-hidden');
    };
  }, [isOpen]);

  // ── Live validation ─────────────────────────────────────────────────────
  const validate = useCallback((): Record<string, string> => {
    const e: Record<string, string> = {};
    if (type === 2) {
      if (!length.trim() || parseFloat(length) <= 0)
        e.length = 'Уртыг оруулна уу.';
    }
    if (type === 3) {
      if (!height.trim() || parseFloat(height) <= 0)
        e.height = 'Өндрийг оруулна уу.';
      if (product?.is_foam_range === true) {
        if (foamUnitPrice == null || !Number.isFinite(foamUnitPrice)) {
          e.foam = '«Бодох» дарж нэгж үнэ тооцоолно уу.';
        }
      }
    }
    return e;
  }, [type, length, height, product?.is_foam_range, foamUnitPrice]);

  const currentErrors = useMemo(() => validate(), [validate]);
  const isValid = Object.keys(currentErrors).length === 0;

  function touch(field: string) {
    setTouched((p) => ({ ...p, [field]: true }));
  }

  // ── Whether any child variant is selected ────────────────────────────────
  const hasChildSelection = useMemo(
    () =>
      !!(
        !resolvedPaintProduct &&
        product?.isParent &&
        Object.values(childQtys).some((q) => q > 0)
      ),
    [resolvedPaintProduct, product, childQtys],
  );

  // ── Live parent price ──────────────────────────────────────────────────
  const liveTotal = useMemo(() => {
    if (!productForPricing) return 0;
    const config: CartItemConfig = {
      length:    length    ? parseFloat(length)    : undefined,
      height:    height    ? parseFloat(height)    : undefined,
      width:     width     ? parseFloat(width)     : undefined,
      colorCode: colorCode || undefined,
      foamUnitPrice:
        product?.is_foam_range === true && foamUnitPrice != null && Number.isFinite(foamUnitPrice)
          ? Math.round(foamUnitPrice)
          : undefined,
      foamTotalArea:
        product?.is_foam_range === true && foamTotalArea != null && Number.isFinite(foamTotalArea)
          ? foamTotalArea
          : undefined,
    };
    return calculateTotal(productForPricing, config, quantity);
  }, [productForPricing, product?.is_foam_range, length, height, width, colorCode, quantity, foamUnitPrice, foamTotalArea]);

  // ── Child subtotal — Σ (child qty × child price) for selected rows ───────
  const childTotal = useMemo(
    () =>
      (product?.children ?? [])
        .slice(0, 4)
        .reduce((sum, c) => sum + (childQtys[c.id] ?? 0) * c.price, 0),
    [product, childQtys],
  );

  // ── Display total — (parent qty × parent price) + child subtotal
  //    when children are selected; falls back to parent-only total otherwise.
  const displayTotal = useMemo(
    () => (hasChildSelection ? liveTotal + childTotal : liveTotal),
    [hasChildSelection, liveTotal, childTotal],
  );

  function handleOpenManual() {
    const u = effectiveProduct?.manualUrl?.trim();
    if (u) setIsManualSheetOpen(true);
  }

  // ── Submit ──────────────────────────────────────────────────────────────
  function handleConfirm() {
    const allTouched: Record<string, boolean> = {};
    if (type === 2) allTouched.length = true;
    if (type === 3) {
      allTouched.height = true;
      if (product?.is_foam_range === true) allTouched.foam = true;
    }
    setTouched(allTouched);

    if (!isValid || !product || !effectiveProduct) return;

    const productForCart: Product = { ...effectiveProduct, productType: type };

    // ── 1. Always add the parent item ──────────────────────────────────────
    const config: CartItemConfig = {
      length:    length    ? parseFloat(length)    : undefined,
      height:    height    ? parseFloat(height)    : undefined,
      width:     width     ? parseFloat(width)     : undefined,
      colorCode: colorCode.trim() || undefined,
      foamUnitPrice:
        foamUnitPrice != null && Number.isFinite(foamUnitPrice) ? Math.round(foamUnitPrice) : undefined,
      foamTotalArea:
        foamTotalArea != null && Number.isFinite(foamTotalArea) ? foamTotalArea : undefined,
    };
    onConfirm({
      cartItemId: `${productForCart.id}-${Date.now()}`,
      product: productForCart,
      quantity,
      config,
      totalPrice: liveTotal,
    });

    // ── 2. Additionally add each selected child as a separate cart row ──────
    if (!resolvedPaintProduct && hasChildSelection && product.children) {
      product.children
        .slice(0, 4)
        .filter((c) => (childQtys[c.id] ?? 0) > 0)
        .forEach((c) => {
          const qty = childQtys[c.id]!;
          const childProduct: Product = {
            id: c.id,
            name: c.name,
            category: product.category,
            price: c.price,
            basePrice: c.price,
            stock: c.stock,
            imageUrl: c.imageUrl,
            productType: 1,
          };
          onConfirm({
            cartItemId: `${c.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            product: childProduct,
            quantity: qty,
            config: {},
            totalPrice: c.price * qty,
          });
        });
    }

    onClose();
  }

  if (!mounted || !product || !effectiveProduct) return null;

  const basePrice = getBasePrice(effectiveProduct);
  const manualHref = effectiveProduct.manualUrl?.trim() ?? '';
  const hasManual = manualHref.length > 0;

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-sm transition-opacity duration-350"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="relative w-full max-w-[375px] bg-white rounded-t-2xl shadow-2xl flex flex-col"
        style={{
          maxHeight: '92vh',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.38s cubic-bezier(0.32,0.72,0,1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">Захиалга</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overscroll-contain">

          {/* ── Product summary strip ──────────────────────────────────── */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">

            {/* Tappable image — opens ProductGallery */}
            <div
              className="relative w-16 h-16 rounded-xl overflow-hidden bg-gray-100 shrink-0 cursor-pointer active:opacity-80 transition-opacity"
              onClick={() => {
                setGalleryImages(productImages);
                setGalleryIndex(0);
                setIsGalleryOpen(true);
              }}
              aria-label="Зургийг томруулах"
            >
              <ImageWithFallback
                src={effectiveProduct.imageUrl}
                alt={effectiveProduct.name}
                className="w-full h-full object-cover"
              />

              {/* Counter badge — only when product has multiple images */}
              {imageTotal > 1 && (
                <span className="absolute top-1 right-1 bg-black/60 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-full leading-none pointer-events-none">
                  1 / {imageTotal}
                </span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug">
                {effectiveProduct.name}
              </p>
              {/* Unit price — type 3: нэгж үнэ «Бодох»-оос */}
              {type === 3 && product.is_foam_range && foamUnitPrice != null ? (
                <p className="text-sm font-semibold text-blue-600 mt-1">
                  Нэгж үнэ: ₮{Math.round(foamUnitPrice).toLocaleString()}
                </p>
              ) : type !== 3 ? (
                <p className="text-sm font-semibold text-blue-600 mt-1">
                  ₮{basePrice.toLocaleString()}
                  {type === 2 && <span className="text-[11px] font-normal text-gray-400 ml-0.5">/ см</span>}
                </p>
              ) : null}
            </div>
          </div>

          {/* ── Type-specific fields ───────────────────────────────────── */}
          <div className="px-5 pt-4 pb-3 space-y-4">

            {/* TYPE 2 — Length */}
            {type === 2 && (
              <DimInput
                label="Урт (метр)"
                unit="См"
                value={length}
                onChange={(v) => { setLength(v); touch('length'); }}
                required
                error={touched.length ? currentErrors.length : undefined}
                icon={<Ruler className="w-4 h-4" />}
                placeholder="жишээ: 2.5"
                focusRef={lengthInputRef}
              />
            )}

            {/* TYPE 3 — Height + Width */}
            {type === 3 && (
              <>
                <DimInput
                  label="Өндөр (см)"
                  unit="См"
                  value={height}
                  onChange={(v) => {
                    setHeight(v);
                    touch('height');
                    setFoamUnitPrice(null);
                    setFoamTotalArea(null);
                    setFoamCalcError(null);
                    if (product?.is_foam_range === true && foamRatio != null && !widthTouchedRef.current) {
                      const h = parseFloat(v);
                      if (!isNaN(h) && h > 0) setWidth(formatSuggestedWidthCm(h * foamRatio));
                      else if (!v.trim()) setWidth('');
                    }
                  }}
                  required
                  error={touched.height ? currentErrors.height : undefined}
                  icon={<Maximize2 className="w-4 h-4" />}
                  placeholder="жишээ: 3.0"
                  focusRef={heightInputRef}
                />

                {/* Width — 70% input + Бодох button */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Өргөн (см) <span className="text-gray-400 text-[10px] ml-1">(заавал биш)</span>
                  </label>
                  <div className="flex items-stretch gap-2">
                    <div className="w-[70%] flex items-center gap-2.5 border border-gray-200 bg-gray-50 focus-within:border-blue-500 focus-within:bg-white rounded-xl px-3.5 py-3 transition-colors">
                      <Ruler className="w-4 h-4 text-gray-400 shrink-0" />
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="жишээ: 2.0"
                        value={width}
                        onChange={(e) => {
                          widthTouchedRef.current = true;
                          setFoamUnitPrice(null);
                          setFoamTotalArea(null);
                          setFoamCalcError(null);
                          setWidth(e.target.value.replace(/[^0-9.]/g, ''));
                        }}
                        className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
                      />
                      <span className="text-xs text-gray-400 shrink-0">См</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        touch('height');
                        setFoamCalcError(null);
                        if (product?.is_foam_range !== true) return;

                        const h = parseFloat(height);
                        if (isNaN(h) || h <= 0) {
                          setFoamCalcError('Өндрийг зөв оруулна уу.');
                          return;
                        }

                        let w = parseFloat(width);
                        if (isNaN(w) || w <= 0) {
                          if (foamRatio != null) {
                            w = h * foamRatio;
                            widthTouchedRef.current = false;
                            setWidth(formatSuggestedWidthCm(w));
                          } else {
                            setFoamCalcError('Өргөнийг оруулна уу.');
                            return;
                          }
                        }

                        const waste = product.waste;
                        if (waste == null || !Number.isFinite(waste) || waste <= 0) {
                          setFoamCalcError('Барааны waste коэффициент тохируулаагүй байна.');
                          return;
                        }

                        const ranges = product.foamRange ?? [];
                        if (ranges.length === 0) {
                          setFoamCalcError('foam_range интервал олдсонгүй.');
                          return;
                        }

                        const totalArea = h * w * waste;
                        const tier = findFoamTierForArea(ranges, totalArea);
                        if (!tier) {
                          setFoamCalcError('Нийт талбайд тохирох интервал олдсонгүй.');
                          setFoamUnitPrice(null);
                          setFoamTotalArea(null);
                          return;
                        }

                        const unit = Math.round(totalArea * tier.price);
                        setFoamTotalArea(totalArea);
                        setFoamUnitPrice(unit);
                      }}
                      className="flex-1 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold transition-colors"
                    >
                      Бодох
                    </button>
                  </div>
                  {(foamCalcError != null || (touched.foam && currentErrors.foam)) && (
                    <p className="text-xs text-red-500 mt-1.5 pl-0.5">
                      {foamCalcError ?? currentErrors.foam}
                    </p>
                  )}
                </div>
              </>
            )}

            {/* TYPE 4 — Color Code */}
            {type === 4 && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Өнгөний код оруулах
                </label>
                <div className="flex items-stretch gap-2">
                  <div ref={codeSuggestWrapRef} className="w-[70%] relative">
                    <div className="flex items-center gap-2.5 border border-gray-200 bg-gray-50 focus-within:border-blue-500 focus-within:bg-white rounded-xl px-3.5 py-3 transition-colors">
                      <Palette className="w-4 h-4 text-gray-400 shrink-0" />
                      <input
                        type="text"
                        placeholder="Жишээ нь : NR9009 , BT7012"
                        value={colorCode}
                        onChange={(e) => {
                          const v = e.target.value;
                          setColorCode(v);
                          setCodedPaintPreviewRgb(null);
                          if (!v.trim()) setResolvedPaintProduct(null);
                          touch('colorCode');
                        }}
                        onBlur={(e) => {
                          void tryResolvePaintFromCode(e.target.value);
                        }}
                        onFocus={() => {
                          if (codeSuggestions.length > 0) setShowCodeSuggestions(true);
                        }}
                        autoComplete="off"
                        className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
                      />
                    </div>
                    {showCodeSuggestions && (codeSuggestLoading || codeSuggestions.length > 0) && (
                      <ul
                        className="absolute left-0 right-0 top-full z-20 mt-1 max-h-40 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-md"
                        role="listbox"
                      >
                        {codeSuggestLoading && codeSuggestions.length === 0 ? (
                          <li className="px-3 py-2 text-xs text-gray-500">Ачаалж байна…</li>
                        ) : (
                          codeSuggestions.map((row) => (
                            <li key={row.id}>
                              <button
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 active:bg-gray-100"
                                onMouseDown={(ev) => ev.preventDefault()}
                                onClick={() => {
                                  setColorCode(row.color_code);
                                  setCodedPaintPreviewRgb(row.rgb);
                                  setShowCodeSuggestions(false);
                                  touch('colorCode');
                                  void tryResolvePaintFromCode(row.color_code, row.item_number);
                                }}
                              >
                                {row.color_code}
                                {row.color_name ? (
                                  <span className="text-gray-500 text-xs"> — {row.color_name}</span>
                                ) : null}
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                    )}
                  </div>

                  {/* Color preview box — remaining 30% */}
                  <div
                    className="flex-1 rounded-xl border transition-all overflow-hidden"
                    style={
                      codedPaintPreviewRgb
                        ? {
                            background: `rgb(${codedPaintPreviewRgb.r},${codedPaintPreviewRgb.g},${codedPaintPreviewRgb.b})`,
                            borderColor: '#e2e8f0',
                          }
                        : colorCode.match(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/)
                          ? { background: colorCode, borderColor: colorCode }
                          : { background: '#f1f5f9', borderColor: '#e2e8f0' }
                    }
                  >
                    {!codedPaintPreviewRgb &&
                      !colorCode.match(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/) && (
                      <div className="w-full h-full flex items-center justify-center">
                        <Palette className="w-4 h-4 text-gray-300" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── Quantity row (all types) ───────────────────────────── */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-medium text-gray-600 shrink-0">
                Тоо ширхэг <span className="text-red-500">*</span>
              </span>
              <QtyInput
                value={quantity}
                onChange={setQuantity}
                min={1}
                max={99999}
              />
              {/* Stock / summary — type 3 shows total length instead of stock */}
              {type === 3 ? (
                <span className="text-xs text-gray-500 shrink-0">
                  Нийт -{' '}
                  <span className="font-medium text-gray-700">{quantity * 2} м</span>
                </span>
              ) : (
                <span className="text-xs text-gray-500 shrink-0">
                  Үлдэгдэл: <span className="font-medium text-gray-600">{effectiveProduct.stock}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Sticky footer ──────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-gray-100 px-5 pt-4 pb-6 bg-white space-y-3.5">

          {/* Нийт үнэ — Нэгж үнэ is shown in the summary strip above */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Нийт үнэ</p>
            {/* displayTotal = (parent qty × parent price) + Σ(child qty × child price) */}
            <p className="text-xl font-bold text-gray-900">
              ₮{displayTotal.toLocaleString()}
            </p>
          </div>

          {/* Заавар — нийт үнийн доор, сагсны товчийн дээр, зүүн талд холбоос хэлбэр */}
          {hasManual && (
            <div className="flex justify-start -mt-0.5">
              <button
                type="button"
                onClick={handleOpenManual}
                className="flex items-center gap-1.5 min-h-[44px] -my-1 py-2 pr-3 text-xs font-medium text-blue-500 hover:text-blue-700 active:opacity-70 transition-colors touch-manipulation text-left rounded-lg"
              >
                <FileText className="w-3.5 h-3.5 shrink-0" />
                Заавар үзэх
              </button>
            </div>
          )}

          {/* ── Child variant selection (isParent products only) ─────────── */}
          {product.isParent &&
            product.children &&
            product.children.length > 0 &&
            !resolvedPaintProduct && (
            <div className="border border-indigo-100 rounded-xl bg-indigo-50/30 p-3 space-y-2">
              {/* Section title — RENAMED */}
              <p className="text-xs font-semibold text-gray-700">
                Нэмэлт бараа авах
              </p>

              {/* Child rows — max 4 */}
              <div className="space-y-2 max-h-[224px] overflow-y-auto pr-0.5">
                {product.children.slice(0, 4).map((child) => {
                  const cQty = childQtys[child.id] ?? 0;
                  const isSelected = cQty > 0;
                  const isMaxed = cQty >= child.stock;
                  return (
                    <div
                      key={child.id}
                      className={`flex items-center gap-2 rounded-xl p-2 border transition-colors ${
                        isSelected
                          ? 'bg-blue-50 border-blue-200'
                          : 'bg-white border-gray-100'
                      }`}
                    >
                      {/* Thumbnail */}
                      <div
                        className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 shrink-0 cursor-pointer active:opacity-75 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          const imgs =
                            child.images && child.images.length > 0
                              ? child.images
                              : [child.imageUrl];
                          setGalleryImages(imgs);
                          setGalleryIndex(0);
                          setIsGalleryOpen(true);
                        }}
                        aria-label={`${child.name} зургийг томруулах`}
                      >
                        <ImageWithFallback
                          src={child.imageUrl}
                          alt={child.name}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800 line-clamp-1">
                          {child.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-gray-400">
                            Үлдэгдэл:{' '}
                            <span className={child.stock <= 2 ? 'text-red-500 font-semibold' : 'text-gray-600'}>
                              {child.stock}
                            </span>
                          </span>
                          <span className="text-[10px] text-blue-600 font-semibold">
                            ₮{child.price.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Stepper */}
                      <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setChildQtys((p) => ({
                              ...p,
                              [child.id]: Math.max(0, (p[child.id] ?? 0) - 1),
                            }))
                          }
                          disabled={cQty === 0}
                          className="w-6 h-6 flex items-center justify-center rounded-md bg-white shadow-sm text-gray-600
                                     hover:text-red-500 hover:bg-red-50 transition-colors active:scale-90
                                     disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-gray-600 disabled:hover:bg-white"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          value={cQty === 0 ? '' : cQty}
                          placeholder="0"
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') {
                              setChildQtys((p) => ({ ...p, [child.id]: 0 }));
                              return;
                            }
                            const parsed = Math.floor(parseInt(raw, 10));
                            if (isNaN(parsed) || parsed < 0) return;
                            setChildQtys((p) => ({
                              ...p,
                              [child.id]: Math.min(child.stock, parsed),
                            }));
                          }}
                          onBlur={(e) => {
                            if (e.target.value === '') {
                              setChildQtys((p) => ({ ...p, [child.id]: 0 }));
                            }
                          }}
                          onFocus={(e) => e.target.select()}
                          className={`w-10 h-6 text-center text-xs font-semibold bg-white rounded-md
                            border border-gray-200 outline-none
                            focus:border-blue-400 focus:ring-1 focus:ring-blue-200
                            transition-colors
                            [appearance:textfield]
                            [&::-webkit-inner-spin-button]:appearance-none
                            [&::-webkit-outer-spin-button]:appearance-none
                            ${isSelected ? 'text-blue-600' : 'text-gray-600'}`}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setChildQtys((p) => ({
                              ...p,
                              [child.id]: Math.min(child.stock, (p[child.id] ?? 0) + 1),
                            }))
                          }
                          disabled={isMaxed}
                          className="w-6 h-6 flex items-center justify-center rounded-md bg-white shadow-sm text-gray-600
                                     hover:text-blue-600 hover:bg-blue-50 transition-colors active:scale-90
                                     disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-gray-600 disabled:hover:bg-white"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* CTA */}
          <button
            onClick={handleConfirm}
            disabled={!isValid}
            className={`w-full flex items-center justify-center gap-2 text-sm font-semibold py-3.5 rounded-xl transition-all ${
              isValid
                ? 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-sm'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            Сагсанд нэмэх
          </button>
        </div>
      </div>

      {/* ── ProductGallery — body portal, z-[220] ── */}
      <ProductGallery
        images={galleryImages}
        initialIndex={galleryIndex}
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
      />

      {hasManual && (
        <ProductManualSheet
          isOpen={isManualSheetOpen}
          onClose={() => setIsManualSheetOpen(false)}
          url={manualHref}
          productName={effectiveProduct.name}
        />
      )}
    </div>
  );
}

// ─── Type badge — kept for ProductCard pill only, not shown in modal ──────────
const TYPE_META: Record<number, { label: string; color: string; icon: React.ReactNode }> = {
  1: { label: 'Ш',    color: 'bg-blue-600/80',    icon: null },
  2: { label: 'УРТ',  color: 'bg-green-600/80',   icon: null },
  3: { label: 'М²',   color: 'bg-purple-600/80',  icon: null },
  4: { label: 'ӨНГӨ', color: 'bg-orange-500/80',  icon: null },
};
export { TYPE_META };