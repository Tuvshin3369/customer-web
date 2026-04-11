import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { X, Upload, Trash2, Camera, AlertCircle, Loader2, Check } from 'lucide-react';
import {
  fetchCustomerIdForAnket,
  fetchJobsForAnket,
  fetchAnketByCustomerId,
  saveAnketWithImageUploads,
  deleteAnketByCustomerId,
  type JobListItem,
  type AnketRecord,
  type AnketSavePayload,
} from '../lib/anketApi';

interface ApplicationPageProps {
  isOpen:           boolean;
  onClose:          () => void;
  customerPhone:    number | null;
  customerGoogleId: string | null;
}

interface AnketFormState {
  profileImage:   string | null;
  name:           string;
  phone:          string;
  jobIds:         string[];
  workExperience: string;
  workPhotos:     string[];
}

function emptyForm(): AnketFormState {
  return {
    profileImage:   null,
    name:           '',
    phone:          '',
    jobIds:         [],
    workExperience: '',
    workPhotos:     [],
  };
}

function recordToForm(r: AnketRecord): AnketFormState {
  return {
    profileImage:   r.profile_image,
    name:           r.name ?? '',
    phone:          r.phone ?? '',
    jobIds:         [...r.job_ids],
    workExperience: r.work_experience ?? '',
    workPhotos:     [...r.workImageUrls],
  };
}

function sameStringArray(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function formToPayload(form: AnketFormState): AnketSavePayload {
  return {
    profile_image:   form.profileImage,
    name:            form.name,
    phone:           form.phone,
    job_ids:         form.jobIds.slice(0, 3),
    work_experience: form.workExperience,
    images:          form.workPhotos.map((url) => ({ image_url: url })),
  };
}

export function ApplicationPage({
  isOpen,
  onClose,
  customerPhone,
  customerGoogleId,
}: ApplicationPageProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [anketRowId, setAnketRowId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [hasExistingRow, setHasExistingRow] = useState(false);

  const [form, setForm] = useState<AnketFormState>(emptyForm);
  const [baseline, setBaseline] = useState<AnketFormState | null>(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const profileImageInputRef = useRef<HTMLInputElement>(null);
  const workPhotosInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    setShowSaved(false);
    setCustomerId(null);
    setAnketRowId(null);
    setBaseline(null);
    setForm(emptyForm());
    setJobs([]);
    setHasExistingRow(false);

    (async () => {
      try {
        const cid = await fetchCustomerIdForAnket({
          phone:    customerPhone,
          googleId: customerGoogleId,
        });
        if (cancelled) return;
        if (!cid) {
          setLoadError('Хэрэглэгчийн мэдээлэл олдсонгүй. Дахин нэвтэрнэ үү.');
          return;
        }
        setCustomerId(cid);

        const [jobsList, anket] = await Promise.all([
          fetchJobsForAnket(),
          fetchAnketByCustomerId(cid),
        ]);
        if (cancelled) return;

        setJobs(jobsList);

        if (anket) {
          const f = recordToForm(anket);
          setForm(f);
          setBaseline(f);
          setAnketRowId(anket.id || null);
          setHasExistingRow(true);
        } else {
          const empty = emptyForm();
          setForm(empty);
          setBaseline(empty);
          setAnketRowId(null);
          setHasExistingRow(false);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Ачаалахад алдаа гарлаа.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isOpen, customerPhone, customerGoogleId]);

  const dirty = useMemo(() => {
    if (baseline === null || loading) return false;
    if ((form.profileImage ?? '') !== (baseline.profileImage ?? '')) return true;
    if (form.name.trim() !== baseline.name.trim()) return true;
    if (form.phone.trim() !== baseline.phone.trim()) return true;
    if (!sameStringArray(form.jobIds, baseline.jobIds)) return true;
    if (form.workExperience.trim() !== baseline.workExperience.trim()) return true;
    if (!sameStringArray(form.workPhotos, baseline.workPhotos)) return true;
    return false;
  }, [form, baseline, loading]);

  const canSave =
    dirty &&
    !saving &&
    !loading &&
    !loadError &&
    customerId != null &&
    baseline !== null;

  const handleJobToggle = useCallback((jobId: string) => {
    setForm((prev) => {
      const isSelected = prev.jobIds.includes(jobId);
      if (isSelected) {
        return { ...prev, jobIds: prev.jobIds.filter((id) => id !== jobId) };
      }
      if (prev.jobIds.length >= 3) return prev;
      return { ...prev, jobIds: [...prev.jobIds, jobId] };
    });
    setSaveError(null);
  }, []);

  const handleProfileImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setForm((prev) => ({ ...prev, profileImage: reader.result as string }));
        setSaveError(null);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleWorkPhotosChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remaining = 10 - form.workPhotos.length;
    const filesToAdd = files.slice(0, remaining);

    filesToAdd.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setForm((prev) => ({
          ...prev,
          workPhotos: [...prev.workPhotos, reader.result as string],
        }));
        setSaveError(null);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleDeleteProfileImage = () => {
    setForm((prev) => ({ ...prev, profileImage: null }));
    setSaveError(null);
  };

  const handleDeleteWorkPhoto = (index: number) => {
    setForm((prev) => ({
      ...prev,
      workPhotos: prev.workPhotos.filter((_, i) => i !== index),
    }));
    setSaveError(null);
  };

  const handleReplaceWorkPhoto = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setForm((prev) => ({
          ...prev,
          workPhotos: prev.workPhotos.map((photo, i) =>
            i === index ? (reader.result as string) : photo,
          ),
        }));
        setSaveError(null);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  async function handleSave() {
    if (!canSave || !customerId || baseline === null) return;

    if (!form.profileImage?.trim()) {
      setSaveError('Өөрийн зураг оруулна уу.');
      return;
    }
    if (!form.name.trim()) {
      setSaveError('Нэрээ оруулна уу.');
      return;
    }
    if (!form.phone.trim()) {
      setSaveError('Утасны дугаараа оруулна уу.');
      return;
    }
    if (form.jobIds.length === 0) {
      setSaveError('Хамгийн багадаа нэг ажлын төрөл сонгоно уу.');
      return;
    }
    if (!form.workExperience.trim()) {
      setSaveError('Ажлын тайлбараа оруулна уу.');
      return;
    }

    setSaveError(null);
    setSaving(true);
    try {
      const payload = formToPayload(form);
      const { anketId, profileUrl, workUrls } = await saveAnketWithImageUploads({
        customerId,
        existingAnketId: hasExistingRow ? anketRowId : null,
        payload,
      });
      setAnketRowId(anketId);
      setHasExistingRow(true);
      const next: AnketFormState = {
        ...form,
        profileImage: profileUrl,
        workPhotos:   workUrls,
      };
      setForm(next);
      setBaseline(next);
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Хадгалахад алдаа гарлаа.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProfile() {
    if (!customerId) return;
    setSaving(true);
    setSaveError(null);
    try {
      await deleteAnketByCustomerId(customerId);
      const empty = emptyForm();
      setForm(empty);
      setBaseline(empty);
      setAnketRowId(null);
      setHasExistingRow(false);
      setShowDeleteConfirm(false);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Устгахад алдаа гарлаа.');
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-white z-50 overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10">
          <h1 className="text-lg font-semibold text-gray-900">Анкет</h1>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Хаах"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {showSaved && (
          <div
            className="sticky top-[53px] z-[5] flex justify-center px-4 py-2 pointer-events-none"
            aria-live="polite"
          >
            <div className="flex items-center gap-2 bg-gray-900/90 text-white text-xs px-4 py-2 rounded-full shadow-lg">
              <Check className="w-3.5 h-3.5 text-green-400 shrink-0" />
              Амжилттай хадгалагдлаа
            </div>
          </div>
        )}

        <div className="p-4 pb-32 max-w-2xl mx-auto space-y-6">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-500">
              <Loader2 className="w-9 h-9 animate-spin" />
              <p className="text-sm">Ачаалж байна…</p>
            </div>
          )}

          {loadError && !loading && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{loadError}</span>
            </div>
          )}

          {saveError && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{saveError}</span>
            </div>
          )}

          {!loading && !loadError && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-gray-700">
                  Өөрийн ажлын анкетыг бөглөөд ажил хайгчидтай холбогдоорой. Таны мэдээлэл &quot;Ажил&quot; хэсэгт харагдах болно.
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Өөрийн зураг <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-4">
                  <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center border-2 border-gray-200">
                    {form.profileImage ? (
                      <img src={form.profileImage} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Camera className="w-8 h-8 text-gray-400" />
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => profileImageInputRef.current?.click()}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
                    >
                      {form.profileImage ? 'Солих' : 'Зураг оруулах'}
                    </button>
                    {form.profileImage && (
                      <button
                        type="button"
                        onClick={handleDeleteProfileImage}
                        className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-sm rounded-lg transition-colors"
                      >
                        Устгах
                      </button>
                    )}
                  </div>
                  <input
                    ref={profileImageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleProfileImageChange}
                    className="hidden"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Нэр <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => {
                    setForm((p) => ({ ...p, name: e.target.value }));
                    setSaveError(null);
                  }}
                  placeholder="Бат-Эрдэнэ"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Утас <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => {
                    setForm((p) => ({ ...p, phone: e.target.value }));
                    setSaveError(null);
                  }}
                  placeholder="99112233"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Хийх ажлын төрлөө сонгох <span className="text-red-500">*</span>
                  <span className="text-xs text-gray-500 ml-2">(Хамгийн ихдээ 3)</span>
                </label>
                {jobs.length === 0 ? (
                  <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Ажлын төрлийн жагсаалт хоосон байна. Админ <code className="text-xs">jobs</code> хүснэгтэд мөр нэмнэ үү.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {jobs.map((job) => {
                      const isSelected = form.jobIds.includes(job.id);
                      const isDisabled = !isSelected && form.jobIds.length >= 3;
                      return (
                        <button
                          key={job.id}
                          type="button"
                          onClick={() => handleJobToggle(job.id)}
                          disabled={isDisabled}
                          className={`p-3 rounded-lg border-2 text-sm font-medium transition-all text-left ${
                            isSelected
                              ? 'border-blue-600 bg-blue-50 text-blue-700'
                              : isDisabled
                                ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                          }`}
                        >
                          {job.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Ажлын тайлбар <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={form.workExperience}
                  onChange={(e) => {
                    setForm((p) => ({ ...p, workExperience: e.target.value }));
                    setSaveError(null);
                  }}
                  placeholder="Өөрийн туршлага, ажлын чиглэлийн талаар товч тайлбар бичнэ үү..."
                  rows={4}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
                />
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">
                  Ажлын зургууд
                  <span className="text-xs text-gray-500 ml-2">
                    ({form.workPhotos.length}/10)
                  </span>
                </label>

                {form.workPhotos.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {form.workPhotos.map((photo, idx) => (
                      <div key={`${idx}-${photo.slice(0, 32)}`} className="relative group">
                        <div className="aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                          <img src={photo} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                          <label className="p-2 bg-white rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                            <Upload className="w-4 h-4 text-gray-700" />
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleReplaceWorkPhoto(idx, e)}
                              className="hidden"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => handleDeleteWorkPhoto(idx)}
                            className="p-2 bg-white rounded-lg hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {form.workPhotos.length < 10 && (
                  <button
                    type="button"
                    onClick={() => workPhotosInputRef.current?.click()}
                    className="w-full py-8 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors flex flex-col items-center gap-2 text-gray-600 hover:text-blue-600"
                  >
                    <Upload className="w-6 h-6" />
                    <span className="text-sm font-medium">Ажлын зураг нэмэх</span>
                    <span className="text-xs text-gray-500">
                      Үлдсэн: {10 - form.workPhotos.length}
                    </span>
                  </button>
                )}
                <input
                  ref={workPhotosInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleWorkPhotosChange}
                  className="hidden"
                />
              </div>
            </>
          )}
        </div>

        {!loading && !loadError && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 space-y-3">
            <div className="max-w-2xl mx-auto space-y-3">
              <button
                type="button"
                onClick={() => { void handleSave(); }}
                disabled={!canSave}
                className={`w-full py-3.5 font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 ${
                  canSave
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                }`}
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                {saving ? 'Хадгалж байна…' : 'Хадгалах'}
              </button>

              {hasExistingRow && (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={saving}
                  className="w-full py-3 bg-red-50 hover:bg-red-100 text-red-600 font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  Бүртгэлээ бүрэн устгах
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Бүртгэл устгах уу?</h3>
            <p className="text-gray-700 text-sm">
              Та өөрийн ажлын анкет болон бүх зургаа бүрэн устгах гэж байна. Энэ үйлдлийг буцаах боломжгүй.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors"
              >
                Цуцлах
              </button>
              <button
                type="button"
                onClick={() => { void handleDeleteProfile(); }}
                disabled={saving}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                Устгах
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
