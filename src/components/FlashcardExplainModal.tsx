import React, { useMemo } from 'react';
import { 
  Sparkles, 
  X, 
  BookA, 
  Lightbulb, 
  CheckCircle2, 
  ArrowRight,
  HelpCircle,
  Layers,
  GraduationCap
} from 'lucide-react';
import { Flashcard, GlossaryTerm } from '../types';
import { FormattedText } from './FormattedText';

interface Props {
  card: Flashcard;
  categoryTitle: string;
  allGlossaryTerms: GlossaryTerm[];
  onClose: () => void;
  onOpenGlossaryModal?: (card: Flashcard) => void;
}

export const FlashcardExplainModal: React.FC<Props> = ({
  card,
  categoryTitle,
  allGlossaryTerms,
  onClose,
  onOpenGlossaryModal
}) => {
  if (!card) return null;

  // Find related glossary terms by keyword matching
  const matchingGlossaryTerms = useMemo(() => {
    if (!allGlossaryTerms || allGlossaryTerms.length === 0) return [];
    
    const textToScan = `${card.question || ''} ${card.answer || ''}`.toLowerCase();
    
    return allGlossaryTerms.filter(item => {
      const termLower = item.term.toLowerCase().trim();
      if (termLower.length < 3) return false;
      
      // Match exact term or term parts
      if (textToScan.includes(termLower)) return true;
      
      // Check for compound words (e.g., "beckenwasser" in "beckenwassererwärmung")
      const words = termLower.split(/[\s-]+/);
      return words.some(w => w.length >= 4 && textToScan.includes(w));
    }).slice(0, 5); // top 5 matches
  }, [card, allGlossaryTerms]);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150"
      style={{
        paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))',
        paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
      }}
      onClick={onClose}
    >
      <div 
        className="relative bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 text-left my-auto max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0 gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-100 shadow-2xs">
              <Sparkles size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                  NotebookLM Erklärung
                </h2>
                <span className="text-[11px] font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-100/60">
                  {categoryTitle}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Vertiefende Zusammenfassung &amp; relevante Fachbegriffe
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors shrink-0"
            title="Schließen"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="flex-1 overflow-y-auto py-4 space-y-5 pr-1">
          {/* Question & Answer Recap Box */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 block mb-1">
                Frage
              </span>
              <p className="text-sm font-semibold text-slate-800 leading-snug">
                <FormattedText text={card.question} />
              </p>
            </div>

            <div className="border-t border-slate-200/60 pt-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 block mb-1">
                Kernaussage / Antwort
              </span>
              <div className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                <FormattedText text={card.answer} />
              </div>
            </div>
          </div>

          {/* Exam / Practical Tip Box */}
          <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                <Lightbulb size={18} />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs sm:text-sm font-bold text-amber-900">
                  Prüfungs- &amp; Praxisrelevanz (FAB)
                </h4>
                <p className="text-xs text-amber-800 leading-relaxed">
                  Präge dir bei dieser Karte insbesondere die exakten Fachtermini und Zusammenhänge ein. 
                  In der Abschlussprüfung werden Definitionen und praktische Handlungsabläufe (z. B. nach DIN 19643, GUV-R 1/112 oder Rettungsvorschriften) detailliert abgefragt.
                </p>
              </div>
            </div>
          </div>

          {/* Related Glossary Definitions */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h4 className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-2">
                <BookA size={16} className="text-blue-600" />
                <span>Relevante Fachbegriffe im Glossar ({matchingGlossaryTerms.length})</span>
              </h4>
            </div>

            {matchingGlossaryTerms.length === 0 ? (
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
                Keine direkten namentlichen Treffer im Fachglossar gefunden. Du kannst diese Karte mit einem Klick als neuen Begriff aufnehmen.
              </div>
            ) : (
              <div className="space-y-2.5">
                {matchingGlossaryTerms.map((term) => (
                  <div 
                    key={term.id}
                    className="p-3 bg-white border border-slate-200 rounded-xl shadow-2xs hover:border-slate-300 transition-all text-left"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-bold text-xs sm:text-sm text-slate-900 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-600 inline-block" />
                        {term.term}
                      </span>
                      {term.pdfUrl && (
                        <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                          PDF
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      <FormattedText text={term.definition} />
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 shrink-0 flex-wrap">
          {onOpenGlossaryModal && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenGlossaryModal(card);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-semibold transition-colors border border-indigo-200/60"
            >
              <Sparkles size={14} className="text-indigo-600" />
              <span>Ins Fachglossar übernehmen (KI)</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="ml-auto px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition-colors shadow-2xs"
          >
            Fertig &amp; Weiterlernen
          </button>
        </div>
      </div>
    </div>
  );
};
