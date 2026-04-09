import { useState, useEffect, useRef } from 'react';
import { X, Eye, EyeOff, Phone, Lock, AlertCircle, Loader2 } from 'lucide-react';
import {
  verifyCustomerLogin,
  verifyGoogleCustomerLogin,
  formatCustomerPhoneDisplay,
} from '../lib/customersRegister';
import { loadGoogleIdentityScript, requestGoogleUserSub } from '../lib/googleIdentity';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRegisterClick: () => void;
  /**
   * Утасны нэвтрэлт: `phone` + `phoneDisplay`.
   * Google: `googleId` (OAuth `sub` эсвэл `VITE_DEV_GOOGLE_LOGIN_SUB`) + `phoneDisplay` (жишээ нь нэр).
   */
  onLoginSuccess?: (ctx: { phoneDisplay: string; phone?: number; googleId?: string }) => void;
  onForgotClick?: () => void;
}

interface FormErrors {
  phone?: string;
  password?: string;
  general?: string;
}

export function LoginModal({ isOpen, onClose, onRegisterClick, onLoginSuccess, onForgotClick }: LoginModalProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const phoneRef = useRef<HTMLInputElement>(null);

  // Mount / unmount with animation
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      // Reset state on open
      setPhone('');
      setPassword('');
      setShowPassword(false);
      setErrors({});
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Focus first input after animation
  useEffect(() => {
    if (visible) {
      const t = setTimeout(() => phoneRef.current?.focus(), 320);
      return () => clearTimeout(t);
    }
  }, [visible]);

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // ── Validation ─────────────────────────────────────────────────────────────
  function validate(): boolean {
    const next: FormErrors = {};
    if (!phone.trim()) {
      next.phone = 'Утасны дугаараа оруулна уу.';
    } else if (!/^\+?[\d\s\-]{8,15}$/.test(phone.trim())) {
      next.phone = 'Зөв утасны дугаар оруулна уу.';
    }
    if (!password) {
      next.password = 'Нууц үгээ оруулна уу.';
    } else if (password.length < 6) {
      next.password = 'Нууц үг хамгийн багадаа 6 тэмдэгт байна.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setErrors({});
    try {
      const { phone: phoneNum } = await verifyCustomerLogin(phone, password);
      onLoginSuccess?.({
        phone: phoneNum,
        phoneDisplay: formatCustomerPhoneDisplay(phoneNum),
      });
      onClose();
    } catch (err: unknown) {
      setErrors({ general: err instanceof Error ? err.message : 'Алдаа гарлаа.' });
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    setErrors({});
    try {
      const clientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim();
      if (clientId) {
        await loadGoogleIdentityScript();
        const googleId = await requestGoogleUserSub(clientId);
        await verifyGoogleCustomerLogin(googleId);
        onLoginSuccess?.({ phoneDisplay: 'Google', googleId });
        onClose();
        return;
      }

      const fromEnv = (import.meta.env.VITE_DEV_GOOGLE_LOGIN_SUB as string | undefined)?.trim();
      const googleId =
        fromEnv ||
        (import.meta.env.DEV ? 'dev-google-customer' : '');
      if (!googleId) {
        setErrors({
          general:
            'Google OAuth тохируулаагүй байна. Төсөлийн үндсэн хавтсанд .env файл үүсгээд VITE_GOOGLE_CLIENT_ID=... бичнэ үү (RegisterModal-тай ижил). DEV-д түр зуурын туршилт: VITE_DEV_GOOGLE_LOGIN_SUB эсвэл dev-google-customer мөр баазад.',
        });
        return;
      }
      await verifyGoogleCustomerLogin(googleId);
      onLoginSuccess?.({ phoneDisplay: 'Google', googleId });
      onClose();
    } catch (err: unknown) {
      setErrors({ general: err instanceof Error ? err.message : 'Google нэвтрэхэд алдаа гарлаа.' });
    } finally {
      setGoogleLoading(false);
    }
  }

  const canSubmit = phone.trim().length > 0 && password.length > 0 && !loading;

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center px-5">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={onClose}
      />

      {/* Card */}
      <div
        className="relative w-full max-w-[340px] md:max-w-[420px] bg-white rounded-2xl shadow-2xl overflow-hidden"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'scale(1) translateY(0)' : 'scale(0.94) translateY(16px)',
          transition: 'opacity 0.28s ease, transform 0.28s cubic-bezier(0.34,1.56,0.64,1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Close button ────────────────────────────────────────────────── */}
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors z-10"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>

        <div className="px-6 pt-7 pb-6">
          {/* ── Title ───────────────────────────────────────────────────────── */}
          <h2 className="text-xl font-semibold text-gray-900 mb-1">
            Нэвтрэх
          </h2>
          <p className="text-xs text-gray-400 mb-6">
            Та өөрийн бүртгэлтэй дансаараа нэвтэрнэ үү.
          </p>

          {/* ── General error ───────────────────────────────────────────────── */}
          {errors.general && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <span className="text-xs text-red-600">{errors.general}</span>
            </div>
          )}

          {/* ── Form ────────────────────────────────────────────────────────── */}
          <form onSubmit={handleLogin} noValidate className="space-y-3">
            {/* Phone */}
            <div>
              <div
                className={`flex items-center gap-3 bg-gray-50 border rounded-xl px-3.5 py-3 transition-colors ${
                  errors.phone
                    ? 'border-red-400 bg-red-50'
                    : 'border-gray-200 focus-within:border-blue-500 focus-within:bg-white'
                }`}
              >
                <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                <input
                  ref={phoneRef}
                  type="tel"
                  inputMode="tel"
                  placeholder="Утасны дугаар"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (errors.phone) setErrors((p) => ({ ...p, phone: undefined }));
                  }}
                  className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
                  autoComplete="tel"
                  disabled={loading}
                />
              </div>
              {errors.phone && (
                <p className="text-xs text-red-500 mt-1 pl-1">{errors.phone}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <div
                className={`flex items-center gap-3 bg-gray-50 border rounded-xl px-3.5 py-3 transition-colors ${
                  errors.password
                    ? 'border-red-400 bg-red-50'
                    : 'border-gray-200 focus-within:border-blue-500 focus-within:bg-white'
                }`}
              >
                <Lock className="w-4 h-4 text-gray-400 shrink-0" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Нууц үг"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
                  }}
                  className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword
                    ? <EyeOff className="w-4 h-4" />
                    : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-red-500 mt-1 pl-1">{errors.password}</p>
              )}
            </div>

            {/* Forgot password link */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => { onClose(); setTimeout(() => onForgotClick?.(), 320); }}
                className="text-xs text-blue-500 hover:text-blue-700 transition-colors"
              >
                Нууц үг мартсан?
              </button>
            </div>

            {/* Primary button */}
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium rounded-xl py-3 transition-colors mt-1"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Нэвтэрч байна...' : 'Нэвтрэх'}
            </button>
          </form>

          {/* ── Divider ─────────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">эсвэл</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Google button */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading || loading}
            className="w-full flex items-center justify-center gap-2.5 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-60 text-gray-700 text-sm font-medium rounded-xl py-2.5 transition-colors shadow-sm"
          >
            {googleLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
            ) : (
              <GoogleIcon />
            )}
            Google-ээр нэвтрэх
          </button>

          {/* ── Footer links ──────��─────────────────────────────────────────── */}
          <div className="mt-5 text-center">
            <p className="text-xs text-gray-500">
              Бүртгэл байхгүй юу?{' '}
              <button
                type="button"
                onClick={() => { onClose(); onRegisterClick(); }}
                className="text-blue-600 hover:text-blue-800 font-medium transition-colors"
              >
                Шинээр бүртгүүлэх
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Google SVG icon (official brand colors, no external lib) ──────────────────
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
        fill="#EA4335"
      />
    </svg>
  );
}