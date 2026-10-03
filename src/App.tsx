import React, { useState, useEffect, useMemo } from 'react';
import { getEffectivePresetCategories } from './data/questions';
import { ViewMode, Category, CategoryOverride, AppMode } from './types';
import { FlashcardDeck } from './components/FlashcardDeck';
import { GlossaryList } from './components/GlossaryList';
import { SwimTimesView } from './components/SwimTimes/SwimTimesView';
import { TrainingPlanView } from './components/TrainingPlan/TrainingPlanView';
import { motion, AnimatePresence } from 'motion/react';
import { Droplet, Layers, BookA, Settings, FileDown, Waves, CalendarDays, GraduationCap, Wrench, FolderArchive } from 'lucide-react';
import { getDbData } from './lib/db';
import { SettingsView } from './components/SettingsView';
import { FileZipView } from './components/FileZip/FileZipView';
import { PWAInstallButton } from './components/PWAInstallButton';
import { FlashcardPdfExportModal } from './components/FlashcardPdfExportModal';
import { Flashcard } from './types';

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('flashcards');
  const [appMode, setAppMode] = useState<AppMode>(() => {
    try {
      const saved = localStorage.getItem('fab_app_mode') || localStorage.getItem('fab_flashcard_mode');
      if (saved === 'learn' || saved === 'edit') return saved;
    } catch {}
    return 'learn';
  });

  const [allStoredFlashcards, setAllStoredFlashcards] = useState<Flashcard[]>([]);
  const [customCategories, setCustomCategories] = useState<Category[]>([]);
  const [presetOverrides, setPresetOverrides] = useState<Record<string, CategoryOverride>>({});
  const [showPdfExportModal, setShowPdfExportModal] = useState(false);

  const handleAppModeChange = (mode: AppMode) => {
    setAppMode(mode);
    try {
      localStorage.setItem('fab_app_mode', mode);
      localStorage.setItem('fab_flashcard_mode', mode);
    } catch {}
  };

  const loadAppData = async () => {
    try {
      const db = await getDbData();
      setAllStoredFlashcards(prev => {
        const next = (db.flashcards || []).filter(f => Boolean(f && f.id));
        if (prev.length === next.length && prev === next) return prev;
        return next;
      });
      setCustomCategories(prev => {
        const next = (db.customCategories || []).filter(c => Boolean(c && c.id));
        if (prev.length === next.length && prev.every((c, i) => c && next[i] && c.id === next[i]?.id && c.title === next[i]?.title)) {
          return prev;
        }
        return next;
      });
      setPresetOverrides(prev => {
        const next = db.presetOverrides || {};
        const prevKeys = Object.keys(prev);
        const nextKeys = Object.keys(next);
        if (prevKeys.length === nextKeys.length && prevKeys.every(k => prev[k]?.title === next[k]?.title && prev[k]?.isHidden === next[k]?.isHidden)) {
          return prev;
        }
        return next;
      });
    } catch (e) {
      console.error('Fehler beim Laden der App-Daten:', e);
    }
  };

  useEffect(() => {
    loadAppData();
    const handleDbUpdate = () => {
      loadAppData();
    };
    window.addEventListener('fab-db-updated', handleDbUpdate);
    return () => {
      window.removeEventListener('fab-db-updated', handleDbUpdate);
    };
  }, []);

  const effectivePresetCategories = useMemo(
    () => getEffectivePresetCategories(presetOverrides, false),
    [presetOverrides]
  );
  const allCategories = useMemo(
    () => [...effectivePresetCategories, ...customCategories].filter(c => Boolean(c && c.id)),
    [effectivePresetCategories, customCategories]
  );

  const handleNavChange = (mode: ViewMode) => {
    setViewMode(mode);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-blue-100 selection:text-blue-900">
      {showPdfExportModal && (
        <FlashcardPdfExportModal
          isOpen={showPdfExportModal}
          onClose={() => setShowPdfExportModal(false)}
          allCards={allStoredFlashcards}
          categories={allCategories}
          initialCategoryId="all"
        />
      )}

      <header 
        className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm transition-all"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="max-w-5xl mx-auto px-4">
          <div className="h-16 flex items-center justify-between gap-2">
            <div 
              className="flex items-center gap-2 cursor-pointer shrink-0"
              onClick={() => handleNavChange('flashcards')}
            >
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
                <Droplet size={20} />
              </div>
              <span className="font-bold text-lg tracking-tight text-slate-800 hidden sm:block">
                FAB <span className="text-blue-600">Trainer</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-3 flex-wrap justify-end">
              <button 
                onClick={() => setShowPdfExportModal(true)} 
                className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors shadow-2xs"
                title="Lernkarten für den Schulordner als PDF exportieren"
              >
                <FileDown size={16} className="text-emerald-600 sm:w-[18px] sm:h-[18px]" />
                <span className="hidden sm:inline">Schulordner Export</span>
                <span className="sm:hidden">PDF</span>
              </button>

              {/* Global Mode Switcher: Lernen vs. Bearbeiten */}
              <div className="flex items-center bg-slate-100 p-0.5 sm:p-1 rounded-xl border border-slate-200 shadow-2xs">
                <button
                  type="button"
                  onClick={() => handleAppModeChange('learn')}
                  className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all ${
                    appMode === 'learn'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                  title="Lern-Modus: Alle Bearbeitungs- und Verwaltungsfunktionen ausgeblendet"
                >
                  <GraduationCap size={15} />
                  <span>Lernen</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAppModeChange('edit')}
                  className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all ${
                    appMode === 'edit'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                  title="Bearbeitungs-Modus: Alle Bearbeitungs-, Erstellungs- und Verwaltungsfunktionen aktiv"
                >
                  <Wrench size={14} />
                  <span>Bearbeiten</span>
                </button>
              </div>

              <PWAInstallButton />
              <button 
                onClick={() => handleNavChange('settings')} 
                className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors ${viewMode === 'settings' ? 'bg-slate-200 text-slate-800' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'}`}
                title="Einstellungen"
              >
                <Settings size={16} className="sm:w-[18px] sm:h-[18px]" />
                <span className="hidden sm:inline">Einstellungen</span>
              </button>
            </div>
          </div>
          
          {/* Navigation Bar */}
          <div className="flex space-x-1 sm:space-x-4 border-t border-slate-100 py-2 overflow-x-auto no-scrollbar">
            <button
              onClick={() => handleNavChange('flashcards')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${viewMode === 'flashcards' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <Layers size={18} />
              Lernkartei
            </button>
            <button
              onClick={() => handleNavChange('glossary')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${viewMode === 'glossary' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <BookA size={18} />
              Glossar
            </button>
            <button
              onClick={() => handleNavChange('swim_times')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${viewMode === 'swim_times' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <Waves size={18} />
              Schwimmzeiten
            </button>
            <button
              onClick={() => handleNavChange('training_plan')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${viewMode === 'training_plan' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <CalendarDays size={18} />
              Trainingsplan
            </button>
            <button
              onClick={() => handleNavChange('datei_zip')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${viewMode === 'datei_zip' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <FolderArchive size={18} />
              Datei Zip
            </button>
          </div>
        </div>
      </header>

      <main 
        className="max-w-5xl mx-auto px-4 py-6 md:py-10 flex-1 w-full"
        style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <AnimatePresence mode="wait">
          
          {viewMode === 'datei_zip' && (
            <motion.div
              key="datei-zip-view"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <FileZipView mode={appMode} />
            </motion.div>
          )}

          {viewMode === 'training_plan' && (
            <motion.div
              key="training-plan-view"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <TrainingPlanView />
            </motion.div>
          )}

          {viewMode === 'swim_times' && (
            <motion.div
              key="swim-times-view"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <SwimTimesView mode={appMode} />
            </motion.div>
          )}

          {viewMode === 'flashcards' && (
            <motion.div
              key="flashcards-view"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="text-center mb-8">
                <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-3 tracking-tight">
                  Digitale Lernkartei
                </h1>
                <p className="text-slate-500 max-w-2xl mx-auto">
                  Übe wichtige Konzepte, Abläufe und Definitionen. Jede Karte kann direkt bearbeitet oder gelöscht werden.
                </p>
              </div>
              <FlashcardDeck 
                categories={allCategories} 
                onCategoriesUpdated={loadAppData}
                mode={appMode}
              />
            </motion.div>
          )}

          {viewMode === 'glossary' && (
            <motion.div
              key="glossary-view"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="text-center mb-8">
                <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-3 tracking-tight">
                  Fachglossar Bäderbetriebe
                </h1>
                <p className="text-slate-500 max-w-2xl mx-auto">
                  Umfassende Definitionen und Fachbegriffe (alphabetisch A–Z sortiert & als PDF exportierbar). Jeder Begriff kann nach deinen Wünschen angepasst oder gelöscht werden.
                </p>
              </div>
              <GlossaryList 
                categories={allCategories}
                onNavigateToFlashcards={() => handleNavChange('flashcards')}
                mode={appMode}
              />
            </motion.div>
          )}

          {viewMode === 'settings' && (
            <motion.div
              key="settings-view"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="text-center mb-8">
                <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-3 tracking-tight">
                  Einstellungen & Datenverwaltung
                </h1>
                <p className="text-slate-500 max-w-2xl mx-auto">
                  Verwalte API-Schlüssel, exportiere Backups oder passe Themenbereiche an.
                </p>
              </div>
              <SettingsView 
                customCategories={customCategories} 
                presetOverrides={presetOverrides}
                onDataUpdated={loadAppData} 
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
