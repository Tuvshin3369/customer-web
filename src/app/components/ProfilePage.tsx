import { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft, Phone, PhoneCall, Building2,
  Hash, Lock, Eye, EyeOff, Check, Loader2,
} from 'lucide-react';

// ── Save-state machine ───────────────────────────────────────────────────────
type SaveState = 'idle' | 'loading' | 'success';

interface ProfilePageProps {
  isOpen:         boolean;
  onClose:        () => void;
  onSaveSuccess?: () => void;  // called after success → App drives navigation
}

// ── Toast ────────────────────────────────────────────────────────────────────
function ProfileToast({ visible }: { visible: boolean }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute left-0 right-0 top-0 flex justify-center px-4 pt-3 z-20"
      style={{
        opacity:    visible ? 1 : 0,
        transform:  visible ? 'translateY(0)' : 'translateY(-10px)',
        transition: 'opacity 0.22s ease, transform 0.22s ease',
      }}
    >
      <div className="flex items-center gap-2 bg-gray-900/90 text-white text-xs px-4 py-2.5 rounded-full shadow-lg backdrop-blur-sm">
        <Check className="w-3.5 h-3.5 text-green-400 shrink-0" />
        Профайлын мэдээлэл амжилттай шинэчлэгдлээ
      </div>
    </div>
  );
}

// ── Reusable field wrappers ──────────────────────────────────────────────────
function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5">
      <label className="block text-xs font-medium text-gray-600">{children}</label>
      {hint && <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{hint}</p>}
    </div>
  );
}

interface InputRowProps {
  icon:      React.ReactNode;
  readonly?: boolean;
  children:  React.ReactNode;
}
function InputRow({ icon, readonly, children }: InputRowProps) {
  return (
    <div className={`flex items-center gap-2.5 border rounded-xl px-3.5 py-3 transition-colors ${
      readonly
        ? 'border-gray-200 bg-gray-100 cursor-not-allowed'
        : 'border-gray-200 bg-gray-50 focus-within:border-blue-500 focus-within:bg-white'
    }`}>
      <span className="shrink-0 text-gray-400">{icon}</span>
      {children}
    </div>
  );
}

// ── Section card ───────────────────────────────────────��─────────────────────
function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 pt-4 pb-3">
        <h3 className="text-sm font-semibold text-gray-800 tracking-tight">{title}</h3>
      </div>
      <div className="h-px bg-gray-100" />
      <div className="px-4 pt-4 pb-5 space-y-4">
        {children}
      </div>
    </div>
  );
}

// ── Save button ──────────────────────────────────────────────────────────────
interface SaveButtonProps {
  saveState: SaveState;
  btnScale:  number;
  onClick:   () => void;
}
function SaveButton({ saveState, btnScale, onClick }: SaveButtonProps) {
  const isLoading = saveState === 'loading';
  const isSuccess = saveState === 'success';

  return (
    <button
      onClick={onClick}
      disabled={isLoading || isSuccess}
      style={{
        transform:  `scale(${btnScale})`,
        transition: 'background-color 0.2s ease, transform 0.15s ease',
      }}
      className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold disabled:cursor-not-allowed ${
        isSuccess
          ? 'bg-green-500 text-white'
          : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98]'
      }`}
    >
      {isLoading && (
        <>
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          Хадгалж байна…
        </>
      )}
      {isSuccess && (
        <>
          <Check className="w-4 h-4 shrink-0" />
          Хадгалагдлаа
        </>
      )}
      {saveState === 'idle' && 'Өөрчлөлт хадгалах'}
    </button>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export function ProfilePage({ isOpen, onClose, onSaveSuccess }: ProfilePageProps) {
  const [mounted,   setMounted]   = useState(false);
  const [visible,   setVisible]   = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [showToast, setShowToast] = useState(false);
  const [btnScale,  setBtnScale]  = useState(1);

  // When true, scroll-lock cleanup will scroll to 0 instead of restoring savedY
  const navigateToHome = useRef(false);

  // Ref to scroll the inner body to top after save
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Personal info (UI only) ─────────────────────────────────────────────
  const [extraPhone,      setExtraPhone]      = useState('');
  const [orgName,         setOrgName]         = useState('');
  const [register,        setRegister]        = useState('');
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPwd,      setShowNewPwd]      = useState(false);
  const [showConfirmPwd,  setShowConfirmPwd]  = useState(false);

  // ── Mount / unmount with slide animation ──────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      setSaveState('idle');
      setShowToast(false);
      setBtnScale(1);
      navigateToHome.current = false;
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 250);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // ── Body scroll lock ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top      = `-${scrollY}px`;
    document.body.style.width    = '100%';
    return () => {
      const savedY = Math.abs(parseInt(document.body.style.top || '0', 10));
      document.body.style.position = '';
      document.body.style.top      = '';
      document.body.style.width    = '';
      // Navigate-to-home flow: always land at scroll 0
      window.scrollTo(0, navigateToHome.current ? 0 : savedY);
      navigateToHome.current = false;
    };
  }, [isOpen]);

  // ── Save handler ──────────────────────────────────────────────────────────
  function handleSave() {
    if (saveState !== 'idle') return;

    // 1. Start loading
    setSaveState('loading');

    // 2. Simulate async (1.3s) → success
    setTimeout(() => {
      setSaveState('success');

      // Scale micro-animation: 1 → 1.02 → 1
      setBtnScale(1.02);
      setTimeout(() => setBtnScale(1), 180);

      // Show inline toast + scroll inner area to top
      setShowToast(true);
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });

      // 3. After 1.5s success display → delegate close + navigation to App
      setTimeout(() => {
        navigateToHome.current = true;  // skip scroll restore in cleanup
        onSaveSuccess?.();              // App sets isProfileOpen=false + home state
      }, 1500);

    }, 1300);
  }

  if (!mounted) return null;

  return (
    <div
      className="fixed inset-0 z-[160] bg-gray-50 flex flex-col"
      style={{
        transform:  visible ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.22s cubic-bezier(0.32,0.72,0,1)',
      }}
    >
      {/* ── Top header ──────────────────────────────────────────────────────── */}
      <header className="shrink-0 bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-[640px] mx-auto flex items-center gap-3 px-4 py-3">
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors -ml-1"
            aria-label="Буцах"
          >
            <ChevronLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-base font-semibold text-gray-900 flex-1">Миний профайл</h1>
        </div>
      </header>

      {/* ── Scrollable body ──────────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain pb-28 md:pb-10 relative"
      >
        {/* Toast — floats inside scrollable area, pinned to top */}
        <ProfileToast visible={showToast} />

        <div className="max-w-[640px] mx-auto px-4 pt-5 space-y-4">

          {/* ── Section 1: Хувийн мэдээлэл ──────────────────────────────────── */}
          <SectionCard title="Хувийн мэдээлэл">

            {/* Утасны дугаар — readonly */}
            <div>
              <FieldLabel>Утасны дугаар</FieldLabel>
              <InputRow icon={<Phone className="w-4 h-4" />} readonly>
                <input
                  type="tel"
                  value="9900 0000"
                  readOnly
                  tabIndex={-1}
                  className="flex-1 bg-transparent text-sm text-gray-400 outline-none cursor-not-allowed select-none"
                />
              </InputRow>
            </div>

            {/* Нэмэлт утас */}
            <div>
              <FieldLabel>Нэмэлт утас</FieldLabel>
              <InputRow icon={<PhoneCall className="w-4 h-4" />}>
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder="9911 2233"
                  value={extraPhone}
                  onChange={e => setExtraPhone(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
                />
              </InputRow>
            </div>

            {/* Байгууллагын нэр */}
            <div>
              <FieldLabel>Байгууллагын нэр</FieldLabel>
              <InputRow icon={<Building2 className="w-4 h-4" />}>
                <input
                  type="text"
                  placeholder="Компанийн нэр"
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
                />
              </InputRow>
            </div>

            {/* Регистер */}
            <div>
              <FieldLabel>Регистер</FieldLabel>
              <InputRow icon={<Hash className="w-4 h-4" />}>
                <input
                  type="text"
                  placeholder="АА00000000"
                  value={register}
                  onChange={e => setRegister(e.target.value.toUpperCase())}
                  maxLength={10}
                  className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
                />
              </InputRow>
            </div>
          </SectionCard>

          {/* ── Section 2: Нууц үг ───────────────────────────────────────────── */}
          <SectionCard title="Нууц үг">

            {/* Шинэ нууц үг */}
            <div>
              <FieldLabel hint="Хэрэв солихгүй бол хоосон үлдээнэ үү">
                Шинэ нууц үг
              </FieldLabel>
              <InputRow icon={<Lock className="w-4 h-4" />}>
                <input
                  type={showNewPwd ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPwd(v => !v)}
                  className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                  aria-label={showNewPwd ? 'Нуух' : 'Харуулах'}
                >
                  {showNewPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </InputRow>
            </div>

            {/* Нууц үг давтах */}
            <div>
              <FieldLabel hint="Хэрэв солихгүй бол хоосон үлдээнэ үү">
                Нууц үг давтах
              </FieldLabel>
              <InputRow icon={<Lock className="w-4 h-4" />}>
                <input
                  type={showConfirmPwd ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPwd(v => !v)}
                  className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                  aria-label={showConfirmPwd ? 'Нуух' : 'Харуулах'}
                >
                  {showConfirmPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </InputRow>
            </div>
          </SectionCard>

          {/* ── Desktop inline save button ───────────────────────────────────── */}
          <div className="hidden md:block pt-1 pb-6">
            <SaveButton saveState={saveState} btnScale={btnScale} onClick={handleSave} />
          </div>

        </div>
      </div>

      {/* ── Mobile sticky save button ────────────────────────────────────────── */}
      <div className="md:hidden shrink-0 bg-white border-t border-gray-100 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        <div className="max-w-[640px] mx-auto">
          <SaveButton saveState={saveState} btnScale={btnScale} onClick={handleSave} />
        </div>
      </div>
    </div>
  );
}