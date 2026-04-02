import { useState, useEffect } from 'react';
import { X, MapPin, User, Car, Phone } from 'lucide-react';

interface VehicleRow {
  id: string | number;
  location: string;
  driver_name: string;
  vehicle_type: string;
  phone: string;
}

interface CarModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatTelHref(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '#';
  return `tel:${digits}`;
}

function formatPhoneLabel(phone: string): string {
  const t = phone.trim();
  if (t.startsWith('+976')) return t.slice(4);
  return t;
}

export function CarModal({ isOpen, onClose }: CarModalProps) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');

  async function parseJsonSafely(res: Response) {
    const raw = await res.text();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(`HTTP ${res.status}`);
    }
  }

  async function fetchVehicles() {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!supabaseUrl || !supabaseAnonKey) {
      setVehicles([]);
      setFetchError('Supabase тохиргоо дутуу байна (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).');
      return;
    }

    setIsLoading(true);
    setFetchError('');
    try {
      const query = new URLSearchParams({
        select: 'id,location,driver_name,vehicle_type,phone',
        is_active: 'eq.true',
        order: 'id.asc',
      });
      const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/vehicles?${query.toString()}`, {
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
        setVehicles([]);
        return;
      }
      setVehicles(
        json.map((row: Record<string, unknown>, index: number) => ({
          id: row.id != null ? String(row.id) : index,
          location: String(row.location ?? ''),
          driver_name: String(row.driver_name ?? ''),
          vehicle_type: String(row.vehicle_type ?? ''),
          phone: String(row.phone ?? ''),
        })),
      );
    } catch (err: unknown) {
      console.error('fetchVehicles error:', err);
      setVehicles([]);
      setFetchError(err instanceof Error ? err.message : 'Машины мэдээлэл ачааллаж чадсангүй');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      const t = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      return () => cancelAnimationFrame(t);
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 400);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    fetchVehicles();
  }, [isOpen]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-[140] flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        style={{
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.35s ease',
        }}
        onClick={onClose}
      />

      <div
        className="relative w-full max-w-[375px] bg-white rounded-t-2xl shadow-2xl flex flex-col"
        style={{
          maxHeight: '88vh',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.38s cubic-bezier(0.32,0.72,0,1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        <div className="flex items-center justify-between px-5 pt-3 pb-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
              <Car className="w-4 h-4 text-blue-600" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">Ачаа ачна ({vehicles.length})</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
            aria-label="Хаах"
          >
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        <div className="h-px bg-gray-100 shrink-0 mx-5" />

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3 pb-6">
          {isLoading && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
              Машины мэдээлэл ачааллаж байна...
            </div>
          )}

          {!isLoading && fetchError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-2">
              <p className="text-sm text-red-600">{fetchError}</p>
              <button
                type="button"
                onClick={fetchVehicles}
                className="text-xs font-semibold text-red-600 hover:text-red-700 underline"
              >
                Дахин оролдох
              </button>
            </div>
          )}

          {!isLoading && !fetchError && vehicles.length === 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-600">
              Идэвхтэй машин алга байна.
            </div>
          )}

          {vehicles.map((d) => (
            <div
              key={d.id}
              className="bg-white border border-gray-200 rounded-xl p-4 space-y-2.5 shadow-sm"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                  <MapPin className="w-3.5 h-3.5 text-red-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-gray-400 leading-none mb-0.5">Байршил</p>
                  <p className="text-sm text-gray-800 font-medium leading-tight">{d.location}</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <User className="w-3.5 h-3.5 text-blue-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-gray-400 leading-none mb-0.5">Жолооч</p>
                  <p className="text-sm text-gray-800 font-medium leading-tight">{d.driver_name}</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                  <Car className="w-3.5 h-3.5 text-green-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-gray-400 leading-none mb-0.5">Машин</p>
                  <p className="text-sm text-gray-800 font-medium leading-tight">{d.vehicle_type}</p>
                </div>
              </div>

              <div className="h-px bg-gray-100" />

              <a
                href={formatTelHref(d.phone)}
                className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg transition-colors"
                style={{ minHeight: '44px' }}
              >
                <Phone className="w-4 h-4 shrink-0" />
                <span className="text-sm font-medium">Залгах {formatPhoneLabel(d.phone)}</span>
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
