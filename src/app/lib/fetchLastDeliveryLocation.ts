import { resolveCustomerIdForOnlineOrder } from './customersRegister';

export interface LastDeliveryLocation {
  lat: number;
  lng: number;
  address: string;
}

function getSupabaseRest(): { restBase: string; anonKey: string } {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!supabaseUrl?.trim() || !anonKey?.trim()) {
    throw new Error('Supabase тохиргоо дутуу байна.');
  }
  return { restBase: supabaseUrl.replace(/\/$/, ''), anonKey: anonKey.trim() };
}

async function parseJsonSafely(res: Response): Promise<unknown> {
  const raw = await res.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * `sales` — хамгийн сүүлийн хүргэлтийн координат (customer_id, lat/lng байгаа мөр).
 */
export async function fetchLastDeliveryLocationFromSales(params: {
  isLoggedIn: boolean;
  phone: number | null;
  googleId: string | null;
}): Promise<LastDeliveryLocation | null> {
  if (!params.isLoggedIn) return null;

  let customerId: string;
  try {
    customerId = await resolveCustomerIdForOnlineOrder({
      isLoggedIn: true,
      phone: params.phone,
      googleId: params.googleId,
    });
  } catch {
    return null;
  }

  const { restBase, anonKey } = getSupabaseRest();
  const qp = new URLSearchParams({
    select:
      'created_at,ecommerce_delivery_location_lat,ecommerce_delivery_location_lng,ecommerce_delivery_address',
    customer_id: `eq.${customerId}`,
    order: 'created_at.desc',
    limit: '1',
  });
  qp.set('ecommerce_delivery_location_lat', 'not.is.null');
  qp.set('ecommerce_delivery_location_lng', 'not.is.null');

  const res = await fetch(`${restBase}/rest/v1/sales?${qp.toString()}`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: 'application/json',
    },
  });
  const json = await parseJsonSafely(res);
  if (!res.ok || !Array.isArray(json) || json.length === 0) return null;

  const row = json[0] as Record<string, unknown>;
  const lat = num(row.ecommerce_delivery_location_lat);
  const lng = num(row.ecommerce_delivery_location_lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

  const addrRaw =
    typeof row.ecommerce_delivery_address === 'string'
      ? row.ecommerce_delivery_address.trim()
      : '';
  const address =
    addrRaw.length > 0 ? addrRaw : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  return { lat, lng, address };
}
