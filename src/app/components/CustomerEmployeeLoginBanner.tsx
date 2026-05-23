import { Info, X } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

/** localStorage: хэд хүртэл сануулга нуугдсаныг хадгалах (unix ms). Түлхүүр шинэчлэхэд өмнөх «хаасан» утга хүчгүй. */
export const EMPLOYEE_REGISTER_LOGIN_HINT_UNTIL_KEY =
  'customer-web-employee-register-login-hint-until-ms-v2';

/** X дарсны дараа сануулга дахин хэдэн хоногийн дараа гарна. */
export const LOGIN_HINT_SUPPRESS_MS = 14 * 24 * 60 * 60 * 1000;

interface CustomerEmployeeLoginBannerProps {
  /** Нэвтэрсэн бол сануулга хэрэггүй */
  isLoggedIn: boolean;
}

/**
 * Ажилтанаар үүссэн харилцагч: login = утас, нууц үг = утас (hash).
 * Нэвтрэхийн өмнө popup — зөвхөн X эсвэл Esc-ээр хаагдах; дорх товчинд хүлээнэ.
 */
export function CustomerEmployeeLoginBanner({ isLoggedIn }: CustomerEmployeeLoginBannerProps) {
  const [suppressedUntil, setSuppressedUntil] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(EMPLOYEE_REGISTER_LOGIN_HINT_UNTIL_KEY);
      if (raw != null && raw.trim() !== '') {
        const n = Number(raw);
        if (Number.isFinite(n) && n > 0) setSuppressedUntil(n);
      }
    } catch {
      /* noop */
    }
    setMounted(true);
  }, []);

  const suppressedActive = suppressedUntil != null && Date.now() < suppressedUntil;
  const isOpen = mounted && !isLoggedIn && !suppressedActive;

  const suppress = useCallback(() => {
    const until = Date.now() + LOGIN_HINT_SUPPRESS_MS;
    try {
      localStorage.setItem(EMPLOYEE_REGISTER_LOGIN_HINT_UNTIL_KEY, String(until));
    } catch {
      /* noop */
    }
    setSuppressedUntil(until);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const id = window.setTimeout(() => closeBtnRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') suppress();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, suppress]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[190] flex items-center justify-center p-4 md:p-6 bg-black/50 backdrop-blur-[2px]"
      aria-hidden={false}
    >
      {/* Backdrop — дарж хаадаггүй; зөвхөн X / Esc */}
      <div className="absolute inset-0" aria-hidden />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="customer-login-hint-title"
        aria-describedby="customer-login-hint-body"
        className="relative w-full max-w-[min(100%,380px)] rounded-2xl bg-white shadow-2xl ring-1 ring-amber-200/80 overflow-hidden"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 p-4 pb-3 pr-2 border-b border-amber-100 bg-gradient-to-br from-amber-50 via-white to-amber-50/40">
          <span className="mt-1 shrink-0 text-amber-600" aria-hidden>
            <Info className="w-6 h-6" strokeWidth={2.25} />
          </span>
          <div className="flex-1 min-w-0 pt-0.5">
            <h2 id="customer-login-hint-title" className="text-base font-semibold text-gray-900 leading-tight">
              Сануулга
            </h2>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={suppress}
            className="shrink-0 rounded-full p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-500 hover:bg-amber-100 hover:text-gray-900 active:bg-amber-200/70 transition-colors"
            aria-label="Хааж үргэлжлүүлэх"
            title="14 хоногоор сануулга давтагдахгүй"
          >
            <X className="w-6 h-6" strokeWidth={2} />
          </button>
        </div>

        <div className="p-4 pt-3">
          <p
            id="customer-login-hint-body"
            className="text-[14px] md:text-[15px] leading-relaxed text-gray-800 font-medium"
          >
            Та өмнө нь худалдан авалт хийж байсан мөн өөрөө бүртгүүлээгүй бол таны нэвтрэх нэр ба
            нууц үг = таны бүртгүүлсэн утасны дугаар байна. Та нэвтэрч орсоноор өмнөх түүхээ харах
            боломжтой.
          </p>
        </div>
      </div>
    </div>
  );
}
