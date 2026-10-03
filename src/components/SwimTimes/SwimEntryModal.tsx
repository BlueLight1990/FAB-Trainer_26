import React, { useState, useEffect } from 'react';
import { SwimDiscipline, SwimTimeEntry } from '../../types';
import { 
  parseSwimTime, 
  splitSwimTime, 
  formatSwimTime, 
  getRequirementComparison, 
  isJumpDiscipline, 
  isDiveDiscipline,
  isHLWDiscipline
} from '../../lib/swimUtils';
import { X, Timer, Target, Heart, CheckCircle2, AlertCircle, Trash2, Info, Award } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  disciplines: SwimDiscipline[];
  selectedDisciplineId: string;
  onSave: (entry: Omit<SwimTimeEntry, 'id'>) => Promise<void>;
  onUpdate?: (id: string, entry: Partial<SwimTimeEntry>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  editingEntry?: SwimTimeEntry | null;
}

const JUMP_STYLE_SUGGESTIONS = [
  'Kopfsprung vorwärts (gehechtet)',
  'Kopfsprung vorwärts (gestreckt)',
  'Kopfsprung rückwärts',
  'Abfaller vorwärts',
  'Delfinkopfsprung',
  'Auerbachkopfsprung'
];

const JUMP_RATING_OPTIONS = [
  'Bestanden',
  'Sehr gut (1)',
  'Gut (2)',
  'Befriedigend (3)',
  'Ausreichend (4)',
  'Nicht bestanden (5)'
];

export function SwimEntryModal({
  isOpen,
  onClose,
  disciplines,
  selectedDisciplineId,
  onSave,
  onUpdate,
  onDelete,
  editingEntry
}: Props) {
  const [disciplineId, setDisciplineId] = useState(selectedDisciplineId);
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  
  // Time inputs
  const [minutes, setMinutes] = useState<number>(1);
  const [seconds, setSeconds] = useState<number>(33);
  const [hundredths, setHundredths] = useState<number>(50);
  const [recordTimeForDive, setRecordTimeForDive] = useState<boolean>(true);

  // Jump specific inputs
  const [jumpHeightMeters, setJumpHeightMeters] = useState<number>(3);
  const [jumpStyle, setJumpStyle] = useState<string>('Kopfsprung vorwärts (gehechtet)');
  const [ratingScore, setRatingScore] = useState<string>('Bestanden');

  // Dive specific inputs
  const [distanceMeters, setDistanceMeters] = useState<number>(35);

  const [poolLength, setPoolLength] = useState<number>(25);
  const [heartRate, setHeartRate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const currentDisc = disciplines.find(d => d.id === disciplineId);
  const isJump = isJumpDiscipline(currentDisc);
  const isDive = isDiveDiscipline(currentDisc);
  const isHLW = isHLWDiscipline(currentDisc);

  useEffect(() => {
    setErrorMessage(null);
    setShowDeleteConfirm(false);
    if (editingEntry) {
      setDisciplineId(editingEntry.disciplineId);
      setDate(editingEntry.date);
      if (typeof editingEntry.timeSeconds === 'number' && editingEntry.timeSeconds > 0) {
        const split = splitSwimTime(editingEntry.timeSeconds);
        setMinutes(split.minutes);
        setSeconds(split.seconds);
        setHundredths(split.hundredths);
        setRecordTimeForDive(true);
      } else {
        setMinutes(0);
        setSeconds(38);
        setHundredths(0);
        setRecordTimeForDive(false);
      }
      setJumpHeightMeters(editingEntry.jumpHeightMeters || 3);
      setJumpStyle(editingEntry.jumpStyle || 'Kopfsprung vorwärts (gehechtet)');
      setRatingScore(editingEntry.ratingScore || 'Bestanden');
      setDistanceMeters(editingEntry.distanceMeters || (currentDisc?.distance || 35));
      setPoolLength(editingEntry.poolLength || 25);
      setHeartRate(editingEntry.heartRate ? editingEntry.heartRate.toString() : '');
      setNotes(editingEntry.notes || '');
    } else {
      const activeId = selectedDisciplineId || (disciplines[0]?.id || '');
      setDisciplineId(activeId);
      setDate(new Date().toISOString().split('T')[0]);
      
      const disc = disciplines.find(d => d.id === activeId);
      const isD = isDiveDiscipline(disc);
      const isJ = isJumpDiscipline(disc);

      if (isJ) {
        setJumpHeightMeters(3);
        setJumpStyle('Kopfsprung vorwärts (gehechtet)');
        setRatingScore('Bestanden');
      } else if (isD) {
        setDistanceMeters(35);
        setMinutes(0);
        setSeconds(38);
        setHundredths(40);
        setRecordTimeForDive(true);
      } else if (disc?.targetTimeSeconds) {
        const split = splitSwimTime(disc.targetTimeSeconds);
        setMinutes(split.minutes);
        setSeconds(split.seconds);
        setHundredths(0);
      } else {
        setMinutes(1);
        setSeconds(30);
        setHundredths(0);
      }
      setPoolLength(disc?.poolLength || 25);
      setHeartRate('');
      setNotes('');
    }
  }, [editingEntry, isOpen, selectedDisciplineId, disciplines, currentDisc]);

  if (!isOpen) return null;

  const totalSeconds = parseSwimTime(minutes, seconds, hundredths);
  const comparison = currentDisc && !isJump && (totalSeconds > 0)
    ? getRequirementComparison(totalSeconds, currentDisc.targetTimeSeconds, isHLW) 
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!disciplineId) {
      setErrorMessage('Bitte wähle eine Disziplin aus.');
      return;
    }

    if (isJump) {
      if (!jumpStyle.trim()) {
        setErrorMessage('Bitte gib eine Sprungart an.');
        return;
      }
      if (!jumpHeightMeters || jumpHeightMeters <= 0) {
        setErrorMessage('Bitte gib eine gültige Sprunghöhe an.');
        return;
      }
    } else if (isDive) {
      if (!distanceMeters || distanceMeters <= 0) {
        setErrorMessage('Bitte gib die getauchte Strecke in Metern an (z.B. 35m).');
        return;
      }
      if (recordTimeForDive && totalSeconds <= 0) {
        setErrorMessage('Bitte gib eine gültige Zeit ein oder deaktiviere die Zeitmessung.');
        return;
      }
    } else {
      if (totalSeconds <= 0) {
        setErrorMessage('Bitte gib eine gültige Zeit ein (größer als 0 Sekunden).');
        return;
      }
    }

    try {
      setIsSaving(true);
      let payload: Omit<SwimTimeEntry, 'id'>;

      if (isJump) {
        payload = {
          disciplineId,
          date,
          jumpHeightMeters: Number(jumpHeightMeters),
          jumpStyle: jumpStyle.trim(),
          ratingScore: ratingScore || undefined,
          poolLength: Number(poolLength) || 25,
          notes: notes.trim() || undefined,
          createdAt: editingEntry?.createdAt || Date.now()
        };
      } else if (isDive) {
        payload = {
          disciplineId,
          date,
          distanceMeters: Number(distanceMeters),
          timeSeconds: recordTimeForDive && totalSeconds > 0 ? Number(totalSeconds.toFixed(2)) : undefined,
          poolLength: Number(poolLength) || 25,
          notes: notes.trim() || undefined,
          heartRate: heartRate ? Number(heartRate) : undefined,
          createdAt: editingEntry?.createdAt || Date.now()
        };
      } else {
        payload = {
          disciplineId,
          date,
          timeSeconds: Number(totalSeconds.toFixed(2)),
          poolLength: Number(poolLength) || 25,
          notes: notes.trim() || undefined,
          heartRate: heartRate ? Number(heartRate) : undefined,
          createdAt: editingEntry?.createdAt || Date.now()
        };
      }

      if (editingEntry && onUpdate) {
        await onUpdate(editingEntry.id, payload);
      } else {
        await onSave(payload);
      }
      onClose();
    } catch (err) {
      console.error('Fehler beim Speichern:', err);
      setErrorMessage('Konnte Eintrag nicht speichern.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!editingEntry || !onDelete) return;
    try {
      setIsSaving(true);
      await onDelete(editingEntry.id);
      onClose();
    } catch (err) {
      console.error('Fehler beim Löschen:', err);
      setErrorMessage('Konnte Eintrag nicht löschen.');
    } finally {
      setIsSaving(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              isJump ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
            }`}>
              {isJump ? <Award size={22} /> : <Timer size={22} />}
            </div>
            <div>
              <h2 className="font-bold text-slate-800 text-lg">
                {editingEntry 
                  ? (isJump ? 'Sprungleistung bearbeiten' : isHLW ? 'Reanimationszeit bearbeiten' : 'Trainingsleistung bearbeiten')
                  : (isJump ? 'Sprungleistung eintragen' : isHLW ? 'Reanimationszeit eintragen' : 'Trainingsleistung eintragen')}
              </h2>
              <p className="text-xs text-slate-500">
                {isJump 
                  ? 'Dokumentiere Sprunghöhe, Sprungart und Ausführung.'
                  : isDive 
                    ? 'Dokumentiere getauchte Distanz und optional deine Zeit.'
                    : isHLW 
                      ? 'Dokumentiere deine reanimierte Zeit und überprüfe die Anforderung (5 Min.).'
                      : 'Dokumentiere deine geschwommene Zeit und überprüfe die Anforderung.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/50 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {/* Discipline Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Disziplin *
            </label>
            <select
              value={disciplineId}
              onChange={e => setDisciplineId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 text-sm font-medium shadow-2xs bg-white"
            >
              {disciplines.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name} {d.targetTimeSeconds && !isJumpDiscipline(d) ? `(Soll: ${formatSwimTime(d.targetTimeSeconds, false)})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Date & Bahnlänge (Bahnlänge only for swim disciplines) */}
          <div className={!isJump && !isHLW ? "grid grid-cols-1 sm:grid-cols-2 gap-4" : "w-full"}>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Datum des Trainings / der Prüfung
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 text-sm font-medium shadow-2xs"
              />
            </div>

            {!isJump && !isHLW && (
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Bahnlänge
                </label>
                <select
                  value={poolLength}
                  onChange={e => setPoolLength(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 text-sm font-medium shadow-2xs bg-white"
                >
                  <option value={25}>25 Meter (Hallenbad)</option>
                  <option value={50}>50 Meter (Langbahn / Freibad)</option>
                </select>
              </div>
            )}
          </div>

          {/* === JUMP DISCIPLINE FORM (Kopfsprung aus 3m Höhe) === */}
          {isJump ? (
            <div className="space-y-4 bg-amber-50/60 p-4 rounded-2xl border border-amber-200/80">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 uppercase tracking-wider">
                <Award size={14} className="text-amber-700" />
                <span>Sprungdetails & Anforderung</span>
              </div>

              {/* Sprunghöhe */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Sprunghöhe (Meter) *
                </label>
                <div className="flex items-center gap-2">
                  {[1, 3, 5, 7.5, 10].map(h => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setJumpHeightMeters(h)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                        jumpHeightMeters === h
                          ? 'bg-amber-600 border-amber-600 text-white shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {h}m {h === 3 ? '(Prüfung)' : ''}
                    </button>
                  ))}
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min="0.5"
                      max="20"
                      step="0.5"
                      value={jumpHeightMeters}
                      onChange={e => setJumpHeightMeters(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 text-center bg-white border border-slate-200 rounded-xl font-bold text-xs text-slate-800 focus:ring-2 focus:ring-amber-500 outline-none"
                      placeholder="Frei"
                    />
                  </div>
                </div>
              </div>

              {/* Sprungart */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Sprungart *
                </label>
                <input
                  type="text"
                  required
                  value={jumpStyle}
                  onChange={e => setJumpStyle(e.target.value)}
                  placeholder="z.B. Kopfsprung vorwärts (gehechtet)"
                  className="w-full px-3.5 py-2.5 bg-white rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500 outline-none text-slate-800 text-sm font-medium shadow-2xs mb-2"
                />
                <div className="flex flex-wrap gap-1.5">
                  {JUMP_STYLE_SUGGESTIONS.map(style => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => setJumpStyle(style)}
                      className={`text-[11px] px-2 py-1 rounded-lg border transition-colors ${
                        jumpStyle === style
                          ? 'bg-amber-100 border-amber-300 text-amber-900 font-bold'
                          : 'bg-white/80 border-slate-200 text-slate-600 hover:bg-white'
                      }`}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bewertung / Ausführung */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Ausführung / Bewertung
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {JUMP_RATING_OPTIONS.map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setRatingScore(opt)}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all text-center ${
                        ratingScore === opt
                          ? 'bg-emerald-600 border-emerald-600 text-white shadow-2xs font-bold'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : isDive ? (
            /* === DIVE DISCIPLINE FORM (35m Streckentauchen) === */
            <div className="space-y-4 bg-cyan-50/60 p-4 rounded-2xl border border-cyan-200/80">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-900 uppercase tracking-wider">
                  <Target size={14} className="text-cyan-700" />
                  <span>Getauchte Strecke & Zeitmessung</span>
                </div>
                <span className="text-[11px] font-bold text-cyan-700 bg-cyan-100/80 px-2 py-0.5 rounded-md">
                  Soll: min. 35m
                </span>
              </div>

              {/* Strecke in Metern */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Getauchte Strecke (Meter) *
                </label>
                <div className="flex items-center gap-2">
                  {[25, 30, 35, 40, 50].map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setDistanceMeters(m)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                        distanceMeters === m
                          ? 'bg-cyan-600 border-cyan-600 text-white shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {m}m {m === 35 ? '⭐' : ''}
                    </button>
                  ))}
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={distanceMeters}
                      onChange={e => setDistanceMeters(parseInt(e.target.value, 10) || 0)}
                      className="w-full px-3 py-1.5 text-center bg-white border border-slate-200 rounded-xl font-bold text-xs text-slate-800 focus:ring-2 focus:ring-cyan-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Optional Zeit erfassen Toggle */}
              <div className="pt-2 border-t border-cyan-100">
                <label className="flex items-center gap-2 cursor-pointer mb-2.5">
                  <input
                    type="checkbox"
                    checked={recordTimeForDive}
                    onChange={e => setRecordTimeForDive(e.target.checked)}
                    className="w-4 h-4 rounded text-cyan-600 focus:ring-cyan-500 border-slate-300"
                  />
                  <span className="text-xs font-bold text-slate-800">
                    Tauchzeit erfassen (optional – Punkteverbesserung ab unter 39,0 Sek.)
                  </span>
                </label>

                {recordTimeForDive ? (
                  <div className="bg-white p-3 rounded-xl border border-cyan-200/80">
                    <div className="flex items-center justify-center gap-2 sm:gap-3">
                      <div className="flex flex-col items-center">
                        <input
                          type="number"
                          min="0"
                          max="59"
                          value={minutes}
                          onChange={e => setMinutes(Math.max(0, parseInt(e.target.value, 10) || 0))}
                          className="w-14 sm:w-16 text-center py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-lg font-black text-slate-800 focus:ring-2 focus:ring-cyan-500 outline-none shadow-2xs"
                        />
                        <span className="text-[10px] font-bold text-slate-500 mt-1">Min.</span>
                      </div>

                      <span className="text-xl font-black text-slate-400 mb-4">:</span>

                      <div className="flex flex-col items-center">
                        <input
                          type="number"
                          min="0"
                          max="59"
                          value={seconds}
                          onChange={e => setSeconds(Math.min(59, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                          className="w-14 sm:w-16 text-center py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-lg font-black text-slate-800 focus:ring-2 focus:ring-cyan-500 outline-none shadow-2xs"
                        />
                        <span className="text-[10px] font-bold text-slate-500 mt-1">Sek.</span>
                      </div>

                      <span className="text-xl font-black text-slate-400 mb-4">,</span>

                      <div className="flex flex-col items-center">
                        <input
                          type="number"
                          min="0"
                          max="99"
                          value={hundredths}
                          onChange={e => setHundredths(Math.min(99, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                          className="w-14 sm:w-16 text-center py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-lg font-black text-slate-800 focus:ring-2 focus:ring-cyan-500 outline-none shadow-2xs"
                        />
                        <span className="text-[10px] font-bold text-slate-500 mt-1">Hund.</span>
                      </div>
                    </div>

                    {totalSeconds > 0 && (
                      <div className={`mt-2.5 p-2 rounded-lg text-xs font-bold flex items-center justify-between ${
                        totalSeconds < 39
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-slate-50 text-slate-700'
                      }`}>
                        <span>
                          {totalSeconds < 39 
                            ? '⚡ Unter 39 Sek: Punkteverbesserung erreicht! 🎉' 
                            : 'Normzeit: 39,0 Sek. für Punkteverbesserung'}
                        </span>
                        <span className="font-mono">{formatSwimTime(totalSeconds)}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 italic">
                    Es wird nur die geschaffte Strecke ({distanceMeters}m) ohne Zeitstoppung festgehalten.
                  </p>
                )}
              </div>
            </div>
          ) : (
            /* === STANDARD SWIMMING / REANIMATION TIME FORM === */
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/90">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 text-center">
                {isHLW 
                  ? 'Reanimierte Zeit (Minuten : Sekunden , Hundertstel)'
                  : 'Geschwommene Zeit (Minuten : Sekunden , Hundertstel)'}
              </label>

              <div className="flex items-center justify-center gap-2 sm:gap-3">
                {/* Minutes */}
                <div className="flex flex-col items-center">
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={minutes}
                    onChange={e => setMinutes(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="w-16 sm:w-20 text-center py-2.5 bg-white border border-slate-200 rounded-xl font-mono text-xl sm:text-2xl font-black text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none shadow-2xs"
                  />
                  <span className="text-[11px] font-bold text-slate-500 mt-1">Minuten</span>
                </div>

                <span className="text-2xl font-black text-slate-400 mb-5">:</span>

                {/* Seconds */}
                <div className="flex flex-col items-center">
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={seconds}
                    onChange={e => setSeconds(Math.min(59, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                    className="w-16 sm:w-20 text-center py-2.5 bg-white border border-slate-200 rounded-xl font-mono text-xl sm:text-2xl font-black text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none shadow-2xs"
                  />
                  <span className="text-[11px] font-bold text-slate-500 mt-1">Sekunden</span>
                </div>

                <span className="text-2xl font-black text-slate-400 mb-5">,</span>

                {/* Hundredths */}
                <div className="flex flex-col items-center">
                  <input
                    type="number"
                    min="0"
                    max="99"
                    value={hundredths}
                    onChange={e => setHundredths(Math.min(99, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                    className="w-16 sm:w-20 text-center py-2.5 bg-white border border-slate-200 rounded-xl font-mono text-xl sm:text-2xl font-black text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none shadow-2xs"
                  />
                  <span className="text-[11px] font-bold text-slate-500 mt-1">Hundertstel</span>
                </div>
              </div>

              {/* Live Requirement Evaluation Badge */}
              {comparison?.hasTarget && (
                <div className={`mt-3.5 p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                  comparison.isPassed
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}>
                  <div className="flex items-center gap-2">
                    {comparison.isPassed ? (
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle size={16} className="text-amber-600 shrink-0" />
                    )}
                    <span className="font-bold">
                      {comparison.isPassed
                        ? (isHLW ? 'Mindestanforderung (5 Min.) erfüllt! 🎉' : 'Prüfungsanforderung erfüllt! 🎉')
                        : (isHLW ? 'Noch keine 5 Minuten erreicht.' : 'Anforderung noch nicht erreicht.')}
                    </span>
                  </div>
                  <span className="font-mono font-bold">
                    {comparison.formattedDelta}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Heart Rate and Notes */}
          <div className={!isJump && !isHLW ? "grid grid-cols-1 sm:grid-cols-2 gap-4" : "w-full"}>
            {!isJump && !isHLW && (
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Heart size={13} className="text-rose-500" />
                  <span>Puls nach Anschlag (optional)</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="40"
                    max="230"
                    value={heartRate}
                    onChange={e => setHeartRate(e.target.value)}
                    placeholder="z.B. 165"
                    className="w-full px-3.5 py-2.5 pr-14 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 text-sm font-medium shadow-2xs"
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs text-slate-400 font-bold">
                    bpm
                  </span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                {isJump 
                  ? 'Trainer-Feedback / Notizen zur Haltung' 
                  : isHLW
                    ? 'Notizen zur Wiederbelebung / Rhythmus / Feedback'
                    : 'Trainingsnotiz / Technik-Fokus'}
              </label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={
                  isJump 
                    ? "z.B. Körperspannung super, Fußspitzen gestreckt" 
                    : isHLW 
                      ? "z.B. 30:2 Rhythmus konstant durchgehalten, Herzdruckmassage gleichmäßig"
                      : "z.B. Ruhiger Zug, Wende sauber erwischt"
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 text-sm font-medium shadow-2xs"
              />
            </div>
          </div>

          {/* Error Message Banner */}
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
              <Info size={16} className="text-red-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Delete Confirmation Box */}
          {showDeleteConfirm && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-xl space-y-2">
              <p className="font-semibold">
                Möchtest du diesen Eintrag wirklich unwiderruflich löschen?
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  disabled={isSaving}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors text-xs shadow-2xs"
                >
                  Ja, endgültig löschen
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isSaving}
                  className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 font-semibold rounded-lg transition-colors text-xs"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            {editingEntry && onDelete ? (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isSaving || showDeleteConfirm}
                className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-xl transition-colors font-semibold disabled:opacity-50"
              >
                <Trash2 size={15} />
                <span>Eintrag löschen</span>
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors shadow-2xs disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving ? (
                  <span>Wird gespeichert...</span>
                ) : (
                  <span>{editingEntry ? 'Änderungen speichern' : 'Eintrag speichern'}</span>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
