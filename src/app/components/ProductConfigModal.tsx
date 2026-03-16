import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { X, Plus, Minus, ShoppingCart, Ruler, Maximize2, Palette, FileText, AlertCircle } from 'lucide-react';
import { Product, CartItem, CartItemConfig } from '../types';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { getBasePrice, calculateTotal } from '../utils/priceCalc';
import { ProductGallery } from './ProductGallery';

interface ProductConfigModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (item: CartItem) => void;
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
  product, isOpen, onClose, onConfirm,
}: ProductConfigModalProps) {
  const [mounted, setMounted]   = useState(false);
  const [visible, setVisible]   = useState(false);

  // ── Field state ─────────────────────────────────────────────────────────
  const [quantity,  setQuantity]  = useState(1);
  const [length,    setLength]    = useState('');
  const [height,    setHeight]    = useState('');
  const [width,     setWidth]     = useState('');
  const [colorCode, setColorCode] = useState('');

  // ── Refs for auto-focus ─────────────────────────────────────────────────
  const heightInputRef = useRef<HTMLInputElement>(null);
  const lengthInputRef = useRef<HTMLInputElement>(null);

  // ── "Заавар үзэх" fallback inside modal ─────────────────────────────────
  const [showManualFallback, setShowManualFallback] = useState(false);

  // ── Gallery state ──────────────────────────────────────────────────────
  const [isGalleryOpen,  setIsGalleryOpen]  = useState(false);
  const [galleryIndex,   setGalleryIndex]   = useState(0);
  // Holds whichever image set is currently open (parent or a child)
  const [galleryImages,  setGalleryImages]  = useState<string[]>([]);

  // ── Child product quantities (isParent products only) ────────────────────
  const [childQtys, setChildQtys] = useState<Record<number, number>>({});

  // ── Validation errors ───────────────────────────────────────────────────
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const type = product?.productType ?? 1;

  // Derive image list — always at least the primary imageUrl
  const productImages = product
    ? (product.images && product.images.length > 0 ? product.images : [product.imageUrl])
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
      setErrors({}); setTouched({});
      setShowManualFallback(false);
      setGalleryIndex(0);
      setGalleryImages([]);
      setChildQtys({});
      // Auto-focus the primary dimension input after animation completes
      const productType = product?.productType ?? 1;
      const focusTimer = setTimeout(() => {
        if (productType === 2) lengthInputRef.current?.focus();
        else if (productType === 3) heightInputRef.current?.focus();
      }, 420);
      return () => clearTimeout(focusTimer);
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 380);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

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
    }
    return e;
  }, [type, length, height]);

  const currentErrors = useMemo(() => validate(), [validate]);
  const isValid = Object.keys(currentErrors).length === 0;

  function touch(field: string) {
    setTouched((p) => ({ ...p, [field]: true }));
  }

  // ── Whether any child variant is selected ────────────────────────────────
  const hasChildSelection = useMemo(
    () => !!(product?.isParent && Object.values(childQtys).some((q) => q > 0)),
    [product, childQtys],
  );

  // ── Live parent price ──────────────────────────────────────────────────
  const liveTotal = useMemo(() => {
    if (!product) return 0;
    const config: CartItemConfig = {
      length:    length    ? parseFloat(length)    : undefined,
      height:    height    ? parseFloat(height)    : undefined,
      width:     width     ? parseFloat(width)     : undefined,
      colorCode: colorCode || undefined,
    };
    return calculateTotal(product, config, quantity);
  }, [product, length, height, width, colorCode, quantity]);

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

  // ── "Заавар үзэх" handler ────────────────────────────────────────────────
  function handleManual() {
    if (product?.manualUrl) {
      window.open(product.manualUrl, '_blank', 'noopener,noreferrer');
    } else {
      setShowManualFallback(true);
      setTimeout(() => setShowManualFallback(false), 2500);
    }
  }

  // ── Submit ──────────────────────────────────────────────────────────────
  function handleConfirm() {
    const allTouched: Record<string, boolean> = {};
    if (type === 2) allTouched.length = true;
    if (type === 3) allTouched.height = true;
    setTouched(allTouched);

    if (!isValid || !product) return;

    // ── 1. Always add the parent item ──────────────────────────────────────
    const config: CartItemConfig = {
      length:    length    ? parseFloat(length)    : undefined,
      height:    height    ? parseFloat(height)    : undefined,
      width:     width     ? parseFloat(width)     : undefined,
      colorCode: colorCode.trim() || undefined,
    };
    onConfirm({
      cartItemId: `${product.id}-${Date.now()}`,
      product,
      quantity,
      config,
      totalPrice: liveTotal,
    });

    // ── 2. Additionally add each selected child as a separate cart row ──────
    if (hasChildSelection && product.children) {
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

  if (!mounted || !product) return null;

  const basePrice = getBasePrice(product);

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
                src={product.imageUrl}
                alt={product.name}
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
                {product.name}
              </p>
              {/* Unit price — hidden for type 3 (no fixed price until dimensions entered) */}
              {type !== 3 && (
                <p className="text-sm font-semibold text-blue-600 mt-1">
                  ₮{basePrice.toLocaleString()}
                  {type === 2 && <span className="text-[11px] font-normal text-gray-400 ml-0.5">/ см</span>}
                </p>
              )}
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
                  onChange={(v) => { setHeight(v); touch('height'); }}
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
                        onChange={(e) => setWidth(e.target.value.replace(/[^0-9.]/g, ''))}
                        className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
                      />
                      <span className="text-xs text-gray-400 shrink-0">См</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => touch('height')}
                      className="flex-1 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold transition-colors"
                    >
                      Бодох
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* TYPE 4 — Color Code */}
            {type === 4 && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Өнгө оруулах бол кодоо энд оруулна уу
                </label>
                <div className="flex items-stretch gap-2">
                  {/* Input — 70% width */}
                  <div className="w-[70%] flex items-center gap-2.5 border border-gray-200 bg-gray-50 focus-within:border-blue-500 focus-within:bg-white rounded-xl px-3.5 py-3 transition-colors">
                    <Palette className="w-4 h-4 text-gray-400 shrink-0" />
                    <input
                      type="text"
                      placeholder="Жишээ нь : NR9009 , BT7012"
                      value={colorCode}
                      onChange={(e) => setColorCode(e.target.value)}
                      className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
                    />
                  </div>

                  {/* Color preview box — remaining 30% */}
                  <div
                    className="flex-1 rounded-xl border transition-all overflow-hidden"
                    style={
                      colorCode.match(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/)
                        ? { background: colorCode, borderColor: colorCode }
                        : { background: '#f1f5f9', borderColor: '#e2e8f0' }
                    }
                  >
                    {!colorCode.match(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/) && (
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
                  Үлдэгдэл: <span className="font-medium text-gray-600">{product.stock}</span>
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

          {/* "Заавар үзэх" link */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleManual}
              className="flex items-center gap-1.5 text-xs font-medium text-blue-500 hover:text-blue-700 transition-colors active:opacity-70"
            >
              <FileText className="w-3.5 h-3.5" />
              Заавар үзэх
            </button>
            {showManualFallback && (
              <span className="flex items-center gap-1 text-xs text-amber-600">
                <AlertCircle className="w-3 h-3 shrink-0" />
                Заава байхгүй байна
              </span>
            )}
          </div>

          {/* ── Child variant selection (isParent products only) ─────────── */}
          {product.isParent && product.children && product.children.length > 0 && (
            <div className="border border-indigo-100 rounded-xl bg-indigo-50/30 p-3 space-y-2">
              {/* Section title — RENAMED */}
              <p className="text-xs font-semibold text-gray-700">
                Нэмэлт авах бараа
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

      {/* ── Full-screen gallery — z-[150] sits above this modal's z-[130] ── */}
      <ProductGallery
        images={galleryImages}
        initialIndex={galleryIndex}
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
      />
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