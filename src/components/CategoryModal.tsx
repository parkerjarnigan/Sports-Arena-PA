import { FolderPlus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CATEGORY_NAME_MAX_LENGTH } from '../config/constants';
import type { Category } from '../types/soundboard';
import { validateCategoryName } from '../utils/soundboardLogic';

interface CategoryModalProps {
  open: boolean;
  editingCategory: Category | null;
  categories: Category[];
  soundCountInCategory: number;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
  onDelete: (categoryId: string) => Promise<void>;
}

export function CategoryModal({
  open,
  editingCategory,
  categories,
  soundCountInCategory,
  onClose,
  onSave,
  onDelete,
}: CategoryModalProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setName(editingCategory?.name ?? '');
      setError(null);
      setSaving(false);
      setConfirmDelete(false);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open, editingCategory]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErr = validateCategoryName(name, categories, editingCategory?.id);
    if (validationErr) {
      setError(validationErr);
      return;
    }
    setSaving(true);
    try {
      await onSave(name.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save category.');
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingCategory) return;
    setSaving(true);
    try {
      await onDelete(editingCategory.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete category.');
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B0F13]/80 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="category-modal-title"
    >
      <div className="w-full max-w-sm bg-[#1D252D] border border-[#313D49] rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#12171D] border border-[#313D49] flex items-center justify-center text-[#FFCD00]">
              <FolderPlus className="w-4 h-4" />
            </div>
            <h2 id="category-modal-title" className="font-display text-2xl font-bold text-white">
              {editingCategory ? 'Edit Category' : 'Add Category'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close category modal"
            className="min-h-[36px] min-w-[36px] rounded-lg text-[#9EA2A2] hover:text-white hover:bg-[#26303A] inline-flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="category-name-input" className="block text-xs font-semibold text-[#E2E5E8] mb-1.5">
              Category Name
            </label>
            <input
              ref={inputRef}
              id="category-name-input"
              type="text"
              maxLength={CATEGORY_NAME_MAX_LENGTH}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. Timeouts, Halftime, Defense"
              className="w-full h-11 px-3.5 rounded-lg bg-[#12171D] border border-[#313D49] text-white placeholder-[#9EA2A2]/60 text-sm focus:outline-none focus:border-[#FFCD00]"
            />
            {error && (
              <p className="mt-1.5 text-xs font-medium text-red-400" role="alert">
                {error}
              </p>
            )}
          </div>

          {editingCategory && categories.length > 1 && (
            <div className="pt-2 border-t border-[#313D49]">
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="text-xs font-medium text-red-400 hover:text-red-300 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete category</span>
                </button>
              ) : (
                <div className="p-3 rounded-lg bg-[#862633]/25 border border-[#862633] space-y-2">
                  <p className="text-xs text-red-100">
                    {soundCountInCategory > 0
                      ? `${soundCountInCategory} sound pad(s) in this category will move to the first remaining category.`
                      : 'Delete this empty category?'}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleDelete}
                      className="min-h-[36px] px-3 rounded-md bg-red-600 hover:bg-red-500 text-white text-xs font-semibold cursor-pointer"
                    >
                      Confirm Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="min-h-[36px] px-3 rounded-md bg-[#26303A] text-[#F5F6F7] text-xs font-medium cursor-pointer"
                    >
                      Keep
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 rounded-lg bg-[#26303A] hover:bg-[#313D49] text-[#F5F6F7] text-sm font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] px-5 rounded-lg bg-[#862633] hover:bg-[#9E2D3C] disabled:opacity-50 text-white text-sm font-semibold cursor-pointer"
            >
              {saving ? 'Saving...' : editingCategory ? 'Save Name' : 'Create Category'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
