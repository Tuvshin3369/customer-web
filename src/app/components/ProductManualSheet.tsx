'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink } from 'lucide-react';

export interface ProductManualSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** products.product_manual — ихэнхдээ PDF/storage URL */
  url: string;
  productName?: string;
}

/**
 * Барааны заавар — mobile first: бүтэн дэлгэц, том товч, safe-area, iframe + гадаад нээлт.
 */
export function ProductManualSheet({ isOpen, onClose, url, productName }: ProductManualSheetProps) {
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const ui = (
    <div
      className="fixed inset-0 z-[240] flex flex-col bg-gray-950"
      role="dialog"
      aria-modal="true"
      aria-label="Барааны заавар"
    >
      <header
        className="shrink-0 flex items-center justify-between gap-3 px-4 border-b border-white/10 bg-gray-950"
        style={{ paddingTop: 'max(12px, env(safe-area-inset-top))', paddingBottom: '12px' }}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Заавар</p>
          {productName ? (
            <p className="text-sm font-semibold text-white truncate mt-0.5">{productName}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-white/10 text-white active:bg-white/20 touch-manipulation"
          aria-label="Хаах"
        >
          <X className="w-5 h-5" strokeWidth={2} />
        </button>
      </header>

      <div className="flex-1 min-h-0 flex flex-col bg-black">
        <iframe
          title="Заавар баримт"
          src={url}
          className="flex-1 w-full min-h-0 border-0 bg-white"
        />
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 flex items-center justify-center gap-2 py-3.5 px-4 bg-gray-900 text-sm font-semibold text-sky-400 active:bg-gray-800 touch-manipulation border-t border-white/10"
          style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}
        >
          <ExternalLink className="w-4 h-4 shrink-0" />
          Шинэ цонхонд нээх
        </a>
      </div>
    </div>
  );

  return createPortal(ui, document.body);
}
