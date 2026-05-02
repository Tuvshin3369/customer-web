import { useState, useEffect, useMemo } from 'react';
import {
  X, Plus, Minus, ShoppingCart, Trash2,
} from 'lucide-react';
import { CartItem } from '../types';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { configLabel, calculateTotal } from '../utils/priceCalc';
import { ProductGallery } from './ProductGallery';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQuantity: (cartItemId: string, quantity: number) => void;
  onRemoveItem: (cartItemId: string) => void;
  onClearCart: () => void;
  onCheckout: () => void;
}

export function CartDrawer({
  isOpen, onClose, items, onUpdateQuantity, onRemoveItem, onClearCart, onCheckout,
}: CartDrawerProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  // ── Clear-cart confirmation ───────────────────────────────────────────────
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [confirmVisible,   setConfirmVisible]   = useState(false);

  // ── Gallery state ────────────────────────────────────────────────────────
  const [isGalleryOpen,  setIsGalleryOpen]  = useState(false);
  const [galleryImages,  setGalleryImages]  = useState<string[]>([]);
  const [galleryIndex,   setGalleryIndex]   = useState(0);

  function openGallery(images: string[]) {
    setGalleryImages(images.length > 0 ? images : []);
    setGalleryIndex(0);
    setIsGalleryOpen(true);
  }

  function openClearConfirm() {
    setShowClearConfirm(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setConfirmVisible(true)));
  }

  function closeClearConfirm() {
    setConfirmVisible(false);
    setTimeout(() => setShowClearConfirm(false), 220);
  }

  function confirmClearCart() {
    closeClearConfirm();
    // Small delay so the confirm modal animates out first,
    // then clear cart and close drawer — App.tsx resets page to home
    setTimeout(() => {
      onClearCart();
      onClose();
    }, 220);
  }

  // ── Animation ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 380);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // ── Body scroll lock — position:fixed pattern works on iOS Safari too ────
  //   Saves current scrollY → fixes body in place → restores on close.
  //   overflowY:'scroll' keeps the scrollbar gutter so the layout doesn't jump.
  useEffect(() => {
    if (!isOpen) return;
    const scrollY = window.scrollY;
    document.body.style.position  = 'fixed';
    document.body.style.top       = `-${scrollY}px`;
    document.body.style.width     = '100%';
    document.body.style.overflowY = 'scroll';
    return () => {
      const savedY = Math.abs(parseInt(document.body.style.top || '0', 10));
      document.body.style.position  = '';
      document.body.style.top       = '';
      document.body.style.width     = '';
      document.body.style.overflowY = '';
      window.scrollTo(0, savedY);
    };
  }, [isOpen]);

  // ── Totals ───────────────────────────────────────────────────────────────
  const grandTotal = useMemo(
    () => items.reduce((sum, item) => sum + item.totalPrice, 0),
    [items],
  );
  const totalCount = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items],
  );

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center md:items-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-350"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="relative w-full max-w-[375px] md:max-w-[480px] lg:max-w-[520px] bg-white rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col"
        style={{
          maxHeight: '88vh',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.38s cubic-bezier(0.32,0.72,0,1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle — mobile only */}
        <div className="flex justify-center pt-3 pb-1 shrink-0 md:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-semibold text-gray-900">Сагс</h2>
            {totalCount > 0 && (
              <span className="bg-blue-600 text-white text-xs font-medium px-2 py-0.5 rounded-full">
                {totalCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <button
                onClick={openClearConfirm}
                className="text-xs font-medium text-red-500 hover:text-red-600 active:text-red-700 transition-colors px-1 py-1"
              >
                Сагс хоослох
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Body */}
        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16 px-6">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
              <ShoppingCart className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-500">Сагс хоосон байна</p>
            <p className="text-xs text-gray-400 text-center">
              Бараа нэмэхийн тулд "Сагсанд хийх" товчийг дарна уу.
            </p>
            <button
              onClick={onClose}
              className="mt-2 px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors"
            >
              Дэлгүүр хэсэх
            </button>
          </div>
        ) : (
          <>
            {/* Item list — overscroll-contain keeps touches inside the drawer on iOS */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-3">
              {items.map((item) => (
                <CartItemCard
                  key={item.cartItemId}
                  item={item}
                  configLabel={configLabel(item.product, item.config)}
                  onRemove={() => onRemoveItem(item.cartItemId)}
                  onDecrement={() => {
                    if (item.quantity <= 1) {
                      onRemoveItem(item.cartItemId);
                    } else {
                      onUpdateQuantity(item.cartItemId, item.quantity - 1);
                    }
                  }}
                  onIncrement={() => onUpdateQuantity(item.cartItemId, item.quantity + 1)}
                  onQuantityCommit={(q) => onUpdateQuantity(item.cartItemId, q)}
                  onImageClick={() => {
                    const imgs =
                      item.product.images && item.product.images.length > 0
                        ? item.product.images
                        : [item.product.imageUrl];
                    openGallery(imgs);
                  }}
                />
              ))}
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-gray-100 px-5 pt-3 pb-6 bg-white">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs text-gray-400">Нийт ({totalCount} бараа)</p>
                  <p className="text-xl font-bold text-gray-900">
                    ₮{grandTotal.toLocaleString()}
                  </p>
                </div>
                <p className="text-xs text-gray-400">{items.length} төрлийн бараа</p>
              </div>
              <button
                onClick={onCheckout}
                className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold py-3.5 rounded-xl transition-colors shadow-sm"
              >
                Захиалга өгөх
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Clear-cart confirmation modal ───────────────────────────────── */}
      {showClearConfirm && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center px-6"
          style={{
            background: `rgba(0,0,0,${confirmVisible ? 0.45 : 0})`,
            transition: 'background 0.22s ease',
          }}
          onClick={closeClearConfirm}
        >
          <div
            className="w-full max-w-[300px] bg-white rounded-2xl shadow-2xl px-5 py-6 space-y-4"
            style={{
              opacity:   confirmVisible ? 1 : 0,
              transform: confirmVisible ? 'scale(1)' : 'scale(0.92)',
              transition: 'opacity 0.22s ease, transform 0.22s ease',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Title */}
            <div className="space-y-1.5">
              <p className="text-base font-semibold text-gray-900">
                Сагс хоослох уу?
              </p>
              <p className="text-xs text-gray-500 leading-relaxed">
                Та сагсанд байгаа бүх барааг устгахдаа итгэлтэй байна уу?
              </p>
            </div>

            {/* Buttons */}
            <div className="flex gap-2.5 pt-1">
              {/* Cancel */}
              <button
                onClick={closeClearConfirm}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 text-sm font-medium text-gray-600
                           hover:bg-gray-200 active:bg-gray-300 transition-colors"
              >
                Цуцлах
              </button>

              {/* Confirm clear */}
              <button
                onClick={confirmClearCart}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-sm font-semibold text-white
                           hover:bg-red-600 active:bg-red-700 transition-colors shadow-sm"
              >
                Тийм, хоослох
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Full-screen gallery — z-[150] floats above the drawer ─────── */}
      <ProductGallery
        images={galleryImages}
        initialIndex={galleryIndex}
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
      />
    </div>
  );
}

// ─── Single cart item card ────────────────────────────────────────────────────
interface CartItemCardProps {
  item: CartItem;
  configLabel: string | null;
  onRemove: () => void;
  onDecrement: () => void;
  onIncrement: () => void;
  onQuantityCommit: (quantity: number) => void;
  onImageClick: () => void;
}

const CART_QTY_MAX = 99999;

function CartItemCard({
  item,
  configLabel: label,
  onRemove,
  onDecrement,
  onIncrement,
  onQuantityCommit,
  onImageClick,
}: CartItemCardProps) {
  const lineTotal = calculateTotal(item.product, item.config, item.quantity);
  const [qtyRaw, setQtyRaw] = useState(String(item.quantity));

  useEffect(() => {
    setQtyRaw(String(item.quantity));
  }, [item.quantity, item.cartItemId]);

  function commitQtyInput(str: string) {
    const parsed = parseInt(str, 10);
    if (!Number.isNaN(parsed)) {
      onQuantityCommit(Math.min(CART_QTY_MAX, Math.max(1, parsed)));
    } else {
      setQtyRaw(String(item.quantity));
    }
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm">
      <div className="flex gap-3">
        {/* Thumbnail — tappable to open gallery */}
        <div
          className="w-20 h-24 rounded-xl overflow-hidden bg-gray-100 shrink-0 cursor-pointer active:opacity-75 transition-opacity"
          onClick={onImageClick}
          aria-label={`${item.product.name} зургийг томруулах`}
        >
          <ImageWithFallback
            src={item.product.imageUrl}
            alt={item.product.name}
            className="w-full h-full object-cover"
          />
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-1">
            <div className="flex-1 min-w-0">
              {/* Product name */}
              <p className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug">
                {item.product.name}
              </p>

              {/* Custom config values (length / height / width / colorCode) */}
              {label && (
                <p className="text-[10px] text-blue-500 font-medium mt-0.5 leading-relaxed">
                  {label}
                </p>
              )}
            </div>

            {/* Always-visible remove button */}
            <button
              onClick={onRemove}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors active:scale-90 shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Quantity selector + item total */}
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-0.5">
              <button
                onClick={onDecrement}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-white shadow-sm text-gray-600 hover:text-red-500 hover:bg-red-50 transition-colors active:scale-90"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={qtyRaw}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, '');
                  setQtyRaw(v);
                  if (v !== '') {
                    const n = parseInt(v, 10);
                    if (!Number.isNaN(n)) {
                      onQuantityCommit(Math.min(CART_QTY_MAX, Math.max(1, n)));
                    }
                  }
                }}
                onBlur={() => commitQtyInput(qtyRaw)}
                onFocus={(e) => e.target.select()}
                className="w-12 min-w-[3rem] text-center text-sm font-semibold text-gray-800 bg-transparent outline-none"
                aria-label="Тоо ширхэг"
              />
              <button
                onClick={onIncrement}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-white shadow-sm text-gray-600 hover:text-blue-600 hover:bg-blue-50 transition-colors active:scale-90"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Item total price */}
            <p className="text-sm font-semibold text-blue-600">
              ₮{lineTotal.toLocaleString()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}