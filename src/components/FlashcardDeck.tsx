import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Category, Flashcard, FlashcardCategory, GlossaryTerm } from '../types';
import { 
  ChevronLeft, 
  ChevronRight, 
  RotateCcw, 
  Plus, 
  Image as ImageIcon, 
  Trash2, 
  Edit3, 
  Camera, 
  Upload, 
  ZoomIn, 
  X, 
  Loader2, 
  ListFilter,
  Sparkles,
  CheckCircle2,
  XCircle,
  Wrench,
  Shuffle,
  HelpCircle,
  Trophy,
  Check,
  Bookmark,
  BookmarkCheck,
  BookmarkX,
  Play,
  Layers,
  ArrowRight,
  RefreshCw,
  MoreVertical,
  SlidersHorizontal,
  PenTool,
  FolderInput
} from 'lucide-react';
import { getDbData, addFlashcard, updateFlashcard, deleteFlashcard, moveFlashcardsToCategory, resolveOrCreateCategory } from '../lib/db';
import { generateCardAnswerWithAI } from '../lib/geminiClient';
import { AIImageScanner } from './AIImageScanner';
import { FlashcardManagementModal } from './FlashcardManagementModal';
import { FlashcardToGlossaryReviewModal } from './FlashcardToGlossaryReviewModal';
import { FlashcardExplainModal } from './FlashcardExplainModal';
import { BatchMoveModal } from './BatchMoveModal';
import { compressImageFile } from '../lib/imageUtils';
import { FormattedText } from './FormattedText';
import { ConfirmModal, ConfirmDialogConfig } from './ConfirmModal';

interface Props {
  categories: Category[];
  onCategoriesUpdated: () => void;
  mode?: DeckMode;
}

type DeckMode = 'learn' | 'edit';
type ReviewFilter = 'all' | 'missed' | 'got_it';
type ReviewStatus = 'got_it' | 'missed';

export interface CategoryLearningProgress {
  cardId?: string;
  cardIndex: number;
  reviewFilter: ReviewFilter;
  isShuffled: boolean;
  shuffleSeed: number;
  isRoundFinished?: boolean;
  savedAt: number;
}

export interface FlashcardSessionProgress {
  activeCategory: FlashcardCategory | 'all';
  categoryStates: Record<string, CategoryLearningProgress>;
}

const PROGRESS_STORAGE_KEY = 'fab_flashcard_progress_v2';

const loadSavedProgress = (): FlashcardSessionProgress => {
  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          activeCategory: parsed.activeCategory || 'all',
          categoryStates: parsed.categoryStates || {}
        };
      }
    }
  } catch {}
  return {
    activeCategory: 'all',
    categoryStates: {}
  };
};

const saveProgressToStorage = (progress: FlashcardSessionProgress) => {
  try {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  } catch {}
};

export function FlashcardDeck({ categories, onCategoriesUpdated, mode }: Props) {
  const [deckMode, setDeckMode] = useState<DeckMode>(() => {
    if (mode === 'learn' || mode === 'edit') return mode;
    try {
      const saved = localStorage.getItem('fab_flashcard_mode');
      if (saved === 'learn' || saved === 'edit') return saved;
    } catch {}
    return 'learn';
  });

  useEffect(() => {
    if (mode && (mode === 'learn' || mode === 'edit')) {
      setDeckMode(mode);
      if (mode === 'learn') {
        setShowAddForm(false);
        setEditingCard(null);
      }
    }
  }, [mode]);

  // Load persistent progress (NotebookLM & Resume feature)
  const [savedProgress, setSavedProgress] = useState<FlashcardSessionProgress>(loadSavedProgress);

  const [activeCategory, setActiveCategory] = useState<FlashcardCategory | 'all'>(() => {
    const initial = loadSavedProgress();
    if (initial?.activeCategory && (initial.activeCategory === 'all' || categories.some(c => c?.id === initial.activeCategory))) {
      return initial.activeCategory;
    }
    try {
      const legacyCat = localStorage.getItem('fab_last_flashcard_category');
      if (legacyCat && (legacyCat === 'all' || categories.some(c => c?.id === legacyCat))) {
        return legacyCat as FlashcardCategory | 'all';
      }
    } catch {}
    return 'all';
  });

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [allCards, setAllCards] = useState<Flashcard[]>([]);
  const [allGlossary, setAllGlossary] = useState<GlossaryTerm[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showManagementModal, setShowManagementModal] = useState(false);
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null);
  const [cardForGlossaryModal, setCardForGlossaryModal] = useState<Flashcard | null>(null);
  const [explainCard, setExplainCard] = useState<Flashcard | null>(null);
  const [glossarySuccessToast, setGlossarySuccessToast] = useState<{ isOpen: boolean; count: number } | null>(null);
  const [isCompressingPhoto, setIsCompressingPhoto] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string } | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<ConfirmDialogConfig | null>(null);
  const [isRoundFinished, setIsRoundFinished] = useState(false);
  const [activeCardMenuId, setActiveCardMenuId] = useState<string | null>(null);
  const [cardToMove, setCardToMove] = useState<Flashcard | null>(null);
  const [moveToast, setMoveToast] = useState<string | null>(null);

  // Move handlers for single card move from Deck
  const handleCardMoved = async (targetCatId: string) => {
    if (!cardToMove) return;
    await moveFlashcardsToCategory([cardToMove.id], targetCatId);
    const targetTitle = getCategoryTitle(targetCatId);
    setCardToMove(null);
    await loadCards();
    onCategoriesUpdated();
    setMoveToast(`Lernkarte in Rubrik „${targetTitle}“ verschoben.`);
    setTimeout(() => setMoveToast(null), 3500);
  };

  const handleCardCreatedAndMoved = async (newTitle: string, newDesc?: string) => {
    if (!cardToMove || !newTitle.trim()) return;
    const res = await resolveOrCreateCategory(newTitle.trim(), 'custom');
    await moveFlashcardsToCategory([cardToMove.id], res.categoryId);
    setCardToMove(null);
    await loadCards();
    onCategoriesUpdated();
    setMoveToast(`Lernkarte in die neu erstellte Rubrik „${res.categoryTitle}“ verschoben.`);
    setTimeout(() => setMoveToast(null), 3500);
  };

  // Resume & Pause session indicators
  const isInitialRestoreDoneRef = useRef(false);
  const pendingCategoryTargetRef = useRef<{ categoryId: string; cardId?: string; cardIndex?: number } | null>(null);
  const [resumedBanner, setResumedBanner] = useState<{
    cardIndex: number;
    totalCards: number;
    cardQuestion: string;
  } | null>(null);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [pauseSavedToast, setPauseSavedToast] = useState(false);
  const [showJumpModal, setShowJumpModal] = useState(false);
  const [jumpInput, setJumpInput] = useState('');

  // NotebookLM study session states
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>(() => {
    const initial = loadSavedProgress();
    return initial.categoryStates[initial.activeCategory]?.reviewFilter || 'all';
  });
  const [isShuffled, setIsShuffled] = useState(() => {
    const initial = loadSavedProgress();
    return initial.categoryStates[initial.activeCategory]?.isShuffled || false;
  });
  const [shuffleSeed, setShuffleSeed] = useState(() => {
    const initial = loadSavedProgress();
    return initial.categoryStates[initial.activeCategory]?.shuffleSeed || 0;
  });

  // Card review status (saved persistently across sessions like in NotebookLM)
  const [cardReviews, setCardReviews] = useState<Record<string, ReviewStatus>>(() => {
    try {
      const saved = localStorage.getItem('fab_flashcard_reviews');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });

  const cardFileInputRef = useRef<HTMLInputElement>(null);
  const cardCameraInputRef = useRef<HTMLInputElement>(null);
  const cardFrontFileInputRef = useRef<HTMLInputElement>(null);
  const cardFrontCameraInputRef = useRef<HTMLInputElement>(null);
  const editFormRef = useRef<HTMLFormElement>(null);
  const questionInputRef = useRef<HTMLTextAreaElement>(null);
  const answerInputRef = useRef<HTMLTextAreaElement>(null);

  // AI Flashcard Answer Generation State
  const [isGeneratingAnswer, setIsGeneratingAnswer] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{ percent: number; status: string } | null>(null);
  const [saveCardProgress, setSaveCardProgress] = useState<{ percent: number; status: string } | null>(null);
  const [scannerSaveProgress, setScannerSaveProgress] = useState<{ current: number; total: number; percent: number; status: string } | null>(null);
  const [aiAnswerError, setAiAnswerError] = useState('');
  const [aiAnswerSuccess, setAiAnswerSuccess] = useState(false);

  const saveReviewsToStorage = (reviews: Record<string, ReviewStatus>) => {
    try {
      localStorage.setItem('fab_flashcard_reviews', JSON.stringify(reviews));
    } catch {}
  };

  const handleModeChange = (newMode: DeckMode) => {
    setDeckMode(newMode);
    try {
      localStorage.setItem('fab_flashcard_mode', newMode);
    } catch {}
    if (newMode === 'learn') {
      setShowAddForm(false);
      setEditingCard(null);
    }
  };

  // Helper to retrieve last used category
  const getRememberedCategory = () => {
    try {
      const saved = localStorage.getItem('fab_last_flashcard_category');
      if (saved && (saved === 'all' || categories.some(c => c.id === saved))) {
        if (saved !== 'all') return saved;
      }
    } catch {}
    return categories[0]?.id || 'technik';
  };

  const allCategories = useMemo(() => [
    { id: 'all', title: 'Alle Themen', description: '', iconName: 'Layers' },
    ...categories.filter(c => Boolean(c && c.id && c.id !== 'all')),
  ], [categories]);

  // Form states
  const [questionInput, setQuestionInput] = useState('');
  const [answerInput, setAnswerInput] = useState('');
  const [mediaInput, setMediaInput] = useState('');
  const [mediaFrontInput, setMediaFrontInput] = useState('');
  const [categoryInput, setCategoryInput] = useState<string>(() => {
    try {
      return localStorage.getItem('fab_last_flashcard_category') || 'technik';
    } catch {
      return 'technik';
    }
  });

  const handleFrontPhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsCompressingPhoto(true);
      const dataUrl = await compressImageFile(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.82 });
      setMediaFrontInput(dataUrl);
    } catch (err: any) {
      console.error('Fehler bei Bildkomprimierung (Vorderseite):', err);
      alert('Bild konnte nicht verarbeitet werden: ' + (err?.message || 'Ungültiges Format'));
    } finally {
      setIsCompressingPhoto(false);
      e.target.value = '';
    }
  };

  const handlePhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsCompressingPhoto(true);
      const dataUrl = await compressImageFile(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.82 });
      setMediaInput(dataUrl);
    } catch (err: any) {
      console.error('Fehler bei Bildkomprimierung:', err);
      alert('Bild konnte nicht verarbeitet werden: ' + (err?.message || 'Ungültiges Format'));
    } finally {
      setIsCompressingPhoto(false);
      e.target.value = '';
    }
  };

  const loadCards = async () => {
    try {
      const db = await getDbData();
      setAllCards(prev => {
        const next = db.flashcards || [];
        if (prev.length === next.length && prev === next) return prev;
        return next;
      });
      setAllGlossary(prev => {
        const next = db.glossary || [];
        if (prev.length === next.length && prev === next) return prev;
        return next;
      });
    } catch (e) {
      console.error('Fehler beim Laden der Lernkarten:', e);
    }
  };

  const getCategoryTitle = (catId?: string) => {
    if (!catId || catId === 'all') return 'Alle Themen';
    return categories.find(c => c?.id === catId)?.title || catId;
  };

  useEffect(() => {
    loadCards();
    const handleDbUpdate = () => {
      loadCards();
    };
    window.addEventListener('fab-db-updated', handleDbUpdate);
    return () => window.removeEventListener('fab-db-updated', handleDbUpdate);
  }, []);

  // Cards in current category
  const categoryCards = useMemo(() => {
    const valid = allCards.filter(c => Boolean(c && c.id));
    if (activeCategory === 'all') return valid;
    return valid.filter(c => c.categoryId === activeCategory);
  }, [allCards, activeCategory]);

  // Review statistics for the current category
  const stats = useMemo(() => {
    let gotItCount = 0;
    let missedCount = 0;
    categoryCards.forEach(c => {
      if (!c || !c.id) return;
      const status = cardReviews[c.id];
      if (status === 'got_it') gotItCount++;
      else if (status === 'missed') missedCount++;
    });
    const unreviewedCount = categoryCards.length - (gotItCount + missedCount);
    return {
      total: categoryCards.length,
      gotIt: gotItCount,
      missed: missedCount,
      unreviewed: unreviewedCount,
      percentMastered: categoryCards.length > 0 ? Math.round((gotItCount / categoryCards.length) * 100) : 0
    };
  }, [categoryCards, cardReviews]);

  // Filtered and optionally shuffled cards for the active session
  const sessionCards = useMemo(() => {
    let cards = categoryCards.filter(card => {
      if (!card || !card.id) return false;
      const status = cardReviews[card.id];
      if (reviewFilter === 'missed') return status === 'missed';
      if (reviewFilter === 'got_it') return status === 'got_it';
      return true;
    });

    if (isShuffled && cards.length > 1) {
      // Deterministic pseudo-random based on seed + card id
      cards = [...cards].sort((a, b) => {
        const idA = a?.id || '';
        const idB = b?.id || '';
        const hashA = (idA + shuffleSeed).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const hashB = (idB + shuffleSeed).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return (hashA % 97) - (hashB % 97);
      });
    }

    return cards;
  }, [categoryCards, reviewFilter, isShuffled, shuffleSeed, cardReviews]);

  // Save category progress to memory and persistent storage
  const saveCategoryState = useCallback((
    catId: string,
    updates: Partial<CategoryLearningProgress>
  ) => {
    setSavedProgress(prev => {
      const existing = prev.categoryStates[catId] || {
        cardIndex: 0,
        reviewFilter: 'all',
        isShuffled: false,
        shuffleSeed: 0,
        savedAt: Date.now()
      };

      const updatedCategory: CategoryLearningProgress = {
        ...existing,
        ...updates,
        savedAt: Date.now()
      };

      const updatedProgress: FlashcardSessionProgress = {
        activeCategory: catId as FlashcardCategory | 'all',
        categoryStates: {
          ...prev.categoryStates,
          [catId]: updatedCategory
        }
      };

      saveProgressToStorage(updatedProgress);
      return updatedProgress;
    });
  }, []);

  // Restore saved learning position when sessionCards become available
  useEffect(() => {
    if (sessionCards.length === 0) return;

    // Case 1: Initial mount restore
    if (!isInitialRestoreDoneRef.current) {
      const saved = savedProgress.categoryStates[activeCategory];
      if (saved) {
        if (saved.isRoundFinished) {
          setIsRoundFinished(true);
        } else {
          setIsRoundFinished(false);
          let targetIndex = 0;
          if (saved.cardId) {
            const foundIdx = sessionCards.findIndex(c => c.id === saved.cardId);
            if (foundIdx !== -1) {
              targetIndex = foundIdx;
            } else if (saved.cardIndex >= 0 && saved.cardIndex < sessionCards.length) {
              targetIndex = saved.cardIndex;
            }
          } else if (saved.cardIndex >= 0 && saved.cardIndex < sessionCards.length) {
            targetIndex = saved.cardIndex;
          }
          setCurrentIndex(targetIndex);
          if (targetIndex > 0) {
            setResumedBanner({
              cardIndex: targetIndex,
              totalCards: sessionCards.length,
              cardQuestion: sessionCards[targetIndex]?.question || ''
            });
          }
        }
      }
      isInitialRestoreDoneRef.current = true;
      return;
    }

    // Case 2: Category switch restore
    if (pendingCategoryTargetRef.current && pendingCategoryTargetRef.current.categoryId === activeCategory) {
      const target = pendingCategoryTargetRef.current;
      let targetIndex = 0;
      if (target.cardId) {
        const foundIdx = sessionCards.findIndex(c => c.id === target.cardId);
        if (foundIdx !== -1) {
          targetIndex = foundIdx;
        } else if (target.cardIndex !== undefined && target.cardIndex >= 0 && target.cardIndex < sessionCards.length) {
          targetIndex = target.cardIndex;
        }
      } else if (target.cardIndex !== undefined && target.cardIndex >= 0 && target.cardIndex < sessionCards.length) {
        targetIndex = target.cardIndex;
      }
      setCurrentIndex(targetIndex);
      if (targetIndex > 0 && !isRoundFinished) {
        setResumedBanner({
          cardIndex: targetIndex,
          totalCards: sessionCards.length,
          cardQuestion: sessionCards[targetIndex]?.question || ''
        });
      } else {
        setResumedBanner(null);
      }
      pendingCategoryTargetRef.current = null;
      return;
    }

    // Safe bounds check
    if (currentIndex >= sessionCards.length) {
      setCurrentIndex(Math.max(0, sessionCards.length - 1));
    }
  }, [sessionCards.length, activeCategory]);

  // Persist session progress on every card step / change
  useEffect(() => {
    if (!isInitialRestoreDoneRef.current) return;
    if (sessionCards.length === 0) return;
    if (pendingCategoryTargetRef.current) return;

    const currentCard = sessionCards[currentIndex];
    saveCategoryState(activeCategory, {
      cardId: currentCard?.id,
      cardIndex: currentIndex,
      reviewFilter,
      isShuffled,
      shuffleSeed,
      isRoundFinished,
      savedAt: Date.now()
    });
  }, [currentIndex, activeCategory, reviewFilter, isShuffled, shuffleSeed, isRoundFinished, saveCategoryState]);

  // Save session immediately when window/app unloads or tabs change
  useEffect(() => {
    const handleSaveOnExit = () => {
      if (sessionCards.length > 0 && isInitialRestoreDoneRef.current) {
        const curCard = sessionCards[currentIndex];
        saveCategoryState(activeCategory, {
          cardId: curCard?.id,
          cardIndex: currentIndex,
          reviewFilter,
          isShuffled,
          shuffleSeed,
          isRoundFinished,
          savedAt: Date.now()
        });
      }
    };

    window.addEventListener('beforeunload', handleSaveOnExit);
    return () => {
      window.removeEventListener('beforeunload', handleSaveOnExit);
      handleSaveOnExit();
    };
  }, [currentIndex, activeCategory, reviewFilter, isShuffled, shuffleSeed, isRoundFinished, sessionCards, saveCategoryState]);

  // Category switch with state restoration
  const handleCategoryChange = (catId: FlashcardCategory | 'all') => {
    // Save current before leaving
    if (sessionCards.length > 0 && isInitialRestoreDoneRef.current) {
      const curCard = sessionCards[currentIndex];
      saveCategoryState(activeCategory, {
        cardId: curCard?.id,
        cardIndex: currentIndex,
        reviewFilter,
        isShuffled,
        shuffleSeed,
        isRoundFinished,
        savedAt: Date.now()
      });
    }

    const saved = savedProgress.categoryStates[catId];
    if (saved) {
      setReviewFilter(saved.reviewFilter || 'all');
      setIsShuffled(saved.isShuffled || false);
      setShuffleSeed(saved.shuffleSeed || 0);
      setIsRoundFinished(saved.isRoundFinished || false);
      const targetIdx = saved.cardIndex !== undefined && saved.cardIndex >= 0 ? saved.cardIndex : 0;
      setCurrentIndex(targetIdx);
      pendingCategoryTargetRef.current = {
        categoryId: catId,
        cardId: saved.cardId,
        cardIndex: targetIdx
      };
    } else {
      setReviewFilter('all');
      setIsShuffled(false);
      setIsRoundFinished(false);
      setCurrentIndex(0);
      pendingCategoryTargetRef.current = {
        categoryId: catId,
        cardIndex: 0
      };
    }

    setActiveCategory(catId);
    setIsFlipped(false);
    try {
      localStorage.setItem('fab_flashcard_active_category', catId);
      localStorage.setItem('fab_last_flashcard_category', catId);
    } catch {}
  };

  const handleFilterChange = (filter: ReviewFilter) => {
    setReviewFilter(filter);
    setCurrentIndex(0);
    setIsFlipped(false);
    setIsRoundFinished(false);
  };

  const handleToggleShuffle = () => {
    setIsShuffled(prev => !prev);
    setShuffleSeed(prev => prev + 1);
    setCurrentIndex(0);
    setIsFlipped(false);
  };

  const handleRestartDeck = () => {
    setCurrentIndex(0);
    setIsFlipped(false);
    setIsRoundFinished(false);
    setResumedBanner(null);
    saveCategoryState(activeCategory, {
      cardId: sessionCards[0]?.id,
      cardIndex: 0,
      isRoundFinished: false,
      savedAt: Date.now()
    });
  };

  const handleJumpToCard = (target1BasedNumber: number) => {
    const targetIdx = Math.max(0, Math.min(sessionCards.length - 1, target1BasedNumber - 1));
    setCurrentIndex(targetIdx);
    setIsFlipped(false);
    setIsRoundFinished(false);
    setResumedBanner(null);
    setShowJumpModal(false);
  };

  const handleResetProgress = () => {
    setConfirmConfig({
      isOpen: true,
      title: 'Lernfortschritt zurücksetzen',
      message: activeCategory === 'all'
        ? 'Möchtest du den Status (Gewusst / Noch üben) aller Lernkarten zurücksetzen?'
        : `Möchtest du den Lernfortschritt für „${getCategoryTitle(activeCategory)}“ zurücksetzen?`,
      confirmLabel: 'Zurücksetzen',
      cancelLabel: 'Abbrechen',
      isDestructive: false,
      onConfirm: () => {
        const updated = { ...cardReviews };
        categoryCards.forEach(c => {
          delete updated[c.id];
        });
        setCardReviews(updated);
        saveReviewsToStorage(updated);
        setCurrentIndex(0);
        setIsFlipped(false);
        setIsRoundFinished(false);
        setReviewFilter('all');
        setResumedBanner(null);
        saveCategoryState(activeCategory, {
          cardId: sessionCards[0]?.id,
          cardIndex: 0,
          reviewFilter: 'all',
          isRoundFinished: false,
          savedAt: Date.now()
        });
      }
    });
  };

  const handleNext = useCallback(() => {
    if (sessionCards.length === 0) return;
    if (currentIndex >= sessionCards.length - 1) {
      setIsRoundFinished(true);
      return;
    }
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIndex(prev => Math.min(sessionCards.length - 1, prev + 1));
    }, 120);
  }, [currentIndex, sessionCards.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex <= 0) return;
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIndex(prev => Math.max(0, prev - 1));
    }, 120);
  }, [currentIndex]);

  // NotebookLM Card Action: "Got it!" or "Missed it!"
  const handleMarkCard = (cardId: string, status: ReviewStatus) => {
    const updated = {
      ...cardReviews,
      [cardId]: status
    };
    setCardReviews(updated);
    saveReviewsToStorage(updated);

    // If it's the last card in this review set, complete round
    if (currentIndex >= sessionCards.length - 1) {
      setIsFlipped(false);
      setTimeout(() => {
        setIsRoundFinished(true);
      }, 200);
    } else {
      // Advance to next card
      setIsFlipped(false);
      setTimeout(() => {
        setCurrentIndex(prev => prev + 1);
      }, 150);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is in an input or modal
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
      if (showAddForm || showScanner || showManagementModal || cardForGlossaryModal || explainCard || lightboxImage || confirmConfig || showPauseModal || showJumpModal) return;

      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        setIsFlipped(prev => !prev);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === '1' && isFlipped && currentCard) {
        // 1 = Missed it / Noch üben
        e.preventDefault();
        handleMarkCard(currentCard.id, 'missed');
      } else if (e.key === '2' && isFlipped && currentCard) {
        // 2 = Got it! / Gewusst
        e.preventDefault();
        handleMarkCard(currentCard.id, 'got_it');
      } else if ((e.key === 'p' || e.key === 'P') && currentCard) {
        // P = Pause & Stand merken
        e.preventDefault();
        setShowPauseModal(true);
        setPauseSavedToast(true);
        setTimeout(() => setPauseSavedToast(false), 2500);
      } else if ((e.key === 'j' || e.key === 'J') && currentCard) {
        // J = Zu Karte springen
        e.preventDefault();
        setJumpInput(String(currentIndex + 1));
        setShowJumpModal(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAddForm, showScanner, showManagementModal, cardForGlossaryModal, explainCard, lightboxImage, confirmConfig, showPauseModal, showJumpModal, isFlipped, currentIndex, sessionCards]);

  const openAddForm = () => {
    setEditingCard(null);
    setQuestionInput('');
    setAnswerInput('');
    setMediaInput('');
    setMediaFrontInput('');
    setAiAnswerError('');
    setAiAnswerSuccess(false);
    const targetCat = activeCategory !== 'all' ? activeCategory : getRememberedCategory();
    setCategoryInput(targetCat);
    setDeckMode('edit');
    try {
      localStorage.setItem('fab_flashcard_mode', 'edit');
    } catch {}
    setShowAddForm(true);

    setTimeout(() => {
      if (editFormRef.current) {
        editFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      questionInputRef.current?.focus();
    }, 60);
  };

  const openEditForm = (card: Flashcard, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setActiveCardMenuId(null);
    setEditingCard(card);
    setQuestionInput(card.question);
    setAnswerInput(card.answer);
    setMediaInput(card.mediaUrl || '');
    setMediaFrontInput(card.mediaUrlFront || '');
    setCategoryInput(card.categoryId || 'custom');
    setAiAnswerError('');
    setAiAnswerSuccess(false);
    setDeckMode('edit');
    try {
      localStorage.setItem('fab_flashcard_mode', 'edit');
    } catch {}
    setShowAddForm(true);

    setTimeout(() => {
      if (editFormRef.current) {
        editFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
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
      console.error('Card answer generation error:', err);
      setAiAnswerError(err?.message || 'Antwort konnte nicht generiert werden.');
      setGenerationProgress(null);
    } finally {
      setIsGeneratingAnswer(false);
    }
  };

  const handleSaveCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionInput.trim() || !answerInput.trim()) return;

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
          mediaUrlFront: mediaFrontInput.trim() || undefined,
          mediaUrl: mediaInput.trim() || undefined,
          categoryId: categoryInput as FlashcardCategory,
        });
      } else {
        await addFlashcard({
          question: questionInput.trim(),
          answer: answerInput.trim(),
          mediaUrlFront: mediaFrontInput.trim() || undefined,
          mediaUrl: mediaInput.trim() || undefined,
          categoryId: categoryInput as FlashcardCategory,
          createdAt: Date.now()
        });
      }
      
      setSaveCardProgress({ percent: 100, status: 'Erfolgreich gespeichert!' });
      await new Promise(r => setTimeout(r, 200));

      setShowAddForm(false);
      setEditingCard(null);
      setSaveCardProgress(null);
      await loadCards();
    } catch (err) {
      console.error("Fehler beim Speichern der Lernkarte:", err);
      setSaveCardProgress(null);
    }
  };

  const handleScannerResults = async (results: any[], targetCategoryId?: string) => {
    const assignedCatId = targetCategoryId || (activeCategory !== 'all' ? activeCategory : 'custom');
    setScannerSaveProgress({
      current: 0,
      total: results.length,
      percent: 5,
      status: `Speichere ${results.length} Lernkarten in der APK...`
    });

    let lastTargetCat = assignedCatId;

    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      if (res.question && res.answer) {
        setScannerSaveProgress({
          current: i + 1,
          total: results.length,
          percent: Math.round(((i + 1) / results.length) * 100),
          status: `Speichere Lernkarte ${i + 1} von ${results.length}...`
        });
        const cardCategory = res.categoryId && res.categoryId !== 'new' ? res.categoryId : assignedCatId;
        lastTargetCat = cardCategory;
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
    await loadCards();
    await new Promise(r => setTimeout(r, 200));
    setScannerSaveProgress(null);
    setShowScanner(false);
    onCategoriesUpdated();
    setActiveCategory(lastTargetCat);
  };

  const handleDelete = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setActiveCardMenuId(null);
    setConfirmConfig({
      isOpen: true,
      title: 'Lernkarte löschen',
      message: 'Möchtest du diese Lernkarte wirklich dauerhaft löschen?',
      confirmLabel: 'Löschen',
      cancelLabel: 'Abbrechen',
      isDestructive: true,
      onConfirm: async () => {
        await deleteFlashcard(id);
        await loadCards();
        if (currentIndex >= sessionCards.length - 1) {
          setCurrentIndex(Math.max(0, sessionCards.length - 2));
        }
      }
    });
  };

  // Guaranteed safe index within bounds for current sessionCards
  const safeIndex = sessionCards.length > 0
    ? Math.max(0, Math.min(currentIndex, sessionCards.length - 1))
    : 0;

  const currentCard: Flashcard | undefined = sessionCards.length > 0 ? sessionCards[safeIndex] : undefined;
  const currentCategoryTitle = currentCard ? getCategoryTitle(currentCard.categoryId) : '';
  const currentCardStatus = currentCard ? cardReviews[currentCard.id] : undefined;

  // Safe index constraint: synchronize state currentIndex if it fell out of bounds
  useEffect(() => {
    if (sessionCards.length > 0 && (currentIndex >= sessionCards.length || currentIndex < 0)) {
      setCurrentIndex(safeIndex);
    }
  }, [sessionCards.length, currentIndex, safeIndex]);

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col items-center relative">
      {showScanner && (
        <AIImageScanner 
          type="flashcard" 
          categories={categories}
          initialCategoryId={activeCategory !== 'all' ? activeCategory : 'custom'}
          onClose={() => setShowScanner(false)} 
          onResults={handleScannerResults} 
        />
      )}

      {/* Top Deck Toolbar (NotebookLM Header Style) */}
      <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-4 shadow-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
            <Layers size={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                {getCategoryTitle(activeCategory)}
              </h2>
              <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {categoryCards.length} {categoryCards.length === 1 ? 'Karte' : 'Karten'}
              </span>
            </div>
            <p className="text-xs text-slate-500 truncate">
              Interaktive Lernkartei mit „Gewusst“ &amp; „Noch üben“ (NotebookLM Modus)
            </p>
          </div>
        </div>

        {/* Toolbar Buttons (Hidden during card edit/add to maximize mobile screen space) */}
        {!showAddForm && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {deckMode === 'edit' && (
              <>
                <button 
                  onClick={() => setShowManagementModal(true)}
                  className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
                  title="Karten verwalten & durchsuchen"
                >
                  <ListFilter size={14} className="text-slate-500" />
                  <span>Verwalten</span>
                </button>
                <button 
                  onClick={() => setShowScanner(true)}
                  className="inline-flex items-center gap-1.5 bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 text-blue-800 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border border-blue-200 shadow-2xs cursor-pointer active:scale-98"
                  title="Handgeschriebene Karteikarten (Vorder- & Rückseite) per Foto scannen & zur APK hinzufügen"
                >
                  <PenTool size={13} className="text-blue-600" />
                  <span>Handschrift-Scan</span>
                </button>
                <button 
                  onClick={openAddForm}
                  className="inline-flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-xl text-xs font-semibold hover:bg-blue-700 transition-colors shadow-2xs cursor-pointer"
                >
                  <Plus size={14} />
                  <span>+ Karte</span>
                </button>
              </>
            )}

            {/* Shuffle Toggle */}
            <button
              onClick={handleToggleShuffle}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                isShuffled 
                  ? 'bg-purple-50 text-purple-700 border-purple-200' 
                  : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'
              }`}
              title={isShuffled ? 'Zufallswiedergabe aktiv' : 'Karten mischen'}
            >
              <Shuffle size={13} className={isShuffled ? 'text-purple-600' : 'text-slate-400'} />
              <span className="hidden sm:inline">Mischen</span>
            </button>

            {/* Pause & Bookmark Session */}
            <button
              type="button"
              onClick={() => {
                setShowPauseModal(true);
                setPauseSavedToast(true);
                setTimeout(() => setPauseSavedToast(false), 2500);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 shadow-2xs transition-all"
              title="Lernpause einlegen - Fortschritt ist dauerhaft gesichert"
            >
              <Bookmark size={13} className="text-blue-600 fill-blue-600" />
              <span className="hidden sm:inline">Pause &amp; Merken</span>
              <span className="sm:hidden">Pause</span>
            </button>

            {/* Reset progress */}
            {(stats.gotIt > 0 || stats.missed > 0) && (
              <button
                onClick={handleResetProgress}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors border border-slate-200"
                title="Lernfortschritt dieser Kategorie zurücksetzen"
              >
                <RotateCcw size={13} />
                <span className="hidden sm:inline">Reset</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Add / Edit Form Modal (Edit mode only) */}
      {deckMode === 'edit' && showAddForm && (
        <form 
          ref={editFormRef} 
          onSubmit={handleSaveCard} 
          className="scroll-mt-24 w-full bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 mb-6 shadow-sm animate-in fade-in duration-150"
        >
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
            <h3 className="text-base sm:text-lg font-bold text-slate-800">
              {editingCard ? 'Lernkarte bearbeiten' : 'Neue Lernkarte erstellen'}
            </h3>
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false);
                setEditingCard(null);
              }}
              className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex flex-col gap-4 mb-4 text-left">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Kategorie</label>
              <select 
                value={categoryInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setCategoryInput(val);
                  try {
                    localStorage.setItem('fab_last_flashcard_category', val);
                  } catch {}
                }}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Frage / Vorderseite</label>
              <textarea 
                ref={questionInputRef}
                value={questionInput}
                onChange={(e) => setQuestionInput(e.target.value)}
                onFocus={(e) => {
                  setTimeout(() => {
                    e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }, 150);
                }}
                placeholder="z.B. Was versteht man unter dem Begriff Beckenwassererwärmung?"
                rows={3}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[75px]"
                required
              />

              {/* Front Photo Attachment (Handwritten card front / sketch) */}
              <div className="mt-2">
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Foto / Abbildung zur Vorderseite (optional, z.B. handgeschriebene Frage/Skizze)
                </label>
                {mediaFrontInput ? (
                  <div className="relative inline-block mt-1">
                    <img 
                      src={mediaFrontInput} 
                      alt="Vorderseite Vorschau" 
                      className="max-h-32 rounded-xl border border-slate-300 object-contain bg-slate-100"
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
                      ref={cardFrontFileInputRef} 
                      accept="image/*" 
                      className="hidden" 
                      onChange={handleFrontPhotoSelected} 
                    />
                    <input 
                      type="file" 
                      ref={cardFrontCameraInputRef} 
                      accept="image/*" 
                      capture="environment" 
                      className="hidden" 
                      onChange={handleFrontPhotoSelected} 
                    />
                    <button
                      type="button"
                      disabled={isCompressingPhoto}
                      onClick={() => cardFrontCameraInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {isCompressingPhoto ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                      <span>Vorderseite fotografieren</span>
                    </button>
                    <button
                      type="button"
                      disabled={isCompressingPhoto}
                      onClick={() => cardFrontFileInputRef.current?.click()}
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
              <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                <label className="block text-xs font-bold text-slate-600 uppercase">Antwort / Rückseite</label>
                <button
                  type="button"
                  onClick={handleGenerateAnswer}
                  disabled={isGeneratingAnswer}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shadow-2xs ${
                    isGeneratingAnswer
                      ? 'bg-blue-100 text-blue-700 cursor-not-allowed border border-blue-200'
                      : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white hover:shadow'
                  }`}
                  title="Antwort automatisch von KI formulieren lassen (du kannst sie vor dem Speichern überprüfen & anpassen)"
                >
                  {isGeneratingAnswer ? (
                    <>
                      <Loader2 size={12} className="animate-spin text-blue-600" />
                      <span>KI formuliert Antwort...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={12} className="text-amber-300" />
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
                <div className="mb-2 p-2 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start justify-between text-xs text-emerald-800 animate-in fade-in">
                  <div className="flex items-center gap-1.5 font-medium">
                    <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                    <span>KI-Antwort eingefügt! Du kannst sie vor dem Speichern beliebig anpassen.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAiAnswerSuccess(false)}
                    className="text-emerald-600 hover:text-emerald-800 p-0.5 ml-1"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}

              {aiAnswerError && (
                <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded-xl flex items-start justify-between text-xs text-red-700 animate-in fade-in">
                  <div className="flex items-center gap-1.5">
                    <XCircle size={14} className="text-red-600 shrink-0" />
                    <span>{aiAnswerError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAiAnswerError('')}
                    className="text-red-600 hover:text-red-800 p-0.5 ml-1"
                  >
                    <X size={12} />
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
                placeholder="z.B. Die Aufheizung des Rohwassers auf die vorgeschriebene Beckentemperatur durch Wärmetauscher... (Oder oben auf 'Antwort von KI formulieren lassen' klicken)"
                rows={4}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[110px]"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                Abbildung / Foto zur Antwort (optional)
              </label>

              {mediaInput ? (
                <div className="relative inline-block mt-2">
                  <img 
                    src={mediaInput} 
                    alt="Vorschau" 
                    className="max-h-36 rounded-xl border border-slate-300 object-contain bg-slate-100"
                  />
                  <button 
                    type="button"
                    onClick={() => setMediaInput('')}
                    className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 shadow-md hover:bg-red-700"
                    title="Bild entfernen"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 mt-1">
                  <input 
                    type="file" 
                    ref={cardFileInputRef} 
                    accept="image/*" 
                    className="hidden" 
                    onChange={handlePhotoSelected} 
                  />
                  <input 
                    type="file" 
                    ref={cardCameraInputRef} 
                    accept="image/*" 
                    capture="environment" 
                    className="hidden" 
                    onChange={handlePhotoSelected} 
                  />

                  <button
                    type="button"
                    disabled={isCompressingPhoto}
                    onClick={() => cardCameraInputRef.current?.click()}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    {isCompressingPhoto ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                    <span>Foto aufnehmen</span>
                  </button>

                  <button
                    type="button"
                    disabled={isCompressingPhoto}
                    onClick={() => cardFileInputRef.current?.click()}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    <Upload size={14} />
                    <span>Bild hochladen</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Saving Ladebalken */}
          {saveCardProgress && (
            <div className="mb-3 p-3 rounded-2xl bg-indigo-50/90 border border-indigo-200 animate-in fade-in duration-200">
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

          <div className="sticky bottom-0 bg-white/95 backdrop-blur-xs pt-3 pb-2 border-t border-slate-100 flex justify-end gap-2 z-10">
            <button 
              type="button" 
              disabled={!!saveCardProgress}
              onClick={() => {
                setShowAddForm(false);
                setEditingCard(null);
              }}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
            >
              Abbrechen
            </button>
            <button 
              type="submit" 
              disabled={!!saveCardProgress}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
            >
              {saveCardProgress ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Wird gespeichert...</span>
                </>
              ) : (
                <span>{editingCard ? 'Änderungen speichern' : 'Karte anlegen'}</span>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Scanner Save Progress Banner */}
      {scannerSaveProgress && (
        <div className="w-full mb-4 p-4 rounded-2xl bg-blue-50/95 border border-blue-200 shadow-sm animate-in fade-in duration-200">
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

      {/* Category Pills Tabs & Review Filter Tabs (Hidden during add/edit to maximize mobile screen space) */}
      {!showAddForm && (
        <>
          <div className="w-full flex space-x-2 overflow-x-auto pb-3 mb-4 no-scrollbar">
            {allCategories.map((category) => {
              if (!category || !category.id) return null;
              const catProgress = savedProgress?.categoryStates?.[category.id];
              const hasActivePause = catProgress && catProgress.cardIndex > 0 && !catProgress.isRoundFinished;
              return (
                <button
                  key={category.id}
                  onClick={() => handleCategoryChange(category.id as FlashcardCategory | 'all')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors shrink-0 flex items-center gap-1.5 ${
                    activeCategory === category.id
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
                  }`}
                >
                  <span>{category.title}</span>
                  {hasActivePause && (
                    <span 
                      className={`inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md text-[10px] font-bold ${
                        activeCategory === category.id ? 'bg-blue-700 text-blue-100' : 'bg-blue-50 text-blue-700 border border-blue-200/60'
                      }`}
                      title={`Zuletzt bei Karte ${catProgress.cardIndex + 1} unterbrochen`}
                    >
                      <Bookmark size={9} className={activeCategory === category.id ? 'fill-blue-200 text-blue-200' : 'fill-blue-600 text-blue-600'} />
                      <span>{catProgress.cardIndex + 1}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* NotebookLM Review Filter Tabs (Alle / Noch üben / Gewusst) */}
          <div className="w-full flex items-center justify-between gap-2 mb-4 bg-slate-100/90 p-1 rounded-2xl border border-slate-200/80 flex-wrap">
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleFilterChange('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  reviewFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Alle</span>
                <span className="text-[11px] px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded-full font-semibold">
                  {stats.total}
                </span>
              </button>

              <button
                onClick={() => handleFilterChange('missed')}
                disabled={stats.missed === 0}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${
                  reviewFilter === 'missed'
                    ? 'bg-white text-rose-700 shadow-2xs border border-rose-200/60'
                    : 'text-rose-600 hover:bg-rose-50'
                }`}
                title="Nur Karten anzeigen, die du mit „Noch üben“ markiert hast"
              >
                <RotateCcw size={12} className="stroke-[2.5]" />
                <span>Noch üben</span>
                <span className="text-[11px] px-1.5 py-0.2 bg-rose-100 text-rose-700 rounded-full font-semibold">
                  {stats.missed}
                </span>
              </button>

              <button
                onClick={() => handleFilterChange('got_it')}
                disabled={stats.gotIt === 0}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${
                  reviewFilter === 'got_it'
                    ? 'bg-white text-emerald-800 shadow-2xs border border-emerald-200/60'
                    : 'text-emerald-700 hover:bg-emerald-50'
                }`}
                title="Karten anzeigen, die du bereits beherrschst"
              >
                <Check size={12} className="stroke-[2.5]" />
                <span>Gewusst</span>
                <span className="text-[11px] px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded-full font-semibold">
                  {stats.gotIt}
                </span>
              </button>
            </div>

            {/* Live Mastery indicator */}
            <div className="flex items-center gap-2 pr-2 text-xs font-medium text-slate-500">
              <span className="hidden sm:inline">Fortschritt:</span>
              <span className="font-bold text-slate-800">{stats.percentMastered}%</span>
            </div>
          </div>
        </>
      )}

      {/* Main Deck Container / Empty State / Completion Screen */}
      {categoryCards.length === 0 ? (
        <div className="text-center py-16 px-4 bg-white border border-slate-200 rounded-3xl w-full max-w-xl shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4 border border-blue-100">
            <Layers size={26} />
          </div>
          <h3 className="text-base font-bold text-slate-800 mb-1">
            Keine Lernkarten in dieser Kategorie
          </h3>
          <p className="text-slate-500 text-xs sm:text-sm font-normal mb-5 max-w-sm mx-auto">
            Erstelle deine erste Lernkarte für diesen Bereich oder scanne Karteikarten per Foto ein.
          </p>
          {deckMode === 'edit' ? (
            <button 
              onClick={openAddForm}
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition-colors text-sm shadow-sm"
            >
              <Plus size={16} />
              Erste Karte erstellen
            </button>
          ) : (
            <button 
              onClick={() => {
                handleModeChange('edit');
                openAddForm();
              }}
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition-colors text-sm shadow-sm"
            >
              <Wrench size={15} />
              Zu „Bearbeiten“ wechseln &amp; Karte erstellen
            </button>
          )}
        </div>
      ) : sessionCards.length === 0 || !currentCard ? (
        /* Empty filter state (e.g. no missed cards or switching category) */
        <div className="text-center py-14 px-4 bg-white border border-slate-200 rounded-3xl w-full max-w-xl shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3 border border-emerald-100">
            <CheckCircle2 size={24} />
          </div>
          <h3 className="text-base font-bold text-slate-800 mb-1">
            {reviewFilter === 'missed' ? 'Keine verpassten Karten!' : 'Keine passenden Karten in diesem Filter'}
          </h3>
          <p className="text-slate-500 text-xs sm:text-sm mb-4">
            {reviewFilter === 'missed' 
              ? 'Großartig! Du hast derzeit keine Karten mit „Noch üben“ markiert.'
              : 'Wähle den Filter „Alle“, um alle Lernkarten zu lernen.'}
          </p>
          <button
            onClick={() => handleFilterChange('all')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 transition-colors"
          >
            <span>Alle Karten anzeigen ({stats.total})</span>
          </button>
        </div>
      ) : isRoundFinished ? (
        /* NotebookLM End-of-Deck Summary Screen */
        <div className="w-full bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm text-center max-w-xl animate-in zoom-in-95 duration-200">
          <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4 border border-emerald-100 shadow-xs">
            <Trophy size={32} />
          </div>

          <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
            Lernrunde abgeschlossen
          </span>

          <h3 className="text-xl sm:text-2xl font-black text-slate-900 mt-3 mb-1">
            {stats.percentMastered >= 80 ? 'Hervorragend gemeistert!' : 'Gut gelernt! Wiederhole deine Schwachstellen.'}
          </h3>

          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto mb-6">
            Du hast alle Karten dieser Auswahl durchgearbeitet. Hier ist dein aktueller Lernstand für {getCategoryTitle(activeCategory)}:
          </p>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto mb-6">
            <div className="bg-emerald-50/80 border border-emerald-200/70 rounded-2xl p-3.5 text-center">
              <div className="flex items-center justify-center gap-1.5 text-emerald-700 font-bold text-sm mb-1">
                <Check size={16} className="stroke-[3]" />
                <span>Gewusst</span>
              </div>
              <p className="text-2xl font-black text-emerald-900">{stats.gotIt}</p>
              <p className="text-[11px] text-emerald-700">Karten beherrscht</p>
            </div>

            <div className="bg-rose-50/80 border border-rose-200/70 rounded-2xl p-3.5 text-center">
              <div className="flex items-center justify-center gap-1.5 text-rose-700 font-bold text-sm mb-1">
                <RotateCcw size={15} className="stroke-[2.5]" />
                <span>Noch üben</span>
              </div>
              <p className="text-2xl font-black text-rose-900">{stats.missed}</p>
              <p className="text-[11px] text-rose-700">Karten verpasst</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2.5 max-w-sm mx-auto">
            {stats.missed > 0 && (
              <button
                onClick={() => {
                  setReviewFilter('missed');
                  setCurrentIndex(0);
                  setIsFlipped(false);
                  setIsRoundFinished(false);
                }}
                className="w-full py-3 px-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs sm:text-sm font-bold transition-all shadow-sm flex items-center justify-center gap-2 active:scale-98"
              >
                <RotateCcw size={16} className="stroke-[2.5]" />
                <span>Nur verpasste Karten wiederholen ({stats.missed})</span>
              </button>
            )}

            <button
              onClick={() => {
                setReviewFilter('all');
                setCurrentIndex(0);
                setIsFlipped(false);
                setIsRoundFinished(false);
              }}
              className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs sm:text-sm font-bold transition-all shadow-sm flex items-center justify-center gap-2 active:scale-98"
            >
              <RefreshCw size={15} />
              <span>Gesamtes Deck erneut üben</span>
            </button>

            <button
              onClick={handleResetProgress}
              className="w-full py-2 px-3 text-slate-500 hover:text-slate-700 text-xs font-medium transition-colors"
            >
              Fortschritt für diese Kategorie zurücksetzen
            </button>
          </div>
        </div>
      ) : (
        /* Active Flashcard Review View (NotebookLM Style) */
        <div className="w-full flex flex-col items-center">
          {/* Resume banner notification */}
          {resumedBanner && (
            <div className="w-full max-w-xl mb-3 p-3 bg-blue-50/95 border border-blue-200/90 rounded-2xl flex items-center justify-between gap-3 text-xs text-blue-900 shadow-2xs animate-in fade-in slide-in-from-top-1">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                  <Bookmark size={15} className="fill-white" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 truncate">
                    Lernstand fortgesetzt: Karte {resumedBanner.cardIndex + 1} von {resumedBanner.totalCards}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">
                    Du machst genau da weiter, wo du zuletzt unterbrochen hast.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleRestartDeck}
                  className="px-2.5 py-1 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 shadow-2xs"
                  title="Von der ersten Karte beginnen"
                >
                  <RotateCcw size={11} />
                  <span className="hidden sm:inline">Karte 1</span>
                </button>
                <button
                  type="button"
                  onClick={() => setResumedBanner(null)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-lg transition-colors"
                  title="Hinweis schließen"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Card Progress Header (NotebookLM style) */}
          <div className="w-full max-w-xl mb-3 px-1">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setJumpInput(String(currentIndex + 1));
                    setShowJumpModal(true);
                  }}
                  className="font-bold text-slate-800 hover:text-blue-600 flex items-center gap-1 transition-colors group/jump"
                  title="Klicken, um direkt zu einer Kartennummer zu springen"
                >
                  <span>Karte {currentIndex + 1} von {sessionCards.length}</span>
                  <SlidersHorizontal size={11} className="opacity-40 group-hover/jump:opacity-100 transition-opacity" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowPauseModal(true);
                    setPauseSavedToast(true);
                    setTimeout(() => setPauseSavedToast(false), 2500);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200/80 px-2 py-0.5 rounded-lg transition-colors shadow-2xs"
                  title="Lernpause einlegen - dein Fortschritt wird dauerhaft gespeichert"
                >
                  <Bookmark size={11} className="fill-blue-600 text-blue-600" />
                  <span>Pause</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                {currentCardStatus === 'got_it' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    <Check size={12} className="stroke-[3]" /> Gewusst
                  </span>
                )}
                {currentCardStatus === 'missed' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                    <RotateCcw size={12} className="stroke-[2.5]" /> Noch üben
                  </span>
                )}
                {currentIndex > 0 && (
                  <button
                    type="button"
                    onClick={handleRestartDeck}
                    className="inline-flex items-center gap-0.5 text-[11px] text-slate-400 hover:text-slate-700 transition-colors"
                    title="Zurück zu Karte 1"
                  >
                    <RotateCcw size={11} />
                    <span className="hidden sm:inline">Karte 1</span>
                  </button>
                )}
                <span className="text-slate-400 font-medium">
                  {Math.round(((currentIndex + 1) / sessionCards.length) * 100)}%
                </span>
              </div>
            </div>

            {/* Smooth Progress Bar */}
            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-600 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${((currentIndex + 1) / sessionCards.length) * 100}%` }}
              />
            </div>
          </div>

          {/* 3D Tactile Card Container (NotebookLM Look) */}
          <div 
            className="relative w-full aspect-[4/5] sm:aspect-[4/3] md:aspect-[16/10] min-h-[380px] sm:min-h-[320px] cursor-pointer perspective-1000 mb-6 select-none max-w-xl"
            onClick={() => setIsFlipped(!isFlipped)}
          >
            <motion.div
              className="w-full h-full relative preserve-3d"
              animate={{ rotateY: isFlipped ? 180 : 0 }}
              transition={{ duration: 0.35, ease: "easeInOut" }}
            >
              {/* Card FRONT (Question) */}
              <div 
                className="absolute inset-0 w-full h-full bg-white border border-slate-200/90 rounded-3xl shadow-sm hover:shadow-md transition-shadow flex flex-col p-5 sm:p-7 overflow-hidden backface-hidden"
              >
                {/* Front Top Bar */}
                <div className="flex-shrink-0 flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full">
                      Frage
                    </span>
                    <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full truncate max-w-[160px]">
                      {currentCategoryTitle}
                    </span>
                  </div>

                  {/* Actions / Menu */}
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => currentCard && setExplainCard(currentCard)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 px-2.5 py-1 rounded-xl transition-colors shadow-2xs"
                      title="NotebookLM Erklärung aufrufen"
                    >
                      <Sparkles size={13} className="text-indigo-600" />
                      <span>Erklären</span>
                    </button>

                    {deckMode === 'edit' && currentCard && (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setActiveCardMenuId(activeCardMenuId === currentCard.id ? null : currentCard.id)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                          title="Optionen"
                        >
                          <MoreVertical size={16} />
                        </button>

                        {activeCardMenuId === currentCard.id && (
                          <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-slate-200 rounded-2xl shadow-xl py-1 z-30 animate-in fade-in zoom-in-95">
                            <button
                              type="button"
                              onClick={(e) => openEditForm(currentCard, e)}
                              className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                            >
                              <Edit3 size={14} className="text-slate-500" />
                              <span>Karte bearbeiten</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveCardMenuId(null);
                                setCardToMove(currentCard);
                              }}
                              className="w-full text-left px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 flex items-center gap-2 cursor-pointer"
                            >
                              <FolderInput size={14} className="text-blue-600" />
                              <span>In andere Rubrik...</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveCardMenuId(null);
                                setCardForGlossaryModal(currentCard);
                              }}
                              className="w-full text-left px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50 flex items-center gap-2"
                            >
                              <Sparkles size={14} className="text-amber-600" />
                              <span>Ins Glossar (KI)</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDelete(currentCard.id, e)}
                              className="w-full text-left px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2 border-t border-slate-100"
                            >
                              <Trash2 size={14} />
                              <span>Karte löschen</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Question Text Center */}
                <div className="flex-1 overflow-y-auto flex flex-col no-scrollbar justify-center py-2">
                  <div className="w-full text-center py-3">
                    <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900 leading-snug break-words max-w-full">
                      <FormattedText text={currentCard?.question || ''} />
                    </h3>

                    {/* Front Image Attachment (e.g. photo of handwritten card front / sketch) */}
                    {currentCard?.mediaUrlFront && (
                      <div 
                        className="mt-4 mx-auto max-w-sm w-full max-h-48 overflow-hidden rounded-2xl border border-blue-200 bg-white p-1.5 shadow-2xs relative group/img cursor-zoom-in"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLightboxImage({ 
                            url: currentCard.mediaUrlFront!, 
                            title: `${currentCard.question || ''} (Originalfoto Vorderseite)` 
                          });
                        }}
                      >
                        <img 
                          src={currentCard.mediaUrlFront} 
                          className="w-full h-full max-h-44 object-contain rounded-xl mx-auto" 
                          alt="Originalfoto Vorderseite" 
                        />
                        <div className="absolute bottom-2 right-2 bg-slate-900/70 text-white p-1 rounded-md opacity-70 group-hover/img:opacity-100 transition-opacity">
                          <ZoomIn size={12} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Front Bottom Hint */}
                <div className="flex-shrink-0 pt-3 border-t border-slate-100 text-slate-400 text-xs flex items-center justify-center gap-1.5">
                  <RotateCcw size={13} className="text-slate-400" />
                  <span>Klicken zum Umdrehen / Antwort anzeigen</span>
                </div>
              </div>

              {/* Card BACK (Answer - NotebookLM Clean Light Surface) */}
              <div 
                className="absolute inset-0 w-full h-full bg-slate-50 border border-slate-200/90 rounded-3xl shadow-sm hover:shadow-md transition-shadow flex flex-col p-5 sm:p-7 overflow-hidden backface-hidden"
                style={{ transform: 'rotateY(180deg)' }}
              >
                {/* Back Top Bar */}
                <div className="flex-shrink-0 flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-full">
                      Antwort
                    </span>
                    <span className="text-[11px] font-medium text-slate-500 bg-white border border-slate-200/60 px-2.5 py-1 rounded-full truncate max-w-[160px]">
                      {currentCategoryTitle}
                    </span>
                  </div>

                  {/* Top Right Action: Explain Button */}
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setExplainCard(currentCard)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 bg-white hover:bg-indigo-50 border border-indigo-200/80 px-2.5 py-1 rounded-xl transition-colors shadow-2xs"
                      title="NotebookLM Erklärung aufrufen"
                    >
                      <Sparkles size={13} className="text-indigo-600" />
                      <span>Erklären</span>
                    </button>

                    {deckMode === 'edit' && (
                      <button
                        type="button"
                        onClick={(e) => openEditForm(currentCard, e)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-white transition-colors"
                        title="Bearbeiten"
                      >
                        <Edit3 size={15} />
                      </button>
                    )}
                  </div>
                </div>
                
                {/* Answer Text Center */}
                <div className="flex-1 overflow-y-auto flex flex-col no-scrollbar py-2">
                  <div className="w-full text-center my-auto py-1">
                    <div className="text-base sm:text-lg md:text-xl text-slate-800 font-medium leading-relaxed break-words max-w-full">
                      <FormattedText text={currentCard?.answer || ''} />
                    </div>

                    {/* Image Attachment (if present) */}
                    {currentCard?.mediaUrl && (
                      <div 
                        className="mt-4 mx-auto max-w-sm w-full max-h-48 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xs relative group/img cursor-zoom-in"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLightboxImage({ url: currentCard.mediaUrl!, title: `${currentCard.question || ''} (Abbildung zur Antwort)` });
                        }}
                      >
                        <img 
                          src={currentCard.mediaUrl} 
                          className="w-full h-full max-h-44 object-contain rounded-xl mx-auto" 
                          alt="Abbildung zur Antwort" 
                          onError={(e) => (e.currentTarget.style.display = 'none')} 
                        />
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold gap-1.5 rounded-xl">
                          <ZoomIn size={15} /> Vergrößern
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* NotebookLM Answer Bottom Bar: "Got it!" vs "Missed it!" */}
                <div 
                  className="flex-shrink-0 pt-3 border-t border-slate-200/80 flex items-center gap-2.5 justify-between"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Missed it button */}
                  <button
                    type="button"
                    disabled={!currentCard}
                    onClick={() => currentCard && handleMarkCard(currentCard.id, 'missed')}
                    className={`flex-1 min-h-[44px] py-2.5 px-3 rounded-2xl text-xs sm:text-sm font-bold transition-all shadow-2xs flex items-center justify-center gap-1.5 border active:scale-98 disabled:opacity-40 ${
                      currentCardStatus === 'missed'
                        ? 'bg-rose-600 text-white border-rose-700 ring-2 ring-rose-300'
                        : 'bg-white hover:bg-rose-50 text-rose-700 border-rose-200 hover:border-rose-300'
                    }`}
                    title="Diese Karte nochmals üben (Taste: 1)"
                  >
                    <RotateCcw size={15} className="stroke-[2.5]" />
                    <span>Noch üben</span>
                  </button>

                  {/* Flip back button */}
                  <button
                    type="button"
                    onClick={() => setIsFlipped(false)}
                    className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-white rounded-xl border border-transparent hover:border-slate-200 transition-colors"
                    title="Zurück zur Frage"
                  >
                    <RotateCcw size={14} />
                  </button>

                  {/* Got it button */}
                  <button
                    type="button"
                    disabled={!currentCard}
                    onClick={() => currentCard && handleMarkCard(currentCard.id, 'got_it')}
                    className={`flex-1 min-h-[44px] py-2.5 px-3 rounded-2xl text-xs sm:text-sm font-bold transition-all shadow-2xs flex items-center justify-center gap-1.5 border active:scale-98 disabled:opacity-40 ${
                      currentCardStatus === 'got_it'
                        ? 'bg-emerald-600 text-white border-emerald-700 ring-2 ring-emerald-300'
                        : 'bg-white hover:bg-emerald-50 text-emerald-800 border-emerald-200 hover:border-emerald-300'
                    }`}
                    title="Ich weiß diese Antwort (Taste: 2)"
                  >
                    <Check size={16} className="stroke-[3]" />
                    <span>Gewusst!</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Stepper Navigation (Previous / Next / Key Hints) */}
          <div className="flex items-center justify-between w-full max-w-xl px-2 gap-4">
            <button 
              onClick={handlePrev}
              disabled={currentIndex <= 0}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
              title="Vorherige Karte (Pfeiltaste links)"
            >
              <ChevronLeft size={16} />
              <span>Zurück</span>
            </button>

            <button
              type="button"
              onClick={() => setIsFlipped(!isFlipped)}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline px-2 py-1"
            >
              {isFlipped ? 'Frage ansehen' : 'Antwort aufdecken'}
            </button>

            <button 
              onClick={handleNext}
              disabled={currentIndex >= sessionCards.length - 1}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
              title="Nächste Karte (Pfeiltaste rechts)"
            >
              <span>Weiter</span>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* NotebookLM Explain Modal */}
      {explainCard && (
        <FlashcardExplainModal
          card={explainCard}
          categoryTitle={getCategoryTitle(explainCard.categoryId)}
          allGlossaryTerms={allGlossary}
          onClose={() => setExplainCard(null)}
          onOpenGlossaryModal={(card) => setCardForGlossaryModal(card)}
        />
      )}

      {/* Lightbox Modal */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setLightboxImage(null)}
        >
          <div 
            className="relative bg-white rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate max-w-md">
                {lightboxImage.title}
              </h3>
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

      {/* Flashcard Management & Overview Modal */}
      {showManagementModal && (
        <FlashcardManagementModal
          flashcards={allCards}
          categories={categories}
          onDataUpdated={async () => {
            await loadCards();
            onCategoriesUpdated();
          }}
          onClose={() => setShowManagementModal(false)}
        />
      )}

      {/* Direct Handwritten Flashcards AI Scanner */}
      {showScanner && (
        <AIImageScanner
          type="flashcard"
          categories={categories}
          initialCategoryId={activeCategory !== 'all' ? activeCategory : undefined}
          initialMode="handwritten_cards"
          onResults={handleScannerResults}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* Flashcard to Glossary AI Review Modal */}
      {cardForGlossaryModal && (
        <FlashcardToGlossaryReviewModal
          cards={[{
            id: cardForGlossaryModal.id,
            question: cardForGlossaryModal.question,
            answer: cardForGlossaryModal.answer,
            mediaUrl: cardForGlossaryModal.mediaUrl
          }]}
          onSaved={(count) => {
            setGlossarySuccessToast({ isOpen: true, count });
            setTimeout(() => {
              setGlossarySuccessToast(null);
            }, 4000);
          }}
          onClose={() => setCardForGlossaryModal(null)}
        />
      )}

      {/* Success Toast */}
      {glossarySuccessToast && (
        <div className="fixed bottom-6 right-6 z-60 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl border border-slate-700 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200">
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

      {/* Single Card Move Modal */}
      {cardToMove && (
        <BatchMoveModal
          isOpen={!!cardToMove}
          onClose={() => setCardToMove(null)}
          selectedCards={[cardToMove]}
          categories={categories}
          onMoveConfirmed={handleCardMoved}
          onCreateAndMove={handleCardCreatedAndMoved}
        />
      )}

      {/* Move Operation Toast */}
      {moveToast && (
        <div className="fixed bottom-6 right-6 z-60 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl border border-slate-700 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <CheckCircle2 size={18} />
          </div>
          <div>
            <p className="text-xs font-bold text-white">Lernkarte verschoben</p>
            <p className="text-[11px] text-slate-300">{moveToast}</p>
          </div>
          <button
            onClick={() => setMoveToast(null)}
            className="text-slate-400 hover:text-white p-1 ml-2"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Saved Pause Status Toast */}
      {pauseSavedToast && (
        <div className="fixed bottom-6 right-6 z-60 bg-blue-900 text-white px-4 py-3 rounded-2xl shadow-xl border border-blue-700 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200 max-w-sm">
          <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
            <BookmarkCheck size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-white">
              Lernstand gesichert!
            </p>
            <p className="text-[11px] text-blue-200">
              Karte {currentIndex + 1} von {sessionCards.length} gemerkt. Du kannst jederzeit hier fortsetzen.
            </p>
          </div>
          <button
            onClick={() => setPauseSavedToast(false)}
            className="text-blue-300 hover:text-white p-1 ml-auto"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Pause & Bookmark Session Modal */}
      {showPauseModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setShowPauseModal(false)}
        >
          <div 
            className="relative bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shadow-2xs">
                <Bookmark size={24} className="fill-blue-600 text-blue-600" />
              </div>
              <button
                type="button"
                onClick={() => setShowPauseModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <h3 className="text-lg font-bold text-slate-900 mb-1">
              Lernpause – Stand gemerkt
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Du kannst jederzeit unterbrechen. Dein Lernfortschritt ist automatisch dauerhaft gesichert.
            </p>

            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5 mb-5 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span className="text-slate-500">Thema / Fach:</span>
                <span className="font-bold text-slate-800">{getCategoryTitle(activeCategory)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span className="text-slate-500">Aktuelle Position:</span>
                <span className="font-bold text-blue-600">Karte {currentIndex + 1} von {sessionCards.length}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span className="text-slate-500">Bereits gemeistert:</span>
                <span className="font-bold text-emerald-600">{stats.percentMastered}% ({stats.gotIt} Gewusst)</span>
              </div>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowPauseModal(false)}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-2xs"
              >
                <Play size={15} className="fill-white" />
                <span>An dieser Stelle weiterlernen</span>
              </button>

              {currentIndex > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    handleRestartDeck();
                    setShowPauseModal(false);
                  }}
                  className="w-full py-2 px-4 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  <RotateCcw size={13} />
                  <span>Thema von Karte 1 neu beginnen</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Jump to Card Modal */}
      {showJumpModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setShowJumpModal(false)}
        >
          <div 
            className="relative bg-white rounded-3xl max-w-xs w-full p-5 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
              <h4 className="font-bold text-sm text-slate-800">Zu Karte springen</h4>
              <button
                type="button"
                onClick={() => setShowJumpModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>
            
            <p className="text-xs text-slate-500 mb-3">
              Gib eine Kartennummer zwischen 1 und {sessionCards.length} ein:
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const num = parseInt(jumpInput, 10);
                if (!isNaN(num) && num >= 1 && num <= sessionCards.length) {
                  handleJumpToCard(num);
                }
              }}
            >
              <div className="mb-4">
                <input
                  type="number"
                  min={1}
                  max={sessionCards.length}
                  value={jumpInput}
                  onChange={(e) => setJumpInput(e.target.value)}
                  placeholder={String(currentIndex + 1)}
                  autoFocus
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-center font-bold text-lg text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Quick links */}
              <div className="grid grid-cols-3 gap-1.5 mb-4 text-[11px]">
                <button
                  type="button"
                  onClick={() => setJumpInput('1')}
                  className="py-1 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium"
                >
                  Karte 1
                </button>
                {sessionCards.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setJumpInput(String(Math.ceil(sessionCards.length / 2)))}
                    className="py-1 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium"
                  >
                    Mitte
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setJumpInput(String(sessionCards.length))}
                  className="py-1 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium"
                >
                  Ende
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowJumpModal(false)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex-1 transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex-1 transition-colors shadow-2xs"
                >
                  Springen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* In-App Confirmation Dialog */}
      <ConfirmModal
        config={confirmConfig}
        onClose={() => setConfirmConfig(null)}
      />
    </div>
  );
}
