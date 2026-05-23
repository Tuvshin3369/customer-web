import { formatCurrency } from './currencyFormatter';

/** True when a non-empty image URL is present (omit broken/placeholder strings). */
const hasPrintableImageUrl = (url: string | undefined | null): boolean => {
  if (url == null) return false;
  const t = String(url).trim();
  if (t === '' || t === 'null' || t === 'undefined') return false;
  return true;
};

/** Wait for <img> sources (stamp, signature) to load before print — avoids first print without images. */
function waitForImagesInDocument(doc: Document, perImageTimeoutMs = 8000): Promise<void> {
  const images = Array.from(doc.images);
  if (images.length === 0) return Promise.resolve();

  return Promise.all(
    images.map(
      img =>
        new Promise<void>(resolve => {
          if (img.complete) {
            resolve();
            return;
          }
          const done = () => resolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
          setTimeout(done, perImageTimeoutMs);
        })
    )
  ).then(() => undefined);
}

interface PrintInvoiceItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

const DEFAULT_PRINT_TITLE_LABEL = 'ЗАРЛАГЫН БАРИМТ';

interface PrintInvoiceData {
  invoice_number: string;
  /** Main heading before № (e.g. InvoiceList → "НЭХЭМЖЛЭЛ"; default "ЗАРЛАГЫН БАРИМТ"). */
  title_label?: string;
  branch_company_name: string;
  branch_company_register: string;
  customer_name: string;
  customer_register?: string;
  customer_phone?: string;
  /** When true, print "Хүргэлт :" + ecommerce_phone; when false/omitted, omit that row. */
  is_delivery?: boolean;
  ecommerce_phone?: string;
  branch_address?: string;
  branch_website?: string;
  branch_phones?: string[];
  bank_name?: string;
  bank_account?: string;
  created_at: string;
  items: PrintInvoiceItem[];
  total_quantity: number;
  grand_total: number;
  employee_name?: string;
  employee_signature_url?: string;
  company_stamp_url?: string;
  note?: string;
  marketing_name?: string;
}

const ROWS_PER_PAGE = 21;

export const printInvoice = (data: PrintInvoiceData) => {
  const branchPhones = data.branch_phones?.join(' , ') || '';
  const customerPhoneStr = data.customer_phone || '';

  const supplierInfo = data.branch_company_register
    ? `${data.branch_company_name} ( ${data.branch_company_register} )`
    : data.branch_company_name;

  const customerInfo = data.customer_register
    ? `${data.customer_name} ( ${data.customer_register} )`
    : data.customer_name;

  const addressLine = [data.branch_address, data.branch_website].filter(Boolean).join(' : ');
  const bankLine = data.bank_name && data.bank_account
    ? `${data.bank_name} : ${data.bank_account}`
    : '';

  const createdDate = new Date(data.created_at);
  const dateOnly = Number.isNaN(createdDate.getTime())
    ? (data.created_at.split(' : ')[0] || data.created_at.split(' ')[0])
    : `${createdDate.getFullYear()}/${String(createdDate.getMonth() + 1).padStart(2, '0')}/${String(createdDate.getDate()).padStart(2, '0')}`;

  const signatureImg = hasPrintableImageUrl(data.employee_signature_url)
    ? `<img src="${data.employee_signature_url}" style="height: 15mm; width: 30mm; object-fit: contain;" />`
    : '';

  const stampImg = hasPrintableImageUrl(data.company_stamp_url)
    ? `<img src="${data.company_stamp_url}" style="height: 50mm; width: 50mm; object-fit: contain;" />`
    : '';

  /** Reserved slot so table→footer vertical gap matches the case when stamp/signature exist. */
  const signatureSlot = `<div class="signature-slot">${signatureImg}</div>`;

  const stampInlineInner = stampImg
    ? stampImg
    : '<div class="stamp-placeholder" aria-hidden="true"></div>';

  const noteInlineInner = data.note
    ? `<span class="note-label">Note :</span> ${data.note}`
    : '';

  const stampNoteRow = `<div class="stamp-note-row">
          <div class="stamp-inline">${stampInlineInner}</div>
          <div class="note-inline">${noteInlineInner}</div>
        </div>`;

  const deliveryRowHtml = data.is_delivery
    ? `<div class="info-row">
                <span class="info-label" style="display:inline-block; transform: translateX(15mm);">Хүргэлт :</span>
                <span style="margin-left: 15mm;">${data.ecommerce_phone ?? ''}</span>
              </div>`
    : `<div class="info-row info-grid-empty-cell" aria-hidden="true"><span></span><span></span></div>`;

  const titleText = `${data.title_label ?? DEFAULT_PRINT_TITLE_LABEL} №${data.invoice_number}`;

  const headerBlock = `
            <div class="header-row">
              <span><span class="header-party header-party-seller">Худалдагч :</span></span>
              <span><span class="header-party header-party-buyer">Худалдан авагч</span></span>
            </div>
            <div class="header-sublabel">
              <span><span class="name-label label-shift-right">Нэр :</span><span style="margin-left: 3mm;">${supplierInfo}</span></span>
              <span>${customerInfo}</span>
            </div>

            <div class="info-grid">
              <div class="info-row">
                <span class="info-label label-shift-right">Хаяг :</span>
                <span>${addressLine}</span>
              </div>
              ${deliveryRowHtml}

              <div class="info-row">
                <span class="info-label label-shift-right">Утас :</span>
                <span>${branchPhones}</span>
              </div>
              <div class="info-row">
                <span class="info-label" style="display:inline-block; transform: translateX(15mm);">Утас :</span>
                <span style="margin-left: 15mm;">${customerPhoneStr}</span>
              </div>

              <div class="info-row">
                <span class="info-label label-shift-right">Банк :</span>
                <span>${bankLine}</span>
              </div>
              <div class="info-row">
                <span class="info-label" style="display:inline-block; transform: translateX(15mm);">Огноо :</span>
                <span style="margin-left: 15mm;">${dateOnly}</span>
              </div>
            </div>`;

  const tableThead = `
              <thead>
                <tr>
                  <th style="width: 7mm;">&#8470;</th>
                  <th style="width: 65mm;">Барааны нэр</th>
                  <th style="width: 14mm;">Тоо</th>
                  <th style="width: 18mm;">Нэгж үнэ</th>
                  <th style="width: 22mm;">Нийт үнэ</th>
                </tr>
              </thead>`;

  const renderItemRow = (rowNum: number, item: PrintInvoiceItem) => `
        <tr>
          <td>${rowNum}</td>
          <td style="text-align: left;">${item.product_name}</td>
          <td>${item.quantity}</td>
          <td style="text-align: right;">${formatCurrency(item.unit_price)}</td>
          <td style="text-align: right;">${formatCurrency(item.total_price)}</td>
        </tr>`;

  const totalRowHtml = `
        <tr style="font-weight: 600; background-color: #f1f5f9;">
          <td></td>
          <td style="text-align: center; font-weight: 700;">Нийт дүн</td>
          <td style="font-weight: 700;">${data.total_quantity}</td>
          <td>&nbsp;</td>
          <td style="text-align: right; font-weight: 700;">${formatCurrency(data.grand_total)}</td>
        </tr>`;

  const footerBlock = `
            <div class="footer-section">
              <div class="signature-row">
                <div class="signature-item">
                  <span>Хүлээлгэн өгсөн: </span>
                  ${signatureSlot}
                </div>
                <div class="signature-item">
                  <span class="receiver-shift-right">Хүлээн авсан :</span>
                </div>
              </div>

              ${stampNoteRow}

            </div>`;

  const marketingBlock = `<div class="marketing-section">${data.marketing_name?.trim() ? data.marketing_name : '\u00a0'}</div>`;

  const items = data.items ?? [];
  const chunks: PrintInvoiceItem[][] = [];
  if (items.length === 0) {
    chunks.push([]);
  } else {
    for (let i = 0; i < items.length; i += ROWS_PER_PAGE) {
      chunks.push(items.slice(i, i + ROWS_PER_PAGE));
    }
  }

  const printPagesHtml = chunks
    .map((chunk, pageIndex) => {
      const isLast = pageIndex === chunks.length - 1;
      const startNo = pageIndex * ROWS_PER_PAGE + 1;
      const dataRows = chunk.map((item, idx) => renderItemRow(startNo + idx, item)).join('');
      const tbodyInner = isLast ? `${dataRows}${totalRowHtml}` : dataRows;

      return `
      <div class="print-page">
        <div class="container">
          <div class="title">${titleText}</div>

          <div class="content-after-title">
            ${headerBlock}

            <table class="invoice-table">
              ${tableThead}
              <tbody>
                ${tbodyInner}
              </tbody>
            </table>
            ${footerBlock}
          </div>
          ${marketingBlock}
        </div>
      </div>`;
    })
    .join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>${titleText}</title>
        <style>
          @page {
            size: A4 landscape;
            margin: 5mm;
          }
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: 'BatangChe', 'Batang', 'Malgun Gothic', Calibri, sans-serif;
            font-size: 12px;
            padding: 0;
            zoom: 0.45;
            display: block;
          }
          .print-page {
            page-break-after: always;
            break-after: page;
          }
          .print-page:last-child {
            page-break-after: auto;
            break-after: auto;
          }
          .container {
            width: 45%;
            margin-left: auto;
            display: flex;
            flex-direction: column;
            padding-right: 3mm;
            box-sizing: border-box;
          }
          .title {
            text-align: center;
            font-size: 35px;
            font-weight: bold;
            margin-bottom: 6px;
          }
          .header-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8mm;
            font-size: 25px;
          }
          .header-party {
            text-decoration: underline;
            font-weight: 700;
            font-size: 31.2px; /* 24px ("Хаяг" line) * 1.3 */
          }
          .header-party-seller {
            display: inline-block;
            transform: translateX(5mm);
          }
          .header-party-buyer {
            display: inline-block;
            transform: translateX(-20mm);
          }
          .content-after-title {
            transform: translateY(5mm);
          }
          .header-sublabel {
            font-size: 27.6px;
            margin-bottom: 6.4mm;
            display: flex;
            justify-content: space-between;
          }
          .info-grid {
            display: grid;
            grid-template-columns: 1.8fr 1fr;
            gap: 6.4mm 0px;
            margin-bottom: 6.4mm;
            font-size: 28.8px;
          }
          .info-row {
            display: flex;
            gap: 4px;
          }
          .info-row > span:last-child {
            margin-left: 3mm;
          }
          .info-grid-empty-cell {
            visibility: hidden;
            height: 0;
            min-height: 0;
            overflow: hidden;
            margin: 0;
            padding: 0;
            pointer-events: none;
          }
          .info-grid-empty-cell span {
            display: none;
          }
          .info-label {
            font-weight: 600;
            white-space: nowrap;
          }
          .label-shift-right {
            display: inline-block;
            transform: translateX(3mm);
          }
          .label-shift-right-25 {
            display: inline-block;
            transform: translateX(-13mm);
          }
          .label-delivery-shift {
            display: inline-block;
            transform: translateX(15mm);
          }
          .name-label {
            font-weight: 700;
          }
          table {
            border-collapse: collapse;
            table-layout: fixed;
          }
          /* +10mm барааны нэр: баруун талын багануудын байр тогтмор, хүснэгт зүүн тийш сунгана */
          table.invoice-table {
            width: calc(100% + 10mm);
            margin-left: -10mm;
          }
          th {
            border: 1px solid #000;
            padding: 3px 4px;
            font-weight: 600;
            text-align: center;
            font-size: 28.8px;
            height: 6mm;
            background-color: #f8f8f8;
          }
          td {
            font-size: 26.4px;
            border: 1px solid #000;
            padding: 2px 4px;
            text-align: center;
            vertical-align: middle;
            height: 5.4mm;
          }
          .footer-section {
            margin-top: 8mm;
            font-size: 28.8px;
          }
          .signature-row {
            display: flex;
            justify-content: flex-start;
            gap: 40px;
            margin-bottom: 2px;
          }
          .signature-item {
            display: flex;
            align-items: flex-start;
            gap: 4px;
          }
          .signature-slot {
            min-height: 15mm;
            min-width: 30mm;
            display: inline-flex;
            align-items: flex-end;
            flex-shrink: 0;
          }
          .receiver-shift-right {
            display: inline-block;
            transform: translateX(60mm);
          }
          .date-value-spacing {
            margin-left: 15mm;
          }
          .stamp-note-row {
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: flex-start;
            gap: 10mm;
            margin-top: 2px;
            flex-wrap: nowrap;
          }
          .stamp-inline {
            flex-shrink: 0;
          }
          .stamp-inline img {
            display: block;
          }
          .stamp-placeholder {
            height: 50mm;
            width: 50mm;
            flex-shrink: 0;
            visibility: hidden;
            pointer-events: none;
          }
          .note-inline {
            flex: 1;
            min-width: 0;
            min-height: 50mm;
            display: flex;
            align-items: center;
            font-size: 26.4px;
            text-align: left;
            line-height: 1.2;
          }
          .note-label {
            font-weight: 700;
          }
          .marketing-section {
            margin-top: 2mm;
            text-align: center;
            font-size: 28.8px;
            white-space: nowrap;
            min-height: 1.2em;
          }
          @media print {
            body {
              zoom: 0.45;
              display: block;
            }
            .container {
              width: 45%;
              margin-left: auto;
              display: flex;
              flex-direction: column;
            }
            table.invoice-table {
              width: calc(100% + 10mm);
              margin-left: -10mm;
            }
          }
        </style>
      </head>
      <body>
        ${printPagesHtml}
      </body>
    </html>
  `;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'absolute';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentWindow?.document;
  const win = iframe.contentWindow;
  if (iframeDoc && win) {
    iframeDoc.open();
    iframeDoc.write(htmlContent);
    iframeDoc.close();

    void (async () => {
      await waitForImagesInDocument(iframeDoc);
      await new Promise<void>(resolve => {
        requestAnimationFrame(() => resolve());
      });
      await new Promise<void>(resolve => setTimeout(resolve, 100));

      win.focus();
      win.print();

      setTimeout(() => {
        iframe.remove();
      }, 1000);
    })();
  }
};
