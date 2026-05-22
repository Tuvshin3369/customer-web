import { useState, useEffect, useRef } from 'react';
import {
  X, Eye, EyeOff, Phone, Lock, Building2,
  Hash, ChevronDown, AlertCircle, Loader2, Check,
} from 'lucide-react';
import { registerCustomerWithPhone, registerCustomerWithGoogleId } from '../lib/customersRegister';
import { loadGoogleIdentityScript, requestGoogleUserSub } from '../lib/googleIdentity';

interface FormErrors {
  phone?: string;
  password?: string;
  general?: string;
}

interface RegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginClick: () => void;
}

export function RegisterModal({ isOpen, onClose, onLoginClick }: RegisterModalProps) {
  // ── Animation state ─────────────────────────���────────────────────────────
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  // ── Form state ───────────────────────────────────────────────────────────
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  /** Бүртгэл амжилттай — бааз руу POST дууссаны дараа харуулна */
  const [registerSuccessKind, setRegisterSuccessKind] = useState<null | 'phone' | 'google'>(null);

  // ── Organisation section ─────────────────────────────────────────────────
  const [orgExpanded, setOrgExpanded] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [orgRegNumber, setOrgRegNumber] = useState('');
  const orgBodyRef = useRef<HTMLDivElement>(null);
  const [orgHeight, setOrgHeight] = useState(0);

  const phoneRef = useRef<HTMLInputElement>(null);

  // ── Mount / unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      // Reset on open
      setPhone(''); setPassword(''); setShowPassword(false);
      setErrors({}); setOrgExpanded(false); setOrgName(''); setOrgRegNumber('');
      setRegisterSuccessKind(null);
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Auto-focus first field
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

  // Measure org section height for smooth expansion
  useEffect(() => {
    if (orgBodyRef.current) {
      setOrgHeight(orgExpanded ? orgBodyRef.current.scrollHeight : 0);
    }
  }, [orgExpanded, orgName, orgRegNumber]);

  // ── Validation ────────────────────────────────────────────────────────────
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

  // ── Handlers ─────────────────────────────────────────────────────────────
  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setErrors({});
    try {
      await registerCustomerWithPhone({
        phone,
        password,
        organizationName: orgName.trim() || undefined,
        register: orgRegNumber.trim() || undefined,
      });
      setRegisterSuccessKind('phone');
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
      const phoneTrim = phone.trim();
      if (phoneTrim && !/^\+?[\d\s\-]{8,15}$/.test(phoneTrim)) {
        setErrors({ phone: 'Зөв утасны дугаар оруулна уу.' });
        return;
      }
      const clientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim();
      if (!clientId) {
        throw new Error('Google OAuth тохируулаагүй байна. (VITE_GOOGLE_CLIENT_ID)');
      }
      await loadGoogleIdentityScript();
      const sub = await requestGoogleUserSub(clientId);
      await registerCustomerWithGoogleId(sub, {
        phone: phoneTrim || undefined,
        organizationName: orgName.trim() || undefined,
        register: orgRegNumber.trim() || undefined,
      });
      setRegisterSuccessKind('google');
    } catch (err: unknown) {
      setErrors({ general: err instanceof Error ? err.message : 'Алдаа гарлаа.' });
    } finally {
      setGoogleLoading(false);
    }
  }

  const canSubmit = phone.trim().length > 0 && password.length > 0 && !loading;

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center px-5">
      {/* ── Backdrop ──────────────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={onClose}
      />

      {/* ── Card ──────────────────────────────────────────────────────────── */}
      <div
        className="relative w-full max-w-[340px] md:max-w-[420px] bg-white rounded-2xl shadow-2xl overflow-hidden"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'scale(1) translateY(0)' : 'scale(0.94) translateY(16px)',
          transition: 'opacity 0.28s ease, transform 0.28s cubic-bezier(0.34,1.56,0.64,1)',
          maxHeight: '92vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Close ────────��──────────────────────────────────────────────── */}
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors z-10"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>

        <div className="px-6 pt-7 pb-6">
          {/* ── Title ────────────────────────────────────────────────────── */}
          <h2 className="text-xl font-semibold text-gray-900 mb-0.5">Бүртгүүлэх</h2>
          <p className="text-xs text-gray-400 mb-5">
            Шинэ данс үүсгэхийн тулд мэдээллээ оруулна уу.
          </p>

          {registerSuccessKind && (
            <div className="rounded-xl border border-green-200 bg-green-50/90 px-4 py-5 mb-4 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <Check className="h-6 w-6 text-green-600" strokeWidth={2.5} />
              </div>
              <p className="text-sm font-semibold text-gray-900">Бүртгэл амжилттай</p>
              <p className="mt-1.5 text-xs text-gray-600 leading-relaxed">
                {registerSuccessKind === 'phone'
                  ? 'Мэдээлэл серверт хадгалагдлаа. Одоо нэвтэрнэ үү.'
                  : 'Google дансаар бүртгэгдлээ. Утас/нууц үгээр нэвтрэхэд мөрөнд утас бөглөсөн эсэхээ шалгана уу.'}
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => { onClose(); onLoginClick(); }}
                  className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                >
                  Нэвтрэх
                </button>
                <button
                  type="button"
                  onClick={() => onClose()}
                  className="w-full rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Хаах
                </button>
              </div>
            </div>
          )}

          {/* ── General error ─────────────────────────────────────────────── */}
          {!registerSuccessKind && errors.general && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <span className="text-xs text-red-600">{errors.general}</span>
            </div>
          )}

          {/*           ════════════════════════════════════════════════════════════════
              SECTION 1 – Basic information
          ════════════════════════════════════════════════════════════════ */}
          {!registerSuccessKind && (
          <form onSubmit={handleRegister} noValidate>
            <div className="space-y-4">

              {/* Phone ──────────────────────────────────────────────────── */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Утасны дугаар <span className="text-red-500">*</span>
                </label>
                <div
                  className={`flex items-center gap-3 border rounded-xl px-3.5 py-3 transition-colors ${
                    errors.phone
                      ? 'border-red-400 bg-red-50'
                      : 'border-gray-200 bg-gray-50 focus-within:border-blue-500 focus-within:bg-white'
                  }`}
                >
                  <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                  <input
                    ref={phoneRef}
                    type="tel"
                    inputMode="tel"
                    placeholder="99112233"
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
                  <p className="flex items-center gap-1 text-xs text-red-500 mt-1.5 pl-0.5">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    {errors.phone}
                  </p>
                )}
              </div>

              {/* Password ──────────────────────────────────────────────── */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Нууц үг <span className="text-red-500">*</span>
                </label>
                <div
                  className={`flex items-center gap-3 border rounded-xl px-3.5 py-3 transition-colors ${
                    errors.password
                      ? 'border-red-400 bg-red-50'
                      : 'border-gray-200 bg-gray-50 focus-within:border-blue-500 focus-within:bg-white'
                  }`}
                >
                  <Lock className="w-4 h-4 text-gray-400 shrink-0" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Хамгийн багадаа 6 тэмдэгт"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
                    }}
                    className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
                    autoComplete="new-password"
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
                  <p className="flex items-center gap-1 text-xs text-red-500 mt-1.5 pl-0.5">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    {errors.password}
                  </p>
                )}
                {/* Password strength hint */}
                {password.length > 0 && !errors.password && (
                  <PasswordStrength password={password} />
                )}
              </div>
            </div>

            {/* ── Primary register button ──────────────────────────────── */}
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium rounded-xl py-3 transition-colors mt-5"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Бүртгэж байна...' : 'Бүртгүүлэх'}
            </button>
          </form>
          )}

          {/* ── Divider ──────────────────────────────────────────────────── */}
          {!registerSuccessKind && (
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">эсвэл</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          )}

          {/* ── Google sign-up ───────────────────────────────────────────── */}
          {!registerSuccessKind && (
          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading || loading}
            className="w-full flex items-center justify-center gap-2.5 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-60 text-gray-700 text-sm font-medium rounded-xl py-2.5 transition-colors shadow-sm"
          >
            {googleLoading
              ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              : <GoogleIcon />}
            Google-ээр бүртгүүлэх
          </button>
          )}
          {!registerSuccessKind && (
            <p className="text-[11px] text-gray-400 text-center -mt-2 mb-1 leading-relaxed">
              Google-ээр бүртгүүлэхэд утас, нууц үг заавал биш. Хүсвэл дээрх утсаа оруулж болно.
            </p>
          )}

          {/* ════════════════════════════════════════════════════════════════
              SECTION 2 – Organisation (optional, collapsible)
          ════════════════════════════════════════════════════════════════ */}
          {!registerSuccessKind && (
          <div className="mt-4 border border-gray-200 rounded-xl overflow-hidden">
            {/* Accordion header */}
            <button
              type="button"
              onClick={() => setOrgExpanded((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-gray-500" />
                <span className="text-xs font-medium text-gray-700">
                  Байгууллага бол...
                </span>
              </div>
              <ChevronDown
                className="w-4 h-4 text-gray-400 transition-transform duration-300"
                style={{ transform: orgExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
              />
            </button>

            {/* Accordion body — smooth height transition */}
            <div
              style={{
                maxHeight: orgExpanded ? `${orgHeight}px` : '0px',
                transition: 'max-height 0.32s cubic-bezier(0.4,0,0.2,1)',
                overflow: 'hidden',
              }}
            >
              <div ref={orgBodyRef} className="px-4 py-4 space-y-4 bg-white">
                {/* Org name */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Байгууллагын нэр
                  </label>
                  <div className="flex items-center gap-3 border border-gray-200 bg-gray-50 focus-within:border-blue-500 focus-within:bg-white rounded-xl px-3.5 py-3 transition-colors">
                    <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
                    <input
                      type="text"
                      placeholder="ХХК, ХНН гэх мэт"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
                      autoComplete="organization"
                      disabled={loading}
                    />
                  </div>
                </div>

                {/* Registration number */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Регистрийн дугаар
                  </label>
                  <div className="flex items-center gap-3 border border-gray-200 bg-gray-50 focus-within:border-blue-500 focus-within:bg-white rounded-xl px-3.5 py-3 transition-colors">
                    <Hash className="w-4 h-4 text-gray-400 shrink-0" />
                    <input
                      type="text"
                      placeholder="1234567890"
                      value={orgRegNumber}
                      onChange={(e) => setOrgRegNumber(e.target.value)}
                      className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
                      inputMode="numeric"
                      disabled={loading}
                    />
                  </div>
                </div>

                {/* Info note */}
                <p className="text-xs text-gray-400 leading-relaxed">
                  Байгууллагын мэдээлэл оруулснаар таны данс бизнесийн эрхтэйгээр
                  холбогдоно.
                </p>
              </div>
            </div>
          </div>
          )}

          {/* ── Footer ───────────────────────────────────────────────────── */}
          {!registerSuccessKind && (
          <div className="mt-5 text-center">
            <p className="text-xs text-gray-500">
              Бүртгэлтэй юу?{' '}
              <button
                type="button"
                onClick={() => { onClose(); onLoginClick(); }}
                className="text-blue-600 hover:text-blue-800 font-medium transition-colors"
              >
                Нэвтрэх
              </button>
            </p>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Password strength bar ─────────────────────────────────────────────────────
function PasswordStrength({ password }: { password: string }) {
  const score = (() => {
    let s = 0;
    if (password.length >= 6) s++;
    if (password.length >= 10) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/[0-9]/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return s;
  })();

  const label = ['Маш сул', 'Сул', 'Дунд', 'Хүчтэй', 'Маш хүчтэй'][Math.min(score - 1, 4)];
  const colors = ['bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-green-400', 'bg-emerald-500'];
  const color = colors[Math.min(score - 1, 4)];

  return (
    <div className="mt-2 px-0.5">
      <div className="flex gap-1 mb-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={`flex-1 h-1 rounded-full transition-colors duration-300 ${
              i < score ? color : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
}

// ── Google SVG icon (official brand colors) ───────────────────────────────────
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853" />
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05" />
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335" />
    </svg>
  );
}