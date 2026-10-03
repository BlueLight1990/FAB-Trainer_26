import React, { useState, useEffect, useMemo, useRef } from 'react';
import { GlossaryTerm, Category, GlossaryPdfAttachment, AppMode } from '../types';
import { 
  Search, Book, Plus, ExternalLink, Image as ImageIcon, Trash2, Edit3, 
  FileDown, ArrowUpDown, CheckCircle2, Share2, Eye, X, Layers, Camera, 
  Upload, ZoomIn, Sparkles, Check, ImagePlus, Loader2, FileText, Download,
  FolderDown, FileArchive, AlertCircle, Wand2
} from 'lucide-react';
import { 
  getDbData, addGlossaryTerm, updateGlossaryTerm, deleteGlossaryTerm, 
  addFlashcard 
} from '../lib/db';
import { AIImageScanner } from './AIImageScanner';
import { exportGlossaryToPdf } from '../lib/pdfExport';
import { compressImageFile } from '../lib/imageUtils';
import { 
  getTermPdfAttachments, formatFileSize, downloadPdfAttachment, 
  exportGlossaryPdfsAsZip, getAllGlossaryPdfItems, dataUriToBlob 
} from '../lib/glossaryPdfUtils';
import { generateDefinitionWithAI } from '../lib/geminiClient';
import { FormattedText } from './FormattedText';
import { DEFAULT_PRESET_CATEGORIES } from '../data/questions';
import { ConfirmModal, ConfirmDialogConfig } from './ConfirmModal';
import { PdfViewerModal } from './PdfViewerModal';

interface GlossaryListProps {
  categories?: Category[];
  onNavigateToFlashcards?: () => void;
  mode?: AppMode;
}

export function GlossaryList({ categories = [], onNavigateToFlashcards, mode = 'learn' }: GlossaryListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLetter, setSelectedLetter] = useState<string>('all');
  const [sortAscending, setSortAscending] = useState<boolean>(true);
  const [allTerms, setAllTerms] = useState<GlossaryTerm[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [editingTerm, setEditingTerm] = useState<GlossaryTerm | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [showPdfExportModal, setShowPdfExportModal] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<ConfirmDialogConfig | null>(null);
  const [pdfIncludeImages, setPdfIncludeImages] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('fab_glossary_pdf_include_images');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const [pdfExportStatus, setPdfExportStatus] = useState<string>('');

  // Success modal for PDF export
  const [exportSuccessModal, setExportSuccessModal] = useState<{
    isOpen: boolean;
    fileName: string;
    blobUrl?: string;
    dataUri?: string;
    method?: string;
    count: number;
    hasImages?: boolean;
    imagesCount?: number;
  } | null>(null);

  // Lightbox modal for enlarged photo preview
  const [lightboxImage, setLightboxImage] = useState<{
    url: string;
    title: string;
    definition?: string;
  } | null>(null);

  // Flashcard creation tracking & toast
  const [createdCardsMap, setCreatedCardsMap] = useState<Record<string, boolean>>({});
  const [flashcardToast, setFlashcardToast] = useState<{
    isOpen: boolean;
    termTitle: string;
    categoryTitle?: string;
  } | null>(null);

  // Single card creation: modal to pick category before creating
  const [termForFlashcardModal, setTermForFlashcardModal] = useState<GlossaryTerm | null>(null);
  const [selectedFlashcardCategory, setSelectedFlashcardCategory] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('fab_last_flashcard_category');
      if (saved === 'erste_hilfe' || saved === 'unfallverhuetung') return 'technik';
      return saved || 'technik';
    } catch {
      return 'technik';
    }
  });
  const [isCreatingSingleCard, setIsCreatingSingleCard] = useState(false);
  const [singleCardProgress, setSingleCardProgress] = useState<{ percent: number; status: string } | null>(null);

  // Bulk convert to flashcards modal
  const [showBulkFlashcardModal, setShowBulkFlashcardModal] = useState(false);
  const [bulkConvertProgress, setBulkConvertProgress] = useState<{ current: number; total: number; percent: number; currentTerm: string } | null>(null);

  useEffect(() => {
    if (mode === 'learn') {
      setShowAddForm(false);
      setEditingTerm(null);
      setShowScanner(false);
      setShowBulkFlashcardModal(false);
      setTermForFlashcardModal(null);
    }
  }, [mode]);
  const [bulkCategoryTarget, setBulkCategoryTarget] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('fab_last_flashcard_category');
      if (saved === 'erste_hilfe' || saved === 'unfallverhuetung') return 'technik';
      return saved || 'technik';
    } catch {
      return 'technik';
    }
  });
  const [isBulkConverting, setIsBulkConverting] = useState(false);
  const [bulkSuccessCount, setBulkSuccessCount] = useState<number | null>(null);

  // Form states
  const [termInput, setTermInput] = useState('');
  const [definitionInput, setDefinitionInput] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [mediaInput, setMediaInput] = useState('');
  const [showUrlField, setShowUrlField] = useState(false);
  const [isCompressingImage, setIsCompressingImage] = useState(false);

  // PDF attachments state in add/edit form
  const [pdfAttachmentsInput, setPdfAttachmentsInput] = useState<GlossaryPdfAttachment[]>([]);
  // Quick PDF upload directly on card
  const [quickPdfTargetTerm, setQuickPdfTargetTerm] = useState<GlossaryTerm | null>(null);
  // Separate PDF export modal
  const [showPdfAttachmentsExportModal, setShowPdfAttachmentsExportModal] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [zipProgressText, setZipProgressText] = useState('');
  // In-app PDF viewer lightbox modal
  const [pdfViewerModal, setPdfViewerModal] = useState<{
    url: string;
    name: string;
    termTitle: string;
  } | null>(null);

  // Quick photo upload directly on card
  const [quickPhotoTargetTerm, setQuickPhotoTargetTerm] = useState<GlossaryTerm | null>(null);

  // File input refs
  const formFileInputRef = useRef<HTMLInputElement>(null);
  const formCameraInputRef = useRef<HTMLInputElement>(null);
  const quickPhotoInputRef = useRef<HTMLInputElement>(null);
  const formPdfInputRef = useRef<HTMLInputElement>(null);
  const quickPdfInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const termInputRef = useRef<HTMLInputElement>(null);
  const definitionInputRef = useRef<HTMLTextAreaElement>(null);

  // AI Definition generation state
  const [isGeneratingDefinition, setIsGeneratingDefinition] = useState(false);
  const [aiGenerationError, setAiGenerationError] = useState<string>('');
  const [aiGeneratedSuccess, setAiGeneratedSuccess] = useState(false);

  const loadTerms = async () => {
    try {
      const db = await getDbData();
      setAllTerms(prev => {
        const next = db.glossary || [];
        if (prev.length === next.length && prev === next) return prev;
        return next;
      });
    } catch (e) {
      console.error('Fehler beim Laden des Glossars:', e);
    }
  };

  useEffect(() => {
    loadTerms();
    const handleDbUpdate = () => loadTerms();
    window.addEventListener('fab-db-updated', handleDbUpdate);
    return () => {
      window.removeEventListener('fab-db-updated', handleDbUpdate);
    };
  }, []);

  // Compute available first letters from all terms
  const availableLetters = useMemo(() => {
    const letters = new Set<string>();
    allTerms.forEach(item => {
      const char = item.term.trim().charAt(0).toUpperCase();
      if (char) letters.add(char);
    });
    return Array.from(letters).sort((a, b) => a.localeCompare(b, 'de'));
  }, [allTerms]);

  // Clean deduplicated list of categories / Rubriken
  const availableCategories = useMemo(() => {
    const list = (categories && categories.length > 0 ? categories : DEFAULT_PRESET_CATEGORIES)
      .filter(c => c.id !== 'all');
    
    const map = new Map<string, Category>();
    list.forEach(cat => {
      map.set(cat.id, cat);
    });

    if (!map.has('custom')) {
      map.set('custom', {
        id: 'custom',
        title: 'Eigene Kategorie',
        description: 'Benutzerdefinierte Lernkarten',
        iconName: 'Plus'
      });
    }

    return Array.from(map.values());
  }, [categories]);

  const selectedCategoryObj = useMemo(() => {
    return availableCategories.find(c => c.id === selectedFlashcardCategory) || availableCategories[0];
  }, [availableCategories, selectedFlashcardCategory]);

  const bulkCategoryObj = useMemo(() => {
    return availableCategories.find(c => c.id === bulkCategoryTarget) || availableCategories[0];
  }, [availableCategories, bulkCategoryTarget]);

  // Filtered & Alphabetically Sorted Glossary
  const filteredGlossary = useMemo(() => {
    return allTerms
      .filter(item => {
        const matchesSearch = 
          item.term.toLowerCase().includes(searchTerm.toLowerCase()) || 
          item.definition.toLowerCase().includes(searchTerm.toLowerCase());
        
        const firstLetter = item.term.trim().charAt(0).toUpperCase();
        const matchesLetter = selectedLetter === 'all' || firstLetter === selectedLetter;

        return matchesSearch && matchesLetter;
      })
      .sort((a, b) => {
        const cmp = a.term.localeCompare(b.term, 'de', { sensitivity: 'base' });
        return sortAscending ? cmp : -cmp;
      });
  }, [allTerms, searchTerm, selectedLetter, sortAscending]);

  // Group terms by first letter for visual headings
  const groupedTerms = useMemo(() => {
    const groups: Record<string, GlossaryTerm[]> = {};
    filteredGlossary.forEach(item => {
      const char = item.term.trim().charAt(0).toUpperCase() || '#';
      if (!groups[char]) groups[char] = [];
      groups[char].push(item);
    });
    return groups;
  }, [filteredGlossary]);

  const sortedGroupKeys = useMemo(() => {
    const keys = Object.keys(groupedTerms);
    return sortAscending
      ? keys.sort((a, b) => a.localeCompare(b, 'de'))
      : keys.sort((a, b) => b.localeCompare(a, 'de'));
  }, [groupedTerms, sortAscending]);

  // PDF attachments extracted from terms
  const allPdfItems = useMemo(() => {
    return getAllGlossaryPdfItems(allTerms);
  }, [allTerms]);

  const filteredPdfItems = useMemo(() => {
    return getAllGlossaryPdfItems(filteredGlossary);
  }, [filteredGlossary]);

  const openAddForm = () => {
    setEditingTerm(null);
    setTermInput('');
    setDefinitionInput('');
    setLinkInput('');
    setMediaInput('');
    setPdfAttachmentsInput([]);
    setShowUrlField(false);
    setAiGenerationError('');
    setAiGeneratedSuccess(false);
    setShowAddForm(true);

    setTimeout(() => {
      if (formRef.current) {
        formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      termInputRef.current?.focus();
    }, 60);
  };

  const openEditForm = (term: GlossaryTerm) => {
    setEditingTerm(term);
    setTermInput(term.term);
    setDefinitionInput(term.definition);
    setLinkInput(term.linkUrl || '');
    setMediaInput(term.mediaUrl || '');
    setPdfAttachmentsInput(getTermPdfAttachments(term));
    setShowUrlField(!!term.linkUrl || (!!term.mediaUrl && !term.mediaUrl.startsWith('data:')));
    setAiGenerationError('');
    setAiGeneratedSuccess(false);
    setShowAddForm(true);

    setTimeout(() => {
      if (formRef.current) {
        formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      termInputRef.current?.focus();
    }, 60);
  };

  const handleGenerateDefinition = async () => {
    const cleanTerm = termInput.trim();
    if (!cleanTerm) {
      setAiGenerationError('Bitte gib zuerst oben eine Fachbezeichnung / einen Begriff ein.');
      termInputRef.current?.focus();
      return;
    }

    setIsGeneratingDefinition(true);
    setAiGenerationError('');
    setAiGeneratedSuccess(false);

    try {
      const generated = await generateDefinitionWithAI(cleanTerm);
      if (generated) {
        setDefinitionInput(generated);
        setAiGeneratedSuccess(true);
        setTimeout(() => {
          definitionInputRef.current?.focus();
        }, 80);
      } else {
        throw new Error('Keine Erklärung vom Modell zurückgegeben.');
      }
    } catch (err: any) {
      console.error('AI generation failed:', err);
      setAiGenerationError(
        err?.message || 'Erklärung konnte nicht generiert werden. Bitte prüfe deinen API-Schlüssel in den Einstellungen.'
      );
    } finally {
      setIsGeneratingDefinition(false);
    }
  };

  // PDF Attachment Handlers
  const handlePdfFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      alert('Bitte wähle eine gültige PDF-Datei aus.');
      e.target.value = '';
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      alert('Die PDF-Datei ist zu groß (maximal 25 MB erlaubt).');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const newAttachment: GlossaryPdfAttachment = {
        id: `pdf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: file.name,
        dataUrl,
        size: file.size,
        uploadedAt: Date.now()
      };
      setPdfAttachmentsInput(prev => [...prev, newAttachment]);
    };
    reader.onerror = (err) => {
      console.error('Fehler beim Einlesen des PDFs:', err);
      alert('Die PDF-Datei konnte nicht eingelesen werden.');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemovePdfAttachmentFromForm = (id: string) => {
    setPdfAttachmentsInput(prev => prev.filter(p => p.id !== id));
  };

  const handleQuickPdfFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !quickPdfTargetTerm) return;

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      alert('Bitte wähle eine gültige PDF-Datei aus.');
      e.target.value = '';
      setQuickPdfTargetTerm(null);
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      alert('Die PDF-Datei ist zu groß (maximal 25 MB erlaubt).');
      e.target.value = '';
      setQuickPdfTargetTerm(null);
      return;
    }

    const targetTerm = quickPdfTargetTerm;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = reader.result as string;
        const newAttachment: GlossaryPdfAttachment = {
          id: `pdf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: file.name,
          dataUrl,
          size: file.size,
          uploadedAt: Date.now()
        };
        const currentAtts = getTermPdfAttachments(targetTerm);
        const updatedAtts = [...currentAtts, newAttachment];
        await updateGlossaryTerm(targetTerm.id, {
          pdfAttachments: updatedAtts,
          pdfUrl: updatedAtts[0]?.dataUrl,
          pdfName: updatedAtts[0]?.name,
          pdfSize: updatedAtts[0]?.size
        });
        await loadTerms();
      } catch (err: any) {
        console.error('Fehler beim Anhängen des PDFs:', err);
        alert('PDF konnte nicht gespeichert werden: ' + (err?.message || 'Unbekannt'));
      } finally {
        setQuickPdfTargetTerm(null);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemovePdfFromTerm = (term: GlossaryTerm, attachmentId: string, pdfName: string) => {
    setConfirmConfig({
      isOpen: true,
      title: 'PDF-Anhang entfernen',
      message: `Möchtest du das Dokument „${pdfName}“ von „${term.term}“ wirklich entfernen?`,
      confirmLabel: 'Entfernen',
      cancelLabel: 'Abbrechen',
      isDestructive: true,
      onConfirm: async () => {
        const current = getTermPdfAttachments(term);
        const updated = current.filter(p => p.id !== attachmentId);
        await updateGlossaryTerm(term.id, {
          pdfAttachments: updated,
          pdfUrl: updated.length > 0 ? updated[0].dataUrl : undefined,
          pdfName: updated.length > 0 ? updated[0].name : undefined,
          pdfSize: updated.length > 0 ? updated[0].size : undefined,
        });
        await loadTerms();
      }
    });
  };

  const handleDownloadSinglePdf = async (pdf: GlossaryPdfAttachment | { name: string; dataUrl: string; size?: number }, termTitle: string) => {
    try {
      await downloadPdfAttachment(pdf, termTitle);
    } catch (err: any) {
      console.error('Fehler beim PDF Download:', err);
      alert('PDF konnte nicht heruntergeladen werden: ' + (err?.message || ''));
    }
  };

  const handleExportAllPdfsZip = async () => {
    try {
      setIsExportingZip(true);
      setZipProgressText('Starte Archivierung...');
      const targetTerms = filteredGlossary.length > 0 ? filteredGlossary : allTerms;
      await exportGlossaryPdfsAsZip(targetTerms, {
        onProgress: (_pct, status) => {
          setZipProgressText(status);
        }
      });
      setIsExportingZip(false);
      setZipProgressText('');
    } catch (err: any) {
      console.error('Fehler beim Erstellen des ZIP-Archivs:', err);
      alert('ZIP-Archivierung fehlgeschlagen: ' + (err?.message || 'Unbekannter Fehler'));
      setIsExportingZip(false);
      setZipProgressText('');
    }
  };

  // Image Upload Handlers
  const handleImageFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsCompressingImage(true);
      const compressedDataUrl = await compressImageFile(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.82
      });
      setMediaInput(compressedDataUrl);
    } catch (err: any) {
      console.error('Fehler bei Bildverarbeitung:', err);
      alert('Das Foto konnte nicht verarbeitet werden: ' + (err?.message || 'Ungültiges Format'));
    } finally {
      setIsCompressingImage(false);
      // Reset input value so same file can be re-selected if needed
      e.target.value = '';
    }
  };

  const handleQuickPhotoFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !quickPhotoTargetTerm) return;

    try {
      const compressedDataUrl = await compressImageFile(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.82
      });
      await updateGlossaryTerm(quickPhotoTargetTerm.id, {
        mediaUrl: compressedDataUrl,
        mediaType: 'image'
      });
      await loadTerms();
    } catch (err: any) {
      console.error('Fehler beim Hinzufügen des Fotos:', err);
      alert('Fehler beim Hinzufügen des Fotos: ' + (err?.message || 'Unbekannt'));
    } finally {
      setQuickPhotoTargetTerm(null);
      e.target.value = '';
    }
  };

  const handleRemovePhoto = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setMediaInput('');
  };

  const handleCardRemovePhoto = (term: GlossaryTerm, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmConfig({
      isOpen: true,
      title: 'Foto entfernen',
      message: `Möchtest du das Foto für "${term.term}" wirklich entfernen?`,
      confirmLabel: 'Entfernen',
      cancelLabel: 'Abbrechen',
      isDestructive: true,
      onConfirm: async () => {
        await updateGlossaryTerm(term.id, {
          mediaUrl: undefined,
          mediaType: undefined
        });
        await loadTerms();
      }
    });
  };

  const handleSaveTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!termInput.trim() || !definitionInput.trim()) return;

    try {
      const pdfAttsToSave = pdfAttachmentsInput.length > 0 ? pdfAttachmentsInput : undefined;
      const primaryPdf = pdfAttachmentsInput[0];

      if (editingTerm) {
        await updateGlossaryTerm(editingTerm.id, {
          term: termInput.trim(),
          definition: definitionInput.trim(),
          linkUrl: linkInput.trim() || undefined,
          mediaUrl: mediaInput.trim() || undefined,
          mediaType: mediaInput.trim() ? 'image' : undefined,
          pdfAttachments: pdfAttsToSave,
          pdfUrl: primaryPdf?.dataUrl,
          pdfName: primaryPdf?.name,
          pdfSize: primaryPdf?.size,
        });
      } else {
        await addGlossaryTerm({
          term: termInput.trim(),
          definition: definitionInput.trim(),
          linkUrl: linkInput.trim() || undefined,
          mediaUrl: mediaInput.trim() || undefined,
          mediaType: mediaInput.trim() ? 'image' : undefined,
          pdfAttachments: pdfAttsToSave,
          pdfUrl: primaryPdf?.dataUrl,
          pdfName: primaryPdf?.name,
          pdfSize: primaryPdf?.size,
          createdAt: Date.now()
        });
      }
      
      setTermInput('');
      setDefinitionInput('');
      setLinkInput('');
      setMediaInput('');
      setPdfAttachmentsInput([]);
      setEditingTerm(null);
      setShowAddForm(false);
      await loadTerms();
    } catch (err) {
      console.error("Fehler beim Speichern des Begriffs:", err);
    }
  };

  const handleScannerResults = async (results: any[]) => {
    for (const res of results) {
      if (res.term && res.definition) {
        await addGlossaryTerm({
          term: res.term,
          definition: res.definition,
          createdAt: Date.now()
        });
      }
    }
    await loadTerms();
    setShowScanner(false);
  };

  const handleDelete = (id: string, termName: string) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Fachbegriff löschen',
      message: `Möchtest du den Fachbegriff "${termName}" wirklich dauerhaft löschen?`,
      confirmLabel: 'Löschen',
      cancelLabel: 'Abbrechen',
      isDestructive: true,
      onConfirm: async () => {
        await deleteGlossaryTerm(id);
        await loadTerms();
      }
    });
  };

  // Flashcard Creation Modal: open dialog to select category first
  const handleOpenFlashcardModal = (item: GlossaryTerm) => {
    setTermForFlashcardModal(item);
    try {
      const saved = localStorage.getItem('fab_last_flashcard_category');
      if (saved && availableCategories.some(c => c.id === saved)) {
        setSelectedFlashcardCategory(saved);
      } else if (availableCategories.length > 0) {
        setSelectedFlashcardCategory(availableCategories[0].id);
      }
    } catch {}
  };

  // Confirm Single Flashcard Creation with chosen category
  const handleConfirmSingleFlashcard = async () => {
    if (!termForFlashcardModal) return;
    try {
      setIsCreatingSingleCard(true);
      setSingleCardProgress({ percent: 35, status: 'Lernkartei wird vorbereitet...' });
      const targetCatId = selectedFlashcardCategory || availableCategories[0]?.id || 'technik';
      const catObj = availableCategories.find(c => c.id === targetCatId);
      const catTitle = catObj?.title || 'Lernkarten';

      // Persist chosen category for upcoming cards
      try {
        localStorage.setItem('fab_last_flashcard_category', targetCatId);
      } catch {}

      setSingleCardProgress({ percent: 75, status: `Wird als Lernkarte in „${catTitle}“ gespeichert...` });

      await addFlashcard({
        question: termForFlashcardModal.term,
        answer: termForFlashcardModal.definition,
        mediaUrl: termForFlashcardModal.mediaUrl,
        categoryId: targetCatId,
        createdAt: Date.now()
      });

      setSingleCardProgress({ percent: 100, status: 'Gespeichert!' });
      await new Promise(r => setTimeout(r, 200));

      // Mark this term as created in local map
      setCreatedCardsMap(prev => ({ ...prev, [termForFlashcardModal.id]: true }));

      // Show toast with selected category title
      setFlashcardToast({
        isOpen: true,
        termTitle: termForFlashcardModal.term,
        categoryTitle: catTitle
      });

      // Auto-hide toast after 4.5 seconds
      setTimeout(() => {
        setFlashcardToast(prev => (prev?.termTitle === termForFlashcardModal.term ? null : prev));
      }, 4500);

      setTermForFlashcardModal(null);
      setSingleCardProgress(null);
    } catch (err: any) {
      console.error('Fehler beim Erstellen der Lernkarte:', err);
      alert('Konnte nicht als Lernkartei angelegt werden: ' + (err?.message || 'Unbekannter Fehler'));
      setSingleCardProgress(null);
    } finally {
      setIsCreatingSingleCard(false);
    }
  };

  // Bulk Convert to Flashcards
  const handleBulkConvert = async () => {
    try {
      setIsBulkConverting(true);
      const termsToConvert = filteredGlossary.length > 0 ? filteredGlossary : allTerms;
      
      // Persist chosen category
      try {
        localStorage.setItem('fab_last_flashcard_category', bulkCategoryTarget);
      } catch {}

      setBulkConvertProgress({
        current: 0,
        total: termsToConvert.length,
        percent: 5,
        currentTerm: 'Starte Erstellung...'
      });

      let count = 0;
      for (let i = 0; i < termsToConvert.length; i++) {
        const item = termsToConvert[i];
        setBulkConvertProgress({
          current: i + 1,
          total: termsToConvert.length,
          percent: Math.round(((i + 1) / termsToConvert.length) * 100),
          currentTerm: item.term
        });

        await addFlashcard({
          question: item.term,
          answer: item.definition,
          mediaUrl: item.mediaUrl,
          categoryId: bulkCategoryTarget,
          createdAt: Date.now()
        });
        count++;
      }

      await new Promise(r => setTimeout(r, 200));
      setBulkSuccessCount(count);
      setBulkConvertProgress(null);

      // Mark all converted as created
      const newMap: Record<string, boolean> = { ...createdCardsMap };
      termsToConvert.forEach(t => { newMap[t.id] = true; });
      setCreatedCardsMap(newMap);

    } catch (err: any) {
      console.error('Fehler beim Massen-Import:', err);
      alert('Fehler beim Erstellen der Lernkarten: ' + (err?.message || 'Unbekannter Fehler'));
      setBulkConvertProgress(null);
    } finally {
      setIsBulkConverting(false);
    }
  };

  const termsToExport = filteredGlossary.length > 0 ? filteredGlossary : allTerms;
  const termsWithImagesCount = useMemo(() => {
    return termsToExport.filter(t => !!t.mediaUrl).length;
  }, [termsToExport]);

  const handleExportPdf = async () => {
    try {
      setIsExportingPdf(true);
      setPdfExportStatus('Lade Begriffe & Layout...');
      const filterNotice = searchTerm 
        ? `Suchbegriff: "${searchTerm}"` 
        : selectedLetter !== 'all' 
          ? `Buchstabe: "${selectedLetter}"` 
          : undefined;

      const shouldIncludeImages = pdfIncludeImages && termsWithImagesCount > 0;

      const result = await exportGlossaryToPdf(termsToExport, {
        filterSubtitle: filterNotice,
        includeImages: shouldIncludeImages,
        onProgress: (_curr, _tot, statusText) => {
          setPdfExportStatus(statusText);
        }
      });

      setShowPdfExportModal(false);
      setExportSuccessModal({
        isOpen: true,
        fileName: result.fileName,
        blobUrl: result.blobUrl,
        dataUri: result.dataUri,
        method: result.method,
        count: result.itemCount,
        hasImages: shouldIncludeImages,
        imagesCount: termsWithImagesCount
      });
    } catch (err: any) {
      console.error("Fehler beim Erstellen der PDF:", err);
      alert("Fehler beim Erstellen der PDF-Datei: " + (err?.message || 'Unbekannter Fehler'));
    } finally {
      setIsExportingPdf(false);
      setPdfExportStatus('');
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Hidden file input for quick direct photo upload on card */}
      <input
        type="file"
        ref={quickPhotoInputRef}
        accept="image/*"
        className="hidden"
        onChange={handleQuickPhotoFileSelected}
      />

      {/* Hidden file input for quick direct PDF upload on card */}
      <input
        type="file"
        ref={quickPdfInputRef}
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={handleQuickPdfFileSelected}
      />

      {showScanner && (
        <AIImageScanner 
          type="glossary" 
          onClose={() => setShowScanner(false)} 
          onResults={handleScannerResults} 
        />
      )}

      {/* Action Toolbar & Filters (Hidden during add/edit to maximize screen space for keyboard) */}
      {!showAddForm && (
        <>
          <div className="mb-6 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="text"
                className="block w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm shadow-xs"
                placeholder="Fachbegriff oder Erklärung suchen..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              {/* Alphabet Sort Toggle */}
              <button
                onClick={() => setSortAscending(!sortAscending)}
                className="flex items-center gap-1.5 px-3 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs sm:text-sm font-medium transition-colors shadow-xs"
                title={sortAscending ? 'Aktuell A → Z (Klick für Z → A)' : 'Aktuell Z → A (Klick für A → Z)'}
              >
                <ArrowUpDown size={15} />
                <span>{sortAscending ? 'A → Z' : 'Z → A'}</span>
              </button>

              {/* Bulk Convert to Flashcards Button (Edit Mode Only) */}
              {mode === 'edit' && (
                <button
                  onClick={() => {
                    setBulkSuccessCount(null);
                    setShowBulkFlashcardModal(true);
                  }}
                  disabled={allTerms.length === 0}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-xs"
                  title="Glossarbegriffe in die Lernkartei übertragen"
                >
                  <Layers size={15} />
                  <span className="hidden sm:inline">Als Lernkarten</span>
                </button>
              )}

              {/* PDF Export Button */}
              <button
                onClick={() => setShowPdfExportModal(true)}
                disabled={allTerms.length === 0}
                className="flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-xs disabled:opacity-50"
                title="Fachbegriffe als PDF exportieren (optional mit Bildern)"
              >
                <FileDown size={15} />
                <span>PDF Export</span>
              </button>

              {/* PDF Attachments Export Button */}
              <button
                onClick={() => setShowPdfAttachmentsExportModal(true)}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-xs ${
                  allPdfItems.length > 0
                    ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200'
                }`}
                title="Angehängte PDF-Dokumente ansehen & separat als ZIP exportieren"
              >
                <FolderDown size={15} className="text-rose-600" />
                <span className="hidden sm:inline">PDF-Anhänge</span>
                <span className="sm:hidden">PDFs</span>
                {allPdfItems.length > 0 && (
                  <span className="px-1.5 py-0.2 bg-rose-600 text-white rounded-full text-[11px] font-bold">
                    {allPdfItems.length}
                  </span>
                )}
              </button>

              {/* Photo Scan Button (Edit Mode Only) */}
              {mode === 'edit' && (
                <button 
                  onClick={() => setShowScanner(true)}
                  className="flex items-center gap-1.5 bg-slate-100 text-slate-700 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold hover:bg-slate-200 transition-colors"
                  title="Text aus Fotos einscannen"
                >
                  <ImageIcon size={15} />
                  <span className="hidden md:inline">Foto-Scan</span>
                </button>
              )}

              {/* Add Term Button (Edit Mode Only) */}
              {mode === 'edit' && (
                <button 
                  onClick={openAddForm}
                  className="flex items-center gap-1.5 bg-blue-600 text-white px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold hover:bg-blue-700 transition-colors shadow-xs"
                >
                  <Plus size={16} />
                  <span>Neuer Begriff</span>
                </button>
              )}
            </div>
          </div>

          {/* Alphabet Quick Filter Bar (A-Z) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-2.5 mb-6 shadow-xs flex items-center gap-1 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setSelectedLetter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 ${
                selectedLetter === 'all'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Alle ({allTerms.length})
            </button>
            
            {/* Letters A to Z */}
            {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(char => {
              const count = allTerms.filter(t => t.term.trim().charAt(0).toUpperCase() === char).length;
              const isSelected = selectedLetter === char;
              const hasTerms = count > 0;

              return (
                <button
                  key={char}
                  disabled={!hasTerms}
                  onClick={() => setSelectedLetter(isSelected ? 'all' : char)}
                  className={`w-7 h-7 rounded-lg text-xs font-semibold flex items-center justify-center transition-colors shrink-0 ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-xs'
                      : hasTerms
                        ? 'text-slate-700 hover:bg-blue-50 hover:text-blue-700 font-bold'
                        : 'text-slate-300 opacity-40 cursor-not-allowed'
                  }`}
                  title={hasTerms ? `${count} Begriff(e) mit ${char}` : `Keine Begriffe mit ${char}`}
                >
                  {char}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Add / Edit Form Modal/Drawer */}
      {showAddForm && (
        <form 
          ref={formRef} 
          onSubmit={handleSaveTerm} 
          className="scroll-mt-24 bg-white border border-slate-200 rounded-2xl p-6 mb-8 shadow-sm text-left animate-in fade-in duration-200"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-slate-800">
              {editingTerm ? 'Fachbegriff bearbeiten' : 'Neuen Fachbegriff hinzufügen'}
            </h3>
            <button
              type="button"
              onClick={() => { setShowAddForm(false); setEditingTerm(null); }}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
            >
              <X size={20} />
            </button>
          </div>

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Begriff / Fachbezeichnung *
              </label>
              <input
                ref={termInputRef}
                type="text"
                required
                placeholder="z. B. Flockungsmittel, Redox-Spannung, Legionellen"
                value={termInput}
                onChange={(e) => setTermInput(e.target.value)}
                onFocus={(e) => {
                  setTimeout(() => {
                    e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }, 150);
                }}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-slate-800 text-sm font-medium"
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Definition & Erklärung *
                </label>
                <button
                  type="button"
                  onClick={handleGenerateDefinition}
                  disabled={isGeneratingDefinition}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-sm ${
                    isGeneratingDefinition
                      ? 'bg-blue-100 text-blue-700 cursor-not-allowed border border-blue-200'
                      : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800 text-white hover:shadow hover:scale-[1.01] active:scale-[0.99]'
                  }`}
                  title="Erklärung automatisch durch KI formulieren lassen (du kannst sie vor dem Speichern überprüfen & bearbeiten)"
                >
                  {isGeneratingDefinition ? (
                    <>
                      <Loader2 size={13} className="animate-spin text-blue-600" />
                      <span>KI formuliert Erklärung...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={13} className="text-amber-300" />
                      <span>Erklärung von KI formulieren lassen</span>
                    </>
                  )}
                </button>
              </div>

              {aiGeneratedSuccess && (
                <div className="mb-2.5 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start justify-between text-xs text-emerald-800 animate-in fade-in">
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>KI-Erklärung eingefügt!</strong> Du kannst sie jetzt im Textfeld unten überprüfen, anpassen oder direkt speichern.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAiGeneratedSuccess(false)}
                    className="text-emerald-600 hover:text-emerald-800 p-0.5 ml-2"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {aiGenerationError && (
                <div className="mb-2.5 p-2.5 bg-red-50 border border-red-200 rounded-xl flex items-start justify-between text-xs text-red-700 animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
                    <span>{aiGenerationError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAiGenerationError('')}
                    className="text-red-600 hover:text-red-800 p-0.5 ml-2"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              <textarea
                ref={definitionInputRef}
                required
                placeholder="Umfassende Beschreibung des Fachbegriffs, Wirkungsweise, Grenzwerte oder relevante DIN-Vorschriften... (Oder klicke oben auf 'Erklärung von KI formulieren lassen')"
                value={definitionInput}
                onChange={(e) => {
                  setDefinitionInput(e.target.value);
                  if (aiGeneratedSuccess) setAiGeneratedSuccess(false);
                }}
                onFocus={(e) => {
                  setTimeout(() => {
                    e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }, 150);
                }}
                rows={5}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-y text-slate-800 text-sm leading-relaxed min-h-[110px]"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Tipp: Wenn du keinen Erklärungstext hast, gib einfach den Begriff oben ein und klicke auf "Erklärung von KI formulieren lassen". Du behältst die volle Kontrolle und kannst alles vor dem Speichern anpassen.
              </p>
            </div>

            {/* Photo / Image Upload Section */}
            <div className="pt-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Foto / Diagramm hinzufügen (optional)
              </label>

              {/* Hidden file inputs */}
              <input
                type="file"
                ref={formFileInputRef}
                accept="image/*"
                className="hidden"
                onChange={handleImageFileSelected}
              />
              <input
                type="file"
                ref={formCameraInputRef}
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleImageFileSelected}
              />

              {mediaInput ? (
                <div className="relative rounded-2xl border border-slate-200 bg-slate-50 p-3 flex flex-col sm:flex-row items-center gap-4">
                  <div className="relative w-36 h-28 shrink-0 rounded-xl overflow-hidden bg-slate-200 border border-slate-300 shadow-inner group">
                    <img 
                      src={mediaInput} 
                      alt="Vorschau" 
                      className="w-full h-full object-cover"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                    <button
                      type="button"
                      onClick={() => setLightboxImage({ url: mediaInput, title: termInput || 'Foto-Vorschau' })}
                      className="absolute inset-0 bg-black/40 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                      title="Vergrößern"
                    >
                      <ZoomIn size={20} />
                    </button>
                  </div>

                  <div className="flex-1 text-center sm:text-left space-y-1">
                    <p className="text-sm font-semibold text-slate-800">Foto erfolgreich hinterlegt</p>
                    <p className="text-xs text-slate-500">Das Bild wird fest mit diesem Begriff gespeichert und erscheint im Glossar & auf Lernkarten.</p>
                    
                    <div className="pt-2 flex flex-wrap gap-2 justify-center sm:justify-start">
                      <button
                        type="button"
                        onClick={() => formFileInputRef.current?.click()}
                        className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-medium transition-colors"
                      >
                        Anderes Foto wählen
                      </button>
                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-medium transition-colors"
                      >
                        Foto entfernen
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-2xl p-5 text-center transition-colors bg-slate-50/60">
                  {isCompressingImage ? (
                    <div className="py-4 flex flex-col items-center gap-2 text-slate-500">
                      <Loader2 size={24} className="animate-spin text-blue-600" />
                      <span className="text-xs font-medium">Foto wird optimiert...</span>
                    </div>
                  ) : (
                    <>
                      <div className="w-12 h-12 mx-auto mb-2.5 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                        <Camera size={22} />
                      </div>
                      <p className="text-sm font-semibold text-slate-700 mb-1">
                        Foto oder Schaubild hinzufügen
                      </p>
                      <p className="text-xs text-slate-500 mb-3.5 max-w-sm mx-auto">
                        Mache direkt ein Foto mit deiner Kamera oder wähle eine Grafik aus deiner Galerie aus.
                      </p>
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => formCameraInputRef.current?.click()}
                          className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-xs"
                        >
                          <Camera size={14} />
                          <span>Kamera öffnen</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => formFileInputRef.current?.click()}
                          className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold transition-colors shadow-xs"
                        >
                          <Upload size={14} />
                          <span>Aus Galerie wählen</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* PDF Document Attachment Section */}
            <div className="pt-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                PDF-Dokument / Merkblatt anhängen (optional)
              </label>

              {/* Hidden PDF file input for form */}
              <input
                type="file"
                ref={formPdfInputRef}
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={handlePdfFileSelected}
              />

              {pdfAttachmentsInput.length > 0 ? (
                <div className="space-y-2">
                  {pdfAttachmentsInput.map((pdf) => (
                    <div 
                      key={pdf.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-xl border border-rose-200 bg-rose-50/60"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 font-bold text-xs">
                          PDF
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-800 truncate" title={pdf.name}>
                            {pdf.name}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {formatFileSize(pdf.size)} • PDF-Dokument hinterlegt
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setPdfViewerModal({ url: pdf.dataUrl, name: pdf.name, termTitle: termInput || 'Vorschau' })}
                          className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 shadow-2xs"
                          title="PDF in Vorschau ansehen"
                        >
                          <Eye size={13} className="text-blue-600" />
                          <span className="hidden sm:inline">Ansehen</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadSinglePdf(pdf, termInput || 'Glossar')}
                          className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 shadow-2xs"
                          title="PDF herunterladen"
                        >
                          <Download size={13} />
                          <span className="hidden sm:inline">Download</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemovePdfAttachmentFromForm(pdf.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="PDF entfernen"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => formPdfInputRef.current?.click()}
                    className="w-full py-2.5 px-3 border border-dashed border-rose-300 hover:border-rose-400 hover:bg-rose-50/50 rounded-xl text-xs font-semibold text-rose-700 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Plus size={14} />
                    <span>Weiteres PDF-Dokument anhängen</span>
                  </button>
                </div>
              ) : (
                <div className="border-2 border-dashed border-slate-300 hover:border-rose-400 rounded-2xl p-5 text-center transition-colors bg-slate-50/60">
                  <div className="w-12 h-12 mx-auto mb-2.5 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
                    <FileText size={22} />
                  </div>
                  <p className="text-sm font-semibold text-slate-700 mb-1">
                    PDF-Dokument oder Merkblatt anhängen
                  </p>
                  <p className="text-xs text-slate-500 mb-3.5 max-w-sm mx-auto">
                    Hänge Normen (z. B. DIN 19643), Richtlinien, Betriebsanweisungen oder Fachartikel direkt als PDF an diesen Begriff an.
                  </p>
                  <button
                    type="button"
                    onClick={() => formPdfInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-xs"
                  >
                    <Upload size={14} />
                    <span>PDF-Datei auswählen</span>
                  </button>
                </div>
              )}
            </div>

            {/* Optional Web Link & URL toggle */}
            <div className="pt-1">
              {!showUrlField ? (
                <button
                  type="button"
                  onClick={() => setShowUrlField(true)}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                >
                  <ExternalLink size={13} />
                  <span>+ Weblink oder externe Bild-URL ergänzen</span>
                </button>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Weblink (z. B. Wikipedia, DIN):</label>
                    <input
                      type="url"
                      placeholder="https://..."
                      value={linkInput}
                      onChange={(e) => setLinkInput(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Bild-URL (Webadresse):</label>
                    <input
                      type="url"
                      placeholder="https://example.com/bild.jpg"
                      value={mediaInput.startsWith('data:') ? '' : mediaInput}
                      onChange={(e) => setMediaInput(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs bg-white"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="sticky bottom-0 bg-white/95 backdrop-blur-xs pt-3 pb-2 border-t border-slate-100 flex justify-end gap-3 z-10">
            <button 
              type="button" 
              onClick={() => { setShowAddForm(false); setEditingTerm(null); }} 
              className="px-5 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-xl transition-colors text-sm"
            >
              Abbrechen
            </button>
            <button 
              type="submit" 
              className="px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 shadow-sm transition-colors text-sm"
            >
              {editingTerm ? 'Änderungen speichern' : 'Begriff speichern'}
            </button>
          </div>
        </form>
      )}

      {/* Terms Display (Alphabetically Organized) */}
      <div className="space-y-6">
        {filteredGlossary.length > 0 ? (
          sortedGroupKeys.map((letter) => (
            <div key={letter} className="space-y-3">
              {/* Alphabet Section Divider */}
              <div className="flex items-center gap-3 pt-2">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white font-black text-sm flex items-center justify-center shadow-xs">
                  {letter}
                </div>
                <div className="h-px bg-slate-200 flex-1" />
                <span className="text-xs text-slate-400 font-medium">
                  {groupedTerms[letter]?.length} Begriff{groupedTerms[letter]?.length !== 1 ? 'e' : ''}
                </span>
              </div>

              {/* Items for this letter */}
              <div className="space-y-3">
                {groupedTerms[letter]?.map((item) => {
                  const isCreatedAsFlashcard = createdCardsMap[item.id];

                  return (
                    <div 
                      key={item.id} 
                      className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 md:p-6 shadow-xs hover:shadow-sm hover:border-slate-300 transition-all text-left group overflow-hidden max-w-full w-full"
                    >
                      {/* Term Card Header: Book icon, Title and Edit/Delete Actions */}
                      <div className="flex items-start justify-between gap-2.5 mb-2.5 min-w-0 w-full">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                            <Book size={18} />
                          </div>
                          <h3 className="text-base sm:text-lg font-bold text-slate-900 break-words min-w-0 flex-1 leading-snug">
                            {item.term}
                          </h3>
                        </div>

                        {/* Edit & Delete Action Icons (Edit Mode Only) */}
                        {mode === 'edit' && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button 
                              type="button"
                              onClick={() => openEditForm(item)} 
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors" 
                              title="Begriff bearbeiten"
                            >
                              <Edit3 size={16} />
                            </button>
                            <button 
                              type="button"
                              onClick={() => handleDelete(item.id, item.term)} 
                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" 
                              title="Begriff löschen"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Definition Text: Full card width, guaranteed break-words */}
                      <div className="text-slate-600 leading-relaxed text-sm sm:text-base mb-3 break-words overflow-hidden w-full">
                        <FormattedText text={item.definition} />
                      </div>
                      
                      {/* Photo display */}
                      {item.mediaUrl ? (
                        <div className="mt-3 mb-4 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 max-w-full sm:max-w-md relative group/photo">
                          <img 
                            src={item.mediaUrl} 
                            alt={item.term} 
                            className="w-full h-auto object-cover max-h-60 cursor-pointer hover:opacity-95 transition-opacity" 
                            onClick={() => setLightboxImage({ url: item.mediaUrl!, title: item.term, definition: item.definition })}
                            onError={(e) => (e.currentTarget.style.display = 'none')} 
                          />
                          
                          {/* Photo overlay controls */}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/photo:opacity-100 transition-opacity flex items-center justify-center gap-2 pointer-events-none">
                            <button
                              type="button"
                              onClick={() => setLightboxImage({ url: item.mediaUrl!, title: item.term, definition: item.definition })}
                              className="pointer-events-auto p-2 rounded-lg bg-white/90 text-slate-800 hover:bg-white text-xs font-semibold flex items-center gap-1 shadow-md"
                            >
                              <ZoomIn size={14} /> Vergrößern
                            </button>
                            {mode === 'edit' && (
                              <button
                                type="button"
                                onClick={(e) => handleCardRemovePhoto(item, e)}
                                className="pointer-events-auto p-2 rounded-lg bg-red-600 text-white hover:bg-red-700 text-xs font-semibold flex items-center gap-1 shadow-md"
                              >
                                <Trash2 size={14} /> Foto löschen
                              </button>
                            )}
                          </div>
                        </div>
                      ) : null}

                      {/* Attached PDF Documents Display */}
                      {(() => {
                        const termPdfs = getTermPdfAttachments(item);
                        if (termPdfs.length === 0) return null;
                        return (
                          <div className="mt-3 mb-3.5 space-y-2 w-full max-w-full">
                            {termPdfs.map(pdf => (
                              <div
                                key={pdf.id}
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 sm:p-3 bg-rose-50/50 hover:bg-rose-50/80 border border-rose-200/80 rounded-xl transition-all max-w-full overflow-hidden"
                              >
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 font-black text-[10px]">
                                    PDF
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-bold text-slate-800 truncate" title={pdf.name}>
                                      {pdf.name}
                                    </p>
                                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                                      {pdf.size && <span>{formatFileSize(pdf.size)}</span>}
                                      <span className="text-rose-600 font-medium">PDF-Anhang</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => setPdfViewerModal({ url: pdf.dataUrl, name: pdf.name, termTitle: item.term })}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium transition-colors shadow-2xs"
                                    title="PDF ansehen"
                                  >
                                    <Eye size={13} className="text-blue-600" />
                                    <span>Ansehen</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadSinglePdf(pdf, item.term)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-2xs"
                                    title="Dieses PDF einzeln herunterladen / exportieren"
                                  >
                                    <Download size={13} />
                                    <span>Exportieren</span>
                                  </button>
                                  {mode === 'edit' && (
                                    <button
                                      type="button"
                                      onClick={() => handleRemovePdfFromTerm(item, pdf.id, pdf.name)}
                                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                      title="PDF entfernen"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}

                      {/* Actions & Links Bar */}
                      <div className="flex items-center gap-2 flex-wrap pt-1 w-full max-w-full">
                        {/* Create Flashcard Button (Edit Mode Only) */}
                        {mode === 'edit' && (
                          <button
                            type="button"
                            onClick={() => handleOpenFlashcardModal(item)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-2xs ${
                              isCreatedAsFlashcard
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                                : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/70 active:scale-95'
                            }`}
                            title={isCreatedAsFlashcard ? 'Bereits in Lernkartei angelegt. Klick zum erneuten Hinzufügen / Rubrik wählen' : 'Rubrik wählen und als Lernkarte anlegen'}
                          >
                            {isCreatedAsFlashcard ? (
                              <>
                                <Check size={14} className="text-emerald-600 stroke-[3]" />
                                <span>In Lernkartei gespeichert</span>
                              </>
                            ) : (
                              <>
                                <Layers size={14} className="text-indigo-600" />
                                <span>Als Lernkartei anlegen</span>
                              </>
                            )}
                          </button>
                        )}

                        {/* Quick Photo Upload Button if no photo exists (Edit Mode Only) */}
                        {mode === 'edit' && !item.mediaUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              setQuickPhotoTargetTerm(item);
                              quickPhotoInputRef.current?.click();
                            }}
                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-blue-600 hover:bg-blue-50 px-2.5 py-1.5 rounded-xl transition-colors border border-slate-200"
                            title="Ein Foto oder Schaubild zu diesem Begriff hinterlegen"
                          >
                            <ImagePlus size={14} />
                            <span>+ Foto</span>
                          </button>
                        )}

                        {/* Quick PDF Upload Button directly on card (Edit Mode Only) */}
                        {mode === 'edit' && (
                          <button
                            type="button"
                            onClick={() => {
                              setQuickPdfTargetTerm(item);
                              quickPdfInputRef.current?.click();
                            }}
                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1.5 rounded-xl transition-colors border border-slate-200"
                            title="Ein PDF-Dokument (Merkblatt, DIN-Norm, Richtlinie) an diesen Begriff anhängen"
                          >
                            <FileText size={14} className="text-rose-600" />
                            <span>+ PDF</span>
                          </button>
                        )}

                        {item.linkUrl && (
                          <a 
                            href={item.linkUrl} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 px-2.5 py-1.5 rounded-xl transition-colors"
                          >
                            <ExternalLink size={12} />
                            <span>Weblink</span>
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl shadow-xs p-8">
            <Search className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-slate-800 mb-1">Keine Fachbegriffe gefunden</h3>
            <p className="text-sm text-slate-500 mb-4">
              {searchTerm 
                ? `Keine Treffer für "${searchTerm}".` 
                : `Keine Begriffe unter dem Buchstaben "${selectedLetter}".`}
            </p>
            <button
              onClick={() => { setSearchTerm(''); setSelectedLetter('all'); }}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
            >
              Filter zurücksetzen
            </button>
          </div>
        )}
      </div>

      {/* Sticky Quick Counter & Export Banner */}
      {filteredGlossary.length > 0 && (
        <div className="mt-8 p-4 bg-slate-100/80 rounded-2xl border border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <span>{filteredGlossary.length} von {allTerms.length} Fachbegriffen angezeigt (A-Z sortiert)</span>
          <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-end">
            {mode === 'edit' && (
              <button
                onClick={() => {
                  setBulkSuccessCount(null);
                  setShowBulkFlashcardModal(true);
                }}
                className="flex items-center gap-1.5 text-indigo-700 hover:text-indigo-800 font-semibold bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg border border-indigo-200 transition-colors"
              >
                <Layers size={14} />
                <span>Als Lernkarten exportieren</span>
              </button>
            )}
            <button
              onClick={handleExportPdf}
              className="flex items-center gap-1.5 text-emerald-700 hover:text-emerald-800 font-semibold bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-200 transition-colors"
            >
              <FileDown size={14} />
              <span>Als PDF herunterladen</span>
            </button>
            {allPdfItems.length > 0 && (
              <button
                onClick={() => setShowPdfAttachmentsExportModal(true)}
                className="flex items-center gap-1.5 text-rose-700 hover:text-rose-800 font-semibold bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg border border-rose-200 transition-colors"
                title="Angehängte PDF-Dokumente ansehen & separat als ZIP exportieren"
              >
                <FolderDown size={14} />
                <span>PDF-Anhänge ({allPdfItems.length})</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Lightbox Modal for Photo Inspection */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setLightboxImage(null)}
        >
          <div 
            className="relative bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">{lightboxImage.title}</h3>
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
            {lightboxImage.definition && (
              <div className="p-4 bg-slate-50 border-t border-slate-100 text-xs text-slate-600 leading-relaxed">
                <FormattedText text={lightboxImage.definition} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Flashcard Created Floating Toast */}
      {flashcardToast?.isOpen && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl border border-slate-700 animate-in slide-in-from-bottom-5 duration-200 max-w-md w-[92%] sm:w-auto">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Check size={16} className="stroke-[3]" />
          </div>
          <div className="flex-1 text-xs">
            <p className="font-semibold text-white truncate max-w-[200px] sm:max-w-xs">
              „{flashcardToast.termTitle}“ als Lernkartei angelegt!
            </p>
            <p className="text-slate-400 text-[11px]">
              Rubrik: <span className="text-indigo-300 font-medium">{flashcardToast.categoryTitle || 'Lernkarten'}</span>
            </p>
          </div>
          {onNavigateToFlashcards && (
            <button
              onClick={() => {
                setFlashcardToast(null);
                onNavigateToFlashcards();
              }}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-colors shrink-0"
            >
              Zu den Karten →
            </button>
          )}
          <button
            onClick={() => setFlashcardToast(null)}
            className="text-slate-400 hover:text-white p-1"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Single Flashcard Creation: Select Category Modal */}
      {termForFlashcardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200 text-left">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                  <Layers size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Lernkarte erstellen</h3>
                  <p className="text-xs text-slate-500">Wähle vorab die passende Rubrik aus</p>
                </div>
              </div>
              <button
                onClick={() => !isCreatingSingleCard && setTermForFlashcardModal(null)}
                disabled={isCreatingSingleCard}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-30"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Card preview */}
              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Vorderseite (Begriff):
                  </span>
                  <p className="text-sm font-bold text-slate-900 leading-snug">
                    {termForFlashcardModal.term}
                  </p>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Rückseite (Erklärung):
                  </span>
                  <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
                    {termForFlashcardModal.definition}
                  </p>
                </div>

                {termForFlashcardModal.mediaUrl && (
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-200/60">
                    <img 
                      src={termForFlashcardModal.mediaUrl} 
                      alt="Vorschau" 
                      className="w-8 h-8 rounded-md object-cover border border-slate-200 shrink-0" 
                    />
                    <span className="text-[11px] text-slate-600 font-medium flex items-center gap-1">
                      <ImageIcon size={13} className="text-blue-500" />
                      Foto wird auf der Rückseite unter der Antwort angezeigt
                    </span>
                  </div>
                )}
              </div>

              {/* Rubrik / Category Selection */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Rubrik / Themengebiet:
                  </label>
                  <span className="text-[11px] text-slate-400">Vorab festlegen</span>
                </div>

                {/* Dropdown for all categories */}
                <select
                  value={selectedFlashcardCategory}
                  onChange={(e) => {
                    setSelectedFlashcardCategory(e.target.value);
                    try {
                      localStorage.setItem('fab_last_flashcard_category', e.target.value);
                    } catch {}
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none shadow-2xs"
                >
                  {availableCategories.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.title}
                    </option>
                  ))}
                </select>

                {/* Quick Selection Chips */}
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {availableCategories.slice(0, 6).map(cat => {
                    const isSelected = selectedFlashcardCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          setSelectedFlashcardCategory(cat.id);
                          try {
                            localStorage.setItem('fab_last_flashcard_category', cat.id);
                          } catch {}
                        }}
                        className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1 ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-xs font-semibold'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {isSelected && <Check size={11} strokeWidth={3} />}
                        <span>{cat.title}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Category Description hint */}
                {selectedCategoryObj?.description && (
                  <p className="text-[11px] text-slate-500 mt-2 italic bg-slate-50 p-2 rounded-lg border border-slate-100">
                    ℹ️ {selectedCategoryObj.description}
                  </p>
                )}

                {/* Single Card Progress Bar */}
                {singleCardProgress && (
                  <div className="mt-3 p-3 rounded-2xl bg-indigo-50 border border-indigo-200 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between mb-1.5 text-xs">
                      <div className="flex items-center gap-2">
                        <Loader2 size={14} className="text-indigo-600 animate-spin shrink-0" />
                        <span className="font-bold text-indigo-900">{singleCardProgress.status}</span>
                      </div>
                      <span className="font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full text-[11px]">
                        {singleCardProgress.percent}%
                      </span>
                    </div>
                    <div className="w-full bg-indigo-200/80 rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-indigo-600 h-2 rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${singleCardProgress.percent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex gap-2.5">
                <button
                  type="button"
                  disabled={isCreatingSingleCard}
                  onClick={() => setTermForFlashcardModal(null)}
                  className="flex-1 py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors disabled:opacity-40"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  disabled={isCreatingSingleCard}
                  onClick={handleConfirmSingleFlashcard}
                  className="flex-1 py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  {isCreatingSingleCard ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Speichern...</span>
                    </>
                  ) : (
                    <>
                      <Layers size={14} />
                      <span>Lernkarte anlegen</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Convert to Flashcards Modal */}
      {showBulkFlashcardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200 text-left">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                  <Layers size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">In Lernkartei übernehmen</h3>
                  <p className="text-xs text-slate-500">Fachbegriffe automatisch als Karteikarten anlegen</p>
                </div>
              </div>
              <button
                disabled={isBulkConverting}
                onClick={() => setShowBulkFlashcardModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-30"
              >
                <X size={20} />
              </button>
            </div>

            {bulkSuccessCount !== null ? (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-center space-y-1">
                  <CheckCircle2 size={32} className="text-emerald-600 mx-auto mb-1" />
                  <p className="font-bold text-sm">{bulkSuccessCount} Lernkarten erfolgreich angelegt!</p>
                  <p className="text-xs text-emerald-600">Alle Begriffe wurden mit Erklärung und Fotos in deine Lernkartei übertragen.</p>
                </div>
                <div className="flex gap-2.5">
                  {onNavigateToFlashcards && (
                    <button
                      onClick={() => {
                        setShowBulkFlashcardModal(false);
                        onNavigateToFlashcards();
                      }}
                      className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-colors text-center"
                    >
                      Jetzt Lernkarten üben →
                    </button>
                  )}
                  <button
                    onClick={() => setShowBulkFlashcardModal(false)}
                    className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
                  >
                    Schließen
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Es werden <span className="font-bold text-slate-800">{filteredGlossary.length} Fachbegriffe</span> als individuelle Karteikarten (Vorderseite: Begriff, Rückseite: Definition & Foto) angelegt.
                </p>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Ziel-Rubrik für alle Karten wählen:
                  </label>
                  <select
                    disabled={isBulkConverting}
                    value={bulkCategoryTarget}
                    onChange={(e) => {
                      setBulkCategoryTarget(e.target.value);
                      try {
                        localStorage.setItem('fab_last_flashcard_category', e.target.value);
                      } catch {}
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none shadow-2xs disabled:opacity-50"
                  >
                    {availableCategories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.title}
                      </option>
                    ))}
                  </select>

                  {/* Quick select chips for bulk */}
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {availableCategories.slice(0, 6).map(cat => {
                      const isSelected = bulkCategoryTarget === cat.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          disabled={isBulkConverting}
                          onClick={() => {
                            setBulkCategoryTarget(cat.id);
                            try {
                              localStorage.setItem('fab_last_flashcard_category', cat.id);
                            } catch {}
                          }}
                          className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1 disabled:opacity-50 ${
                            isSelected
                              ? 'bg-indigo-600 text-white shadow-xs font-semibold'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }`}
                        >
                          {isSelected && <Check size={11} strokeWidth={3} />}
                          <span>{cat.title}</span>
                        </button>
                      );
                    })}
                  </div>

                  {bulkCategoryObj?.description && (
                    <p className="text-[11px] text-slate-500 mt-2 italic bg-slate-50 p-2 rounded-lg border border-slate-100">
                      ℹ️ {bulkCategoryObj.description}
                    </p>
                  )}
                </div>

                {/* Bulk Convert Ladebalken */}
                {bulkConvertProgress && (
                  <div className="p-4 rounded-2xl bg-indigo-50/95 border border-indigo-200 shadow-xs animate-in fade-in duration-200">
                    <div className="flex items-center justify-between mb-2 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <Loader2 size={15} className="text-indigo-600 animate-spin shrink-0" />
                        <span className="font-bold text-indigo-950 truncate">
                          Karte {bulkConvertProgress.current} von {bulkConvertProgress.total}
                        </span>
                      </div>
                      <span className="font-bold text-indigo-700 bg-indigo-100 px-2.5 py-0.5 rounded-full shrink-0 text-xs">
                        {bulkConvertProgress.percent}%
                      </span>
                    </div>
                    {/* Progress Track */}
                    <div className="w-full bg-indigo-200/80 rounded-full h-2.5 overflow-hidden">
                      <div 
                        className="bg-gradient-to-r from-indigo-600 to-blue-600 h-2.5 rounded-full transition-all duration-200 ease-out shadow-xs"
                        style={{ width: `${Math.max(5, bulkConvertProgress.percent)}%` }}
                      />
                    </div>
                    {bulkConvertProgress.currentTerm && (
                      <p className="mt-2 text-[11px] text-indigo-800 font-medium truncate">
                        Erstelle: <span className="font-semibold text-indigo-950">„{bulkConvertProgress.currentTerm}“</span>
                      </p>
                    )}
                  </div>
                )}

                <div className="pt-2 flex gap-2.5">
                  <button
                    type="button"
                    disabled={isBulkConverting}
                    onClick={() => setShowBulkFlashcardModal(false)}
                    className="flex-1 py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors disabled:opacity-40"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    disabled={isBulkConverting}
                    onClick={handleBulkConvert}
                    className="flex-1 py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
                  >
                    {isBulkConverting ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        <span>Wird generiert...</span>
                      </>
                    ) : (
                      <>
                        <Layers size={14} />
                        <span>{filteredGlossary.length} Karten erstellen</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PDF Export Options Modal */}
      {showPdfExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200 text-left">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                  <FileDown size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Glossar als PDF exportieren</h3>
                  <p className="text-xs text-slate-500">
                    {termsToExport.length} Fachbegriffe (A–Z) als Nachschlagewerk
                  </p>
                </div>
              </div>
              <button
                onClick={() => !isExportingPdf && setShowPdfExportModal(false)}
                disabled={isExportingPdf}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-30"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Scope details */}
              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-600 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-800">Export-Umfang:</span>{' '}
                  {searchTerm ? (
                    <span>Gefiltert nach "{searchTerm}"</span>
                  ) : selectedLetter !== 'all' ? (
                    <span>Buchstabe "{selectedLetter}"</span>
                  ) : (
                    <span>Gesamtes Glossar (A–Z)</span>
                  )}
                </div>
                <span className="font-bold text-slate-800 px-2 py-0.5 bg-white rounded-lg border border-slate-200 text-[11px]">
                  {termsToExport.length} Begriffe
                </span>
              </div>

              {/* Optional: Include Images Toggle */}
              <div 
                onClick={() => {
                  if (isExportingPdf) return;
                  const nextVal = !pdfIncludeImages;
                  setPdfIncludeImages(nextVal);
                  try {
                    localStorage.setItem('fab_glossary_pdf_include_images', String(nextVal));
                  } catch {}
                }}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer select-none flex items-start gap-3 ${
                  pdfIncludeImages && termsWithImagesCount > 0
                    ? 'bg-blue-50/70 border-blue-300 ring-1 ring-blue-300/60' 
                    : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                } ${isExportingPdf ? 'opacity-60 pointer-events-none' : ''}`}
              >
                <div className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center border shrink-0 transition-colors ${
                  pdfIncludeImages && termsWithImagesCount > 0
                    ? 'bg-blue-600 border-blue-600 text-white' 
                    : 'border-slate-300 bg-white'
                }`}>
                  {pdfIncludeImages && termsWithImagesCount > 0 && <Check size={14} strokeWidth={3} />}
                </div>

                <div className="flex-1 text-left">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-xs sm:text-sm text-slate-800 flex items-center gap-1.5">
                      <ImageIcon size={16} className={pdfIncludeImages && termsWithImagesCount > 0 ? 'text-blue-600' : 'text-slate-500'} />
                      Hinterlegte Bilder einbinden
                    </span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                      termsWithImagesCount > 0 
                        ? 'bg-blue-100 text-blue-700' 
                        : 'bg-slate-200/80 text-slate-500'
                    }`}>
                      {termsWithImagesCount} {termsWithImagesCount === 1 ? 'Foto' : 'Fotos'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    {termsWithImagesCount > 0
                      ? 'Abbildungen, Geräteskizzen und Schaubilder werden direkt unter der Begriffserklärung im PDF abgedruckt.'
                      : 'In der aktuellen Auswahl sind keine Fotos hinterlegt. Das PDF wird als reiner Text erzeugt.'}
                  </p>
                </div>
              </div>

              {/* Progress feedback when generating */}
              {isExportingPdf && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1 text-center">
                  <div className="flex items-center justify-center gap-2 text-emerald-800 font-semibold text-xs">
                    <Loader2 size={16} className="animate-spin text-emerald-600" />
                    <span>{pdfExportStatus || 'PDF wird generiert...'}</span>
                  </div>
                  <p className="text-[11px] text-emerald-600">
                    Bitte kurz warten – Dokument wird zusammengestellt.
                  </p>
                </div>
              )}

              {/* Note for attached original PDFs */}
              {allPdfItems.length > 0 && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between gap-3 text-xs text-rose-900">
                  <div>
                    <span className="font-bold flex items-center gap-1">
                      <FolderDown size={14} className="text-rose-600" />
                      Original PDF-Anhänge vorhanden:
                    </span>
                    <p className="text-[11px] text-rose-700 mt-0.5">
                      {allPdfItems.length} angehängte PDF-Dateien können separat als ZIP exportiert werden.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowPdfExportModal(false);
                      setShowPdfAttachmentsExportModal(true);
                    }}
                    className="px-2.5 py-1.5 bg-white text-rose-700 hover:bg-rose-100 border border-rose-300 font-semibold rounded-lg text-xs shrink-0 transition-colors shadow-2xs"
                  >
                    Zu PDF-Anhängen
                  </button>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex gap-2.5">
                <button
                  type="button"
                  disabled={isExportingPdf}
                  onClick={() => setShowPdfExportModal(false)}
                  className="flex-1 py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors disabled:opacity-40"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  disabled={isExportingPdf}
                  onClick={handleExportPdf}
                  className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  {isExportingPdf ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Erstelle PDF...</span>
                    </>
                  ) : (
                    <>
                      <FileDown size={15} />
                      <span>PDF erstellen</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Attached PDFs Export Modal */}
      {showPdfAttachmentsExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 text-left max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between gap-3 mb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <FolderDown size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Angehängte PDF-Dokumente exportieren</h3>
                  <p className="text-xs text-slate-500">
                    {allPdfItems.length} {allPdfItems.length === 1 ? 'Dokument' : 'Dokumente'} an Fachbegriffe angehängt
                  </p>
                </div>
              </div>
              <button
                onClick={() => !isExportingZip && setShowPdfAttachmentsExportModal(false)}
                disabled={isExportingZip}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-30"
              >
                <X size={20} />
              </button>
            </div>

            {allPdfItems.length > 0 ? (
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {/* Zip Export Banner */}
                <div className="p-4 bg-gradient-to-br from-rose-50 to-orange-50/40 rounded-2xl border border-rose-200/80 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
                        <FileArchive size={16} className="text-rose-600" />
                        Als ZIP-Archiv bündeln & herunterladen
                      </h4>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        Packt alle {allPdfItems.length} hinterlegten PDF-Dokumente mit sauberen Dateinamen (z. B. „Flockung - Merkblatt.pdf“) in eine gemeinsame ZIP-Datei.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isExportingZip}
                    onClick={handleExportAllPdfsZip}
                    className="w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
                  >
                    {isExportingZip ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>{zipProgressText || 'Erstelle ZIP-Archiv...'}</span>
                      </>
                    ) : (
                      <>
                        <Download size={16} />
                        <span>Alle {allPdfItems.length} PDFs als ZIP exportieren</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Individual PDFs List */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Einzelne PDF-Dokumente ({allPdfItems.length}):
                    </span>
                    <span className="text-[11px] text-slate-400">Direkt herunterladen oder ansehen</span>
                  </div>

                  <div className="space-y-2">
                    {allPdfItems.map((item, idx) => (
                      <div 
                        key={`${item.termId}_${item.attachment.id}_${idx}`}
                        className="p-3 rounded-xl border border-slate-200 hover:border-slate-300 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 font-bold text-[10px]">
                            PDF
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-900 truncate">
                              {item.termTitle}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate" title={item.attachment.name}>
                              {item.attachment.name} {item.attachment.size ? `• ${formatFileSize(item.attachment.size)}` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                          <button
                            type="button"
                            onClick={() => setPdfViewerModal({ url: item.attachment.dataUrl, name: item.attachment.name, termTitle: item.termTitle })}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
                            title="PDF ansehen"
                          >
                            <Eye size={13} className="text-blue-600" />
                            <span>Ansehen</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadSinglePdf(item.attachment, item.termTitle)}
                            className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 shadow-2xs"
                            title="Dieses Dokument herunterladen"
                          >
                            <Download size={13} />
                            <span>Download</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-10 text-center space-y-3">
                <div className="w-14 h-14 rounded-full bg-rose-50 text-rose-400 flex items-center justify-center mx-auto">
                  <FileText size={28} />
                </div>
                <h4 className="text-base font-bold text-slate-800">Keine PDF-Dokumente angehängt</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                  Du hast noch keine PDF-Dateien an deine Fachbegriffe angehängt.
                  Nutze den Button <span className="font-semibold text-rose-600">+ PDF</span> direkt auf einer Karteikarte oder hänge beim Bearbeiten Merkblätter, Normen oder Sicherheitsdatenblätter an.
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setShowPdfAttachmentsExportModal(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
                  >
                    Verstanden
                  </button>
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-slate-100 mt-4 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setShowPdfAttachmentsExportModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF In-App Preview / Lightbox Modal (Canvas-based via PDF.js - Works 100% in Android APK / WebView) */}
      {pdfViewerModal && (
        <PdfViewerModal
          url={pdfViewerModal.url}
          name={pdfViewerModal.name}
          termTitle={pdfViewerModal.termTitle}
          onClose={() => setPdfViewerModal(null)}
          onDownload={() => handleDownloadSinglePdf({ name: pdfViewerModal.name, dataUrl: pdfViewerModal.url }, pdfViewerModal.termTitle)}
        />
      )}

      {/* PDF Export Success Modal */}
      {exportSuccessModal?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200 text-left">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">PDF Fachglossar erstellt</h3>
                  <p className="text-xs text-slate-500">
                    {exportSuccessModal.count} Fachbegriffe (A–Z) formatiert
                    {exportSuccessModal.hasImages && exportSuccessModal.imagesCount ? ` • inkl. ${exportSuccessModal.imagesCount} Abbildungen` : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setExportSuccessModal(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 mb-5 text-xs text-slate-600 space-y-1.5">
              <p className="font-semibold text-slate-800 flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
                {exportSuccessModal.method === 'capacitor' || exportSuccessModal.method === 'web-share'
                  ? 'Android System-Dialog aktiv'
                  : 'Download bereitgestellt'}
              </p>
              <p className="leading-relaxed">
                {exportSuccessModal.method === 'capacitor' || exportSuccessModal.method === 'web-share'
                  ? 'Das PDF wurde an dein Android-System übergeben. Du kannst es direkt im PDF-Viewer öffnen, in deinen Downloads speichern oder teilen.'
                  : 'Das formatierte Glossar wurde für den Download vorbereitet.'}
              </p>
              <p className="text-[11px] text-slate-400 font-mono truncate pt-1">
                {exportSuccessModal.fileName}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              {exportSuccessModal.blobUrl && (
                <button
                  type="button"
                  onClick={() => {
                    const modalData = { ...exportSuccessModal };
                    setExportSuccessModal(null);
                    setPdfViewerModal({
                      url: modalData.blobUrl,
                      name: modalData.fileName,
                      termTitle: 'Fachglossar PDF-Export'
                    });
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-xs"
                >
                  <Eye size={15} />
                  <span>PDF in App ansehen</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setExportSuccessModal(null)}
                className="flex-1 py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
              >
                Fertig
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-App Confirmation Modal */}
      <ConfirmModal
        config={confirmConfig}
        onClose={() => setConfirmConfig(null)}
      />
    </div>
  );
}
