import React, { useState } from 'react';
import { Category, Flashcard } from '../types';
import { 
  FolderInput, 
  FolderPlus, 
  Search, 
  X, 
  Check, 
  Loader2, 
  Layers, 
  Sparkles, 
  ArrowRight,
  Folder
} from 'lucide-react';

interface BatchMoveModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCards: Flashcard[];
  categories: Category[];
  onMoveConfirmed: (targetCategoryId: string) => Promise<void>;
  onCreateAndMove: (newCategoryTitle: string, newDescription?: string) => Promise<void>;
}

export function BatchMoveModal({
  isOpen,
  onClose,
  selectedCards,
  categories,
  onMoveConfirmed,
  onCreateAndMove
}: BatchMoveModalProps) {
  if (!isOpen || selectedCards.length === 0) return null;

  // Filter out 'all' category for move target
  const validCategories = categories.filter(c => c.id !== 'all');

  // Initial target category: pick first category that isn't the current category of the first card if possible
  const [selectedTargetCatId, setSelectedTargetCatId] = useState<string>(() => {
    const firstCardCat = selectedCards[0]?.categoryId;
    const alternate = validCategories.find(c => c.id !== firstCardCat);
    return alternate ? alternate.id : (validCategories[0]?.id || 'technik');
  });

  const [activeTab, setActiveTab] = useState<'existing' | 'create'>('existing');
  const [searchFilter, setSearchFilter] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCardsPreview, setShowCardsPreview] = useState(false);

  // Filtered categories based on search
  const filteredCategories = validCategories.filter(cat => 
    cat.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
    (cat.description && cat.description.toLowerCase().includes(searchFilter.toLowerCase()))
  );

  const selectedCategoryObj = validCategories.find(c => c.id === selectedTargetCatId);

  const handleSubmitExisting = async () => {
    if (!selectedTargetCatId || isProcessing) return;
    setIsProcessing(true);
    try {
      await onMoveConfirmed(selectedTargetCatId);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmitNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || isProcessing) return;
    setIsProcessing(true);
    try {
      await onCreateAndMove(newTitle.trim(), newDescription.trim() || undefined);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 shadow-2xs">
              <FolderInput size={22} />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                <span>Lernkarten verschieben</span>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                  {selectedCards.length} {selectedCards.length === 1 ? 'Karte' : 'Karten'}
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Wähle eine bestehende Rubrik oder erstelle direkt eine neue Zielrubrik.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-200/60 transition-colors disabled:opacity-40 cursor-pointer"
            title="Schließen"
          >
            <X size={18} />
          </button>
        </div>

        {/* Selected Cards Summary & Toggleable Preview */}
        <div className="px-4 py-3 bg-blue-50/50 border-b border-blue-100/80 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-blue-950 flex items-center gap-1.5">
              <Layers size={14} className="text-blue-600" />
              <span>{selectedCards.length} {selectedCards.length === 1 ? 'ausgewählte Lernkarte' : 'ausgewählte Lernkarten'}</span>
            </span>
            <button
              type="button"
              onClick={() => setShowCardsPreview(!showCardsPreview)}
              className="text-blue-700 hover:text-blue-900 font-bold underline transition-colors cursor-pointer"
            >
              {showCardsPreview ? 'Vorschau verbergen' : 'Karten anzeigen'}
            </button>
          </div>

          {showCardsPreview && (
            <div className="mt-2.5 max-h-36 overflow-y-auto space-y-1.5 p-2 bg-white rounded-xl border border-blue-100 text-[11px] shadow-2xs">
              {selectedCards.map((card, idx) => (
                <div key={card.id} className="flex items-center justify-between gap-2 py-0.5 border-b border-slate-100 last:border-0">
                  <span className="truncate text-slate-800 font-medium">
                    <span className="text-slate-400 font-bold mr-1">#{idx + 1}</span>
                    {card.question}
                  </span>
                  <span className="shrink-0 text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-semibold">
                    {categories.find(c => c.id === card.categoryId)?.title || 'Allgemein'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mode Tabs (Existing vs Create New) */}
        <div className="px-4 sm:px-5 pt-4 pb-2">
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl border border-slate-200/80">
            <button
              type="button"
              onClick={() => setActiveTab('existing')}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'existing'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Folder size={14} />
              <span>Vorhandene Rubrik</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('create')}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'create'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FolderPlus size={14} />
              <span>➕ Neue Rubrik anlegen</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'existing' ? (
            <div className="space-y-3">
              {/* Category Search Filter */}
              {validCategories.length > 5 && (
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Rubrik suchen..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="w-full pl-9 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {searchFilter && (
                    <button
                      type="button"
                      onClick={() => setSearchFilter('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              )}

              {/* Categories Radio/Card List */}
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {filteredCategories.length === 0 ? (
                  <div className="text-center py-6 text-slate-500 text-xs">
                    Keine Rubrik gefunden. Erstelle eine neue über den Reiter „Neue Rubrik anlegen“.
                  </div>
                ) : (
                  filteredCategories.map((cat) => {
                    const isSelected = selectedTargetCatId === cat.id;
                    const cardsInThisCat = selectedCards.filter(c => c.categoryId === cat.id).length;

                    return (
                      <div
                        key={cat.id}
                        onClick={() => setSelectedTargetCatId(cat.id)}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'bg-blue-50/90 border-blue-500 ring-2 ring-blue-500/20 shadow-2xs'
                            : 'bg-white border-slate-200 hover:border-blue-200 hover:bg-slate-50/60'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                            isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                          }`}>
                            <Folder size={16} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                              {cat.title}
                            </p>
                            {cat.description && (
                              <p className="text-[11px] text-slate-500 truncate">
                                {cat.description}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {cardsInThisCat > 0 && (
                            <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md font-semibold" title="Karten aus der Auswahl, die bereits in dieser Rubrik sind">
                              {cardsInThisCat} bereits hier
                            </span>
                          )}
                          <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                            isSelected
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}>
                            {isSelected && <Check size={12} className="stroke-[3]" />}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmitNew} className="space-y-3.5">
              <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900">
                <Sparkles size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <p>
                  Gib den Namen der neuen Rubrik ein. Die Rubrik wird automatisch angelegt und die <strong>{selectedCards.length} ausgewählten Karten</strong> werden sofort dorthin verschoben.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Name der neuen Rubrik *
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="z.B. Arbeitssicherheit, Wasseraufbereitung Spezial, ..."
                  required
                  autoFocus
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Kurzbeschreibung (optional)
                </label>
                <input
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="z.B. Alle Vorschriften und Merkblätter für Bäder"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </form>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 text-slate-600 hover:bg-slate-200/60 rounded-xl text-xs sm:text-sm font-semibold transition-colors disabled:opacity-40 cursor-pointer"
          >
            Abbrechen
          </button>

          {activeTab === 'existing' ? (
            <button
              type="button"
              onClick={handleSubmitExisting}
              disabled={!selectedTargetCatId || isProcessing}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold transition-all shadow-sm disabled:opacity-50 flex items-center gap-2 cursor-pointer active:scale-98"
            >
              {isProcessing ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Wird verschoben...</span>
                </>
              ) : (
                <>
                  <FolderInput size={15} />
                  <span>
                    {selectedCards.length === 1 ? '1 Karte' : `${selectedCards.length} Karten`} nach „{selectedCategoryObj?.title || 'Zielrubrik'}“ verschieben
                  </span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmitNew}
              disabled={!newTitle.trim() || isProcessing}
              className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs sm:text-sm font-bold transition-all shadow-sm disabled:opacity-50 flex items-center gap-2 cursor-pointer active:scale-98"
            >
              {isProcessing ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Rubrik wird erstellt & verschoben...</span>
                </>
              ) : (
                <>
                  <FolderPlus size={15} />
                  <span>Rubrik anlegen & {selectedCards.length} Karten verschieben</span>
                </>
              )}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
