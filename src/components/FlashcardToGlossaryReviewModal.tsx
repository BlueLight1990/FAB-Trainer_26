import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  Book, 
  Loader2, 
  X, 
  Check, 
  Trash2, 
  AlertCircle, 
  RefreshCw, 
  ChevronDown, 
  ChevronUp, 
  Layers,
  Image as ImageIcon,
  Upload,
  Eye,
  CheckSquare,
  Square
} from 'lucide-react';
import { addGlossaryTerm } from '../lib/db';
import { 
  convertFlashcardsToGlossaryWithAI, 
  FlashcardInputForGlossary, 
  ConvertedGlossaryResult 
} from '../lib/geminiClient';
import { compressImageFile } from '../lib/imageUtils';

export interface EditableGlossaryEntry extends ConvertedGlossaryResult {
  includePhoto: boolean;
  isCustomPhoto?: boolean;
}

interface Props {
  cards: FlashcardInputForGlossary[];
  onSaved: (count: number) => void;
  onClose: () => void;
}

export function FlashcardToGlossaryReviewModal({ cards, onSaved, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [conversionProgress, setConversionProgress] = useState<{ percent: number; status: string } | null>(null);
  const [saveProgress, setSaveProgress] = useState<{ current: number; total: number; percent: number; status: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editableResults, setEditableResults] = useState<EditableGlossaryEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [compressingId, setCompressingId] = useState<string | null>(null);

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const runAiConversion = async () => {
    if (!cards || cards.length === 0) return;
    setLoading(true);
    setConversionProgress({ percent: 20, status: 'Lernkarten werden analysiert...' });
    setError(null);

    const progressTimer = setTimeout(() => {
      setConversionProgress({ percent: 65, status: 'Fachbegriffe & Definitionen werden formuliert...' });
    }, 500);

    try {
      const results = await convertFlashcardsToGlossaryWithAI(cards);
      clearTimeout(progressTimer);
      setConversionProgress({ percent: 95, status: 'Ergebnisse werden geladen...' });

      if (!results || results.length === 0) {
        throw new Error('Es konnten keine Glossar-Einträge aus den Lernkarten generiert werden.');
      }
      setEditableResults(
        results.map(r => ({
          ...r,
          includePhoto: Boolean(r.mediaUrl && r.mediaUrl.trim().length > 0)
        }))
      );
      setConversionProgress({ percent: 100, status: 'Fertiggestellt!' });
      await new Promise(r => setTimeout(r, 250));
      setConversionProgress(null);
    } catch (err: any) {
      clearTimeout(progressTimer);
      console.error('Fehler bei KI-Glossar-Generierung:', err);
      setError(err?.message || 'Fehler bei der KI-Umwandlung ins Glossar');
      setConversionProgress(null);
      
      // Resilient Fallback: populate editable items directly from cards so user can still manually refine
      if (editableResults.length === 0) {
        const fallbackItems: EditableGlossaryEntry[] = cards.map((c, idx) => ({
          id: `fallback_${Date.now()}_${idx}`,
          sourceFlashcardId: c.id,
          originalQuestion: c.question,
          originalAnswer: c.answer,
          mediaUrl: c.mediaUrl,
          includePhoto: Boolean(c.mediaUrl && c.mediaUrl.trim().length > 0),
          term: c.question.replace(/\?+$/, '').trim(),
          definition: c.answer.trim()
        }));
        setEditableResults(fallbackItems);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runAiConversion();
  }, []);

  const handleUpdateItem = (id: string, field: 'term' | 'definition', value: string) => {
    setEditableResults(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  const handleToggleIncludePhoto = (id: string) => {
    setEditableResults(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, includePhoto: !item.includePhoto };
      }
      return item;
    }));
  };

  const handleRemovePhoto = (id: string) => {
    setEditableResults(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, mediaUrl: undefined, includePhoto: false, isCustomPhoto: false };
      }
      return item;
    }));
  };

  const handleFileUpload = async (id: string, file: File) => {
    try {
      setCompressingId(id);
      const compressedDataUrl = await compressImageFile(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.82 });
      setEditableResults(prev => prev.map(item => {
        if (item.id === id) {
          return {
            ...item,
            mediaUrl: compressedDataUrl,
            includePhoto: true,
            isCustomPhoto: true
          };
        }
        return item;
      }));
    } catch (err: any) {
      alert(err.message || 'Fehler beim Laden des Bildes.');
    } finally {
      setCompressingId(null);
    }
  };

  const handleRemoveItem = (id: string) => {
    setEditableResults(prev => prev.filter(item => item.id !== id));
  };

  const toggleSourceExpand = (id: string) => {
    setExpandedSources(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSaveAll = async () => {
    const validItems = editableResults.filter(
      item => item.term.trim().length > 0 && item.definition.trim().length > 0
    );

    if (validItems.length === 0) {
      alert('Bitte fülle mindestens einen Begriff und dessen Definition aus.');
      return;
    }

    try {
      setIsSaving(true);
      setSaveProgress({
        current: 0,
        total: validItems.length,
        percent: 10,
        status: `Speichere ${validItems.length} Einträge ins Glossar...`
      });

      for (let i = 0; i < validItems.length; i++) {
        const item = validItems[i];
        setSaveProgress({
          current: i + 1,
          total: validItems.length,
          percent: Math.round(((i + 1) / validItems.length) * 100),
          status: `Speichere Begriff ${i + 1} von ${validItems.length}: „${item.term}“...`
        });

        await addGlossaryTerm({
          term: item.term.trim(),
          definition: item.definition.trim(),
          mediaUrl: (item.includePhoto && item.mediaUrl?.trim()) ? item.mediaUrl.trim() : undefined,
          createdAt: Date.now()
        });
      }

      await new Promise(r => setTimeout(r, 200));
      setSaveProgress(null);
      onSaved(validItems.length);
      onClose();
    } catch (err: any) {
      console.error('Fehler beim Speichern ins Glossar:', err);
      alert('Fehler beim Speichern: ' + (err?.message || 'Unbekannter Fehler'));
      setSaveProgress(null);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden relative max-h-[92vh] flex flex-col border border-slate-200">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 shadow-2xs">
              <Sparkles size={20} className="text-amber-600" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                Lernkarte in Glossar aufnehmen (KI)
                {editableResults.length > 0 && !loading && (
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                    {editableResults.length} {editableResults.length === 1 ? 'Eintrag' : 'Einträge'}
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500">
                Prüfe Fachbegriff, Definition und entscheide, ob das hinterlegte Foto mit übernommen werden soll.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-xl transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <div className="relative mb-4">
                <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center border border-amber-200 shadow-inner">
                  <Book size={28} className="text-amber-600 animate-pulse" />
                </div>
                <div className="absolute -top-1 -right-1">
                  <Sparkles size={18} className="text-amber-500 animate-spin" />
                </div>
              </div>
              <h4 className="text-base font-bold text-slate-800 mb-1">
                KI formuliert Fachbegriff &amp; Definition...
              </h4>
              <p className="text-xs text-slate-500 max-w-md mb-4">
                Die Frage und Antwort der Lernkarte wird fachlich analysiert und in einen präzisen, nachschlagbaren Glossar-Eintrag umgewandelt.
              </p>

              {/* Conversion Ladebalken */}
              <div className="w-full max-w-sm bg-amber-50/90 border border-amber-200 rounded-2xl p-4 shadow-2xs text-left animate-in fade-in duration-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Loader2 size={16} className="text-amber-600 animate-spin shrink-0" />
                    <span className="font-bold text-xs text-amber-900">
                      {conversionProgress?.status || 'Wird generiert...'}
                    </span>
                  </div>
                  <span className="text-xs font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                    {conversionProgress?.percent || 30}%
                  </span>
                </div>
                {/* Progress Track */}
                <div className="w-full bg-amber-200/80 rounded-full h-2.5 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-amber-500 to-amber-600 h-2.5 rounded-full transition-all duration-300 ease-out shadow-xs"
                    style={{ width: `${Math.max(8, conversionProgress?.percent || 30)}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <>
              {error && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-xs text-amber-800">
                  <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span className="font-bold block mb-0.5">Hinweis zur KI-Generierung</span>
                    <span>{error}. Du kannst die Einträge unten direkt manuell prüfen, bearbeiten und speichern.</span>
                  </div>
                  <button
                    type="button"
                    onClick={runAiConversion}
                    className="px-2.5 py-1 bg-white hover:bg-amber-100 text-amber-800 font-semibold rounded-lg border border-amber-300 transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw size={12} />
                    <span>Erneut versuchen</span>
                  </button>
                </div>
              )}

              {editableResults.length === 0 ? (
                <div className="py-12 text-center text-slate-500">
                  <p className="text-sm font-semibold">Keine Einträge vorhanden.</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {editableResults.map((item, idx) => {
                    const isExpanded = !!expandedSources[item.id];
                    const hasPhoto = Boolean(item.mediaUrl && item.mediaUrl.trim().length > 0);
                    const isCompressing = compressingId === item.id;

                    return (
                      <div 
                        key={item.id}
                        className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs hover:border-amber-300 transition-all space-y-3.5"
                      >
                        {/* Top Bar for item */}
                        <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-800 font-bold text-xs flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span className="text-xs font-bold text-slate-700">
                              Glossar-Eintrag #{idx + 1}
                            </span>
                            {hasPhoto && (
                              <span className="text-[11px] px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 font-medium flex items-center gap-1">
                                <ImageIcon size={11} />
                                <span>Mit Foto</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {editableResults.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(item.id)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                title="Diesen Eintrag verwerfen"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Collapsible Source Card Reference */}
                        {(item.originalQuestion || item.originalAnswer) && (
                          <div className="bg-white/90 border border-slate-200/70 rounded-xl overflow-hidden text-xs">
                            <button
                              type="button"
                              onClick={() => toggleSourceExpand(item.id)}
                              className="w-full px-3 py-2 flex items-center justify-between text-left text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                            >
                              <div className="flex items-center gap-2 font-semibold">
                                <Layers size={13} className="text-slate-400" />
                                <span>Ursprüngliche Lernkarte anzeigen</span>
                              </div>
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                            
                            {isExpanded && (
                              <div className="p-3 border-t border-slate-100 bg-slate-50/50 space-y-2">
                                <div>
                                  <span className="font-bold text-slate-700 block mb-0.5">Frage:</span>
                                  <p className="text-slate-800 font-medium bg-white p-2 rounded-lg border border-slate-200">
                                    {item.originalQuestion}
                                  </p>
                                </div>
                                <div>
                                  <span className="font-bold text-slate-700 block mb-0.5">Antwort:</span>
                                  <p className="text-slate-800 font-medium bg-white p-2 rounded-lg border border-slate-200">
                                    {item.originalAnswer}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Editable Term (Fachbegriff) */}
                        <div>
                          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                            Fachbegriff / Stichwort (Titel):
                          </label>
                          <input
                            type="text"
                            value={item.term}
                            onChange={(e) => handleUpdateItem(item.id, 'term', e.target.value)}
                            placeholder="z. B. Freies Chlor, Totraum, Rautek-Griff..."
                            className="w-full px-3.5 py-2.5 bg-white border border-slate-200 focus:border-amber-500 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all"
                          />
                        </div>

                        {/* Editable Definition */}
                        <div>
                          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                            Definition &amp; Erklärung:
                          </label>
                          <textarea
                            rows={3}
                            value={item.definition}
                            onChange={(e) => handleUpdateItem(item.id, 'definition', e.target.value)}
                            placeholder="Fachliche Erklärung des Begriffs..."
                            className="w-full px-3.5 py-2.5 bg-white border border-slate-200 focus:border-amber-500 rounded-xl text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all resize-y leading-relaxed"
                          />
                        </div>

                        {/* Photo Attachment Option & Management */}
                        <div className="pt-1">
                          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                            Foto für den Glossar-Eintrag:
                          </label>

                          {hasPhoto ? (
                            <div className={`p-3 rounded-xl border transition-all ${item.includePhoto ? 'bg-amber-50/60 border-amber-200/90' : 'bg-slate-100/80 border-slate-200 opacity-75'}`}>
                              <div className="flex items-center justify-between gap-3 flex-wrap">
                                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={item.includePhoto}
                                    onChange={() => handleToggleIncludePhoto(item.id)}
                                    className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300 cursor-pointer"
                                  />
                                  <span className={`text-xs font-bold ${item.includePhoto ? 'text-amber-950' : 'text-slate-600'}`}>
                                    Hinterlegtes Foto mit ins Glossar übernehmen
                                  </span>
                                </label>

                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setPreviewImageUrl(item.mediaUrl || null)}
                                    className="px-2 py-1 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium border border-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
                                    title="Großansicht"
                                  >
                                    <Eye size={12} />
                                    <span>Vorschau</span>
                                  </button>
                                  
                                  <button
                                    type="button"
                                    onClick={() => fileInputRefs.current[item.id]?.click()}
                                    className="px-2 py-1 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium border border-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
                                    title="Anderes Foto hochladen"
                                  >
                                    <Upload size={12} />
                                    <span>Ändern</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleRemovePhoto(item.id)}
                                    className="px-2 py-1 bg-white hover:bg-red-50 text-red-600 rounded-lg text-xs font-medium border border-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
                                    title="Foto ganz entfernen"
                                  >
                                    <Trash2 size={12} />
                                    <span>Entfernen</span>
                                  </button>
                                </div>
                              </div>

                              {/* Thumbnail preview */}
                              <div className="mt-2.5 flex items-center gap-3">
                                <div 
                                  onClick={() => setPreviewImageUrl(item.mediaUrl || null)}
                                  className="relative group cursor-pointer shrink-0"
                                >
                                  <img 
                                    src={item.mediaUrl} 
                                    alt="Glossar-Foto Vorschau" 
                                    className="h-16 w-24 object-cover rounded-lg border border-slate-200/90 shadow-2xs group-hover:opacity-90 transition-opacity"
                                  />
                                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 rounded-lg flex items-center justify-center transition-opacity text-white text-[10px] font-bold">
                                    <Eye size={14} />
                                  </div>
                                </div>
                                <div className="text-[11px] text-slate-500 leading-tight">
                                  {item.includePhoto ? (
                                    <span className="text-amber-800 font-medium">
                                      ✓ Foto wird beim Speichern als Abbildung im Fachglossar hinterlegt.
                                    </span>
                                  ) : (
                                    <span className="text-slate-500">
                                      Foto ist deaktiviert und wird nicht ins Glossar übernommen.
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => fileInputRefs.current[item.id]?.click()}
                                disabled={isCompressing}
                                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-dashed border-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                              >
                                {isCompressing ? (
                                  <>
                                    <Loader2 size={13} className="animate-spin text-amber-600" />
                                    <span>Bild wird optimiert...</span>
                                  </>
                                ) : (
                                  <>
                                    <ImageIcon size={14} className="text-slate-500" />
                                    <span>+ Foto an diesen Glossar-Eintrag anhängen</span>
                                  </>
                                )}
                              </button>
                            </div>
                          )}

                          {/* Hidden File Input for uploading / replacing photo */}
                          <input
                            ref={el => { fileInputRefs.current[item.id] = el; }}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                handleFileUpload(item.id, file);
                              }
                              e.target.value = '';
                            }}
                          />
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/90 flex flex-col gap-3 shrink-0">
          {saveProgress && (
            <div className="w-full bg-amber-50/90 border border-amber-200 rounded-2xl p-3.5 animate-in fade-in duration-150">
              <div className="flex items-center justify-between mb-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <Loader2 size={14} className="text-amber-600 animate-spin shrink-0" />
                  <span className="font-bold text-amber-900">{saveProgress.status}</span>
                </div>
                <span className="font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full text-[11px]">
                  {saveProgress.percent}%
                </span>
              </div>
              <div className="w-full bg-amber-200/80 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-amber-600 h-2 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${saveProgress.percent}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
            >
              Abbrechen
            </button>

            <button
              type="button"
              onClick={handleSaveAll}
              disabled={loading || isSaving || editableResults.length === 0}
              className="px-5 py-2.5 bg-linear-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-bold text-sm rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            >
              {isSaving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Wird gespeichert...</span>
                </>
              ) : (
                <>
                  <Check size={16} />
                  <span>
                    {editableResults.length === 1 
                      ? 'Ins Glossar übernehmen' 
                      : `Alle ${editableResults.length} Einträge ins Glossar übernehmen`}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>

      {/* Image Lightbox Modal */}
      {previewImageUrl && (
        <div 
          className="fixed inset-0 z-70 bg-black/85 flex items-center justify-center p-4"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-slate-900 rounded-2xl overflow-hidden p-2">
            <button
              onClick={() => setPreviewImageUrl(null)}
              className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
            >
              <X size={20} />
            </button>
            <img 
              src={previewImageUrl} 
              alt="Vorschau" 
              className="max-h-[85vh] w-auto object-contain mx-auto rounded-lg"
            />
          </div>
        </div>
      )}

    </div>
  );
}
