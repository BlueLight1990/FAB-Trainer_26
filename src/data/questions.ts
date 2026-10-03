import { Category, CategoryOverride, Question } from '../types';

export const DEFAULT_PRESET_CATEGORIES: Category[] = [];

export const CATEGORIES: Category[] = DEFAULT_PRESET_CATEGORIES;

export const getEffectivePresetCategories = (
  overrides?: Record<string, CategoryOverride>,
  includeHidden = false
): Category[] => {
  return DEFAULT_PRESET_CATEGORIES.map(cat => {
    const override = overrides?.[cat.id];
    if (!override) return cat;
    return {
      ...cat,
      title: override.title !== undefined && override.title.trim() !== '' ? override.title : cat.title,
      description: override.description !== undefined ? override.description : cat.description,
    };
  }).filter(cat => {
    if (includeHidden) return true;
    return !overrides?.[cat.id]?.isHidden;
  });
};

export const QUESTIONS: Question[] = [];
