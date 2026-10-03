export type CategoryId = string;

export interface Category {
  id: CategoryId;
  title: string;
  description: string;
  iconName: string;
}

export interface CategoryOverride {
  title?: string;
  description?: string;
  isHidden?: boolean;
}

export interface Question {
  id: string;
  categoryId: string;
  text: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
  userId?: string;
  createdAt?: number;
}

export type ViewMode = 'flashcards' | 'glossary' | 'swim_times' | 'training_plan' | 'datei_zip' | 'settings';

export type AppMode = 'learn' | 'edit';

export type FlashcardCategory = string;

export interface Flashcard {
  id: string;
  categoryId: string;
  question: string;
  answer: string;
  mediaUrl?: string; // Back image (or general attachment)
  mediaUrlFront?: string; // Front image (photo of handwritten card front / sketch)
  fromScan?: boolean; // True if created via scan functions (excluded from document archive)
  userId?: string;
  createdAt?: number;
}

export interface CustomUploadedFile {
  id: string;
  name: string;
  dataUrl: string; // base64 data URI
  type: 'pdf' | 'image' | 'other';
  mimeType: string;
  size: number; // in bytes
  uploadedAt: number;
  description?: string;
}

export interface AppFileSourceRef {
  source: 'manual' | 'glossary_pdf' | 'glossary_image' | 'flashcard_image';
  sourceTitle: string;
  sourceId?: string;
}

export interface AppFileItem {
  id: string;
  name: string;
  type: 'pdf' | 'image' | 'other';
  mimeType: string;
  dataUrl: string;
  size?: number;
  source: 'manual' | 'glossary_pdf' | 'glossary_image' | 'flashcard_image';
  sourceTitle: string;
  sourceId?: string;
  allSources?: AppFileSourceRef[];
  uploadedAt?: number;
  description?: string;
}

export interface GlossaryPdfAttachment {
  id: string;
  name: string;
  dataUrl: string; // base64 data URI (data:application/pdf;base64,...)
  size?: number;   // size in bytes
  uploadedAt?: number;
}

export interface GlossaryTerm {
  id: string;
  term: string;
  definition: string;
  linkUrl?: string;
  mediaUrl?: string;
  mediaType?: string;
  // Attached PDF file support
  pdfUrl?: string;
  pdfName?: string;
  pdfSize?: number;
  pdfAttachments?: GlossaryPdfAttachment[];
  userId?: string;
  createdAt?: number;
}

export type SwimStrokeStyle = 
  | 'brust' 
  | 'freistil' 
  | 'ruecken' 
  | 'schmetterling' 
  | 'kleider' 
  | 'retten' 
  | 'tauchen' 
  | 'sonstiges';

export interface SwimDiscipline {
  id: string;
  name: string;
  distance?: number; // meters, e.g. 100
  poolLength?: number; // 25 or 50 meters
  targetTimeSeconds?: number; // benchmark time in seconds (e.g. 95 = 1:35 min)
  requirementLabel?: string; // e.g. "FAB Abschlussprüfung (max. 1:35 Min.)"
  style?: SwimStrokeStyle;
  description?: string;
  createdAt?: number;
}

export interface SwimTimeEntry {
  id: string;
  disciplineId: string;
  date: string; // YYYY-MM-DD
  timeSeconds?: number; // total time in seconds (e.g. 94.45) - optional for jump / optional for diving
  distanceMeters?: number; // distance achieved (e.g. 35m for Streckentauchen)
  jumpHeightMeters?: number; // height for jump (e.g. 3m)
  jumpStyle?: string; // e.g. "Kopfsprung vorwärts (gehechtet)", etc.
  ratingScore?: string; // e.g. "Bestanden", "Sehr gut (1)", etc.
  poolLength?: number; // 25 or 50 meters
  notes?: string;
  heartRate?: number; // bpm
  createdAt: number;
}
