import { ProductCard } from './ProductCard';
import { Product } from '../types';

interface ProductGridProps {
  products: Product[];
  onConfigureProduct: (product: Product) => void;
}

export function ProductGrid({ products, onConfigureProduct }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="bg-gray-50">
        <div className="max-w-[1280px] mx-auto px-4 md:px-6 lg:px-8 py-16 pb-24 lg:pb-10 flex items-center justify-center">
          <p className="text-gray-500 text-center">Бараа олдсонгүй</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50">
      <div className="max-w-[1280px] mx-auto px-4 md:px-6 lg:px-8 py-4 pb-24 lg:pb-10">
        {/*
          auto-fill with a fixed 160 px column = same card width as mobile.
          Cards never stretch; extra screen space just adds more columns.
          justify-start keeps the row left-aligned when the last row is partial.
        */}
        <div
          className="grid gap-3 justify-start"
          style={{ gridTemplateColumns: 'repeat(auto-fill, 160px)' }}
        >
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onConfigureProduct={onConfigureProduct}
            />
          ))}
        </div>
      </div>
    </div>
  );
}