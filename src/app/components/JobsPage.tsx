import { useState, useEffect } from 'react';
import { X, Users, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import {
  fetchJobCategoriesWithWorkerCounts,
  fetchPublicWorkersByJobId,
  type PublicAnketWorker,
} from '../lib/anketApi';
import { WorkerViewer } from './WorkerViewer';

interface JobsPageProps {
  isOpen: boolean;
  onClose: () => void;
}

export function JobsPage({ isOpen, onClose }: JobsPageProps) {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showWorkers, setShowWorkers] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string; count: number }[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);
  const [viewWorkers, setViewWorkers] = useState<PublicAnketWorker[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setListLoading(true);
    setListError(null);
    setSelectedJobId(null);
    setShowWorkers(false);
    setViewWorkers([]);
    setViewError(null);

    (async () => {
      try {
        const rows = await fetchJobCategoriesWithWorkerCounts();
        if (!cancelled) setCategories(rows);
      } catch (e: unknown) {
        if (!cancelled) {
          setListError(e instanceof Error ? e.message : 'Ачаалахад алдаа гарлаа.');
        }
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleJobSelect = (jobId: string) => {
    setSelectedJobId((prev) => (prev === jobId ? null : jobId));
  };

  const handleViewWorkers = () => {
    if (selectedJobId === null) return;
    setViewError(null);
    setViewLoading(true);
    void (async () => {
      try {
        const list = await fetchPublicWorkersByJobId(selectedJobId);
        setViewWorkers(list);
        setShowWorkers(true);
      } catch (e: unknown) {
        setViewError(e instanceof Error ? e.message : 'Ачаалахад алдаа гарлаа.');
      } finally {
        setViewLoading(false);
      }
    })();
  };

  const handleCloseWorkers = () => {
    setShowWorkers(false);
    setViewWorkers([]);
    setViewError(null);
  };

  const handleClose = () => {
    setSelectedJobId(null);
    setShowWorkers(false);
    setViewWorkers([]);
    setViewError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-white z-50 overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10">
          <h1 className="text-lg font-semibold text-gray-900">Ажил</h1>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Хаах"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="p-4 pb-24 max-w-4xl mx-auto">
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-gray-700">
              &quot;Ажил&quot; хэсэгт хэрэглэгчид өөрсдийн мэдээллийг байршуулдаг. Энд байршуулсан
              мэдээлэл болон үйлчилгээнд сайтын зүгээс хариуцлага хүлээхгүй.
            </p>
          </div>

          {listError && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-4">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{listError}</span>
            </div>
          )}

          {viewError && !showWorkers && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 mb-4">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{viewError}</span>
            </div>
          )}

          {listLoading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-500">
              <Loader2 className="w-9 h-9 animate-spin" />
              <p className="text-sm">Ачаалж байна…</p>
            </div>
          )}

          {!listLoading && !listError && categories.length === 0 && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              Ажлын төрөл (<code className="text-xs">jobs</code>) хоосон байна. Админ хүснэгтэд мөр
              нэмнэ үү.
            </p>
          )}

          {!listLoading && categories.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {categories.map((category) => {
                const isSelected = selectedJobId === category.id;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => handleJobSelect(category.id)}
                    className={`relative p-5 rounded-xl border-2 transition-all text-left ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50 shadow-md'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900 mb-1">{category.name}</h3>
                        <div className="flex items-center gap-1.5 text-sm text-gray-600">
                          <Users className="w-4 h-4" />
                          <span>{category.count} анкет</span>
                        </div>
                      </div>
                      <div
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                          isSelected ? 'border-blue-600 bg-blue-600' : 'border-gray-300 bg-white'
                        }`}
                      >
                        {isSelected && <div className="w-3 h-3 bg-white rounded-full" />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="fixed bottom-20 md:bottom-6 left-0 right-0 px-4 max-w-4xl mx-auto">
            <button
              type="button"
              onClick={handleViewWorkers}
              disabled={selectedJobId === null || viewLoading}
              className={`w-full py-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-all ${
                selectedJobId === null || viewLoading
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 shadow-lg'
              }`}
            >
              {viewLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Ачаалж байна…
                </>
              ) : (
                <>
                  Ажилтнуудыг харах
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <WorkerViewer workers={viewWorkers} isOpen={showWorkers} onClose={handleCloseWorkers} />
    </>
  );
}
