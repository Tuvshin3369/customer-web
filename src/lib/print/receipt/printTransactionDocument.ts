import { printInvoice } from './printInvoice';
import { BRANCH_COLUMNS_FOR_PRINT, branchSupplierFieldsForPrint } from './branchPrintSupplierFields';
import { calculateTotalAmount } from './priceCalculator';
import { getSupabaseEnv, restGet } from './supabaseEnv';

const formatDateTime = (dateString: string) => {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}/${month}/${day} ${hours}:${minutes}`;
};

function truncateIsoToSeconds(iso: string): string {
  return iso.slice(0, 19);
}

function salesTransactionGroupKey(row: {
  created_at: string;
  customer_id: string | null;
  employee_id: string | null;
}): string {
  const timeKey = truncateIsoToSeconds(new Date(row.created_at).toISOString());
  return `${timeKey}_${row.customer_id ?? ''}_${row.employee_id ?? ''}`;
}

function onlineOrderGroupKey(row: {
  store_id: string;
  ecommerce_phone: number | string | null;
  delivery_type: string | null;
  note: string | null;
  created_at: string;
}): string {
  return [
    row.store_id,
    row.ecommerce_phone ?? '',
    row.delivery_type ?? '',
    row.note ?? '',
    truncateIsoToSeconds(row.created_at),
  ].join('|');
}

const SALES_PRINT_SELECT = encodeURIComponent(
  '*,employee:employees(full_name),customer:customers(organization_name,register,phone),product:products(product_name,is_foam_range,is_calculate_length,is_pigment_2),coded_paint:coded_paints(color_code,color_name)'
);

const ONLINE_ORDER_PRINT_SELECT = encodeURIComponent(
  'id,store_id,product_id,coded_paint_id,product_number,sold_price,system_price,foam_size,length_meter,is_pigment,ecommerce_phone,ecommerce_name,ecommerce_register,is_delivery,note,created_at,customer_id,product:products(product_name,is_foam_range,is_calculate_length),coded_paint:coded_paints(color_code,color_name),customer:customers(organization_name,register,phone)'
);

function getProductDisplayNameSale(item: {
  coded_paint?: { color_code: string; color_name: string | null } | null;
  product_id: string | null;
  is_pigment?: boolean;
  product?: { product_name: string; is_foam_range?: boolean; is_calculate_length?: boolean } | null;
  foam_size: string | null;
  length_meter: number | null;
}): string {
  if (item.coded_paint) {
    if (item.product_id) {
      if (item.is_pigment) {
        return `${item.coded_paint.color_code} ( ${item.product?.product_name || ''} )`;
      }
      return `${item.product?.product_name || ''} ( ${item.coded_paint.color_code} )`;
    }
    if (item.coded_paint.color_name) {
      return `${item.coded_paint.color_code} ( ${item.coded_paint.color_name} )`;
    }
    return item.coded_paint.color_code;
  }
  if (item.product?.is_foam_range && item.foam_size) {
    const sizes = item.foam_size.split(',');
    if (sizes.length === 2) {
      return `${item.product.product_name} (өндөр "${sizes[0]}"см x өргөн "${sizes[1]}"см)`;
    }
  }
  if (item.product?.is_calculate_length && item.length_meter) {
    return `${item.product.product_name} (урт ${item.length_meter}м)`;
  }
  return item.product?.product_name || '';
}

function getProductDisplayNameInvoice(item: {
  coded_paint?: { color_code: string; color_name: string | null } | null;
  product_id: string | null;
  product?: { product_name: string; is_foam_range?: boolean; is_calculate_length?: boolean } | null;
  foam_size: string | null;
  length_meter: number | null;
}): string {
  if (item.coded_paint) {
    if (item.product_id) {
      return `${item.product?.product_name || ''} ( ${item.coded_paint.color_code} )`;
    }
    if (item.coded_paint.color_name) {
      return `${item.coded_paint.color_code} ( ${item.coded_paint.color_name} )`;
    }
    return item.coded_paint.color_code;
  }
  if (item.product?.is_foam_range && item.foam_size) {
    const sizes = item.foam_size.split(',');
    if (sizes.length === 2) {
      return `${item.product.product_name} (өндөр "${sizes[0]}"см x өргөн "${sizes[1]}"см)`;
    }
  }
  if (item.product?.is_calculate_length && item.length_meter) {
    return `${item.product.product_name} (урт ${item.length_meter}м)`;
  }
  return item.product?.product_name || '';
}

function getProductDisplayNameOnlineOrder(item: {
  coded_paint?: { color_code: string; color_name: string | null } | null;
  product_id: string | null;
  is_pigment?: boolean;
  product?: { product_name: string; is_foam_range?: boolean; is_calculate_length?: boolean } | null;
  foam_size: string | null;
  length_meter: number | null;
}): string {
  return getProductDisplayNameInvoice(item);
}

async function fetchBranchForPrint(branchId: string) {
  const cols = encodeURIComponent(BRANCH_COLUMNS_FOR_PRINT);
  const rows = await restGet<Record<string, unknown>[]>(
    `/rest/v1/branches?id=eq.${branchId}&select=${cols}&limit=1`
  );
  return rows[0] ?? null;
}

async function fetchMainBranchByStoreId(storeId: string) {
  const cols = encodeURIComponent(BRANCH_COLUMNS_FOR_PRINT);
  const rows = await restGet<Record<string, unknown>[]>(
    `/rest/v1/branches?store_id=eq.${storeId}&is_main_branch=eq.true&select=${cols}&limit=1`
  );
  if (rows[0]) return rows[0];
  const fallback = await restGet<Record<string, unknown>[]>(
    `/rest/v1/branches?store_id=eq.${storeId}&select=${cols}&limit=1`
  );
  return fallback[0] ?? null;
}

async function fetchEmployeeSignature(employeeId: string): Promise<string> {
  try {
    const rows = await restGet<{ signature?: string }[]>(
      `/rest/v1/employees?id=eq.${employeeId}&select=signature&limit=1`
    );
    return rows[0]?.signature || '';
  } catch {
    return '';
  }
}

async function fetchMarketingName(): Promise<string> {
  try {
    const rows = await restGet<{ name?: string }[]>(
      '/rest/v1/marketing?select=name&order=created_at.desc&limit=1'
    );
    return rows[0]?.name?.trim() || '';
  } catch {
    return '';
  }
}

async function countPriorSalesDocuments(branchId: string, cutoffCreatedAtIso: string): Promise<number> {
  const keys = new Set<string>();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const env = getSupabaseEnv();
    const path =
      `/rest/v1/sales?branch_id=eq.${branchId}` +
      `&created_at=lt.${encodeURIComponent(cutoffCreatedAtIso)}` +
      `&select=created_at,customer_id,employee_id` +
      `&order=created_at.asc` +
      `&offset=${from}&limit=${pageSize}`;
    const res = await fetch(`${env.restBase}${path}`, {
      headers: {
        apikey: env.anonKey,
        Authorization: `Bearer ${env.anonKey}`,
        Accept: 'application/json',
        Range: `${from}-${from + pageSize - 1}`,
      },
    });
    const data = (await res.json()) as Array<{
      created_at: string;
      customer_id: string | null;
      employee_id: string | null;
    }>;
    if (!Array.isArray(data) || data.length === 0) break;
    for (const row of data) keys.add(salesTransactionGroupKey(row));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return keys.size;
}

async function countPriorOnlineOrderDocuments(storeId: string, cutoffCreatedAtIso: string): Promise<number> {
  const keys = new Set<string>();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const env = getSupabaseEnv();
    const path =
      `/rest/v1/online_orders?store_id=eq.${storeId}` +
      `&created_at=lt.${encodeURIComponent(cutoffCreatedAtIso)}` +
      `&select=store_id,ecommerce_phone,delivery_type,note,created_at` +
      `&order=created_at.asc` +
      `&offset=${from}&limit=${pageSize}`;
    const res = await fetch(`${env.restBase}${path}`, {
      headers: {
        apikey: env.anonKey,
        Authorization: `Bearer ${env.anonKey}`,
        Accept: 'application/json',
      },
    });
    const data = (await res.json()) as Array<{
      store_id: string;
      ecommerce_phone: number | null;
      delivery_type: string | null;
      note: string | null;
      created_at: string;
    }>;
    if (!Array.isArray(data) || data.length === 0) break;
    for (const row of data) keys.add(onlineOrderGroupKey(row));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return keys.size;
}

export type PrintTransactionResult = { ok: true } | { ok: false; message: string };

/** Admin-web SalesList `printSalesBySalesIds` — customer-web REST хувилбар */
export async function printSalesBySalesIds(salesIds: string[]): Promise<PrintTransactionResult> {
  if (!salesIds.length) return { ok: false, message: 'Хэвлэх боломжгүй' };

  try {
    const inList = salesIds.map(id => encodeURIComponent(id)).join(',');
    const rows = await restGet<Record<string, unknown>[]>(
      `/rest/v1/sales?sales_id=in.(${inList})&select=${SALES_PRINT_SELECT}`
    );

    if (!rows?.length) return { ok: false, message: 'Хэвлэх боломжгүй' };

    const first = rows[0] as {
      branch_id: string;
      employee_id: string | null;
      created_at: string;
      note: string | null;
      is_delivery?: boolean | null;
      ecommerce_phone?: number | null;
      customer?: { organization_name: string | null; register: string | null; phone: number };
      employee?: { full_name: string };
    };

    const branch = await fetchBranchForPrint(String(first.branch_id));
    const register = first.customer?.register ?? null;
    const supplier = branchSupplierFieldsForPrint(branch as Parameters<typeof branchSupplierFieldsForPrint>[0], register);

    const branchPhones: string[] = [];
    if (branch?.phone_1) branchPhones.push(String(branch.phone_1));
    if (branch?.phone_2) branchPhones.push(String(branch.phone_2));
    if (branch?.phone_3) branchPhones.push(String(branch.phone_3));

    const employeeSignatureUrl = first.employee_id
      ? await fetchEmployeeSignature(String(first.employee_id))
      : '';
    const marketingName = await fetchMarketingName();

    const earliestMs = Math.min(...rows.map(r => new Date(String(r.created_at)).getTime()));
    const priorDocCount = await countPriorSalesDocuments(String(first.branch_id), new Date(earliestMs).toISOString());
    const invoiceNumber = priorDocCount + 1;

    const totalQuantity = rows.reduce((sum, item) => sum + (Number(item.product_number) || 0), 0);
    const totalAmount = calculateTotalAmount(
      rows.map(r => ({
        sold_price: Number(r.sold_price) || 0,
        product_number: Number(r.product_number) || 0,
      }))
    );

    const phoneStr = first.customer?.phone != null ? String(first.customer.phone) : '';

    printInvoice({
      invoice_number: invoiceNumber.toString(),
      branch_company_name: supplier.branch_company_name,
      branch_company_register: supplier.branch_company_register,
      customer_name: first.customer?.organization_name || phoneStr || 'Хэрэглэгч байхгүй',
      customer_register: register || undefined,
      customer_phone: phoneStr,
      is_delivery: Boolean(first.is_delivery),
      ecommerce_phone:
        first.is_delivery && first.ecommerce_phone != null
          ? String(first.ecommerce_phone)
          : undefined,
      branch_address: branch?.address ? String(branch.address) : undefined,
      branch_website: branch?.website ? String(branch.website) : undefined,
      branch_phones: branchPhones,
      bank_name: supplier.bank_name,
      bank_account: supplier.bank_account,
      created_at: formatDateTime(String(first.created_at)),
      items: rows.map(row => {
        const soldPrice = Number(row.sold_price) || 0;
        const qty = Number(row.product_number) || 0;
        return {
          product_name: getProductDisplayNameSale(row as Parameters<typeof getProductDisplayNameSale>[0]),
          quantity: qty,
          unit_price: soldPrice,
          total_price: soldPrice * qty,
        };
      }),
      total_quantity: totalQuantity,
      grand_total: totalAmount,
      employee_name: first.employee?.full_name || '',
      employee_signature_url: employeeSignatureUrl,
      company_stamp_url: supplier.company_stamp_url,
      note: first.note ? String(first.note) : undefined,
      marketing_name: marketingName || undefined,
    });

    return { ok: true };
  } catch (e) {
    console.error('printSalesBySalesIds:', e);
    return { ok: false, message: 'Хэвлэхэд алдаа гарлаа' };
  }
}

/** online_orders — «Миний захиалга» нэхэмжлэл (Admin invoice формат) */
export async function printOnlineOrdersByIds(orderIds: string[]): Promise<PrintTransactionResult> {
  if (!orderIds.length) return { ok: false, message: 'Хэвлэх боломжгүй' };

  try {
    const inList = orderIds.map(id => encodeURIComponent(id)).join(',');
    const rows = await restGet<Record<string, unknown>[]>(
      `/rest/v1/online_orders?id=in.(${inList})&select=${ONLINE_ORDER_PRINT_SELECT}`
    );

    if (!rows?.length) return { ok: false, message: 'Хэвлэх боломжгүй' };

    const first = rows[0] as {
      store_id: string;
      created_at: string;
      note: string | null;
      is_delivery?: boolean | null;
      ecommerce_phone?: number | null;
      ecommerce_name?: string | null;
      ecommerce_register?: string | null;
      customer?: { organization_name: string | null; register: string | null; phone: number };
    };

    /** `online_orders.branch_id` байхгүй — гол салбарыг түр `branches` (store_id + is_main_branch) онооно */
    const branch = await fetchMainBranchByStoreId(String(first.store_id));

    const register =
      first.customer?.register ??
      first.ecommerce_register ??
      null;
    const supplier = branchSupplierFieldsForPrint(branch as Parameters<typeof branchSupplierFieldsForPrint>[0], register);

    const branchPhones: string[] = [];
    if (branch?.phone_1) branchPhones.push(String(branch.phone_1));
    if (branch?.phone_2) branchPhones.push(String(branch.phone_2));
    if (branch?.phone_3) branchPhones.push(String(branch.phone_3));

    const earliestMs = Math.min(...rows.map(r => new Date(String(r.created_at)).getTime()));
    const priorDocCount = await countPriorOnlineOrderDocuments(
      String(first.store_id),
      new Date(earliestMs).toISOString()
    );
    const invoiceNumber = priorDocCount + 1;

    const totalQuantity = rows.reduce((sum, item) => sum + (Number(item.product_number) || 0), 0);
    const totalAmount = calculateTotalAmount(
      rows.map(r => ({
        system_price: Number(r.system_price) || 0,
        product_number: Number(r.product_number) || 0,
      }))
    );

    const phoneStr =
      first.customer?.phone != null
        ? String(first.customer.phone)
        : first.ecommerce_phone != null
          ? String(first.ecommerce_phone)
          : '';

    const customerName =
      first.customer?.organization_name ||
      first.ecommerce_name ||
      phoneStr ||
      'Хэрэглэгч байхгүй';

    printInvoice({
      invoice_number: invoiceNumber.toString(),
      title_label: 'НЭХЭМЖЛЭЛ',
      branch_company_name: supplier.branch_company_name,
      branch_company_register: supplier.branch_company_register,
      customer_name: customerName,
      customer_register: register ? String(register) : undefined,
      customer_phone: phoneStr,
      is_delivery: Boolean(first.is_delivery),
      ecommerce_phone:
        first.is_delivery && first.ecommerce_phone != null
          ? String(first.ecommerce_phone)
          : undefined,
      branch_address: branch?.address ? String(branch.address) : undefined,
      branch_website: branch?.website ? String(branch.website) : undefined,
      branch_phones: branchPhones,
      bank_name: supplier.bank_name,
      bank_account: supplier.bank_account,
      created_at: formatDateTime(String(first.created_at)),
      items: rows.map(row => {
        const systemPrice = Number(row.system_price) || 0;
        const qty = Number(row.product_number) || 0;
        return {
          product_name: getProductDisplayNameOnlineOrder(row as Parameters<typeof getProductDisplayNameOnlineOrder>[0]),
          quantity: qty,
          unit_price: systemPrice,
          total_price: systemPrice * qty,
        };
      }),
      total_quantity: totalQuantity,
      grand_total: totalAmount,
      company_stamp_url: supplier.company_stamp_url,
      note: first.note ? String(first.note) : undefined,
    });

    return { ok: true };
  } catch (e) {
    console.error('printOnlineOrdersByIds:', e);
    return { ok: false, message: 'Хэвлэхэд алдаа гарлаа' };
  }
}
