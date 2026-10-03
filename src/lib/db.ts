import { get, set } from 'idb-keyval';
import { Category, CategoryOverride, Flashcard, GlossaryTerm, Question, SwimDiscipline, SwimTimeEntry, CustomUploadedFile } from '../types';
import { QUESTIONS as DEFAULT_QUESTIONS, DEFAULT_PRESET_CATEGORIES, getEffectivePresetCategories } from '../data/questions';
import { FLASHCARDS as DEFAULT_FLASHCARDS } from '../data/flashcards';
import { GLOSSARY as DEFAULT_GLOSSARY } from '../data/glossary';
import { DEFAULT_SWIM_DISCIPLINES, DEFAULT_SWIM_ENTRIES } from '../data/swimDisciplines';

export interface AppDatabase {
  questions: Question[];
  flashcards: Flashcard[];
  glossary: GlossaryTerm[];
  customCategories?: Category[];
  presetOverrides?: Record<string, CategoryOverride>;
  swimDisciplines?: SwimDiscipline[];
  swimEntries?: SwimTimeEntry[];
  completedTrainingWeeks?: number[];
  trainingNotes?: Record<number, string>;
  examDisciplinesVersion?: number;
  customUploadedFiles?: CustomUploadedFile[];
  flashcardsPurgedVersion?: number;
  presetCategoriesPurgedVersion?: number;
  docCardsVersion?: number;
  emptyAppVersion?: number;
  // Flags for initialization
  initialized?: boolean;
}

const DB_KEY = 'baeder-app-data';

export const getDbData = async (): Promise<AppDatabase> => {
  const data = await get<AppDatabase>(DB_KEY);
  if (!data) {
    // First time setup: initialize completely empty database
    const initialData: AppDatabase = {
      questions: [],
      flashcards: [],
      glossary: [],
      customCategories: [],
      presetOverrides: {},
      swimDisciplines: [...DEFAULT_SWIM_DISCIPLINES],
      swimEntries: [...DEFAULT_SWIM_ENTRIES],
      examDisciplinesVersion: 3,
      docCardsVersion: 2,
      emptyAppVersion: 1,
      initialized: true
    };
    await set(DB_KEY, initialData);
    return initialData;
  }

  let updated = false;

  // Migration to the 8 official exam disciplines with jump and dive support
  if (data.examDisciplinesVersion !== 3) {
    data.swimDisciplines = [...DEFAULT_SWIM_DISCIPLINES];
    data.swimEntries = data.swimEntries || [...DEFAULT_SWIM_ENTRIES];
    data.examDisciplinesVersion = 3;
    updated = true;
  }

  if (!data.initialized) {
    data.questions = data.questions || [];
    data.flashcards = data.flashcards || [];
    data.glossary = data.glossary || [];
    data.initialized = true;
    updated = true;
  }

  if (!data.flashcards) {
    data.flashcards = [];
    updated = true;
  }

  if (!data.questions) {
    data.questions = [];
    updated = true;
  }

  if (!data.swimDisciplines || data.swimDisciplines.length === 0) {
    data.swimDisciplines = [...DEFAULT_SWIM_DISCIPLINES];
    updated = true;
  }
  if (!data.swimEntries) {
    data.swimEntries = [];
    updated = true;
  }

  if (!data.customCategories) {
    data.customCategories = [];
    updated = true;
  }
  if (!data.presetOverrides) {
    data.presetOverrides = {};
    updated = true;
  }
  if (!data.customUploadedFiles) {
    data.customUploadedFiles = [];
    updated = true;
  }

  // Ensure arrays exist and sanitize against null/undefined entries
  data.flashcards = (data.flashcards || []).filter(f => Boolean(f && f.id));
  data.questions = (data.questions || []).filter(q => Boolean(q && q.id));
  data.glossary = (data.glossary || []).filter(g => Boolean(g && g.id));
  data.customCategories = (data.customCategories || []).filter(c => Boolean(c && c.id));

  // Mark cards from scan functions with fromScan: true so their photos never leak into the document archive
  data.flashcards.forEach(f => {
    if (!f.fromScan && (f.mediaUrlFront || f.id?.startsWith('scanned-') || (f as any).isScanned)) {
      f.fromScan = true;
      updated = true;
    }
  });

  // Auto-create category entries in customCategories for any categories referenced by flashcards/questions
  const KNOWN_STANDARD_TITLES: Record<string, string> = {
    anatomie: 'Anatomie',
    organisation: 'Bäderorganisation',
    technik: 'Bädertechnik',
    chemie: 'Chemie',
    erste_hilfe: 'Erste Hilfe',
    hygiene: 'Hygiene',
    kommunikation: 'Kommunikation',
    reinigung: 'Reinigung',
    retten: 'Retten',
    schwimmen: 'Schwimmen',
    trainingslehre: 'Trainingslehre',
    wirtschaft_politik: 'Wirtschaftslehre, Politik',
    custom: 'Eigene Kategorie'
  };

  const existingCatIds = new Set(data.customCategories.map(c => c.id));
  const referencedCatIds = new Set<string>();
  data.flashcards.forEach(f => {
    if (f && f.categoryId && f.categoryId !== 'all') referencedCatIds.add(f.categoryId);
  });
  data.questions.forEach(q => {
    if (q && q.categoryId && q.categoryId !== 'all') referencedCatIds.add(q.categoryId);
  });

  for (const catId of referencedCatIds) {
    if (!existingCatIds.has(catId)) {
      const title = KNOWN_STANDARD_TITLES[catId] || catId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      data.customCategories.push({
        id: catId,
        title,
        description: `Themenbereich ${title}`,
        iconName: 'Folder'
      });
      existingCatIds.add(catId);
      updated = true;
    }
  }

  // Purge deprecated categories completely from stored data
  const DEPRECATED_CATS = new Set(['unfallverhuetung']);
  const initialFCount = data.flashcards.length;
  data.flashcards = data.flashcards.filter(f => f && f.categoryId && !DEPRECATED_CATS.has(f.categoryId));
  if (data.flashcards.length !== initialFCount) {
    updated = true;
  }

  const initialQCount = data.questions.length;
  data.questions = data.questions.filter(q => q && q.categoryId && !DEPRECATED_CATS.has(q.categoryId));
  if (data.questions.length !== initialQCount) {
    updated = true;
  }

  if (data.presetOverrides) {
    for (const depId of DEPRECATED_CATS) {
      if (depId in data.presetOverrides) {
        delete data.presetOverrides[depId];
        updated = true;
      }
    }
  }

  if (data.customCategories) {
    const initialCCount = data.customCategories.length;
    data.customCategories = data.customCategories.filter(c => c && c.id && !DEPRECATED_CATS.has(c.id));
    if (data.customCategories.length !== initialCCount) {
      updated = true;
    }
  }

  if (updated) {
    await set(DB_KEY, data);
  }

  return data;
};

export const saveDbData = async (data: AppDatabase): Promise<void> => {
  await set(DB_KEY, data);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('fab-db-updated'));
  }
};

// Preset Category Overrides
export const updatePresetCategory = async (id: string, override: Partial<CategoryOverride>) => {
  const db = await getDbData();
  if (!db.presetOverrides) db.presetOverrides = {};
  db.presetOverrides[id] = { ...db.presetOverrides[id], ...override };
  await saveDbData(db);
};

export const resetPresetCategory = async (id: string) => {
  const db = await getDbData();
  if (!db.presetOverrides) return;
  delete db.presetOverrides[id];
  await saveDbData(db);
};

export const resetAllPresetCategories = async () => {
  const db = await getDbData();
  db.presetOverrides = {};
  await saveDbData(db);
};

// Custom Categories
export const addCustomCategory = async (category: Omit<Category, 'id'>) => {
  const db = await getDbData();
  const newCategory = { ...category, id: `custom_${Date.now()}` };
  if (!db.customCategories) db.customCategories = [];
  db.customCategories.push(newCategory);
  await saveDbData(db);
  return newCategory;
};

export const matchExistingCategory = (
  rawRubrik: string,
  categories: Category[]
): Category | undefined => {
  const clean = rawRubrik.trim().toLowerCase();
  if (!clean) return undefined;
  const norm = clean.replace(/[^a-z0-9äöüß]/g, '');

  return categories.find(c => 
    c.title.trim().toLowerCase() === clean ||
    c.id.toLowerCase() === clean ||
    c.title.toLowerCase().replace(/[^a-z0-9äöüß]/g, '') === norm
  );
};

export const resolveOrCreateCategory = async (
  rawRubrik?: string,
  fallbackCatId: string = 'custom'
): Promise<{ categoryId: string; categoryTitle: string; isCreated: boolean }> => {
  const cleanRubrik = (rawRubrik || '').trim();
  if (!cleanRubrik) {
    return { categoryId: fallbackCatId, categoryTitle: 'Eigene Fragen & Karten', isCreated: false };
  }

  const db = await getDbData();
  const effectivePresets = getEffectivePresetCategories(db.presetOverrides, false);
  const allCurrent = [...effectivePresets, ...(db.customCategories || [])];

  const norm = cleanRubrik.toLowerCase().replace(/[^a-z0-9äöüß]/g, '');

  // 1. Direct match on title or ID
  const directMatch = allCurrent.find(c => 
    c.title.trim().toLowerCase() === cleanRubrik.toLowerCase() ||
    c.id.toLowerCase() === cleanRubrik.toLowerCase() ||
    c.title.toLowerCase().replace(/[^a-z0-9äöüß]/g, '') === norm
  );
  if (directMatch) {
    return { categoryId: directMatch.id, categoryTitle: directMatch.title, isCreated: false };
  }

  // 2. Keyword / Alias match for standard FAB domains
  if (norm.includes('technik') || norm.includes('baedertechnik') || norm.includes('badertechnik')) {
    const tech = allCurrent.find(c => c.id === 'technik');
    if (tech) return { categoryId: tech.id, categoryTitle: tech.title, isCreated: false };
  }
  if (norm.includes('rettung') || norm.includes('rettungslehre')) {
    const rettung = allCurrent.find(c => c.id === 'rettung');
    if (rettung) return { categoryId: rettung.id, categoryTitle: rettung.title, isCreated: false };
  }
  if (norm.includes('recht') || norm.includes('baederbetrieb') || norm.includes('rechtskunde')) {
    const recht = allCurrent.find(c => c.id === 'recht');
    if (recht) return { categoryId: recht.id, categoryTitle: recht.title, isCreated: false };
  }
  if (norm.includes('schwimm')) {
    const schwimm = allCurrent.find(c => c.id === 'schwimmen');
    if (schwimm) return { categoryId: schwimm.id, categoryTitle: schwimm.title, isCreated: false };
  }
  if (norm.includes('organisation')) {
    const org = allCurrent.find(c => c.id === 'organisation');
    if (org) return { categoryId: org.id, categoryTitle: org.title, isCreated: false };
  }

  // 3. Not found -> "Ist die rubrik nicht hinterlegt, erstelle sie"
  const newCat = await addCustomCategory({
    title: cleanRubrik,
    description: `Themenbereich ${cleanRubrik} (aus handschriftlichen Karteikarten)`,
    iconName: 'FolderPlus'
  });
  return { categoryId: newCat.id, categoryTitle: newCat.title, isCreated: true };
};

export const updateCustomCategory = async (id: string, categoryData: Partial<Omit<Category, 'id'>>) => {
  const db = await getDbData();
  if (!db.customCategories) return;
  const index = db.customCategories.findIndex(c => c.id === id);
  if (index !== -1) {
    db.customCategories[index] = { ...db.customCategories[index], ...categoryData };
    await saveDbData(db);
  }
};

export const deleteCustomCategory = async (id: string) => {
  const db = await getDbData();
  if (!db.customCategories) return;
  db.customCategories = db.customCategories.filter(c => c.id !== id);
  // Also remove flashcards and questions that belonged to this custom category
  if (db.flashcards) {
    db.flashcards = db.flashcards.filter(f => f.categoryId !== id);
  }
  if (db.questions) {
    db.questions = db.questions.filter(q => q.categoryId !== id);
  }
  await saveDbData(db);
};

// Flashcards (Lernkarten) CRUD
export const addFlashcard = async (card: Omit<Flashcard, 'id'>) => {
  const db = await getDbData();
  const newCard = { ...card, id: `card_${Date.now()}_${Math.random().toString(36).substr(2, 4)}` };
  db.flashcards.push(newCard);
  await saveDbData(db);
  return newCard;
};

export const updateFlashcard = async (id: string, updatedFields: Partial<Omit<Flashcard, 'id'>>) => {
  const db = await getDbData();
  const idx = db.flashcards.findIndex(f => f.id === id);
  if (idx !== -1) {
    db.flashcards[idx] = { ...db.flashcards[idx], ...updatedFields };
    await saveDbData(db);
  }
};

export const deleteFlashcard = async (id: string) => {
  const db = await getDbData();
  db.flashcards = db.flashcards.filter(f => f.id !== id);
  await saveDbData(db);
};

export const moveFlashcardsToCategory = async (cardIds: string[], targetCategoryId: string): Promise<number> => {
  const db = await getDbData();
  const idSet = new Set(cardIds);
  let count = 0;
  db.flashcards = db.flashcards.map(f => {
    if (idSet.has(f.id)) {
      count++;
      return { ...f, categoryId: targetCategoryId };
    }
    return f;
  });
  if (count > 0) {
    await saveDbData(db);
  }
  return count;
};

export const deleteMultipleFlashcards = async (cardIds: string[]): Promise<number> => {
  const db = await getDbData();
  const idSet = new Set(cardIds);
  const initialCount = db.flashcards.length;
  db.flashcards = db.flashcards.filter(f => !idSet.has(f.id));
  const removed = initialCount - db.flashcards.length;
  if (removed > 0) {
    await saveDbData(db);
  }
  return removed;
};

export const clearAllFlashcards = async (): Promise<number> => {
  const db = await getDbData();
  const count = db.flashcards.length;
  db.flashcards = [];
  db.flashcardsPurgedVersion = 1;
  await saveDbData(db);
  return count;
};

// Glossary Terms (Fachbegriffe) CRUD
export const addGlossaryTerm = async (term: Omit<GlossaryTerm, 'id'>) => {
  const db = await getDbData();
  const newTerm = { ...term, id: `term_${Date.now()}_${Math.random().toString(36).substr(2, 4)}` };
  db.glossary.push(newTerm);
  await saveDbData(db);
  return newTerm;
};

export const updateGlossaryTerm = async (id: string, updatedFields: Partial<Omit<GlossaryTerm, 'id'>>) => {
  const db = await getDbData();
  const idx = db.glossary.findIndex(g => g.id === id);
  if (idx !== -1) {
    db.glossary[idx] = { ...db.glossary[idx], ...updatedFields };
    await saveDbData(db);
  }
};

export const deleteGlossaryTerm = async (id: string) => {
  const db = await getDbData();
  db.glossary = db.glossary.filter(t => t.id !== id);
  await saveDbData(db);
};

// Multiple-Choice Prüfungsfragen CRUD
export const addQuestion = async (q: Omit<Question, 'id'>) => {
  const db = await getDbData();
  const newQuestion = { ...q, id: `q_${Date.now()}_${Math.random().toString(36).substr(2, 4)}` };
  db.questions.push(newQuestion);
  await saveDbData(db);
  return newQuestion;
};

export const updateQuestion = async (id: string, updatedFields: Partial<Omit<Question, 'id'>>) => {
  const db = await getDbData();
  const idx = db.questions.findIndex(q => q.id === id);
  if (idx !== -1) {
    db.questions[idx] = { ...db.questions[idx], ...updatedFields };
    await saveDbData(db);
  }
};

export const deleteQuestion = async (id: string) => {
  const db = await getDbData();
  db.questions = db.questions.filter(q => q.id !== id);
  await saveDbData(db);
};

// Swim Disciplines CRUD
export const addSwimDiscipline = async (disc: Omit<SwimDiscipline, 'id'>) => {
  const db = await getDbData();
  const newDisc: SwimDiscipline = { 
    ...disc, 
    id: `disc_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    createdAt: Date.now()
  };
  if (!db.swimDisciplines) db.swimDisciplines = [];
  db.swimDisciplines.push(newDisc);
  await saveDbData(db);
  return newDisc;
};

export const updateSwimDiscipline = async (id: string, updatedFields: Partial<Omit<SwimDiscipline, 'id'>>) => {
  const db = await getDbData();
  if (!db.swimDisciplines) return;
  const idx = db.swimDisciplines.findIndex(d => d.id === id);
  if (idx !== -1) {
    db.swimDisciplines[idx] = { ...db.swimDisciplines[idx], ...updatedFields };
    await saveDbData(db);
  }
};

export const deleteSwimDiscipline = async (id: string) => {
  const db = await getDbData();
  if (!db.swimDisciplines) return;
  db.swimDisciplines = db.swimDisciplines.filter(d => d.id !== id);
  // Also clean up entries associated with this discipline
  if (db.swimEntries) {
    db.swimEntries = db.swimEntries.filter(e => e.disciplineId !== id);
  }
  await saveDbData(db);
};

// Swim Time Entries CRUD
export const addSwimEntry = async (entry: Omit<SwimTimeEntry, 'id'>) => {
  const db = await getDbData();
  const newEntry: SwimTimeEntry = {
    ...entry,
    id: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    createdAt: entry.createdAt || Date.now()
  };
  if (!db.swimEntries) db.swimEntries = [];
  db.swimEntries.push(newEntry);
  await saveDbData(db);
  return newEntry;
};

export const updateSwimEntry = async (id: string, updatedFields: Partial<Omit<SwimTimeEntry, 'id'>>) => {
  const db = await getDbData();
  if (!db.swimEntries) return;
  const idx = db.swimEntries.findIndex(e => e.id === id);
  if (idx !== -1) {
    db.swimEntries[idx] = { ...db.swimEntries[idx], ...updatedFields };
    await saveDbData(db);
  }
};

export const deleteSwimEntry = async (id: string) => {
  const db = await getDbData();
  if (!db.swimEntries) return;
  db.swimEntries = db.swimEntries.filter(e => e.id !== id);
  await saveDbData(db);
};

// Training Plan Progress Helpers
export const toggleCompletedTrainingWeek = async (weekNumber: number): Promise<boolean> => {
  const db = await getDbData();
  if (!db.completedTrainingWeeks) db.completedTrainingWeeks = [];
  const exists = db.completedTrainingWeeks.includes(weekNumber);
  if (exists) {
    db.completedTrainingWeeks = db.completedTrainingWeeks.filter(w => w !== weekNumber);
  } else {
    db.completedTrainingWeeks.push(weekNumber);
  }
  await saveDbData(db);
  return !exists;
};

export const saveTrainingWeekNote = async (weekNumber: number, note: string) => {
  const db = await getDbData();
  if (!db.trainingNotes) db.trainingNotes = {};
  db.trainingNotes[weekNumber] = note;
  await saveDbData(db);
};

export const resetTrainingPlanProgress = async (includeNotes: boolean = false) => {
  const db = await getDbData();
  db.completedTrainingWeeks = [];
  if (includeNotes) {
    db.trainingNotes = {};
  }
  await saveDbData(db);
};

// Reset all content back to initial factory settings (clears all flashcards, glossary, swim times, training plan progress, and documents)
export const resetToFactoryDefaults = async () => {
  const freshData: AppDatabase = {
    questions: [],
    flashcards: [],
    glossary: [],
    customCategories: [],
    presetOverrides: {},
    swimDisciplines: [...DEFAULT_SWIM_DISCIPLINES],
    swimEntries: [],
    completedTrainingWeeks: [],
    trainingNotes: {},
    customUploadedFiles: [],
    docCardsVersion: 2,
    examDisciplinesVersion: 3,
    flashcardsPurgedVersion: 1,
    initialized: true
  };

  try {
    localStorage.removeItem('fab_training_progress');
    localStorage.removeItem('fab_completed_training_weeks');
    localStorage.removeItem('fab_flashcard_progress');
    localStorage.removeItem('fab_glossary_search');
    localStorage.removeItem('fab_file_filter');
    localStorage.removeItem('fab_file_category');
    localStorage.removeItem('fab_glossary_category');
  } catch {}

  await saveDbData(freshData);
  return freshData;
};

// Custom Uploaded Files Management
export const getCustomUploadedFiles = async (): Promise<CustomUploadedFile[]> => {
  const db = await getDbData();
  const raw = db.customUploadedFiles || [];
  
  // Deduplicate stored files if any duplicates exist in user DB
  const seenUrls = new Set<string>();
  const seenNameSizes = new Set<string>();
  const unique: CustomUploadedFile[] = [];
  let hadDuplicates = false;

  for (const f of raw) {
    if (!f || !f.dataUrl) continue;
    const cleanUrl = f.dataUrl.trim();
    const nameSizeKey = `${f.name.toLowerCase().trim()}_${f.size || 0}`;
    if (seenUrls.has(cleanUrl) || seenNameSizes.has(nameSizeKey)) {
      hadDuplicates = true;
      continue;
    }
    seenUrls.add(cleanUrl);
    seenNameSizes.add(nameSizeKey);
    unique.push(f);
  }

  if (hadDuplicates) {
    db.customUploadedFiles = unique;
    await saveDbData(db);
  }

  return unique;
};

export const saveCustomUploadedFile = async (file: CustomUploadedFile): Promise<void> => {
  const db = await getDbData();
  const files = db.customUploadedFiles || [];
  const cleanUrl = file.dataUrl?.trim();
  const nameSizeKey = `${file.name.toLowerCase().trim()}_${file.size || 0}`;

  // Check if identical file already exists
  const existingIdx = files.findIndex(f => 
    f.id === file.id || 
    (cleanUrl && f.dataUrl?.trim() === cleanUrl) ||
    `${f.name.toLowerCase().trim()}_${f.size || 0}` === nameSizeKey
  );

  if (existingIdx !== -1) {
    files[existingIdx] = { ...files[existingIdx], ...file };
  } else {
    files.unshift(file);
  }
  db.customUploadedFiles = files;
  await saveDbData(db);
};

export const saveMultipleCustomUploadedFiles = async (
  newFiles: CustomUploadedFile[]
): Promise<{ added: number; skipped: number }> => {
  const db = await getDbData();
  const files = db.customUploadedFiles || [];
  const existingUrls = new Set(files.map(f => f.dataUrl?.trim()).filter(Boolean));
  const existingNameSizes = new Set(files.map(f => `${f.name.toLowerCase().trim()}_${f.size || 0}`));
  const existingIds = new Set(files.map(f => f.id));

  let added = 0;
  let skipped = 0;
  const toAdd: CustomUploadedFile[] = [];

  for (const f of newFiles) {
    if (existingIds.has(f.id)) {
      continue;
    }
    const cleanUrl = f.dataUrl?.trim();
    const nameSizeKey = `${f.name.toLowerCase().trim()}_${f.size || 0}`;

    if ((cleanUrl && existingUrls.has(cleanUrl)) || existingNameSizes.has(nameSizeKey)) {
      skipped++;
      continue;
    }

    if (cleanUrl) existingUrls.add(cleanUrl);
    existingNameSizes.add(nameSizeKey);
    toAdd.push(f);
    added++;
  }

  db.customUploadedFiles = [...toAdd, ...files];
  await saveDbData(db);
  return { added, skipped };
};

export const deleteCustomUploadedFile = async (fileId: string): Promise<void> => {
  const db = await getDbData();
  db.customUploadedFiles = (db.customUploadedFiles || []).filter(f => f.id !== fileId);
  await saveDbData(db);
};

export const updateCustomUploadedFile = async (fileId: string, updates: Partial<CustomUploadedFile>): Promise<void> => {
  const db = await getDbData();
  db.customUploadedFiles = (db.customUploadedFiles || []).map(f => {
    if (f.id === fileId) {
      return { ...f, ...updates };
    }
    return f;
  });
  await saveDbData(db);
};

// Backup & Restore
import { exportAppDataBackup, importAppDataBackup, BackupExportResult, BackupImportResult } from './backupExport';
export { exportAppDataBackup, importAppDataBackup };
export type { BackupExportResult, BackupImportResult };

export const exportBackup = async (onProgress?: (percent: number, status: string) => void) => {
  return await exportAppDataBackup(onProgress);
};

export const importBackup = async (
  file: File, 
  onProgress?: (percent: number, status: string) => void
): Promise<boolean> => {
  const result = await importAppDataBackup(file, onProgress);
  return result.success;
};

