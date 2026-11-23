import { Pencil, Plus } from 'lucide-react';
import type { Category } from '../types/soundboard';

interface CategoryTabsProps {
  categories: Category[];
  activeCategoryId: string;
  countsByCategory: Record<string, number>;
  totalSounds: number;
  isAdminUnlocked: boolean;
  dropTargetCategoryId: string | null;
  onSelectCategory: (categoryId: string) => void;
  onOpenAddCategory: () => void;
  onOpenRenameCategory: (category: Category) => void;
  onOpenAddSound: () => void;
}

export function CategoryTabs({
  categories,
  activeCategoryId,
  countsByCategory,
  totalSounds,
  isAdminUnlocked,
  dropTargetCategoryId,
  onSelectCategory,
  onOpenAddCategory,
  onOpenRenameCategory,
  onOpenAddSound,
}: CategoryTabsProps) {
  return (
    <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 pt-4 pb-2 flex flex-wrap items-center justify-between gap-3">
      <nav
        aria-label="Soundboard categories"
        className="flex flex-wrap items-center gap-1.5 p-1 bg-[#1D252D] border border-[#313D49] rounded-xl"
      >
        <button
          type="button"
          onClick={() => onSelectCategory('all')}
          className={`min-h-[40px] px-3.5 rounded-lg text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            activeCategoryId === 'all'
              ? 'bg-[#862633] text-white shadow-sm'
              : 'text-[#9EA2A2] hover:text-white hover:bg-[#26303A]/70'
          }`}
        >
          <span>All</span>
          <span
            className={`text-xs font-mono tabular-nums ${
              activeCategoryId === 'all' ? 'text-white/85' : 'text-[#9EA2A2]'
            }`}
          >
            {totalSounds}
          </span>
        </button>

        {categories.map((cat) => {
          const isActive = activeCategoryId === cat.id;
          const isDropTarget = dropTargetCategoryId === cat.id;
          const count = countsByCategory[cat.id] ?? 0;

          return (
            <div key={cat.id} className="inline-flex items-center">
              <button
                type="button"
                data-category-drop-id={cat.id}
                onClick={() => onSelectCategory(cat.id)}
                className={`min-h-[40px] px-3.5 rounded-lg text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  isDropTarget
                    ? 'bg-[#FFCD00]/20 text-[#FFCD00] ring-1 ring-[#FFCD00]'
                    : isActive
                      ? 'bg-[#862633] text-white shadow-sm'
                      : 'text-[#9EA2A2] hover:text-white hover:bg-[#26303A]/70'
                }`}
              >
                <span>{cat.name}</span>
                <span
                  className={`text-xs font-mono tabular-nums ${
                    isDropTarget
                      ? 'text-[#FFCD00]'
                      : isActive
                        ? 'text-white/85'
                        : 'text-[#9EA2A2]'
                  }`}
                >
                  {count}
                </span>
              </button>

              {isAdminUnlocked && isActive && (
                <button
                  type="button"
                  onClick={() => onOpenRenameCategory(cat)}
                  aria-label={`Rename or delete category ${cat.name}`}
                  className="ml-0.5 min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-[#9EA2A2] hover:text-white hover:bg-[#26303A] transition-colors cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}

        {isAdminUnlocked && (
          <button
            type="button"
            onClick={onOpenAddCategory}
            aria-label="Add category"
            title="Add category"
            className="min-h-[40px] min-w-[40px] px-2.5 rounded-lg text-[#9EA2A2] hover:text-white hover:bg-[#26303A] inline-flex items-center justify-center transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </nav>

      {isAdminUnlocked && (
        <button
          type="button"
          onClick={onOpenAddSound}
          data-testid="add-sound-button"
          className="min-h-[44px] px-4 rounded-lg bg-[#FFCD00] hover:bg-[#FFD633] text-[#1D252D] border border-[#1D252D]/20 shadow-sm font-bold text-sm inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Sound</span>
        </button>
      )}
    </div>
  );
}
