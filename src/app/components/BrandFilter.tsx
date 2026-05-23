export interface BrandChipOption {
  id:        string;
  brandName: string;
}

interface BrandFilterProps {
  brands:          BrandChipOption[];
  activeBrandId:   string | null;
  onBrandChange:   (brandId: string) => void;
}

export function BrandFilter({ brands, activeBrandId, onBrandChange }: BrandFilterProps) {
  return (
    <div className="bg-white border-b border-gray-200">
      <div className="max-w-[1280px] mx-auto px-4 md:px-6 lg:px-8 py-3 overflow-x-auto scrollbar-hide">
        <div className="flex gap-2 min-w-max">
          {brands.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => onBrandChange(b.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap
                          transition-all duration-150
                          ${activeBrandId === b.id
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
            >
              {b.brandName}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
