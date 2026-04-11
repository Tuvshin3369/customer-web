import { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Phone, User } from 'lucide-react';
import type { PublicAnketWorker } from '../lib/anketApi';
import { WorkPhotosGallery } from './WorkPhotosGallery';

interface WorkerViewerProps {
  workers: PublicAnketWorker[];
  isOpen: boolean;
  onClose: () => void;
}

export function WorkerViewer({ workers, isOpen, onClose }: WorkerViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (isOpen) setCurrentIndex(0);
  }, [isOpen, workers]);

  if (!isOpen) return null;

  if (workers.length === 0) {
    return (
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-end md:items-center justify-center"
        onClick={onClose}
      >
        <div
          className="bg-white w-full md:max-w-lg md:mx-4 rounded-t-2xl md:rounded-2xl shadow-2xl p-6 relative"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Ажил хийнэ</h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Хаах"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>
          <p className="text-sm text-gray-600 text-center py-8">
            Энэ ажлын төрлөөр бүртгэлтэй хүн одоогоор алга.
          </p>
        </div>
      </div>
    );
  }

  const currentWorker = workers[currentIndex];
  const totalPages = workers.length;

  const goToNext = () => {
    if (currentIndex < workers.length - 1) setCurrentIndex(currentIndex + 1);
  };

  const goToPrev = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };

  const handleCall = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    if (digits) window.location.href = `tel:${digits}`;
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-end md:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white w-full md:max-w-lg md:mx-4 rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-gray-900">Ажил хийнэ</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-600">
              {currentIndex + 1}/{totalPages}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Хаах"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex justify-center">
            <div className="w-32 h-32 rounded-full overflow-hidden bg-gray-200 ring-4 ring-blue-100 flex items-center justify-center">
              {currentWorker.profileImage ? (
                <img
                  src={currentWorker.profileImage}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-14 h-14 text-gray-400" aria-hidden />
              )}
            </div>
          </div>

          <div className="text-center">
            <h3 className="text-2xl font-bold text-gray-900">
              {currentWorker.name || 'Нэргүй'}
            </h3>
          </div>

          {currentWorker.jobNames.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2">
              {currentWorker.jobNames.map((catName) => (
                <span
                  key={catName}
                  className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full"
                >
                  {catName}
                </span>
              ))}
            </div>
          )}

          <div className="pt-2 w-full flex justify-center">
            {currentWorker.phone.trim() ? (
              <button
                type="button"
                onClick={() => handleCall(currentWorker.phone)}
                className="inline-flex w-max max-w-full items-center justify-center gap-3 bg-green-600 hover:bg-green-700 text-white px-6 py-3.5 rounded-xl transition-colors font-semibold text-base shadow-sm"
              >
                <Phone className="w-5 h-5 shrink-0" aria-hidden />
                <span className="tabular-nums tracking-wide whitespace-nowrap">{currentWorker.phone}</span>
                <span className="opacity-95 whitespace-nowrap">Залгах</span>
              </button>
            ) : (
              <div className="inline-flex w-max max-w-full items-center justify-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-6 py-3.5 text-gray-500 font-medium">
                <Phone className="w-5 h-5 shrink-0 opacity-50" aria-hidden />
                <span>—</span>
              </div>
            )}
          </div>

          {currentWorker.workExperience.trim() ? (
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                {currentWorker.workExperience}
              </p>
            </div>
          ) : null}

          <WorkPhotosGallery photos={currentWorker.workPhotoUrls} />
        </div>

        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 flex justify-between px-2 pointer-events-none">
          <button
            type="button"
            onClick={goToPrev}
            disabled={currentIndex === 0}
            className={`pointer-events-auto p-2 rounded-full bg-white shadow-lg border border-gray-200 transition-all ${
              currentIndex === 0
                ? 'opacity-40 cursor-not-allowed'
                : 'hover:bg-gray-50 hover:scale-110'
            }`}
            aria-label="Өмнөх"
          >
            <ChevronLeft className="w-6 h-6 text-gray-700" />
          </button>
          <button
            type="button"
            onClick={goToNext}
            disabled={currentIndex === workers.length - 1}
            className={`pointer-events-auto p-2 rounded-full bg-white shadow-lg border border-gray-200 transition-all ${
              currentIndex === workers.length - 1
                ? 'opacity-40 cursor-not-allowed'
                : 'hover:bg-gray-50 hover:scale-110'
            }`}
            aria-label="Дараах"
          >
            <ChevronRight className="w-6 h-6 text-gray-700" />
          </button>
        </div>

        <div className="flex justify-center gap-2 pb-6 px-6">
          {workers.map((w, idx) => (
            <button
              key={w.id}
              type="button"
              onClick={() => setCurrentIndex(idx)}
              className={`h-2 rounded-full transition-all ${
                idx === currentIndex ? 'w-8 bg-blue-600' : 'w-2 bg-gray-300'
              }`}
              aria-label={`Карт ${idx + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
