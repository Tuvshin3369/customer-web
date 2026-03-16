import { useState } from 'react';
import { X, Users, ArrowRight } from 'lucide-react';
import { mockJobCategories } from '../../data/jobs';
import { mockWorkers } from '../../data/workers';
import { WorkerViewer } from './WorkerViewer';

interface JobsPageProps {
  isOpen: boolean;
  onClose: () => void;
}

export function JobsPage({ isOpen, onClose }: JobsPageProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [showWorkers, setShowWorkers] = useState(false);

  if (!isOpen) return null;

  const handleCategorySelect = (categoryId: number) => {
    // Only allow one category to be selected
    if (selectedCategoryId === categoryId) {
      setSelectedCategoryId(null);
    } else {
      setSelectedCategoryId(categoryId);
    }
  };

  const handleViewWorkers = () => {
    if (selectedCategoryId !== null) {
      setShowWorkers(true);
    }
  };

  const handleCloseWorkers = () => {
    setShowWorkers(false);
  };

  const handleClose = () => {
    setSelectedCategoryId(null);
    setShowWorkers(false);
    onClose();
  };

  // Get workers for selected category
  const workersForCategory = selectedCategoryId
    ? mockWorkers.filter((w) => w.categoryId === selectedCategoryId)
    : [];

  return (
    <>
      <div className="fixed inset-0 bg-white z-50 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10">
          <h1 className="text-lg font-semibold text-gray-900">Ажил</h1>
          <button
            onClick={handleClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 pb-24 max-w-4xl mx-auto">
          {/* Description */}
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-gray-700">
              "Ажил" хэсэгт хэрэглэгчид өөрсдийн мэдээллийг байршуулдаг. 
              Энд байршуулсан мэдээлэл болон үйлчилгээнд сайтын зүгээс хариуцлага хүлээхгүй.
            </p>
          </div>

          {/* Job Categories Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {mockJobCategories.map((category) => {
              const isSelected = selectedCategoryId === category.id;
              return (
                <button
                  key={category.id}
                  onClick={() => handleCategorySelect(category.id)}
                  className={`relative p-5 rounded-xl border-2 transition-all text-left ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50 shadow-md'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">
                        {category.name}
                      </h3>
                      <div className="flex items-center gap-1.5 text-sm text-gray-600">
                        <Users className="w-4 h-4" />
                        <span>{category.count} ажилтан</span>
                      </div>
                    </div>
                    {/* Selection indicator */}
                    <div
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                        isSelected
                          ? 'border-blue-600 bg-blue-600'
                          : 'border-gray-300 bg-white'
                      }`}
                    >
                      {isSelected && (
                        <div className="w-3 h-3 bg-white rounded-full"></div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* View Workers Button */}
          <div className="fixed bottom-20 md:bottom-6 left-0 right-0 px-4 max-w-4xl mx-auto">
            <button
              onClick={handleViewWorkers}
              disabled={selectedCategoryId === null}
              className={`w-full py-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-all ${
                selectedCategoryId === null
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 shadow-lg'
              }`}
            >
              Ажилтнуудыг харах
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Worker Viewer Modal */}
      <WorkerViewer
        workers={workersForCategory}
        isOpen={showWorkers}
        onClose={handleCloseWorkers}
      />
    </>
  );
}