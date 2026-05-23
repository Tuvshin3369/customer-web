'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft, ChevronDown, ChevronUp, Phone,
  Store, Car, Truck, MessageSquare, Printer, Trash2, X,
  Package, Search, ArrowRight,
} from 'lucide-react';
import { printOnlineOrdersByIds } from '../../lib/print/receipt/printTransactionDocument';
import {
  fetchOnlineOrdersByEcommercePhone,
  deleteOnlineOrdersByIds,
  type DeliveryType,
  type OnlineOrderProduct,
} from '../lib/onlineOrdersFetch';

// ── Types ─────────────────────────────────────────────────────────────────────
type OrderProduct = OnlineOrderProduct;
interface Order {
  id:           string;
  date:         string;
  store:        string;
  phone:        string;
  deliveryType: DeliveryType;
  note?:        string;
  products:     OrderProduct[];
  rowIds:       string[];
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function fmt(n: number): string { return n.toLocaleString('en-US') + '₮'; }
function calcTotal(products: OrderProduct[]): number {
  return products.reduce((s, p) => s + p.price * p.quantity, 0);
}
function fmtDate(date: string): string { return date.split(' ')[0]; }

// ── Portal tooltip ────────────────────────────────────────────────────────────
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
    <div ref={ref} onMouseEnter={handleMouseEnter} onMouseLeave={() => setVisible(false)}
         className="inline-flex items-center justify-center">
      {children}
      {typeof document !== 'undefined' && createPortal(
        <div style={{
          position: 'fixed', left: coords.x, top: coords.y + 8,
          transform: `translateX(-50%) translateY(${visible ? '0px' : '6px'})`,
          opacity: visible ? 1 : 0, transition: 'opacity 150ms ease, transform 150ms ease',
          pointerEvents: 'none', zIndex: 9999, background: '#111', color: '#fff',
          fontSize: '12px', lineHeight: '1', padding: '8px 12px',
          borderRadius: '6px', whiteSpace: 'nowrap', boxShadow: '0 4px 14px rgba(0,0,0,0.28)',
        }}>
          {label}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge() {
  return (
    <span className="inline-flex items-center text-[10px] font-medium
                     bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full
                     border border-amber-200 whitespace-nowrap shrink-0">
      Хүлээгдэж байна
    </span>
  );
}

// ── Delivery icon ─────────────────────────────────────────────────────────────
const DELIVERY_META: Record<DeliveryType, { Icon: React.ElementType; label: string; cls: string }> = {
  pickup:   { Icon: Store, label: 'Очоод авна', cls: 'text-blue-500'  },
  taxi:     { Icon: Car,   label: 'Такси',      cls: 'text-amber-500' },
  delivery: { Icon: Truck, label: 'Хүргүүлнэ', cls: 'text-green-500' },
};
function DeliveryIcon({ type }: { type: DeliveryType }) {
  const { Icon, label, cls } = DELIVERY_META[type];
  return <Tip label={label}><Icon className={`w-4 h-4 ${cls}`} /></Tip>;
}

// ── Note Modal ────────────────────────────────────────────────────────────────
function NoteModal({ note, onClose }: { note: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-[400px] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Тэмдэглэл</h3>
          <button onClick={onClose} aria-label="Хаах"
                  className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
            <X className="w-3.5 h-3.5 text-gray-600" />
          </button>
        </div>
        <div className="px-5 py-4 min-h-[60px]">
          <p className="text-sm text-gray-700 leading-relaxed">{note}</p>
        </div>
        <div className="px-5 pb-5">
          <button onClick={onClose}
                  className="w-full py-2.5 rounded-xl bg-gray-100 text-sm text-gray-700 hover:bg-gray-200 active:bg-gray-300 transition-colors">
            Хаах
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────
function DeleteModal({
  onCancel,
  onConfirm,
  loading = false,
  error = null,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  loading?: boolean;
  error?: string | null;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={loading ? undefined : onCancel}
      />
      <div className="relative bg-white rounded-2xl w-full max-w-[360px] p-5 shadow-2xl">
        <div className="flex justify-center mb-3">
          <div className="w-11 h-11 rounded-full bg-red-50 flex items-center justify-center">
            <Trash2 className="w-5 h-5 text-red-500" />
          </div>
        </div>
        <p className="text-sm text-gray-800 text-center mb-3 leading-relaxed px-2">
          Та энэ захиалгыг устгахдаа итгэлтэй байна уу?
        </p>
        {error && (
          <p className="text-xs text-red-500 text-center mb-3 leading-relaxed px-2">{error}</p>
        )}
        <div className="flex gap-2.5">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Цуцлах
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 active:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Устгаж байна…' : 'Устгах'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Order Card ────────────────────────────────────────────────────────────────
interface OrderCardProps {
  order:         Order;
  isExpanded:    boolean;
  onToggle:      () => void;
  onNoteClick:   () => void;
  onDeleteClick: () => void;
  onPrint:       () => void;
}
function OrderCard({ order, isExpanded, onToggle, onNoteClick, onDeleteClick, onPrint }: OrderCardProps) {
  const total = calcTotal(order.products);
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden transition-shadow hover:shadow-md">

      {/* Desktop row */}
      <div role="button" tabIndex={0} aria-expanded={isExpanded}
           className="hidden md:flex items-center cursor-pointer select-none hover:bg-gray-50/80 transition-colors px-4 py-3.5"
           onClick={onToggle} onKeyDown={e => e.key === 'Enter' && onToggle()}>
        <div className="w-7 shrink-0 flex justify-center text-gray-400">
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
        <span className="w-36 shrink-0 text-sm text-gray-600 tabular-nums">{fmtDate(order.date)}</span>
        <div className="w-24 shrink-0 overflow-hidden">
          <span className="block text-sm text-gray-500 font-mono tracking-wider whitespace-nowrap overflow-hidden text-ellipsis">{order.store}</span>
        </div>
        <span className="w-28 shrink-0 text-sm text-gray-500 font-mono tracking-wider">{order.phone}</span>
        <div className="w-14 shrink-0 flex justify-center"><DeliveryIcon type={order.deliveryType} /></div>
        <div className="flex-1 flex items-center gap-3 min-w-0">
          <span className="text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">{fmt(total)}</span>
          <StatusBadge />
        </div>
        <div className="w-10 shrink-0 flex justify-center" onClick={e => e.stopPropagation()}>
          <Tip label={order.note ? 'Тэмдэглэл харах' : 'Тэмдэглэл байхгүй'}>
            <button aria-label="Тэмдэглэл" disabled={!order.note}
                    onClick={() => order.note && onNoteClick()}
                    className={`transition-colors ${order.note ? 'text-blue-500 hover:text-blue-700 cursor-pointer' : 'text-gray-300 cursor-default'}`}>
              <MessageSquare className="w-4 h-4" />
            </button>
          </Tip>
        </div>
        <div className="w-[72px] shrink-0 flex items-center justify-end gap-3" onClick={e => e.stopPropagation()}>
          <Tip label="Хэвлэх">
            <button aria-label="Хэвлэх" onClick={onPrint} className="text-gray-400 hover:text-gray-700 transition-colors">
              <Printer className="w-4 h-4" />
            </button>
          </Tip>
          <Tip label="Устгах">
            <button aria-label="Устгах" onClick={onDeleteClick} className="text-gray-400 hover:text-red-500 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </Tip>
        </div>
      </div>

      {/* Mobile card */}
      <div role="button" tabIndex={0} aria-expanded={isExpanded}
           className="md:hidden cursor-pointer select-none px-4 pt-3.5 pb-3"
           onClick={onToggle} onKeyDown={e => e.key === 'Enter' && onToggle()}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-500 tabular-nums">{fmtDate(order.date)}</span>
          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            <DeliveryIcon type={order.deliveryType} />
            {order.note && (
              <button aria-label="Тэмдэглэл" onClick={onNoteClick} className="text-blue-500">
                <MessageSquare className="w-3.5 h-3.5" />
              </button>
            )}
            <button aria-label="Хэвлэх" onClick={onPrint} className="text-gray-400 hover:text-gray-700 transition-colors">
              <Printer className="w-3.5 h-3.5" />
            </button>
            <button aria-label="Устгах" onClick={onDeleteClick} className="text-gray-400 hover:text-red-500 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <span className="block text-sm text-gray-700 font-mono tracking-wider mb-1 truncate">{order.store}</span>
        <span className="block text-sm text-gray-700 font-mono tracking-wider mb-2.5">{order.phone}</span>
        <div className="flex items-center justify-between">
          <StatusBadge />
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-gray-900 tabular-nums">{fmt(total)}</span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
          </div>
        </div>
      </div>

      {/* Expanded product table */}
      {isExpanded && (
        <div className="border-t border-gray-100 bg-[#F9FAFB]">
          <div className="px-4 py-3 overflow-x-auto">
            <table className="w-full min-w-[300px]">
              <thead>
                <tr>
                  <th className="text-left text-xs font-medium text-gray-500 pb-2.5 pr-3 border-b border-gray-200">Барааны нэр</th>
                  <th className="text-center text-xs font-medium text-gray-500 pb-2.5 w-12 border-b border-gray-200">Тоо</th>
                  <th className="text-right text-xs font-medium text-gray-500 pb-2.5 w-28 pr-3 border-b border-gray-200">Үнэ</th>
                  <th className="text-right text-xs font-medium text-gray-500 pb-2.5 w-28 border-b border-gray-200">Нийт</th>
                </tr>
              </thead>
              <tbody>
                {order.products.map((p, i) => (
                  <tr key={i} className={i > 0 ? 'border-t border-gray-100' : ''}>
                    <td className="text-sm text-gray-800 py-2 pr-3 leading-snug">
                      <div>{p.name}</div>
                      {p.extraInfo && (
                        <div className="text-[10px] text-blue-500 font-medium mt-0.5 leading-relaxed">
                          {p.extraInfo}
                        </div>
                      )}
                    </td>
                    <td className="text-sm text-center text-gray-600 tabular-nums py-2">{p.quantity}</td>
                    <td className="text-sm text-right text-gray-600 tabular-nums py-2 pr-3">{fmt(p.price)}</td>
                    <td className="text-sm text-right text-gray-700 tabular-nums py-2">{fmt(p.price * p.quantity)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-300">
                  <td colSpan={3} className="text-sm font-semibold text-gray-900 pt-2.5 pb-1 pr-3">Нийт</td>
                  <td className="text-sm font-semibold text-gray-900 text-right tabular-nums pt-2.5 pb-1">{fmt(total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface GuestOrdersPageProps {
  isOpen:  boolean;
  onClose: () => void;
}

export function GuestOrdersPage({ isOpen, onClose }: GuestOrdersPageProps) {
  const [mounted,   setMounted]   = useState(false);
  const [visible,   setVisible]   = useState(false);

  // ── Two-step state: 'phone' → 'orders' ───────────────────────────────────
  type Step = 'phone' | 'orders';
  const [step,      setStep]      = useState<Step>('phone');
  const [phone,     setPhone]     = useState('');
  const [phoneErr,  setPhoneErr]  = useState('');

  // ── Orders state ──────────────────────────────────────────────────────────
  const [orders,      setOrders]      = useState<Order[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchErr,     setSearchErr]     = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [noteModal,   setNoteModal]   = useState({ open: false, note: '' });
  const [deleteModal, setDeleteModal] = useState({ open: false, id: '' });
  const [deleting,     setDeleting]   = useState(false);
  const [deleteError,  setDeleteError] = useState<string | null>(null);
  const [printError,   setPrintError]  = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // ── Animation lifecycle ───────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      // Reset to phone step on every open
      setStep('phone');
      setPhone('');
      setPhoneErr('');
      setSearchErr(null);
      setOrders([]);
      setExpandedIds(new Set());
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setVisible(true);
        setTimeout(() => inputRef.current?.focus(), 300);
      }));
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 250);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // ── Body scroll lock ───────────────────────────────────────────────────────
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

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleSearch() {
    const cleaned = phone.replace(/\s/g, '');
    if (cleaned.length < 8) {
      setPhoneErr('8 оронтой утасны дугаар оруулна уу.');
      return;
    }
    setPhoneErr('');
    setSearchErr(null);
    setSearchLoading(true);
    try {
      const list = await fetchOnlineOrdersByEcommercePhone(cleaned);
      setOrders(list);
      setStep('orders');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Захиалгуудыг татаж чадсангүй.';
      setSearchErr(msg);
    } finally {
      setSearchLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') void handleSearch();
  }

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleConfirmDelete() {
    const target = orders.find(o => o.id === deleteModal.id);
    if (!target) {
      setDeleteModal({ open: false, id: '' });
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteOnlineOrdersByIds(target.rowIds);
      setOrders(prev => prev.filter(o => o.id !== target.id));
      setExpandedIds(prev => { const n = new Set(prev); n.delete(target.id); return n; });
      setDeleteModal({ open: false, id: '' });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Захиалгыг устгаж чадсангүй.');
    } finally {
      setDeleting(false);
    }
  }

  async function handlePrintOrder(order: Order) {
    if (!order.rowIds.length) {
      setPrintError('Хэвлэх боломжгүй');
      return;
    }
    setPrintError(null);
    const result = await printOnlineOrdersByIds(order.rowIds);
    if (!result.ok) setPrintError(result.message);
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
      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shrink-0">
        <div className="max-w-4xl mx-auto px-4 py-3.5 flex items-center gap-3">
          <button
            onClick={
              step === 'orders'
                ? () => {
                    setStep('phone');
                    setOrders([]);
                    setExpandedIds(new Set());
                  }
                : onClose
            }
            aria-label="Буцах"
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors shrink-0"
          >
            <ChevronLeft className="w-4 h-4 text-gray-700" />
          </button>

          <h1 className="text-[22px] font-semibold text-gray-900 leading-none flex-1">
            {step === 'phone' ? 'Захиалга хайх' : 'Миний захиалгууд'}
          </h1>

          {step === 'orders' && orders.length > 0 && (
            <span className="text-xs text-gray-500 bg-gray-100 rounded-full px-2.5 py-1 font-medium shrink-0">
              {orders.length} захиалга
            </span>
          )}
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-5">

          {/* ══ STEP 1: Phone input ══ */}
          {step === 'phone' && (
            <div className="flex flex-col items-center pt-8 pb-4">
              {/* Icon */}
              <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-5">
                <Phone className="w-7 h-7 text-blue-500" />
              </div>

              <h2 className="text-base font-semibold text-gray-900 mb-1.5 text-center">
                Утасны дугаараар хайх
              </h2>
              <p className="text-sm text-gray-500 text-center mb-6 max-w-[280px] leading-relaxed">
                Захиалга хийхэд ашигласан утасны дугаараа оруулна уу.
              </p>

              {/* Input card */}
              <div className="w-full max-w-[360px] bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Захиалга авах хүний утасны дугаар
                  </label>
                  <div className={`flex items-center gap-2.5 border rounded-xl px-3.5 py-3 transition-colors ${
                    phoneErr ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-gray-50 focus-within:border-blue-500 focus-within:bg-white'
                  }`}>
                    <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                    <input
                      ref={inputRef}
                      type="tel"
                      inputMode="numeric"
                      maxLength={8}
                      placeholder="99887766"
                      value={phone}
                      onChange={e => {
                        setPhone(e.target.value.replace(/[^0-9]/g, ''));
                        if (phoneErr) setPhoneErr('');
                        if (searchErr) setSearchErr(null);
                      }}
                      onKeyDown={handleKeyDown}
                      className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none tracking-widest"
                    />
                    {phone.length > 0 && (
                      <button onClick={() => { setPhone(''); setPhoneErr(''); }}
                              className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {phoneErr && <p className="text-xs text-red-500 mt-1 pl-0.5">{phoneErr}</p>}
                  {searchErr && <p className="text-xs text-red-500 mt-2 pl-0.5 leading-relaxed">{searchErr}</p>}
                </div>

                <button
                  type="button"
                  onClick={() => void handleSearch()}
                  disabled={searchLoading}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Search className="w-4 h-4" />
                  {searchLoading ? 'Хайж байна…' : 'Хайх'}
                  <ArrowRight className="w-4 h-4 ml-0.5" />
                </button>
              </div>
            </div>
          )}

          {/* ══ STEP 2: Orders list ══ */}
          {step === 'orders' && (
            <>
              {/* Phone context banner */}
              <div className="flex items-center gap-2 mb-4 px-1">
                <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <span className="text-xs text-gray-500 font-mono tracking-widest">{phone}</span>
                <button
                  type="button"
                  onClick={() => {
                    setStep('phone');
                    setOrders([]);
                    setExpandedIds(new Set());
                  }}
                  className="ml-auto text-xs text-blue-500 hover:text-blue-700 transition-colors font-medium"
                >
                  Өөрчлөх
                </button>
              </div>

              {orders.length === 0 ? (
                /* Empty state */
                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                  <Package className="w-12 h-12 mb-3 opacity-25" />
                  <p className="text-sm font-medium text-gray-500 mb-1">Захиалга олдсонгүй</p>
                  <p className="text-xs text-gray-400 text-center max-w-[220px] leading-relaxed">
                    {phone} дугаартай захиалга бүртгэгдээгүй байна.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {orders.map(order => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      isExpanded={expandedIds.has(order.id)}
                      onToggle={() => toggleExpand(order.id)}
                      onNoteClick={() => setNoteModal({ open: true, note: order.note! })}
                      onDeleteClick={() => {
                        setDeleteError(null);
                        setDeleteModal({ open: true, id: order.id });
                      }}
                      onPrint={() => void handlePrintOrder(order)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {noteModal.open && (
        <NoteModal note={noteModal.note} onClose={() => setNoteModal({ open: false, note: '' })} />
      )}
      {deleteModal.open && (
        <DeleteModal
          onCancel={() => {
            if (deleting) return;
            setDeleteError(null);
            setDeleteModal({ open: false, id: '' });
          }}
          onConfirm={handleConfirmDelete}
          loading={deleting}
          error={deleteError}
        />
      )}
      {printError && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] bg-red-600 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {printError}
          <button type="button" className="ml-3 underline" onClick={() => setPrintError(null)}>Хаах</button>
        </div>
      )}
    </div>
  );
}
