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

// ─── Internal row helper ──────────────────────────────────────────────────────
function BankRow({
  label,
  value,
  valueClass = 'text-gray-700 font-medium text-xs',
}: {
  label:       string;
  value:       string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-gray-500 shrink-0">{label}</p>
      <p className={`${valueClass} text-right break-all`}>{value}</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function PaymentInfoCard({
  bankName,
  accountHolder,
  accountNumber,
  transferNote,
  showTransferWarning = false,
}: PaymentInfoCardProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(accountNumber).catch(() => {
      // Fallback for environments without clipboard API
      try {
        const el = document.createElement('textarea');
        el.value = accountNumber;
        el.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
        document.body.appendChild(el);
        el.focus();
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      } catch { /* silent */ }
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-gray-700">Дансны мэдээлэл</p>

      <div className="space-y-2.5">
        {/* Bank name */}
        <BankRow label="Банкны нэр"   value={bankName} />

        {/* Account holder (was "Дансны нэр" → now "Хүлээн авагч") */}
        <BankRow label="Хүлээн авагч" value={accountHolder} />

        {/* Account number — with copy button */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500 shrink-0">Дансны дугаар</p>
          <div className="flex items-center gap-1">
            <p className="text-xs text-gray-700 font-medium text-right break-all">
              {accountNumber}
            </p>
            <button
              type="button"
              onClick={handleCopy}
              title="Дансны дугаар хуулах"
              aria-label="Дансны дугаар хуулах"
              className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg
                         bg-transparent hover:bg-gray-200 active:bg-gray-300
                         text-gray-400 hover:text-gray-700 transition-colors"
            >
              {copied
                ? <Check className="w-3.5 h-3.5 text-green-500" />
                : <Copy  className="w-3.5 h-3.5" />
              }
            </button>
          </div>
        </div>

        {/* Transfer note (гүйлгээний утга) */}
        <div className="border-t border-gray-200 pt-2.5 space-y-2.5">
          <BankRow
            label="Гүйлгээний утга"
            value={transferNote || '—'}
            valueClass={
              transferNote
                ? 'text-gray-900 font-semibold text-xs'
                : 'text-gray-400 italic text-xs'
            }
          />
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
