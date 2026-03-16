import { useState } from 'react';
import { X, ChevronLeft, ChevronRight, Phone, Star } from 'lucide-react';
import { Worker } from '../../data/workers';
import { mockJobCategories } from '../../data/jobs';
import { WorkPhotosGallery } from './WorkPhotosGallery';

interface WorkerViewerProps {
  workers: Worker[];
  isOpen: boolean;
  onClose: () => void;
}

export function WorkerViewer({ workers, isOpen, onClose }: WorkerViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!isOpen || workers.length === 0) return null;

  const currentWorker = workers[currentIndex];
  const totalPages = workers.length;

  const goToNext = () => {
    if (currentIndex < workers.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const goToPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleCall = (phone: string) => {
    window.location.href = `tel:${phone}`;
  };

  // Get category names for badges
  const categoryNames = currentWorker.categoryIds
    .map(id => mockJobCategories.find(cat => cat.id === id)?.name)
    .filter(Boolean)
    .slice(0, 3);

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-end md:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white w-full md:max-w-lg md:mx-4 rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-gray-900">Ажил хийнэ</h2>
          <div className="flex items-center gap-3">
            {/* Page indicator */}
            <span className="text-sm font-medium text-gray-600">
              {currentIndex + 1}/{totalPages}
            </span>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Worker Card Content */}
        <div className="p-6 space-y-4">
          {/* Profile Image */}
          <div className="flex justify-center">
            <div className="w-32 h-32 rounded-full overflow-hidden bg-gray-200 ring-4 ring-blue-100">
              <img
                src={currentWorker.image}
                alt={currentWorker.name}
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Name */}
          <div className="text-center">
            <h3 className="text-2xl font-bold text-gray-900">{currentWorker.name}</h3>
          </div>

          {/* Rating and Completed Jobs */}
          <div className="flex items-center justify-center gap-2 text-gray-700">
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <span className="font-semibold">{currentWorker.rating.toFixed(1)}</span>
            </div>
            <span className="text-gray-400">•</span>
            <span className="text-sm">{currentWorker.completedJobs} ажил</span>
          </div>

          {/* Category Badges */}
          <div className="flex flex-wrap justify-center gap-2">
            {categoryNames.map((catName, idx) => (
              <span
                key={idx}
                className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full"
              >
                {catName}
              </span>
            ))}
          </div>

          {/* Phone with Call Button */}
          <div className="flex items-center justify-center gap-3 pt-2">
            <span className="text-lg font-medium text-gray-700">{currentWorker.phone}</span>
            <button
              onClick={() => handleCall(currentWorker.phone)}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors font-medium"
            >
              <Phone className="w-4 h-4" />
              Залгах
            </button>
          </div>

          {/* Description */}
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-gray-700 leading-relaxed">{currentWorker.description}</p>
          </div>

          {/* Work Photos Gallery */}
          <WorkPhotosGallery photos={currentWorker.photos} />
        </div>

        {/* Navigation Buttons - Positioned at card edges, vertically centered */}
        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 flex justify-between px-2 pointer-events-none">
          <button
            onClick={goToPrev}
            disabled={currentIndex === 0}
            className={`pointer-events-auto p-2 rounded-full bg-white shadow-lg border border-gray-200 transition-all ${
              currentIndex === 0
                ? 'opacity-40 cursor-not-allowed'
                : 'hover:bg-gray-50 hover:scale-110'
            }`}
          >
            <ChevronLeft className="w-6 h-6 text-gray-700" />
          </button>
          <button
            onClick={goToNext}
            disabled={currentIndex === workers.length - 1}
            className={`pointer-events-auto p-2 rounded-full bg-white shadow-lg border border-gray-200 transition-all ${
              currentIndex === workers.length - 1
                ? 'opacity-40 cursor-not-allowed'
                : 'hover:bg-gray-50 hover:scale-110'
            }`}
          >
            <ChevronRight className="w-6 h-6 text-gray-700" />
          </button>
        </div>

        {/* Navigation Dots - Mobile */}
        <div className="flex justify-center gap-2 pb-6 px-6">
          {workers.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={`h-2 rounded-full transition-all ${
                idx === currentIndex ? 'w-8 bg-blue-600' : 'w-2 bg-gray-300'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}