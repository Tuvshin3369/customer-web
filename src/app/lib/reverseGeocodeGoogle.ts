import { getGoogleMapsApiKey, isGoogleMapsApiKeyConfigured } from '../utils/loadGoogleMaps';

export interface GeocodeAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

export interface GeocodeResultLike {
  formatted_address?: string;
  address_components?: GeocodeAddressComponent[];
  types?: string[];
}

function componentName(
  components: GeocodeAddressComponent[],
  ...types: string[]
): string {
  for (const t of types) {
    const hit = components.find((c) => c.types.includes(t));
    const name = hit?.long_name?.trim();
    if (name) return name;
  }
  return '';
}

/** Google reverse geocode — дэлгэцийн богино албан хаяг (жишээ: SHD - 20 khoroo) */
export function displayAddressFromGeocodeResult(result: GeocodeResultLike): string {
  const components = result.address_components ?? [];

  const neighborhood = componentName(
    components,
    'neighborhood',
    'sublocality_level_1',
    'sublocality',
    'administrative_area_level_3',
  );
  const district = componentName(
    components,
    'administrative_area_level_2',
    'administrative_area_level_1',
  );

  if (neighborhood) return neighborhood;
  if (district) return district;

  const formatted = result.formatted_address?.trim();
  if (formatted) {
    const first = formatted.split(',')[0]?.trim();
    if (first && !/^[\dA-Z]{4}\+[\dA-Z]{2,}$/i.test(first)) return first;
    const second = formatted.split(',')[1]?.trim();
    if (second) return second;
    return formatted;
  }

  return '';
}

function coordFallback(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export function looksLikeCoordinateAddress(address: string): boolean {
  return /^-?\d+\.\d+\s*,\s*-?\d+\.\d+$/.test(address.trim());
}

/** REST Geocoding API — lat/lng → албан хаяг */
export async function reverseGeocodeLatLng(lat: number, lng: number): Promise<string> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
  if (!isGoogleMapsApiKeyConfigured()) return coordFallback(lat, lng);

  const key = getGoogleMapsApiKey();
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('latlng', `${lat},${lng}`);
  url.searchParams.set('key', key);
  url.searchParams.set('language', 'mn');

  try {
    const res = await fetch(url.toString());
    const json = (await res.json()) as {
      status?: string;
      results?: GeocodeResultLike[];
    };
    if (json.status !== 'OK' || !Array.isArray(json.results) || json.results.length === 0) {
      return coordFallback(lat, lng);
    }

    for (const row of json.results) {
      const label = displayAddressFromGeocodeResult(row);
      if (label) return label;
    }

    const fa = json.results[0]?.formatted_address?.trim();
    if (fa) return fa.split(',')[0]?.trim() || fa;
  } catch {
    /* fallback */
  }

  return coordFallback(lat, lng);
}
