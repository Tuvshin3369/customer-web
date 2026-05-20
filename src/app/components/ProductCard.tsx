import { ImageWithFallback } from './figma/ImageWithFallback';
import { Product } from '../types';
import { productCardDiscountPercent } from '../lib/customerLoyaltyContext';

interface ProductCardProps {
  product: Product;
  onConfigureProduct: (product: Product) => void;
  /**
   * is_foam_range: жагсаалтын картанд л — давуу хувьтай үл мэнд (сонгох модалын нэгж тооцоололд үл хамаарна).
   */
  foamLoyaltyPreviewPercent?: number;
}

export function ProductCard({
  product,
  onConfigureProduct,
  foamLoyaltyPreviewPercent,
}: ProductCardProps) {
  function handleOpen() {
    onConfigureProduct(product);
  }

  const catalogListUnit =
    product.retailPrice != null && product.retailPrice > 0
      ? product.retailPrice
      : product.price > 0
        ? product.price
        : 0;

  const useFoamLoyaltyPreview =
    product.is_foam_range === true &&
    foamLoyaltyPreviewPercent != null &&
    foamLoyaltyPreviewPercent > 0 &&
    catalogListUnit > 0 &&
    Number.isFinite(foamLoyaltyPreviewPercent);

  const pctForBadge = useFoamLoyaltyPreview
    ? Math.round(Math.min(100, Math.max(0, foamLoyaltyPreviewPercent)))
    : (productCardDiscountPercent(product) ?? 0);

  const displaySaleMoney = useFoamLoyaltyPreview
    ? Math.max(0, Math.round(catalogListUnit * (1 - foamLoyaltyPreviewPercent / 100)))
    : product.basePrice ?? product.price;

  const displayOldMoney = useFoamLoyaltyPreview ? catalogListUnit : product.oldPrice;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${product.name} — захиалах`}
      className="bg-white rounded-lg overflow-hidden border border-gray-200 shadow-sm
                 cursor-pointer select-none
                 transition-all duration-150 ease-out
                 active:scale-[0.98]
                 sm:hover:shadow-md"
      onClick={handleOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleOpen();
        }
      }}
    >

      {/* ── Image area ───────────────────────────────────────────────────── */}
      <div className="relative aspect-[3/4] bg-gray-100">
        <ImageWithFallback
          src={product.imageUrl}
          alt={product.name}
          className="w-full h-full object-cover"
          draggable={false}
          loading="lazy"
        />

        {/* Discount badge — top-left only */}
        {pctForBadge > 0 && (
          <div className="absolute top-2 left-2 bg-red-500 text-white text-xs font-semibold px-2 py-1 rounded pointer-events-none shadow-sm">
            -{pctForBadge}%
          </div>
        )}
      </div>

      {/* ── Info strip ───────────────────────────────────────────────────── */}
      <div className="p-3">
        <h3 className="text-sm font-medium text-gray-900 mb-2 line-clamp-2 min-h-[40px]">
          {product.name}
        </h3>

        <div className="flex items-center gap-2 mb-1">
          <p className="text-lg font-semibold text-blue-600">
            ₮{displaySaleMoney.toLocaleString()}
          </p>
          {displayOldMoney != null && displayOldMoney > displaySaleMoney && (
            <p className="text-sm text-gray-400 line-through">
              ₮{displayOldMoney.toLocaleString()}
            </p>
          )}
        </div>

        <p className="text-xs text-gray-500">Үлдэгдэл: {product.stock}</p>
      </div>

    </div>
  );
}