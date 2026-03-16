// ─── Google Maps JS API — singleton lazy loader ───────────────────────────────
// Replace GOOGLE_MAPS_API_KEY with your real key from Google Cloud Console.
// Enable: Maps JavaScript API + Geocoding API in your project.
export const GOOGLE_MAPS_API_KEY = 'YOUR_GOOGLE_MAPS_API_KEY';

// Default map center — Ulaanbaatar city centre
export const MAP_DEFAULT_CENTER = { lat: 47.8864, lng: 106.9057 };

let _promise: Promise<void> | null = null;

export function loadGoogleMapsScript(): Promise<void> {
  // Already loaded
  if (typeof window !== 'undefined' && (window as any).google?.maps?.Map) {
    return Promise.resolve();
  }
  // Loading already in progress — reuse the same promise
  if (_promise) return _promise;

  _promise = new Promise<void>((resolve, reject) => {
    // Unique callback name so we can call it from the script tag
    const callbackName = '__gmapsInitCallback__';
    (window as any)[callbackName] = () => {
      delete (window as any)[callbackName];
      resolve();
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&callback=${callbackName}&loading=async`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      _promise = null; // allow retry on next call
      delete (window as any)[callbackName];
      reject(new Error('Google Maps ачааллаж чадсангүй'));
    };
    document.head.appendChild(script);
  });

  return _promise;
}
