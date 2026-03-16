'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft, ChevronDown, ChevronUp,
  Store, Car, Truck, MessageSquare, Printer, Trash2, X, Package,
} from 'lucide-react';
import { OrderPrint, type OrderPrintData } from './print/OrderPrint';

// ── Types ─────────────────────────────────────────────────────────────────────
interface OrderProduct { name: string; quantity: number; price: number; }
type DeliveryType = 'pickup' | 'taxi' | 'delivery';
interface Order {
  id:           string;
  date:         string;   // "YYYY.MM.DD HH:MM"
  store:        string;
  phone:        string;   // 8 digits
  deliveryType: DeliveryType;
  note?:        string;
  products:     OrderProduct[];
}

// ── Mock data ─────────────────────────────────────────────────────────────────
const INITIAL_ORDERS: Order[] = [
  {
    id: 'ORD-2025-001',
    date: '2025.02.25 14:30',
    store: 'Store A',
    phone: '99990001',
    deliveryType: 'delivery',
    note: 'Үүдэнд нь тавиад явуулна уу. Утсаар урьдчилан мэдэгдээрэй. 13 давхар, 45 тоот.',
    products: [
      { name: 'Nike Air Max 270 Спорт', quantity: 2, price: 289000 },
      { name: 'Adidas Ultraboost 22 Pro', quantity: 1, price: 320000 },
    ],
  },
  {
    id: 'ORD-2025-002',
    date: '2025.02.24 10:15',
    store: 'Store A',
    phone: '88881234',
    deliveryType: 'taxi',
    products: [
      { name: 'Rolex Submariner', quantity: 1, price: 12500000 },
    ],
  },
  {
    id: 'ORD-2025-003',
    date: '2025.02.22 16:45',
    store: 'Store B',
    phone: '99990003',
    deliveryType: 'pickup',
    note: 'Маргааш 11:00 цагт очно.',
    products: [
      { name: 'Sony WH-1000XM5 Чихэвч', quantity: 1, price: 450000 },
      { name: 'JBL Flip 6 Чанга яригч', quantity: 2, price: 180000 },
      { name: 'Premium Cotton T-Shirt', quantity: 3, price: 45000 },
    ],
  },
  {
    id: 'ORD-2025-004',
    date: '2025.02.20 09:00',
    store: 'Store B',
    phone: '77774321',
    deliveryType: 'delivery',
    products: [
      { name: 'MacBook Pro 14" M3 Pro', quantity: 1, price: 4200000 },
      { name: 'iPhone 15 Pro Max 256GB', quantity: 1, price: 2850000 },
    ],
  },
  {
    id: 'ORD-2025-005',
    date: '2025.02.18 13:20',
    store: 'Store A',
    phone: '96661111',
    deliveryType: 'taxi',
    note: 'Urgently needed.',
    products: [
      { name: 'Cartier Love Алтан бөгж', quantity: 1, price: 3500000 },
      { name: 'Tiffany & Co Хэлхээ',     quantity: 1, price: 2800000 },
      { name: 'Chanel No. 5 Eau de Parfum', quantity: 2, price: 480000 },
    ],
  },
];

// ── Utilities ─────────────────────────────────────────────────────────────────
function fmt(n: number): string {
  return n.toLocaleString('en-US') + '₮';
}
function calcTotal(products: OrderProduct[]): number {
  return products.reduce((s, p) => s + p.price * p.quantity, 0);
}
/** Strip the time portion: "2025.02.25 14:30" → "2025.02.25" */
function fmtDate(date: string): string {
  return date.split(' ')[0];
}

// ── Portal tooltip — renders at <body> so it's never clipped ──────────────────
// Appears BELOW the trigger with opacity + translateY animation.
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
        <div
          style={{
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
          }}
        >
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

// ── Delivery icon with tooltip ────────────────────────────────────────────────
const DELIVERY_META: Record<DeliveryType, { Icon: React.ElementType; label: string; cls: string }> = {
  pickup:   { Icon: Store, label: 'Очоод авна', cls: 'text-blue-500'  },
  taxi:     { Icon: Car,   label: 'Такси',      cls: 'text-amber-500' },
  delivery: { Icon: Truck, label: 'Хүргүүлнэ', cls: 'text-green-500' },
};
function DeliveryIcon({ type }: { type: DeliveryType }) {
  const { Icon, label, cls } = DELIVERY_META[type];
  return (
    <Tip label={label}>
      <Icon className={`w-4 h-4 ${cls}`} />
    </Tip>
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

// ── Delete Confirm Modal ───────────────────────────────────────────────��──────
function DeleteModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-[190] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl w-full max-w-[360px] p-5 shadow-2xl">
        <div className="flex justify-center mb-3">
          <div className="w-11 h-11 rounded-full bg-red-50 flex items-center justify-center">
            <Trash2 className="w-5 h-5 text-red-500" />
          </div>
        </div>
        <p className="text-sm text-gray-800 text-center mb-5 leading-relaxed px-2">
          Та энэ захиалгыг устгахдаа итгэлтэй байна уу?
        </p>
        <div className="flex gap-2.5">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm
                       text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          >
            Цуцлах
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm
                       font-medium hover:bg-red-600 active:bg-red-700 transition-colors"
          >
            Устгах
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Order Card ───────────────────────────────────────────────────────────────
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
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden
                    transition-shadow hover:shadow-md">

      {/* ═══════════════════════════════════════════════════════════
          DESKTOP summary row — 7 columns
          ═══════════════════════════════════════════════════════════ */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        className="hidden md:flex items-center cursor-pointer select-none
                   hover:bg-gray-50/80 transition-colors px-4 py-3.5"
        onClick={onToggle}
        onKeyDown={e => e.key === 'Enter' && onToggle()}
      >
        {/* 1 — Expand chevron */}
        <div className="w-7 shrink-0 flex justify-center text-gray-400">
          {isExpanded
            ? <ChevronUp   className="w-4 h-4" />
            : <ChevronDown className="w-4 h-4" />}
        </div>

        {/* 2 — Огноо */}
        <span className="w-36 shrink-0 text-sm text-gray-600 tabular-nums">
          {fmtDate(order.date)}
        </span>

        {/* 3 — Дэлгүүрийн нэр */}
        <div className="w-24 shrink-0 overflow-hidden">
          <span className="block text-sm text-gray-500 font-mono tracking-wider whitespace-nowrap overflow-hidden text-ellipsis">
            {order.store}
          </span>
        </div>

        {/* 4 — Утас */}
        <span className="w-28 shrink-0 text-sm text-gray-500 font-mono tracking-wider">
          {order.phone}
        </span>

        {/* 5 — Хүргэлтийн төрөл */}
        <div className="w-14 shrink-0 flex justify-center">
          <DeliveryIcon type={order.deliveryType} />
        </div>

        {/* 6 — Нийт дүн + badge */}
        <div className="flex-1 flex items-center gap-3 min-w-0">
          <span className="text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">
            {fmt(total)}
          </span>
          <StatusBadge />
        </div>

        {/* 7 — Тэмдэглэл */}
        <div
          className="w-10 shrink-0 flex justify-center"
          onClick={e => e.stopPropagation()}
        >
          <Tip label={order.note ? 'Тэмдэглэл харах' : 'Тэмдэглэл байхгүй'}>
            <button
              aria-label="Тэмдэглэл"
              disabled={!order.note}
              onClick={() => order.note && onNoteClick()}
              className={`transition-colors ${
                order.note
                  ? 'text-blue-500 hover:text-blue-700 cursor-pointer'
                  : 'text-gray-300 cursor-default'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
            </button>
          </Tip>
        </div>

        {/* 8 — Үйлдлүүд: Print + Delete */}
        <div
          className="w-[72px] shrink-0 flex items-center justify-end gap-3"
          onClick={e => e.stopPropagation()}
        >
          <Tip label="Хэвлэх">
            <button
              aria-label="Хэвлэх"
              onClick={onPrint}
              className="text-gray-400 hover:text-gray-700 transition-colors"
            >
              <Printer className="w-4 h-4" />
            </button>
          </Tip>
          <Tip label="Устгах">
            <button
              aria-label="Устгах"
              onClick={onDeleteClick}
              className="text-gray-400 hover:text-red-500 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </Tip>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          MOBILE summary card — stacked layout
          ═══════════════════════════════════════════════════════════ */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        className="md:hidden cursor-pointer select-none px-4 pt-3.5 pb-3"
        onClick={onToggle}
        onKeyDown={e => e.key === 'Enter' && onToggle()}
      >
        {/* Row 1: date + action icons */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-500 tabular-nums">{fmtDate(order.date)}</span>
          <div
            className="flex items-center gap-2"
            onClick={e => e.stopPropagation()}
          >
            <DeliveryIcon type={order.deliveryType} />
            {order.note && (
              <button
                aria-label="Тэмдэглэл"
                onClick={onNoteClick}
                className="text-blue-500"
              >
                <MessageSquare className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              aria-label="Хэвлэх"
              onClick={onPrint}
              className="text-gray-400 hover:text-gray-700 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
            </button>
            <button
              aria-label="Устгах"
              onClick={onDeleteClick}
              className="text-gray-400 hover:text-red-500 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Row 2: store + phone */}
        <span className="block text-sm text-gray-700 font-mono tracking-wider mb-1 truncate">
          {order.store}
        </span>
        <span className="block text-sm text-gray-700 font-mono tracking-wider mb-2.5">
          {order.phone}
        </span>

        {/* Row 3: badge + total + chevron */}
        <div className="flex items-center justify-between">
          <StatusBadge />
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-gray-900 tabular-nums">
              {fmt(total)}
            </span>
            {isExpanded
              ? <ChevronUp   className="w-3.5 h-3.5 text-gray-400" />
              : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          Expanded product table (shared mobile + desktop)
          ══════════════════════════════════════════════════════════ */}
      {isExpanded && (
        <div className="border-t border-gray-100 bg-[#F9FAFB]">
          <div className="px-4 py-3 overflow-x-auto">
            <table className="w-full min-w-[300px]">
              <thead>
                <tr>
                  <th className="text-left text-xs font-medium text-gray-500 pb-2.5 pr-3
                                 border-b border-gray-200">
                    Барааны нэр
                  </th>
                  <th className="text-center text-xs font-medium text-gray-500 pb-2.5 w-12
                                 border-b border-gray-200">
                    Тоо
                  </th>
                  <th className="text-right text-xs font-medium text-gray-500 pb-2.5 w-28 pr-3
                                 border-b border-gray-200">
                    Үнэ
                  </th>
                  <th className="text-right text-xs font-medium text-gray-500 pb-2.5 w-28
                                 border-b border-gray-200">
                    Нийт
                  </th>
                </tr>
              </thead>
              <tbody>
                {order.products.map((p, i) => (
                  <tr
                    key={i}
                    className={i > 0 ? 'border-t border-gray-100' : ''}
                  >
                    <td className="text-sm text-gray-800 py-2 pr-3 leading-snug">
                      {p.name}
                    </td>
                    <td className="text-sm text-center text-gray-600 tabular-nums py-2">
                      {p.quantity}
                    </td>
                    <td className="text-sm text-right text-gray-600 tabular-nums py-2 pr-3">
                      {fmt(p.price)}
                    </td>
                    <td className="text-sm text-right text-gray-700 tabular-nums py-2">
                      {fmt(p.price * p.quantity)}
                    </td>
                  </tr>
                ))}
                {/* Total row */}
                <tr className="border-t-2 border-gray-300">
                  <td
                    colSpan={3}
                    className="text-sm font-semibold text-gray-900 pt-2.5 pb-1 pr-3"
                  >
                    Нийт
                  </td>
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

// ── Page component ────────────────────────────────────────────────────────────
interface MyOrdersPageProps {
  isOpen:  boolean;
  onClose: () => void;
}

export function MyOrdersPage({ isOpen, onClose }: MyOrdersPageProps) {
  const [mounted,     setMounted]     = useState(false);
  const [visible,     setVisible]     = useState(false);
  const [orders,      setOrders]      = useState<Order[]>(INITIAL_ORDERS);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [noteModal,   setNoteModal]   = useState({ open: false, note: '' });
  const [deleteModal, setDeleteModal] = useState({ open: false, id: '' });
  const [rowPrintData, setRowPrintData] = useState<OrderPrintData | null>(null);

  // ── Slide-in / slide-out animation ───────────────────────────────────────
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

  function handleConfirmDelete() {
    setOrders(prev => prev.filter(o => o.id !== deleteModal.id));
    setExpandedIds(prev => { const n = new Set(prev); n.delete(deleteModal.id); return n; });
    setDeleteModal({ open: false, id: '' });
  }

  function handlePrintOrder(order: Order) {
    setRowPrintData({
      id:       order.id,
      date:     order.date,
      store:    order.store,
      phone:    order.phone,
      products: order.products,
    });
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
      {/* ── Sticky page header ──────────────────────────────────────────── */}
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

          {/* Page title — 22px semi-bold, left-aligned */}
          <h1 className="text-[22px] font-semibold text-gray-900 leading-none flex-1">
            Миний захиалгууд
          </h1>

          {/* Count badge */}
          {orders.length > 0 && (
            <span className="text-xs text-gray-500 bg-gray-100 rounded-full px-2.5 py-1
                             font-medium shrink-0">
              {orders.length} захиалга
            </span>
          )}
        </div>
      </div>

      {/* ── Scrollable order list ────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-5">

          {orders.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-24 text-gray-400">
              <Package className="w-12 h-12 mb-3 opacity-25" />
              <p className="text-sm">Одоогоор захиалга байхгүй байна</p>
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
                  onDeleteClick={() => setDeleteModal({ open: true, id: order.id })}
                  onPrint={() => handlePrintOrder(order)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Note popup ──────────────────────────────────────────────────── */}
      {noteModal.open && (
        <NoteModal
          note={noteModal.note}
          onClose={() => setNoteModal({ open: false, note: '' })}
        />
      )}

      {/* ── Delete confirm popup ─────────────────────────────────────────── */}
      {deleteModal.open && (
        <DeleteModal
          onCancel={() => setDeleteModal({ open: false, id: '' })}
          onConfirm={handleConfirmDelete}
        />
      )}

      {/* ── Print popup ─────────────────────────────────────────────────── */}
      {rowPrintData && (
        <OrderPrint data={rowPrintData} onClose={() => setRowPrintData(null)} />
      )}
    </div>
  );
}