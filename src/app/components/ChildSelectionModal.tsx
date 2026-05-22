import { useEffect, useState, useMemo } from 'react';
import { X, Plus, Minus, ShoppingCart, Layers } from 'lucide-react';
import { Product, ChildProduct, CartItem } from '../types';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { displayStock } from '../utils/displayStock';

interface ChildSelectionModalProps {
  parentProduct: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onAddItems: (items: CartItem[]) => void;
  brandName?: string;
}

export function ChildSelectionModal({
  parentProduct,
  isOpen,
  onClose,
  onAddItems,
  brandName,
}: ChildSelectionModalProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  // quantities[childId] = selected quantity (0 = not selected)
  const [quantities, setQuantities] = useState<Record<number, number>>({});

  // ── Animation ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      setQuantities({}); // reset selections on open
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 380);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // ── Derived values ───────────────────────────────────────────────────────
  const children = useMemo(
    () => (parentProduct?.children ?? []).slice(0, 4),
    [parentProduct],
  );

  const totalStock = useMemo(
    () => children.reduce((sum, c) => sum + c.stock, 0),
    [children],
  );

  const hasSelection = useMemo(
    () => Object.values(quantities).some((q) => q > 0),
    [quantities],
  );

  const selectedTotal = useMemo(
    () =>
      children.reduce(
        (sum, c) => sum + (quantities[c.id] ?? 0) * c.price,
        0,
      ),
    [children, quantities],
  );

  // ── Handlers ─────────────────────────────────────────────────────────────
  function setQty(childId: number, delta: number, maxStock: number) {
    setQuantities((prev) => {
      const cur = prev[childId] ?? 0;
      const next = Math.max(0, Math.min(maxStock, cur + delta));
      return { ...prev, [childId]: next };
    });
  }

  function handleConfirm() {
    if (!parentProduct) return;
    const items: CartItem[] = children
      .filter((c) => (quantities[c.id] ?? 0) > 0)
      .map((c) => {
        const qty = quantities[c.id]!;
        const listRetail = c.retailPrice ?? c.price;
        const saleUnit = c.price;
        return {
          cartItemId: `${c.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          product: {
            id: c.id,
            name: c.name,
            category: parentProduct.category,
            store_id: parentProduct.store_id,
            categoryId: parentProduct.categoryId,
            brandId: c.brandId ?? parentProduct.brandId,
            price: listRetail > 0 ? listRetail : saleUnit,
            basePrice: saleUnit,
            oldPrice:
              (c.loyaltyPriceMode === 'v1' || c.loyaltyPriceMode === 'v2') && listRetail > saleUnit
                ? listRetail
                : undefined,
            discount: undefined,
            retailPrice: listRetail > 0 ? listRetail : undefined,
            wholesalePrice: c.wholesalePrice,
            plannedStandardBaseUnit: c.plannedStandardBaseUnit,
            catalogDiscountPct: c.catalogDiscountPct,
            onlineDiscountPctAtFetch: c.onlineDiscountPctAtFetch,
            loyaltyPriceMode: c.loyaltyPriceMode,
            loyaltyReportWholesalePct: c.loyaltyReportWholesalePct,
            loyaltyReportRetailDiscountPct: c.loyaltyReportRetailDiscountPct,
            stock: c.stock,
            imageUrl: c.imageUrl,
            images: c.images,
            productType: 1,
            receivedPrice: c.receivedPrice,
          },
          quantity: qty,
          config: {},
          totalPrice: saleUnit * qty,
        };
      });
    onAddItems(items);
    onClose();
  }

  if (!mounted || !parentProduct) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-350"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="relative w-full max-w-[375px] bg-white rounded-t-2xl shadow-2xl flex flex-col"
        style={{
          maxHeight: '90vh',
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
        <div className="px-5 pt-2 pb-3 border-b border-gray-100 shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              {/* Brand chip */}
              {brandName && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full mb-1.5">
                  <Layers className="w-2.5 h-2.5" />
                  {brandName}
                </span>
              )}
              <h2 className="text-base font-semibold text-gray-900 leading-snug">
                {parentProduct.name}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Нийт үлдэгдэл:{' '}
                <span className="font-semibold text-gray-700">{displayStock(totalStock)}</span>
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors shrink-0 mt-0.5"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Child list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {children.map((child) => (
            <ChildRow
              key={child.id}
              child={child}
              quantity={quantities[child.id] ?? 0}
              onDecrement={() => setQty(child.id, -1, child.stock)}
              onIncrement={() => setQty(child.id, +1, child.stock)}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-100 px-5 pt-3 pb-6 bg-white">
          {hasSelection && (
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-xs text-gray-400">Сонгосон нийт дүн</p>
              <p className="text-base font-bold text-blue-600">
                ₮{selectedTotal.toLocaleString()}
              </p>
            </div>
          )}
          <button
            disabled={!hasSelection}
            onClick={handleConfirm}
            className={`w-full flex items-center justify-center gap-2 text-sm font-semibold py-3.5 rounded-xl transition-colors shadow-sm
              ${hasSelection
                ? 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
          >
            <ShoppingCart className="w-4 h-4" />
            Сагсанд нэмэх
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Single child row ─────────────────────────────────────────────────────────
interface ChildRowProps {
  child: ChildProduct;
  quantity: number;
  onDecrement: () => void;
  onIncrement: () => void;
}

function ChildRow({ child, quantity, onDecrement, onIncrement }: ChildRowProps) {
  const isMaxed = quantity >= child.stock;
  const isSelected = quantity > 0;

  return (
    <div
      className={`rounded-2xl border p-3 transition-colors ${
        isSelected ? 'border-blue-200 bg-blue-50/40' : 'border-gray-100 bg-white'
      } shadow-sm`}
    >
      <div className="flex gap-3 items-center">
        {/* Image */}
        <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 shrink-0">
          <ImageWithFallback
            src={child.imageUrl}
            alt={child.name}
            className="w-full h-full object-cover"
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug">
            {child.name}
          </p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <p className="text-[11px] text-gray-400">
              Үлдэгдэл:{' '}
              <span
                className={`font-semibold ${displayStock(child.stock) <= 2 ? 'text-red-500' : 'text-gray-600'}`}
              >
                {displayStock(child.stock)}
              </span>
            </p>
            <div className="flex items-center gap-1">
              {(child.loyaltyPriceMode === 'v1' || child.loyaltyPriceMode === 'v2') &&
              child.retailPrice != null &&
              child.retailPrice > child.price ? (
                <>
                  <p className="text-[11px] text-gray-400 line-through">
                    ₮{Math.round(child.retailPrice).toLocaleString()}
                  </p>
                  <p className="text-[11px] text-blue-600 font-semibold">
                    ₮{Math.round(child.price).toLocaleString()}
                  </p>
                </>
              ) : (
                <p className="text-[11px] text-blue-600 font-semibold">
                  ₮{child.price.toLocaleString()}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Quantity stepper */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-0.5 shrink-0">
          <button
            onClick={onDecrement}
            disabled={quantity === 0}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-white shadow-sm text-gray-600
                       hover:text-red-500 hover:bg-red-50 transition-colors active:scale-90
                       disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-gray-600 disabled:hover:bg-white"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className={`w-7 text-center text-sm font-semibold ${isSelected ? 'text-blue-600' : 'text-gray-800'}`}>
            {quantity}
          </span>
          <button
            onClick={onIncrement}
            disabled={isMaxed}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-white shadow-sm text-gray-600
                       hover:text-blue-600 hover:bg-blue-50 transition-colors active:scale-90
                       disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-gray-600 disabled:hover:bg-white"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Selected subtotal */}
      {isSelected && (
        <div className="mt-2 pt-2 border-t border-blue-100 flex justify-between items-center">
          <p className="text-[11px] text-gray-400">{quantity} ширхэг</p>
          <p className="text-[11px] font-semibold text-blue-600">
            ₮{(child.price * quantity).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}
