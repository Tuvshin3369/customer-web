import { useState, useEffect } from 'react';
import { ShoppingCart } from 'lucide-react';

interface BrandFilterProps {
  brands:          string[];   // already filtered by App — only visible brands
  activeBrand:     string;
  onBrandChange:   (brand: string) => void;
  lockedStore?:    string | null;
  onBlockedClick?: () => void; // called when user somehow clicks a locked brand
}

export function BrandFilter({
  brands,
  activeBrand,
  onBrandChange,
  lockedStore,
  onBlockedClick,
}: BrandFilterProps) {
  // ── Notice entrance animation ───────────────────────────────────────────
  const [noticeVisible, setNoticeVisible] = useState(false);

  useEffect(() => {
    if (lockedStore) {
      // tiny delay so the CSS transition has time to fire
      const t = requestAnimationFrame(() =>
        requestAnimationFrame(() => setNoticeVisible(true)),
      );
      return () => cancelAnimationFrame(t);
    } else {
      setNoticeVisible(false);
    }
  }, [lockedStore]);

  return (
    <div className="bg-white border-b border-gray-200">

      {/* ── Store-lock notice ──────────────────────────────────────────── */}
      <div
        aria-live="polite"
        style={{
          maxHeight:  lockedStore ? '80px' : '0px',
          opacity:    noticeVisible ? 1 : 0,
          transform:  noticeVisible ? 'translateY(0)' : 'translateY(-6px)',
          transition: 'max-height 0.25s ease, opacity 0.22s ease, transform 0.22s ease',
          overflow:   'hidden',
        }}
      >
        <div className="mx-4 md:mx-6 lg:mx-8 mt-2.5 mb-0
                        bg-blue-50 border border-blue-100 rounded-xl
                        px-3.5 py-2.5 flex items-start gap-2.5">
          <ShoppingCart className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-[12px] font-medium text-blue-800 leading-snug">
              Та <span className="font-semibold">{lockedStore}</span> дэлгүүрийн бараа сонгосон байна
            </p>
            <p className="text-[11px] text-blue-500 mt-0.5 leading-snug">
              Өөр дэлгүүрийн бараа нэмэхийн тулд сагсаа хоослоно уу
            </p>
          </div>
        </div>
      </div>

      {/* ── Brand chips ────────────────────────────────────────────────── */}
      <div className="max-w-[1280px] mx-auto px-4 md:px-6 lg:px-8 py-3 overflow-x-auto scrollbar-hide">
        <div className="flex gap-2 min-w-max">
          {brands.map((brand) => (
            <button
              key={brand}
              onClick={() => onBrandChange(brand)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap
                          transition-all duration-150
                          ${activeBrand === brand
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
            >
              {brand}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}