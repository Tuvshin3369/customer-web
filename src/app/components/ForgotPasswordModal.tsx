import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Phone, Lock, Eye, EyeOff, AlertCircle,
  Loader2, ChevronLeft, CheckCircle2, RefreshCw,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
type Step = 1 | 2 | 3 | 'success';

interface ForgotPasswordModalProps {
  isOpen:        boolean;
  onClose:       () => void;
  onBackToLogin: () => void;
}

// ── Password strength helper ──────────────────────────────────────────────────
function getStrength(pwd: string): { level: 0 | 1 | 2 | 3; label: string } {
  if (!pwd)           return { level: 0, label: '' };
  if (pwd.length < 6) return { level: 1, label: 'Сул' };
  if (pwd.length < 9) return { level: 2, label: 'Дунд' };
  return               { level: 3, label: 'Хүчтэй' };
}

// ── Shake animation style tag (injected once) ─────────────────────────────────
const SHAKE_CSS = `
  @keyframes fp-shake {
    0%,100% { transform: translateX(0); }
    15%     { transform: translateX(-7px); }
    30%     { transform: translateX(7px); }
    50%     { transform: translateX(-5px); }
    70%     { transform: translateX(5px); }
    85%     { transform: translateX(-3px); }
  }
  .fp-shake { animation: fp-shake 0.42s ease; }
`;

// ── Sub-components ────────────────────────────────────────────────────────────

function InputRow({
  icon,
  error,
  children,
}: {
  icon: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        className={`flex items-center gap-3 bg-gray-50 border rounded-xl px-3.5 py-3 transition-colors ${
          error
            ? 'border-red-400 bg-red-50'
            : 'border-gray-200 focus-within:border-blue-500 focus-within:bg-white'
        }`}
      >
        <span className="text-gray-400 shrink-0">{icon}</span>
        {children}
      </div>
      {error && (
        <p className="flex items-center gap-1 text-xs text-red-500 mt-1.5 pl-1">
          <AlertCircle className="w-3 h-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function ForgotPasswordModal({
  isOpen,
  onClose,
  onBackToLogin,
}: ForgotPasswordModalProps) {
  const [mounted,  setMounted]  = useState(false);
  const [visible,  setVisible]  = useState(false);

  // ── Step state + slide animation ──────────────────────────────────────────
  const [step,      setStep]      = useState<Step>(1);
  const [sliding,   setSliding]   = useState(false);    // slide-out flag

  // ── Step 1 ────────────────────────────────────────────────────────────────
  const [phone,     setPhone]     = useState('');
  const [phoneErr,  setPhoneErr]  = useState('');
  const [s1Loading, setS1Loading] = useState(false);

  // ── Step 2 ────────────────────────────────────────────────────────────────
  const [otp,      setOtp]      = useState(['', '', '', '', '', '']);
  const [otpErr,   setOtpErr]   = useState('');
  const [shaking,  setShaking]  = useState(false);
  const [timer,    setTimer]    = useState(45);
  const [s2Loading,setS2Loading]= useState(false);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ── Step 3 ────────────────────────────────────────────────────────────────
  const [newPwd,     setNewPwd]     = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showNew,    setShowNew]    = useState(false);
  const [showConf,   setShowConf]   = useState(false);
  const [pwdErr,     setPwdErr]     = useState('');
  const [s3Loading,  setS3Loading]  = useState(false);

  // ─────────────────────────────────────────────────────────────────────────
  // Mount / unmount
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      // reset all
      setStep(1); setSliding(false);
      setPhone(''); setPhoneErr(''); setS1Loading(false);
      setOtp(['', '', '', '', '', '']); setOtpErr(''); setTimer(45); setS2Loading(false);
      setNewPwd(''); setConfirmPwd(''); setPwdErr(''); setS3Loading(false);
      setShowNew(false); setShowConf(false);
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // OTP timer countdown (step 2 only)
  useEffect(() => {
    if (step !== 2 || timer <= 0) return;
    const id = setInterval(() => setTimer(t => (t > 0 ? t - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [step, timer]);

  // Auto-close on success
  useEffect(() => {
    if (step !== 'success') return;
    const t = setTimeout(() => {
      onClose();
      setTimeout(onBackToLogin, 320);
    }, 1500);
    return () => clearTimeout(t);
  }, [step, onClose, onBackToLogin]);

  // ─────────────────────────────────────────────────────────────────────────
  // Slide helper
  // ─────────────────────────────────────────────────────────────────────────
  const goToStep = useCallback((next: Step) => {
    setSliding(true);
    setTimeout(() => {
      setStep(next);
      setSliding(false);
    }, 190);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1 — phone submit
  // ─────────────────────────────────────────────────────────────────────────
  async function handleSendOTP(e: React.FormEvent) {
    e.preventDefault();
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 8) {
      setPhoneErr('8 оронтой утасны дугаар оруулна уу.');
      return;
    }
    setPhoneErr('');
    setS1Loading(true);
    await new Promise(r => setTimeout(r, 1000));   // mock API
    setS1Loading(false);
    setTimer(45);
    goToStep(2);
    setTimeout(() => otpRefs.current[0]?.focus(), 250);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2 — OTP
  // ─────────────────────────────────────────────────────────────────────────
  function handleOtpChange(idx: number, val: string) {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[idx] = digit;
    setOtp(next);
    setOtpErr('');
    if (digit && idx < 5) otpRefs.current[idx + 1]?.focus();
  }

  function handleOtpKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!text) return;
    const next = ['', '', '', '', '', ''];
    text.split('').forEach((ch, i) => { next[i] = ch; });
    setOtp(next);
    const lastFilled = Math.min(text.length, 5);
    setTimeout(() => otpRefs.current[lastFilled]?.focus(), 0);
  }

  async function handleVerifyOTP(e: React.FormEvent) {
    e.preventDefault();
    const code = otp.join('');
    if (code.length < 6) {
      setOtpErr('6 оронтой OTP кодоо бүрэн оруулна уу.');
      triggerShake();
      return;
    }
    setS2Loading(true);
    await new Promise(r => setTimeout(r, 900));
    // Simulate wrong code for demo: '000000'
    if (code === '000000') {
      setS2Loading(false);
      setOtpErr('Буруу OTP код. Дахин оролдоно уу.');
      triggerShake();
      return;
    }
    setS2Loading(false);
    goToStep(3);
  }

  function triggerShake() {
    setShaking(true);
    setTimeout(() => setShaking(false), 500);
  }

  function handleResend() {
    if (timer > 0) return;
    setOtp(['', '', '', '', '', '']);
    setOtpErr('');
    setTimer(45);
    setTimeout(() => otpRefs.current[0]?.focus(), 0);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3 — new password
  // ─────────────────────────────────────────────────────────────────────────
  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPwd.length < 6) {
      setPwdErr('Нууц үг хамгийн багадаа 6 тэмдэгт байна.');
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdErr('Нууц үг таарахгүй байна.');
      return;
    }
    setPwdErr('');
    setS3Loading(true);
    await new Promise(r => setTimeout(r, 1000));
    setS3Loading(false);
    goToStep('success');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Derived
  // ─────────────────────────────────────────────────────────────────────────
  const strength       = getStrength(newPwd);
  const passwordsMatch = confirmPwd.length > 0 && newPwd === confirmPwd;
  const passwordsDiff  = confirmPwd.length > 0 && newPwd !== confirmPwd;
  const timerFmt       = `${String(Math.floor(timer / 60)).padStart(2, '0')}:${String(timer % 60).padStart(2, '0')}`;

  const slideStyle: React.CSSProperties = {
    opacity:    sliding ? 0 : 1,
    transform:  sliding ? 'translateX(-20px)' : 'translateX(0)',
    transition: sliding ? 'none' : 'opacity 0.2s ease, transform 0.2s ease',
  };

  if (!mounted) return null;

  return (
    <>
      {/* Inject shake keyframes once */}
      <style>{SHAKE_CSS}</style>

      <div className="fixed inset-0 z-[120] flex items-center justify-center px-5">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/55 backdrop-blur-sm transition-opacity duration-300"
          style={{ opacity: visible ? 1 : 0 }}
          onClick={onClose}
        />

        {/* Card */}
        <div
          className="relative w-full max-w-[340px] md:max-w-[400px] bg-white rounded-2xl shadow-2xl overflow-hidden"
          style={{
            opacity:   visible ? 1 : 0,
            transform: visible ? 'scale(1) translateY(0)' : 'scale(0.94) translateY(16px)',
            transition: 'opacity 0.28s ease, transform 0.28s cubic-bezier(0.34,1.56,0.64,1)',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Close */}
          <button
            onClick={onClose}
            className="absolute top-3.5 right-3.5 w-8 h-8 flex items-center justify-center
                       rounded-full bg-gray-100 hover:bg-gray-200 transition-colors z-10"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>

          {/* ── Step progress dots (steps 1-3 only) ─────────────────────── */}
          {step !== 'success' && (
            <div className="flex justify-center gap-1.5 pt-5 pb-0">
              {([1, 2, 3] as const).map(n => (
                <div
                  key={n}
                  className={`h-1 rounded-full transition-all duration-300 ${
                    n === step
                      ? 'w-6 bg-blue-600'
                      : (typeof step === 'number' && n < step)
                      ? 'w-3 bg-blue-300'
                      : 'w-3 bg-gray-200'
                  }`}
                />
              ))}
            </div>
          )}

          {/* ── Slide container ──────────────────────────────────────────── */}
          <div style={slideStyle} className="px-6 pt-5 pb-6">

            {/* ══════════════ STEP 1 — Phone ══════════════════════════════ */}
            {step === 1 && (
              <>
                <h2 className="text-xl font-semibold text-gray-900 mb-1">
                  Нууц үг сэргээх
                </h2>
                <p className="text-xs text-gray-400 mb-6">
                  Бүртгэлтэй утасны дугаараа оруулна уу
                </p>

                <form onSubmit={handleSendOTP} noValidate className="space-y-4">
                  <InputRow
                    icon={<Phone className="w-4 h-4" />}
                    error={phoneErr}
                  >
                    <input
                      type="tel"
                      inputMode="tel"
                      placeholder="9900 0000"
                      value={phone}
                      autoFocus
                      onChange={e => {
                        setPhone(e.target.value);
                        if (phoneErr) setPhoneErr('');
                      }}
                      maxLength={12}
                      className="flex-1 bg-transparent text-sm text-gray-800
                                 placeholder-gray-400 outline-none tracking-widest"
                      disabled={s1Loading}
                    />
                  </InputRow>

                  <button
                    type="submit"
                    disabled={phone.replace(/\D/g, '').length < 8 || s1Loading}
                    className="w-full flex items-center justify-center gap-2
                               bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300
                               text-white text-sm font-medium rounded-xl py-3
                               transition-colors"
                  >
                    {s1Loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    {s1Loading ? 'Илгээж байна...' : 'OTP код илгээх'}
                  </button>
                </form>

                <div className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={() => { onClose(); setTimeout(onBackToLogin, 320); }}
                    className="text-xs text-gray-500 hover:text-blue-600 transition-colors"
                  >
                    Нэвтрэх рүү буцах
                  </button>
                </div>
              </>
            )}

            {/* ══════════════ STEP 2 — OTP ════════════════════════════════ */}
            {step === 2 && (
              <>
                <h2 className="text-xl font-semibold text-gray-900 mb-1">
                  OTP баталгаажуулалт
                </h2>
                <p className="text-xs text-gray-400 mb-1">
                  Таны утасны дугаарт 6 оронтой код илгээлээ
                </p>
                <p className="text-xs font-medium text-blue-600 mb-6">
                  {phone.replace(/(\d{4})(\d{4})/, '$1 $2')}
                </p>

                <form onSubmit={handleVerifyOTP} noValidate>
                  {/* OTP boxes */}
                  <div
                    className={`flex gap-2 justify-center mb-2 ${shaking ? 'fp-shake' : ''}`}
                    onPaste={handleOtpPaste}
                  >
                    {otp.map((digit, i) => (
                      <input
                        key={i}
                        ref={el => { otpRefs.current[i] = el; }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={e => handleOtpChange(i, e.target.value)}
                        onKeyDown={e => handleOtpKeyDown(i, e)}
                        className={[
                          'w-10 h-12 sm:w-11 sm:h-12 text-center text-lg font-bold',
                          'border-2 rounded-lg outline-none transition-all',
                          'caret-blue-500 select-none',
                          digit
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : otpErr
                            ? 'border-red-400 bg-red-50'
                            : 'border-gray-200 bg-gray-50 text-gray-800',
                          'focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20',
                        ].join(' ')}
                        disabled={s2Loading}
                      />
                    ))}
                  </div>

                  {/* Error */}
                  <div className="min-h-[20px] mb-4">
                    {otpErr && (
                      <p className="flex items-center justify-center gap-1 text-xs text-red-500">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        {otpErr}
                      </p>
                    )}
                  </div>

                  {/* Timer + resend */}
                  <div className="flex items-center justify-center gap-2 mb-5">
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={timer > 0}
                      className={`flex items-center gap-1.5 text-xs transition-colors ${
                        timer > 0
                          ? 'text-gray-400 cursor-default'
                          : 'text-blue-600 hover:text-blue-700 cursor-pointer'
                      }`}
                    >
                      <RefreshCw className={`w-3 h-3 ${timer > 0 ? '' : 'text-blue-600'}`} />
                      Дахин илгээх
                    </button>
                    {timer > 0 && (
                      <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                        {timerFmt}
                      </span>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={otp.join('').length < 6 || s2Loading}
                    className="w-full flex items-center justify-center gap-2
                               bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300
                               text-white text-sm font-medium rounded-xl py-3
                               transition-colors"
                  >
                    {s2Loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    {s2Loading ? 'Шалгаж байна...' : 'Баталгаажуулах'}
                  </button>
                </form>

                <div className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={() => goToStep(1)}
                    className="text-xs text-gray-500 hover:text-blue-600 transition-colors
                               flex items-center gap-1 mx-auto"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Утас солих
                  </button>
                </div>
              </>
            )}

            {/* ══════════════ STEP 3 — New password ═══════════════════════ */}
            {step === 3 && (
              <>
                <h2 className="text-xl font-semibold text-gray-900 mb-1">
                  Шинэ нууц үг үүсгэх
                </h2>
                <p className="text-xs text-gray-400 mb-6">
                  Хамгийн багадаа 6 тэмдэгт ашиглана уу
                </p>

                <form onSubmit={handleSetPassword} noValidate className="space-y-3">

                  {/* New password */}
                  <div>
                    <InputRow icon={<Lock className="w-4 h-4" />}>
                      <input
                        type={showNew ? 'text' : 'password'}
                        placeholder="Шинэ нууц үг"
                        value={newPwd}
                        autoFocus
                        onChange={e => { setNewPwd(e.target.value); setPwdErr(''); }}
                        className="flex-1 bg-transparent text-sm text-gray-800
                                   placeholder-gray-400 outline-none"
                        disabled={s3Loading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNew(v => !v)}
                        tabIndex={-1}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </InputRow>

                    {/* Strength bar */}
                    {newPwd.length > 0 && (
                      <div className="mt-2 px-0.5">
                        <div className="flex gap-1 mb-1">
                          {[1, 2, 3].map(n => (
                            <div
                              key={n}
                              className={`flex-1 h-1 rounded-full transition-all duration-300 ${
                                strength.level >= n
                                  ? strength.level === 1 ? 'bg-red-400'
                                  : strength.level === 2 ? 'bg-yellow-400'
                                  : 'bg-green-500'
                                  : 'bg-gray-200'
                              }`}
                            />
                          ))}
                        </div>
                        <p className={`text-[11px] font-medium ${
                          strength.level === 1 ? 'text-red-500'
                          : strength.level === 2 ? 'text-yellow-600'
                          : 'text-green-600'
                        }`}>
                          {strength.label}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Confirm password */}
                  <div>
                    <InputRow
                      icon={<Lock className="w-4 h-4" />}
                      error={passwordsDiff ? 'Нууц үг таарахгүй байна.' : undefined}
                    >
                      <input
                        type={showConf ? 'text' : 'password'}
                        placeholder="Нууц үг давтах"
                        value={confirmPwd}
                        onChange={e => { setConfirmPwd(e.target.value); setPwdErr(''); }}
                        className="flex-1 bg-transparent text-sm text-gray-800
                                   placeholder-gray-400 outline-none"
                        disabled={s3Loading}
                      />
                      {passwordsMatch ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowConf(v => !v)}
                          tabIndex={-1}
                          className="text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          {showConf ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      )}
                    </InputRow>
                  </div>

                  {/* General password error */}
                  {pwdErr && !passwordsDiff && (
                    <p className="flex items-center gap-1 text-xs text-red-500 pl-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      {pwdErr}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={!newPwd || !confirmPwd || s3Loading}
                    className="w-full flex items-center justify-center gap-2
                               bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300
                               text-white text-sm font-medium rounded-xl py-3
                               transition-colors !mt-5"
                  >
                    {s3Loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    {s3Loading ? 'Шинэчилж байна...' : 'Нууц үг шинэчлэх'}
                  </button>
                </form>

                <div className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={() => goToStep(2)}
                    className="text-xs text-gray-500 hover:text-blue-600 transition-colors
                               flex items-center gap-1 mx-auto"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Буцах
                  </button>
                </div>
              </>
            )}

            {/* ══════════════ SUCCESS ══════════════════════════════════════ */}
            {step === 'success' && (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                {/* Animated success ring */}
                <div
                  className="w-16 h-16 rounded-full bg-green-50 flex items-center
                             justify-center mb-4 border-2 border-green-200"
                  style={{ animation: 'none' }}
                >
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                </div>

                <h2 className="text-lg font-semibold text-gray-900 mb-1">
                  Амжилттай!
                </h2>
                <p className="text-sm text-gray-500 mb-2">
                  Нууц үг амжилттай шинэчлэгдлээ
                </p>
                <p className="text-xs text-gray-400">
                  Нэвтрэх цонх руу буцаж байна...
                </p>

                {/* Progress bar */}
                <div className="w-full bg-gray-100 rounded-full h-1 mt-5 overflow-hidden">
                  <div
                    className="h-1 bg-green-500 rounded-full"
                    style={{
                      width: '100%',
                      transition: 'width 1.4s linear',
                      animation: 'none',
                    }}
                  />
                </div>
              </div>
            )}

          </div>{/* /slide container */}
        </div>
      </div>
    </>
  );
}
