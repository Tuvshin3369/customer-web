interface WorkPhotosGalleryProps {
  photos: string[];
}

export function WorkPhotosGallery({ photos }: WorkPhotosGalleryProps) {
  if (photos.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-gray-700">Ажлын зургууд</h3>
      <div className="flex flex-col gap-4">
        {photos.map((photo, idx) => (
          <figure
            key={`${idx}-${photo.slice(0, 48)}`}
            className="w-full rounded-lg overflow-hidden bg-gray-100"
          >
            <img
              src={photo}
              alt={`Ажлын зураг ${idx + 1}`}
              className="block w-full h-auto max-w-full object-contain object-center"
              loading={idx > 0 ? 'lazy' : undefined}
            />
          </figure>
        ))}
      </div>
    </div>
  );
}
