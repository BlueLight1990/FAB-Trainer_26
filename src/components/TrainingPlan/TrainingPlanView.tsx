import React, { useState, useEffect } from 'react';
import {
  TRAINING_PLAN_WEEKS,
  TRAINING_ZONES,
  COMMON_EINSCHWIMMPROGRAMM,
  TRAINING_METADATA,
  TrainingWeekPlan,
  TrainingZoneInfo
} from '../../data/trainingPlan';
import { getDbData, toggleCompletedTrainingWeek, saveTrainingWeekNote, resetTrainingPlanProgress } from '../../lib/db';
import { exportTrainingPlanToPdf, PdfExportResult } from '../../lib/pdfExport';
import { IntervalTimer } from './IntervalTimer';
import {
  Calendar,
  CheckCircle2,
  Circle,
  Timer,
  Award,
  Waves,
  Zap,
  Flame,
  Info,
  ChevronRight,
  ChevronLeft,
  FileDown,
  Sparkles,
  BookOpen,
  Edit3,
  CheckSquare,
  Square,
  HelpCircle,
  Clock,
  ShieldCheck,
  Target,
  RotateCcw,
  Trash2,
  AlertTriangle,
  Loader2,
  Check,
  ExternalLink,
  Printer
} from 'lucide-react';

export function TrainingPlanView() {
  const [selectedWeekNum, setSelectedWeekNum] = useState<number>(1);
  const [completedWeeks, setCompletedWeeks] = useState<number[]>([]);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [activeDrillOption, setActiveDrillOption] = useState<'2a' | '2b' | '2c'>('2c');
  const [showZoneGuide, setShowZoneGuide] = useState(false);
  const [activeStepChecklist, setActiveStepChecklist] = useState<Record<string, boolean>>({});
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [currentNoteText, setCurrentNoteText] = useState('');
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetIncludeNotes, setResetIncludeNotes] = useState(false);
  const [resetSuccessToast, setResetSuccessToast] = useState(false);

  // PDF Export State
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfExportMode, setPdfExportMode] = useState<'all_weeks' | 'single_week'>('all_weeks');
  const [pdfExportSuccess, setPdfExportSuccess] = useState<PdfExportResult | null>(null);

  // Load user data (completed weeks & notes) from DB
  const loadUserData = async () => {
    try {
      const db = await getDbData();
      setCompletedWeeks(db.completedTrainingWeeks || []);
      setNotes(db.trainingNotes || {});
    } catch (err) {
      console.error('Fehler beim Laden der Trainingsdaten:', err);
    }
  };

  useEffect(() => {
    loadUserData();
  }, []);

  const selectedWeek: TrainingWeekPlan =
    TRAINING_PLAN_WEEKS.find(w => w.week === selectedWeekNum) || TRAINING_PLAN_WEEKS[0];

  useEffect(() => {
    setCurrentNoteText(notes[selectedWeekNum] || '');
    setIsEditingNote(false);
    // Reset workout step checklist on week change
    setActiveStepChecklist({});
  }, [selectedWeekNum, notes]);

  const handleToggleComplete = async (week: number) => {
    const isNowCompleted = await toggleCompletedTrainingWeek(week);
    setCompletedWeeks(prev =>
      isNowCompleted ? [...prev, week] : prev.filter(w => w !== week)
    );
  };

  const handleSaveNote = async () => {
    await saveTrainingWeekNote(selectedWeekNum, currentNoteText);
    setNotes(prev => ({ ...prev, [selectedWeekNum]: currentNoteText }));
    setIsEditingNote(false);
  };

  const handleExecuteReset = async () => {
    await resetTrainingPlanProgress(resetIncludeNotes);
    setCompletedWeeks([]);
    if (resetIncludeNotes) {
      setNotes({});
      setCurrentNoteText('');
    }
    setActiveStepChecklist({});
    setShowResetModal(false);
    setResetSuccessToast(true);
    setTimeout(() => setResetSuccessToast(false), 4000);
  };

  const handleExportPdf = async (mode: 'all_weeks' | 'single_week') => {
    setIsExportingPdf(true);
    try {
      const res = await exportTrainingPlanToPdf({
        mode,
        selectedWeek: selectedWeekNum,
        completedWeeks,
        notes
      });
      setPdfExportSuccess(res);
      setShowPdfModal(false);
    } catch (err) {
      console.error('Fehler beim PDF-Export:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const toggleCheckStep = (stepKey: string) => {
    setActiveStepChecklist(prev => ({
      ...prev,
      [stepKey]: !prev[stepKey]
    }));
  };

  const zoneInfo: TrainingZoneInfo = TRAINING_ZONES[selectedWeek.trainingZone];

  // Parse default pause for the timer
  const getDefaultPauseSeconds = (pauseText: string): number => {
    if (pauseText.includes('15')) return 15;
    if (pauseText.includes('20')) return 20;
    if (pauseText.includes('30')) return 30;
    if (pauseText.includes('60')) return 60;
    if (pauseText.includes('1:10')) return 70;
    if (pauseText.includes('1:15')) return 75;
    if (pauseText.includes('1:40')) return 100;
    return 30;
  };

  const isCurrentWeekCompleted = completedWeeks.includes(selectedWeek.week);
  const totalCompletedCount = completedWeeks.length;
  const progressPercent = Math.round((totalCompletedCount / TRAINING_PLAN_WEEKS.length) * 100);

  return (
    <div className="space-y-6">
      
      {/* Top Header Card */}
      <div className="bg-white rounded-3xl p-5 sm:p-7 border border-slate-200 shadow-xs relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-lg text-xs font-bold uppercase tracking-wider">
                BDS e.V. Musterplan
              </span>
              <span className="text-xs text-slate-500 font-medium">
                Erstellt von Maik Stünkel
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
              <Waves className="text-blue-600 shrink-0" size={28} />
              <span>Mustertrainingspläne: FAB Azubi bis Abschlussprüfung</span>
            </h1>

            <p className="text-slate-600 mt-2 text-sm sm:text-base max-w-2xl leading-relaxed">
              Strukturierter 12-Wochen-Trainingsaufbau zur Vorbereitung auf die praktische Abschlussprüfung zum Fachangestellten für Bäderbetriebe.
            </p>
          </div>

          {/* Progress / Completion Box */}
          <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 sm:p-5 shrink-0 flex flex-col justify-center min-w-[240px]">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1.5">
              <span>Ausbildungs-Fortschritt</span>
              <span className="font-mono text-blue-600 font-black">{totalCompletedCount} von 12 Wochen</span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden mb-2">
              <div
                className="bg-blue-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>{progressPercent}% abgeschlossen</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowResetModal(true)}
                  className="text-slate-400 hover:text-rose-600 font-semibold inline-flex items-center gap-1 transition-colors"
                  title="Trainingsplan zurücksetzen"
                >
                  <RotateCcw size={11} />
                  <span>Zurücksetzen</span>
                </button>
                <span className="text-slate-300">•</span>
                <button
                  onClick={() => setShowZoneGuide(true)}
                  className="text-blue-600 hover:text-blue-700 font-bold underline inline-flex items-center gap-1"
                >
                  <HelpCircle size={12} />
                  <span>Bereiche</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Success notification for reset */}
      {resetSuccessToast && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-2xl text-xs font-semibold flex items-center justify-between shadow-xs animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600" />
            <span>Der Trainingsplan wurde erfolgreich zurückgesetzt.</span>
          </div>
          <button
            onClick={() => setResetSuccessToast(false)}
            className="text-emerald-700 hover:text-emerald-900 p-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Week Selection Navigation */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              12-Wochen-Trainingsplan:
            </span>
            <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
              Woche {selectedWeekNum} ausgewählt
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <button
              onClick={() => setShowResetModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-xl font-semibold hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 text-slate-700 transition-colors"
              title="Trainingsplan-Fortschritt zurücksetzen"
            >
              <RotateCcw size={14} />
              <span>Plan zurücksetzen</span>
            </button>
            <button
              onClick={() => setShowPdfModal(true)}
              disabled={isExportingPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-blue-200 bg-blue-50/80 rounded-xl font-semibold hover:bg-blue-100 hover:border-blue-300 hover:text-blue-800 text-blue-700 transition-colors shadow-2xs"
              title="Trainingsplan als PDF exportieren"
            >
              {isExportingPdf ? (
                <Loader2 size={14} className="text-blue-600 animate-spin" />
              ) : (
                <FileDown size={14} className="text-blue-600" />
              )}
              <span>PDF Export</span>
            </button>
          </div>
        </div>

        {/* 12 Week Chips Grid */}
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2">
          {TRAINING_PLAN_WEEKS.map(w => {
            const isSelected = w.week === selectedWeekNum;
            const isDone = completedWeeks.includes(w.week);
            const zone = TRAINING_ZONES[w.trainingZone];

            return (
              <button
                key={w.week}
                onClick={() => setSelectedWeekNum(w.week)}
                className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border transition-all relative ${
                  isSelected
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm ring-2 ring-blue-500/30'
                    : 'bg-slate-50/80 border-slate-200/90 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                }`}
              >
                {/* Completed badge */}
                {isDone && (
                  <span className={`absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-white ${
                    isSelected ? 'bg-amber-400 text-slate-900' : 'bg-emerald-600'
                  }`}>
                    <CheckCircle2 size={12} />
                  </span>
                )}

                <span className="text-xs font-black">W{w.week}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.2 mt-1 rounded-md ${
                  isSelected 
                    ? 'bg-blue-700 text-blue-100' 
                    : `${zone.bgColor} ${zone.color}`
                }`}>
                  {w.trainingZone}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Week Main Plan View */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: The 5-Step Swimming Training Program */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Week Overview Card */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase ${zoneInfo.badgeBg}`}>
                    {selectedWeek.trainingZone} • {zoneInfo.intensityPercent}
                  </span>
                  <span className="text-xs font-semibold text-slate-400">
                    Phase: {selectedWeek.phase}
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
                  Woche {selectedWeek.week}: Hauptserie in {selectedWeek.trainingZone}
                </h2>
              </div>

              {/* Mark Complete Button */}
              <button
                onClick={() => handleToggleComplete(selectedWeek.week)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                  isCurrentWeekCompleted
                    ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-300'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                {isCurrentWeekCompleted ? (
                  <>
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    <span>Als absolviert markiert ✓</span>
                  </>
                ) : (
                  <>
                    <Circle size={16} className="text-slate-400" />
                    <span>Als absolviert markieren</span>
                  </>
                )}
              </button>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Hauptserie</span>
                <span className="font-mono text-base sm:text-lg font-extrabold text-slate-800">
                  {selectedWeek.mainSet.series}
                </span>
                <span className="text-[10px] text-slate-500 block">({selectedWeek.mainSetDistance}m)</span>
              </div>

              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Gesamtumfang</span>
                <span className="font-mono text-base sm:text-lg font-extrabold text-blue-600">
                  {selectedWeek.estimatedTotalDistance}m
                </span>
                <span className="text-[10px] text-slate-500 block">inkl. Ein-/Ausschwimmen</span>
              </div>

              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Pause / Abgang</span>
                <span className="font-mono text-sm sm:text-base font-bold text-slate-800">
                  {selectedWeek.mainSet.pause}
                </span>
              </div>

              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Intensität</span>
                <span className={`font-mono text-sm sm:text-base font-bold ${zoneInfo.color}`}>
                  {selectedWeek.mainSet.intensity}
                </span>
              </div>
            </div>
          </div>

          {/* 5-Step Structure according to PDF */}
          <div className="space-y-4">
            
            {/* Step 1: Einschwimmen */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-black text-xs shrink-0 mt-0.5">
                    1
                  </span>
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                      200m beliebig einschwimmen
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Lockeres Anschwimmen in beliebiger Schwimmart zur Erwärmung des Herz-Kreislauf-Systems und Schultermuskulatur.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => toggleCheckStep('step1')}
                  className={`p-1.5 rounded-lg transition-colors ${
                    activeStepChecklist['step1'] ? 'text-emerald-600 bg-emerald-50' : 'text-slate-300 hover:text-slate-500'
                  }`}
                  title="Abhaken"
                >
                  {activeStepChecklist['step1'] ? <CheckSquare size={18} /> : <Square size={18} />}
                </button>
              </div>
            </div>

            {/* Step 2: Technikprogramm (2a, 2b, 2c) */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-black text-xs shrink-0 mt-0.5">
                    2
                  </span>
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                      Technik- & Lagenblock (400m)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Wähle eine der drei Technik-Varianten aus dem PDF-Programm:
                    </p>
                  </div>
                </div>

                {/* Switcher 2a, 2b, 2c */}
                <div className="flex items-center bg-slate-100 p-1 rounded-xl gap-1 self-start sm:self-center">
                  <button
                    onClick={() => setActiveDrillOption('2a')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      activeDrillOption === '2a' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    2a. Mini Lagen
                  </button>
                  <button
                    onClick={() => setActiveDrillOption('2b')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      activeDrillOption === '2b' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    2b. Beliebige Lagen
                  </button>
                  <button
                    onClick={() => setActiveDrillOption('2c')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      activeDrillOption === '2c' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    2c. Kraul Technik
                  </button>
                </div>
              </div>

              {/* Drill Content Display */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 text-xs text-slate-700 space-y-2">
                {activeDrillOption === '2a' && (
                  <div>
                    <div className="font-bold text-slate-900 mb-1">2a. 8x50m Mini Lagen (400m)</div>
                    <p className="text-slate-600">
                      8x 50m in der Lagenreihenfolge durchführen (z.B. 50m Delfin/Rücken, 50m Rücken/Brust, 50m Brust/Kraul etc.).
                    </p>
                  </div>
                )}

                {activeDrillOption === '2b' && (
                  <div>
                    <div className="font-bold text-slate-900 mb-1">2b. 8x50m Technische Übungen (400m)</div>
                    <p className="text-slate-600">
                      Beliebige Lagen: Wechselzüge, Antriebsübungen, Kontrastübungen (z.B. Faust vs. offene Hand, hoher Ellenbogen).
                    </p>
                  </div>
                )}

                {activeDrillOption === '2c' && (
                  <div className="space-y-1.5">
                    <div className="font-bold text-slate-900">
                      2c. 4x100m Kraul Technische Übungen (400m)
                    </div>
                    <p className="text-slate-500 text-[11px]">
                      Jeder der vier 100m-Durchgänge wird in 4x25m unterteilt:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <div className="bg-white p-2 rounded-lg border border-slate-200 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px]">1</span>
                        <span><strong>25m Wechselzug</strong> (Aufholkraul)</span>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-slate-200 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px]">2</span>
                        <span><strong>25m Fingerspitzen</strong> übers Wasser</span>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-slate-200 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px]">3</span>
                        <span><strong>25m Faust</strong> (Wassergefühl)</span>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-slate-200 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px]">4</span>
                        <span><strong>25m GSA</strong> (Gesamtschwimmart)</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Step 3: Tauchserie */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-black text-xs shrink-0 mt-0.5">
                    3
                  </span>
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                      8x25m Tauchserie mit Vorbelastung (200m)
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                      Streckentauchen unter Vorbelastung: Abtauchen an Beckenwand, nach dem Auftauchen 2x einatmen, dann Streckentauchen (Pause: je 15 sec).
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => toggleCheckStep('step3')}
                  className={`p-1.5 rounded-lg transition-colors ${
                    activeStepChecklist['step3'] ? 'text-emerald-600 bg-emerald-50' : 'text-slate-300 hover:text-slate-500'
                  }`}
                  title="Abhaken"
                >
                  {activeStepChecklist['step3'] ? <CheckSquare size={18} /> : <Square size={18} />}
                </button>
              </div>
            </div>

            {/* Step 4: DIE HAUPTSERIE (Highlight Card) */}
            <div className="bg-linear-to-br from-blue-50/70 via-indigo-50/50 to-white rounded-3xl p-5 sm:p-6 border-2 border-blue-200 shadow-sm space-y-4">
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-blue-100">
                <div className="flex items-start gap-3">
                  <span className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-sm shrink-0 shadow-xs">
                    4
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black uppercase text-blue-700 tracking-wider">
                        Hauptserie Woche {selectedWeek.week}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${zoneInfo.badgeBg}`}>
                        {selectedWeek.trainingZone} ({selectedWeek.mainSet.intensity})
                      </span>
                    </div>
                    <h3 className="font-black text-slate-900 text-lg sm:text-xl mt-0.5">
                      {selectedWeek.mainSet.series} ({selectedWeek.mainSet.pause})
                    </h3>
                  </div>
                </div>

                <button
                  onClick={() => toggleCheckStep('step4')}
                  className={`p-1.5 rounded-lg transition-colors ${
                    activeStepChecklist['step4'] ? 'text-emerald-600 bg-emerald-100' : 'text-blue-300 hover:text-blue-500'
                  }`}
                  title="Hauptserie als beendet abhaken"
                >
                  {activeStepChecklist['step4'] ? <CheckSquare size={20} /> : <Square size={20} />}
                </button>
              </div>

              {/* Detailed Exercises List */}
              <div className="space-y-2.5">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  Ablauf & Übungsinhalte:
                </span>
                <div className="space-y-2">
                  {selectedWeek.mainSet.exercises.map((ex, i) => (
                    <div
                      key={i}
                      className="bg-white p-3 rounded-xl border border-blue-100 shadow-2xs flex items-start gap-2.5 text-xs sm:text-sm text-slate-800 font-medium"
                    >
                      <span className="text-blue-600 font-bold mt-0.5">•</span>
                      <span className="leading-relaxed">{ex}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Coaching Tips */}
              {selectedWeek.mainSet.tips && selectedWeek.mainSet.tips.length > 0 && (
                <div className="bg-amber-50/80 p-3.5 rounded-2xl border border-amber-200/80 text-xs text-amber-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-amber-800">
                    <Sparkles size={14} className="text-amber-600" />
                    <span>Trainer-Tipp:</span>
                  </div>
                  {selectedWeek.mainSet.tips.map((tip, idx) => (
                    <p key={idx} className="text-amber-800/90 leading-relaxed">
                      {tip}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {/* Step 5: Ausschwimmen */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-black text-xs shrink-0 mt-0.5">
                    5
                  </span>
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                      200m ausschwimmen
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Sehr lockeres Schwimmen in Rücken- oder Brustlage zur aktiven Laktatelimination und Muskelentspannung.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => toggleCheckStep('step5')}
                  className={`p-1.5 rounded-lg transition-colors ${
                    activeStepChecklist['step5'] ? 'text-emerald-600 bg-emerald-50' : 'text-slate-300 hover:text-slate-500'
                  }`}
                  title="Abhaken"
                >
                  {activeStepChecklist['step5'] ? <CheckSquare size={18} /> : <Square size={18} />}
                </button>
              </div>
            </div>

          </div>

          {/* Navigation Prev / Next Week */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setSelectedWeekNum(prev => Math.max(1, prev - 1))}
              disabled={selectedWeekNum === 1}
              className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} />
              <span>Vorherige Woche</span>
            </button>

            <span className="text-xs font-bold text-slate-400">
              Woche {selectedWeekNum} von 12
            </span>

            <button
              onClick={() => setSelectedWeekNum(prev => Math.min(12, prev + 1))}
              disabled={selectedWeekNum === 12}
              className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span>Nächste Woche</span>
              <ChevronRight size={16} />
            </button>
          </div>

        </div>

        {/* Right 1 Col: Tools, Poolside Timer & Notes */}
        <div className="space-y-6">
          
          {/* Interactive Poolside Interval Timer */}
          <IntervalTimer
            defaultSeconds={getDefaultPauseSeconds(selectedWeek.mainSet.pause)}
            initialLabel={selectedWeek.mainSet.pause}
          />

          {/* Training Zone Explanation Card */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Trainingsbereich dieser Woche
              </span>
              <span className={`px-2 py-0.5 rounded-md text-xs font-black ${zoneInfo.badgeBg}`}>
                {zoneInfo.code}
              </span>
            </div>

            <h4 className="font-extrabold text-slate-800 text-base">
              {zoneInfo.name}
            </h4>

            <p className="text-xs text-slate-600 leading-relaxed">
              {zoneInfo.description}
            </p>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Ziel-Pulsbereich:</span>
              <span className="font-bold text-slate-700 font-mono">{zoneInfo.heartRateGuide}</span>
            </div>
          </div>

          {/* Personal Training Log & Notes */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Edit3 size={16} className="text-blue-600" />
                <h4 className="font-bold text-slate-800 text-sm">
                  Notizen zu Woche {selectedWeekNum}
                </h4>
              </div>

              {!isEditingNote && (
                <button
                  onClick={() => setIsEditingNote(true)}
                  className="text-xs text-blue-600 hover:text-blue-700 font-bold"
                >
                  {notes[selectedWeekNum] ? 'Bearbeiten' : '+ Notiz'}
                </button>
              )}
            </div>

            {isEditingNote ? (
              <div className="space-y-2">
                <textarea
                  rows={3}
                  value={currentNoteText}
                  onChange={e => setCurrentNoteText(e.target.value)}
                  placeholder="z.B. 4x300m gut durchgehalten, beim Kleiderschwimmen Beinschlag optimieren..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none resize-none font-medium text-slate-800"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => setIsEditingNote(false)}
                    className="px-3 py-1 text-xs text-slate-500 hover:bg-slate-100 rounded-lg font-semibold"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={handleSaveNote}
                    className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700"
                  >
                    Speichern
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-600 italic bg-slate-50 p-3 rounded-xl border border-slate-100 min-h-[50px]">
                {notes[selectedWeekNum] ? `„${notes[selectedWeekNum]}“` : 'Noch keine persönlichen Notizen für diese Woche hinterlegt.'}
              </p>
            )}
          </div>

          {/* Quick PDF Document Attribution */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 text-xs text-slate-500 space-y-1.5">
            <div className="font-bold text-slate-700 flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-blue-600" />
              <span>Offizielle Vorlage</span>
            </div>
            <p className="leading-relaxed">
              Musterplan für BDS e.V. (Bundesverband Deutscher Schwimmmeister e.V.) zur Begleitung der betrieblichen Ausbildung zum FAB.
            </p>
            <p className="text-[11px] text-slate-400">
              Autor: Maik Stünkel • Stand: 01.03.2022
            </p>
          </div>

        </div>

      </div>

      {/* Modal: Comprehensive Training Zones Guide */}
      {showZoneGuide && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 p-6 sm:p-7 my-auto space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-black">
                  <Target size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">
                    Trainingsbereiche im Schwimmsport (GA1, GA2, SA)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Physiologische Grundlagen und Intensitätsstufen der FAB-Ausbildung
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowZoneGuide(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* GA1 */}
              <div className="bg-emerald-50/70 p-4 rounded-2xl border border-emerald-200">
                <div className="flex items-center justify-between mb-1">
                  <div className="font-bold text-emerald-900 flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-emerald-200 text-emerald-900 rounded font-black text-xs">GA1</span>
                    <span>Grundlagenausdauer 1 (Extensiv)</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-emerald-800">50 - 60% Intensität</span>
                </div>
                <p className="text-xs text-emerald-800/90 leading-relaxed mb-2">
                  Optimiert den Fettstoffwechsel, erweitert das Kapillarnetz der Muskulatur und bildet die aerobe Basis für alle Ausdauerstrecken (z.B. 400m Ausdauerschwimmen, 300m Kleiderschwimmen).
                </p>
                <div className="text-[11px] font-semibold text-emerald-700">
                  Puls: ca. 120 - 140 bpm • Pausen: kurz (15-20s) oder Dauermethode
                </div>
              </div>

              {/* GA2 */}
              <div className="bg-blue-50/70 p-4 rounded-2xl border border-blue-200">
                <div className="flex items-center justify-between mb-1">
                  <div className="font-bold text-blue-900 flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-blue-200 text-blue-900 rounded font-black text-xs">GA2</span>
                    <span>Grundlagenausdauer 2 (Intensiv)</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-blue-800">75 - 85% Intensität</span>
                </div>
                <p className="text-xs text-blue-800/90 leading-relaxed mb-2">
                  Training an der individuellen anaeroben Schwelle (IANS). Schult die Tempohärte, Kraftausdauer im Beinschlag und das Halten des hohen Kraul- oder Brusttempos bei zunehmender Übersäuerung.
                </p>
                <div className="text-[11px] font-semibold text-blue-700">
                  Puls: ca. 150 - 170 bpm • Pausen: 20-60s unvollständig
                </div>
              </div>

              {/* SA */}
              <div className="bg-rose-50/70 p-4 rounded-2xl border border-rose-200">
                <div className="flex items-center justify-between mb-1">
                  <div className="font-bold text-rose-900 flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-rose-200 text-rose-900 rounded font-black text-xs">SA</span>
                    <span>Schnelligkeitsausdauer & Sprint</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-rose-800">90 - 100% All-Out</span>
                </div>
                <p className="text-xs text-rose-800/90 leading-relaxed mb-2">
                  Maximale Sprints, Startblock-Starts und Laktattoleranz. Extrem wichtig für das 100m-Zeitschwimmen und explosive Rettungseinsätze.
                </p>
                <div className="text-[11px] font-semibold text-rose-700">
                  Puls: Maximal (175-195+ bpm) • Abgangszeit / Startzeit: 1:10 - 1:45 min
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowZoneGuide(false)}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-colors"
              >
                Verstanden
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reset Confirmation Dialog */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 p-6 sm:p-7 my-auto space-y-5">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold shrink-0">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">
                  Trainingsplan zurücksetzen?
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Damit setzt du den Fortschritt aller 12 Ausbildungswochen auf den Anfangszustand (0% abgeschlossen) zurück.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-3">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={resetIncludeNotes}
                  onChange={e => setResetIncludeNotes(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 mt-0.5"
                />
                <div className="text-xs">
                  <span className="font-bold text-slate-800 block">Auch alle persönlichen Notizen löschen</span>
                  <span className="text-slate-500 text-[11px] block mt-0.5">
                    Entfernt alle für die einzelnen Wochen eingetragenen Trainingseindrücke und Anmerkungen.
                  </span>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleExecuteReset}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs"
              >
                <RotateCcw size={14} />
                <span>Fortschritt zurücksetzen</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: PDF Export Options */}
      {showPdfModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 p-6 sm:p-7 my-auto space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold shrink-0">
                  <FileDown size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">
                    Trainingsplan als PDF exportieren
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Wähle das gewünschte Format für deinen Ausdruck oder Download.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPdfModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Selection Options */}
            <div className="space-y-3">
              <div
                onClick={() => setPdfExportMode('all_weeks')}
                className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-start gap-3.5 ${
                  pdfExportMode === 'all_weeks'
                    ? 'border-blue-600 bg-blue-50/50'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                }`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 shrink-0 ${
                  pdfExportMode === 'all_weeks' ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white'
                }`}>
                  {pdfExportMode === 'all_weeks' && <Check size={12} className="text-white" />}
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900">
                    Gesamter 12-Wochen-Trainingsplan
                  </div>
                  <div className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Umfasst die Gesamtübersichtstabelle aller 12 Wochen, das feste Einschwimm- und Technikprogramm sowie alle Hauptserien und Trainertipps auf mehreren Seiten.
                  </div>
                </div>
              </div>

              <div
                onClick={() => setPdfExportMode('single_week')}
                className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-start gap-3.5 ${
                  pdfExportMode === 'single_week'
                    ? 'border-blue-600 bg-blue-50/50'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                }`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 shrink-0 ${
                  pdfExportMode === 'single_week' ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white'
                }`}>
                  {pdfExportMode === 'single_week' && <Check size={12} className="text-white" />}
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900">
                    Nur aktuelle Woche {selectedWeek.week} ({selectedWeek.phase})
                  </div>
                  <div className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Kompaktes 1-Seiten-Trainingsblatt mit der Hauptserie für Woche {selectedWeek.week}, Einschwimmen, Tauchserie und Notizfeld für den Beckenrand.
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowPdfModal(false)}
                disabled={isExportingPdf}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={() => handleExportPdf(pdfExportMode)}
                disabled={isExportingPdf}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs disabled:opacity-50"
              >
                {isExportingPdf ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>PDF wird erstellt...</span>
                  </>
                ) : (
                  <>
                    <FileDown size={15} />
                    <span>PDF jetzt herunterladen</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: PDF Export Success Feedback */}
      {pdfExportSuccess && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 p-6 sm:p-7 my-auto space-y-5 text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold mx-auto">
              <CheckCircle2 size={30} />
            </div>

            <div className="space-y-1.5">
              <h3 className="font-bold text-slate-900 text-lg">
                PDF erfolgreich generiert!
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                Die PDF-Datei <span className="font-mono font-bold text-slate-700">{pdfExportSuccess.fileName}</span> wurde erstellt und zum Download bereitgestellt.
              </p>
            </div>

            {pdfExportSuccess.blobUrl && (
              <div className="pt-2 flex flex-col gap-2">
                <a
                  href={pdfExportSuccess.blobUrl}
                  download={pdfExportSuccess.fileName}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
                >
                  <FileDown size={16} />
                  <span>PDF erneut öffnen / herunterladen</span>
                </a>
              </div>
            )}

            <div className="pt-2">
              <button
                onClick={() => setPdfExportSuccess(null)}
                className="w-full px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors border border-slate-200"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
