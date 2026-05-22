// ─── Google Maps JS API — singleton lazy loader ───────────────────────────────
// .env: VITE_GOOGLE_MAPS_API_KEY=... (Google Cloud: Maps JavaScript API + Geocoding API)

const PLACEHOLDER_KEY = 'YOUR_GOOGLE_MAPS_API_KEY';

export function getGoogleMapsApiKey(): string {
  return (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() ?? '';
}

export function isGoogleMapsApiKeyConfigured(): boolean {
  const k = getGoogleMapsApiKey();
  return k.length > 0 && k !== PLACEHOLDER_KEY;
}

/** @deprecated — env-ээс уншина; шалгалтад isGoogleMapsApiKeyConfigured() ашиглана */
export const GOOGLE_MAPS_API_KEY = getGoogleMapsApiKey();

// Default map center — Ulaanbaatar city centre
export const MAP_DEFAULT_CENTER = { lat: 47.8864, lng: 106.9057 };

let _promise: Promise<void> | null = null;

export function loadGoogleMapsScript(): Promise<void> {
  if (!isGoogleMapsApiKeyConfigured()) {
    return Promise.reject(new Error('API_KEY_MISSING'));
  }

  // Already loaded
  if (typeof window !== 'undefined' && (window as any).google?.maps?.Map) {
    return Promise.resolve();
  }
  // Loading already in progress — reuse the same promise
  if (_promise) return _promise;

  const apiKey = getGoogleMapsApiKey();

  _promise = new Promise<void>((resolve, reject) => {
    const callbackName = '__gmapsInitCallback__';
    (window as any)[callbackName] = () => {
      delete (window as any)[callbackName];
      resolve();
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=${callbackName}&loading=async`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      _promise = null;
      delete (window as any)[callbackName];
      reject(new Error('Google Maps ачааллаж чадсангүй'));
    };
    document.head.appendChild(script);
  });

  return _promise;
}
