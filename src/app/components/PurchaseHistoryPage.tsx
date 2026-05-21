'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft, ChevronDown, ChevronUp,
  MessageSquare, Printer, X, Package2,
  Search, CalendarDays, FileSpreadsheet, CreditCard,
} from 'lucide-react';
import { PurchaseHistoryPrint }            from './print/PurchaseHistoryPrint';
import { buildGroupedPurchaseData }        from '../../lib/print/buildPurchaseData';
import type { GroupedPrintData }           from '../../lib/print/buildPurchaseData';
import { PaymentInfoCard }                 from './PaymentInfoCard';
import {
  fetchSalesPurchaseHistoryGrouped,
  type PurchaseHistoryGroupedSale,
  type PurchaseSaleBankInfo,
} from '../lib/salesPurchaseHistoryFetch';

// ── Types ─────────────────────────────────────────────────────────────────────
interface HistoryProduct { name: string; quantity: number; price: number; }
type CreditType = 'paid' | 'partial' | 'credit';

interface HistoryItem {
  id:           string;
  date:         string;   // "YYYY.MM.DD HH:MM"
  store:        string;
  phone:        string;
  note?:        string;
  creditType:   CreditType;
  creditAmount?: number;  // only for 'partial'
  products:     HistoryProduct[];
  bankInfo?:    PurchaseSaleBankInfo;
}


// ── Utilities ─────────────────────────────────────────────────────────────────
function fmt(n: number): string { return n.toLocaleString('en-US') + '₮'; }
function calcTotal(products: HistoryProduct[]): number {
  return products.reduce((s, p) => s + p.price * p.quantity, 0);
}
/** "2025.02.25 14:30" → "2025.02.25" */
function fmtDate(date: string): string { return date.split(' ')[0]; }
/** "2025.02.25 14:30" → "2025-02-25"  (ISO, for <input type="date"> comparison) */
function toISO(date: string): string { return date.split(' ')[0].replace(/\./g, '-'); }
/** Local calendar «YYYY-MM-DD» */
function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Хоосон гэж орж ирвэл аль алинд нь «өнөөдөр» болгоно — API инклюзив хүрээ */
function normalizeDateRangeForFetch(start: string, end: string): { from: string; to: string } {
  const t = todayISO();
  let from = start.trim() || t;
  let to = end.trim() || t;
  if (from > to) {
    const swap = from;
    from = to;
    to = swap;
  }
  return { from, to };
}

function groupedSaleToHistoryItem(row: PurchaseHistoryGroupedSale): HistoryItem {
  return {
    id: row.id,
    date: row.date,
    store: row.store,
    phone: row.phone,
    note: row.note,
    creditType: row.creditType,
    creditAmount: row.creditAmount,
    products: row.products,
    bankInfo: row.bankInfo,
  };
}

function csvEscapeCell(v: string): string {
  const s = String(v ?? '');
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// ── Portal tooltip (appears BELOW, never clipped) ─────────────────────────────
function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [coords,  setCoords]  = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLDivElement>(null);

  function handleMouseEnter() {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setCoords({ x: r.left + r.width / 2, y: r.bottom });
    setVisible(true);
  }

  return (
    <div
      ref={ref}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setVisible(false)}
      className="inline-flex items-center justify-center"
    >
      {children}
      {typeof document !== 'undefined' && createPortal(
        <div style={{
          position:      'fixed',
          left:           coords.x,
          top:            coords.y + 8,
          transform:     `translateX(-50%) translateY(${visible ? '0px' : '6px'})`,
          opacity:        visible ? 1 : 0,
          transition:    'opacity 150ms ease, transform 150ms ease',
          pointerEvents: 'none',
          zIndex:         9999,
          background:    '#111',
          color:         '#fff',
          fontSize:      '12px',
          lineHeight:    '1',
          padding:       '8px 12px',
          borderRadius:  '6px',
          whiteSpace:    'nowrap',
          boxShadow:     '0 4px 14px rgba(0,0,0,0.28)',
        }}>
          {label}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ── Credit button (paid shows nothing, credit/partial → pill button) ──────────
function CreditButton({
  type, amount, total, isActive, onClick,
}: {
  type:      CreditType;
  amount?:   number;
  total:     number;
  isActive:  boolean;
  onClick:   () => void;
}) {
  if (type === 'paid') return null;

  const creditAmt = type === 'partial' ? (amount ?? 0) : total;

  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick(); }}
      className={[
        'inline-flex items-center text-[11px] font-medium',
        'px-3 py-1.5 rounded-full border whitespace-nowrap shrink-0',
        'cursor-pointer transition-colors',
        isActive
          ? 'border-amber-400 bg-amber-100 text-amber-800 hover:bg-amber-200 active:bg-amber-300'
          : 'border-amber-300 bg-amber-50  text-amber-700 hover:bg-amber-100 active:bg-amber-200',
      ].join(' ')}
    >
      Зээл:&nbsp;{fmt(creditAmt)}
    </button>
  );
}

// ── Note Modal ────────────────────────────────────────────────────────────────
function NoteModal({ note, onClose }: { note: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[190] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-[400px] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Тэмдэглэл</h3>
          <button
            onClick={onClose}
            aria-label="Хаах"
            className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center
                       hover:bg-gray-200 transition-colors"
          >
            <X className="w-3.5 h-3.5 text-gray-600" />
          </button>
        </div>
        <div className="px-5 py-4 min-h-[60px]">
          <p className="text-sm text-gray-700 leading-relaxed">{note}</p>
        </div>
        <div className="px-5 pb-5">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-gray-100 text-sm text-gray-700
                       hover:bg-gray-200 active:bg-gray-300 transition-colors"
          >
            Хаах
          </button>
        </div>
      </div>
    </div>
  );
}

// ── History Card ──────────────────────────────────────────────────────────────
interface HistoryCardProps {
  item:             HistoryItem;
  isExpanded:       boolean;
  onToggle:         () => void;
  onNoteClick:      () => void;
  onRowPrint:       () => void;
  isCreditExpanded: boolean;
  onCreditToggle:   () => void;
  storeFilter:      string | null;
  onStoreFilter:    (store: string) => void;
}

function HistoryCard({
  item, isExpanded, onToggle, onNoteClick, onRowPrint,
  isCreditExpanded, onCreditToggle, storeFilter, onStoreFilter,
}: HistoryCardProps) {
  const total = calcTotal(item.products);
  const hasCreditPanel = item.creditType !== 'paid';
  const isStoreActive  = storeFilter === item.store;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden
                    transition-shadow hover:shadow-md">

      {/* ═══════════════════════════════════════════════════════════════════════
          DESKTOP summary row
          ═══════════════════════════════════════════════════════════════════════ */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        className="hidden md:flex items-center cursor-pointer select-none
                   hover:bg-gray-50/80 transition-colors px-4 py-3.5"
        onClick={onToggle}
        onKeyDown={e => e.key === 'Enter' && onToggle()}
      >
        {/* Chevron */}
        <div className="w-7 shrink-0 flex justify-center text-gray-400">
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>

        {/* Огноо */}
        <span className="w-32 shrink-0 text-sm text-gray-600 tabular-nums">
          {fmtDate(item.date)}
        </span>

        {/* Дэлгүүрийн нэр — filter pill */}
        <div className="w-24 shrink-0 flex items-center" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            aria-pressed={isStoreActive}
            onClick={() => onStoreFilter(item.store)}
            className={[
              'inline-flex items-center px-2 py-0.5 rounded-full text-xs',
              'max-w-full overflow-hidden whitespace-nowrap',
              'border transition-colors cursor-pointer',
              isStoreActive
                ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 active:bg-blue-800'
                : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200 active:bg-gray-300',
            ].join(' ')}
          >
            <span className="overflow-hidden text-ellipsis whitespace-nowrap">{item.store}</span>
          </button>
        </div>

        {/* Утас */}
        <span className="w-28 shrink-0 text-sm text-gray-500 font-mono tracking-wider">
          {item.phone}
        </span>

        {/* Нийт дүн */}
        <span className="w-36 shrink-0 text-sm font-semibold text-gray-900 tabular-nums">
          {fmt(total)}
        </span>

        {/* Зээлийн мэдээлэл */}
        <div className="flex-1 flex items-center min-w-0">
          <CreditButton
            type={item.creditType}
            amount={item.creditAmount}
            total={total}
            isActive={isCreditExpanded}
            onClick={onCreditToggle}
          />
        </div>

        {/* Тэмдэглэл */}
        <div
          className="w-10 shrink-0 flex justify-center"
          onClick={e => e.stopPropagation()}
        >
          <Tip label={item.note ? 'Тэмдэглэл харах' : 'Тэмдэглэл байхгүй'}>
            <button
              aria-label="Тэмдэглэл"
              disabled={!item.note}
              onClick={() => item.note && onNoteClick()}
              className={`transition-colors ${
                item.note
                  ? 'text-blue-500 hover:text-blue-700 cursor-pointer'
                  : 'text-gray-300 cursor-default'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
            </button>
          </Tip>
        </div>

        {/* Хэвлэх — row print */}
        <div
          className="w-10 shrink-0 flex justify-center"
          onClick={e => e.stopPropagation()}
        >
          <Tip label="Хэвлэх">
            <button
              aria-label="Хэвлэх"
              onClick={onRowPrint}
              className="text-gray-400 hover:text-gray-700 transition-colors"
            >
              <Printer className="w-4 h-4" />
            </button>
          </Tip>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          MOBILE summary card — stacked
          ═══════════════════════════════════════════════════════════════════════ */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        className="md:hidden cursor-pointer select-none px-4 pt-3.5 pb-3"
        onClick={onToggle}
        onKeyDown={e => e.key === 'Enter' && onToggle()}
      >
        {/* Row 1: date + icons */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-500 tabular-nums">{fmtDate(item.date)}</span>
          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            {item.note && (
              <button aria-label="Тэмдэглэл" onClick={onNoteClick} className="text-blue-500">
                <MessageSquare className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              aria-label="Хэвлэх"
              onClick={onRowPrint}
              className="text-gray-400 hover:text-gray-700 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Row 2: store filter pill + phone */}
        <div className="mb-1" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            aria-pressed={isStoreActive}
            onClick={() => onStoreFilter(item.store)}
            className={[
              'inline-flex items-center px-2 py-0.5 rounded-full text-xs',
              'max-w-full overflow-hidden whitespace-nowrap',
              'border transition-colors cursor-pointer',
              isStoreActive
                ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 active:bg-blue-800'
                : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200 active:bg-gray-300',
            ].join(' ')}
          >
            <span className="overflow-hidden text-ellipsis whitespace-nowrap">{item.store}</span>
          </button>
        </div>
        <span className="block text-sm text-gray-600 font-mono tracking-wider mb-2.5">
          {item.phone}
        </span>

        {/* Row 3: total + credit button + chevron */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900 tabular-nums">
              {fmt(total)}
            </span>
            <div onClick={e => e.stopPropagation()}>
              <CreditButton
                type={item.creditType}
                amount={item.creditAmount}
                total={total}
                isActive={isCreditExpanded}
                onClick={onCreditToggle}
              />
            </div>
          </div>
          <div className="flex items-center ml-auto">
            {isExpanded
              ? <ChevronUp   className="w-3.5 h-3.5 text-gray-400" />
              : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          Credit payment details panel
          ═══════════════════════════════════════════════════════════════════════ */}
      {hasCreditPanel && (
        <div
          style={{
            maxHeight:  isCreditExpanded ? '700px' : '0px',
            overflow:   'hidden',
            transition: 'max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <div className="border-t border-amber-100 bg-amber-50/20 px-4 py-4 space-y-3">

            {/* 1. Төлбөрийн хэлбэр */}
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2">Төлбөрийн хэлбэр</p>
              <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-white">
                <CreditCard className="w-4 h-4 text-gray-400 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-700">Дансаар</p>
                  <p className="text-[11px] text-gray-400">Банкны шилжүүлэг</p>
                </div>
              </div>
            </div>

            {/* 2. Дансны мэдээлэл */}
            <PaymentInfoCard
              bankName={item.bankInfo?.bankName ?? '—'}
              accountHolder={item.bankInfo?.accountHolder ?? '—'}
              accountNumber={item.bankInfo?.accountNumber ?? '—'}
              transferNote={item.phone || undefined}
            />

            {/* 3. Захиалгын дүн */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2.5">
              <p className="text-xs font-semibold text-gray-700">Захиалгын дүн</p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Бараа</span>
                  <span className="text-sm text-gray-700">₮{total.toLocaleString()}</span>
                </div>
                {item.creditType === 'partial' && item.creditAmount != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-amber-600">Зээлийн үлдэгдэл</span>
                    <span className="text-sm text-amber-600 font-semibold">
                      ₮{item.creditAmount.toLocaleString()}
                    </span>
                  </div>
                )}
                {item.creditType === 'credit' && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-amber-600">Бүрэн зээл</span>
                    <span className="text-sm text-amber-600 font-semibold">
                      ₮{total.toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                  <span className="text-sm font-semibold text-gray-700">Нийт</span>
                  <span className="text-xl font-bold text-gray-900">₮{total.toLocaleString()}</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          Expanded product table
          ═══════════════════════════════════════════════════════════════════════ */}
      {isExpanded && (
        <div className="border-t border-gray-100 bg-[#F9FAFB]">
          <div className="px-4 py-3 overflow-x-auto">
            <table className="w-full min-w-[300px]">
              <thead>
                <tr>
                  <th className="text-left text-xs font-medium text-gray-500 pb-2.5 pr-3
                                 border-b border-gray-200">Бараа</th>
                  <th className="text-center text-xs font-medium text-gray-500 pb-2.5 w-12
                                 border-b border-gray-200">Тоо</th>
                  <th className="text-right text-xs font-medium text-gray-500 pb-2.5 w-28 pr-3
                                 border-b border-gray-200">Үнэ</th>
                  <th className="text-right text-xs font-medium text-gray-500 pb-2.5 w-28
                                 border-b border-gray-200">Нийт</th>
                </tr>
              </thead>
              <tbody>
                {item.products.map((p, i) => (
                  <tr key={i} className={i > 0 ? 'border-t border-gray-100' : ''}>
                    <td className="text-sm text-gray-800 py-2 pr-3 leading-snug">{p.name}</td>
                    <td className="text-sm text-center text-gray-600 tabular-nums py-2">{p.quantity}</td>
                    <td className="text-sm text-right text-gray-600 tabular-nums py-2 pr-3">{fmt(p.price)}</td>
                    <td className="text-sm text-right text-gray-700 tabular-nums py-2">{fmt(p.price * p.quantity)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-300">
                  <td colSpan={3} className="text-sm font-semibold text-gray-900 pt-2.5 pb-1 pr-3">Нийт</td>
                  <td className="text-sm font-semibold text-gray-900 text-right tabular-nums pt-2.5 pb-1">
                    {fmt(total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Export Button ─────────────────────────────────────────────────────────────
interface ExportButtonProps {
  hasFilter:         boolean;
  activeFilterCount: number;
  hasData:           boolean;
  isExporting:       boolean;
  onExport:          () => void;
}

function ExportButton({
  hasFilter, activeFilterCount, hasData, isExporting, onExport,
}: ExportButtonProps) {
  const isEmpty    = !hasData;
  const isDisabled = isEmpty || isExporting;

  const tooltipText = isExporting
    ? 'Боловсруулж байна...'
    : isEmpty
    ? 'Өгөгдөл олдсонгүй'
    : hasFilter
    ? 'Excel татах (Шүүсэн)'
    : 'Excel татах';

  return (
    <Tip label={tooltipText}>
      <div className="relative shrink-0">
        <button
          onClick={!isDisabled ? onExport : undefined}
          disabled={isDisabled}
          aria-label="Excel татах"
          style={{ width: 34, height: 34 }}
          className={[
            'flex items-center justify-center rounded-lg border transition-all',
            isDisabled ? 'cursor-not-allowed' : 'cursor-pointer',
            isEmpty
              ? 'border-gray-200 bg-gray-50 text-gray-400 opacity-60'
              : isExporting
              ? 'border-gray-200 bg-gray-50 text-gray-500 opacity-80'
              : hasFilter
              ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 active:bg-blue-200'
              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 active:bg-gray-100',
          ].join(' ')}
        >
          {isExporting ? (
            <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10"
                stroke="currentColor" strokeWidth="2.5" />
              <path className="opacity-75" fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
          )}
        </button>

        {hasFilter && !isExporting && !isEmpty && activeFilterCount > 0 && (
          <span
            className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px]
                       bg-blue-600 text-white text-[9px] font-semibold
                       rounded-full flex items-center justify-center px-0.5
                       pointer-events-none shadow-sm"
          >
            {activeFilterCount}
          </span>
        )}
      </div>
    </Tip>
  );
}

// ── Filter section ────────────────────────────────────────────────────────────
interface FilterBarProps {
  startDate:         string;
  endDate:           string;
  searchName:        string;
  onStart:           (v: string) => void;
  onEnd:             (v: string) => void;
  onSearch:          (v: string) => void;
  onApply:           () => void;
  onReset:           () => void;
  hasFilter:         boolean;
  activeFilterCount: number;
  hasData:           boolean;
  isExporting:       boolean;
  totalCredit:       number;
  creditOnly:        boolean;
  onToggleCredit:    () => void;
  onExport:          () => void;
}

function FilterBar({
  startDate, endDate, searchName,
  onStart, onEnd, onSearch, onApply, onReset,
  hasFilter, activeFilterCount, hasData, isExporting,
  totalCredit, creditOnly, onToggleCredit, onExport,
}: FilterBarProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-4 py-4 mb-4">
      <div className="flex flex-col md:flex-row gap-3">

        {/* Start date */}
        <div className="relative flex-1 min-w-0">
          <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none z-10" />
          <input
            type="date"
            value={startDate}
            onChange={e => onStart(e.target.value)}
            className={[
              'w-full pl-9 pr-3 py-2.5 text-sm bg-gray-50',
              'border border-gray-200 rounded-lg',
              'focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400',
              'transition-colors',
              startDate ? 'text-gray-700' : 'text-transparent',
            ].join(' ')}
          />
        </div>

        {/* End date */}
        <div className="relative flex-1 min-w-0">
          <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none z-10" />
          <input
            type="date"
            value={endDate}
            onChange={e => onEnd(e.target.value)}
            className={[
              'w-full pl-9 pr-3 py-2.5 text-sm bg-gray-50',
              'border border-gray-200 rounded-lg',
              'focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400',
              'transition-colors',
              endDate ? 'text-gray-700' : 'text-transparent',
            ].join(' ')}
          />
        </div>

        {/* Product name search */}
        <div className="relative flex-[1.5] min-w-0">
          <input
            type="text"
            value={searchName}
            onChange={e => onSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onApply()}
            placeholder="Барааны нэрээр хайх"
            className="w-full pl-3 pr-9 py-2.5 text-sm text-gray-700 bg-gray-50
                       border border-gray-200 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400
                       transition-colors"
          />
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>

        {/* ── Desktop: action buttons ───────────────────────────────────────── */}
        <div className="hidden md:flex items-center gap-3 shrink-0">
          <button
            onClick={onApply}
            className="px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm
                       font-medium hover:bg-blue-700 active:bg-blue-800 transition-colors
                       whitespace-nowrap"
          >
            Шүүх
          </button>
          {hasFilter && (
            <button
              onClick={onReset}
              className="px-4 py-2.5 rounded-lg border border-gray-200
                         text-sm text-gray-500 hover:bg-gray-50 active:bg-gray-100
                         transition-colors whitespace-nowrap"
            >
              Цэвэрлэх
            </button>
          )}
          <ExportButton
            hasFilter={hasFilter}
            activeFilterCount={activeFilterCount}
            hasData={hasData}
            isExporting={isExporting}
            onExport={onExport}
          />
          {totalCredit > 0 && (
            <button
              onClick={onToggleCredit}
              aria-pressed={creditOnly}
              className={[
                'inline-flex items-center h-[30px] px-3 rounded-full',
                'text-xs font-medium tabular-nums whitespace-nowrap',
                'border transition-all',
                creditOnly
                  ? 'border-amber-400 bg-amber-100 text-amber-800 hover:bg-amber-200 active:bg-amber-300'
                  : 'border-amber-300 bg-transparent text-amber-600 hover:bg-amber-50 active:bg-amber-100',
              ].join(' ')}
            >
              Зээл:&nbsp;{totalCredit.toLocaleString('en-US')}₮
            </button>
          )}
        </div>

        {/* ── Mobile: buttons ──────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 md:hidden">
          <div className="flex items-center gap-2">
            <button
              onClick={onApply}
              className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white text-sm
                         font-medium hover:bg-blue-700 active:bg-blue-800 transition-colors"
            >
              Шүүх
            </button>
            {hasFilter && (
              <button
                onClick={onReset}
                className="flex-1 py-2.5 rounded-lg border border-gray-200
                           text-sm text-gray-500 hover:bg-gray-50 transition-colors"
              >
                Цэвэрлэх
              </button>
            )}
            <ExportButton
              hasFilter={hasFilter}
              activeFilterCount={activeFilterCount}
              hasData={hasData}
              isExporting={isExporting}
              onExport={onExport}
            />
          </div>
          {totalCredit > 0 && (
            <div className="flex justify-end">
              <button
                onClick={onToggleCredit}
                aria-pressed={creditOnly}
                className={[
                  'inline-flex items-center h-[30px] px-3 rounded-full',
                  'text-xs font-medium tabular-nums whitespace-nowrap',
                  'border transition-all',
                  creditOnly
                    ? 'border-amber-400 bg-amber-100 text-amber-800 hover:bg-amber-200 active:bg-amber-300'
                    : 'border-amber-300 bg-transparent text-amber-600 hover:bg-amber-50 active:bg-amber-100',
                ].join(' ')}
              >
                Зээл:&nbsp;{totalCredit.toLocaleString('en-US')}₮
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ isFiltered }: { isFiltered: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-4">
      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <Package2 className="w-8 h-8 text-gray-300" />
      </div>
      <p className="text-sm font-medium text-gray-600 mb-1">
        {isFiltered ? 'Тохирох захиалга олдсонгүй' : 'Худалдан авалтын түүх хоосон байна'}
      </p>
      <p className="text-xs text-gray-400 max-w-[220px] leading-relaxed">
        {isFiltered
          ? 'Шүүлтүүрийг өөрчлөн дахин хайж үзнэ үү'
          : 'Таны өмнөх захиалгууд энд харагдана'}
      </p>
    </div>
  );
}

// ── Page component ────────────────────────────────────────────────────────────
interface PurchaseHistoryPageProps {
  isOpen:               boolean;
  onClose:              () => void;
  isLoggedIn:           boolean;
  customerPhone:        number | null;
  customerGoogleId:     string | null;
}

export function PurchaseHistoryPage({
  isOpen,
  onClose,
  isLoggedIn,
  customerPhone,
  customerGoogleId,
}: PurchaseHistoryPageProps) {
  const [mounted,          setMounted]          = useState(false);
  const [visible,          setVisible]          = useState(false);
  const [expandedIds,      setExpandedIds]      = useState<Set<string>>(new Set());
  const [creditExpandedId, setCreditExpandedId] = useState<string | null>(null);
  const [noteModal,        setNoteModal]        = useState({ open: false, note: '' });
  const [isExporting,      setIsExporting]      = useState(false);
  const [printData,        setPrintData]        = useState<GroupedPrintData | null>(null);
  const [fetched,          setFetched]          = useState<HistoryItem[]>([]);
  const [fetchLoading,     setFetchLoading]     = useState(false);
  const [fetchErr,        setFetchErr]         = useState<string | null>(null);

  // ── Credit-only toggle ────────────────────────────────────────────────────
  const [creditOnly, setCreditOnly] = useState(false);

  // ── Store filter — toggled by clicking a store pill in any row ────────────
  const [storeFilter, setStoreFilter] = useState<string | null>(null);

  function handleStoreFilter(store: string) {
    setStoreFilter(prev => (prev === store ? null : store));
  }

  // ── Filter input state — default: өнөөдөр
  const initToday = () => todayISO();
  const [startDate,  setStartDate]  = useState(initToday);
  const [endDate,    setEndDate]    = useState(initToday);
  const [searchName, setSearchName] = useState('');

  // ── Applied filter state ──────────────────────────────────────────────────
  const [appliedStart, setAppliedStart] = useState(initToday);
  const [appliedEnd,   setAppliedEnd]   = useState(initToday);
  const [appliedName,  setAppliedName]  = useState('');

  const hasFilter = !!(appliedStart || appliedEnd || appliedName.trim());

  const activeFilterCount = useMemo(
    () => [appliedStart, appliedEnd, appliedName.trim()].filter(Boolean).length,
    [appliedStart, appliedEnd, appliedName],
  );

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return fetched.filter(item => {
      const iso = toISO(item.date);
      if (appliedStart && iso < appliedStart) return false;
      if (appliedEnd   && iso > appliedEnd)   return false;
      if (appliedName.trim()) {
        const q = appliedName.trim().toLowerCase();
        if (!item.products.some(p => p.name.toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [fetched, appliedStart, appliedEnd, appliedName]);

  // ── Credit total ──────────────────────────────────────────────────────────
  const totalCredit = useMemo(() => {
    return filtered.reduce((sum, item) => {
      if (item.creditType === 'credit')  return sum + calcTotal(item.products);
      if (item.creditType === 'partial') return sum + (item.creditAmount ?? 0);
      return sum;
    }, 0);
  }, [filtered]);

  // ── Displayed = filtered + credit-only + store filter ────────────────────
  const displayed = useMemo(() => {
    let list = creditOnly ? filtered.filter(item => item.creditType !== 'paid') : filtered;
    if (storeFilter) list = list.filter(item => item.store === storeFilter);
    return list;
  }, [filtered, creditOnly, storeFilter]);

  function handleApply() {
    setAppliedStart(startDate);
    setAppliedEnd(endDate);
    setAppliedName(searchName);
  }

  // Цэвэрлэх → өнөөдөр + барааны нэр хоосон
  function handleReset() {
    const t = todayISO();
    setStartDate(t); setEndDate(t);
    setAppliedStart(t); setAppliedEnd(t);
    setSearchName(''); setAppliedName('');
    setCreditOnly(false);
    setExpandedIds(new Set());
  }

  function handleExport() {
    if (displayed.length === 0) return;
    setIsExporting(true);
    try {
      const header = [
        'Захиалгын №', 'Огноо', 'Дэлгүүр', 'Утас',
        'Бараа', 'Тоо', 'Нэгж үнэ', 'Мөрийн дүн', 'Тэмдэглэл',
      ].join(',');
      const rows: string[] = [header];
      for (const item of displayed) {
        const note = csvEscapeCell(item.note ?? '');
        const baseRow = [
          csvEscapeCell(item.id),
          csvEscapeCell(fmtDate(item.date)),
          csvEscapeCell(item.store),
          csvEscapeCell(item.phone),
        ];
        for (const p of item.products) {
          const lt = p.price * p.quantity;
          rows.push(
            [
              ...baseRow,
              csvEscapeCell(p.name),
              String(p.quantity),
              String(p.price),
              String(lt),
              note,
            ].join(','),
          );
        }
      }
      const blob = new Blob([`\uFEFF${rows.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hudaldan_avalt_${appliedStart || 'from'}_${appliedEnd || 'to'}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  }

  /** Header "Хэвлэх" — grouped PurchaseHistoryPrint */
  function handlePrintAll() {
    const data = buildGroupedPurchaseData(displayed, {
      dateFrom:    appliedStart  || undefined,
      dateTo:      appliedEnd    || undefined,
      productName: appliedName.trim() || undefined,
    });
    setPrintData(data);
  }

  /** Row printer icon → opens /sales-history-print.html in a popup window,
   *  passes the selected sale record to SalesHistoryPrint(), then prints. */
  function handleRowPrint(item: HistoryItem) {
    const data = {
      docNumber : item.id,
      date      : fmtDate(item.date),
      store     : item.store,
      phone     : item.phone,
      cashier   : '',
      products  : item.products.map(p => ({
        name: p.name, quantity: p.quantity, price: p.price,
      })),
      note: item.note || '',
    };

    const win = window.open(
      '/sales-history-print.html',
      '_blank',
      'width=700,height=960,menubar=no,toolbar=no,location=no,scrollbars=yes',
    );
    if (!win) return;

    win.addEventListener('load', () => {
      if (typeof (win as any).SalesHistoryPrint === 'function') {
        (win as any).SalesHistoryPrint(data);
      }
      // Brief delay so the DOM settles before the print dialog opens
      setTimeout(() => win.print(), 150);
    });
  }

  // ── Slide-in / slide-out ──────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 250);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // ── Худалдан авалтын түүх (`sales`) — шүүлтийн огнооны хязгаараар ──────────
  useEffect(() => {
    if (!isOpen) return;

    if (!isLoggedIn) {
      setFetched([]);
      setFetchLoading(false);
      setFetchErr(null);
      return;
    }

    let cancelled = false;
    const { from, to } = normalizeDateRangeForFetch(appliedStart, appliedEnd);

    async function load() {
      setFetchLoading(true);
      setFetchErr(null);
      try {
        const rows = await fetchSalesPurchaseHistoryGrouped({
          isLoggedIn: true,
          phone: customerPhone,
          googleId: customerGoogleId,
          dateFrom: from,
          dateTo: to,
        });
        if (!cancelled) setFetched(rows.map(groupedSaleToHistoryItem));
      } catch (e) {
        if (!cancelled) {
          setFetched([]);
          setFetchErr(e instanceof Error ? e.message : 'Түүх уншихад алдаа гарлаа.');
        }
      } finally {
        if (!cancelled) setFetchLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, isLoggedIn, customerPhone, customerGoogleId, appliedStart, appliedEnd]);

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
      window.scrollTo(0, savedY);
    };
  }, [isOpen]);

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleCredit(id: string) {
    setCreditExpandedId(prev => (prev === id ? null : id));
  }

  if (!mounted) return null;

  return (
    <div
      className="fixed inset-0 z-[160] bg-gray-50 flex flex-col"
      style={{
        opacity:    visible ? 1 : 0,
        transform:  visible ? 'translateX(0)' : 'translateX(40px)',
        transition: 'opacity 0.22s ease, transform 0.22s ease',
      }}
    >
      {/* ── Sticky page header ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shrink-0">
        <div className="max-w-4xl mx-auto px-4 py-3.5 flex items-center gap-3">
          <button
            onClick={onClose}
            aria-label="Буцах"
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center
                       hover:bg-gray-200 transition-colors shrink-0"
          >
            <ChevronLeft className="w-4 h-4 text-gray-700" />
          </button>

          <h1 className="text-[22px] font-semibold text-gray-900 leading-none flex-1">
            Худалдан авалтын түүх
          </h1>

          {/* Header print button — grouped PurchaseHistoryPrint */}
          <button
            onClick={handlePrintAll}
            disabled={displayed.length === 0}
            aria-label="Бүгдийг хэвлэх"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                       border border-gray-200 bg-white text-sm text-gray-600
                       hover:bg-gray-50 hover:border-gray-300 active:bg-gray-100
                       transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Хэвлэх</span>
          </button>

          {/* Total count */}
          <span className="text-xs text-gray-500 bg-gray-100 rounded-full px-2.5 py-1
                           font-medium shrink-0 whitespace-nowrap">
            Нийт: {(hasFilter || creditOnly)
              ? `${displayed.length} / ${fetched.length > 0 ? fetched.length : '—'}`
              : `${fetched.length} захиалга`}
          </span>
        </div>
      </div>

      {/* ── Scrollable content ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-5">

          {/* ── Filter bar ─────────────────────────────────────────────────── */}
          <FilterBar
            startDate={startDate}
            endDate={endDate}
            searchName={searchName}
            onStart={setStartDate}
            onEnd={setEndDate}
            onSearch={setSearchName}
            onApply={handleApply}
            onReset={handleReset}
            hasFilter={hasFilter}
            activeFilterCount={activeFilterCount}
            hasData={displayed.length > 0}
            isExporting={isExporting}
            totalCredit={totalCredit}
            creditOnly={creditOnly}
            onToggleCredit={() => setCreditOnly(prev => !prev)}
            onExport={handleExport}
          />

          {fetchErr && (
            <div
              role="alert"
              className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 leading-relaxed"
            >
              {fetchErr}
            </div>
          )}

          {/* ── Active filter chips ─────────────────────────────────────────── */}
          {hasFilter && (
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-xs text-gray-400">Шүүлтүүр:</span>
              {appliedStart && appliedEnd ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] bg-blue-50 text-blue-700
                                 border border-blue-200 px-2.5 py-1 rounded-full">
                  {appliedStart} – {appliedEnd}
                  <button
                    onClick={() => {
                      setStartDate(''); setEndDate('');
                      setAppliedStart(''); setAppliedEnd('');
                    }}
                    className="hover:text-blue-900 transition-colors"
                    aria-label="Огноо шүүлтүүр устгах"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ) : (
                <>
                  {appliedStart && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] bg-blue-50 text-blue-700
                                     border border-blue-200 px-2.5 py-1 rounded-full">
                      {appliedStart} -ээс
                      <button
                        onClick={() => { setStartDate(''); setAppliedStart(''); }}
                        className="hover:text-blue-900 transition-colors"
                        aria-label="Эхлэх огноо устгах"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  )}
                  {appliedEnd && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] bg-blue-50 text-blue-700
                                     border border-blue-200 px-2.5 py-1 rounded-full">
                      {appliedEnd} хүртэл
                      <button
                        onClick={() => { setEndDate(''); setAppliedEnd(''); }}
                        className="hover:text-blue-900 transition-colors"
                        aria-label="Дуусах огноо устгах"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  )}
                </>
              )}
              {appliedName && (
                <span className="inline-flex items-center gap-1.5 text-[11px] bg-blue-50 text-blue-700
                                 border border-blue-200 px-2.5 py-1 rounded-full">
                  "{appliedName}"
                  <button
                    onClick={() => { setSearchName(''); setAppliedName(''); }}
                    className="hover:text-blue-900 transition-colors"
                    aria-label="Барааны нэр шүүлтүүр устгах"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              )}
            </div>
          )}

          {/* ── History cards ───────────────────────────────────────────────── */}
          {displayed.length === 0 && fetchLoading ? (
            <div className="flex flex-col items-center justify-center py-24 text-center px-4 text-sm text-gray-500">
              Уншиж байна...
            </div>
          ) : displayed.length === 0 ? (
            <EmptyState isFiltered={hasFilter || creditOnly} />
          ) : (
            <div className="flex flex-col gap-3">
              {displayed.map(item => (
                <HistoryCard
                  key={`${item.id}-${item.date}`}
                  item={item}
                  isExpanded={expandedIds.has(item.id)}
                  onToggle={() => toggleExpand(item.id)}
                  onNoteClick={() => setNoteModal({ open: true, note: item.note ?? '' })}
                  onRowPrint={() => handleRowPrint(item)}
                  isCreditExpanded={creditExpandedId === item.id}
                  onCreditToggle={() => toggleCredit(item.id)}
                  storeFilter={storeFilter}
                  onStoreFilter={handleStoreFilter}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Note modal ───────────────────────────────────────────────────────── */}
      {noteModal.open && (
        <NoteModal note={noteModal.note} onClose={() => setNoteModal({ open: false, note: '' })} />
      )}

      {/* ── Header print portal (PurchaseHistoryPrint — grouped) ─────────────── */}
      {printData && (
        <PurchaseHistoryPrint
          data={printData}
          onClose={() => setPrintData(null)}
        />
      )}

      {/* row-level print handled by handleRowPrint() → /sales-history-print.html */}
    </div>
  );
}
