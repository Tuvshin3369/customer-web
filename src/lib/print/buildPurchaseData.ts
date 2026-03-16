// ─── Shared types (both Admin and Customer apps import these) ─────────────────

export interface PrintProduct {
  name:     string;
  quantity: number;
  price:    number;
}

/** Minimal HistoryItem interface — compatible with any app's local HistoryItem */
export interface PrintHistoryItem {
  id:            string;
  date:          string;    // "YYYY.MM.DD HH:MM"  or  "YYYY.MM.DD"
  products:      PrintProduct[];
  creditType?:   string;    // 'paid' | 'partial' | 'credit'
  creditAmount?: number;    // only meaningful for 'partial' type
  store?:        string;    // optional — used by grouped print
  phone?:        string;    // optional — used by grouped print
}

export interface PrintRow {
  date:        string;
  orderId:     string;
  productName: string;
  quantity:    number;
  unitPrice:   number;
  lineTotal:   number;
}

export interface PrintFilters {
  dateFrom?:    string;   // applied start date  (ISO or "YYYY.MM.DD")
  dateTo?:      string;   // applied end date
  productName?: string;  // product name search text
}

export interface PrintData {
  rows:        PrintRow[];
  grandTotal:  number;
  creditTotal: number;      // sum of outstanding credit across filtered rows
  filters:     PrintFilters;
  printedAt:   string;      // formatted datetime
  totalOrders: number;      // distinct order count
}

// ─── Grouped print types ──────────────────────────────────────────────────────

/** One order section in the grouped print layout */
export interface GroupedPrintOrder {
  id:           string;
  date:         string;
  store:        string;
  phone:        string;
  total:        number;
  creditAmount: number;   // 0 = fully paid
  products:     PrintProduct[];
}

export interface GroupedPrintData {
  orders:      GroupedPrintOrder[];
  grandTotal:  number;
  creditTotal: number;
  filters:     PrintFilters;
  printedAt:   string;
}

// ─── Builder (flat) ───────────────────────────────────────────────────────────

export function buildPurchaseData(
  items:   PrintHistoryItem[],
  filters: PrintFilters = {},
): PrintData {
  const rows: PrintRow[] = [];

  for (const item of items) {
    const date = item.date.split(' ')[0];
    for (const product of item.products) {
      rows.push({
        date,
        orderId:     item.id,
        productName: product.name,
        quantity:    product.quantity,
        unitPrice:   product.price,
        lineTotal:   product.price * product.quantity,
      });
    }
  }

  const grandTotal  = rows.reduce((sum, r) => sum + r.lineTotal, 0);
  const totalOrders = items.length;

  const creditTotal = items.reduce((sum, item) => {
    if (item.creditType === 'credit') {
      const orderTotal = item.products.reduce((s, p) => s + p.price * p.quantity, 0);
      return sum + orderTotal;
    }
    if (item.creditType === 'partial') return sum + (item.creditAmount ?? 0);
    return sum;
  }, 0);

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const printedAt = `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  return { rows, grandTotal, creditTotal, filters, printedAt, totalOrders };
}

// ─── Builder (grouped) ────────────────────────────────────────────────────────

export function buildGroupedPurchaseData(
  items:   PrintHistoryItem[],
  filters: PrintFilters = {},
): GroupedPrintData {
  const orders: GroupedPrintOrder[] = items.map(item => {
    const total = item.products.reduce((s, p) => s + p.price * p.quantity, 0);
    const creditAmount =
      item.creditType === 'credit'  ? total :
      item.creditType === 'partial' ? (item.creditAmount ?? 0) :
      0;
    return {
      id:           item.id,
      date:         item.date.split(' ')[0],
      store:        item.store ?? '',
      phone:        item.phone ?? '',
      total,
      creditAmount,
      products:     item.products,
    };
  });

  const grandTotal  = orders.reduce((s, o) => s + o.total, 0);
  const creditTotal = orders.reduce((s, o) => s + o.creditAmount, 0);

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const printedAt = `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  return { orders, grandTotal, creditTotal, filters, printedAt };
}