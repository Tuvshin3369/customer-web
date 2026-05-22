import { useState } from 'react';
import { Copy, Check, AlertCircle } from 'lucide-react';

// ─── Props ────────────────────────────────────────────────────────────────────
interface PaymentInfoCardProps {
  bankName:             string;
  accountHolder:        string;   // "Хүлээн авагч" label value
  accountNumber:        string;
  transferNote?:        string;   // "Гүйлгээний утга" value; omit/undefined → shows '—'
  showTransferWarning?: boolean;  // amber alert "утас оруулаагүй" banner
}

// ─── Main component ───────────────────────────────────────────────────────────
export function PaymentInfoCard({
  bankName,
  accountHolder,
  accountNumber,
  transferNote,
  showTransferWarning = false,
}: PaymentInfoCardProps) {
  const [copiedField, setCopiedField] = useState<'account' | 'transfer' | null>(null);

  function copyText(text: string, field: 'account' | 'transfer') {
    if (!text.trim()) return;
    navigator.clipboard.writeText(text).catch(() => {
      try {
        const el = document.createElement('textarea');
        el.value = text;
        el.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
        document.body.appendChild(el);
        el.focus();
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      } catch { /* silent */ }
    });
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-gray-700">Дансны мэдээлэл</p>

      <div className="space-y-2.5">
        {/* Мөр 1: Хүлээн авагч + нэр */}
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs text-gray-500 shrink-0">Хүлээн авагч</p>
          <p className="text-xs text-gray-700 font-medium text-right break-words min-w-0 flex-1 leading-snug">
            {accountHolder}
          </p>
        </div>

        {/* Мөр 2: Банкны нэр */}
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs text-gray-500 shrink-0">Банкны нэр</p>
          <p className="text-xs text-gray-700 font-medium text-right break-words min-w-0 flex-1 leading-snug">
            {bankName}
          </p>
        </div>

        {/* Мөр 3: Дансны дугаар + account */}
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs text-gray-500 shrink-0">Дансны дугаар</p>
          <div className="flex items-center justify-end gap-0.5 min-w-0 flex-1">
            <span className="text-xs text-gray-700 font-medium text-right break-all">{accountNumber}</span>
            <button
              type="button"
              onClick={() => copyText(accountNumber, 'account')}
              title="Дансны дугаар хуулах"
              aria-label="Дансны дугаар хуулах"
              className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg
                         bg-transparent hover:bg-gray-200 active:bg-gray-300
                         text-gray-400 hover:text-gray-700 transition-colors"
            >
              {copiedField === 'account'
                ? <Check className="w-3.5 h-3.5 text-green-500" />
                : <Copy  className="w-3.5 h-3.5" />
              }
            </button>
          </div>
        </div>

        {/* Гүйлгээний утга + хуулах */}
        <div className="border-t border-gray-200 pt-2.5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs text-gray-500 shrink-0">Гүйлгээний утга</p>
            <div className="flex items-center justify-end gap-0.5 min-w-0 flex-1">
              <span
                className={
                  transferNote
                    ? 'text-xs text-gray-900 font-semibold text-right break-all'
                    : 'text-xs text-gray-400 italic text-right break-all'
                }
              >
                {transferNote || '—'}
              </span>
              {transferNote ? (
                <button
                  type="button"
                  onClick={() => copyText(transferNote, 'transfer')}
                  title="Гүйлгээний утга хуулах"
                  aria-label="Гүйлгээний утга хуулах"
                  className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg
                             bg-transparent hover:bg-gray-200 active:bg-gray-300
                             text-gray-400 hover:text-gray-700 transition-colors"
                >
                  {copiedField === 'transfer'
                    ? <Check className="w-3.5 h-3.5 text-green-500" />
                    : <Copy  className="w-3.5 h-3.5" />
                  }
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Amber warning — shown when phone hasn't been entered yet */}
      {showTransferWarning && (
        <p className="flex items-center gap-1 text-[11px] text-amber-600 bg-amber-50 rounded-lg px-2.5 py-1.5">
          <AlertCircle className="w-3 h-3 shrink-0" />
          Утасны дугаараа оруулсны дараа гүйлгээний утга харагдана
        </p>
      )}
    </div>
  );
}
