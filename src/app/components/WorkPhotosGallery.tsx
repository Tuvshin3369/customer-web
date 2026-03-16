import { useState } from 'react';

interface WorkPhotosGalleryProps {
  photos: string[];
}

export function WorkPhotosGallery({ photos }: WorkPhotosGalleryProps) {
  if (photos.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-gray-700">Ажлын зургууд</h3>
      <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide">
        {photos.map((photo, idx) => (
          <div
            key={idx}
            className="flex-shrink-0 w-40 h-40 snap-start rounded-lg overflow-hidden bg-gray-100"
          >
            <img
              src={photo}
              alt={`Ажлын зураг ${idx + 1}`}
              className="w-full h-full object-cover"
            />
          </div>
        ))}
      </div>
      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
