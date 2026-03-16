/**
 * PurchaseHistoryPrint
 * ────────────────────
 * A4-portrait grouped print template for "Худалдан авалтын түүх".
 * Used exclusively by the top header "Хэвлэх" button.
 *
 * Layout: one section per order.
 *   Section header — Огноо · Дэлгүүр · Утас · Нийт дүн · Зээлийн дүн
 *   Products table — Бараа | Тоо | Үнэ | Нийт
 * Grand total footer at the end.
 *
 * Column grid — fixed percentages so every section aligns identically:
 *
 *   Section header (5 cols, table-layout: fixed):
 *     Огноо 15% | Дэлгүүр 25% | Утас 17% | Нийт дүн 20% | Зээл 23%
 *
 *   Products table (4 cols, table-layout: fixed):
 *     Бараа 54% | Тоо 8% | Үнэ 19% | Нийт 19%
 *
 * Paper: A4 portrait, 14 mm margins.
 *
 * Multi-page fix (2025-03):
 *   Content is rendered into a .print-root div appended directly to <body>
 *   so it has NO overflow-clipping ancestor during printing.
 *   @media print uses the standard visibility-isolation technique:
 *     body * { visibility: hidden }
 *     .print-root, .print-root * { visibility: visible }
 *     .print-root { position: absolute; left:0; top:0; width:100% }
 *   The screen modal remains visually unchanged (toolbar + preview).
 */

import { useEffect, useState }   from 'react';
import { createPortal }          from 'react-dom';
import { Printer, X, ArrowLeft } from 'lucide-react';
import type { GroupedPrintData } from '../../../lib/print/buildPurchaseData';

// ── Company constants — replace with real values ──────────────────────────────
const COMPANY_NAME     = 'Таны Компани ХХК';
const COMPANY_PHONE    = '+976 9911-0000';
const COMPANY_ADDRESS  = 'Улаанбаатар хот, Чингэлтэй дүүрэг';
const COMPANY_REGISTER = 'РД: 1234567';

// ── Money formatter ───────────────────────────────────────────────────────────
function fmt(n: number): string {
  return n.toLocaleString('en-US') + '₮';
}

// ── Print CSS ─────────────────────────────────────────────────────────────────
// Visibility-isolation technique:
//   1. Blank every node in <body> with visibility:hidden.
//   2. Make only .print-root and its descendants visible.
//   3. Anchor .print-root to the page origin (absolute 0/0/100%).
//   This guarantees no overflow-clipping ancestor blocks multi-page output.
const PRINT_CSS = `
@page {
  size: A4 portrait;
  margin: 14mm;
}

/* ── Screen: .print-root sits in normal document flow,
      visually covered by the position:fixed modal overlay.             ── */
.print-root {
  position: static;
  overflow: visible;
  height: auto;
}

@media print {
  /* Step 1 — blank everything */
  body * {
    visibility: hidden;
  }

  /* Step 2 — reveal only the print container and all of its children */
  .print-root,
  .print-root * {
    visibility: visible;
  }

  /* Step 3 — anchor to page origin, unrestricted height */
  .print-root {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    overflow: visible;
    height: auto;
  }

  /*
   * Paper: fill the full content area (182 mm after 14 mm margins).
   * Remove screen-only decorations; let content flow to multiple pages.
   */
  .ph-paper {
    width: 100% !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    overflow: visible !important;
  }

  /* Each order section: avoid splitting across pages when it fits */
  .ph-section {
    page-break-inside: avoid;
    break-inside: avoid;
    overflow: visible !important;
  }

  /* Products table inside each section */
  .ph-sec-table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    font-size: 11px;
    font-family: 'Arial', sans-serif;
  }
  .ph-sec-table tr { page-break-inside: avoid; break-inside: avoid; }

  /* Alternating row colours */
  .ph-row-even td { background: #ffffff !important; }
  .ph-row-odd  td { background: #f8fafc !important; }
}

/* ── Screen: fixed modal overlay ── */
@media screen {
  #ph-print-portal {
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

// ─────────────────────────────────────────────────────────────────────────────
// Column width grids (percentages, must add to 100%)
// ─────────────────────────────────────────────────────────────────────────────

// Section header: Огноо | Дэлгүүр | Утас | Нийт дүн | Зээлийн дүн
const HDR_WIDTHS = ['15%', '25%', '17%', '20%', '23%'] as const;

// Products table: Бараа | Тоо | Үнэ | Нийт
const PROD_WIDTHS = ['54%', '8%', '19%', '19%'] as const;

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  data:    GroupedPrintData;
  onClose: () => void;
}

export function PurchaseHistoryPrint({ data, onClose }: Props) {
  const { orders, grandTotal, creditTotal, filters, printedAt } = data;

  const totalRows        = orders.reduce((s, o) => s + o.products.length, 0);
  const hasDateFilter    = !!(filters.dateFrom || filters.dateTo);
  const hasProductFilter = !!filters.productName?.trim();
  const hasAnyFilter     = hasDateFilter || hasProductFilter;

  // ── Inject / remove print CSS ─────────────────────────────────────────────
  useEffect(() => {
    const styleEl = document.createElement('style');
    styleEl.id = 'ph-print-styles';
    styleEl.textContent = PRINT_CSS;
    document.head.appendChild(styleEl);
    return () => { document.head.removeChild(styleEl); };
  }, []);

  // ── Create .print-root directly on <body> ─────────────────────────────────
  // This div is a direct child of <body> with no overflow-clipping or
  // fixed-position ancestor, which is what allows @media print to flow the
  // content across multiple A4 pages without clipping.
  // On screen it sits in normal flow, visually hidden behind the fixed modal.
  const [printRootEl, setPrintRootEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const root = document.createElement('div');
    root.className = 'print-root';
    document.body.appendChild(root);
    setPrintRootEl(root);
    return () => {
      if (document.body.contains(root)) document.body.removeChild(root);
    };
  }, []);

  // ── ESC to close ──────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // ── Product row cell style ────────────────────────────────────────────────
  function prodCell(col: number, row: number): React.CSSProperties {
    return {
      padding:            '3px 6px',
      fontSize:           '10.5px',
      color:              col === 0 ? '#1e293b' : col === 3 ? '#0f172a' : '#334155',
      fontWeight:         col === 3 ? 500 : undefined,
      textAlign:          col >= 1 ? 'right' : 'left',
      fontVariantNumeric: 'tabular-nums',
      background:         row % 2 === 0 ? '#ffffff' : '#f8fafc',
      borderBottom:       '1px solid #f1f5f9',
      whiteSpace:         col >= 1 ? 'nowrap' : undefined,
      overflow:           'hidden',
    };
  }

  // ── A4 paper content ──────────────────────────────────────────────────────
  // Extracted as a variable so it can be rendered in two places:
  //   1. Inside #ph-print-portal  → screen preview (unchanged visual)
  //   2. Inside .print-root       → actual print output (no overflow parent)
  const paperContent = (
    <div
      className="ph-paper"
      style={{
        background:   'white',
        width:        '210mm',
        minHeight:    '297mm',
        margin:       '24px auto 40px',
        boxShadow:    '0 4px 32px rgba(0,0,0,0.18)',
        borderRadius: '4px',
        overflow:     'visible',        /* allows multi-page content on screen too */
        fontFamily:   'Arial, sans-serif',
      }}
    >
      {/* ════════════════════════════════════════════════════════════════
          DOCUMENT HEADER — company info, title, filters, timestamp
          ════════════════════════════════════════════════════════════════ */}
      <div style={{ padding: '14px 14px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>

          {/* Left: title + company info */}
          <div>
            <p style={{ fontSize: '15px', fontWeight: 700, color: '#111', letterSpacing: '0.5px', marginBottom: '4px' }}>
              ХУДАЛДАН АВАЛТЫН ТҮҮХ
            </p>
            <p style={{ fontSize: '11px', fontWeight: 600, color: '#333', marginBottom: '2px' }}>
              {COMPANY_NAME}
            </p>
            <p style={{ fontSize: '10px', color: '#555', lineHeight: '1.5' }}>
              {COMPANY_PHONE} &nbsp;|&nbsp; {COMPANY_ADDRESS} &nbsp;|&nbsp; {COMPANY_REGISTER}
            </p>
          </div>

          {/* Right: active filters + timestamp + counts */}
          <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: '12px' }}>
            {hasAnyFilter && (
              <div style={{
                display: 'inline-block',
                background: '#eff6ff', border: '1px solid #bfdbfe',
                borderRadius: '8px', padding: '4px 10px',
                marginBottom: '6px', fontSize: '10px',
                color: '#1d4ed8', textAlign: 'left',
              }}>
                {hasDateFilter   && <div>📅 {filters.dateFrom ?? '—'} – {filters.dateTo ?? '—'}</div>}
                {hasProductFilter && <div>🔍 {filters.productName}</div>}
              </div>
            )}
            <p style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>
              Хэвлэсэн: {printedAt}
            </p>
            <p style={{ fontSize: '10px', color: '#888' }}>
              Нийт {orders.length} захиалга / {totalRows} мөр
            </p>
          </div>

        </div>

        {/* Gradient divider */}
        <div style={{
          height: '2px',
          background: 'linear-gradient(to right, #1d4ed8, #3b82f6, #93c5fd)',
          marginTop: '10px', borderRadius: '1px',
        }} />
      </div>

      {/* ════════════════════════════════════════════════════════════════
          ORDER SECTIONS
          One <div class="ph-section"> per order.
          page-break-inside: avoid keeps each section intact when possible.
          ════════════════════════════════════════════════════════════════ */}
      <div style={{ padding: '8px 14px 14px' }}>

        {orders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 14px', color: '#94a3b8', fontSize: '11px' }}>
            Өгөгдөл байхгүй
          </div>
        ) : (
          orders.map((order) => (
            <div
              key={order.id}
              className="ph-section"
              style={{
                marginBottom:    '8px',
                border:          '1px solid #e2e8f0',
                borderRadius:    '3px',
                pageBreakInside: 'avoid',
                breakInside:     'avoid',
              }}
            >

              {/* ── Section header
                  table-layout: fixed + explicit % widths → every section's
                  columns start at identical horizontal positions.
              ─────────────────────────────────────────────────────────────── */}
              <table
                style={{
                  width:          '100%',
                  tableLayout:    'fixed',
                  borderCollapse: 'collapse',
                  fontFamily:     'Arial, sans-serif',
                  fontSize:       '10px',
                  background:     '#f1f5f9',
                  borderBottom:   '1px solid #e2e8f0',
                }}
              >
                {/* colgroup locks the 5-column grid */}
                <colgroup>
                  <col style={{ width: HDR_WIDTHS[0] }} />
                  <col style={{ width: HDR_WIDTHS[1] }} />
                  <col style={{ width: HDR_WIDTHS[2] }} />
                  <col style={{ width: HDR_WIDTHS[3] }} />
                  <col style={{ width: HDR_WIDTHS[4] }} />
                </colgroup>
                <tbody>
                  <tr>

                    {/* Огноо */}
                    <td style={{
                      padding:            '4px 6px',
                      color:              '#475569',
                      whiteSpace:         'nowrap',
                      overflow:           'hidden',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {order.date}
                    </td>

                    {/* Дэлгүүрийн нэр */}
                    <td style={{
                      padding:    '4px 6px',
                      fontWeight: 700,
                      color:      '#1e293b',
                      overflow:   'hidden',
                      whiteSpace: 'nowrap',
                    }}>
                      {order.store}
                    </td>

                    {/* Утасны дугаар */}
                    <td style={{
                      padding:    '4px 6px',
                      color:      '#64748b',
                      fontFamily: 'monospace',
                      whiteSpace: 'nowrap',
                      overflow:   'hidden',
                    }}>
                      {order.phone}
                    </td>

                    {/* Нийт дүн */}
                    <td style={{
                      padding:            '4px 6px',
                      textAlign:          'right',
                      fontWeight:         700,
                      color:              '#0f172a',
                      whiteSpace:         'nowrap',
                      overflow:           'hidden',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {fmt(order.total)}
                    </td>

                    {/* Зээлийн дүн */}
                    <td style={{
                      padding:            '4px 6px',
                      textAlign:          'right',
                      whiteSpace:         'nowrap',
                      overflow:           'hidden',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {order.creditAmount > 0 ? (
                        <span style={{ color: '#92400e', fontWeight: 600 }}>
                          Зээл:&nbsp;{fmt(order.creditAmount)}
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      )}
                    </td>

                  </tr>
                </tbody>
              </table>

              {/* ── Products table
                  table-layout: fixed + <colgroup> percentages.
                  Rows get tighter padding (3px 6px) to save vertical space.
              ─────────────────────────────────────────────────────────────── */}
              <table
                className="ph-sec-table"
                style={{
                  width:          '100%',
                  tableLayout:    'fixed',
                  borderCollapse: 'collapse',
                  fontFamily:     'Arial, sans-serif',
                  fontSize:       '11px',
                }}
              >
                <colgroup>
                  <col style={{ width: PROD_WIDTHS[0] }} />
                  <col style={{ width: PROD_WIDTHS[1] }} />
                  <col style={{ width: PROD_WIDTHS[2] }} />
                  <col style={{ width: PROD_WIDTHS[3] }} />
                </colgroup>

                {/* Column label row */}
                <thead>
                  <tr>
                    {(['Бараа', 'Тоо', 'Үнэ', 'Нийт'] as const).map((label, i) => (
                      <th
                        key={label}
                        style={{
                          padding:      '3px 6px',
                          fontSize:     '9.5px',
                          fontWeight:   600,
                          color:        '#64748b',
                          textAlign:    i >= 1 ? 'right' : 'left',
                          borderBottom: '1px solid #e2e8f0',
                          background:   '#f8fafc',
                          whiteSpace:   'nowrap',
                          overflow:     'hidden',
                        }}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>

                {/* Product data rows */}
                <tbody>
                  {order.products.map((p, ri) => (
                    <tr
                      key={ri}
                      className={ri % 2 === 0 ? 'ph-row-even' : 'ph-row-odd'}
                    >
                      <td style={prodCell(0, ri)}>{p.name}</td>
                      <td style={prodCell(1, ri)}>{p.quantity}</td>
                      <td style={prodCell(2, ri)}>{fmt(p.price)}</td>
                      <td style={prodCell(3, ri)}>{fmt(p.price * p.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

            </div>
          ))
        )}

        {/* ════════════════════════════════════════════════════════════════
            GRAND TOTAL FOOTER
            ════════════════════════════════════════════════════════════════ */}
        {orders.length > 0 && (
          <div style={{ marginTop: '4px', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
            <table
              style={{
                width:          '100%',
                tableLayout:    'fixed',
                borderCollapse: 'collapse',
                fontFamily:     'Arial, sans-serif',
                fontSize:       '11px',
                borderTop:      '2px solid #1e293b',
              }}
            >
              <colgroup>
                {/* mirror the section-header grid for visual alignment */}
                <col style={{ width: '40%' }} />
                <col style={{ width: '37%' }} />
                <col style={{ width: '23%' }} />
              </colgroup>
              <tbody>
                <tr>
                  <td style={{ padding: '6px 6px', fontWeight: 700, fontSize: '12px', color: '#0f172a' }}>
                    Нийт дүн
                  </td>
                  <td style={{
                    padding: '6px 6px', textAlign: 'right',
                    fontSize: '11px', color: '#64748b',
                    whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
                  }}>
                    {orders.length} захиалга · {totalRows} мөр
                  </td>
                  <td style={{
                    padding: '6px 6px', textAlign: 'right',
                    fontWeight: 700, fontSize: '13px', color: '#0f172a',
                    whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
                  }}>
                    {fmt(grandTotal)}
                  </td>
                </tr>

                {creditTotal > 0 && (
                  <tr>
                    <td
                      colSpan={2}
                      style={{
                        padding: '4px 6px 6px', fontWeight: 700, fontSize: '11px',
                        color: '#92400e', textAlign: 'right',
                        borderTop: '1px solid #fde68a', background: '#fffbeb',
                      }}
                    >
                      Зээлийн нийт дүн
                    </td>
                    <td style={{
                      padding: '4px 6px 6px', textAlign: 'right',
                      fontWeight: 700, fontSize: '12px', color: '#92400e',
                      borderTop: '1px solid #fde68a', background: '#fffbeb',
                      whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
                    }}>
                      {fmt(creditTotal)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );

  // ── Screen modal (toolbar + paper preview — unchanged visual) ─────────────
  const modal = (
    <div id="ph-print-portal">

      {/* ── Screen toolbar (hidden when printing via visibility:hidden) ──── */}
      <div
        className="ph-no-print sticky top-0 w-full z-10
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
              Хэвлэх урьдчилан харах
            </p>
            <p className="text-gray-400 text-xs mt-0.5">
              {orders.length} захиалга · {totalRows} мөр
              {hasAnyFilter && ' · Шүүсэн'}
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

      {/* ── A4 paper preview (screen only, same content as print-root) ──── */}
      {paperContent}

    </div>
  );

  // ── Two portals ───────────────────────────────────────────────────────────
  // Portal 1: #ph-print-portal  — fixed modal, screen preview, hidden on print
  //           (visibility:hidden via "body * { visibility:hidden }" in print CSS)
  // Portal 2: .print-root       — body-level div, no overflow parent,
  //           revealed exclusively during printing via visibility:visible
  return (
    <>
      {createPortal(modal, document.body)}
      {printRootEl && createPortal(paperContent, printRootEl)}
    </>
  );
}
