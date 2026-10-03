import React, { useState, useRef } from 'react';
import { 
  Camera, Upload, Loader2, X, Key, CheckCircle2, AlertCircle, RefreshCw, 
  ExternalLink, Eye, EyeOff, Folder, Trash2, Plus, Check, ImageIcon, ZoomIn, 
  Sparkles, ArrowLeft, Layers, Book, PenTool, FileText, CheckCheck, 
  HelpCircle, ImagePlus, ArrowRight
} from 'lucide-react';
import { getStoredGeminiApiKey, setStoredGeminiApiKey, testGeminiApiKey, extractFromImageDirect, ExtractImagePart } from '../lib/geminiClient';
import { getApiUrl, isNativeApp } from '../lib/api';
import { compressImageFile } from '../lib/imageUtils';
import { resolveOrCreateCategory, matchExistingCategory } from '../lib/db';
import { Category } from '../types';

export type ScannerMode = 'handwritten_cards' | 'standard';

interface AIImageScannerProps {
  type: 'glossary' | 'flashcard';
  categories?: Category[];
  initialCategoryId?: string;
  initialMode?: ScannerMode;
  onResults: (results: any[], categoryId?: string) => void;
  onClose: () => void;
}

interface EditableFlashcard {
  id: string;
  question: string;
  answer: string;
  categoryId: string;
  rubrik?: string; // The detected or edited rubric name
  isNewRubrik?: boolean; // True if this rubric is not yet in categories and will be created
  mediaUrlFront?: string; // Front photo of handwritten card
  mediaUrl?: string; // Back photo of handwritten card
  fromScan?: boolean; // Scanned item flag
}

interface EditableGlossaryTerm {
  id: string;
  term: string;
  definition: string;
}

interface CardPhotoSlot {
  frontDataUrl: string | null;
  backDataUrl: string | null;
}

export function AIImageScanner({ 
  type, 
  categories = [], 
  initialCategoryId, 
  initialMode,
  onResults, 
  onClose 
}: AIImageScannerProps) {
  // Steps: 'capture' (upload/camera), 'review' (edit before saving)
  const [step, setStep] = useState<'capture' | 'review'>('capture');
  
  // Scanner sub-mode for flashcards: handwritten double-sided card vs. standard document
  const [scannerMode, setScannerMode] = useState<ScannerMode>(() => {
    if (initialMode) return initialMode;
    return type === 'flashcard' ? 'handwritten_cards' : 'standard';
  });

  const [loading, setLoading] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ percent: number; status: string } | null>(null);
  const [saveProgress, setSaveProgress] = useState<{ current: number; total: number; percent: number; status: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Handwritten card dual-slot capture state (Front + Back)
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<string | null>(null);
  const [attachPhotosToCards, setAttachPhotosToCards] = useState(false);

  // Additional queued card pairs in batch mode
  const [cardStack, setCardStack] = useState<CardPhotoSlot[]>([]);

  // Available categories for selection (excluding pseudo 'all')
  const availableCategories = categories.filter(c => c.id !== 'all');

  // Pre-selected category
  const [selectedCategory, setSelectedCategory] = useState<string>(() => {
    if (initialCategoryId && initialCategoryId !== 'all' && availableCategories.some(c => c.id === initialCategoryId)) {
      return initialCategoryId;
    }
    try {
      const saved = localStorage.getItem('fab_last_scan_category');
      if (saved && availableCategories.some(c => c.id === saved)) {
        return saved;
      }
    } catch {}
    return availableCategories[0]?.id || 'custom';
  });
  
  // API Key management
  const storedKey = getStoredGeminiApiKey();
  const [apiKeyInput, setApiKeyInput] = useState(storedKey);
  const [showKeyInputModal, setShowKeyInputModal] = useState(!storedKey && isNativeApp());
  const [showPassword, setShowPassword] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [keyTestResult, setKeyTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Scanned photo preview & Lightbox
  const [scannedImagePreview, setScannedImagePreview] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string } | null>(null);
  const [showImageInlinePreview, setShowImageInlinePreview] = useState(true);

  // Editable items state
  const [editableFlashcards, setEditableFlashcards] = useState<EditableFlashcard[]>([]);
  const [editableGlossaryTerms, setEditableGlossaryTerms] = useState<EditableGlossaryTerm[]>([]);

  // Hidden file inputs
  const standardFileInputRef = useRef<HTMLInputElement>(null);
  const frontFileInputRef = useRef<HTMLInputElement>(null);
  const backFileInputRef = useRef<HTMLInputElement>(null);

  const handleTestAndSaveKey = async () => {
    if (!apiKeyInput.trim()) {
      setKeyTestResult({ ok: false, message: 'Bitte gib einen API-Schlüssel ein.' });
      return;
    }
    setTestingKey(true);
    setKeyTestResult(null);
    try {
      const res = await testGeminiApiKey(apiKeyInput);
      setKeyTestResult(res);
      if (res.ok) {
        setStoredGeminiApiKey(apiKeyInput);
        setTimeout(() => {
          setShowKeyInputModal(false);
          setError(null);
        }, 800);
      }
    } finally {
      setTestingKey(false);
    }
  };

  const handleCategoryChange = (newCatId: string) => {
    setSelectedCategory(newCatId);
    try {
      localStorage.setItem('fab_last_scan_category', newCatId);
    } catch {}

    const catObj = availableCategories.find(c => c.id === newCatId);
    const catTitle = catObj ? catObj.title : (newCatId === 'custom' ? 'Eigene Fragen & Karten' : newCatId);

    if (type === 'flashcard') {
      setEditableFlashcards(prev => prev.map(c => ({
        ...c,
        categoryId: newCatId,
        rubrik: catTitle,
        isNewRubrik: false
      })));
    }
  };

  // Helper to read and compress image file
  const processImageFile = async (file: File): Promise<string> => {
    return await compressImageFile(file, { maxWidth: 1280, maxHeight: 1280, quality: 0.85 });
  };

  // Capture front side for handwritten card
  const handleFrontFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await processImageFile(file);
      setFrontImage(dataUrl);
    } catch (err: any) {
      setError(err?.message || 'Fehler beim Laden des Vorderseiten-Fotos.');
    } finally {
      e.target.value = '';
    }
  };

  // Capture back side for handwritten card
  const handleBackFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await processImageFile(file);
      setBackImage(dataUrl);
    } catch (err: any) {
      setError(err?.message || 'Fehler beim Laden des Rückseiten-Fotos.');
    } finally {
      e.target.value = '';
    }
  };

  // Save current card pair into the stack and reset inputs for next card
  const handleAddCardToStack = () => {
    if (!frontImage && !backImage) return;
    setCardStack(prev => [...prev, { frontDataUrl: frontImage, backDataUrl: backImage }]);
    setFrontImage(null);
    setBackImage(null);
  };

  // Process standard single-image upload (Prüfungsbogen, Dokument, etc.)
  const handleStandardFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const currentApiKey = getStoredGeminiApiKey();
    if (!currentApiKey && isNativeApp()) {
      setShowKeyInputModal(true);
      return;
    }

    setLoading(true);
    setScanProgress({ percent: 15, status: 'Foto wird für die Analyse vorbereitet...' });
    setError(null);

    try {
      const dataUrl = await processImageFile(file);
      setScannedImagePreview(dataUrl);
      const base64String = dataUrl.split(',')[1];
      const mimeType = 'image/jpeg';

      await runExtractionPipeline([
        { imageBase64: base64String, mimeType, label: 'Dokument / Karteikarte' }
      ], 'standard', undefined, undefined);
    } catch (err: any) {
      setError(err.message || 'Fehler beim Verarbeiten des Bildes');
      setScanProgress(null);
      setLoading(false);
    } finally {
      e.target.value = '';
    }
  };

  // Run the full AI extraction for handwritten cards (Front & Back)
  const handleStartHandwrittenScan = async () => {
    if (!frontImage && !backImage && cardStack.length === 0) {
      setError('Bitte nimm mindestens ein Foto der Vorderseite oder Rückseite auf.');
      return;
    }

    const currentApiKey = getStoredGeminiApiKey();
    if (!currentApiKey && isNativeApp()) {
      setShowKeyInputModal(true);
      return;
    }

    setLoading(true);
    setError(null);
    setScanProgress({ percent: 15, status: 'Fotos der Karteikarten werden vorbereitet...' });

    try {
      // Gather all card pairs (queued stack + current slot)
      const allPairs: CardPhotoSlot[] = [...cardStack];
      if (frontImage || backImage) {
        allPairs.push({ frontDataUrl: frontImage, backDataUrl: backImage });
      }

      if (allPairs.length === 0) {
        throw new Error('Keine Fotos zur Auswertung vorhanden.');
      }

      // Build multimodal image parts
      const imageParts: ExtractImagePart[] = [];
      for (let idx = 0; idx < allPairs.length; idx++) {
        const pair = allPairs[idx];
        const cardNum = allPairs.length > 1 ? `Karte ${idx + 1} - ` : '';
        if (pair.frontDataUrl) {
          imageParts.push({
            imageBase64: pair.frontDataUrl.split(',')[1],
            mimeType: 'image/jpeg',
            label: `${cardNum}Vorderseite (Frage / Begriff)`
          });
        }
        if (pair.backDataUrl) {
          imageParts.push({
            imageBase64: pair.backDataUrl.split(',')[1],
            mimeType: 'image/jpeg',
            label: `${cardNum}Rückseite (Antwort / Erklärung)`
          });
        }
      }

      const primaryPreview = allPairs[0]?.frontDataUrl || allPairs[0]?.backDataUrl || null;
      setScannedImagePreview(primaryPreview);

      // Run extraction
      await runExtractionPipeline(imageParts, 'handwritten_cards', allPairs[0]?.frontDataUrl || undefined, allPairs[0]?.backDataUrl || undefined, allPairs);
    } catch (err: any) {
      console.error('Scan error:', err);
      setError(err?.message || 'Fehler beim Entziffern der Handschrift.');
      setScanProgress(null);
      setLoading(false);
    }
  };

  // Common extraction pipeline executing server-assisted or client-direct AI call
  const runExtractionPipeline = async (
    imageParts: ExtractImagePart[],
    mode: ScannerMode,
    frontPhotoUrl?: string,
    backPhotoUrl?: string,
    cardPairs?: CardPhotoSlot[]
  ) => {
    const currentApiKey = getStoredGeminiApiKey();

    setScanProgress({ 
      percent: 40, 
      status: mode === 'handwritten_cards' 
        ? 'Google-KI entziffert Handschrift der Vorder- & Rückseite...' 
        : 'Google-KI analysiert Foto & Fachinhalte...' 
    });

    let results: any[] = [];
    let extractedViaServer = false;

    // 1. Server-assisted extraction
    try {
      const targetUrl = getApiUrl('/api/extract');
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ 
          images: imageParts, 
          type,
          mode: mode === 'handwritten_cards' ? 'handwritten_card' : 'standard',
          apiKey: currentApiKey || undefined
        })
      });

      if (res.ok) {
        setScanProgress({ 
          percent: 80, 
          status: 'Handschrift wird strukturiert & als Lernkarten formatiert...' 
        });
        const data = await res.json().catch(() => null);
        if (data && Array.isArray(data.results)) {
          results = data.results;
          extractedViaServer = true;
        }
      } else if (!currentApiKey) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || `Serverfehler (${res.status})`);
      }
    } catch (serverErr: any) {
      if (!currentApiKey) {
        throw serverErr;
      }
      console.warn('Server-assisted extraction unavailable, falling back to direct API call:', serverErr);
    }

    // 2. Client-side fallback if server is not available
    if (!extractedViaServer && currentApiKey) {
      setScanProgress({ 
        percent: 70, 
        status: 'Direkte Erkennung über Google Gemini API...' 
      });
      results = await extractFromImageDirect(currentApiKey, imageParts, 'image/jpeg', type, mode);
    }

    setScanProgress({ percent: 95, status: 'Lernkarten werden geladen...' });

    if (!results || results.length === 0) {
      throw new Error('Es konnten keine Textinhalte auf den Fotos erkannt werden. Achte auf gute Beleuchtung, scharfen Fokus und lesbare Handschrift.');
    }

    // Map into editable items
    if (type === 'flashcard') {
      const items: EditableFlashcard[] = results
        .filter(r => r.question || r.answer)
        .map((r, idx) => {
          // If we have card pairs, associate the corresponding photo with the card
          const pair = cardPairs && cardPairs[idx] ? cardPairs[idx] : undefined;
          const assignedFront = attachPhotosToCards ? (pair?.frontDataUrl || frontPhotoUrl) : undefined;
          const assignedBack = attachPhotosToCards ? (pair?.backDataUrl || backPhotoUrl) : undefined;

          // Rubrik resolution:
          // Check if user explicitly pre-selected a standard or custom category before scan
          const userSelectedCatObj = availableCategories.find(c => c.id === selectedCategory);
          const hasExplicitUserCategory = Boolean(selectedCategory && selectedCategory !== 'all' && selectedCategory !== 'custom' && userSelectedCatObj);

          let targetCatId = selectedCategory;
          let rubrikTitle = userSelectedCatObj ? userSelectedCatObj.title : 'Bädertechnik';
          let isNew = false;

          const extractedRubrik = (r.rubrik || '').trim();

          // If the user didn't explicitly pre-select a specific rubric, use the extracted rubric from the card:
          if (!hasExplicitUserCategory && extractedRubrik) {
            const matched = matchExistingCategory(extractedRubrik, availableCategories);
            if (matched) {
              targetCatId = matched.id;
              rubrikTitle = matched.title;
              isNew = false;
            } else {
              targetCatId = 'new';
              rubrikTitle = extractedRubrik;
              isNew = true;
            }
          } else if (hasExplicitUserCategory) {
            targetCatId = userSelectedCatObj!.id;
            rubrikTitle = userSelectedCatObj!.title;
            isNew = false;
          }

          return {
            id: `scanned-fc-${Date.now()}-${idx}`,
            question: (r.question || '').trim(),
            answer: (r.answer || '').trim(),
            categoryId: targetCatId,
            rubrik: rubrikTitle,
            isNewRubrik: isNew,
            mediaUrlFront: assignedFront,
            mediaUrl: assignedBack,
            fromScan: true
          };
        });
      setEditableFlashcards(items);
    } else {
      const items: EditableGlossaryTerm[] = results
        .filter(r => r.term || r.definition)
        .map((r, idx) => ({
          id: `scanned-gloss-${Date.now()}-${idx}`,
          term: (r.term || '').trim(),
          definition: (r.definition || '').trim()
        }));
      setEditableGlossaryTerms(items);
    }

    setScanProgress({ percent: 100, status: 'Fertiggestellt!' });
    setTimeout(() => {
      setStep('review');
      setScanProgress(null);
      setLoading(false);
    }, 350);
  };

  const handleRubrikChange = (cardId: string, newRubrik: string) => {
    setEditableFlashcards(prev => prev.map(c => {
      if (c.id !== cardId) return c;
      const clean = newRubrik.trim();
      const matched = matchExistingCategory(clean, availableCategories);
      return {
        ...c,
        rubrik: newRubrik,
        categoryId: matched ? matched.id : (clean.length > 0 ? 'new' : selectedCategory),
        isNewRubrik: clean.length > 0 && !matched
      };
    }));
  };

  const handleSaveConfirmedResults = async () => {
    if (type === 'flashcard') {
      const validCards = editableFlashcards.filter(c => c.question.trim() && c.answer.trim());
      if (validCards.length === 0) {
        alert('Bitte trage mindestens eine Frage und Antwort ein.');
        return;
      }
      setSaveProgress({
        current: 0,
        total: validCards.length,
        percent: 5,
        status: `Prüfe Rubriken & bereite Speichern in der APK vor...`
      });

      const processedCards: any[] = [];
      const newlyCreatedRubriken: string[] = [];

      for (let i = 0; i < validCards.length; i++) {
        const card = validCards[i];
        
        let finalCatId = card.categoryId;
        let rubrikToUse = card.rubrik?.trim() || '';
        let isCreated = false;

        // Check if card.categoryId is already an existing, valid category ID
        const existingCat = availableCategories.find(c => c.id === card.categoryId);
        if (existingCat) {
          finalCatId = existingCat.id;
          rubrikToUse = existingCat.title;
        } else if (card.categoryId === 'new' || !finalCatId || finalCatId === 'custom') {
          // Only resolve/create if category is explicitly 'new' or unspecified
          const rubrikName = rubrikToUse || 
            availableCategories.find(c => c.id === selectedCategory)?.title || 
            'Eigene Fragen & Karten';
          const res = await resolveOrCreateCategory(rubrikName, selectedCategory);
          finalCatId = res.categoryId;
          rubrikToUse = res.categoryTitle;
          isCreated = res.isCreated;
          if (isCreated && !newlyCreatedRubriken.includes(rubrikToUse)) {
            newlyCreatedRubriken.push(rubrikToUse);
          }
        }

        setSaveProgress({
          current: i + 1,
          total: validCards.length,
          percent: Math.round(((i + 1) / validCards.length) * 90),
          status: `Prüfe Rubrik "${rubrikToUse}" & speichere Karte ${i + 1} von ${validCards.length}...`
        });

        processedCards.push({
          ...card,
          categoryId: finalCatId,
          rubrik: rubrikToUse,
          isCreatedCategory: isCreated,
          fromScan: true
        });
      }

      setSaveProgress({
        current: validCards.length,
        total: validCards.length,
        percent: 100,
        status: newlyCreatedRubriken.length > 0
          ? `${newlyCreatedRubriken.length} neue Rubrik(en) angelegt! Lernkarten werden gespeichert...`
          : 'Lernkarten erfolgreich gespeichert!'
      });

      await new Promise(r => setTimeout(r, 220));
      onResults(processedCards, processedCards[0]?.categoryId || selectedCategory);
    } else {
      const validTerms = editableGlossaryTerms.filter(t => t.term.trim() && t.definition.trim());
      if (validTerms.length === 0) {
        alert('Bitte trage mindestens einen Fachbegriff mit Definition ein.');
        return;
      }
      setSaveProgress({
        current: 1,
        total: validTerms.length,
        percent: 20,
        status: `Speichere ${validTerms.length} Fachbegriffe...`
      });
      await new Promise(r => setTimeout(r, 180));
      onResults(validTerms, selectedCategory);
    }
  };

  const handleAddNewItem = () => {
    if (type === 'flashcard') {
      setEditableFlashcards(prev => [
        ...prev,
        {
          id: `manual-fc-${Date.now()}`,
          question: '',
          answer: '',
          categoryId: selectedCategory
        }
      ]);
    } else {
      setEditableGlossaryTerms(prev => [
        ...prev,
        {
          id: `manual-gloss-${Date.now()}`,
          term: '',
          definition: ''
        }
      ]);
    }
  };

  const handleDeleteItem = (id: string) => {
    if (type === 'flashcard') {
      setEditableFlashcards(prev => prev.filter(item => item.id !== id));
    } else {
      setEditableGlossaryTerms(prev => prev.filter(item => item.id !== id));
    }
  };

  const getTargetTypeName = () => {
    if (type === 'flashcard') return 'Lernkarten';
    return 'Glossar-Einträge';
  };

  const getItemsCount = () => {
    if (type === 'flashcard') return editableFlashcards.length;
    return editableGlossaryTerms.length;
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className={`bg-white rounded-3xl shadow-2xl w-full ${step === 'review' ? 'max-w-3xl' : 'max-w-lg'} overflow-hidden relative max-h-[92vh] flex flex-col transition-all duration-200 border border-slate-200`}>
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/90 shrink-0">
          <div className="flex items-center gap-2.5">
            {step === 'review' ? (
              <button
                type="button"
                onClick={() => setStep('capture')}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors mr-1 cursor-pointer"
                title="Zurück zur Kamera/Fotoauswahl"
              >
                <ArrowLeft size={18} />
              </button>
            ) : null}
            
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              {scannerMode === 'handwritten_cards' ? <PenTool size={20} /> : <Camera size={20} />}
            </div>
            
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                {step === 'review' 
                  ? 'Erkannte Lernkarten prüfen' 
                  : (scannerMode === 'handwritten_cards' ? 'Handgeschriebene Karteikarten scannen' : 'KI Foto-Scan')}
                {step === 'review' && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    {getItemsCount()} {getItemsCount() === 1 ? 'Karte' : 'Karten'}
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 leading-tight">
                {step === 'review'
                  ? 'Prüfe Fragen & Antworten aus deiner Handschrift vor dem Speichern.'
                  : (scannerMode === 'handwritten_cards' 
                      ? 'Fotografiere Vorder- & Rückseite – Google KI entziffert den Text automatisch.' 
                      : 'Lerne aus Fotos deiner Prüfungsbögen oder Unterlagen.')}
              </p>
            </div>
          </div>

          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* STEP 1: CAPTURE / UPLOAD */}
        {step === 'capture' && (
          <div className="p-4 sm:p-6 overflow-y-auto">

            {/* Mode Selector Tabs (Handwritten Cards vs Single Document) */}
            {type === 'flashcard' && !loading && (
              <div className="flex bg-slate-100 p-1 rounded-2xl mb-4 border border-slate-200">
                <button
                  type="button"
                  onClick={() => setScannerMode('handwritten_cards')}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    scannerMode === 'handwritten_cards'
                      ? 'bg-white text-blue-700 shadow-xs border border-blue-200/60'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <PenTool size={14} className={scannerMode === 'handwritten_cards' ? 'text-blue-600' : 'text-slate-400'} />
                  <span>Handschrift (Vorder- & Rückseite)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setScannerMode('standard')}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    scannerMode === 'standard'
                      ? 'bg-white text-blue-700 shadow-xs border border-blue-200/60'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileText size={14} className={scannerMode === 'standard' ? 'text-blue-600' : 'text-slate-400'} />
                  <span>Standard (1 Foto / Dokument)</span>
                </button>
              </div>
            )}

            {/* Category Pre-Selection Box */}
            {availableCategories.length > 0 && type !== 'glossary' && !loading && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 mb-4 text-left shadow-2xs">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Folder size={14} className="text-blue-600" />
                    Ziel-Themenbereich auswählen:
                  </span>
                  <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                    Kategorie
                  </span>
                </label>
                
                <select
                  value={selectedCategory}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs cursor-pointer"
                >
                  {availableCategories.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-3.5 rounded-2xl text-xs sm:text-sm mb-4 text-left leading-relaxed animate-in fade-in">
                <div className="flex items-start gap-2">
                  <AlertCircle size={18} className="shrink-0 text-red-500 mt-0.5" />
                  <div>
                    <div className="font-semibold mb-0.5">Hinweis beim Scan:</div>
                    <div>{error}</div>
                  </div>
                </div>
              </div>
            )}

            {/* API Key Modal / Form */}
            {showKeyInputModal ? (
              <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 sm:p-5 mb-4 text-left animate-in fade-in">
                <div className="flex items-center gap-2 mb-2 text-blue-900 font-semibold text-sm">
                  <Key size={18} className="text-blue-600" />
                  <span>Direkter KI-Scan auf deinem Smartphone (APK)</span>
                </div>
                <p className="text-xs text-slate-600 mb-3 leading-relaxed">
                  Um den Scan deiner handschriftlichen Karteikarten direkt auf dem Smartphone mit Google Gemini zu nutzen, trage deinen kostenlosen API-Schlüssel ein:
                </p>

                <div className="relative mb-3">
                  <input 
                    type={showPassword ? 'text' : 'password'}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="AIzaSy..."
                    className="w-full px-3.5 py-2.5 pr-10 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                <div className="flex gap-2 mb-3">
                  <button
                    onClick={handleTestAndSaveKey}
                    disabled={testingKey}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-4 rounded-xl font-medium text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {testingKey ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    <span>Schlüssel prüfen & speichern</span>
                  </button>
                  {storedKey && (
                    <button
                      onClick={() => setShowKeyInputModal(false)}
                      className="bg-slate-200 hover:bg-slate-300 text-slate-700 py-2.5 px-3 rounded-xl font-medium text-xs transition-colors cursor-pointer"
                    >
                      Schließen
                    </button>
                  )}
                </div>

                {keyTestResult && (
                  <div className={`p-2.5 rounded-xl text-xs flex items-start gap-2 mb-3 ${
                    keyTestResult.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                  }`}>
                    {keyTestResult.ok ? <CheckCircle2 size={15} className="shrink-0 text-emerald-600 mt-0.5" /> : <AlertCircle size={15} className="shrink-0 text-red-600 mt-0.5" />}
                    <span>{keyTestResult.message}</span>
                  </div>
                )}

                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  <span>Hier kostenlosen Gemini-Schlüssel erstellen (Google AI Studio)</span>
                  <ExternalLink size={12} />
                </a>
              </div>
            ) : null}

            {/* LOADING STATE WITH ANIMATED LADEBALKEN */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                <div className="w-14 h-14 rounded-3xl bg-blue-100 text-blue-600 flex items-center justify-center mb-4 shadow-sm animate-pulse">
                  <Sparkles size={28} className="text-blue-600" />
                </div>
                <h4 className="text-slate-900 font-bold text-base mb-1">
                  {scannerMode === 'handwritten_cards' 
                    ? 'Handschrift wird entziffert...' 
                    : (type === 'flashcard' ? 'Lernkarten werden generiert...' : 'Fachbegriffe werden generiert...')}
                </h4>
                <p className="text-slate-500 text-xs mb-5 max-w-sm mx-auto leading-relaxed">
                  Google Gemini liest Vorder- und Rückseite deiner handschriftlichen Karteikarten ab und gleicht Fachinhalte ab.
                </p>

                {/* Animated Ladebalken */}
                <div className="w-full max-w-md bg-blue-50/90 border border-blue-200 rounded-2xl p-4 shadow-2xs text-left animate-in fade-in duration-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Loader2 size={16} className="text-blue-600 animate-spin shrink-0" />
                      <span className="font-bold text-xs text-blue-950">
                        {scanProgress?.status || 'Handschrift wird analysiert...'}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                      {scanProgress?.percent || 30}%
                    </span>
                  </div>
                  {/* Progress Track */}
                  <div className="w-full bg-blue-200/80 rounded-full h-2.5 overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 h-2.5 rounded-full transition-all duration-300 ease-out shadow-xs"
                      style={{ width: `${Math.max(10, scanProgress?.percent || 30)}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : scannerMode === 'handwritten_cards' && type === 'flashcard' ? (
              /* DEDICATED HANDWRITTEN CARDS DOUBLE-SIDED CAPTURE UI */
              <div className="flex flex-col gap-4 text-left">
                <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-3.5 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                    <PenTool size={16} />
                  </div>
                  <div className="text-xs text-indigo-950">
                    <p className="font-bold mb-0.5">So fügst du deine handgeschriebenen Karteikarten hinzu:</p>
                    <p className="text-indigo-800 leading-relaxed">
                      1. Fotografiere die <strong>Vorderseite</strong> (Frage oder Thema).<br />
                      2. Fotografiere die <strong>Rückseite</strong> (Antwort oder Fachformel).<br />
                      3. Die KI transkribiert deine Handschrift automatisch in bearbeitbare Lernkarten!
                    </p>
                  </div>
                </div>

                {/* HIDDEN INPUTS FOR FRONT & BACK */}
                <input 
                  type="file" 
                  accept="image/*" 
                  capture="environment"
                  className="hidden" 
                  ref={frontFileInputRef}
                  onChange={handleFrontFileSelected}
                />
                <input 
                  type="file" 
                  accept="image/*" 
                  capture="environment"
                  className="hidden" 
                  ref={backFileInputRef}
                  onChange={handleBackFileSelected}
                />

                {/* DUAL SLOTS GRID */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  
                  {/* SLOT 1: VORDERSEITE (FRAGE) */}
                  <div className={`rounded-2xl border-2 p-3.5 transition-all flex flex-col justify-between ${
                    frontImage 
                      ? 'bg-blue-50/60 border-blue-300' 
                      : 'bg-white border-dashed border-slate-300 hover:border-blue-400'
                  }`}>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-black uppercase tracking-wider text-blue-700 bg-blue-100 px-2 py-0.5 rounded-lg flex items-center gap-1">
                          1. Vorderseite
                        </span>
                        {frontImage && (
                          <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                            <Check size={12} className="stroke-[3]" /> Erfasst
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-slate-800 mb-1">
                        Frage / Begriff / Thema
                      </p>
                      <p className="text-[11px] text-slate-500 mb-3">
                        Foto der Vorderseite deiner handgeschriebenen Karte.
                      </p>
                    </div>

                    {frontImage ? (
                      <div className="relative group/preview mt-2">
                        <img 
                          src={frontImage} 
                          alt="Vorderseite Vorschau" 
                          className="w-full h-32 object-contain bg-slate-900 rounded-xl border border-slate-200"
                        />
                        <div className="flex items-center justify-between gap-1.5 mt-2">
                          <button
                            type="button"
                            onClick={() => setLightboxImage({ url: frontImage, title: 'Vorderseite (Frage)' })}
                            className="text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer"
                          >
                            <ZoomIn size={12} />
                            <span>Vorschau</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setFrontImage(null)}
                            className="text-[11px] font-semibold text-red-600 hover:bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 size={12} />
                            <span>Neu aufnehmen</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (!storedKey && !getStoredGeminiApiKey() && isNativeApp()) {
                              setShowKeyInputModal(true);
                            } else {
                              frontFileInputRef.current?.setAttribute('capture', 'environment');
                              frontFileInputRef.current?.click();
                            }
                          }}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-2xs transition-colors cursor-pointer"
                        >
                          <Camera size={16} />
                          <span>Vorderseite fotografieren</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!storedKey && !getStoredGeminiApiKey() && isNativeApp()) {
                              setShowKeyInputModal(true);
                            } else if (frontFileInputRef.current) {
                              frontFileInputRef.current.removeAttribute('capture');
                              frontFileInputRef.current.click();
                            }
                          }}
                          className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                        >
                          <Upload size={14} />
                          <span>Aus Galerie</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* SLOT 2: RÜCKSEITE (ANTWORT) */}
                  <div className={`rounded-2xl border-2 p-3.5 transition-all flex flex-col justify-between ${
                    backImage 
                      ? 'bg-emerald-50/60 border-emerald-300' 
                      : 'bg-white border-dashed border-slate-300 hover:border-emerald-400'
                  }`}>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-lg flex items-center gap-1">
                          2. Rückseite
                        </span>
                        {backImage && (
                          <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                            <Check size={12} className="stroke-[3]" /> Erfasst
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-slate-800 mb-1">
                        Antwort / Erklärung / Lösung
                      </p>
                      <p className="text-[11px] text-slate-500 mb-3">
                        Foto der Rückseite deiner handgeschriebenen Karte.
                      </p>
                    </div>

                    {backImage ? (
                      <div className="relative group/preview mt-2">
                        <img 
                          src={backImage} 
                          alt="Rückseite Vorschau" 
                          className="w-full h-32 object-contain bg-slate-900 rounded-xl border border-slate-200"
                        />
                        <div className="flex items-center justify-between gap-1.5 mt-2">
                          <button
                            type="button"
                            onClick={() => setLightboxImage({ url: backImage, title: 'Rückseite (Antwort)' })}
                            className="text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer"
                          >
                            <ZoomIn size={12} />
                            <span>Vorschau</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setBackImage(null)}
                            className="text-[11px] font-semibold text-red-600 hover:bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 size={12} />
                            <span>Neu aufnehmen</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (!storedKey && !getStoredGeminiApiKey() && isNativeApp()) {
                              setShowKeyInputModal(true);
                            } else {
                              backFileInputRef.current?.setAttribute('capture', 'environment');
                              backFileInputRef.current?.click();
                            }
                          }}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-2xs transition-colors cursor-pointer"
                        >
                          <Camera size={16} />
                          <span>Rückseite fotografieren</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!storedKey && !getStoredGeminiApiKey() && isNativeApp()) {
                              setShowKeyInputModal(true);
                            } else if (backFileInputRef.current) {
                              backFileInputRef.current.removeAttribute('capture');
                              backFileInputRef.current.click();
                            }
                          }}
                          className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                        >
                          <Upload size={14} />
                          <span>Aus Galerie</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* BATCH STACK LIST (IF ANY PREVIOUS CARDS WERE QUEUED) */}
                {cardStack.length > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-2">
                      <span className="flex items-center gap-1.5">
                        <Layers size={14} className="text-blue-600" />
                        Bereits erfasste Karten im Stapel ({cardStack.length}):
                      </span>
                      <button
                        type="button"
                        onClick={() => setCardStack([])}
                        className="text-red-600 hover:text-red-800 text-[11px] font-semibold cursor-pointer"
                      >
                        Stapel leeren
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {cardStack.map((pair, idx) => (
                        <div key={idx} className="bg-white border border-slate-200 rounded-xl p-1.5 flex items-center gap-2 text-xs">
                          <span className="font-bold text-slate-700">Karte #{idx + 1}</span>
                          <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                            {pair.frontDataUrl && pair.backDataUrl ? 'V+R' : (pair.frontDataUrl ? 'V' : 'R')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* HELPER CONTROLS & BATCH ADD */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 select-none">
                    <input 
                      type="checkbox"
                      checked={attachPhotosToCards}
                      onChange={(e) => setAttachPhotosToCards(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                    />
                    <span>Original-Fotos der Handschrift an Lernkarte anheften (werden nicht im Dokumenten-Archiv abgelegt)</span>
                  </label>

                  {(frontImage || backImage) && (
                    <button
                      type="button"
                      onClick={handleAddCardToStack}
                      className="text-xs font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Plus size={14} />
                      <span>Diese Karte zum Stapel &amp; nächste aufnehmen</span>
                    </button>
                  )}
                </div>

                {/* MAIN CTA BUTTON */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleStartHandwrittenScan}
                    disabled={!frontImage && !backImage && cardStack.length === 0}
                    className="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800 text-white font-bold py-3.5 px-6 rounded-2xl flex items-center justify-center gap-2.5 shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-sm sm:text-base active:scale-98"
                  >
                    <Sparkles size={18} className="text-amber-300" />
                    <span>
                      {cardStack.length > 0 
                        ? `Alle ${cardStack.length + (frontImage || backImage ? 1 : 0)} Karten mit KI entziffern` 
                        : 'Handschrift entziffern & Lernkarte erstellen'}
                    </span>
                    <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            ) : (
              /* STANDARD SINGLE-PHOTO SCAN UI */
              <div className="text-center">
                <p className="text-slate-500 mb-4 text-xs sm:text-sm leading-relaxed">
                  Lade ein Foto deiner Lernunterlagen (Fragen/Antworten) hoch. Die Google-KI erkennt die Inhalte automatisch und zeigt sie dir vor dem Speichern zur Kontrolle an.
                </p>

                <div className="flex flex-col gap-3">
                  <input 
                    type="file" 
                    accept="image/*" 
                    capture="environment"
                    className="hidden" 
                    ref={standardFileInputRef}
                    onChange={handleStandardFileChange}
                  />
                  <button 
                    onClick={() => {
                      if (!storedKey && !getStoredGeminiApiKey() && isNativeApp()) {
                        setShowKeyInputModal(true);
                      } else {
                        standardFileInputRef.current?.setAttribute('capture', 'environment');
                        standardFileInputRef.current?.click();
                      }
                    }}
                    className="w-full bg-blue-600 text-white font-semibold py-3.5 px-6 rounded-xl flex items-center justify-center gap-3 hover:bg-blue-700 transition-colors shadow-sm cursor-pointer"
                  >
                    <Camera size={22} />
                    <span>Foto aufnehmen</span>
                  </button>
                  <button 
                    onClick={() => {
                      if (!storedKey && !getStoredGeminiApiKey() && isNativeApp()) {
                        setShowKeyInputModal(true);
                      } else if (standardFileInputRef.current) {
                        standardFileInputRef.current.removeAttribute('capture');
                        standardFileInputRef.current.click();
                      }
                    }}
                    className="w-full bg-slate-100 text-slate-700 font-semibold py-3.5 px-6 rounded-xl flex items-center justify-center gap-3 hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    <Upload size={22} />
                    <span>Aus Galerie wählen</span>
                  </button>

                  <div className="mt-2 flex items-center justify-center gap-2">
                    <button
                      onClick={() => setShowKeyInputModal(!showKeyInputModal)}
                      className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1.5 py-1 cursor-pointer"
                    >
                      <Key size={13} />
                      <span>
                        {storedKey ? 'API-Schlüssel eingerichtet (Ändern)' : 'Gemini API-Schlüssel einrichten'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: REVIEW & EDIT EXTRACTED FLASHCARDS */}
        {step === 'review' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            
            {/* Top Toolbar: Global Category & Photo Preview Toggle */}
            <div className="p-3 sm:p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
              
              {/* Category picker */}
              {availableCategories.length > 0 && type !== 'glossary' && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-600 flex items-center gap-1">
                    <Folder size={14} className="text-blue-600" />
                    Rubrik für alle:
                  </span>
                  <select
                    value={selectedCategory}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs cursor-pointer"
                  >
                    {availableCategories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Photo View Button */}
              {scannedImagePreview && (
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => setShowImageInlinePreview(!showImageInlinePreview)}
                    className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border bg-white border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors shadow-2xs cursor-pointer"
                  >
                    <ImageIcon size={14} className="text-blue-600" />
                    <span>{showImageInlinePreview ? 'Foto ausblenden' : 'Originalfoto einblenden'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLightboxImage({ url: scannedImagePreview, title: 'Original-Foto' })}
                    className="flex items-center gap-1 text-xs font-semibold px-2 py-1.5 rounded-lg border bg-white border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors shadow-2xs cursor-pointer"
                    title="Foto in Großansicht öffnen"
                  >
                    <ZoomIn size={14} />
                  </button>
                </div>
              )}
            </div>

            {/* Collapsible Photo Preview Box */}
            {scannedImagePreview && showImageInlinePreview && (
              <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div 
                    onClick={() => setLightboxImage({ url: scannedImagePreview, title: 'Original-Foto des Scans' })}
                    className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden bg-slate-800 border border-slate-700 shrink-0 cursor-zoom-in group relative"
                  >
                    <img src={scannedImagePreview} alt="Scanned preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                      <ZoomIn size={14} />
                    </div>
                  </div>
                  <div className="text-xs text-slate-200">
                    <p className="font-semibold text-slate-100">Original-Handschrift zum Vergleichen</p>
                    <p className="text-[11px] text-slate-400">Tippe auf das Bild für die Großansicht zum Nachprüfen.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowImageInlinePreview(false)}
                  className="text-slate-400 hover:text-white p-1 text-xs cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {/* Editable Items Scrollable List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-slate-100/50">
              
              {/* FLASHCARDS FORM LIST */}
              {type === 'flashcard' && (
                <>
                  {editableFlashcards.map((card, index) => (
                    <div 
                      key={card.id} 
                      className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs hover:border-blue-300 transition-colors"
                    >
                      {/* Item Top Bar */}
                      <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center">
                            {index + 1}
                          </span>
                          <span className="text-xs font-bold text-slate-700">
                            Lernkarte #{index + 1}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {availableCategories.length > 0 && (
                            <select
                              value={card.categoryId === 'new' ? '' : card.categoryId}
                              onChange={(e) => {
                                const newCatId = e.target.value;
                                if (!newCatId) return;
                                const catObj = availableCategories.find(c => c.id === newCatId);
                                setEditableFlashcards(prev => prev.map(c => 
                                  c.id === card.id ? { 
                                    ...c, 
                                    categoryId: newCatId, 
                                    rubrik: catObj ? catObj.title : c.rubrik,
                                    isNewRubrik: false 
                                  } : c
                                ));
                              }}
                              className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              title="Bestehende Rubrik manuell auswählen"
                            >
                              <option value="" disabled>Rubrik zuweisen...</option>
                              {availableCategories.map(cat => (
                                <option key={cat.id} value={cat.id}>
                                  {cat.title}
                                </option>
                              ))}
                            </select>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDeleteItem(card.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title="Diese Karte entfernen"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      {/* 1. OBEN STEHT DIE RUBRIK */}
                      <div className="mb-3.5 p-2.5 bg-gradient-to-r from-blue-50/80 via-indigo-50/60 to-slate-50 rounded-xl border border-blue-100/80 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                          <Folder size={14} className="text-blue-600 shrink-0" />
                          <span className="text-xs font-bold text-slate-700 whitespace-nowrap">
                            Rubrik:
                          </span>
                          <input
                            type="text"
                            value={card.rubrik || ''}
                            onChange={(e) => handleRubrikChange(card.id, e.target.value)}
                            placeholder="Oben stehende Rubrik (z. B. Bädertechnik, DIN 19643)..."
                            className="flex-1 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
                          />
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {card.isNewRubrik ? (
                            <span 
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full"
                              title="Diese Rubrik ist noch nicht hinterlegt und wird beim Speichern automatisch neu erstellt"
                            >
                              <Sparkles size={11} className="text-amber-600" />
                              <span>Nicht hinterlegt: Wird erstellt</span>
                            </span>
                          ) : (
                            <span 
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full"
                              title="Rubrik ist bereits in der App hinterlegt"
                            >
                              <Check size={11} className="stroke-[3] text-emerald-600" />
                              <span>Hinterlegt</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 2. DANN DIE FRAGE [RECHTS DIE ANTWORT] */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        {/* Question Field (Front / Links) */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                              <span className="text-blue-600 font-black">Vorderseite:</span>
                              <span>Frage</span>
                            </label>
                            {card.mediaUrlFront && (
                              <div className="flex items-center gap-1 text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                                <ImageIcon size={10} />
                                <span>Foto</span>
                              </div>
                            )}
                          </div>
                          <textarea
                            rows={3}
                            value={card.question}
                            onChange={(e) => {
                              const val = e.target.value;
                              setEditableFlashcards(prev => prev.map(c => c.id === card.id ? { ...c, question: val } : c));
                            }}
                            placeholder="Frage eingeben..."
                            className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 focus:bg-white rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors resize-y leading-relaxed"
                          />
                          {/* Front Image preview if present */}
                          {card.mediaUrlFront && (
                            <div className="mt-2 flex items-center gap-2">
                              <div 
                                onClick={() => setLightboxImage({ url: card.mediaUrlFront!, title: `Lernkarte #${index + 1} - Foto Vorderseite` })}
                                className="w-12 h-12 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 cursor-zoom-in shrink-0 relative group"
                              >
                                <img src={card.mediaUrlFront} alt="Vorderseite" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white">
                                  <ZoomIn size={12} />
                                </div>
                              </div>
                              <div className="text-[11px] text-slate-500">
                                <p className="font-semibold text-slate-700">Handschrift der Vorderseite</p>
                                <button
                                  type="button"
                                  onClick={() => setEditableFlashcards(prev => prev.map(c => c.id === card.id ? { ...c, mediaUrlFront: undefined } : c))}
                                  className="text-red-600 hover:text-red-800 underline text-[10px] cursor-pointer"
                                >
                                  Foto entfernen
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Answer Field [Rechts die Antwort] */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                              <span className="text-emerald-700 font-black">Rückseite:</span>
                              <span>[Rechts die Antwort]</span>
                            </label>
                            {card.mediaUrl && (
                              <div className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                <ImageIcon size={10} />
                                <span>Foto</span>
                              </div>
                            )}
                          </div>
                          <textarea
                            rows={3}
                            value={card.answer}
                            onChange={(e) => {
                              const val = e.target.value;
                              setEditableFlashcards(prev => prev.map(c => c.id === card.id ? { ...c, answer: val } : c));
                            }}
                            placeholder="Antwort eingeben (Zeilenumbrüche erlaubt)..."
                            className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 focus:bg-white rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors resize-y leading-relaxed"
                          />
                          {/* Back Image preview if present */}
                          {card.mediaUrl && (
                            <div className="mt-2 flex items-center gap-2">
                              <div 
                                onClick={() => setLightboxImage({ url: card.mediaUrl!, title: `Lernkarte #${index + 1} - Foto Rückseite` })}
                                className="w-12 h-12 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 cursor-zoom-in shrink-0 relative group"
                              >
                                <img src={card.mediaUrl} alt="Rückseite" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white">
                                  <ZoomIn size={12} />
                                </div>
                              </div>
                              <div className="text-[11px] text-slate-500">
                                <p className="font-semibold text-slate-700">Handschrift der Rückseite</p>
                                <button
                                  type="button"
                                  onClick={() => setEditableFlashcards(prev => prev.map(c => c.id === card.id ? { ...c, mediaUrl: undefined } : c))}
                                  className="text-red-600 hover:text-red-800 underline text-[10px] cursor-pointer"
                                >
                                  Foto entfernen
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* GLOSSARY FORM LIST */}
              {type === 'glossary' && (
                <>
                  {editableGlossaryTerms.map((term, index) => (
                    <div 
                      key={term.id} 
                      className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs hover:border-blue-300 transition-colors"
                    >
                      {/* Top Bar */}
                      <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center">
                            {index + 1}
                          </span>
                          <span className="text-xs font-bold text-slate-700">
                            Fachbegriff #{index + 1}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteItem(term.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Diesen Begriff entfernen"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      {/* Term Field */}
                      <div className="mb-3.5">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                          Fachbegriff:
                        </label>
                        <input
                          type="text"
                          value={term.term}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditableGlossaryTerms(prev => prev.map(item => item.id === term.id ? { ...item, term: val } : item));
                          }}
                          placeholder="Begriff eingeben..."
                          className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 focus:bg-white rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                        />
                      </div>

                      {/* Definition Field */}
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                          Definition / Erklärung:
                        </label>
                        <textarea
                          rows={3}
                          value={term.definition}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditableGlossaryTerms(prev => prev.map(item => item.id === term.id ? { ...item, definition: val } : item));
                          }}
                          placeholder="Erklärung des Fachbegriffs..."
                          className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 focus:bg-white rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors resize-y leading-relaxed"
                        />
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* Add item button */}
              <button
                type="button"
                onClick={handleAddNewItem}
                className="w-full py-3 px-4 border-2 border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50/50 text-slate-600 hover:text-blue-700 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Plus size={16} />
                <span>Weiteren Eintrag manuell hinzufügen</span>
              </button>
            </div>

            {/* Modal Bottom Footer / CTA Bar */}
            <div className="p-4 sm:p-5 bg-white border-t border-slate-200 flex flex-col gap-3 shrink-0">
              {saveProgress && (
                <div className="w-full bg-blue-50/90 border border-blue-200 rounded-2xl p-3.5 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between mb-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <Loader2 size={14} className="text-blue-600 animate-spin shrink-0" />
                      <span className="font-bold text-blue-900">{saveProgress.status}</span>
                    </div>
                    <span className="font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full text-[11px]">
                      {saveProgress.percent}%
                    </span>
                  </div>
                  <div className="w-full bg-blue-200/80 rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${saveProgress.percent}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStep('capture')}
                    disabled={!!saveProgress}
                    className="px-3 sm:px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl text-xs sm:text-sm font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw size={15} />
                    <span>Neuer Scan</span>
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={!!saveProgress}
                    className="px-3 py-2.5 text-slate-500 hover:text-slate-800 rounded-xl text-xs sm:text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    Abbrechen
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleSaveConfirmedResults}
                  disabled={getItemsCount() === 0 || !!saveProgress}
                  className="flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {saveProgress ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>Wird gespeichert...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={18} />
                      <span>
                        {getItemsCount() === 1 ? '1 Lernkartei zur APK hinzufügen' : `Alle ${getItemsCount()} Lernkarten zur APK hinzufügen`}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Lightbox Modal for Full-Size Photo Inspection */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setLightboxImage(null)}
        >
          <div 
            className="relative bg-slate-900 rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl border border-slate-700 flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3.5 border-b border-slate-800 bg-slate-950">
              <div className="flex items-center gap-2 text-white text-sm font-bold">
                <ImageIcon size={16} className="text-blue-400" />
                <span>{lightboxImage.title}</span>
              </div>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-2 flex items-center justify-center bg-black/50 min-h-[300px]">
              <img 
                src={lightboxImage.url} 
                alt="Enlarged inspection" 
                className="max-h-[75vh] w-auto max-w-full object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
