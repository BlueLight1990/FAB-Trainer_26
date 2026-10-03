import React, { useState, useEffect, useRef } from 'react';
import { Category, CategoryOverride } from '../types';
import { DEFAULT_PRESET_CATEGORIES } from '../data/questions';
import { 
  Download, 
  Upload, 
  Trash2, 
  Edit2, 
  Check, 
  X, 
  Plus, 
  RotateCcw, 
  Eye, 
  EyeOff, 
  Sliders, 
  Settings, 
  LifeBuoy, 
  Scale, 
  Waves, 
  Folder, 
  AlertTriangle, 
  HeartPulse, 
  PlusSquare, 
  User, 
  Layers, 
  Server,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Key,
  ExternalLink,
  Sparkles,
  Loader2,
  Share2,
  Copy,
  LucideIcon 
} from 'lucide-react';
import { 
  getStoredGeminiApiKey, 
  setStoredGeminiApiKey, 
  testGeminiApiKey,
  checkServerGeminiStatus 
} from '../lib/geminiClient';
import { 
  getCustomServerUrl, 
  setCustomServerUrl, 
  testServerConnection, 
  isNativeApp 
} from '../lib/api';
import { 
  deleteCustomCategory, 
  updateCustomCategory,
  updatePresetCategory,
  resetPresetCategory,
  resetAllPresetCategories,
  resetToFactoryDefaults,
  getDbData
} from '../lib/db';
import { 
  exportAppDataBackup, 
  importAppDataBackup, 
  BackupExportResult, 
  BackupImportResult 
} from '../lib/backupExport';
import { AddCategoryForm } from './AddCategoryForm';
import { ConfirmModal, ConfirmDialogConfig } from './ConfirmModal';

const iconMap: Record<string, LucideIcon> = {
  Settings,
  LifeBuoy,
  Scale,
  Waves,
  Folder,
  AlertTriangle,
  HeartPulse,
  PlusSquare,
  User,
  Layers
};

interface Props {
  customCategories: Category[];
  presetOverrides?: Record<string, CategoryOverride>;
  onDataUpdated: () => void;
}

export function SettingsView({ customCategories, presetOverrides = {}, onDataUpdated }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Custom categories editing state
  const [editingCustomId, setEditingCustomId] = useState<string | null>(null);
  const [editCustomTitle, setEditCustomTitle] = useState('');
  const [editCustomDescription, setEditCustomDescription] = useState('');
  const [showAddCategory, setShowAddCategory] = useState(false);

  // Preset categories editing state
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [editPresetTitle, setEditPresetTitle] = useState('');
  const [editPresetDescription, setEditPresetDescription] = useState('');
  const [editPresetHidden, setEditPresetHidden] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<ConfirmDialogConfig | null>(null);

  // Gemini API Key state (Direct mobile scan without PC)
  const [apiKeyInput, setApiKeyInput] = useState(getStoredGeminiApiKey());
  const [showApiKey, setShowApiKey] = useState(false);
  const [testingApiKey, setTestingApiKey] = useState(false);
  const [apiKeyTestResult, setApiKeyTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [savedApiKeyFeedback, setSavedApiKeyFeedback] = useState(false);
  const [showAdvancedServer, setShowAdvancedServer] = useState(false);
  const [serverGeminiStatus, setServerGeminiStatus] = useState<{ serverKeyAvailable: boolean; model?: string } | null>(null);

  useEffect(() => {
    checkServerGeminiStatus().then(setServerGeminiStatus);
  }, []);

  const handleTestAndSaveApiKey = async () => {
    if (!apiKeyInput.trim()) {
      setApiKeyTestResult({ ok: false, message: 'Bitte gib einen API-Schlüssel ein.' });
      return;
    }
    setTestingApiKey(true);
    setApiKeyTestResult(null);
    try {
      const res = await testGeminiApiKey(apiKeyInput);
      setApiKeyTestResult(res);
      if (res.ok) {
        setStoredGeminiApiKey(apiKeyInput);
        setSavedApiKeyFeedback(true);
        setTimeout(() => setSavedApiKeyFeedback(false), 3000);
      }
    } finally {
      setTestingApiKey(false);
    }
  };

  const handleClearApiKey = () => {
    setStoredGeminiApiKey('');
    setApiKeyInput('');
    setApiKeyTestResult(null);
    setSavedApiKeyFeedback(false);
  };

  // Server connection state (for Android App & KI Foto-Scan)
  const [serverUrlInput, setServerUrlInput] = useState(getCustomServerUrl());
  const [testingServer, setTestingServer] = useState(false);
  const [serverTestResult, setServerTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [savedServerFeedback, setSavedServerFeedback] = useState(false);

  const handleTestServer = async () => {
    setTestingServer(true);
    setServerTestResult(null);
    try {
      const res = await testServerConnection(serverUrlInput);
      setServerTestResult(res);
    } finally {
      setTestingServer(false);
    }
  };

  const handleSaveServer = () => {
    setCustomServerUrl(serverUrlInput);
    setSavedServerFeedback(true);
    setTimeout(() => setSavedServerFeedback(false), 3000);
  };

  // Backup Export State
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ percent: number; status: string } | null>(null);
  const [exportResult, setExportResult] = useState<BackupExportResult | null>(null);
  const [copiedBackup, setCopiedBackup] = useState(false);

  // Backup Import State
  const [isImportingBackup, setIsImportingBackup] = useState(false);
  const [importProgress, setImportProgress] = useState<{ percent: number; status: string; fileName: string } | null>(null);
  const [importResult, setImportResult] = useState<BackupImportResult | null>(null);

  const handleExportBackup = async () => {
    setIsExportingBackup(true);
    setExportResult(null);
    setImportResult(null);
    setExportProgress({ percent: 15, status: 'Lokale Datenbank wird ausgelesen...' });
    setCopiedBackup(false);
    try {
      const res = await exportAppDataBackup((percent, status) => {
        setExportProgress({ percent, status });
      });
      setExportResult(res);
    } catch (err: any) {
      setExportResult({
        success: false,
        message: 'Fehler beim Export: ' + (err?.message || 'Unbekannter Fehler'),
        method: 'browser-download',
        fileName: '',
        itemCount: { questions: 0, flashcards: 0, glossary: 0, customCategories: 0 }
      });
    } finally {
      setIsExportingBackup(false);
      setTimeout(() => {
        setExportProgress(null);
      }, 1000);
    }
  };

  const handleCopyBackupToClipboard = async () => {
    try {
      let textToCopy = exportResult?.jsonStr;
      if (!textToCopy) {
        const db = await getDbData();
        textToCopy = JSON.stringify(db);
      }
      await navigator.clipboard.writeText(textToCopy);
      setCopiedBackup(true);
      setTimeout(() => setCopiedBackup(false), 2500);
    } catch (e) {
      console.error('Clipboard copy failed', e);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImportingBackup(true);
    setImportResult(null);
    setExportResult(null);
    setImportProgress({ 
      percent: 10, 
      status: `Import gestartet: Lese Datei „${file.name}“...`, 
      fileName: file.name 
    });

    try {
      const res = await importAppDataBackup(file, (percent, status) => {
        setImportProgress({ percent, status, fileName: file.name });
      });

      setImportResult(res);
      if (res.success) {
        onDataUpdated();
      }
    } catch (err: any) {
      setImportResult({
        success: false,
        message: err?.message || 'Fehler beim Importieren der Daten.',
        fileName: file.name
      });
    } finally {
      setIsImportingBackup(false);
      setTimeout(() => {
        setImportProgress(null);
      }, 1000);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Custom Category Actions
  const startEditCustom = (cat: Category) => {
    setEditingCustomId(cat.id);
    setEditCustomTitle(cat.title);
    setEditCustomDescription(cat.description);
  };

  const saveEditCustom = async (id: string) => {
    if (!editCustomTitle.trim()) return;
    await updateCustomCategory(id, { 
      title: editCustomTitle.trim(), 
      description: editCustomDescription.trim() 
    });
    setEditingCustomId(null);
    onDataUpdated();
  };

  const cancelEditCustom = () => {
    setEditingCustomId(null);
  };

  const handleDeleteCustom = (id: string) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Themenbereich löschen',
      message: 'Bist du sicher, dass du diesen Themenbereich wirklich löschen möchtest?',
      confirmLabel: 'Löschen',
      cancelLabel: 'Abbrechen',
      isDestructive: true,
      onConfirm: async () => {
        await deleteCustomCategory(id);
        onDataUpdated();
      }
    });
  };

  // Preset Category Actions
  const startEditPreset = (cat: Category, currentTitle: string, currentDescription: string, isHidden: boolean) => {
    setEditingPresetId(cat.id);
    setEditPresetTitle(currentTitle);
    setEditPresetDescription(currentDescription);
    setEditPresetHidden(isHidden);
  };

  const saveEditPreset = async (id: string) => {
    if (!editPresetTitle.trim()) return;
    await updatePresetCategory(id, {
      title: editPresetTitle.trim(),
      description: editPresetDescription.trim(),
      isHidden: editPresetHidden
    });
    setEditingPresetId(null);
    onDataUpdated();
  };

  const cancelEditPreset = () => {
    setEditingPresetId(null);
  };

  const handleTogglePresetVisibility = async (id: string, currentlyHidden: boolean) => {
    await updatePresetCategory(id, { isHidden: !currentlyHidden });
    onDataUpdated();
  };

  const handleResetPreset = (id: string) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Thema zurücksetzen',
      message: 'Möchtest du dieses Thema auf den Standard-Namen und die Standard-Beschreibung zurücksetzen?',
      confirmLabel: 'Zurücksetzen',
      cancelLabel: 'Abbrechen',
      isDestructive: false,
      onConfirm: async () => {
        await resetPresetCategory(id);
        onDataUpdated();
      }
    });
  };

  const handleResetAllPresets = () => {
    setConfirmConfig({
      isOpen: true,
      title: 'Alle Themen zurücksetzen',
      message: 'Möchtest du alle voreingestellten Themen auf ihre ursprünglichen Standardwerte zurücksetzen?',
      confirmLabel: 'Alle zurücksetzen',
      cancelLabel: 'Abbrechen',
      isDestructive: true,
      onConfirm: async () => {
        await resetAllPresetCategories();
        onDataUpdated();
      }
    });
  };

  const hasAnyPresetOverrides = Object.keys(presetOverrides).length > 0;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Voreingestellte Themen */}
      {DEFAULT_PRESET_CATEGORIES.length > 0 && (
      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <Sliders className="text-blue-600" size={24} />
              <h2 className="text-2xl font-bold text-slate-800">Voreingestellte Themen</h2>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Passe Namen und Beschreibungen der Standard-Themen für die Lernkartei an oder blende sie aus.
            </p>
          </div>
          {hasAnyPresetOverrides && (
            <button
              onClick={handleResetAllPresets}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              title="Alle auf Werkszustand zurücksetzen"
            >
              <RotateCcw size={14} /> Alle zurücksetzen
            </button>
          )}
        </div>

        <div className="space-y-3">
          {DEFAULT_PRESET_CATEGORIES.map((preset) => {
            const override = presetOverrides[preset.id];
            const currentTitle = (override?.title !== undefined && override.title.trim() !== '') 
              ? override.title 
              : preset.title;
            const currentDescription = override?.description !== undefined 
              ? override.description 
              : preset.description;
            const isModified = Boolean(
              (override?.title && override.title !== preset.title) || 
              (override?.description !== undefined && override.description !== preset.description)
            );
            const isHidden = Boolean(override?.isHidden);
            const isEditing = editingPresetId === preset.id;
            const Icon = iconMap[preset.iconName] || Folder;

            return (
              <div 
                key={preset.id} 
                className={`p-4 border rounded-2xl transition-all ${
                  isHidden 
                    ? 'border-slate-200 bg-slate-50/70 opacity-75' 
                    : isModified 
                      ? 'border-blue-200 bg-blue-50/30' 
                      : 'border-slate-200 bg-white'
                }`}
              >
                {isEditing ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                      <Icon size={18} />
                      <span>Standard-Thema bearbeiten: {preset.title}</span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Titel in der Lernkartei</label>
                      <input 
                        type="text" 
                        value={editPresetTitle}
                        onChange={(e) => setEditPresetTitle(e.target.value)}
                        className="w-full px-4 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="Titel..."
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Beschreibung</label>
                      <input 
                        type="text" 
                        value={editPresetDescription}
                        onChange={(e) => setEditPresetDescription(e.target.value)}
                        className="w-full px-4 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="Beschreibung..."
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <input 
                        type="checkbox" 
                        id={`hide-${preset.id}`}
                        checked={editPresetHidden}
                        onChange={(e) => setEditPresetHidden(e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                      />
                      <label htmlFor={`hide-${preset.id}`} className="text-sm text-slate-700 select-none cursor-pointer">
                        In der Lernkartei ausblenden
                      </label>
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                      <button 
                        onClick={cancelEditPreset} 
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        <X size={16} /> Abbrechen
                      </button>
                      <button 
                        onClick={() => saveEditPreset(preset.id)} 
                        className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
                      >
                        <Check size={16} /> Speichern
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`p-2.5 rounded-xl mt-0.5 shrink-0 ${
                        isHidden 
                          ? 'bg-slate-200 text-slate-500' 
                          : 'bg-blue-50 text-blue-600'
                      }`}>
                        <Icon size={20} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className={`font-bold text-base truncate ${isHidden ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
                            {currentTitle}
                          </h4>
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600">
                            Voreingestellt
                          </span>
                          {isModified && (
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-100 text-blue-700">
                              Geändert
                            </span>
                          )}
                          {isHidden && (
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-100 text-amber-800">
                              Ausgeblendet
                            </span>
                          )}
                        </div>
                        {currentDescription && (
                          <p className="text-sm text-slate-500 mt-0.5 truncate max-w-xl">
                            {currentDescription}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                      <button 
                        onClick={() => startEditPreset(preset, currentTitle, currentDescription, isHidden)}
                        className="p-2 text-blue-600 hover:bg-blue-100/60 rounded-lg transition-colors flex items-center gap-1 text-sm font-medium"
                        title="Thema umbenennen oder bearbeiten"
                      >
                        <Edit2 size={16} />
                        <span className="hidden md:inline">Bearbeiten</span>
                      </button>

                      <button 
                        onClick={() => handleTogglePresetVisibility(preset.id, isHidden)}
                        className={`p-2 rounded-lg transition-colors flex items-center gap-1 text-sm font-medium ${
                          isHidden 
                            ? 'text-amber-700 hover:bg-amber-100' 
                            : 'text-slate-500 hover:bg-slate-100'
                        }`}
                        title={isHidden ? "Thema wieder einblenden" : "Thema ausblenden"}
                      >
                        {isHidden ? <Eye size={16} /> : <EyeOff size={16} />}
                        <span className="hidden md:inline">{isHidden ? 'Einblenden' : 'Ausblenden'}</span>
                      </button>

                      {(isModified || isHidden) && (
                        <button 
                          onClick={() => handleResetPreset(preset.id)}
                          className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Auf Standard zurücksetzen"
                        >
                          <RotateCcw size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* Eigene Themenbereiche */}
      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Eigene Themenbereiche</h2>
            <p className="text-sm text-slate-500 mt-1">
              Erstelle neue eigene Kategorien für deine Lernkarten.
            </p>
          </div>
          <button 
            onClick={() => setShowAddCategory(!showAddCategory)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors shrink-0 shadow-sm"
          >
            <Plus size={16} /> Neues Thema
          </button>
        </div>

        {showAddCategory && (
          <div className="mb-6">
            <AddCategoryForm 
              onSuccess={() => {
                setShowAddCategory(false);
                onDataUpdated();
              }}
              onCancel={() => setShowAddCategory(false)}
            />
          </div>
        )}

        {customCategories.length === 0 ? (
          <div className="text-center py-8 px-4 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
            <p className="text-slate-500 font-medium">Noch keine eigenen Themenbereiche angelegt.</p>
            <p className="text-xs text-slate-400 mt-1">Klicke oben auf &quot;Neues Thema&quot;, um eine eigene Kategorie hinzuzufügen.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {customCategories.map((cat) => (
              <div key={cat.id} className="p-4 border border-slate-200 rounded-2xl bg-white transition-all">
                {editingCustomId === cat.id ? (
                  <div className="w-full space-y-3">
                    <input 
                      type="text" 
                      value={editCustomTitle}
                      onChange={(e) => setEditCustomTitle(e.target.value)}
                      className="w-full px-4 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="Titel..."
                    />
                    <input 
                      type="text" 
                      value={editCustomDescription}
                      onChange={(e) => setEditCustomDescription(e.target.value)}
                      className="w-full px-4 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="Beschreibung..."
                    />
                    <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
                      <button 
                        onClick={cancelEditCustom} 
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        <X size={16} /> Abbrechen
                      </button>
                      <button 
                        onClick={() => saveEditCustom(cat.id)} 
                        className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
                      >
                        <Check size={16} /> Speichern
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="p-2.5 rounded-xl mt-0.5 bg-indigo-50 text-indigo-600 shrink-0">
                        <Folder size={20} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-bold text-base text-slate-900 truncate">{cat.title}</h4>
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-50 text-indigo-700">
                            Benutzerdefiniert
                          </span>
                        </div>
                        {cat.description && (
                          <p className="text-sm text-slate-500 mt-0.5 truncate max-w-xl">{cat.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                      <button 
                        onClick={() => startEditCustom(cat)}
                        className="p-2 text-blue-600 hover:bg-blue-100/60 rounded-lg transition-colors flex items-center gap-1 text-sm font-medium"
                        title="Bearbeiten"
                      >
                        <Edit2 size={16} />
                        <span className="hidden md:inline">Bearbeiten</span>
                      </button>
                      <button 
                        onClick={() => handleDeleteCustom(cat.id)}
                        className="p-2 text-red-600 hover:bg-red-100/60 rounded-lg transition-colors flex items-center gap-1 text-sm font-medium"
                        title="Löschen"
                      >
                        <Trash2 size={16} />
                        <span className="hidden md:inline">Löschen</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* KI Foto-Scan Konfiguration (Direkter Gemini Modus) */}
      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Sparkles size={22} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800">KI Foto-Scan (Gemini)</h2>
              <p className="text-xs text-slate-500">
                Direkte Erkennung auf deinem Smartphone — 100 % autark, ohne PC oder Server
              </p>
            </div>
          </div>
          <div className="hidden sm:block">
            {getStoredGeminiApiKey() ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-semibold">
                <CheckCircle2 size={13} />
                <span>Eigener Schlüssel Aktiv</span>
              </span>
            ) : serverGeminiStatus?.serverKeyAvailable ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-semibold">
                <Sparkles size={13} />
                <span>Cloud-KI Bereit</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-500 rounded-full text-xs font-medium">
                Nicht eingerichtet
              </span>
            )}
          </div>
        </div>

        {serverGeminiStatus?.serverKeyAvailable && (
          <div className="mb-4 p-3.5 bg-blue-50/80 border border-blue-200 rounded-2xl flex items-start gap-2.5 text-xs text-blue-900 leading-relaxed">
            <Sparkles size={16} className="text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-0.5">Cloud-Server KI ist aktiv ({serverGeminiStatus.model || 'Gemini 3.8 Flash'})</p>
              <p className="text-blue-700">
                Der KI Foto-Scan funktioniert in dieser Web-Version bereits direkt und kostenlos! Du musst hier keinen eigenen Schlüssel eingeben, es sei denn, du möchtest dein persönliches Google Cloud Kontingent oder die Android App offline nutzen.
              </p>
            </div>
          </div>
        )}

        <p className="text-sm text-slate-600 mb-5 leading-relaxed">
          Mit einem persönlichen Google Gemini API-Schlüssel scannt die App Fotos von Karteikarten, Heften und Multiple-Choice-Fragen direkt auf deinem Smartphone und wandelt sie automatisch in Lernsets um.
        </p>

        <div className="bg-gradient-to-br from-blue-50/70 to-slate-50 border border-blue-100 rounded-2xl p-5 mb-5">
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
            Google Gemini API-Schlüssel:
          </label>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input 
                type={showApiKey ? 'text' : 'password'}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full px-4 py-3 pr-11 bg-white border border-slate-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                title={showApiKey ? 'Ausblenden' : 'Anzeigen'}
              >
                {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={handleTestAndSaveApiKey}
                disabled={testingApiKey}
                className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 shadow-sm"
              >
                {testingApiKey ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                <span>Prüfen & Speichern</span>
              </button>
              {getStoredGeminiApiKey() && (
                <button
                  onClick={handleClearApiKey}
                  className="p-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl border border-red-200 transition-colors"
                  title="Schlüssel entfernen"
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          </div>

          {savedApiKeyFeedback && (
            <div className="mt-3 text-xs text-emerald-700 flex items-center gap-1.5 font-medium">
              <CheckCircle2 size={14} className="text-emerald-600" />
              <span>API-Schlüssel erfolgreich gespeichert! Foto-Scan ist sofort einsatzbereit.</span>
            </div>
          )}

          {apiKeyTestResult && (
            <div className={`mt-3 p-3 rounded-xl text-xs flex items-start gap-2.5 ${
              apiKeyTestResult.ok 
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {apiKeyTestResult.ok ? (
                <CheckCircle2 size={16} className="shrink-0 text-emerald-600 mt-0.5" />
              ) : (
                <AlertCircle size={16} className="shrink-0 text-red-600 mt-0.5" />
              )}
              <div className="leading-relaxed">
                <span className="font-semibold">{apiKeyTestResult.ok ? 'Erfolg: ' : 'Hinweis: '}</span>
                {apiKeyTestResult.message}
              </div>
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
            <span>Noch keinen Schlüssel? Kostenlos mit Google-Konto in 1 Minute erstellen:</span>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold"
            >
              <span>aistudio.google.com/app/apikey</span>
              <ExternalLink size={13} />
            </a>
          </div>
        </div>

        {/* Optionaler lokaler Server-Fallback */}
        <div>
          <button
            onClick={() => setShowAdvancedServer(!showAdvancedServer)}
            className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1.5 font-medium"
          >
            <Server size={13} />
            <span>{showAdvancedServer ? 'Lokale Server-Einstellungen ausblenden' : 'Erweiterte Server-Einstellungen anzeigen (Optional)'}</span>
          </button>

          {showAdvancedServer && (
            <div className="mt-3 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-600">
              <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-2">
                Eigener Backend-Server (URL):
              </label>
              <div className="flex flex-col sm:flex-row gap-2 mb-2">
                <input 
                  type="text" 
                  value={serverUrlInput}
                  onChange={(e) => setServerUrlInput(e.target.value)}
                  placeholder="z. B. http://192.168.178.50:3000"
                  className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleTestServer}
                    disabled={testingServer}
                    className="bg-slate-200 hover:bg-slate-300 px-3 py-2 rounded-lg font-medium"
                  >
                    Testen
                  </button>
                  <button
                    onClick={handleSaveServer}
                    className="bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded-lg font-medium"
                  >
                    Speichern
                  </button>
                </div>
              </div>
              {serverTestResult && (
                <div className={`p-2 rounded text-xs ${serverTestResult.ok ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'}`}>
                  {serverTestResult.message}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Datenverwaltung */}
      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200">
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Datenverwaltung</h2>
        <p className="text-sm text-slate-500 mb-6">
          Sichere deine Fragen, Lernkarten und angepassten Themenbereiche oder stelle sie aus einem Backup wieder her.
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <button 
            onClick={handleExportBackup}
            disabled={isExportingBackup || isImportingBackup}
            className="flex-1 flex items-center justify-center gap-3 bg-blue-50 text-blue-700 px-6 py-4 rounded-2xl font-semibold hover:bg-blue-100 transition-colors border border-blue-200 text-left disabled:opacity-60"
          >
            {isExportingBackup ? (
              <Loader2 size={22} className="shrink-0 animate-spin text-blue-600" />
            ) : (
              <Download size={22} className="shrink-0" />
            )}
            <div>
              <div className="font-bold text-slate-900">
                {isExportingBackup ? 'Backup wird erstellt...' : 'Backup exportieren'}
              </div>
              <div className="text-xs text-slate-500 font-normal">
                Funktioniert auch in der Android APK (Speichern & Teilen)
              </div>
            </div>
          </button>

          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isExportingBackup || isImportingBackup}
            className="flex-1 flex items-center justify-center gap-3 bg-indigo-50 text-indigo-700 px-6 py-4 rounded-2xl font-semibold hover:bg-indigo-100 transition-colors border border-indigo-200 text-left disabled:opacity-60"
          >
            {isImportingBackup ? (
              <Loader2 size={22} className="shrink-0 animate-spin text-indigo-600" />
            ) : (
              <Upload size={22} className="shrink-0" />
            )}
            <div>
              <div className="font-bold text-slate-900">
                {isImportingBackup ? 'Backup wird importiert...' : 'Backup importieren'}
              </div>
              <div className="text-xs text-slate-500 font-normal">Gespeicherte JSON-Datei einlesen</div>
            </div>
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImport} 
            disabled={isExportingBackup || isImportingBackup}
            hidden 
            accept=".json,application/json,text/plain" 
          />
        </div>

        {/* Ladebalken für Backup-Export */}
        {exportProgress && (
          <div className="mt-4 p-4 rounded-2xl bg-blue-50/90 border border-blue-200 animate-in fade-in duration-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Loader2 size={16} className="text-blue-600 animate-spin shrink-0" />
                <span className="font-bold text-sm text-blue-900">Export wird ausgeführt...</span>
              </div>
              <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                {exportProgress.percent}%
              </span>
            </div>
            {/* Progress Track */}
            <div className="w-full bg-blue-200/80 rounded-full h-2.5 overflow-hidden">
              <div 
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out shadow-xs"
                style={{ width: `${Math.max(5, exportProgress.percent)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-blue-800 font-medium">
              {exportProgress.status}
            </p>
          </div>
        )}

        {/* Ladebalken für Backup-Import */}
        {importProgress && (
          <div className="mt-4 p-4 rounded-2xl bg-indigo-50/90 border border-indigo-200 animate-in fade-in duration-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Loader2 size={16} className="text-indigo-600 animate-spin shrink-0" />
                <span className="font-bold text-sm text-indigo-900">Import gestartet...</span>
              </div>
              <span className="text-xs font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
                {importProgress.percent}%
              </span>
            </div>
            {/* Progress Track */}
            <div className="w-full bg-indigo-200/80 rounded-full h-2.5 overflow-hidden">
              <div 
                className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300 ease-out shadow-xs"
                style={{ width: `${Math.max(5, importProgress.percent)}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-xs text-indigo-800">
              <span className="font-medium">{importProgress.status}</span>
              {importProgress.fileName && (
                <span className="truncate max-w-[200px] text-indigo-600 font-mono text-[11px] bg-indigo-100/60 px-1.5 py-0.5 rounded">
                  {importProgress.fileName}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Import Feedback / Result details */}
        {importResult && (
          <div className={`mt-4 p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-200 ${importResult.success ? 'bg-emerald-50/90 border-emerald-200 text-emerald-950' : 'bg-red-50 border-red-200 text-red-950'}`}>
            <div className="flex items-start gap-3">
              {importResult.success ? (
                <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle size={20} className="text-red-600 shrink-0 mt-0.5" />
              )}
              <div className="text-xs">
                <p className="font-bold text-sm mb-0.5">
                  {importResult.success ? 'Backup erfolgreich wiederhergestellt' : 'Fehler beim Import'}
                </p>
                <p className="opacity-90">{importResult.message}</p>
                {importResult.success && importResult.itemCount && (
                  <p className="mt-1 text-slate-600 font-medium">
                    Wiederhergestellt: {importResult.itemCount.flashcards} Lernkarten, {importResult.itemCount.glossary} Fachbegriffe
                    {importResult.itemCount.customCategories ? `, ${importResult.itemCount.customCategories} eigene Themenbereiche` : ''}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              <button
                type="button"
                onClick={() => setImportResult(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-white/50 transition-colors"
                title="Schließen"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Export Feedback / Success details */}
        {exportResult && (
          <div className={`mt-4 p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-200 ${exportResult.success ? 'bg-emerald-50/90 border-emerald-200 text-emerald-950' : 'bg-red-50 border-red-200 text-red-950'}`}>
            <div className="flex items-start gap-3">
              {exportResult.success ? (
                <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle size={20} className="text-red-600 shrink-0 mt-0.5" />
              )}
              <div className="text-xs">
                <p className="font-bold text-sm mb-0.5">
                  {exportResult.success ? 'Backup erfolgreich gesichert' : 'Hinweis zum Export'}
                </p>
                <p className="opacity-90">{exportResult.message}</p>
                {exportResult.success && exportResult.itemCount && (
                  <p className="mt-1 text-slate-600 font-medium">
                    Gesichert: {exportResult.itemCount.flashcards} Lernkarten, {exportResult.itemCount.glossary} Fachbegriffe
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              {exportResult.success && (
                <button
                  type="button"
                  onClick={handleCopyBackupToClipboard}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-semibold shadow-2xs transition-colors"
                  title="Als JSON-Text in die Zwischenablage kopieren"
                >
                  <Copy size={13} />
                  <span>{copiedBackup ? 'Kopiert!' : 'JSON kopieren'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setExportResult(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-white/50 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-slate-700">Werkseinstellung wiederherstellen</div>
            <div className="text-xs text-slate-500">Entfernt alle hinterlegten Daten: alle Lernkarten, das gesamte Glossar, alle Schwimmzeiten, Trainingsplan-Fortschritte (auf 0) und alle Dokumente im Archiv.</div>
          </div>
          <button
            onClick={() => {
              setConfirmConfig({
                isOpen: true,
                title: 'Werkseinstellung wiederherstellen',
                message: 'Achtung: Möchtest du die Anwendung wirklich komplett auf Werkseinstellung zurücksetzen?\n\nDadurch werden:\n• Alle Lernkarten unwiderruflich gelöscht\n• Das gesamte Glossar geleert\n• Alle erfassten Schwimmzeiten entfernt\n• Der Fortschritt des Trainingsplans auf 0 gesetzt\n• Alle hinterlegten Dokumente im Datei-Archiv gelöscht\n\nMöchtest du fortfahren?',
                confirmLabel: 'Alles unwiderruflich löschen & zurücksetzen',
                cancelLabel: 'Abbrechen',
                isDestructive: true,
                onConfirm: async () => {
                  await resetToFactoryDefaults();
                  onDataUpdated();
                }
              });
            }}
            className="text-xs text-red-600 hover:text-red-700 font-semibold px-4 py-2 bg-red-50 hover:bg-red-100 rounded-xl border border-red-200 transition-colors shrink-0"
          >
            Werkseinstellung wiederherstellen
          </button>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmModal
        config={confirmConfig}
        onClose={() => setConfirmConfig(null)}
      />
    </div>
  );
}
