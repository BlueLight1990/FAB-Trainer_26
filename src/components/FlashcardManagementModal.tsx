import React, { useState, useRef } from 'react';
import { Category, Flashcard } from '../types';
import { 
  Search, 
  Edit3, 
  Trash2, 
  Plus, 
  Layers, 
  Image as ImageIcon,
  Camera,
  Upload,
  ZoomIn,
  X,
  Loader2,
  Filter,
  ArrowUpDown,
  FileDown,
  Sparkles,
  Book,
  CheckCircle2,
  CheckSquare,
  Square,
  XCircle,
  PenTool,
  FolderInput,
  Folder,
  ArrowRight,
  Check,
  FileSpreadsheet
} from 'lucide-react';
import { deleteFlashcard, updateFlashcard, addFlashcard, moveFlashcardsToCategory, deleteMultipleFlashcards, resolveOrCreateCategory } from '../lib/db';
import { generateCardAnswerWithAI } from '../lib/geminiClient';
import { compressImageFile } from '../lib/imageUtils';
import { exportCardsToExcel } from '../lib/excelExport';
import { QUESTIONS } from '../data/questions';
import { FormattedText } from './FormattedText';
import { AIImageScanner } from './AIImageScanner';
import { ConfirmModal, ConfirmDialogConfig } from './ConfirmModal';
import { FlashcardPdfExportModal } from './FlashcardPdfExportModal';
import { FlashcardToGlossaryReviewModal } from './FlashcardToGlossaryReviewModal';
import { BatchMoveModal } from './BatchMoveModal';

interface Props {
  flashcards: Flashcard[];
  categories: Category[];
  onDataUpdated: () => void;
  onClose: () => void;
}

export function FlashcardManagementModal({ 
  flashcards, 
  categories, 
  onDataUpdated, 
  onClose
}: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'default' | 'az' | 'category'>('default');
  const [showScanner, setShowScanner] = useState(false);
  const [showPdfExportModal, setShowPdfExportModal] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<ConfirmDialogConfig | null>(null);
  
  // Selection state for batch actions (move category, glossary, delete)
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [showBatchMoveModal, setShowBatchMoveModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type?: 'success' | 'info' } | null>(null);
  const [cardsForGlossaryModal, setCardsForGlossaryModal] = useState<Flashcard[] | null>(null);
  const [glossarySuccessToast, setGlossarySuccessToast] = useState<{ isOpen: boolean; count: number } | null>(null);

  // Batch move handler
  const handleBatchMove = async (targetCatId: string) => {
    if (selectedCardIds.size === 0 || !targetCatId) return;
    const cardIds = Array.from(selectedCardIds) as string[];
    const count = await moveFlashcardsToCategory(cardIds, targetCatId);
    const targetTitle = getCategoryTitle(targetCatId);
    setShowBatchMoveModal(false);
    setSelectedCardIds(new Set());
    onDataUpdated();
    setToastMessage({
      text: `${count} ${count === 1 ? 'Lernkarte' : 'Lernkarten'} erfolgreich in die Rubrik „${targetTitle}“ verschoben.`,
      type: 'success'
    });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Create new category & move cards handler
  const handleCreateCategoryAndMove = async (newCategoryTitle: string, newDescription?: string) => {
    if (selectedCardIds.size === 0 || !newCategoryTitle.trim()) return;
    const res = await resolveOrCreateCategory(newCategoryTitle.trim(), 'custom');
    const cardIds = Array.from(selectedCardIds) as string[];
    const count = await moveFlashcardsToCategory(cardIds, res.categoryId);
    setShowBatchMoveModal(false);
    setSelectedCardIds(new Set());
    onDataUpdated();
    setToastMessage({
      text: `${count} ${count === 1 ? 'Lernkarte' : 'Lernkarten'} in die neu erstellte Rubrik „${res.categoryTitle}“ verschoben.`,
      type: 'success'
    });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Quick single card move trigger
  const handleOpenSingleMoveModal = (card: Flashcard) => {
    setSelectedCardIds(new Set([card.id]));
    setShowBatchMoveModal(true);
  };

  // Batch delete handler
  const handleBatchDelete = () => {
    if (selectedCardIds.size === 0) return;
    setConfirmConfig({
      isOpen: true,
      title: `${selectedCardIds.size} Lernkarten löschen`,
      message: `Möchtest du die ${selectedCardIds.size} ausgewählten Lernkarten wirklich unwiderruflich löschen?`,
      confirmLabel: 'Ausgewählte löschen',
      cancelLabel: 'Abbrechen',
      isDestructive: true,
      onConfirm: async () => {
        const removed = await deleteMultipleFlashcards(Array.from(selectedCardIds) as string[]);
        setSelectedCardIds(new Set());
        onDataUpdated();
        setToastMessage({ text: `${removed} Lernkarten gelöscht.` });
        setTimeout(() => setToastMessage(null), 3500);
      }
    });
  };

  // Helper to retrieve last used category
  const getRememberedCategory = () => {
    try {
      const saved = localStorage.getItem('fab_last_flashcard_category');
      if (saved && (saved === 'all' || categories.some(c => c?.id === saved))) {
        if (saved !== 'all') return saved;
      }
    } catch {}
    return categories[0]?.id || 'technik';
  };

  // Edit / Add state
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  
  // Form inputs
  const [questionInput, setQuestionInput] = useState('');
  const [answerInput, setAnswerInput] = useState('');
  const [categoryInput, setCategoryInput] = useState<string>(() => {
    try {
      return localStorage.getItem('fab_last_flashcard_category') || 'technik';
    } catch {
      return 'technik';
    }
  });
  const [mediaInput, setMediaInput] = useState('');
  const [mediaFrontInput, setMediaFrontInput] = useState('');
  const [isCompressingPhoto, setIsCompressingPhoto] = useState(false);
  
  // Lightbox
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const frontFileInputRef = useRef<HTMLInputElement>(null);
  const frontCameraInputRef = useRef<HTMLInputElement>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const questionInputRef = useRef<HTMLTextAreaElement>(null);
  const answerInputRef = useRef<HTMLTextAreaElement>(null);

  // AI Flashcard Answer Generation State
  const [isGeneratingAnswer, setIsGeneratingAnswer] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{ percent: number; status: string } | null>(null);
  const [saveCardProgress, setSaveCardProgress] = useState<{ percent: number; status: string } | null>(null);
  const [scannerSaveProgress, setScannerSaveProgress] = useState<{ current: number; total: number; percent: number; status: string } | null>(null);
  const [aiAnswerError, setAiAnswerError] = useState('');
  const [aiAnswerSuccess, setAiAnswerSuccess] = useState(false);

  const handleFrontPhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsCompressingPhoto(true);
      const dataUrl = await compressImageFile(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.82 });
      setMediaFrontInput(dataUrl);
    } catch (err: any) {
      console.error('Fehler bei Bildverarbeitung (Vorderseite):', err);
      alert('Bild konnte nicht verarbeitet werden: ' + (err?.message || 'Ungültiges Format'));
    } finally {
      setIsCompressingPhoto(false);
      e.target.value = '';
    }
  };

  const handleScannerResults = async (results: any[], targetCatId?: string) => {
    const assignedCat = targetCatId || (selectedCategory !== 'all' ? selectedCategory : 'custom');
    setScannerSaveProgress({
      current: 0,
      total: results.length,
      percent: 5,
      status: `Speichere ${results.length} Lernkarten in der APK...`
    });

    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      if (res.question && res.answer) {
        setScannerSaveProgress({
          current: i + 1,
          total: results.length,
          percent: Math.round(((i + 1) / results.length) * 100),
          status: `Speichere Lernkarte ${i + 1} von ${results.length}...`
        });
        const cardCategory = res.categoryId && res.categoryId !== 'new' ? res.categoryId : assignedCat;
        await addFlashcard({
          question: res.question,
          answer: res.answer,
          mediaUrlFront: res.mediaUrlFront,
          mediaUrl: res.mediaUrl,
          categoryId: cardCategory,
          fromScan: true,
          createdAt: Date.now()
        });
      }
    }
    await new Promise(r => setTimeout(r, 200));
    setScannerSaveProgress(null);
    setShowScanner(false);
    onDataUpdated();
  };

  const getCategoryTitle = (catId: string) => {
    const found = categories.find(c => c?.id === catId);
    return found ? found.title : catId;
  };

  const handleOpenAddForm = () => {
    setEditingCard(null);
    setQuestionInput('');
    setAnswerInput('');
    const targetCat = selectedCategory !== 'all' ? selectedCategory : getRememberedCategory();
    setCategoryInput(targetCat);
    setMediaInput('');
    setMediaFrontInput('');
    setAiAnswerError('');
    setAiAnswerSuccess(false);
    setShowAddForm(true);

    setTimeout(() => {
      contentScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      questionInputRef.current?.focus();
    }, 60);
  };

  const handleOpenEditForm = (card: Flashcard) => {
    setEditingCard(card);
    setQuestionInput(card.question);
    setAnswerInput(card.answer);
    setCategoryInput(card.categoryId || 'technik');
    setMediaInput(card.mediaUrl || '');
    setMediaFrontInput(card.mediaUrlFront || '');
    setAiAnswerError('');
    setAiAnswerSuccess(false);
    setShowAddForm(true);

    setTimeout(() => {
      contentScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      questionInputRef.current?.focus();
    }, 60);
  };

  const handleGenerateAnswer = async () => {
    const cleanQ = questionInput.trim();
    if (!cleanQ) {
      setAiAnswerError('Bitte gib zuerst oben eine Frage oder Aufgabenstellung ein.');
      questionInputRef.current?.focus();
      return;
    }

    setIsGeneratingAnswer(true);
    setGenerationProgress({ percent: 20, status: 'Frage wird analysiert...' });
    setAiAnswerError('');
    setAiAnswerSuccess(false);

    try {
      const activeCat = categories.find(c => c.id === categoryInput)?.title;
      setTimeout(() => {
        setGenerationProgress(prev => prev ? { percent: 55, status: 'Antwort wird mit Fachwissen formuliert...' } : null);
      }, 400);

      const generated = await generateCardAnswerWithAI(cleanQ, activeCat);
      if (generated) {
        setGenerationProgress({ percent: 100, status: 'Antwort fertig generiert!' });
        setAnswerInput(generated);
        setAiAnswerSuccess(true);
        setTimeout(() => {
          setGenerationProgress(null);
          answerInputRef.current?.focus();
        }, 400);
      }
    } catch (err: any) {
      console.error('Card answer generation error in modal:', err);
      setAiAnswerError(err?.message || 'Antwort konnte nicht generiert werden.');
      setGenerationProgress(null);
    } finally {
      setIsGeneratingAnswer(false);
    }
  };

  const handleCloseForm = () => {
    setShowAddForm(false);
    setEditingCard(null);
    setQuestionInput('');
    setAnswerInput('');
    setMediaInput('');
    setMediaFrontInput('');
    setAiAnswerError('');
    setAiAnswerSuccess(false);
    setGenerationProgress(null);
    setSaveCardProgress(null);
  };

  const handlePhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsCompressingPhoto(true);
      const dataUrl = await compressImageFile(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.82 });
      setMediaInput(dataUrl);
    } catch (err: any) {
      console.error('Fehler bei Bildverarbeitung:', err);
      alert('Bild konnte nicht verarbeitet werden: ' + (err?.message || 'Ungültiges Format'));
    } finally {
      setIsCompressingPhoto(false);
      e.target.value = '';
    }
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionInput.trim() || !answerInput.trim()) {
      alert('Bitte gib sowohl eine Frage als auch eine Antwort ein.');
      return;
    }

    try {
      setSaveCardProgress({ percent: 25, status: 'Lernkartei wird vorbereitet...' });
      try {
        localStorage.setItem('fab_last_flashcard_category', categoryInput);
      } catch {}

      setSaveCardProgress({ 
        percent: 60, 
        status: editingCard ? 'Änderungen werden in der Datenbank gesichert...' : 'Neue Lernkartei wird gespeichert...' 
      });

      if (editingCard) {
        await updateFlashcard(editingCard.id, {
          question: questionInput.trim(),
          answer: answerInput.trim(),
          categoryId: categoryInput,
          mediaUrlFront: mediaFrontInput.trim() || undefined,
          mediaUrl: mediaInput.trim() || undefined
        });
      } else {
        await addFlashcard({
          question: questionInput.trim(),
          answer: answerInput.trim(),
          categoryId: categoryInput,
          mediaUrlFront: mediaFrontInput.trim() || undefined,
          mediaUrl: mediaInput.trim() || undefined,
          createdAt: Date.now()
        });
      }

      setSaveCardProgress({ percent: 100, status: 'Erfolgreich gespeichert!' });
      await new Promise(r => setTimeout(r, 200));

      handleCloseForm();
      onDataUpdated();
    } catch (err: any) {
      console.error('Fehler beim Speichern der Lernkarte:', err);
      alert('Fehler beim Speichern: ' + (err?.message || 'Unbekannter Fehler'));
      setSaveCardProgress(null);
    }
  };

  const handleDelete = (id: string, questionText: string) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Lernkarte löschen',
      message: `Möchtest du diese Lernkarte wirklich dauerhaft löschen?\n\n"${questionText.slice(0, 80)}..."`,
      confirmLabel: 'Löschen',
      cancelLabel: 'Abbrechen',
      isDestructive: true,
      onConfirm: async () => {
        await deleteFlashcard(id);
        onDataUpdated();
      }
    });
  };

  // Filter & Sort
  const filteredCards = flashcards.filter(c => {
    const matchesCategory = selectedCategory === 'all' || c.categoryId === selectedCategory;
    const term = searchTerm.toLowerCase().trim();
    if (!term) return matchesCategory;

    const matchesSearch = 
      c.question.toLowerCase().includes(term) ||
      c.answer.toLowerCase().includes(term) ||
      getCategoryTitle(c.categoryId).toLowerCase().includes(term);

    return matchesCategory && matchesSearch;
  });

  const sortedCards = [...filteredCards].sort((a, b) => {
    if (sortBy === 'az') {
      return a.question.localeCompare(b.question, 'de', { sensitivity: 'base' });
    }
    if (sortBy === 'category') {
      const catA = getCategoryTitle(a.categoryId);
      const catB = getCategoryTitle(b.categoryId);
      if (catA !== catB) return catA.localeCompare(catB, 'de');
      return a.question.localeCompare(b.question, 'de');
    }
    // default: preserve order or newest
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        
        {/* Header */}
        <div className={`border-b border-slate-100 flex items-center justify-between bg-slate-50/80 transition-all ${
          showAddForm ? 'p-3 sm:p-4' : 'p-4 sm:p-6'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 shadow-2xs">
              {showAddForm ? <Edit3 size={20} /> : <Layers size={22} />}
            </div>
            <div>
              <h2 className="text-base sm:text-xl font-bold text-slate-800 flex items-center gap-2">
                {showAddForm 
                  ? (editingCard ? 'Lernkarte bearbeiten' : 'Neue Lernkarte anlegen')
                  : 'Lernkarten-Übersicht & Verwaltung'}
              </h2>
              {!showAddForm ? (
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  Alle Lernkarten mit vollständigen Antworten einsehen, bearbeiten und löschen ({flashcards.length} Karten gesamt).
                </p>
              ) : (
                <p className="text-xs text-slate-500 mt-0.5">
                  {editingCard ? 'Frage, Antwort & Rubrik anpassen' : 'Themenbereich & Inhalt der neuen Karte festlegen'}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={showAddForm ? handleCloseForm : onClose}
            className="text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-200/60 transition-colors flex items-center gap-1.5"
            title={showAddForm ? 'Bearbeitung beenden' : 'Schließen'}
          >
            {showAddForm && <span className="text-xs font-semibold hidden sm:inline text-slate-500">Zurück</span>}
            <X size={20} />
          </button>
        </div>

        {/* Toolbar & Controls - Hidden during edit/add mode to maximize screen space for keyboard */}
        {!showAddForm && (
          <div className="p-4 sm:p-5 border-b border-slate-100 bg-white space-y-3">
            <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
              {/* Search Input */}
              <div className="relative flex-1">
                <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Lernkarten durchsuchen (Frage, Antwort oder Rubrik)..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <a
                  href="/api/download/alle-karten-excel"
                  download="FAB_Lernkartei_Fragen_und_Antworten.xlsx"
                  className="flex items-center gap-1.5 px-3 py-2 bg-teal-50 text-teal-800 hover:bg-teal-100 border border-teal-200 rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-2xs cursor-pointer"
                  title="Lernkarten als Excel-Tabelle (.xlsx) herunterladen"
                >
                  <FileSpreadsheet size={16} className="text-teal-600" />
                  <span>Excel</span>
                </a>

                <button
                  onClick={() => setShowPdfExportModal(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-2xs"
                  title="Lernkarten als PDF exportieren"
                >
                  <FileDown size={16} className="text-emerald-600" />
                  <span>PDF Export</span>
                </button>

                <button
                  onClick={() => setShowScanner(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 text-blue-800 border border-blue-200 rounded-xl text-xs sm:text-sm font-bold transition-colors shadow-2xs cursor-pointer active:scale-98"
                  title="Handgeschriebene Karteikarten (Vorder- & Rückseite) per Foto scannen"
                >
                  <PenTool size={16} className="text-blue-600" />
                  <span>Handschrift-Scan</span>
                </button>

                <button
                  onClick={handleOpenAddForm}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-sm"
                >
                  <Plus size={16} />
                  <span>Neue Karte</span>
                </button>
              </div>
            </div>

            {/* Batch Operations Bar (when cards are selected) */}
            {selectedCardIds.size > 0 && (
              <div className="p-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white rounded-2xl shadow-md flex flex-wrap items-center justify-between gap-2.5 animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-white/20 text-white font-bold text-xs flex items-center justify-center">
                    {selectedCardIds.size}
                  </span>
                  <span className="font-bold text-xs sm:text-sm">
                    {selectedCardIds.size === 1 ? '1 Karte ausgewählt' : `${selectedCardIds.size} Karten ausgewählt`}
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap ml-auto">
                  {/* Move to another category button */}
                  <button
                    type="button"
                    onClick={() => setShowBatchMoveModal(true)}
                    className="px-3.5 py-1.5 bg-white text-blue-900 hover:bg-blue-50 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-98 cursor-pointer"
                    title="Ausgewählte Lernkarten in eine andere Rubrik verschieben"
                  >
                    <FolderInput size={15} className="text-blue-700" />
                    <span>In Rubrik verschieben ({selectedCardIds.size})...</span>
                  </button>

                  {/* AI Glossary */}
                  <button
                    type="button"
                    onClick={() => {
                      const selected = flashcards.filter(c => selectedCardIds.has(c.id));
                      if (selected.length > 0) {
                        setCardsForGlossaryModal(selected);
                      }
                    }}
                    className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-amber-950 rounded-xl text-xs sm:text-sm font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                    title="Ausgewählte Lernkarten mit KI prüfen und ins Glossar übernehmen"
                  >
                    <Sparkles size={14} />
                    <span>Ins Glossar (KI)</span>
                  </button>

                  {/* Batch Excel Export */}
                  <button
                    type="button"
                    onClick={() => {
                      const selected = flashcards.filter(c => selectedCardIds.has(c.id));
                      if (selected.length > 0) {
                        exportCardsToExcel(selected, categories, {
                          questions: QUESTIONS,
                          fileName: `Lernkarten_Auswahl_${selected.length}.xlsx`
                        });
                        setToastMessage({ text: `${selected.length} Lernkarten als Excel exportiert.` });
                        setTimeout(() => setToastMessage(null), 3000);
                      }
                    }}
                    className="px-3 py-1.5 bg-teal-400 hover:bg-teal-300 text-teal-950 rounded-xl text-xs sm:text-sm font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                    title="Ausgewählte Lernkarten als Excel-Tabelle (.xlsx) exportieren"
                  >
                    <FileSpreadsheet size={14} />
                    <span>Excel ({selectedCardIds.size})</span>
                  </button>

                  {/* Batch Delete */}
                  <button
                    type="button"
                    onClick={handleBatchDelete}
                    className="px-3 py-1.5 bg-red-500/80 hover:bg-red-500 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                    title="Ausgewählte Lernkarten löschen"
                  >
                    <Trash2 size={14} />
                    <span className="hidden sm:inline">Löschen</span>
                  </button>

                  {/* Deselect All */}
                  <button
                    type="button"
                    onClick={() => setSelectedCardIds(new Set())}
                    className="p-1.5 text-blue-100 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                    title="Auswahl aufheben"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* Filters & Sorting Row */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              {/* Category Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    selectedCategory === 'all'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Alle ({flashcards.length})
                </button>
                {categories.map(cat => {
                  if (!cat || !cat.id) return null;
                  const count = flashcards.filter(c => c && c.categoryId === cat.id).length;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1 ${
                        selectedCategory === cat.id
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      <span>{cat.title}</span>
                      <span className="opacity-70 text-[11px]">({count})</span>
                    </button>
                  );
                })}
              </div>

              {/* Selection & Sort Controls */}
              <div className="flex items-center gap-3 ml-auto">
                {filteredCards.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedCardIds.size === filteredCards.length) {
                        setSelectedCardIds(new Set());
                      } else {
                        setSelectedCardIds(new Set(filteredCards.map(c => c.id)));
                      }
                    }}
                    className="text-xs text-slate-600 hover:text-blue-700 font-semibold flex items-center gap-1 transition-colors"
                  >
                    {selectedCardIds.size === filteredCards.length ? (
                      <>
                        <CheckSquare size={14} className="text-blue-600" />
                        <span>Keine auswählen</span>
                      </>
                    ) : (
                      <>
                        <Square size={14} className="text-slate-400" />
                        <span>Alle auswählen</span>
                      </>
                    )}
                  </button>
                )}

                {/* Sort Toggle */}
                <div className="flex items-center gap-1.5 text-xs text-slate-500 shrink-0">
                  <ArrowUpDown size={14} className="text-slate-400" />
                  <span>Sortierung:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="default">Neueste zuerst</option>
                    <option value="az">A–Z (nach Frage)</option>
                    <option value="category">Nach Rubrik</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Content Body: Card List or Inline Add/Edit Form */}
        <div 
          ref={contentScrollRef} 
          className={`overflow-y-auto flex-1 bg-slate-50/40 ${
            showAddForm ? 'p-3 sm:p-6 pb-64 sm:pb-24' : 'p-4 sm:p-6'
          }`}
        >
          
          {showAddForm ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm mb-4">
              <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                <h3 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Edit3 size={18} className="text-blue-600" />
                  <span>{editingCard ? 'Lernkarte bearbeiten' : 'Neue Lernkarte anlegen'}</span>
                </h3>
                <button
                  type="button"
                  onClick={handleCloseForm}
                  className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveForm} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Themenbereich / Rubrik
                  </label>
                  <select
                    value={categoryInput}
                    onChange={(e) => setCategoryInput(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Frage / Fachbegriff (Vorderseite)
                  </label>
                  <textarea
                    ref={questionInputRef}
                    value={questionInput}
                    onChange={(e) => setQuestionInput(e.target.value)}
                    onFocus={(e) => {
                      setTimeout(() => {
                        e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }, 150);
                    }}
                    rows={3}
                    placeholder="z.B. Was versteht man unter dem Begriff Beckenwassererwärmung?"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[75px]"
                    required
                  />

                  {/* Photo for Front side (handwritten card front / diagram) */}
                  <div className="mt-2">
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      Foto / Abbildung zur Vorderseite (optional, z.B. handgeschriebene Karte/Skizze)
                    </label>
                    {mediaFrontInput ? (
                      <div className="relative inline-block mt-1">
                        <img 
                          src={mediaFrontInput} 
                          alt="Vorderseite Vorschau" 
                          className="max-h-36 rounded-xl border border-slate-300 object-contain bg-slate-100 shadow-2xs"
                        />
                        <button 
                          type="button"
                          onClick={() => setMediaFrontInput('')}
                          className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 shadow-md hover:bg-red-700 cursor-pointer"
                          title="Bild entfernen"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2 mt-1">
                        <input 
                          type="file" 
                          ref={frontFileInputRef} 
                          accept="image/*" 
                          className="hidden" 
                          onChange={handleFrontPhotoSelected} 
                        />
                        <input 
                          type="file" 
                          ref={frontCameraInputRef} 
                          accept="image/*" 
                          capture="environment" 
                          className="hidden" 
                          onChange={handleFrontPhotoSelected} 
                        />
                        <button
                          type="button"
                          disabled={isCompressingPhoto}
                          onClick={() => frontCameraInputRef.current?.click()}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          {isCompressingPhoto ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                          <span>Vorderseite fotografieren</span>
                        </button>
                        <button
                          type="button"
                          disabled={isCompressingPhoto}
                          onClick={() => frontFileInputRef.current?.click()}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          <Upload size={13} />
                          <span>Aus Galerie</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Antwort / Fachliche Erklärung (Rückseite)
                    </label>
                    <button
                      type="button"
                      onClick={handleGenerateAnswer}
                      disabled={isGeneratingAnswer}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-2xs ${
                        isGeneratingAnswer
                          ? 'bg-blue-100 text-blue-700 cursor-not-allowed border border-blue-200'
                          : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white hover:shadow'
                      }`}
                      title="Antwort automatisch durch KI formulieren lassen (du kannst sie vor dem Speichern überprüfen & bearbeiten)"
                    >
                      {isGeneratingAnswer ? (
                        <>
                          <Loader2 size={13} className="animate-spin text-blue-600" />
                          <span>KI formuliert Antwort...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={13} className="text-amber-300" />
                          <span>Antwort von KI formulieren lassen</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* AI Generation Ladebalken */}
                  {generationProgress && (
                    <div className="mb-2.5 p-3 rounded-2xl bg-blue-50/90 border border-blue-200 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between mb-1.5 text-xs">
                        <div className="flex items-center gap-2">
                          <Loader2 size={14} className="text-blue-600 animate-spin shrink-0" />
                          <span className="font-bold text-blue-900">{generationProgress.status}</span>
                        </div>
                        <span className="font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full text-[11px]">
                          {generationProgress.percent}%
                        </span>
                      </div>
                      <div className="w-full bg-blue-200/80 rounded-full h-2 overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-blue-600 to-indigo-600 h-2 rounded-full transition-all duration-300 ease-out"
                          style={{ width: `${generationProgress.percent}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {aiAnswerSuccess && (
                    <div className="mb-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start justify-between text-xs text-emerald-800 animate-in fade-in">
                      <div className="flex items-center gap-2 font-medium">
                        <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                        <span>KI-Antwort eingefügt! Du kannst sie vor dem Speichern überprüfen und nach Belieben anpassen.</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAiAnswerSuccess(false)}
                        className="text-emerald-600 hover:text-emerald-800 p-0.5 ml-1"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  )}

                  {aiAnswerError && (
                    <div className="mb-2 p-2.5 bg-red-50 border border-red-200 rounded-xl flex items-start justify-between text-xs text-red-700 animate-in fade-in">
                      <div className="flex items-center gap-2">
                        <XCircle size={15} className="text-red-600 shrink-0" />
                        <span>{aiAnswerError}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAiAnswerError('')}
                        className="text-red-600 hover:text-red-800 p-0.5 ml-1"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  )}

                  <textarea
                    ref={answerInputRef}
                    value={answerInput}
                    onChange={(e) => {
                      setAnswerInput(e.target.value);
                      if (aiAnswerSuccess) setAiAnswerSuccess(false);
                    }}
                    onFocus={(e) => {
                      setTimeout(() => {
                        e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }, 150);
                    }}
                    rows={5}
                    placeholder="z.B. Die Aufheizung des Beckenwassers auf die vorgeschriebene Temperatur mittels Wärmetauscher... (Oder oben auf 'Antwort von KI formulieren lassen' klicken)"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans min-h-[110px]"
                    required
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Tipp: Gib eine Frage oder ein Thema oben ein und nutze die KI-Schaltfläche. Du kannst die Antwort vor dem Speichern beliebig anpassen.
                  </p>
                </div>

                {/* Media upload */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Abbildung zur Antwort (optional)
                  </label>

                  {mediaInput ? (
                    <div className="relative inline-block mt-2">
                      <img
                        src={mediaInput}
                        alt="Vorschau"
                        className="max-h-40 rounded-xl border border-slate-300 object-contain bg-slate-100 shadow-2xs"
                      />
                      <button
                        type="button"
                        onClick={() => setMediaInput('')}
                        className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 shadow-md hover:bg-red-700 transition-colors"
                        title="Bild entfernen"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2 mt-1">
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*"
                        className="hidden"
                        onChange={handlePhotoSelected}
                      />
                      <input
                        type="file"
                        ref={cameraInputRef}
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={handlePhotoSelected}
                      />

                      <button
                        type="button"
                        disabled={isCompressingPhoto}
                        onClick={() => cameraInputRef.current?.click()}
                        className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        {isCompressingPhoto ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                        <span>Foto aufnehmen</span>
                      </button>

                      <button
                        type="button"
                        disabled={isCompressingPhoto}
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        <Upload size={14} />
                        <span>Bild hochladen</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Saving Ladebalken */}
                {saveCardProgress && (
                  <div className="p-3 rounded-2xl bg-indigo-50/90 border border-indigo-200 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between mb-1.5 text-xs">
                      <div className="flex items-center gap-2">
                        <Loader2 size={14} className="text-indigo-600 animate-spin shrink-0" />
                        <span className="font-bold text-indigo-900">{saveCardProgress.status}</span>
                      </div>
                      <span className="font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full text-[11px]">
                        {saveCardProgress.percent}%
                      </span>
                    </div>
                    <div className="w-full bg-indigo-200/80 rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-indigo-600 h-2 rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${saveCardProgress.percent}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Form Buttons */}
                <div className="sticky bottom-0 bg-white/95 backdrop-blur-xs pt-3 pb-2 border-t border-slate-100 flex justify-end gap-2.5 z-10">
                  <button
                    type="button"
                    disabled={!!saveCardProgress}
                    onClick={handleCloseForm}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="submit"
                    disabled={!!saveCardProgress}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
                  >
                    {saveCardProgress ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        <span>Wird gespeichert...</span>
                      </>
                    ) : (
                      <span>{editingCard ? 'Änderungen speichern' : 'Lernkarte anlegen'}</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <>
              {/* Scanner Save Progress Banner in Management Modal */}
              {scannerSaveProgress && (
                <div className="mb-4 p-4 rounded-2xl bg-blue-50/95 border border-blue-200 shadow-sm animate-in fade-in duration-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Loader2 size={16} className="text-blue-600 animate-spin shrink-0" />
                      <span className="font-bold text-xs sm:text-sm text-blue-950">{scannerSaveProgress.status}</span>
                    </div>
                    <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-full">
                      {scannerSaveProgress.percent}%
                    </span>
                  </div>
                  <div className="w-full bg-blue-200/80 rounded-full h-2.5 overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-blue-600 to-indigo-600 h-2.5 rounded-full transition-all duration-300 ease-out shadow-xs"
                      style={{ width: `${scannerSaveProgress.percent}%` }}
                    />
                  </div>
                </div>
              )}
              {/* Counter / Info Row */}
              <div className="flex items-center justify-between text-xs text-slate-500 mb-3 px-1">
                <span>
                  {sortedCards.length} {sortedCards.length === 1 ? 'Karte' : 'Karten'} angezeigt
                </span>
                {sortedCards.length > 0 && (
                  <span className="text-slate-400">
                    Klicke auf Bearbeiten oder Löschen, um eine Karte anzupassen.
                  </span>
                )}
              </div>

              {/* Cards List */}
              {sortedCards.length === 0 ? (
                <div className="text-center py-12 px-4 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                  <Layers size={32} className="mx-auto text-slate-400 mb-2" />
                  <p className="font-bold text-slate-700 text-sm sm:text-base">Keine Lernkarten gefunden</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    {searchTerm 
                      ? 'Passe deine Suchbegriffe an oder setze den Rubrik-Filter zurück.' 
                      : 'In dieser Rubrik sind noch keine Lernkarten vorhanden.'}
                  </p>
                  <button
                    onClick={handleOpenAddForm}
                    className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors shadow-2xs"
                  >
                    <Plus size={14} />
                    <span>Jetzt erste Lernkarte erstellen</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {sortedCards.map((card, idx) => {
                    const catTitle = getCategoryTitle(card.categoryId);

                    return (
                      <div 
                        key={card.id}
                        className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 hover:border-blue-200 hover:shadow-xs transition-all space-y-3"
                      >
                        {/* Card Top Row: Index, Category, Actions */}
                        <div className="flex items-start sm:items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selectedCardIds.has(card.id)}
                              onChange={(e) => {
                                const next = new Set(selectedCardIds);
                                if (e.target.checked) {
                                  next.add(card.id);
                                } else {
                                  next.delete(card.id);
                                }
                                setSelectedCardIds(next);
                              }}
                              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                              title="Für Sammelaktion auswählen"
                            />
                            <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                              #{idx + 1}
                            </span>
                            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                              {catTitle}
                            </span>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1.5 ml-auto flex-wrap">
                            <button
                              type="button"
                              onClick={() => handleOpenSingleMoveModal(card)}
                              className="px-2.5 py-1 text-blue-700 bg-blue-50/80 hover:bg-blue-100 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 border border-blue-200/70 cursor-pointer"
                              title="Diese Lernkarte in eine andere Rubrik verschieben"
                            >
                              <FolderInput size={13} className="text-blue-600" />
                              <span>Verschieben</span>
                            </button>
                            <button
                              onClick={() => setCardsForGlossaryModal([card])}
                              className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/90 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-2xs"
                              title="Diese Lernkarte mit KI ins Glossar übernehmen"
                            >
                              <Sparkles size={13} className="text-amber-600" />
                              <span>Ins Glossar (KI)</span>
                            </button>
                            <button
                              onClick={() => handleOpenEditForm(card)}
                              className="px-2.5 py-1 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 border border-slate-200/80"
                              title="Lernkarte bearbeiten"
                            >
                              <Edit3 size={13} />
                              <span>Bearbeiten</span>
                            </button>
                            <button
                              onClick={() => handleDelete(card.id, card.question)}
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-slate-200/80"
                              title="Lernkarte löschen"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Question (Vorderseite) */}
                        <div>
                          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                            Frage / Begriff:
                          </div>
                          <div className="text-slate-900 font-bold text-sm sm:text-base leading-relaxed">
                            <FormattedText text={card.question} />
                          </div>
                        </div>

                        {/* Answer (Rückseite) */}
                        <div className="bg-slate-50/90 border border-slate-200/80 rounded-xl p-3 sm:p-3.5">
                          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            Antwort / Erklärung:
                          </div>
                          <div className="text-slate-700 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">
                            <FormattedText text={card.answer} />
                          </div>
                        </div>

                        {/* Media Thumbnails (Front & Back) */}
                        {(card.mediaUrlFront || card.mediaUrl) && (
                          <div className="pt-1 flex flex-wrap gap-2">
                            {card.mediaUrlFront && (
                              <div 
                                onClick={() => setLightboxImage({ url: card.mediaUrlFront!, title: `${card.question} (Foto Vorderseite)` })}
                                className="inline-flex items-center gap-2 p-1.5 bg-blue-50/80 hover:bg-blue-100 rounded-xl cursor-pointer transition-colors border border-blue-200/80 shadow-2xs"
                              >
                                <img 
                                  src={card.mediaUrlFront} 
                                  alt="Vorderseite" 
                                  className="w-11 h-11 object-cover rounded-lg bg-black"
                                />
                                <div className="text-xs text-blue-900 pr-2 flex items-center gap-1 font-semibold">
                                  <ZoomIn size={13} className="text-blue-600" />
                                  <span>Foto Vorderseite</span>
                                </div>
                              </div>
                            )}

                            {card.mediaUrl && (
                              <div 
                                onClick={() => setLightboxImage({ url: card.mediaUrl!, title: `${card.question} (Foto Rückseite)` })}
                                className="inline-flex items-center gap-2 p-1.5 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer transition-colors border border-slate-200/70 shadow-2xs"
                              >
                                <img 
                                  src={card.mediaUrl} 
                                  alt="Rückseite" 
                                  className="w-11 h-11 object-cover rounded-lg bg-black"
                                />
                                <div className="text-xs text-slate-700 pr-2 flex items-center gap-1 font-semibold">
                                  <ZoomIn size={13} className="text-slate-500" />
                                  <span>Foto Rückseite</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>
            {flashcards.length} Lernkarten im Speicher
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold transition-colors"
          >
            Schließen
          </button>
        </div>

      </div>

      {/* Lightbox */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setLightboxImage(null)}
        >
          <div 
            className="relative bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm truncate">{lightboxImage.title}</h3>
              <button
                onClick={() => setLightboxImage(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="bg-slate-950 flex items-center justify-center max-h-[70vh] overflow-hidden p-2">
              <img 
                src={lightboxImage.url} 
                alt={lightboxImage.title} 
                className="max-h-[65vh] w-auto max-w-full object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}

      {/* AI Image Scanner */}
      {showScanner && (
        <AIImageScanner
          type="flashcard"
          categories={categories}
          initialCategoryId={selectedCategory !== 'all' ? selectedCategory : 'custom'}
          onClose={() => setShowScanner(false)}
          onResults={handleScannerResults}
        />
      )}

      {/* Flashcard PDF Export Modal */}
      {showPdfExportModal && (
        <FlashcardPdfExportModal
          isOpen={showPdfExportModal}
          onClose={() => setShowPdfExportModal(false)}
          allCards={flashcards}
          categories={categories}
          initialCategoryId={selectedCategory}
        />
      )}

      {/* Flashcard to Glossary AI Review Modal */}
      {cardsForGlossaryModal && (
        <FlashcardToGlossaryReviewModal
          cards={cardsForGlossaryModal.map(c => ({
            id: c.id,
            question: c.question,
            answer: c.answer,
            mediaUrl: c.mediaUrl
          }))}
          onSaved={(count) => {
            setSelectedCardIds(new Set());
            setGlossarySuccessToast({ isOpen: true, count });
            setTimeout(() => {
              setGlossarySuccessToast(null);
            }, 4000);
          }}
          onClose={() => setCardsForGlossaryModal(null)}
        />
      )}

      {/* Success Toast */}
      {glossarySuccessToast && (
        <div className="fixed bottom-6 right-6 z-70 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl border border-slate-700 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
            <CheckCircle2 size={18} />
          </div>
          <div>
            <p className="text-xs font-bold text-white">
              Ins Glossar aufgenommen!
            </p>
            <p className="text-[11px] text-slate-300">
              {glossarySuccessToast.count} {glossarySuccessToast.count === 1 ? 'Eintrag wurde' : 'Einträge wurden'} erfolgreich zum Fachglossar hinzugefügt.
            </p>
          </div>
          <button
            onClick={() => setGlossarySuccessToast(null)}
            className="text-slate-400 hover:text-white p-1 ml-2"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Batch Move Modal */}
      {showBatchMoveModal && (
        <BatchMoveModal
          isOpen={showBatchMoveModal}
          onClose={() => setShowBatchMoveModal(false)}
          selectedCards={flashcards.filter(c => selectedCardIds.has(c.id))}
          categories={categories}
          onMoveConfirmed={handleBatchMove}
          onCreateAndMove={handleCreateCategoryAndMove}
        />
      )}

      {/* Operation Toast Message */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-70 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl border border-slate-700 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <CheckCircle2 size={18} />
          </div>
          <div>
            <p className="text-xs font-bold text-white">
              Aktion erfolgreich
            </p>
            <p className="text-[11px] text-slate-300">
              {toastMessage.text}
            </p>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white p-1 ml-2"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        config={confirmConfig}
        onClose={() => setConfirmConfig(null)}
      />
    </div>
  );
}
