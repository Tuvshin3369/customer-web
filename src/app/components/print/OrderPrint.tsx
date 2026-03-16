/**
 * OrderPrint  (print-2)
 * ─────────────────────
 * Reusable A4-portrait receipt template for a single order row.
 * Called by the row-level Printer icon in MyOrdersPage and PurchaseHistoryPage.
 *
 * Usage:
 *   import { OrderPrint, type OrderPrintData } from './print/OrderPrint';
 *   <OrderPrint data={orderPrintData} onClose={() => setOrderPrintData(null)} />
 *
 * Paper: A4 portrait.  Keyboard: Escape closes.
 */

import { useEffect }           from 'react';
import { createPortal }        from 'react-dom';
import { Printer, X, ArrowLeft } from 'lucide-react';

// ── Company constants — replace with real values ──────────────────────────────
const COMPANY_NAME     = 'Таны Компани ХХК';
const COMPANY_PHONE    = '+976 9911-0000';
const COMPANY_ADDRESS  = 'Улаанбаатар хот, Чингэлтэй дүүрэг';
const COMPANY_REGISTER = 'РД: 1234567';

// ── Money formatter ───────────────────────────────────────────────────────────
function fmt(n: number): string {
  return n.toLocaleString('en-US') + '₮';
}

// ── Shared data type (exported so callers can type their state) ───────────────
export interface OrderPrintData {
  id:       string;
  date:     string;
  store?:   string;
  phone:    string;
  products: Array<{ name: string; quantity: number; price: number }>;
}

// ── Print CSS (injected into <head> while component is mounted) ───────────────
const PRINT_CSS = `
/* ── Page setup: A4 portrait ── */
@page {
  size: A4 portrait;
  margin: 14mm;
}

/* ── Hide everything except the print portal ── */
@media print {
  body > *:not(#op-print-portal) {
    display: none !important;
    visibility: hidden !important;
  }
  #op-print-portal {
    position: static !important;
    background: white !important;
    padding: 0 !important;
    overflow: visible !important;
    display: block !important;
    visibility: visible !important;
  }
  .op-no-print { display: none !important; }

  .op-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    font-family: 'Arial', sans-serif;
  }
  .op-table thead { display: table-header-group; }
  .op-table tfoot { display: table-footer-group; }
  .op-table tr    { page-break-inside: avoid; break-inside: avoid; }
  .op-row-even td { background: #ffffff !important; }
  .op-row-odd  td { background: #f7f7f7 !important; }
}

/* ── Screen: full-screen overlay ── */
@media screen {
  #op-print-portal {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: #d1d5db;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
}
`;

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  data:    OrderPrintData;
  onClose: () => void;
}

export function OrderPrint({ data, onClose }: Props) {
  const { id, date, store, phone, products } = data;

  const total = products.reduce((s, p) => s + p.price * p.quantity, 0);

  const printedAt = (() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  })();

  // ── Inject / remove print CSS on mount/unmount ────────────────────────────
  useEffect(() => {
    const el = document.createElement('style');
    el.id = 'op-print-styles';
    el.textContent = PRINT_CSS;
    document.head.appendChild(el);
    return () => { document.head.removeChild(el); };
  }, []);

  // ── ESC to close ──────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // ── Portal content ────────────────────────────────────────────────────────
  const content = (
    <div id="op-print-portal">

      {/* ── Screen toolbar (hidden when printing) ─────────────────────────── */}
      <div
        className="op-no-print sticky top-0 w-full z-10
                   bg-gray-800/95 backdrop-blur-sm
                   flex items-center justify-between
                   px-4 py-3 shadow-lg"
      >
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            aria-label="Буцах"
            className="flex items-center justify-center w-8 h-8 rounded-full
                       bg-white/10 hover:bg-white/20 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <div>
            <p className="text-white text-sm font-semibold leading-tight">
              Захиалгын хэвлэх урьдчилан харах
            </p>
            <p className="text-gray-400 text-xs mt-0.5">
              {id} · {products.length} бараа
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg
                       bg-blue-600 hover:bg-blue-700 active:bg-blue-800
                       text-white text-sm font-medium transition-colors"
          >
            <Printer className="w-4 h-4" />
            Хэвлэх (Ctrl+P)
          </button>
          <button
            onClick={onClose}
            aria-label="Хаах"
            className="flex items-center justify-center w-9 h-9 rounded-lg
                       bg-white/10 hover:bg-white/20 transition-colors"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {/* ── Paper (A4 portrait preview on screen; full page when printing) ── */}
      <div
        style={{
          background:   'white',
          width:        '210mm',
          minHeight:    '297mm',
          margin:       '24px auto 40px',
          boxShadow:    '0 4px 32px rgba(0,0,0,0.18)',
          borderRadius: '4px',
          overflow:     'hidden',
        }}
      >
        <table
          className="op-table"
          style={{
            width:          '100%',
            borderCollapse: 'collapse',
            fontFamily:     'Arial, sans-serif',
            fontSize:       '11px',
          }}
        >

          {/* ══════════════════════════════════════════════════════════════
              THEAD — document header + column labels
              ══════════════════════════════════════════════════════════════ */}
          <thead>

            {/* ── Row A: Document header ─────────────────────────────────── */}
            <tr>
              <td
                colSpan={4}
                style={{ padding: '14px 16px 0', borderBottom: 'none' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>

                  {/* Left: company info */}
                  <div>
                    <p style={{
                      fontSize: '15px', fontWeight: 700,
                      color: '#111', letterSpacing: '0.5px',
                      marginBottom: '4px',
                    }}>
                      ЗАХИАЛГА
                    </p>
                    <p style={{ fontSize: '11px', fontWeight: 600, color: '#333', marginBottom: '2px' }}>
                      {COMPANY_NAME}
                    </p>
                    <p style={{ fontSize: '10px', color: '#555', lineHeight: '1.5' }}>
                      {COMPANY_PHONE} &nbsp;|&nbsp; {COMPANY_ADDRESS} &nbsp;|&nbsp; {COMPANY_REGISTER}
                    </p>
                  </div>

                  {/* Right: order meta */}
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '11px', fontWeight: 600, color: '#334155', marginBottom: '3px' }}>
                      {id}
                    </p>
                    <p style={{ fontSize: '10px', color: '#64748b', marginBottom: '2px' }}>
                      📅 {date.split(' ')[0]}
                    </p>
                    {store && (
                      <p style={{ fontSize: '10px', color: '#64748b', marginBottom: '2px' }}>
                        🏪 {store}
                      </p>
                    )}
                    <p style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px' }}>
                      📞 {phone}
                    </p>
                    <p style={{ fontSize: '10px', color: '#888' }}>
                      Хэвлэсэн: {printedAt}
                    </p>
                  </div>

                </div>

                {/* Divider */}
                <div style={{
                  height: '2px',
                  background: 'linear-gradient(to right, #1d4ed8, #3b82f6, #93c5fd)',
                  marginTop: '10px',
                  borderRadius: '1px',
                }} />
              </td>
            </tr>

            {/* ── Row B: Column headers ──────────────────────────────────── */}
            <tr>
              {(['Барааны нэр', 'Тоо', 'Үнэ', 'Нийт'] as const).map((label, i) => (
                <th
                  key={label}
                  style={{
                    background:   '#f1f5f9',
                    padding:      '6px 8px',
                    fontSize:     '10px',
                    fontWeight:   700,
                    color:        '#475569',
                    textAlign:    i >= 1 ? 'right' : 'left',
                    borderBottom: '1px solid #cbd5e1',
                    borderTop:    '1px solid #e2e8f0',
                    whiteSpace:   'nowrap',
                    width:        i === 1 ? '30px'
                                : i === 2 ? '76px'
                                : i === 3 ? '76px'
                                : 'auto',
                  }}
                >
                  {label}
                </th>
              ))}
            </tr>

          </thead>

          {/* ══════════════════════════════════════════════════════════════
              TBODY — product rows
              ══════════════════════════════════════════════════════════════ */}
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  style={{
                    textAlign: 'center',
                    padding:   '32px 16px',
                    color:     '#94a3b8',
                    fontSize:  '11px',
                  }}
                >
                  Өгөгдөл байхгүй
                </td>
              </tr>
            ) : (
              products.map((p, i) => (
                <tr
                  key={i}
                  className={i % 2 === 0 ? 'op-row-even' : 'op-row-odd'}
                  style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
                >
                  <td style={{
                    padding:      '5px 8px',
                    fontSize:     '11px',
                    color:        '#1e293b',
                    background:   i % 2 === 0 ? '#ffffff' : '#f8fafc',
                    borderBottom: '1px solid #f1f5f9',
                  }}>
                    {p.name}
                  </td>
                  <td style={{
                    padding:            '5px 8px',
                    fontSize:           '11px',
                    color:              '#334155',
                    textAlign:          'right',
                    fontVariantNumeric: 'tabular-nums',
                    background:         i % 2 === 0 ? '#ffffff' : '#f8fafc',
                    borderBottom:       '1px solid #f1f5f9',
                  }}>
                    {p.quantity}
                  </td>
                  <td style={{
                    padding:            '5px 8px',
                    fontSize:           '10px',
                    color:              '#475569',
                    textAlign:          'right',
                    fontVariantNumeric: 'tabular-nums',
                    background:         i % 2 === 0 ? '#ffffff' : '#f8fafc',
                    borderBottom:       '1px solid #f1f5f9',
                    whiteSpace:         'nowrap',
                  }}>
                    {fmt(p.price)}
                  </td>
                  <td style={{
                    padding:            '5px 8px',
                    fontSize:           '11px',
                    color:              '#0f172a',
                    textAlign:          'right',
                    fontVariantNumeric: 'tabular-nums',
                    fontWeight:         500,
                    background:         i % 2 === 0 ? '#ffffff' : '#f8fafc',
                    borderBottom:       '1px solid #f1f5f9',
                    whiteSpace:         'nowrap',
                  }}>
                    {fmt(p.price * p.quantity)}
                  </td>
                </tr>
              ))
            )}
          </tbody>

          {/* ══════════════════════════════════════════════════════════════
              TFOOT — grand total (bottom of last page)
              ══════════════════════════════════════════════════════════════ */}
          <tfoot>
            <tr style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
              <td
                colSpan={2}
                style={{
                  padding:      '8px 8px 6px',
                  fontWeight:   700,
                  fontSize:     '12px',
                  color:        '#0f172a',
                  borderTop:    '2px solid #1e293b',
                  borderBottom: 'none',
                }}
              >
                Нийт дүн
              </td>
              <td
                style={{
                  padding:    '8px 8px 6px',
                  textAlign:  'right',
                  fontWeight: 700,
                  fontSize:   '11px',
                  color:      '#475569',
                  borderTop:  '2px solid #1e293b',
                  whiteSpace: 'nowrap',
                }}
              >
                {products.length} бараа
              </td>
              <td
                style={{
                  padding:    '8px 8px 6px',
                  textAlign:  'right',
                  fontWeight: 700,
                  fontSize:   '13px',
                  color:      '#0f172a',
                  borderTop:  '2px solid #1e293b',
                  whiteSpace: 'nowrap',
                }}
              >
                {fmt(total)}
              </td>
            </tr>
          </tfoot>

        </table>
      </div>

    </div>
  );

  return createPortal(content, document.body);
}
