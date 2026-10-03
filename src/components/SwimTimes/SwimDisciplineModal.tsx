import React, { useState, useEffect } from 'react';
import { SwimDiscipline, SwimStrokeStyle } from '../../types';
import { parseSwimTime, splitSwimTime, formatSwimTime } from '../../lib/swimUtils';
import { X, Target, Info, Trash2, Award } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (discipline: Omit<SwimDiscipline, 'id'>) => Promise<void>;
  onUpdate?: (id: string, discipline: Partial<SwimDiscipline>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  editingDiscipline?: SwimDiscipline | null;
}

const STYLES: { id: SwimStrokeStyle; label: string }[] = [
  { id: 'brust', label: 'Brust' },
  { id: 'freistil', label: 'Freistil / Kraul' },
  { id: 'ruecken', label: 'Rücken' },
  { id: 'schmetterling', label: 'Schmetterling / Delphin' },
  { id: 'kleider', label: 'Kleiderschwimmen' },
  { id: 'retten', label: 'Rettungsschwimmen' },
  { id: 'tauchen', label: 'Tauchen' },
  { id: 'sonstiges', label: 'Sonstiges' }
];

export function SwimDisciplineModal({
  isOpen,
  onClose,
  onSave,
  onUpdate,
  onDelete,
  editingDiscipline
}: Props) {
  const [name, setName] = useState('');
  const [distance, setDistance] = useState<number>(100);
  const [poolLength, setPoolLength] = useState<number>(25);
  const [style, setStyle] = useState<SwimStrokeStyle>('brust');
  const [hasTarget, setHasTarget] = useState<boolean>(true);
  const [targetMin, setTargetMin] = useState<number>(1);
  const [targetSec, setTargetSec] = useState<number>(35);
  const [requirementLabel, setRequirementLabel] = useState('FAB Abschlussprüfung: max. 1:35 Min.');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    setErrorMessage(null);
    setShowDeleteConfirm(false);
    if (editingDiscipline) {
      setName(editingDiscipline.name || '');
      setDistance(editingDiscipline.distance || 100);
      setPoolLength(editingDiscipline.poolLength || 25);
      setStyle(editingDiscipline.style || 'brust');
      setDescription(editingDiscipline.description || '');
      setRequirementLabel(editingDiscipline.requirementLabel || '');

      if (editingDiscipline.targetTimeSeconds && editingDiscipline.targetTimeSeconds > 0) {
        setHasTarget(true);
        const split = splitSwimTime(editingDiscipline.targetTimeSeconds);
        setTargetMin(split.minutes);
        setTargetSec(split.seconds);
      } else {
        setHasTarget(false);
        setTargetMin(1);
        setTargetSec(30);
      }
    } else {
      // Default new discipline values
      setName('');
      setDistance(100);
      setPoolLength(25);
      setStyle('brust');
      setHasTarget(true);
      setTargetMin(1);
      setTargetSec(35);
      setRequirementLabel('FAB Richtwert: max. 1:35 Min.');
      setDescription('');
    }
  }, [editingDiscipline, isOpen]);

  if (!isOpen) return null;

  const handleStyleSelect = (newStyle: SwimStrokeStyle) => {
    setStyle(newStyle);
    if (!editingDiscipline) {
      if (newStyle === 'tauchen') {
        if (!name || name === '100m Brust (Zeitschwimmen)' || name === '50m Freistil') {
          setName('35m Streckentauchen');
        }
        setDistance(35);
        setRequirementLabel('FAB Prüfungsanforderung (35m Tauchen)');
      } else if (newStyle === 'kleider') {
        if (!name) setName('300m Kleiderschwimmen');
        setDistance(300);
        setRequirementLabel('FAB Prüfungszeit: max. 6:00 Min.');
        setTargetMin(6);
        setTargetSec(0);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage('Bitte gib einen Namen für die Disziplin ein.');
      return;
    }

    const distNum = Number(distance);
    if (!distNum || distNum <= 0) {
      setErrorMessage('Bitte gib eine gültige Distanz in Metern ein (z.B. 35 für 35m Tauchen).');
      return;
    }

    try {
      setIsSaving(true);
      const targetTimeSeconds = hasTarget ? parseSwimTime(targetMin, targetSec, 0) : undefined;

      const payload: Omit<SwimDiscipline, 'id'> = {
        name: trimmedName,
        distance: distNum,
        poolLength: Number(poolLength) || 25,
        style,
        targetTimeSeconds,
        requirementLabel: requirementLabel.trim() || undefined,
        description: description.trim() || undefined
      };

      if (editingDiscipline && onUpdate) {
        await onUpdate(editingDiscipline.id, payload);
      } else {
        await onSave(payload);
      }
      onClose();
    } catch (err) {
      console.error('Fehler beim Speichern der Disziplin:', err);
      setErrorMessage('Konnte Disziplin nicht speichern. Bitte versuche es erneut.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!editingDiscipline || !onDelete) return;
    try {
      setIsSaving(true);
      await onDelete(editingDiscipline.id);
      onClose();
    } catch (err) {
      console.error('Fehler beim Löschen:', err);
      setErrorMessage('Konnte Disziplin nicht löschen.');
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
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <Award size={20} />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 text-lg">
                {editingDiscipline ? 'Disziplin bearbeiten' : 'Neue Schwimm-Disziplin erstellen'}
              </h2>
              <p className="text-xs text-slate-500">
                Lege Namen, Distanz und deine geforderten Soll-Zeiten fest.
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
          
          {/* Discipline Name */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Name der Disziplin *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="z.B. 100m Brust (Zeitschwimmen) oder 50m Kraul"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 text-sm font-medium shadow-2xs"
            />
          </div>

          {/* Stroke Style */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Schwimmart / Kategorie
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {STYLES.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleStyleSelect(s.id)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all border text-center truncate ${
                    style === s.id
                      ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Distance and Pool Length */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Strecke / Distanz (z.B. 35m für Streckentauchen)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max="10000"
                  step="1"
                  value={distance}
                  onChange={e => setDistance(Math.max(1, parseInt(e.target.value, 10) || 0))}
                  className="w-full px-3.5 py-2.5 pr-12 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 text-sm font-medium shadow-2xs"
                />
                <span className="absolute right-3.5 top-2.5 text-xs text-slate-400 font-bold">
                  Meter
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {[25, 35, 50, 100, 200, 300, 400, 1000].map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDistance(d)}
                    className={`text-[11px] px-2 py-0.5 rounded-lg border font-medium transition-colors ${
                      distance === d
                        ? 'bg-blue-600 text-white border-blue-600 font-bold'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200'
                    }`}
                  >
                    {d === 35 ? '35m (Tauchen)' : `${d}m`}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Bahnlänge des Beckens
              </label>
              <select
                value={poolLength}
                onChange={e => setPoolLength(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 text-sm font-medium shadow-2xs bg-white"
              >
                <option value={25}>25 m (Kurzbahn / Standard)</option>
                <option value={50}>50 m (Langbahn / Freibad)</option>
              </select>
            </div>
          </div>

          {/* Target / Requirement Section */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target size={16} className="text-emerald-600" />
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Prüfungsanforderung / Soll-Zeit hinterlegen
                </span>
              </div>
              <input
                type="checkbox"
                id="toggleTarget"
                checked={hasTarget}
                onChange={e => setHasTarget(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
              />
            </div>

            {hasTarget && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      Minuten
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={targetMin}
                      onChange={e => setTargetMin(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-center font-mono font-bold text-base text-slate-800"
                    />
                  </div>
                  <span className="text-xl font-bold text-slate-400 mt-5">:</span>
                  <div className="flex-1">
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      Sekunden
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={targetSec}
                      onChange={e => setTargetSec(Math.min(59, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-center font-mono font-bold text-base text-slate-800"
                    />
                  </div>
                  <div className="text-xs font-medium text-emerald-700 bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-200 shrink-0 mt-5">
                    = {formatSwimTime(targetMin * 60 + targetSec)}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    Bezeichnung der Anforderung
                  </label>
                  <input
                    type="text"
                    value={requirementLabel}
                    onChange={e => setRequirementLabel(e.target.value)}
                    placeholder="z.B. FAB Abschlussprüfung (max. 1:35 Min.)"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-700 font-medium"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Description & Exam Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Prüfungshinweise / Notizen (optional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="z.B. Startsprung, korrekte Anschläge mit beiden Händen, keine Delphinbeinschläge..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 text-xs font-medium shadow-2xs resize-none"
            />
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
                Möchtest du diese Disziplin und alle erfassten Zeiten wirklich unwiderruflich löschen?
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

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            {editingDiscipline && onDelete ? (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isSaving || showDeleteConfirm}
                className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-xl transition-colors font-semibold disabled:opacity-50"
              >
                <Trash2 size={15} />
                <span>Disziplin löschen</span>
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
                  <span>{editingDiscipline ? 'Änderungen speichern' : 'Disziplin erstellen'}</span>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
