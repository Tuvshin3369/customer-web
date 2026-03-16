import { useState, useEffect } from 'react';
import { X, MapPin, User, Car, Phone } from 'lucide-react';

interface Driver {
  id: number;
  location: string;
  driver: string;
  car: string;
  plate: string;
  phone: string;
}

const drivers: Driver[] = [
  {
    id: 1,
    location: 'Хан-Уул',
    driver: 'Бат-Эрдэнэ',
    car: 'Toyota Prius 30',
    plate: '99-11 УБА',
    phone: '+97699110001',
  },
  {
    id: 2,
    location: 'Баянзүрх',
    driver: 'Тэмүүлэн',
    car: 'Hyundai Porter II',
    plate: '88-22 УББ',
    phone: '+97688220002',
  },
  {
    id: 3,
    location: 'Сүхбаатар',
    driver: 'Ганзориг',
    car: 'Toyota Aqua',
    plate: '77-33 УБЦ',
    phone: '+97677330003',
  },
];

interface CarModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CarModal({ isOpen, onClose }: CarModalProps) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      // slight delay so the initial translateY(100%) is painted before transitioning
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

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-[140] flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        style={{
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.35s ease',
        }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="relative w-full max-w-[375px] bg-white rounded-t-2xl shadow-2xl flex flex-col"
        style={{
          maxHeight: '88vh',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.38s cubic-bezier(0.32,0.72,0,1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-3 pb-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
              <Car className="w-4 h-4 text-blue-600" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">Ачаа ачна ({drivers.length})</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
            aria-label="Хаах"
          >
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-gray-100 shrink-0 mx-5" />

        {/* Driver cards */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3 pb-6">
          {drivers.map((d) => (
            <div
              key={d.id}
              className="bg-white border border-gray-200 rounded-xl p-4 space-y-2.5 shadow-sm"
            >
              {/* Location */}
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                  <MapPin className="w-3.5 h-3.5 text-red-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-gray-400 leading-none mb-0.5">Байршил</p>
                  <p className="text-sm text-gray-800 font-medium leading-tight">{d.location}</p>
                </div>
              </div>

              {/* Driver */}
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <User className="w-3.5 h-3.5 text-blue-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-gray-400 leading-none mb-0.5">Жолооч</p>
                  <p className="text-sm text-gray-800 font-medium leading-tight">{d.driver}</p>
                </div>
              </div>

              {/* Car */}
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                  <Car className="w-3.5 h-3.5 text-green-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-gray-400 leading-none mb-0.5">Машин</p>
                  <p className="text-sm text-gray-800 font-medium leading-tight">
                    {d.car}{' '}
                    <span className="text-gray-500 font-normal">({d.plate})</span>
                  </p>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-gray-100" />

              {/* Call button */}
              <a
                href={`tel:${d.phone}`}
                className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg transition-colors"
                style={{ minHeight: '44px' }}
              >
                <Phone className="w-4 h-4 shrink-0" />
                <span className="text-sm font-medium">Залгах {d.phone.replace('+976', '')}</span>
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}