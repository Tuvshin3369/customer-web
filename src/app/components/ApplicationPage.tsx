import { useState, useRef } from 'react';
import { X, Upload, Trash2, Camera, AlertCircle } from 'lucide-react';
import { mockJobCategories } from '../../data/jobs';

interface ApplicationPageProps {
  isOpen: boolean;
  onClose: () => void;
}

interface WorkerProfile {
  name: string;
  phone: string;
  categories: number[];
  description: string;
  profileImage: string | null;
  workPhotos: string[];
}

export function ApplicationPage({ isOpen, onClose }: ApplicationPageProps) {
  // Check if existing profile exists (mock - in real app, fetch from DB)
  const [hasExistingProfile] = useState(false);

  const [formData, setFormData] = useState<WorkerProfile>({
    name: '',
    phone: '',
    categories: [],
    description: '',
    profileImage: null,
    workPhotos: [],
  });

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const profileImageInputRef = useRef<HTMLInputElement>(null);
  const workPhotosInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleCategoryToggle = (categoryId: number) => {
    setFormData(prev => {
      const isSelected = prev.categories.includes(categoryId);
      if (isSelected) {
        return { ...prev, categories: prev.categories.filter(id => id !== categoryId) };
      } else {
        // Max 3 categories
        if (prev.categories.length >= 3) return prev;
        return { ...prev, categories: [...prev.categories, categoryId] };
      }
    });
  };

  const handleProfileImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, profileImage: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleWorkPhotosChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remaining = 10 - formData.workPhotos.length;
    const filesToAdd = files.slice(0, remaining);

    filesToAdd.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({
          ...prev,
          workPhotos: [...prev.workPhotos, reader.result as string],
        }));
      };
      reader.readAsDataURL(file);
    });
  };

  const handleDeleteProfileImage = () => {
    setFormData(prev => ({ ...prev, profileImage: null }));
  };

  const handleDeleteWorkPhoto = (index: number) => {
    setFormData(prev => ({
      ...prev,
      workPhotos: prev.workPhotos.filter((_, i) => i !== index),
    }));
  };

  const handleReplaceWorkPhoto = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({
          ...prev,
          workPhotos: prev.workPhotos.map((photo, i) => 
            i === index ? (reader.result as string) : photo
          ),
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    // Validation
    if (!formData.name.trim()) {
      alert('Нэрээ оруулна уу');
      return;
    }
    if (!formData.phone.trim()) {
      alert('Утасны дугаараа оруулна уу');
      return;
    }
    if (formData.categories.length === 0) {
      alert('Ажлын төрлөө сонгоно уу');
      return;
    }
    if (!formData.description.trim()) {
      alert('Ажлын тайлбараа оруулна уу');
      return;
    }

    // Save to database (mock)
    alert('Таны анкет амжилттай хадгалагдлаа!');
    onClose();
  };

  const handleDeleteProfile = () => {
    // Delete from database (mock)
    alert('Таны бүртгэл устгагдлаа');
    setShowDeleteConfirm(false);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-white z-50 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10">
          <h1 className="text-lg font-semibold text-gray-900">Анкет</h1>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 pb-32 max-w-2xl mx-auto space-y-6">
          
          {/* Info Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-gray-700">
              Өөрийн ажлын анкетыг бөглөөд ажил хайгчидтай холбогдоорой. Таны мэдээлэл "Ажил" хэсэгт харагдах болно.
            </p>
          </div>

          {/* Profile Image */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Өөрийн зураг <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-4">
              <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center border-2 border-gray-200">
                {formData.profileImage ? (
                  <img src={formData.profileImage} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <Camera className="w-8 h-8 text-gray-400" />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => profileImageInputRef.current?.click()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
                >
                  {formData.profileImage ? 'Солих' : 'Зураг оруулах'}
                </button>
                {formData.profileImage && (
                  <button
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

          {/* Name */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Нэр <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Бат-Эрдэнэ"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Утас <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              placeholder="99112233"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>

          {/* Job Categories */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Хийх ажлын төрлөө сонгох <span className="text-red-500">*</span>
              <span className="text-xs text-gray-500 ml-2">(Хамгийн ихдээ 3)</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {mockJobCategories.map((category) => {
                const isSelected = formData.categories.includes(category.id);
                const isDisabled = !isSelected && formData.categories.length >= 3;
                return (
                  <button
                    key={category.id}
                    onClick={() => handleCategoryToggle(category.id)}
                    disabled={isDisabled}
                    className={`p-3 rounded-lg border-2 text-sm font-medium transition-all text-left ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : isDisabled
                        ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {category.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Ажлын тайлбар <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Өөрийн туршлага, ажлын чиглэлийн талаар товч тайлбар бичнэ үү..."
              rows={4}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
            />
          </div>

          {/* Work Photos */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">
              Ажлын зургууд
              <span className="text-xs text-gray-500 ml-2">
                ({formData.workPhotos.length}/10)
              </span>
            </label>

            {/* Existing photos */}
            {formData.workPhotos.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {formData.workPhotos.map((photo, idx) => (
                  <div key={idx} className="relative group">
                    <div className="aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                      <img src={photo} alt={`Work ${idx + 1}`} className="w-full h-full object-cover" />
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

            {/* Add photos button */}
            {formData.workPhotos.length < 10 && (
              <button
                onClick={() => workPhotosInputRef.current?.click()}
                className="w-full py-8 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors flex flex-col items-center gap-2 text-gray-600 hover:text-blue-600"
              >
                <Upload className="w-6 h-6" />
                <span className="text-sm font-medium">Ажлын зураг нэмэх</span>
                <span className="text-xs text-gray-500">
                  Үлдсэн: {10 - formData.workPhotos.length}
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

        </div>

        {/* Fixed bottom actions */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 space-y-3">
          <div className="max-w-2xl mx-auto space-y-3">
            {/* Save button */}
            <button
              onClick={handleSave}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
            >
              Хадгалах
            </button>

            {/* Delete profile button - Only show if profile exists */}
            {hasExistingProfile && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full py-3 bg-red-50 hover:bg-red-100 text-red-600 font-medium rounded-lg transition-colors"
              >
                Бүртгэлээ бүрэн устгах
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Бүртгэл устгах уу?</h3>
            <p className="text-gray-700">
              Та өөрийн ажлын анкет болон бүх зургаа бүрэн устгах гэж байна. Энэ үйлдлийг буцаах боломжгүй.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors"
              >
                Цуцлах
              </button>
              <button
                onClick={handleDeleteProfile}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
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