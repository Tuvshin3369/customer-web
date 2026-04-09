import { useState, useEffect } from 'react';
import { User, Package, Clock, LogOut, X, FileText } from 'lucide-react';

interface UserMenuSheetProps {
  isOpen:            boolean;
  onClose:           () => void;
  onLogout:          () => void;
  onProfileClick?:   () => void;
  onApplicationClick?: () => void;  // ← new "Анкет" handler
  onMyOrdersClick?:  () => void;
  onHistoryClick?:   () => void;  // ← new
  /** Нэвтэрсэн хэрэглэгчийн утас (байхгүй бол «Хэрэглэгч») */
  loggedInUserLabel?: string | null;
}

const MENU_ITEMS = [
  { icon: User,    label: 'Профайл' },
  { icon: Package, label: 'Миний захиалга' },
  { icon: Clock,   label: 'Худалдан авалтын түүх' },
] as const;

export function UserMenuSheet({
  isOpen,
  onClose,
  onLogout,
  onProfileClick,
  onApplicationClick,
  onMyOrdersClick,
  onHistoryClick,
  loggedInUserLabel = null,
}: UserMenuSheetProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 400);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-[140] flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.35s ease' }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="relative w-full max-w-[375px] bg-white rounded-t-2xl shadow-2xl flex flex-col"
        style={{
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.38s cubic-bezier(0.32,0.72,0,1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header row */}
        <div className="flex items-center justify-between px-5 pt-3 pb-4 shrink-0">
          <div>
            <p className="text-[11px] text-gray-400 leading-none mb-1">Сайн уу,</p>
            <h2 className="text-base font-semibold text-gray-900 leading-none">
              {loggedInUserLabel?.trim() || 'Хэрэглэгч'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
            aria-label="Хаах"
          >
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-gray-100 mx-5 shrink-0" />

        {/* Menu items */}
        <div className="px-3 py-2">
          {/* Профайл */}
          <button
            onClick={() => { onProfileClick?.(); onClose(); }}
            className="flex items-center gap-3 w-full px-3 py-3 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
          >
            <User className="w-4 h-4 text-gray-500 shrink-0" />
            <span className="text-sm text-gray-700">Профайл</span>
          </button>

          {/* Анкет — new menu item */}
          <button
            onClick={() => { onApplicationClick?.(); onClose(); }}
            className="flex items-center gap-3 w-full px-3 py-3 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
          >
            <FileText className="w-4 h-4 text-gray-500 shrink-0" />
            <span className="text-sm text-gray-700">Анкет</span>
          </button>

          {/* Миний захиалга */}
          <button
            onClick={() => { onMyOrdersClick?.(); onClose(); }}
            className="flex items-center gap-3 w-full px-3 py-3 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
          >
            <Package className="w-4 h-4 text-gray-500 shrink-0" />
            <span className="text-sm text-gray-700">Миний захиалга</span>
          </button>

          {/* Худалдан авалтын түүх */}
          <button
            onClick={() => { onHistoryClick?.(); onClose(); }}
            className="flex items-center gap-3 w-full px-3 py-3 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
          >
            <Clock className="w-4 h-4 text-gray-500 shrink-0" />
            <span className="text-sm text-gray-700">Худалдан авалтын түүх</span>
          </button>

          {/* Divider before logout */}
          <div className="h-px bg-gray-100 mx-1 my-1.5" />

          <button
            onClick={() => { onLogout(); onClose(); }}
            className="flex items-center gap-3 w-full px-3 py-3 rounded-xl hover:bg-red-50 active:bg-red-100 transition-colors text-left"
          >
            <LogOut className="w-4 h-4 text-red-400 shrink-0" />
            <span className="text-sm text-red-500">Гарах</span>
          </button>
        </div>

        {/* Safe-area bottom spacing */}
        <div className="h-6 shrink-0" />
      </div>
    </div>
  );
}