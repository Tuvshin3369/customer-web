import { useState, useEffect, useRef, useCallback } from 'react';
import { X, MapPin, Navigation, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { loadGoogleMapsScript, MAP_DEFAULT_CENTER, GOOGLE_MAPS_API_KEY } from '../utils/loadGoogleMaps';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface PickedLocation {
  lat:     number;
  lng:     number;
  address: string;
}

interface MapPickerModalProps {
  isOpen:      boolean;
  onClose:     () => void;
  onConfirm:   (location: PickedLocation) => void;
  initialLat?: number | null;
  initialLng?: number | null;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function MapPickerModal({
  isOpen, onClose, onConfirm, initialLat, initialLng,
}: MapPickerModalProps) {

  // ── Animation ──────────────────────────────────────────────────────────────
  const [mounted,  setMounted]  = useState(false);
  const [visible,  setVisible]  = useState(false);

  // ── Map state ──────────────────────────────────────────────────────────────
  const [mapStatus,       setMapStatus]       = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError,       setLoadError]       = useState('');
  const [currentAddress,  setCurrentAddress]  = useState('');
  const [isGeocoding,     setIsGeocoding]     = useState(false);
  const [pickedLatLng,    setPickedLatLng]     = useState<{ lat: number; lng: number } | null>(null);
  const [isGeolocating,   setIsGeolocating]   = useState(false);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const mapDivRef   = useRef<HTMLDivElement>(null);
  const mapRef      = useRef<any>(null);
  const markerRef   = useRef<any>(null);
  const geocoderRef = useRef<any>(null);

  // ── Animation lifecycle ────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      setMapStatus('loading');
      setLoadError('');
      setCurrentAddress('');
      setPickedLatLng(null);
      setIsGeolocating(false);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      const t = setTimeout(() => {
        setMounted(false);
        // Clean up map instance
        if (markerRef.current) {
          try { (window as any).google?.maps?.event.clearInstanceListeners(markerRef.current); } catch { /* */ }
          markerRef.current = null;
        }
        if (mapRef.current) {
          try { (window as any).google?.maps?.event.clearInstanceListeners(mapRef.current); } catch { /* */ }
          mapRef.current = null;
        }
        geocoderRef.current = null;
      }, 350);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // ── Reverse geocode helper ─────────────────────────────────────────────────
  const reverseGeocode = useCallback((latLng: { lat: number; lng: number }) => {
    const gc = geocoderRef.current;
    if (!gc) {
      setCurrentAddress(`${latLng.lat.toFixed(5)}, ${latLng.lng.toFixed(5)}`);
      return;
    }
    setIsGeocoding(true);
    setPickedLatLng(latLng);
    gc.geocode({ location: latLng }, (results: any[], status: string) => {
      setIsGeocoding(false);
      if (status === 'OK' && results?.[0]) {
        setCurrentAddress(results[0].formatted_address);
      } else {
        setCurrentAddress(`${latLng.lat.toFixed(5)}, ${latLng.lng.toFixed(5)}`);
      }
    });
  }, []);

  // ── Map init ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mounted || !isOpen) return;

    let cancelled = false;

    async function initMap() {
      try {
        // Show no API key hint without actually loading
        if (GOOGLE_MAPS_API_KEY === 'YOUR_GOOGLE_MAPS_API_KEY') {
          throw new Error('API_KEY_MISSING');
        }

        await loadGoogleMapsScript();
        if (cancelled || !mapDivRef.current) return;

        // Wait for layout paint so the div has real dimensions
        await new Promise<void>((r) => setTimeout(r, 80));
        if (cancelled || !mapDivRef.current) return;

        const G = (window as any).google.maps;

        // Determine initial center
        let center = {
          lat: typeof initialLat === 'number' ? initialLat : MAP_DEFAULT_CENTER.lat,
          lng: typeof initialLng === 'number' ? initialLng : MAP_DEFAULT_CENTER.lng,
        };

        // Try geolocation if no prior location passed
        if (!initialLat && !initialLng && navigator.geolocation) {
          try {
            const pos = await new Promise<GeolocationPosition>((res, rej) => {
              navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5_000 });
            });
            center = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          } catch {
            // Fall back to default center silently
          }
        }

        if (cancelled || !mapDivRef.current) return;

        const map = new G.Map(mapDivRef.current, {
          center,
          zoom:               15,
          disableDefaultUI:   true,
          zoomControl:        true,
          zoomControlOptions: { position: G.ControlPosition.RIGHT_CENTER },
          gestureHandling:    'greedy',
          clickableIcons:     false,
          styles: [
            { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
          ],
        });

        const marker = new G.Marker({
          position:  center,
          map,
          draggable: true,
          animation: G.Animation.DROP,
          icon: {
            path:        G.SymbolPath.CIRCLE,
            scale:       10,
            fillColor:   '#2563EB',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2.5,
          },
        });

        const geocoder = new G.Geocoder();

        mapRef.current      = map;
        markerRef.current   = marker;
        geocoderRef.current = geocoder;

        // Reverse geocode initial position
        reverseGeocode(center);

        // Click map → move marker
        map.addListener('click', (e: any) => {
          if (cancelled) return;
          const latlng = { lat: e.latLng.lat(), lng: e.latLng.lng() };
          marker.setPosition(latlng);
          map.panTo(latlng);
          reverseGeocode(latlng);
        });

        // Drag end
        marker.addListener('dragend', (e: any) => {
          if (cancelled) return;
          const latlng = { lat: e.latLng.lat(), lng: e.latLng.lng() };
          reverseGeocode(latlng);
        });

        setMapStatus('ready');
      } catch (err: any) {
        if (cancelled) return;
        if (err?.message === 'API_KEY_MISSING') {
          setLoadError('Google Maps API key тохируулаагүй байна.\n/src/app/utils/loadGoogleMaps.ts файлд GOOGLE_MAPS_API_KEY-г өөрчилнө үү.');
        } else {
          setLoadError(err?.message || 'Газрын зураг ачааллаж чадсангүй.');
        }
        setMapStatus('error');
      }
    }

    initMap();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, isOpen]);

  // ── "Миний бйршил" inside map modal ──────────────────────────────────────
  function handleGeolocateInsideMap() {
    if (!navigator.geolocation || !mapRef.current || !markerRef.current) return;
    setIsGeolocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latlng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        markerRef.current.setPosition(latlng);
        mapRef.current.panTo(latlng);
        mapRef.current.setZoom(16);
        reverseGeocode(latlng);
        setIsGeolocating(false);
      },
      () => { setIsGeolocating(false); },
      { timeout: 8_000 },
    );
  }

  // ── Confirm ────────────────────────────────────────────────────────────────
  function handleConfirm() {
    if (!pickedLatLng) return;
    onConfirm({
      lat:     pickedLatLng.lat,
      lng:     pickedLatLng.lng,
      address: currentAddress || `${pickedLatLng.lat.toFixed(5)}, ${pickedLatLng.lng.toFixed(5)}`,
    });
    onClose();
  }

  if (!mounted) return null;

  const isApiKeyMissing = GOOGLE_MAPS_API_KEY === 'YOUR_GOOGLE_MAPS_API_KEY';

  return (
    <div
      className="fixed inset-0 z-[160] flex items-end justify-center"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.22s ease' }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />

      {/* Sheet — 92 vh so it feels full-screen but still shows status bar */}
      <div
        className="relative w-full max-w-[375px] bg-white rounded-t-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{
          height:    '92vh',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.32s cubic-bezier(0.32,0.72,0,1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100 z-10">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-gray-900">Байршил сонгох</h3>
          </div>

          <div className="flex items-center gap-2">
            {/* Geolocate shortcut */}
            {mapStatus === 'ready' && (
              <button
                type="button"
                onClick={handleGeolocateInsideMap}
                disabled={isGeolocating}
                title="Миний байршил"
                className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-50 hover:bg-blue-100 active:opacity-70 transition-colors disabled:opacity-40"
              >
                <Navigation className={`w-3.5 h-3.5 text-blue-600 ${isGeolocating ? 'animate-pulse' : ''}`} />
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        {/* ── Map area ─────────────────────────────────────────────────────── */}
        <div className="flex-1 relative bg-gray-100 overflow-hidden">
          {/* The actual Google Map renders into this div */}
          <div ref={mapDivRef} className="absolute inset-0" />

          {/* Fixed crosshair hint — shown while map loads */}
          {mapStatus === 'ready' && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full pointer-events-none opacity-0">
              {/* invisible: marker already shows position; kept for future use */}
            </div>
          )}

          {/* Loading overlay */}
          {mapStatus === 'loading' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100 gap-3">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-sm text-gray-500">Газрын зураг ачааллаж байна…</p>
            </div>
          )}

          {/* Error overlay */}
          {mapStatus === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 gap-4 px-8 text-center">
              <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
                <AlertCircle className="w-7 h-7 text-red-400" />
              </div>
              {isApiKeyMissing ? (
                <>
                  <p className="text-sm font-semibold text-gray-700">API Key тохируулаагүй</p>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Google Maps ашиглахын тулд{' '}
                    <span className="font-mono bg-gray-100 px-1 rounded text-[10px]">
                      /src/app/utils/loadGoogleMaps.ts
                    </span>{' '}
                    дотор <strong>GOOGLE_MAPS_API_KEY</strong>-г бодит key-ээр солино уу.
                  </p>
                  <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-left w-full">
                    <p className="text-[11px] text-blue-700 font-semibold mb-1">Шаардлагатай APIууд:</p>
                    <ul className="text-[11px] text-blue-600 space-y-0.5">
                      <li>• Maps JavaScript API</li>
                      <li>• Geocoding API</li>
                    </ul>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-gray-700">Ачааллаж чадсангүй</p>
                  <p className="text-xs text-gray-500 leading-relaxed whitespace-pre-line">{loadError}</p>
                </>
              )}
            </div>
          )}

          {/* Tap-hint chip — show briefly when map is ready */}
          {mapStatus === 'ready' && !pickedLatLng && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[11px] font-medium px-3 py-1.5 rounded-full pointer-events-none backdrop-blur-sm">
              Газрын зурган дээр дарж байршил сонгоно уу
            </div>
          )}
        </div>

        {/* ─ Bottom strip — address + confirm ─────────────────────────────── */}
        <div className="shrink-0 bg-white border-t border-gray-100 px-4 pt-3 pb-5 space-y-3">

          {/* Address display pill */}
          <div className="flex items-start gap-2.5 bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-3 min-h-[54px]">
            {isGeocoding ? (
              <>
                <Loader2 className="w-4 h-4 text-gray-400 shrink-0 mt-0.5 animate-spin" />
                <p className="text-xs text-gray-400 animate-pulse">Хаяг тодорхойлж байна…</p>
              </>
            ) : pickedLatLng && currentAddress ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 leading-snug">{currentAddress}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5 font-mono">
                    {pickedLatLng.lat.toFixed(6)}, {pickedLatLng.lng.toFixed(6)}
                  </p>
                </div>
              </>
            ) : (
              <>
                <MapPin className="w-4 h-4 text-gray-300 shrink-0 mt-0.5" />
                <p className="text-xs text-gray-400">Байршил сонгоогүй байна</p>
              </>
            )}
          </div>

          {/* Confirm CTA */}
          <button
            onClick={handleConfirm}
            disabled={!pickedLatLng || isGeocoding || mapStatus !== 'ready'}
            className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800
                       disabled:bg-gray-200 disabled:text-gray-400
                       text-white text-sm font-semibold py-3.5 rounded-xl
                       transition-colors shadow-sm"
          >
            {isGeocoding ? 'Хаяг тодорхойлж байна…' : 'Байршлыг батлах'}
          </button>
        </div>
      </div>
    </div>
  );
}