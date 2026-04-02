import { useState, useEffect, useRef } from 'react';
import {
  Phone, Home, ShoppingCart, Car, Menu,
  User, Package, Clock, LogOut, Search, X, ClipboardList, HardHat, FileText,
} from 'lucide-react';

interface HeaderProps {
  brandName:             string;
  onContactClick:        () => void;
  /** Зүүн дээд hamburger — mobile болон desktop */
  onHamburgerClick?:     () => void;
  onHomeClick?:          () => void;
  onCarClick?:           () => void;
  onCartClick?:          () => void;
  onJobsClick?:          () => void;   // ← new "Ажил" button
  onLoginClick?:         () => void;
  onLogout?:             () => void;
  onProfileClick?:       () => void;
  onApplicationClick?:   () => void;   // ← new "Анкет" handler
  onMyOrdersClick?:      () => void;
  onHistoryClick?:       () => void;
  onGuestOrdersClick?:   () => void;   // ← guest "Захиалга" button
  isLoggedIn?:           boolean;
  cartCount?:            number;
  searchValue?:          string;
  onSearchChange?:       (q: string) => void;
}

const USER_MENU_ITEMS = [
  { icon: User,     label: 'Профайл' },
  { icon: FileText, label: 'Анкет' },
  { icon: Package,  label: 'Миний захиалга' },
  { icon: Clock,    label: 'Худалдан авалтын түүх' },
] as const;

// ── Messenger SVG — unique gradientId prevents DOM id collision ──────────────
function MessengerIcon({
  size      = 22,
  gradId    = 'msgGrad',
  className = '',
}: {
  size?:      number;
  gradId?:    string;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <circle cx="14" cy="14" r="14" fill={`url(#${gradId})`} />
      <path
        d="M14 6C9.58 6 6 9.34 6 13.5C6 15.67 7.03 17.59 8.69 18.83V22L11.75 20.37C12.46 20.56 13.21 20.67 14 20.67C18.42 20.67 22 17.33 22 13.17C22 9.01 18.42 6 14 6ZM15.19 15.71L12.88 13.28L8.4 15.71L13.35 10.46L15.71 12.89L20.13 10.46L15.19 15.71Z"
        fill="white"
      />
      <defs>
        <linearGradient id={gradId} x1="14" y1="0" x2="14" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00B2FF" />
          <stop offset="1" stopColor="#006AFF" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ── Bottom tooltip — always renders below the trigger, never clips at top ────
function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative group/tip">
      {children}

      {/*
        Position: top-full  = below the trigger
        mt-2                = 8px vertical gap
        Slide: starts at translateY(4px), moves to translateY(0) on hover
        Opacity: 0 → 1
      */}
      <div
        className={[
          'absolute top-full left-1/2 -translate-x-1/2',
          'mt-2',
          'bg-[#111111] text-white',
          'text-xs px-3 py-2 rounded-md',
          'whitespace-nowrap z-[70]',
          'pointer-events-none select-none',
          // Visibility
          'opacity-0 group-hover/tip:opacity-100',
          // Slide
          'translate-y-1 group-hover/tip:translate-y-0',
          'transition-all duration-150 ease-out',
        ].join(' ')}
      >
        {/* Upward caret — points toward trigger */}
        <span
          className="absolute -top-[7px] left-1/2 -translate-x-1/2"
          style={{
            width: 0, height: 0,
            borderLeft:   '5px solid transparent',
            borderRight:  '5px solid transparent',
            borderBottom: '7px solid #111111',
          }}
        />
        {label}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function Header({
  brandName,
  onContactClick,
  onHamburgerClick,
  onHomeClick,
  onCarClick,
  onCartClick,
  onJobsClick,
  onLoginClick,
  onLogout,
  onProfileClick,
  onApplicationClick,
  onMyOrdersClick,
  onHistoryClick,
  onGuestOrdersClick,
  isLoggedIn  = false,
  cartCount   = 0,
  searchValue = '',
  onSearchChange,
}: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // ── Cross-fade when store name changes ────────────────────────────────────
  // Fade out (80ms) → swap text → fade in (150ms).
  // If brandName changes but resolves to the same store, this still handles it
  // gracefully since the displayed text is compared, not the prop identity.
  const [displayName, setDisplayName] = useState(brandName);
  const [nameOpacity, setNameOpacity] = useState(1);

  useEffect(() => {
    if (brandName === displayName) return;
    // Fade out
    setNameOpacity(0);
    const swap = setTimeout(() => {
      setDisplayName(brandName);
      setNameOpacity(1);        // fade in
    }, 90);
    return () => clearTimeout(swap);
  }, [brandName]);
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setIsMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isMenuOpen]);

  useEffect(() => {
    if (!isMenuOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMenuOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isMenuOpen]);

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
      <div className="max-w-[1280px] mx-auto px-4 md:px-6 lg:px-8">

        {/* ════════════════════════════════════════════════════════════════════
            MOBILE  (< md) — untouched
            ════════════════════════════════════════════════════════════════════ */}
        <div className="flex items-center justify-between py-3 md:hidden">
          <div className="flex-1 flex justify-start items-center min-w-0">
            <button
              type="button"
              onClick={() => onHamburgerClick?.()}
              aria-label="Цэс нээх"
              className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors shrink-0"
            >
              <Menu className="w-6 h-6 text-gray-800" strokeWidth={2} />
            </button>
          </div>

          {/* Center: store name with fade transition */}
          <h1
            className="text-lg font-semibold text-gray-900 text-center shrink-0"
            style={{ opacity: nameOpacity, transition: 'opacity 0.15s ease-out' }}
          >
            {displayName}
          </h1>

          <div className="flex-1 flex items-center justify-end gap-1">
            <button
              onClick={onContactClick}
              aria-label="Холбоо барих"
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <Phone className="w-5 h-5 text-gray-700" />
            </button>
            <a
              href="https://m.me/YOUR_PAGE_USERNAME"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Messenger-ээр холбогдох"
              className="p-2 hover:bg-gray-100 rounded-full transition-all
                         active:scale-90 cursor-pointer"
            >
              {/* unique gradId avoids SVG def collision with desktop instance */}
              <MessengerIcon size={20} gradId="msgGradMobile" />
            </a>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════════
            TABLET / DESKTOP  (md+)
            LEFT : Brand ——32px—— [Contact  20px  Messenger]
            CENTER: Нүүр ——24px—— [Search field  min-320px]
            RIGHT : [Миний  20px  Cart  20px  Car]
            ════════════════════════════════════════════════════════════════════ */}
        <div className="hidden md:flex items-center py-4" style={{ gap: '16px' }}>

          {/* ── LEFT ────────────────────────────────────────────────────────── */}
          <div className="flex items-center shrink-0" style={{ gap: '32px' }}>

            <button
              type="button"
              onClick={() => onHamburgerClick?.()}
              aria-label="Цэс нээх"
              className="flex items-center justify-center rounded-full transition-colors shrink-0
                         text-gray-700 hover:bg-gray-100 hover:text-blue-600"
              style={{ width: 40, height: 40 }}
            >
              <Menu style={{ width: 24, height: 24 }} strokeWidth={2} />
            </button>

            {/* Brand name with fade transition */}
            <span
              className="text-base font-semibold text-gray-900 truncate max-w-[160px] lg:max-w-[200px]"
              style={{ opacity: nameOpacity, transition: 'opacity 0.15s ease-out' }}
            >
              {displayName}
            </span>

            {/* Contact + Messenger — 20px apart, 22px icons, no bg bubble by default */}
            <div className="flex items-center" style={{ gap: '20px' }}>

              <Tooltip label="Холбоо барих">
                <button
                  onClick={onContactClick}
                  aria-label="Холбоо барих"
                  className="flex items-center justify-center rounded-full transition-colors
                             text-gray-600 hover:text-blue-600"
                  style={{ width: 32, height: 32 }}
                >
                  <Phone style={{ width: 22, height: 22 }} />
                </button>
              </Tooltip>

              <Tooltip label="Messenger-ээр холбогдох">
                <a
                  href="https://m.me/YOUR_PAGE_USERNAME"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Messenger-ээр холбогдох"
                  className="flex items-center justify-center rounded-full transition-all
                             hover:opacity-80 active:scale-90 cursor-pointer"
                  style={{ width: 32, height: 32 }}
                >
                  <MessengerIcon size={22} gradId="msgGradDesktop" />
                </a>
              </Tooltip>

            </div>
          </div>

          {/* ── CENTER ───────────────────────────────────────────────────────── */}
          {/* marginLeft: 64px → total Messenger→Нүүр gap = 80px (5× original 16px) */}
          <div className="flex-1 flex items-center min-w-0" style={{ gap: '24px', marginLeft: '64px' }}>

            {/* Нүүр */}
            <button
              onClick={onHomeClick}
              className="flex items-center gap-1.5 shrink-0 text-sm font-medium
                         text-gray-700 hover:text-blue-600 transition-colors"
            >
              <Home className="w-4 h-4" />
              Нүүр
            </button>

            {/* Search field — min 320px, flex-1 capped at ~480px */}
            <div className="relative flex-1" style={{ minWidth: 320, maxWidth: 480 }}>
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                style={{ width: 16, height: 16 }}
              />
              <input
                type="text"
                value={searchValue}
                onChange={e => onSearchChange?.(e.target.value)}
                placeholder="Хайх бараагаа бичнэ үү..."
                className="w-full pl-9 pr-8 py-2 bg-gray-100 rounded-lg border-0 outline-none
                           text-sm text-gray-800 placeholder-gray-400
                           focus:ring-2 focus:ring-blue-500 transition-shadow"
              />
              {searchValue && (
                <button
                  onClick={() => onSearchChange?.('')}
                  aria-label="Хайлт цэвэрлэх"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2
                             text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X style={{ width: 14, height: 14 }} />
                </button>
              )}
            </div>
          </div>

          {/* ── RIGHT ────────────────────────────────────────────────────────── */}
          <div className="flex items-center shrink-0" style={{ gap: '20px' }}>

            {/* Миний (logged-in dropdown) or Нэвтрэх */}
            {isLoggedIn ? (
              <div ref={menuRef} className="relative">
                <button
                  onClick={() => setIsMenuOpen(v => !v)}
                  aria-label="Миний цэс"
                  aria-expanded={isMenuOpen}
                  className="flex items-center gap-1.5 px-3 py-2
                             hover:bg-gray-100 rounded-xl transition-colors"
                >
                  <Menu className="w-4 h-4 text-gray-700" />
                  <span className="text-sm font-medium text-gray-700">Миний</span>
                </button>

                {/* Dropdown */}
                <div
                  className="absolute right-0 top-full mt-2 w-56 bg-white
                             rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
                  style={{
                    opacity:       isMenuOpen ? 1 : 0,
                    transform:     isMenuOpen ? 'translateY(0)' : 'translateY(-8px)',
                    pointerEvents: isMenuOpen ? 'auto' : 'none',
                    transition:    'opacity 0.18s ease, transform 0.18s ease',
                    zIndex: 60,
                  }}
                  aria-hidden={!isMenuOpen}
                >
                  <div className="px-4 pt-4 pb-3">
                    <p className="text-[10px] text-gray-400 leading-none mb-0.5">Сайн уу,</p>
                    <p className="text-sm font-semibold text-gray-900 leading-snug">Хэрэглэгч</p>
                  </div>
                  <div className="h-px bg-gray-100 mx-3" />
                  <div className="px-2 py-2">
                    {USER_MENU_ITEMS.map(({ icon: Icon, label }) => (
                      <button
                        key={label}
                        onClick={() => {
                          if (label === 'Профайл')                  { onProfileClick?.();     setIsMenuOpen(false); }
                          if (label === 'Анкет')                    { onApplicationClick?.(); setIsMenuOpen(false); }
                          if (label === 'Миний захиалга')           { onMyOrdersClick?.();    setIsMenuOpen(false); }
                          if (label === 'Худалдан авалтын түүх')    { onHistoryClick?.();     setIsMenuOpen(false); }
                        }}
                        className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl
                                   hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
                      >
                        <Icon className="w-4 h-4 text-gray-400 shrink-0" />
                        <span className="text-sm text-gray-700">{label}</span>
                      </button>
                    ))}
                    <div className="h-px bg-gray-100 mx-1 my-1.5" />
                    <button
                      onClick={() => { onLogout?.(); setIsMenuOpen(false); }}
                      className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl
                                 hover:bg-red-50 active:bg-red-100 transition-colors text-left"
                    >
                      <LogOut className="w-4 h-4 text-red-400 shrink-0" />
                      <span className="text-sm text-red-500">Гарах</span>
                    </button>
                  </div>
                  <div className="h-2" />
                </div>
              </div>
            ) : (
              <button
                onClick={onLoginClick}
                aria-label="Нэвтрэх"
                className="flex items-center gap-1.5 px-3 py-2
                           hover:bg-gray-100 rounded-xl transition-colors"
              >
                <User className="w-[18px] h-[18px] text-gray-700" />
                <span className="text-sm font-medium text-gray-700">Нэвтрэх</span>
              </button>
            )}

            {/* Сагс — icon only, no tooltip needed */}
            <button
              onClick={onCartClick}
              aria-label="Сагс"
              className="relative flex items-center justify-center rounded-full transition-colors
                         text-gray-600 hover:text-blue-600"
              style={{ width: 36, height: 36 }}
            >
              <ShoppingCart style={{ width: 22, height: 22 }} />
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-[3px]
                                 flex items-center justify-center rounded-full bg-blue-600
                                 text-white text-[9px] font-bold leading-none pointer-events-none">
                  {cartCount > 99 ? '99+' : cartCount}
                </span>
              )}
            </button>

            {/* Захиалга — guests only, between Сагс and Машин */}
            {!isLoggedIn && (
              <Tooltip label="Захиалга">
                <button
                  onClick={onGuestOrdersClick}
                  aria-label="Захиалга"
                  className="flex items-center justify-center rounded-full transition-colors
                             text-gray-600 hover:text-blue-600"
                  style={{ width: 36, height: 36 }}
                >
                  <ClipboardList style={{ width: 22, height: 22 }} />
                </button>
              </Tooltip>
            )}

            {/* Ажил — new button between Захиалга and Машин */}
            <Tooltip label="Ажил">
              <button
                onClick={onJobsClick}
                aria-label="Ажил"
                className="flex items-center justify-center rounded-full transition-colors
                           text-gray-600 hover:text-blue-600"
                style={{ width: 36, height: 36 }}
              >
                <HardHat style={{ width: 22, height: 22 }} />
              </button>
            </Tooltip>

            {/* Машин — icon only + bottom tooltip */}
            <Tooltip label="Машин">
              <button
                onClick={onCarClick}
                aria-label="Машин"
                className="flex items-center justify-center rounded-full transition-colors
                           text-gray-600 hover:text-blue-600"
                style={{ width: 36, height: 36 }}
              >
                <Car style={{ width: 22, height: 22 }} />
              </button>
            </Tooltip>

          </div>
        </div>
        {/* ── end tablet/desktop row ── */}

      </div>
    </header>
  );
}