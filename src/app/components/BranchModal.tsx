import { useCallback, useEffect, useState } from 'react';
import { X, Phone, MapPin } from 'lucide-react';

interface BranchRow {
  id: string;
  address: string;
  phone_1: string | null;
  address_lat: number | null;
  address_lng: number | null;
}

interface BranchModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeName: string;
  /** Сонгосон дэлгүүрийн id — branches.store_id-аар шүүх */
  storeId: string | null;
}

function telHref(phone: string | null | undefined): string {
  if (!phone?.trim()) return '#';
  const d = phone.replace(/\D/g, '');
  return d ? `tel:${d}` : '#';
}

function mapsUrl(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null) return null;
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${la},${ln}`;
}

async function parseJsonSafely(res: Response) {
  const raw = await res.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`HTTP ${res.status}`);
  }
}

export function BranchModal({ isOpen, onClose, storeName, storeId }: BranchModalProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const fetchBranches = useCallback(async () => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!supabaseUrl || !supabaseAnonKey || !storeId) {
      setBranches([]);
      if (!storeId) setFetchError('');
      else setFetchError('Supabase тохиргоо дутуу байна.');
      return;
    }

    setIsLoading(true);
    setFetchError('');
    try {
      const query = new URLSearchParams({
        select: 'id,address,phone_1,address_lat,address_lng',
        store_id: `eq.${storeId}`,
        order: 'id.asc',
      });
      const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/branches?${query.toString()}`, {
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
          Accept: 'application/json',
        },
      });
      const json = await parseJsonSafely(res);
      if (!res.ok) {
        throw new Error((json as { message?: string } | null)?.message || `HTTP ${res.status}`);
      }
      if (!Array.isArray(json)) {
        setBranches([]);
        return;
      }
      const mapped: BranchRow[] = json.map((row: Record<string, unknown>) => {
        const latRaw = row.address_lat;
        const lngRaw = row.address_lng;
        return {
          id: row.id != null ? String(row.id) : '',
          address: typeof row.address === 'string' ? row.address : String(row.address ?? ''),
          phone_1: typeof row.phone_1 === 'string' && row.phone_1.trim() ? row.phone_1.trim() : null,
          address_lat: latRaw != null && latRaw !== '' ? Number(latRaw) : null,
          address_lng: lngRaw != null && lngRaw !== '' ? Number(lngRaw) : null,
        };
      }).filter((r) => r.id.length > 0);
      setBranches(mapped);
    } catch (err: unknown) {
      console.error('fetchBranches error:', err);
      setBranches([]);
      setFetchError(err instanceof Error ? err.message : 'Салбарын мэдээлэл ачааллаж чадсангүй');
    } finally {
      setIsLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
      const timer = setTimeout(() => setMounted(false), 350);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    fetchBranches();
  }, [isOpen, fetchBranches]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={onClose}
      />

      <div
        className="relative w-full max-w-[375px] bg-white rounded-t-2xl shadow-2xl transition-transform duration-350 ease-out"
        style={{
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-base font-medium text-gray-900">
            <span className="font-semibold">{storeName}</span> Салбарууд
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
            aria-label="Хаах"
          >
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 pb-8">
          {!storeId && (
            <p className="text-sm text-gray-500 text-center py-6">Эхлээд дэлгүүр сонгоно уу.</p>
          )}

          {storeId && isLoading && (
            <p className="text-sm text-blue-600 text-center py-6">Ачааллаж байна...</p>
          )}

          {storeId && !isLoading && fetchError && (
            <div className="space-y-2 text-center py-4">
              <p className="text-sm text-red-600">{fetchError}</p>
              <button
                type="button"
                onClick={fetchBranches}
                className="text-sm font-medium text-blue-600 underline"
              >
                Дахин оролдох
              </button>
            </div>
          )}

          {storeId && !isLoading && !fetchError && branches.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-6">Салбар бүртгэгдээгүй байна.</p>
          )}

          {branches.map((branch) => {
            const map = mapsUrl(branch.address_lat, branch.address_lng);
            const canCall = telHref(branch.phone_1) !== '#';

            return (
              <div
                key={branch.id}
                className="flex items-center justify-between bg-white rounded-xl px-4 py-3.5"
                style={{ boxShadow: '0 1px 8px rgba(0,0,0,0.08)' }}
              >
                <span className="text-sm font-medium text-gray-800 flex-1 pr-3 leading-snug">
                  {branch.address || '—'}
                </span>

                <div className="flex items-center gap-2 shrink-0">
                  {canCall ? (
                    <a
                      href={telHref(branch.phone_1)}
                      className="w-9 h-9 flex items-center justify-center rounded-full bg-blue-50 hover:bg-blue-100 transition-colors active:scale-95"
                      style={{ transform: 'scale(1)', transition: 'transform 0.1s, background-color 0.15s' }}
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Залгах"
                    >
                      <Phone className="w-4 h-4 text-blue-600" />
                    </a>
                  ) : (
                    <span
                      className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-300"
                      aria-hidden
                    >
                      <Phone className="w-4 h-4" />
                    </span>
                  )}

                  {map ? (
                    <a
                      href={map}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-9 h-9 flex items-center justify-center rounded-full bg-green-50 hover:bg-green-100 transition-colors active:scale-95"
                      style={{ transform: 'scale(1)', transition: 'transform 0.1s, background-color 0.15s' }}
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Газрын зураг"
                    >
                      <MapPin className="w-4 h-4 text-green-600" />
                    </a>
                  ) : (
                    <span
                      className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-300"
                      aria-hidden
                    >
                      <MapPin className="w-4 h-4" />
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
