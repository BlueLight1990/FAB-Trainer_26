import React, { useState, useMemo } from 'react';
import { 
  FileDown, 
  X, 
  HelpCircle, 
  CheckCircle2, 
  ImageIcon, 
  Check, 
  Loader2, 
  BookOpen, 
  Filter, 
  ExternalLink, 
  PenTool,
  Search,
  CheckSquare,
  Square,
  FolderOpen,
  Calendar,
  ArrowUpDown,
  Clock,
  Sparkles,
  FileSpreadsheet
} from 'lucide-react';
import { Flashcard, Category } from '../types';
import { exportFlashcardsToPdf, PdfExportResult } from '../lib/pdfExport';
import { exportCardsToExcel } from '../lib/excelExport';
import { QUESTIONS } from '../data/questions';
import { Capacitor } from '@capacitor/core';

interface FlashcardPdfExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  allCards: Flashcard[];
  categories: Category[];
  initialCategoryId?: string;
}

export type FlashcardSortOption = 'category_az' | 'date_desc' | 'date_asc' | 'az';
export type FlashcardDateFilterOption = 'all' | 'today' | '7days' | '30days' | 'custom';

export const FlashcardPdfExportModal: React.FC<FlashcardPdfExportModalProps> = ({
  isOpen,
  onClose,
  allCards,
  categories,
  initialCategoryId = 'all'
}) => {
  // Selection mode: 'category' (all cards in chosen category) or 'custom_cards' (individual card pick)
  const [selectionType, setSelectionType] = useState<'category' | 'custom_cards'>('custom_cards');
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategoryId);
  
  // Custom Card Selection (Set of card IDs)
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(() => {
    if (initialCategoryId && initialCategoryId !== 'all') {
      const ids = allCards.filter(c => c.categoryId === initialCategoryId).map(c => c.id);
      return new Set(ids);
    }
    return new Set(allCards.map(c => c.id));
  });

  // Filter inside the individual card picker & general export
  const [cardSearchTerm, setCardSearchTerm] = useState<string>('');
  const [cardFilterCategory, setCardFilterCategory] = useState<string>('all');

  // Date Filtering state
  const [dateFilter, setDateFilter] = useState<FlashcardDateFilterOption>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Sorting state for PDF and display
  const [sortOption, setSortOption] = useState<FlashcardSortOption>('date_desc');

  // Export settings
  const [exportMode, setExportMode] = useState<'questions_only' | 'with_answers'>('with_answers');
  const [includeAnswerLines, setIncludeAnswerLines] = useState<boolean>(true);
  const [includeImages, setIncludeImages] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('fab_flashcard_pdf_include_images');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportStatus, setExportStatus] = useState<string>('');
  const [exportSuccess, setExportSuccess] = useState<PdfExportResult | null>(null);

  // Helper to test if a card matches the date filter
  const matchesDateFilter = (card: Flashcard): boolean => {
    if (dateFilter === 'all') return true;

    const cardTime = card.createdAt;
    if (!cardTime) {
      // If card has no createdAt date timestamp, keep it
      return true;
    }

    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    if (dateFilter === 'today') {
      const todayStart = new Date().setHours(0, 0, 0, 0);
      return cardTime >= todayStart;
    }

    if (dateFilter === '7days') {
      return cardTime >= now - (7 * oneDayMs);
    }

    if (dateFilter === '30days') {
      return cardTime >= now - (30 * oneDayMs);
    }

    if (dateFilter === 'custom') {
      if (startDate) {
        const startMs = new Date(startDate).setHours(0, 0, 0, 0);
        if (cardTime < startMs) return false;
      }
      if (endDate) {
        const endMs = new Date(endDate).setHours(23, 59, 59, 999);
        if (cardTime > endMs) return false;
      }
      return true;
    }

    return true;
  };

  // Helper to format date label
  const formatDateLabel = (timestamp?: number) => {
    if (!timestamp) return 'Standard';
    return new Date(timestamp).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  // Cards filtered by date for whole category mode or card list
  const dateFilteredAllCards = useMemo(() => {
    return allCards.filter(matchesDateFilter);
  }, [allCards, dateFilter, startDate, endDate]);

  // Cards to export based on selection mode and date filter
  const cardsToExport = useMemo(() => {
    let result: Flashcard[] = [];
    if (selectionType === 'category') {
      if (selectedCategory === 'all') {
        result = dateFilteredAllCards;
      } else {
        result = dateFilteredAllCards.filter(c => c.categoryId === selectedCategory);
      }
    } else {
      result = allCards.filter(c => selectedCardIds.has(c.id) && matchesDateFilter(c));
    }
    return result;
  }, [allCards, selectionType, selectedCategory, selectedCardIds, dateFilteredAllCards, dateFilter, startDate, endDate]);

  // Filtered cards in the selection list (filtered by category, search text & date)
  const listSelectableCards = useMemo(() => {
    const list = allCards.filter(card => {
      const matchesCat = cardFilterCategory === 'all' || card.categoryId === cardFilterCategory;
      if (!matchesCat) return false;

      if (!matchesDateFilter(card)) return false;

      if (!cardSearchTerm.trim()) return true;
      const termLower = cardSearchTerm.toLowerCase();
      return (
        (card.question && card.question.toLowerCase().includes(termLower)) ||
        (card.answer && card.answer.toLowerCase().includes(termLower))
      );
    });

    // Sort list according to sortOption for easy viewing
    return [...list].sort((a, b) => {
      if (sortOption === 'date_desc') {
        const dateA = a.createdAt || 0;
        const dateB = b.createdAt || 0;
        if (dateB !== dateA) return dateB - dateA;
        return a.question.localeCompare(b.question, 'de');
      }
      if (sortOption === 'date_asc') {
        const dateA = a.createdAt || 0;
        const dateB = b.createdAt || 0;
        if (dateA !== dateB) return dateA - dateB;
        return a.question.localeCompare(b.question, 'de');
      }
      if (sortOption === 'az') {
        return a.question.localeCompare(b.question, 'de');
      }
      // 'category_az'
      const catA = categories.find(c => c.id === a.categoryId)?.title || '';
      const catB = categories.find(c => c.id === b.categoryId)?.title || '';
      if (catA !== catB) return catA.localeCompare(catB, 'de');
      return a.question.localeCompare(b.question, 'de');
    });
  }, [allCards, cardFilterCategory, cardSearchTerm, dateFilter, startDate, endDate, sortOption, categories]);

  // Count cards with images (Front for questions, Back for answers)
  const cardsWithImagesCount = useMemo(() => {
    return cardsToExport.filter(c => !!c.mediaUrlFront || (exportMode === 'with_answers' && !!c.mediaUrl)).length;
  }, [cardsToExport, exportMode]);

  const getCategoryTitle = (catId: string) => {
    if (catId === 'all') return 'Gesamte Lernkartei (Alle Themen)';
    const cat = categories.find(c => c.id === catId);
    return cat ? cat.title : catId === 'custom' ? 'Eigene Lernkarten' : 'Allgemein';
  };

  // Card Selection Helpers
  const toggleCardSelection = (id: string) => {
    setSelectedCardIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllVisible = () => {
    setSelectedCardIds(prev => {
      const next = new Set(prev);
      listSelectableCards.forEach(c => next.add(c.id));
      return next;
    });
  };

  const handleDeselectAllVisible = () => {
    setSelectedCardIds(prev => {
      const next = new Set(prev);
      listSelectableCards.forEach(c => next.delete(c.id));
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedCardIds(new Set());
  };

  const handleExport = async () => {
    if (cardsToExport.length === 0) return;

    try {
      setIsExporting(true);
      setExportStatus('Bereite Lernkarten vor...');

      let categoryTitle = selectionType === 'category' 
        ? getCategoryTitle(selectedCategory)
        : `Individuelle Auswahl (${cardsToExport.length} Karten)`;

      if (dateFilter !== 'all') {
        const filterNames: Record<string, string> = {
          today: 'von heute',
          '7days': 'letzte 7 Tage',
          '30days': 'letzte 30 Tage',
          custom: startDate && endDate ? `${startDate} bis ${endDate}` : 'Datumsfilter'
        };
        categoryTitle += ` • Filter: ${filterNames[dateFilter] || 'Datum'}`;
      }

      const shouldIncludeImages = includeImages && cardsWithImagesCount > 0;

      const result = await exportFlashcardsToPdf(cardsToExport, {
        categoryTitle,
        categoryId: selectionType === 'category' ? selectedCategory : 'custom_selection',
        mode: exportMode,
        includeImages: shouldIncludeImages,
        includeAnswerLines: exportMode === 'questions_only' ? includeAnswerLines : false,
        categories,
        sortBy: sortOption,
        onProgress: (_curr, _tot, statusText) => {
          setExportStatus(statusText);
        }
      });

      setExportSuccess(result);
    } catch (err: any) {
      console.error('Fehler beim Exportieren der Lernkarten:', err);
      alert('Fehler beim Erstellen der PDF-Datei: ' + (err?.message || 'Unbekannter Fehler'));
    } finally {
      setIsExporting(false);
      setExportStatus('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-7 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200 text-left my-auto max-h-[94vh] flex flex-col">
        
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 shadow-2xs">
              <FileDown size={22} />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
                Lernkartei als PDF für Schulordner
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Sortiere nach Eingabedatum, wähle Zeiträume oder einzelne Karten mit DIN-Ordner-Lochrand.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isExporting}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors disabled:opacity-40"
            title="Schließen"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="py-4 overflow-y-auto flex-1 space-y-5 pr-1">

          {/* Success State */}
          {exportSuccess ? (
            <div className="space-y-4 py-2">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-2xs">
                <CheckCircle2 size={32} />
              </div>
              <div className="text-center space-y-1">
                <h3 className="font-bold text-lg text-slate-900">Schulordner-PDF erfolgreich generiert!</h3>
                <p className="text-xs text-slate-600">
                  <strong>{exportSuccess.itemCount} Lernkarten</strong> wurden als{' '}
                  <span className="font-semibold text-emerald-700">
                    {exportMode === 'with_answers' ? 'Korrekturbogen mit Antworten' : 'Übungsbogen (mit Schreiblinien)'}
                  </span>{' '}
                  mit 20 mm Ordner-Lochrand formatiert.
                </p>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-600 space-y-2">
                <div className="flex items-center gap-2 text-slate-800 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                  <span>{exportSuccess.message}</span>
                </div>
                <p className="text-[11px] font-mono text-slate-500 bg-white p-2 rounded-lg border border-slate-200/80 truncate">
                  {exportSuccess.fileName}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
                {exportSuccess.blobUrl && !Capacitor.isNativePlatform() && (
                  <a
                    href={exportSuccess.blobUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-bold transition-colors flex items-center justify-center gap-2 shadow-2xs"
                  >
                    <ExternalLink size={16} />
                    <span>PDF in neuem Tab öffnen & drucken</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setExportSuccess(null);
                    onClose();
                  }}
                  className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs sm:text-sm font-semibold transition-colors"
                >
                  Fertig
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Highlight Banner: 1-Klick Komplett-PDF (Alle Fragen & Antworten) */}
              <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white rounded-2xl p-4 shadow-sm border border-blue-900/50 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/25 text-blue-200 border border-blue-400/30 uppercase tracking-wider">
                        Komplettausgabe
                      </span>
                      <span className="text-xs text-blue-200 font-medium">Fragenkatalog & Lernkartei ({allCards.length} Karten)</span>
                    </div>
                    <h3 className="font-bold text-sm sm:text-base text-white">
                      Fragen, Antworten & Rubriken als PDF
                    </h3>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Druckfertig formatiert mit 20 mm Schulordner-Lochrand, Inhaltsübersicht, Rubrik-Gliederung und Musterlösungen.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <a
                    href="/api/download/alle-fragen-pdf"
                    download="FAB_Lernkartei_Fragen_und_Antworten_Komplett.pdf"
                    className="flex items-center gap-2 px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer"
                  >
                    <FileDown size={15} className="text-slate-950" />
                    <span>Komplett-PDF herunterladen</span>
                  </a>
                  <a
                    href="/api/download/alle-karten-excel"
                    download="FAB_Lernkartei_Fragen_und_Antworten.xlsx"
                    className="flex items-center gap-2 px-3.5 py-2 bg-teal-400 hover:bg-teal-300 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer"
                  >
                    <FileSpreadsheet size={15} className="text-slate-950" />
                    <span>Excel-Datei herunterladen (.xlsx)</span>
                  </a>
                  <a
                    href="/api/download/alle-fragen-pdf?inline=1"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl transition-colors border border-white/10"
                  >
                    <ExternalLink size={14} />
                    <span>PDF ansehen</span>
                  </a>
                </div>
              </div>

              {/* Step 1: Sortierung & Datum-Filter Leiste */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-3">
                <div className="flex items-center justify-between gap-2 border-b border-slate-200/70 pb-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wider">
                    <ArrowUpDown size={14} className="text-emerald-600" />
                    <span>Sortierung & Datumsfilter</span>
                  </div>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-100/80 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    {cardsToExport.length} von {allCards.length} {cardsToExport.length === 1 ? 'Karte' : 'Karten'} gewählt
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Sort Selection */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                      <Clock size={12} className="text-slate-400" />
                      Reihenfolge der Lernkarten:
                    </label>
                    <select
                      value={sortOption}
                      onChange={(e) => setSortOption(e.target.value as FlashcardSortOption)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                    >
                      <option value="date_desc">Neueste Eingabe zuerst (Datum absteigend)</option>
                      <option value="date_asc">Älteste Eingabe zuerst (Datum aufsteigend)</option>
                      <option value="category_az">Nach Rubrik & Alphabetisch</option>
                      <option value="az">Alphabetisch (Frage A - Z)</option>
                    </select>
                  </div>

                  {/* Date Filter Selection */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                      <Calendar size={12} className="text-slate-400" />
                      Eingabedatum filtern:
                    </label>
                    <select
                      value={dateFilter}
                      onChange={(e) => setDateFilter(e.target.value as FlashcardDateFilterOption)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                    >
                      <option value="all">Alle Daten (Gesamter Zeitraum)</option>
                      <option value="today">Nur heute eingegeben</option>
                      <option value="7days">Letzte 7 Tage eingegeben</option>
                      <option value="30days">Letzte 30 Tage eingegeben</option>
                      <option value="custom">Benutzerdefinierter Datumsbereich...</option>
                    </select>
                  </div>
                </div>

                {/* Custom Date Range Picker */}
                {dateFilter === 'custom' && (
                  <div className="p-2.5 bg-white border border-slate-200 rounded-xl grid grid-cols-2 gap-2 animate-in fade-in duration-150">
                    <div>
                      <span className="block text-[10px] font-bold text-slate-500 mb-0.5">Von (Eingabedatum):</span>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold text-slate-500 mb-0.5">Bis (Eingabedatum):</span>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Selection Mode Switch Tabs */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Filter size={14} className="text-emerald-600" />
                    1. Auswahlmodus festlegen:
                  </span>
                </label>

                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => setSelectionType('custom_cards')}
                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                      selectionType === 'custom_cards'
                        ? 'bg-white text-emerald-800 shadow-xs border border-slate-200/80 font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <CheckSquare size={16} className={selectionType === 'custom_cards' ? 'text-emerald-600' : 'text-slate-400'} />
                    <span>Einzelne Karten auswählen</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectionType('category')}
                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                      selectionType === 'category'
                        ? 'bg-white text-emerald-800 shadow-xs border border-slate-200/80 font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <FolderOpen size={16} className={selectionType === 'category' ? 'text-emerald-600' : 'text-slate-400'} />
                    <span>Ganze Rubrik wählen</span>
                  </button>
                </div>
              </div>

              {/* Mode A: Individual Cards Picker */}
              {selectionType === 'custom_cards' && (
                <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-2xl p-3.5">
                  <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
                    {/* Search inside picker */}
                    <div className="relative flex-1">
                      <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Karten durchsuchen..."
                        value={cardSearchTerm}
                        onChange={(e) => setCardSearchTerm(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                      />
                    </div>

                    {/* Filter by Category */}
                    <select
                      value={cardFilterCategory}
                      onChange={(e) => setCardFilterCategory(e.target.value)}
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                    >
                      <option value="all">Alle Rubriken</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.title}</option>
                      ))}
                    </select>
                  </div>

                  {/* Bulk Select / Deselect actions */}
                  <div className="flex items-center justify-between gap-2 text-xs border-y border-slate-200/80 py-1.5 px-1">
                    <span className="text-slate-500 text-[11px]">
                      Zeige {listSelectableCards.length} {listSelectableCards.length === 1 ? 'Karte' : 'Karten'}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSelectAllVisible}
                        className="text-emerald-700 hover:text-emerald-800 font-semibold hover:underline text-[11px]"
                      >
                        Alle sichtbaren markieren
                      </button>
                      <span className="text-slate-300">•</span>
                      <button
                        type="button"
                        onClick={handleDeselectAllVisible}
                        className="text-slate-600 hover:text-slate-800 font-medium hover:underline text-[11px]"
                      >
                        Sichtbare abwählen
                      </button>
                      <span className="text-slate-300">•</span>
                      <button
                        type="button"
                        onClick={handleClearSelection}
                        className="text-red-600 hover:text-red-700 font-medium hover:underline text-[11px]"
                      >
                        Keine
                      </button>
                    </div>
                  </div>

                  {/* Scrollable list of selectable cards */}
                  <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-100">
                    {listSelectableCards.length === 0 ? (
                      <div className="text-center py-6 text-slate-400 text-xs">
                        Keine Lernkarten für diese Such- und Datumskriterien gefunden.
                      </div>
                    ) : (
                      listSelectableCards.map(card => {
                        const isSelected = selectedCardIds.has(card.id);
                        const cat = categories.find(c => c.id === card.categoryId);
                        return (
                          <div
                            key={card.id}
                            onClick={() => toggleCardSelection(card.id)}
                            className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3 text-left ${
                              isSelected
                                ? 'bg-emerald-50/90 border-emerald-300 text-slate-900 shadow-2xs'
                                : 'bg-white border-slate-200/80 text-slate-700 hover:bg-slate-100/70'
                            }`}
                          >
                            <div className="mt-0.5 shrink-0 text-emerald-600">
                              {isSelected ? <CheckSquare size={17} /> : <Square size={17} className="text-slate-300" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 truncate max-w-[140px]">
                                  {cat?.title || 'Allgemein'}
                                </span>
                                {card.createdAt && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60">
                                    <Clock size={10} /> {formatDateLabel(card.createdAt)}
                                  </span>
                                )}
                                {card.mediaUrlFront && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                    <ImageIcon size={10} /> Foto Frage
                                  </span>
                                )}
                                {card.mediaUrl && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                    <ImageIcon size={10} /> Foto Lösung
                                  </span>
                                )}
                              </div>
                              <p className="text-xs font-bold text-slate-900 line-clamp-1">
                                {card.question}
                              </p>
                              <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                                {card.answer}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Mode B: Full Category Selection */}
              {selectionType === 'category' && (
                <div className="space-y-2 bg-slate-50 border border-slate-200 rounded-2xl p-4">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Themenbereich auswählen:
                  </label>
                  <div className="relative">
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      disabled={isExporting}
                      className="w-full pl-3.5 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 font-semibold focus:ring-2 focus:ring-emerald-500 outline-none cursor-pointer transition-all shadow-2xs"
                    >
                      <option value="all">
                        Alle Themenbereiche ({dateFilteredAllCards.length} {dateFilteredAllCards.length === 1 ? 'Karte' : 'Karten'})
                      </option>
                      {categories.map(cat => {
                        const count = dateFilteredAllCards.filter(c => c.categoryId === cat.id).length;
                        return (
                          <option key={cat.id} value={cat.id}>
                            {cat.title} ({count} {count === 1 ? 'Karte' : 'Karten'})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
              )}

              {/* Step 2: PDF-Format & Modus wählen */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <BookOpen size={14} className="text-emerald-600" />
                  2. PDF-Format & Modus wählen:
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Option A: Korrekturbogen / Fragen inkl. Antworten */}
                  <div
                    onClick={() => !isExporting && setExportMode('with_answers')}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between text-left select-none relative ${
                      exportMode === 'with_answers'
                        ? 'bg-emerald-50/70 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                        : 'bg-slate-50/70 border-slate-200 hover:border-slate-300 hover:bg-slate-100/60'
                    } ${isExporting ? 'opacity-60 pointer-events-none' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <CheckCircle2 size={18} />
                      </div>
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                        exportMode === 'with_answers' ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'
                      }`}>
                        {exportMode === 'with_answers' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">
                        Korrekturbogen (mit Antworten)
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                        Fragen inklusive <strong>Musterlösungen</strong> zum Nachschlagen, Kontrollieren und Nachbereiten im Ordner.
                      </p>
                    </div>
                  </div>

                  {/* Option B: Übungsbogen / Nur Fragen */}
                  <div
                    onClick={() => !isExporting && setExportMode('questions_only')}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between text-left select-none relative ${
                      exportMode === 'questions_only'
                        ? 'bg-teal-50/70 border-teal-500 ring-2 ring-teal-500/20 shadow-xs'
                        : 'bg-slate-50/70 border-slate-200 hover:border-slate-300 hover:bg-slate-100/60'
                    } ${isExporting ? 'opacity-60 pointer-events-none' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center shrink-0">
                        <HelpCircle size={18} />
                      </div>
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                        exportMode === 'questions_only' ? 'border-teal-600 bg-teal-600' : 'border-slate-300'
                      }`}>
                        {exportMode === 'questions_only' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">
                        Übungsbogen (Nur Fragen)
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                        Arbeitsblatt zum <strong>handschriftlichen Ausfüllen</strong> und Selbsttest für den Unterricht.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 3: Zusätzliche Optionen */}
              <div className="space-y-2.5 pt-1">
                
                {/* Optional: Handwriting lines in Questions-only mode */}
                {exportMode === 'questions_only' && (
                  <div
                    onClick={() => !isExporting && setIncludeAnswerLines(!includeAnswerLines)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 select-none ${
                      includeAnswerLines ? 'bg-teal-50/50 border-teal-200' : 'bg-slate-50 border-slate-200'
                    } ${isExporting ? 'opacity-60 pointer-events-none' : ''}`}
                  >
                    <div className={`mt-0.5 w-4 h-4 rounded-md flex items-center justify-center border shrink-0 transition-colors ${
                      includeAnswerLines ? 'bg-teal-600 border-teal-600 text-white' : 'border-slate-300 bg-white'
                    }`}>
                      {includeAnswerLines && <Check size={12} strokeWidth={3} />}
                    </div>
                    <div className="flex-1">
                      <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                        <PenTool size={14} className="text-teal-600" />
                        Schreiblinien für handschriftliche Antworten einfügen
                      </span>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Druckt unter jeder Frage dezente Linien ab, um handschriftliche Antworten einzutragen.
                      </p>
                    </div>
                  </div>
                )}

                {/* Optional: Include Images */}
                <div
                  onClick={() => {
                    if (isExporting) return;
                    const nextVal = !includeImages;
                    setIncludeImages(nextVal);
                    try {
                      localStorage.setItem('fab_flashcard_pdf_include_images', String(nextVal));
                    } catch {}
                  }}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 select-none ${
                    includeImages && cardsWithImagesCount > 0
                      ? 'bg-blue-50/50 border-blue-200'
                      : 'bg-slate-50 border-slate-200'
                  } ${isExporting ? 'opacity-60 pointer-events-none' : ''}`}
                >
                  <div className={`mt-0.5 w-4 h-4 rounded-md flex items-center justify-center border shrink-0 transition-colors ${
                    includeImages && cardsWithImagesCount > 0
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'border-slate-300 bg-white'
                  }`}>
                    {includeImages && cardsWithImagesCount > 0 && <Check size={12} strokeWidth={3} />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                        <ImageIcon size={14} className={includeImages && cardsWithImagesCount > 0 ? 'text-blue-600' : 'text-slate-400'} />
                        Hinterlegte Fotos & Diagramme einbinden
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        cardsWithImagesCount > 0 ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-500'
                      }`}>
                        {cardsWithImagesCount} {cardsWithImagesCount === 1 ? 'Foto' : 'Fotos'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {cardsWithImagesCount > 0
                        ? 'Angehängte Skizzen, Tafeln und Geräteschaubilder werden formatiert im Dokument abgedruckt.'
                        : 'In dieser Auswahl sind keine Bilder vorhanden (wird als reiner Text gedruckt).'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Progress feedback when generating */}
              {isExporting && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-1.5 text-center animate-in fade-in duration-150">
                  <div className="flex items-center justify-center gap-2 text-emerald-900 font-bold text-xs">
                    <Loader2 size={16} className="animate-spin text-emerald-600" />
                    <span>{exportStatus || 'PDF für Schulordner wird generiert...'}</span>
                  </div>
                  <p className="text-[11px] text-emerald-700">
                    Dokument wird mit A4-Layout, Ordner-Abstand und Lochungsmarken zusammengestellt...
                  </p>
                </div>
              )}
            </>
          )}

        </div>

        {/* Footer Actions */}
        {!exportSuccess && (
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 sm:gap-3">
            <button
              type="button"
              disabled={isExporting}
              onClick={onClose}
              className="px-3 sm:px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs sm:text-sm font-semibold transition-colors disabled:opacity-40"
            >
              Abbrechen
            </button>

            <button
              type="button"
              disabled={isExporting || cardsToExport.length === 0}
              onClick={() => {
                exportCardsToExcel(cardsToExport, categories, {
                  questions: QUESTIONS,
                  fileName: `Lernkarten_${cardsToExport.length}_Karten.xlsx`
                });
              }}
              className="py-2.5 px-3 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-xl text-xs sm:text-sm font-bold transition-colors flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
              title="Aktuelle Auswahl als formatierte Excel-Tabelle herunterladen"
            >
              <FileSpreadsheet size={16} className="text-teal-600 shrink-0" />
              <span>Excel (.xlsx)</span>
            </button>
            
            <button
              type="button"
              disabled={isExporting || cardsToExport.length === 0}
              onClick={handleExport}
              className="flex-1 py-2.5 px-3 sm:px-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-bold transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              {isExporting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>PDF wird erstellt...</span>
                </>
              ) : (
                <>
                  <FileDown size={16} />
                  <span>
                    {exportMode === 'with_answers' ? 'Korrekturbogen' : 'Übungsbogen'} als PDF erstellen ({cardsToExport.length})
                  </span>
                </>
              )}
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
