import React, { useState, useEffect } from 'react';
import { SwimDiscipline, SwimTimeEntry, AppMode } from '../../types';
import {
  getDbData,
  addSwimDiscipline,
  updateSwimDiscipline,
  deleteSwimDiscipline,
  addSwimEntry,
  updateSwimEntry,
  deleteSwimEntry
} from '../../lib/db';
import { 
  formatSwimTime, 
  computeDisciplineStats, 
  getRequirementComparison,
  isJumpDiscipline,
  isDiveDiscipline,
  isHLWDiscipline
} from '../../lib/swimUtils';
import { SwimProgressChart } from './SwimProgressChart';
import { SwimDisciplineModal } from './SwimDisciplineModal';
import { SwimEntryModal } from './SwimEntryModal';
import {
  Timer,
  Plus,
  Target,
  Award,
  TrendingDown,
  TrendingUp,
  Calendar,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Waves,
  Heart,
  FileText
} from 'lucide-react';

export function SwimTimesView({ mode = 'learn' }: { mode?: AppMode }) {
  const [disciplines, setDisciplines] = useState<SwimDiscipline[]>([]);
  const [entries, setEntries] = useState<SwimTimeEntry[]>([]);
  const [activeDisciplineId, setActiveDisciplineId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  // Modals
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<SwimTimeEntry | null>(null);
  const [showDisciplineModal, setShowDisciplineModal] = useState(false);
  const [editingDiscipline, setEditingDiscipline] = useState<SwimDiscipline | null>(null);
  const [showExamInfo, setShowExamInfo] = useState(false);

  const loadData = async () => {
    try {
      const db = await getDbData();
      const discList = db.swimDisciplines || [];
      const entryList = db.swimEntries || [];

      setDisciplines(discList);
      setEntries(entryList);

      if (discList.length > 0) {
        setActiveDisciplineId(prev => {
          if (prev && discList.some(d => d.id === prev)) return prev;
          return discList[0].id;
        });
      }
    } catch (err) {
      console.error('Fehler beim Laden der Schwimmdaten:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const activeDiscipline = disciplines.find(d => d.id === activeDisciplineId) || disciplines[0];
  const disciplineEntries = activeDiscipline
    ? entries.filter(e => e.disciplineId === activeDiscipline.id)
    : [];

  const stats = activeDiscipline ? computeDisciplineStats(activeDiscipline, entries) : null;
  const isJump = isJumpDiscipline(activeDiscipline);
  const isDive = isDiveDiscipline(activeDiscipline);
  const isHLW = isHLWDiscipline(activeDiscipline);

  // Handlers for Discipline
  const handleSaveDiscipline = async (disc: Omit<SwimDiscipline, 'id'>) => {
    const created = await addSwimDiscipline(disc);
    await loadData();
    if (created?.id) setActiveDisciplineId(created.id);
  };

  const handleUpdateDiscipline = async (id: string, updated: Partial<SwimDiscipline>) => {
    await updateSwimDiscipline(id, updated);
    await loadData();
  };

  const handleDeleteDiscipline = async (id: string) => {
    await deleteSwimDiscipline(id);
    await loadData();
  };

  // Handlers for Entry
  const handleSaveEntry = async (entry: Omit<SwimTimeEntry, 'id'>) => {
    await addSwimEntry(entry);
    await loadData();
  };

  const handleUpdateEntry = async (id: string, updated: Partial<SwimTimeEntry>) => {
    await updateSwimEntry(id, updated);
    await loadData();
  };

  const handleDeleteEntry = async (id: string) => {
    await deleteSwimEntry(id);
    await loadData();
  };

  const openAddEntry = () => {
    setEditingEntry(null);
    setShowEntryModal(true);
  };

  const openEditEntry = (entry: SwimTimeEntry) => {
    setEditingEntry(entry);
    setShowEntryModal(true);
  };

  const openAddDiscipline = () => {
    setEditingDiscipline(null);
    setShowDisciplineModal(true);
  };

  const openEditDiscipline = () => {
    if (!activeDiscipline) return;
    setEditingDiscipline(activeDiscipline);
    setShowDisciplineModal(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Top Header & Intro */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Waves size={24} />
            </span>
            <span>Schwimmzeiten & Leistungsstand</span>
          </h1>
          <p className="text-slate-500 mt-1.5 text-sm sm:text-base max-w-2xl">
            Dokumentiere deine Trainingsleistungen, vergleiche deine Werte mit den geforderten Prüfungsnormen und verfolge deinen Fortschritt.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {mode === 'edit' && (
            <button
              onClick={openAddDiscipline}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-blue-700 rounded-xl text-sm font-semibold transition-colors shadow-2xs"
            >
              <Plus size={16} />
              <span>Disziplin anlegen</span>
            </button>
          )}

          <button
            onClick={openAddEntry}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-colors shadow-sm"
          >
            {isJump ? <Award size={17} /> : <Timer size={17} />}
            <span>
              {isJump 
                ? 'Sprung eintragen' 
                : isDive 
                  ? 'Tauchgang eintragen' 
                  : isHLW 
                    ? 'Reanimation erfassen'
                    : 'Zeit erfassen'}
            </span>
          </button>
        </div>
      </div>

      {/* Discipline Selector Chips */}
      {disciplines.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 pt-1 no-scrollbar">
          {disciplines.map(d => {
            const isActive = d.id === activeDisciplineId;
            const discStats = computeDisciplineStats(d, entries);
            const hasPassed = discStats.requirementPassed;
            const isJ = isJumpDiscipline(d);
            const isD = isDiveDiscipline(d);
            const isH = isHLWDiscipline(d);

            return (
              <button
                key={d.id}
                onClick={() => setActiveDisciplineId(d.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap border shrink-0 ${
                  isActive
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-500/20'
                    : 'bg-white text-slate-700 border-slate-200/90 hover:bg-slate-50 hover:border-slate-300 shadow-2xs'
                }`}
              >
                <span>{d.name}</span>
                {isJ ? (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                    isActive 
                      ? 'bg-amber-500 text-amber-950' 
                      : hasPassed 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                        : 'bg-amber-100/70 text-amber-800'
                  }`}>
                    {hasPassed ? '✓ 3m' : '3m Sprung'}
                  </span>
                ) : isD ? (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                    isActive 
                      ? 'bg-cyan-500 text-cyan-950' 
                      : hasPassed 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                        : 'bg-cyan-100/70 text-cyan-800'
                  }`}>
                    {hasPassed ? '✓ 35m' : '35m Tauchen'}
                  </span>
                ) : isH ? (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                    isActive 
                      ? 'bg-rose-500 text-white' 
                      : hasPassed 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                        : 'bg-rose-100 text-rose-800'
                  }`}>
                    {hasPassed ? '✓ 5 Min.' : '5 Min.'}
                  </span>
                ) : d.targetTimeSeconds ? (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${
                    isActive 
                      ? 'bg-blue-700 text-blue-100' 
                      : hasPassed 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                        : 'bg-slate-100 text-slate-500'
                  }`}>
                    {hasPassed ? '✓ ' : ''}{formatSwimTime(d.targetTimeSeconds, false)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      {/* Main Discipline Section */}
      {activeDiscipline ? (
        <div className="space-y-6">
          
          {/* Active Discipline Banner & Requirements */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl sm:text-2xl font-black text-slate-800">
                    {activeDiscipline.name}
                  </h2>
                  {activeDiscipline.name.toLowerCase().includes('sperrfach') && (
                    <span className="text-xs font-extrabold px-2.5 py-1 bg-red-100 text-red-700 border border-red-200 rounded-lg">
                      Sperrfach
                    </span>
                  )}
                  {!isJump && !isHLW && (
                    <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg">
                      {`${activeDiscipline.poolLength || 25}m Bahn`}
                    </span>
                  )}
                  {activeDiscipline.distance !== undefined && activeDiscipline.distance > 0 && (
                    <span className="text-xs font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg">
                      {activeDiscipline.distance}m
                    </span>
                  )}
                </div>

                {activeDiscipline.requirementLabel && (
                  <div className="flex items-center gap-2 mt-2 text-xs sm:text-sm font-bold text-emerald-800 bg-emerald-50/80 px-3 py-1.5 rounded-xl border border-emerald-200/80 w-fit">
                    <Target size={16} className="text-emerald-600 shrink-0" />
                    <span>{activeDiscipline.requirementLabel}</span>
                  </div>
                )}
                
                {activeDiscipline.description && (
                  <p className="text-xs sm:text-sm text-slate-500 mt-2 max-w-2xl leading-relaxed">
                    {activeDiscipline.description}
                  </p>
                )}
              </div>

              {mode === 'edit' && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={openEditDiscipline}
                    className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 border border-slate-200 px-3 py-2 rounded-xl font-semibold transition-colors"
                  >
                    <Edit2 size={14} />
                    <span>Anforderung bearbeiten</span>
                  </button>
                </div>
              )}
            </div>

            {/* 4 Stat KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-5">
              
              {/* Card 1: Bestleistung */}
              <div className="bg-slate-50/70 p-3.5 sm:p-4 rounded-2xl border border-slate-200/70 flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider">
                    {isJump ? 'Letzter Sprung' : isDive ? 'Max. Distanz' : isHLW ? 'Längste Reanimation' : 'Persönliche Bestzeit'}
                  </span>
                  <Award size={16} className="text-amber-500" />
                </div>
                <div>
                  <div className="text-lg sm:text-2xl font-black text-slate-800 font-mono">
                    {isJump ? (
                      stats?.latestEntry?.jumpStyle ? (
                        <span className="text-sm sm:text-base font-bold text-slate-800 truncate block">
                          {stats.latestEntry.jumpStyle}
                        </span>
                      ) : '--'
                    ) : isDive ? (
                      stats?.bestDistance ? `${stats.bestDistance}m` : '--'
                    ) : (
                      stats?.bestEntry ? formatSwimTime(stats.bestEntry.timeSeconds) : '--:--'
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {isJump ? (
                      stats?.latestEntry ? `${stats.latestEntry.jumpHeightMeters || 3}m Höhe` : 'Noch kein Sprung'
                    ) : isDive ? (
                      stats?.bestEntry?.timeSeconds ? `Bestzeit: ${formatSwimTime(stats.bestEntry.timeSeconds)}` : 'Soll: 35m'
                    ) : isHLW ? (
                      stats?.bestEntry ? (
                        <span>
                          am {new Date(stats.bestEntry.date).toLocaleDateString('de-DE')}
                          {activeDiscipline.targetTimeSeconds && (
                            <span className={stats.bestEntry.timeSeconds >= activeDiscipline.targetTimeSeconds ? ' text-emerald-600 font-semibold' : ' text-amber-600 font-semibold'}>
                              {' '}({getRequirementComparison(stats.bestEntry.timeSeconds, activeDiscipline.targetTimeSeconds, true).formattedDelta})
                            </span>
                          )}
                        </span>
                      ) : 'Noch keine Reanimation'
                    ) : stats?.bestEntry ? (
                      <span>
                        am {new Date(stats.bestEntry.date).toLocaleDateString('de-DE')}
                        {activeDiscipline.targetTimeSeconds && (
                          <span className={stats.bestEntry.timeSeconds <= activeDiscipline.targetTimeSeconds ? ' text-emerald-600 font-semibold' : ' text-amber-600 font-semibold'}>
                            {' '}({getRequirementComparison(stats.bestEntry.timeSeconds, activeDiscipline.targetTimeSeconds).formattedDelta})
                          </span>
                        )}
                      </span>
                    ) : 'Noch keine Zeit'}
                  </div>
                </div>
              </div>

              {/* Card 2: Latest / Rating */}
              <div className="bg-slate-50/70 p-3.5 sm:p-4 rounded-2xl border border-slate-200/70 flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider">
                    {isJump ? 'Letzte Bewertung' : isDive ? 'Letzter Tauchgang' : isHLW ? 'Letzte Reanimation' : 'Letzte Messung'}
                  </span>
                  <Timer size={16} className="text-blue-500" />
                </div>
                <div>
                  <div className="text-lg sm:text-2xl font-black text-slate-800 font-mono">
                    {isJump ? (
                      stats?.latestEntry?.ratingScore ? (
                        <span className="text-base font-bold text-emerald-700">{stats.latestEntry.ratingScore}</span>
                      ) : 'Bestanden'
                    ) : isDive ? (
                      stats?.latestEntry?.distanceMeters ? `${stats.latestEntry.distanceMeters}m` : '--'
                    ) : (
                      stats?.latestEntry ? formatSwimTime(stats.latestEntry.timeSeconds) : '--:--'
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                    {stats?.latestEntry ? (
                      <>
                        <span>am {new Date(stats.latestEntry.date).toLocaleDateString('de-DE')}</span>
                        {!isJump && stats.trendVsPrevious !== 0 && (
                          <span className={`inline-flex items-center font-semibold ${
                            isHLW
                              ? (stats.trendVsPrevious > 0 ? 'text-emerald-600' : 'text-amber-600')
                              : (stats.trendVsPrevious < 0 ? 'text-emerald-600' : 'text-amber-600')
                          }`}>
                            {stats.trendVsPrevious < 0 ? (
                              <TrendingDown size={12} className="inline mr-0.5" />
                            ) : (
                              <TrendingUp size={12} className="inline mr-0.5" />
                            )}
                            {Math.abs(stats.trendVsPrevious).toFixed(2).replace('.', ',')} s
                          </span>
                        )}
                      </>
                    ) : 'Keine Messung'}
                  </div>
                </div>
              </div>

              {/* Card 3: Requirement Status */}
              <div className="bg-slate-50/70 p-3.5 sm:p-4 rounded-2xl border border-slate-200/70 flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider">Soll-Anforderung</span>
                  <Target size={16} className="text-emerald-600" />
                </div>
                <div>
                  <div className="text-lg sm:text-2xl font-black text-slate-800 font-mono">
                    {isJump 
                      ? '3m Höhe' 
                      : isDive 
                        ? 'min. 35m' 
                        : (activeDiscipline.targetTimeSeconds ? formatSwimTime(activeDiscipline.targetTimeSeconds) : 'Keine')}
                  </div>
                  <div className="text-[11px] mt-0.5 font-bold">
                    {isJump ? (
                      stats && stats.totalEntries > 0 ? (
                        <span className="text-emerald-600 flex items-center gap-1">
                          <CheckCircle2 size={12} />
                          Kopfsprung erfasst!
                        </span>
                      ) : <span className="text-slate-400">Ausstehend</span>
                    ) : isDive ? (
                      stats && stats.bestDistance && stats.bestDistance >= 35 ? (
                        <span className="text-emerald-600 flex items-center gap-1">
                          <CheckCircle2 size={12} />
                          Norm erfüllt ({stats.bestDistance}m)!
                        </span>
                      ) : <span className="text-amber-600">Noch keine 35m</span>
                    ) : isHLW ? (
                      stats?.bestEntry ? (
                        (stats.bestEntry.timeSeconds || 0) >= (activeDiscipline.targetTimeSeconds || 300) ? (
                          <span className="text-emerald-600 flex items-center gap-1">
                            <CheckCircle2 size={12} />
                            Norm erfüllt (≥5 Min.)!
                          </span>
                        ) : (
                          <span className="text-amber-600 flex items-center gap-1">
                            <AlertCircle size={12} />
                            Noch {Math.round((activeDiscipline.targetTimeSeconds || 300) - (stats.bestEntry.timeSeconds || 0))} s bis zu 5 Min.
                          </span>
                        )
                      ) : <span className="text-slate-400">Ausstehend</span>
                    ) : activeDiscipline.targetTimeSeconds ? (
                      stats?.bestEntry ? (
                        (stats.bestEntry.timeSeconds || 0) <= activeDiscipline.targetTimeSeconds ? (
                          <span className="text-emerald-600 flex items-center gap-1">
                            <CheckCircle2 size={12} />
                            Norm erfüllt!
                          </span>
                        ) : (
                          <span className="text-amber-600 flex items-center gap-1">
                            <AlertCircle size={12} />
                            Noch {((stats.bestEntry.timeSeconds || 0) - activeDiscipline.targetTimeSeconds).toFixed(2).replace('.', ',')} s bis zur Norm
                          </span>
                        )
                      ) : <span className="text-slate-400">Ausstehend</span>
                    ) : (
                      <span className="text-slate-400">Freies Training</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Card 4: Total Units & Average */}
              <div className="bg-slate-50/70 p-3.5 sm:p-4 rounded-2xl border border-slate-200/70 flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider">
                    {isJump ? 'Sprünge gesamt' : isHLW ? 'Wiederbelebungen' : 'Einheiten & Ø'}
                  </span>
                  <Calendar size={16} className="text-indigo-500" />
                </div>
                <div>
                  <div className="text-lg sm:text-2xl font-black text-slate-800">
                    {stats?.totalEntries || 0} <span className="text-xs text-slate-400 font-normal">{isJump ? 'Sprünge' : 'Einträge'}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {isJump ? (
                      <span>Vorbereitung für Prüfung</span>
                    ) : isHLW ? (
                      <span>Kontinuierliche Herz-Lungen-Wiederbelebung</span>
                    ) : stats && stats.totalEntries > 0 && stats.averageSeconds > 0 ? (
                      <span>Schnitt: <strong className="font-mono">{formatSwimTime(stats.averageSeconds, false)}</strong></span>
                    ) : isDive ? (
                      <span>Streckentauchen</span>
                    ) : 'Keine Einträge'}
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Visual Progress Chart / Card */}
          <SwimProgressChart
            discipline={activeDiscipline}
            entries={disciplineEntries}
            onAddEntryClick={openAddEntry}
          />

          {/* Detailed History Table */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-800">
                  {isJump ? 'Sprung-Protokoll' : 'Trainings-Protokoll'} ({disciplineEntries.length} {disciplineEntries.length === 1 ? 'Eintrag' : 'Einträge'})
                </h3>
                <p className="text-xs text-slate-500">
                  {isJump 
                    ? `Chronologische Dokumentation aller Sprünge für ${activeDiscipline.name}.`
                    : `Chronologische Übersicht aller Leistungen für ${activeDiscipline.name}.`}
                </p>
              </div>
            </div>

            {disciplineEntries.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                Bisher wurden noch keine Einträge vorgenommen.
              </div>
            ) : isJump ? (
              /* === JUMP DISCIPLINE TABLE === */
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                      <th className="pb-3 pl-2">Datum</th>
                      <th className="pb-3">Höhe & Sprungart</th>
                      <th className="pb-3">Bewertung / Ausführung</th>
                      <th className="pb-3">Notizen / Feedback</th>
                      <th className="pb-3 pr-2 text-right">Aktionen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...disciplineEntries]
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || b.createdAt - a.createdAt)
                      .map((entry) => (
                        <tr key={entry.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 pl-2 font-medium text-slate-700 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <Calendar size={13} className="text-slate-400" />
                              <span>{new Date(entry.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                            </div>
                          </td>

                          <td className="py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-slate-900 bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md text-xs">
                                {entry.jumpHeightMeters || 3}m
                              </span>
                              <span className="font-bold text-slate-800">
                                {entry.jumpStyle || 'Kopfsprung vorwärts'}
                              </span>
                            </div>
                          </td>

                          <td className="py-3 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 size={13} />
                              <span>{entry.ratingScore || 'Bestanden'}</span>
                            </span>
                          </td>

                          <td className="py-3 text-slate-600 text-xs max-w-xs truncate">
                            {entry.notes ? entry.notes : <span className="text-slate-300">-</span>}
                          </td>

                          <td className="py-3 pr-2 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                onClick={() => openEditEntry(entry)}
                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Bearbeiten"
                              >
                                <Edit2 size={15} />
                              </button>
                              <button
                                onClick={() => handleDeleteEntry(entry.id)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Löschen"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : isDive ? (
              /* === DIVE DISCIPLINE TABLE === */
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                      <th className="pb-3 pl-2">Datum</th>
                      <th className="pb-3">Getauchte Strecke</th>
                      <th className="pb-3">Tauchzeit</th>
                      <th className="pb-3">Norm-Status</th>
                      <th className="pb-3">Puls / Bahn</th>
                      <th className="pb-3">Notizen</th>
                      <th className="pb-3 pr-2 text-right">Aktionen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...disciplineEntries]
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || b.createdAt - a.createdAt)
                      .map((entry) => {
                        const dist = entry.distanceMeters || 35;
                        const hasTime = typeof entry.timeSeconds === 'number' && entry.timeSeconds > 0;
                        const timePassBonus = hasTime && (entry.timeSeconds || 0) < 39;

                        return (
                          <tr key={entry.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3 pl-2 font-medium text-slate-700 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <Calendar size={13} className="text-slate-400" />
                                <span>{new Date(entry.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                              </div>
                            </td>

                            <td className="py-3 whitespace-nowrap">
                              <span className="font-mono text-base font-black text-cyan-900 bg-cyan-50 px-2 py-0.5 rounded-md border border-cyan-200">
                                {dist} Meter
                              </span>
                            </td>

                            <td className="py-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                              {hasTime ? (
                                <div className="flex items-center gap-1">
                                  <span>{formatSwimTime(entry.timeSeconds)}</span>
                                  {timePassBonus && (
                                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">
                                      ⚡ Bonus (&lt;39s)
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400 italic text-xs">Nicht gestoppt</span>
                              )}
                            </td>

                            <td className="py-3 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg ${
                                dist >= 35 
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}>
                                {dist >= 35 ? '✓ 35m Norm erfüllt' : `${35 - dist}m fehlen`}
                              </span>
                            </td>

                            <td className="py-3 text-slate-600 text-xs whitespace-nowrap">
                              <div className="space-y-0.5">
                                {entry.heartRate && (
                                  <div className="flex items-center gap-1 text-rose-600 font-medium">
                                    <Heart size={12} />
                                    <span>{entry.heartRate} bpm</span>
                                  </div>
                                )}
                                <div className="text-slate-400 text-[11px]">
                                  {entry.poolLength || 25}m Bahn
                                </div>
                              </div>
                            </td>

                            <td className="py-3 text-slate-600 text-xs max-w-xs truncate">
                              {entry.notes ? entry.notes : <span className="text-slate-300">-</span>}
                            </td>

                            <td className="py-3 pr-2 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1">
                                <button
                                onClick={() => openEditEntry(entry)}
                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Bearbeiten"
                              >
                                <Edit2 size={15} />
                              </button>
                              <button
                                onClick={() => handleDeleteEntry(entry.id)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Löschen"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              /* === STANDARD TIMED SWIMMING / HLW TABLE === */
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                      <th className="pb-3 pl-2">Datum</th>
                      <th className="pb-3">{isHLW ? 'Reanimierte Zeit' : 'Zeit'}</th>
                      <th className="pb-3">{isHLW ? 'Soll (min. 5 Min.)' : 'Vergleich Soll'}</th>
                      {!isHLW && <th className="pb-3">Puls / Bahn</th>}
                      <th className="pb-3">Notizen</th>
                      <th className="pb-3 pr-2 text-right">Aktionen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...disciplineEntries]
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || b.createdAt - a.createdAt)
                      .map((entry) => {
                        const comp = activeDiscipline.targetTimeSeconds && entry.timeSeconds
                          ? getRequirementComparison(entry.timeSeconds, activeDiscipline.targetTimeSeconds, isHLW)
                          : null;
                        const isBest = stats?.bestEntry?.id === entry.id;

                        return (
                          <tr key={entry.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3 pl-2 font-medium text-slate-700 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <Calendar size={13} className="text-slate-400" />
                                <span>{new Date(entry.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                              </div>
                            </td>

                            <td className="py-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span className="text-base">{formatSwimTime(entry.timeSeconds)}</span>
                                {isBest && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-md">
                                    <Award size={10} />
                                    {isHLW ? 'Max' : 'PB'}
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="py-3 whitespace-nowrap">
                              {comp?.hasTarget ? (
                                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg ${
                                  comp.isPassed 
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                                }`}>
                                  {comp.isPassed ? '✓ ' : ''}{comp.formattedDelta}
                                </span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>

                            {!isHLW && (
                              <td className="py-3 text-slate-600 text-xs whitespace-nowrap">
                                <div className="space-y-0.5">
                                  {entry.heartRate && (
                                    <div className="flex items-center gap-1 text-rose-600 font-medium">
                                      <Heart size={12} />
                                      <span>{entry.heartRate} bpm</span>
                                    </div>
                                  )}
                                  <div className="text-slate-400 text-[11px]">
                                    {entry.poolLength || 25}m Bahn
                                  </div>
                                </div>
                              </td>
                            )}

                            <td className="py-3 text-slate-600 text-xs max-w-xs truncate">
                              {entry.notes ? entry.notes : <span className="text-slate-300">-</span>}
                            </td>

                            <td className="py-3 pr-2 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  onClick={() => openEditEntry(entry)}
                                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="Bearbeiten"
                                >
                                  <Edit2 size={15} />
                                </button>
                                <button
                                  onClick={() => handleDeleteEntry(entry.id)}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Löschen"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-200">
          <p className="text-slate-500 mb-4">Es sind noch keine Schwimm-Disziplinen angelegt.</p>
          <button
            onClick={openAddDiscipline}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-xs"
          >
            Erste Disziplin anlegen
          </button>
        </div>
      )}

      {/* FAB Examination Guide & Norms Card (Collapsible) */}
      <div className="bg-slate-100/80 rounded-3xl p-5 sm:p-6 border border-slate-200">
        <button
          onClick={() => setShowExamInfo(!showExamInfo)}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <FileText size={18} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                Übersicht: Praktische FAB-Prüfungsanforderungen
              </h3>
              <p className="text-xs text-slate-500">
                Offizielle Disziplinen, Sperrfächer und Richtwerte für die praktische Abschlussprüfung.
              </p>
            </div>
          </div>
          <div className="text-slate-400">
            {showExamInfo ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>
        </button>

        {showExamInfo && (
          <div className="mt-4 pt-4 border-t border-slate-200 text-xs text-slate-600 space-y-3 leading-relaxed">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80">
                <div className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-extrabold text-[10px]">Sperrfach</span>
                  <span>Kombinierte Rettungsübung (max. 10:00 Min.)</span>
                </div>
                <p className="text-slate-500">
                  25m Anschwimmen, Abtauchen, Heraufholen einer Puppe, Befreiungsgriff, 25m Abschleppen, Anlandbringen, Ablegen, EH-Maßnahmen, Seitenlage.
                </p>
              </div>

              <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80">
                <div className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-extrabold text-[10px]">Sperrfach</span>
                  <span>300m Kleiderschwimmen (max. 8:00 Min.)</span>
                </div>
                <p className="text-slate-500">
                  In Drillich-Anzug schwimmen mit anschließendem Entkleiden im tiefen Wasser ohne Festhalten.
                </p>
              </div>

              <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80">
                <div className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-extrabold text-[10px]">Sperrfach</span>
                  <span>50m Abschleppen (max. 2:00 Min.)</span>
                </div>
                <p className="text-slate-500">
                  In Drillich-Anzug: 25m Achselschleppgriff, dann 25m Fesselschleppgriff.
                </p>
              </div>

              <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80">
                <div className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-extrabold text-[10px]">Sperrfach</span>
                  <span>Herz-Lungen-Wiederbelebung (5 Min.)</span>
                </div>
                <p className="text-slate-500">
                  Mindestens 5 Minuten kontinuierliche Herz-Lungen-Wiederbelebung an der Trainingspuppe.
                </p>
              </div>

              <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80">
                <div className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                  <Target size={14} className="text-blue-600" />
                  <span>35m Streckentauchen (min. 35m)</span>
                </div>
                <p className="text-slate-500">
                  35m Streckentauchen von der Wasseroberfläche aus. Ab einer Zeit unter 39 Sekunden erfolgt eine Punkteverbesserung.
                </p>
              </div>

              <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80">
                <div className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                  <Target size={14} className="text-blue-600" />
                  <span>100m Zeitschwimmen (max. 1:30 Min.)</span>
                </div>
                <p className="text-slate-500">
                  Zeitschwimmen mit Startsprung und korrekter Wende nach Wettkampfregeln.
                </p>
              </div>

              <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80">
                <div className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                  <Target size={14} className="text-blue-600" />
                  <span>50m Wettkampftechnik</span>
                </div>
                <p className="text-slate-500">
                  Schwimmtechnik nach Wettkampfregeln (Schwimmart wird erst zur Prüfung bekannt gegeben).
                </p>
              </div>

              <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80">
                <div className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                  <Target size={14} className="text-blue-600" />
                  <span>Kopfsprung aus 3m Höhe</span>
                </div>
                <p className="text-slate-500">
                  Kopfsprung einer Sprungart aus 3m Höhe mit sauberer Eintauchphase.
                </p>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 italic">
              Hinweis: Sperrfächer müssen zwingend bestanden werden. Du kannst Soll-Zeiten und Notizen in jeder Disziplin individuell anpassen oder ergänzen.
            </p>
          </div>
        )}
      </div>

      {/* Modals */}
      {showEntryModal && (
        <SwimEntryModal
          isOpen={showEntryModal}
          onClose={() => setShowEntryModal(false)}
          disciplines={disciplines}
          selectedDisciplineId={activeDisciplineId}
          onSave={handleSaveEntry}
          onUpdate={handleUpdateEntry}
          onDelete={handleDeleteEntry}
          editingEntry={editingEntry}
        />
      )}

      {showDisciplineModal && (
        <SwimDisciplineModal
          isOpen={showDisciplineModal}
          onClose={() => setShowDisciplineModal(false)}
          onSave={handleSaveDiscipline}
          onUpdate={handleUpdateDiscipline}
          onDelete={handleDeleteDiscipline}
          editingDiscipline={editingDiscipline}
        />
      )}
    </div>
  );
}
