import { useEffect, useState } from 'react';
import { X, Phone, MapPin } from 'lucide-react';

interface Branch {
  id: string;
  name: string;
  phone: string;
  mapsUrl: string;
}

const branches: Branch[] = [
  {
    id: '1',
    name: 'Төв салбар',
    phone: '+97699001122',
    mapsUrl: 'https://maps.google.com/?q=Ulaanbaatar+Central',
  },
  {
    id: '2',
    name: 'Баянзүрх салбар',
    phone: '+97699002233',
    mapsUrl: 'https://maps.google.com/?q=Ulaanbaatar+Bayanzurkh',
  },
  {
    id: '3',
    name: 'Сүхбаатар салбар',
    phone: '+97699003344',
    mapsUrl: 'https://maps.google.com/?q=Ulaanbaatar+Sukhbaatar',
  },
  {
    id: '4',
    name: 'Хан-Уул салбар',
    phone: '+97699004455',
    mapsUrl: 'https://maps.google.com/?q=Ulaanbaatar+Khan-Uul',
  },
  {
    id: '5',
    name: 'Чингэлтэй салбар',
    phone: '+97699005566',
    mapsUrl: 'https://maps.google.com/?q=Ulaanbaatar+Chingeltei',
  },
  {
    id: '6',
    name: 'Налайх салбар',
    phone: '+97699006677',
    mapsUrl: 'https://maps.google.com/?q=Ulaanbaatar+Nalaikh',
  },
];

interface BranchModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeName: string;
}

export function BranchModal({ isOpen, onClose, storeName }: BranchModalProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      // Tiny delay to trigger CSS transition
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
      const timer = setTimeout(() => setMounted(false), 350);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Lock body scroll when open
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
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="relative w-full max-w-[375px] bg-white rounded-t-2xl shadow-2xl transition-transform duration-350 ease-out"
        style={{
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-base font-medium text-gray-900">
            <span className="font-semibold">{storeName}</span> Салбарууд
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* Branch list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 pb-8">
          {branches.map((branch) => (
            <div
              key={branch.id}
              className="flex items-center justify-between bg-white rounded-xl px-4 py-3.5"
              style={{
                boxShadow: '0 1px 8px rgba(0,0,0,0.08)',
              }}
            >
              {/* Branch name */}
              <span className="text-sm font-medium text-gray-800 flex-1 pr-3">
                {branch.name}
              </span>

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                {/* Call button */}
                <a
                  href={`tel:${branch.phone}`}
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-blue-50 hover:bg-blue-100 transition-colors active:scale-95"
                  style={{ transform: 'scale(1)', transition: 'transform 0.1s, background-color 0.15s' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Phone className="w-4 h-4 text-blue-600" />
                </a>

                {/* Location button */}
                <a
                  href={branch.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-green-50 hover:bg-green-100 transition-colors active:scale-95"
                  style={{ transform: 'scale(1)', transition: 'transform 0.1s, background-color 0.15s' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <MapPin className="w-4 h-4 text-green-600" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}