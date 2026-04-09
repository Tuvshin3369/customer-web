import { ImageWithFallback } from './figma/ImageWithFallback';
import { Product } from '../types';

interface ProductCardProps {
  product: Product;
  onConfigureProduct: (product: Product) => void;
}

export function ProductCard({ product, onConfigureProduct }: ProductCardProps) {
  function handleOpen() {
    onConfigureProduct(product);
  }

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
        {(product.discount ?? 0) > 0 && (
          <div className="absolute top-2 left-2 bg-red-500 text-white text-xs font-semibold px-2 py-1 rounded pointer-events-none shadow-sm">
            -{product.discount}%
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
            ₮{(product.basePrice ?? product.price).toLocaleString()}
          </p>
          {product.oldPrice && (
            <p className="text-sm text-gray-400 line-through">
              ₮{product.oldPrice.toLocaleString()}
            </p>
          )}
        </div>

        <p className="text-xs text-gray-500">Үлдэгдэл: {product.stock}</p>
      </div>

    </div>
  );
}