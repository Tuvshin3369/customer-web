import React, { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, Lock, X, AlertCircle, ChevronLeft } from 'lucide-react';
import {
  fetchCustomerProfileByPhone,
  updateCustomerProfileByPhone,
  verifyCustomerPasswordForPhone,
} from '../lib/customersRegister';

type Phase = 'prompt' | 'form';

interface DefaultPhonePasswordReminderModalProps {
  isOpen: boolean;
  customerPhone: number;
  onLater: () => void;
  /** Амжилттай солигдсоны дараа */
  onPasswordChanged?: () => void;
}

export function DefaultPhonePasswordReminderModal({
  isOpen,
  customerPhone,
  onLater,
  onPasswordChanged,
}: DefaultPhonePasswordReminderModalProps) {
  const [phase, setPhase] = useState<Phase>('prompt');
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [newPwd2, setNewPwd2] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showA, setShowA] = useState(false);
  const [showB, setShowB] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPhase('prompt');
      setOldPwd('');
      setNewPwd('');
      setNewPwd2('');
      setError(null);
      setLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (phase === 'form') setPhase('prompt');
        else onLater();
      }
    }
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [isOpen, phase, onLater]);

  const submitChange = useCallback(async () => {
    setError(null);
    const o = oldPwd.trim();
    const n = newPwd.trim();
    const n2 = newPwd2.trim();
    if (o.length === 0) {
      setError('Хуучин нууц үгээ оруулна уу.');
      return;
    }
    if (n.length < 6) {
      setError('Шинэ нууц үг хамгийн багадаа 6 тэмдэгт байна.');
      return;
    }
    if (n !== n2) {
      setError('Шинэ нууц үг таарахгүй байна.');
      return;
    }
    setLoading(true);
    try {
      const ok = await verifyCustomerPasswordForPhone(customerPhone, o);
      if (!ok) {
        setError('Хуучин нууц үг буруу байна.');
        return;
      }
      const baseline = await fetchCustomerProfileByPhone(customerPhone);
      await updateCustomerProfileByPhone({
        phone: customerPhone,
        baseline,
        additional_phone: baseline.additional_phone,
        organization_name: baseline.organization_name,
        register: baseline.register,
        newPassword: n,
      });
      onPasswordChanged?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Алдаа гарлаа.');
    } finally {
      setLoading(false);
    }
  }, [customerPhone, oldPwd, newPwd, newPwd2, onPasswordChanged]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[175] flex items-center justify-center p-4 bg-black/55 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwd-reminder-title"
        className="relative w-full max-w-[min(100%,380px)] rounded-2xl bg-white shadow-2xl ring-1 ring-amber-200/90 overflow-hidden"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {phase === 'prompt' ? (
          <>
            <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-2 border-b border-amber-100 bg-amber-50/70">
              <h2 id="pwd-reminder-title" className="text-base font-semibold text-gray-900 pr-2">
                Та нууц үгээ солино уу
              </h2>
              <button
                type="button"
                onClick={onLater}
                className="shrink-0 rounded-full p-2 text-gray-500 hover:bg-white/80 hover:text-gray-900"
                aria-label="Хаах"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-4 py-4 space-y-4">
              <p className="text-sm leading-relaxed text-gray-700">
                Таны нэвтрэх үг анх утасны дугаартай адилхан тохируулагдсан байна. Илүү аюулгүй байхын тулд
                солино уу.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={onLater}
                  className="w-full py-3 rounded-xl text-sm font-semibold border border-gray-200 bg-white text-gray-800 hover:bg-gray-50 transition-colors"
                >
                  Дараа болох
                </button>
                <button
                  type="button"
                  onClick={() => setPhase('form')}
                  className="w-full py-3 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm"
                >
                  Нууц үг солих
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b border-gray-100">
              <button
                type="button"
                className="p-2 rounded-full hover:bg-gray-100 text-gray-600"
                aria-label="Буцах"
                onClick={() => { setPhase('prompt'); setError(null); }}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h2 className="text-base font-semibold text-gray-900 flex-1">Нууц үг солих</h2>
              <button
                type="button"
                onClick={onLater}
                className="shrink-0 rounded-full p-2 text-gray-500 hover:bg-gray-100"
                aria-label="Хаах"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-4 py-4 space-y-3 max-h-[min(72vh,520px)] overflow-y-auto">
              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Хуучин нууц үг
                </label>
                <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 bg-gray-50 focus-within:border-blue-400 focus-within:bg-white">
                  <Lock className="w-4 h-4 text-gray-400 shrink-0" />
                  <input
                    type={showOld ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={oldPwd}
                    onChange={(e) => { setOldPwd(e.target.value); setError(null); }}
                    className="flex-1 bg-transparent text-sm outline-none min-w-0"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    className="text-gray-400 p-1"
                    onClick={() => setShowOld((v) => !v)}
                    aria-label={showOld ? 'Нуух' : 'Харуулах'}
                  >
                    {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Шинэ нууц үг</label>
                <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 bg-gray-50 focus-within:border-blue-400 focus-within:bg-white">
                  <Lock className="w-4 h-4 text-gray-400 shrink-0" />
                  <input
                    type={showA ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={newPwd}
                    onChange={(e) => { setNewPwd(e.target.value); setError(null); }}
                    className="flex-1 bg-transparent text-sm outline-none min-w-0"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    className="text-gray-400 p-1"
                    onClick={() => setShowA((v) => !v)}
                    aria-label={showA ? 'Нуух' : 'Харуулах'}
                  >
                    {showA ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Шинэ нууц үг давтах
                </label>
                <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 bg-gray-50 focus-within:border-blue-400 focus-within:bg-white">
                  <Lock className="w-4 h-4 text-gray-400 shrink-0" />
                  <input
                    type={showB ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={newPwd2}
                    onChange={(e) => { setNewPwd2(e.target.value); setError(null); }}
                    className="flex-1 bg-transparent text-sm outline-none min-w-0"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    className="text-gray-400 p-1"
                    onClick={() => setShowB((v) => !v)}
                    aria-label={showB ? 'Нуух' : 'Харуулах'}
                  >
                    {showB ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={() => { void submitChange(); }}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white shadow-sm mt-2 ${
                  loading ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? 'Хадгалж байна…' : 'Хадгалах'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
