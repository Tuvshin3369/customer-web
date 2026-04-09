import { useState, useEffect, useRef, useMemo } from 'react';
import {
  ChevronLeft, PhoneCall, Building2,
  Hash, Lock, Eye, EyeOff, Check, Loader2, AlertCircle,
} from 'lucide-react';
import {
  fetchCustomerProfileByPhone,
  updateCustomerProfileByPhone,
  formatCustomerPhoneDisplay,
  type CustomerProfileSnapshot,
} from '../lib/customersRegister';

// ── Save-state machine ───────────────────────────────────────────────────────
type SaveState = 'idle' | 'loading' | 'success';

interface ProfilePageProps {
  isOpen:         boolean;
  onClose:        () => void;
  onSaveSuccess?: () => void;
  /** Утас + нууц үгээр нэвтэрсэн үед — баазын customers.phone */
  customerPhone:   number | null;
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

interface SaveButtonProps {
  saveState: SaveState;
  btnScale:  number;
  disabled:  boolean;
  onClick:   () => void;
}
function SaveButton({ saveState, btnScale, disabled, onClick }: SaveButtonProps) {
  const isLoading = saveState === 'loading';
  const isSuccess = saveState === 'success';
  const isDisabled = disabled || isLoading || isSuccess;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      style={{
        transform:  `scale(${btnScale})`,
        transition: 'background-color 0.2s ease, transform 0.15s ease',
      }}
      className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold disabled:cursor-not-allowed ${
        isSuccess
          ? 'bg-green-500 text-white'
          : isDisabled
            ? 'bg-gray-300 text-gray-500'
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
export function ProfilePage({ isOpen, onClose, onSaveSuccess, customerPhone }: ProfilePageProps) {
  const [mounted,   setMounted]   = useState(false);
  const [visible,   setVisible]   = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [showToast, setShowToast] = useState(false);
  const [btnScale,  setBtnScale]  = useState(1);

  const navigateToHome = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [baseline, setBaseline] = useState<CustomerProfileSnapshot | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<{ password?: string; general?: string }>({});

  const [extraPhone,      setExtraPhone]      = useState('');
  const [orgName,         setOrgName]         = useState('');
  const [register,        setRegister]        = useState('');
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPwd,      setShowNewPwd]      = useState(false);
  const [showConfirmPwd,  setShowConfirmPwd]  = useState(false);

  const headerTitle =
    customerPhone != null
      ? `Миний профайл ${formatCustomerPhoneDisplay(customerPhone)}`
      : 'Миний профайл';

  const dirty = useMemo(() => {
    if (baseline === null || customerPhone == null) return false;
    const addDigits = extraPhone.replace(/\D/g, '').slice(0, 8);
    const baseAdd = baseline.additional_phone.replace(/\D/g, '').slice(0, 8);
    if (addDigits !== baseAdd) return true;
    if (orgName.trim() !== baseline.organization_name) return true;
    if (register.trim().toUpperCase() !== baseline.register) return true;
    if (newPassword.trim() !== '' || confirmPassword.trim() !== '') return true;
    return false;
  }, [baseline, customerPhone, extraPhone, orgName, register, newPassword, confirmPassword]);

  const canSave =
    dirty &&
    saveState === 'idle' &&
    !isLoadingProfile &&
    baseline !== null &&
    customerPhone != null;

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      setSaveState('idle');
      setShowToast(false);
      setBtnScale(1);
      setFormErrors({});
      navigateToHome.current = false;
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 250);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (customerPhone == null) {
      setBaseline(null);
      setLoadError(null);
      setIsLoadingProfile(false);
      setExtraPhone('');
      setOrgName('');
      setRegister('');
      setNewPassword('');
      setConfirmPassword('');
      return;
    }

    let cancelled = false;
    setIsLoadingProfile(true);
    setLoadError(null);

    fetchCustomerProfileByPhone(customerPhone)
      .then((snap) => {
        if (cancelled) return;
        const add8 = snap.additional_phone.replace(/\D/g, '').slice(0, 8);
        const normSnap: CustomerProfileSnapshot = {
          ...snap,
          additional_phone: add8,
        };
        setBaseline(normSnap);
        setExtraPhone(add8);
        setOrgName(snap.organization_name);
        setRegister(snap.register);
        setNewPassword('');
        setConfirmPassword('');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : 'Алдаа гарлаа.');
        setBaseline(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingProfile(false);
      });

    return () => { cancelled = true; };
  }, [isOpen, customerPhone]);

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
      window.scrollTo(0, navigateToHome.current ? 0 : savedY);
      navigateToHome.current = false;
    };
  }, [isOpen]);

  async function handleSave() {
    if (!canSave || customerPhone == null || baseline === null) return;

    const pwd = newPassword.trim();
    const cpwd = confirmPassword.trim();
    if (pwd !== '' || cpwd !== '') {
      if (pwd !== cpwd) {
        setFormErrors({ password: 'Нууц үг таарахгүй байна.' });
        return;
      }
      if (pwd.length < 6) {
        setFormErrors({ password: 'Нууц үг хамгийн багадаа 6 тэмдэгт байна.' });
        return;
      }
    }
    setFormErrors({});
    setSaveState('loading');

    try {
      await updateCustomerProfileByPhone({
        phone: customerPhone,
        baseline,
        additional_phone: extraPhone,
        organization_name: orgName,
        register,
        newPassword: pwd === '' ? undefined : pwd,
      });

      const addDigits = extraPhone.replace(/\D/g, '').slice(0, 8);
      const nextBaseline: CustomerProfileSnapshot = {
        additional_phone: addDigits,
        organization_name: orgName.trim(),
        register: register.trim().toUpperCase(),
      };
      setBaseline(nextBaseline);
      setNewPassword('');
      setConfirmPassword('');

      setSaveState('success');
      setBtnScale(1.02);
      setTimeout(() => setBtnScale(1), 180);
      setShowToast(true);
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });

      setTimeout(() => {
        navigateToHome.current = true;
        onSaveSuccess?.();
      }, 1500);
    } catch (e: unknown) {
      setSaveState('idle');
      setFormErrors({ general: e instanceof Error ? e.message : 'Хадгалахад алдаа гарлаа.' });
    }
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
      <header className="shrink-0 bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-[640px] mx-auto flex items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors -ml-1"
            aria-label="Буцах"
          >
            <ChevronLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-base font-semibold text-gray-900 flex-1 min-w-0 truncate">{headerTitle}</h1>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain pb-28 md:pb-10 relative"
      >
        <ProfileToast visible={showToast} />

        <div className="max-w-[640px] mx-auto px-4 pt-5 space-y-4">
          {customerPhone == null && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Профайлын мэдээллийг ачаалахын тулд утасны дугаар + нууц үгээр нэвтэрнэ үү. (Google-ээр нэвтэрсэн
              тохиолдолд одоогоор энэ хуудас ажиллахгүй.)
            </div>
          )}

          {customerPhone != null && isLoadingProfile && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-500">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p className="text-sm">Ачаалж байна…</p>
            </div>
          )}

          {customerPhone != null && loadError && !isLoadingProfile && (
            <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{loadError}</span>
            </div>
          )}

          {formErrors.general && (
            <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{formErrors.general}</span>
            </div>
          )}

          {customerPhone != null && baseline !== null && !isLoadingProfile && (
            <>
              <SectionCard title="Хувийн мэдээлэл">
                <div>
                  <FieldLabel>Нэмэлт утас</FieldLabel>
                  <InputRow icon={<PhoneCall className="w-4 h-4" />}>
                    <input
                      type="tel"
                      inputMode="numeric"
                      placeholder="99112233"
                      value={extraPhone}
                      onChange={(e) => {
                        setExtraPhone(e.target.value.replace(/\D/g, '').slice(0, 8));
                        setFormErrors({});
                      }}
                      className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
                    />
                  </InputRow>
                </div>

                <div>
                  <FieldLabel>Байгууллагын нэр</FieldLabel>
                  <InputRow icon={<Building2 className="w-4 h-4" />}>
                    <input
                      type="text"
                      placeholder="Компанийн нэр"
                      value={orgName}
                      onChange={(e) => {
                        setOrgName(e.target.value);
                        setFormErrors({});
                      }}
                      className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
                    />
                  </InputRow>
                </div>

                <div>
                  <FieldLabel>Регистер</FieldLabel>
                  <InputRow icon={<Hash className="w-4 h-4" />}>
                    <input
                      type="text"
                      placeholder="АА00000000"
                      value={register}
                      onChange={(e) => {
                        setRegister(e.target.value.toUpperCase());
                        setFormErrors({});
                      }}
                      maxLength={10}
                      className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
                    />
                  </InputRow>
                </div>
              </SectionCard>

              <SectionCard title="Нууц үг">
                {formErrors.password && (
                  <p className="text-xs text-red-600 -mt-1 mb-1">{formErrors.password}</p>
                )}
                <div>
                  <FieldLabel hint="Хэрэв солихгүй бол хоосон үлдээнэ үү">
                    Шинэ нууц үг
                  </FieldLabel>
                  <InputRow icon={<Lock className="w-4 h-4" />}>
                    <input
                      type={showNewPwd ? 'text' : 'password'}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        setFormErrors({});
                      }}
                      className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPwd((v) => !v)}
                      className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
                      tabIndex={-1}
                      aria-label={showNewPwd ? 'Нуух' : 'Харуулах'}
                    >
                      {showNewPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </InputRow>
                </div>

                <div>
                  <FieldLabel hint="Хэрэв солихгүй бол хоосон үлдээнэ үү">
                    Нууц үг давтах
                  </FieldLabel>
                  <InputRow icon={<Lock className="w-4 h-4" />}>
                    <input
                      type={showConfirmPwd ? 'text' : 'password'}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        setFormErrors({});
                      }}
                      className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPwd((v) => !v)}
                      className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
                      tabIndex={-1}
                      aria-label={showConfirmPwd ? 'Нуух' : 'Харуулах'}
                    >
                      {showConfirmPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </InputRow>
                </div>
              </SectionCard>

              <div className="hidden md:block pt-1 pb-6">
                <SaveButton
                  saveState={saveState}
                  btnScale={btnScale}
                  disabled={!canSave}
                  onClick={() => { void handleSave(); }}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {customerPhone != null && baseline !== null && !isLoadingProfile && (
        <div className="md:hidden shrink-0 bg-white border-t border-gray-100 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
          <div className="max-w-[640px] mx-auto">
            <SaveButton
              saveState={saveState}
              btnScale={btnScale}
              disabled={!canSave}
              onClick={() => { void handleSave(); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
