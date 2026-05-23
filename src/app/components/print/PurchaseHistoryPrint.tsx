/**
 * PurchaseHistoryPrint
 * ────────────────────
 * A4-portrait grouped print template for "Худалдан авалтын түүх".
 * Used exclusively by the top header "Хэвлэх" button.
 *
 * Pagination: height-based (A4 content area), never splits a single order
 * across pages; document header repeats; grand total on last page only.
 */

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal }          from 'react-dom';
import { Printer, X, ArrowLeft } from 'lucide-react';
import type {
  GroupedPrintData,
  GroupedPrintOrder,
  PrintFilters,
} from '../../../lib/print/buildPurchaseData';

// ── Company constants — replace with real values ──────────────────────────────
const DEFAULT_ORG_NAME = '—';

const A4_WIDTH_MM           = 210;
const MARGIN_SIDE_MM        = 14;
const PAGE_CONTENT_WIDTH_MM = A4_WIDTH_MM - MARGIN_SIDE_MM * 2;
const A4_HEIGHT_MM          = 297;
const MARGIN_TOP_MM         = 14;
const MARGIN_BOTTOM_MM      = 15;
const PAGE_BODY_HEIGHT_MM = A4_HEIGHT_MM - MARGIN_TOP_MM - MARGIN_BOTTOM_MM;
const BODY_PAD_TOP_PX    = 8;
const BODY_PAD_BOTTOM_PX = 14;
/** Хуудас бүрийн доод баруун «1/3» мөр — pagination-д нөөцөлнө */
const PAGE_NUM_HEIGHT_PX = 18;

// Section header: Огноо | Дэлгүүр | Утас | Нийт дүн | Зээлийн дүн
const HDR_WIDTHS = ['15%', '25%', '17%', '20%', '23%'] as const;

// Products table: Бараа | Тоо | Үнэ | Нийт
const PROD_WIDTHS = ['54%', '8%', '19%', '19%'] as const;

function fmt(n: number): string {
  return n.toLocaleString('en-US') + '₮';
}

function mmToPx(mm: number): number {
  return mm * (96 / 25.4);
}

function outerHeight(el: HTMLElement): number {
  const style = getComputedStyle(el);
  const mb = parseFloat(style.marginBottom) || 0;
  const mt = parseFloat(style.marginTop) || 0;
  return el.offsetHeight + mb + mt;
}

interface MeasureHeights {
  header: number;
  footer: number;
  orders: number[];
}

/** Захиалгыг хуудсаар хуваах — нэг захиалгыг хэзээ ч таслахгүй */
function paginateOrdersByHeight(
  orders: GroupedPrintOrder[],
  heights: MeasureHeights,
): GroupedPrintOrder[][] {
  if (orders.length === 0) return [[]];

  const maxH = mmToPx(PAGE_BODY_HEIGHT_MM) - PAGE_NUM_HEIGHT_PX;
  const pages: GroupedPrintOrder[][] = [];
  let i = 0;

  while (i < orders.length) {
    const page: GroupedPrintOrder[] = [];
    let used = heights.header + BODY_PAD_TOP_PX;

    while (i < orders.length) {
      const oh = heights.orders[i] ?? 0;
      const remaining = orders.length - i;
      const footerReserve = remaining === 1 ? heights.footer : 0;

      if (page.length === 0) {
        page.push(orders[i]!);
        used += oh;
        i += 1;
        continue;
      }

      const projected = used + oh + footerReserve + BODY_PAD_BOTTOM_PX;
      if (projected <= maxH) {
        page.push(orders[i]!);
        used += oh;
        i += 1;
      } else {
        break;
      }
    }

    pages.push(page);
  }

  return pages;
}

function prodCell(col: number, row: number): CSSProperties {
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
  };
}

// ── Print CSS ─────────────────────────────────────────────────────────────────
/** Iframe хэвлэл — app CSS-ээс тусдаа, олон хуудсыг найдвартай хэвлэнэ */
const PRINT_DOCUMENT_CSS = `
@page {
  size: A4 portrait;
  margin: 14mm 14mm 15mm 14mm;
}

html, body {
  margin: 0;
  padding: 0;
  font-family: Arial, sans-serif;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.ph-paper {
  width: 100%;
  margin: 0;
  padding: 0;
}

.ph-page,
.ph-page * {
  box-sizing: border-box;
}

.ph-page {
  display: block;
  width: 100%;
  background: white;
  page-break-inside: auto;
  break-inside: auto;
}

.ph-page-break {
  page-break-after: always;
  break-after: page;
}

.ph-page:last-child {
  page-break-after: auto;
  break-after: auto;
}

.ph-page-number {
  text-align: right;
  padding: 2px 14px 0 0;
  font-size: 10px;
  font-weight: 400;
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
}

.ph-section {
  page-break-inside: avoid;
  break-inside: avoid;
}

.ph-sec-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 11px;
  font-family: Arial, sans-serif;
}

.ph-sec-table tr {
  page-break-inside: avoid;
  break-inside: avoid;
}

.ph-page td,
.ph-page th {
  overflow: visible;
}

.ph-row-even td { background: #ffffff; }
.ph-row-odd  td { background: #f8fafc; }
`;

const PRINT_SCREEN_CSS = `
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

  .ph-page {
    width: ${PAGE_CONTENT_WIDTH_MM}mm;
    min-height: 297mm;
    background: white;
    box-shadow: 0 4px 32px rgba(0,0,0,0.18);
    border-radius: 4px;
    display: flex;
    flex-direction: column;
  }

  .ph-page-content {
    flex: 1 1 auto;
  }

  .ph-page-number {
    flex-shrink: 0;
  }

  .ph-page + .ph-page {
    margin-top: 24px;
  }

  .ph-measure {
    position: fixed;
    left: -10000px;
    top: 0;
    width: ${PAGE_CONTENT_WIDTH_MM}mm;
    visibility: hidden;
    pointer-events: none;
    z-index: -1;
    font-family: Arial, sans-serif;
  }
}
`;

const PRINT_CSS = PRINT_DOCUMENT_CSS + PRINT_SCREEN_CSS;

function printPaperInIframe(paperEl: HTMLElement): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  if (!win) {
    iframe.remove();
    return;
  }

  const html = `<!DOCTYPE html>
<html lang="mn">
<head>
<meta charset="utf-8">
<title>Худалдан авалтын түүх</title>
<style>${PRINT_DOCUMENT_CSS}</style>
</head>
<body>${paperEl.outerHTML}</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();

  const cleanup = () => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  };

  win.onafterprint = cleanup;
  setTimeout(() => {
    win.focus();
    win.print();
  }, 200);
  setTimeout(cleanup, 120_000);
}

// ── Shared layout blocks ──────────────────────────────────────────────────────

interface HeaderProps {
  filters:     PrintFilters;
  printedAt:   string;
  orderCount:  number;
  totalRows:   number;
  hasAnyFilter: boolean;
  hasDateFilter: boolean;
  hasProductFilter: boolean;
  organizationName: string;
  customerPhoneLine: string;
  className?:  string;
}

function DocumentHeader({
  filters, printedAt, orderCount, totalRows,
  hasAnyFilter, hasDateFilter, hasProductFilter,
  organizationName, customerPhoneLine, className,
}: HeaderProps) {
  return (
    <div className={className} style={{ padding: '14px 14px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: '15px', fontWeight: 700, color: '#111', letterSpacing: '0.5px', marginBottom: '4px' }}>
            ХУДАЛДАН АВАЛТЫН ТҮҮХ
          </p>
          <p style={{ fontSize: '11px', fontWeight: 600, color: '#333', marginBottom: '2px' }}>
            {organizationName || DEFAULT_ORG_NAME}
          </p>
          {customerPhoneLine ? (
            <p style={{ fontSize: '10px', color: '#555', lineHeight: '1.5' }}>
              {customerPhoneLine}
            </p>
          ) : null}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: '12px' }}>
          {hasAnyFilter && (
            <div style={{
              display: 'inline-block',
              background: '#eff6ff', border: '1px solid #bfdbfe',
              borderRadius: '8px', padding: '4px 10px',
              marginBottom: '6px', fontSize: '10px',
              color: '#1d4ed8', textAlign: 'left',
            }}>
              {hasDateFilter    && <div>📅 {filters.dateFrom ?? '—'} – {filters.dateTo ?? '—'}</div>}
              {hasProductFilter && <div>🔍 {filters.productName}</div>}
            </div>
          )}
          <p style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>
            Хэвлэсэн: {printedAt}
          </p>
          <p style={{ fontSize: '10px', color: '#888' }}>
            Нийт {orderCount} захиалга / {totalRows} мөр
          </p>
        </div>
      </div>
      <div style={{
        height: '2px',
        background: 'linear-gradient(to right, #1d4ed8, #3b82f6, #93c5fd)',
        marginTop: '10px', borderRadius: '1px',
      }} />
    </div>
  );
}

function OrderSection({ order, className }: { order: GroupedPrintOrder; className?: string }) {
  return (
    <div
      className={className ?? 'ph-section'}
      style={{
        marginBottom:    '8px',
        border:          '1px solid #e2e8f0',
        borderRadius:    '3px',
        pageBreakInside: 'avoid',
        breakInside:     'avoid',
      }}
    >
      <table
        style={{
          width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse',
          fontFamily: 'Arial, sans-serif', fontSize: '10px',
          background: '#f1f5f9', borderBottom: '1px solid #e2e8f0',
        }}
      >
        <colgroup>
          {HDR_WIDTHS.map((w) => <col key={w} style={{ width: w }} />)}
        </colgroup>
        <tbody>
          <tr>
            <td style={{ padding: '4px 6px', color: '#475569', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {order.date}
            </td>
            <td style={{ padding: '4px 6px', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap' }}>
              {order.store}
            </td>
            <td style={{ padding: '4px 6px', color: '#64748b', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
              {order.phone}
            </td>
            <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {fmt(order.total)}
            </td>
            <td style={{ padding: '4px 6px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {order.creditAmount > 0 ? (
                <span style={{ color: '#92400e', fontWeight: 600 }}>Зээл:&nbsp;{fmt(order.creditAmount)}</span>
              ) : (
                <span style={{ color: '#94a3b8' }}>—</span>
              )}
            </td>
          </tr>
        </tbody>
      </table>

      <table
        className="ph-sec-table"
        style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontFamily: 'Arial, sans-serif', fontSize: '11px' }}
      >
        <colgroup>
          {PROD_WIDTHS.map((w) => <col key={w} style={{ width: w }} />)}
        </colgroup>
        <thead>
          <tr>
            {(['Бараа', 'Тоо', 'Үнэ', 'Нийт'] as const).map((label, i) => (
              <th
                key={label}
                style={{
                  padding: '3px 6px', fontSize: '9.5px', fontWeight: 600,
                  color: '#64748b', textAlign: i >= 1 ? 'right' : 'left',
                  borderBottom: '1px solid #e2e8f0', background: '#f8fafc',
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {order.products.map((p, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? 'ph-row-even' : 'ph-row-odd'}>
              <td style={prodCell(0, ri)}>{p.name}</td>
              <td style={prodCell(1, ri)}>{p.quantity}</td>
              <td style={prodCell(2, ri)}>{fmt(p.price)}</td>
              <td style={prodCell(3, ri)}>{fmt(p.price * p.quantity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface FooterProps {
  orderCount:  number;
  totalRows:   number;
  grandTotal:  number;
  creditTotal: number;
  className?:  string;
}

function GrandTotalFooter({ orderCount, totalRows, grandTotal, creditTotal, className }: FooterProps) {
  return (
    <div
      className={className}
      style={{ marginTop: '4px', pageBreakInside: 'avoid', breakInside: 'avoid' }}
    >
      <table
        style={{
          width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse',
          fontFamily: 'Arial, sans-serif', fontSize: '11px',
          borderTop: '2px solid #1e293b',
        }}
      >
        <colgroup>
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
              padding: '6px 6px', textAlign: 'right', fontSize: '11px', color: '#64748b',
              whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
            }}>
              {orderCount} захиалга · {totalRows} мөр
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
  );
}

function PageNumber({ current, total }: { current: number; total: number }) {
  return (
    <div className="ph-page-number" aria-label={`Хуудас ${current} / ${total}`}>
      {current}/{total}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  data:    GroupedPrintData;
  onClose: () => void;
}

export function PurchaseHistoryPrint({ data, onClose }: Props) {
  const {
    orders, grandTotal, creditTotal, filters, printedAt,
    customerOrganizationName = '',
    customerPhoneLine = '',
  } = data;

  const totalRows        = orders.reduce((s, o) => s + o.products.length, 0);
  const hasDateFilter    = !!(filters.dateFrom || filters.dateTo);
  const hasProductFilter = !!filters.productName?.trim();
  const hasAnyFilter     = hasDateFilter || hasProductFilter;

  const measureRef = useRef<HTMLDivElement>(null);
  const paperRef   = useRef<HTMLDivElement>(null);
  const [orderPages, setOrderPages] = useState<GroupedPrintOrder[][] | null>(
    () => (orders.length === 0 ? [[]] : null),
  );

  const headerProps = {
    filters, printedAt, orderCount: orders.length, totalRows,
    hasAnyFilter, hasDateFilter, hasProductFilter,
    organizationName: customerOrganizationName,
    customerPhoneLine,
  };

  useLayoutEffect(() => {
    if (orders.length === 0) {
      setOrderPages([[]]);
      return;
    }

    const root = measureRef.current;
    if (!root) return;

    const headerEl = root.querySelector('.ph-measure-header') as HTMLElement | null;
    const footerEl = root.querySelector('.ph-measure-footer') as HTMLElement | null;
    const orderEls = root.querySelectorAll('.ph-measure-order');

    if (!headerEl || !footerEl || orderEls.length !== orders.length) return;

    const heights: MeasureHeights = {
      header: outerHeight(headerEl),
      footer: outerHeight(footerEl),
      orders: Array.from(orderEls).map((el) => outerHeight(el as HTMLElement)),
    };

    setOrderPages(paginateOrdersByHeight(orders, heights));
  }, [orders, grandTotal, creditTotal, hasAnyFilter, filters, printedAt, totalRows, customerOrganizationName, customerPhoneLine]);

  useEffect(() => {
    const styleEl = document.createElement('style');
    styleEl.id = 'ph-print-styles';
    styleEl.textContent = PRINT_CSS;
    document.head.appendChild(styleEl);
    return () => { document.head.removeChild(styleEl); };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  function handlePrint() {
    const el = paperRef.current;
    if (!el) return;
    printPaperInIframe(el);
  }

  const measureBlock = orders.length > 0 ? (
    <div ref={measureRef} className="ph-measure" aria-hidden="true">
      <DocumentHeader {...headerProps} className="ph-measure-header" />
      <div style={{ padding: `${BODY_PAD_TOP_PX}px 14px ${BODY_PAD_BOTTOM_PX}px` }}>
        {orders.map((order) => (
          <OrderSection key={order.id} order={order} className="ph-measure-order ph-section" />
        ))}
        <GrandTotalFooter
          orderCount={orders.length}
          totalRows={totalRows}
          grandTotal={grandTotal}
          creditTotal={creditTotal}
          className="ph-measure-footer"
        />
      </div>
    </div>
  ) : null;

  const paperContent = orderPages ? (
    <div
      ref={paperRef}
      className="ph-paper"
      style={{
        background: 'transparent',
        width:      `${PAGE_CONTENT_WIDTH_MM}mm`,
        margin:     '24px auto 40px',
        overflow:   'visible',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      {orderPages.map((pageOrders, pageIndex) => {
        const isLastPage = pageIndex === orderPages.length - 1;
        const pageTotal = orderPages.length;

        return (
          <div
            key={pageIndex}
            className={`ph-page${!isLastPage ? ' ph-page-break' : ''}`}
          >
            <div className="ph-page-content">
              <DocumentHeader {...headerProps} />
              <div style={{ padding: `${BODY_PAD_TOP_PX}px 14px ${BODY_PAD_BOTTOM_PX}px` }}>
                {pageOrders.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 14px', color: '#94a3b8', fontSize: '11px' }}>
                    Өгөгдөл байхгүй
                  </div>
                ) : (
                  pageOrders.map((order) => (
                    <OrderSection key={order.id} order={order} />
                  ))
                )}
                {isLastPage && orders.length > 0 && (
                  <GrandTotalFooter
                    orderCount={orders.length}
                    totalRows={totalRows}
                    grandTotal={grandTotal}
                    creditTotal={creditTotal}
                  />
                )}
              </div>
            </div>
            <PageNumber current={pageIndex + 1} total={pageTotal} />
          </div>
        );
      })}
    </div>
  ) : null;

  const modal = (
    <div id="ph-print-portal">
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
            onClick={handlePrint}
            disabled={!orderPages}
            className="flex items-center gap-2 px-4 py-2 rounded-lg
                       bg-blue-600 hover:bg-blue-700 active:bg-blue-800
                       text-white text-sm font-medium transition-colors
                       disabled:opacity-50 disabled:pointer-events-none"
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
      {measureBlock}
      {paperContent}
    </div>
  );

  return createPortal(modal, document.body);
}
