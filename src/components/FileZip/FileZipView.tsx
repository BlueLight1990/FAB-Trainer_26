import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Archive, Download, UploadCloud, FileText, Image as ImageIcon, 
  Trash2, Eye, CheckSquare, Square, Search, RefreshCw, File, 
  FolderArchive, Check, X, ExternalLink, Plus, Filter, 
  Grid, List, Info, AlertCircle, ArrowUpDown, ChevronRight,
  HardDrive, Layers, BookA, Sparkles
} from 'lucide-react';
import { AppFileItem, CustomUploadedFile } from '../../types';
import { 
  getDbData, 
  saveCustomUploadedFile, 
  saveMultipleCustomUploadedFiles, 
  deleteCustomUploadedFile, 
  updateCustomUploadedFile 
} from '../../lib/db';
import { 
  collectAllAppFiles, 
  formatFileSize, 
  downloadOriginalFile, 
  exportFilesAsZip,
  detectFileType,
  getFileContentFingerprint,
  getFileNameSizeKey
} from '../../lib/fileZipUtils';
import { PdfViewerModal } from '../PdfViewerModal';
import { PdfThumbnail } from './PdfThumbnail';

interface Props {
  mode?: 'learn' | 'edit';
}

type FilterType = 'all' | 'pdf' | 'image' | 'manual' | 'glossary' | 'flashcards';
type SortOrder = 'date_desc' | 'date_asc' | 'name_asc' | 'name_desc' | 'size_desc' | 'size_asc';
type ViewLayout = 'grid' | 'list';

export const FileZipView: React.FC<Props> = ({ mode = 'learn' }) => {
  const [allFiles, setAllFiles] = useState<AppFileItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('date_desc');
  const [viewLayout, setViewLayout] = useState<ViewLayout>('grid');

  // Multi-selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modals & Viewers
  const [pdfViewerModal, setPdfViewerModal] = useState<{ url: string; name: string; termTitle: string } | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string; subtitle?: string } | null>(null);
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [deleteConfirmFile, setDeleteConfirmFile] = useState<AppFileItem | null>(null);

  // ZIP progress state
  const [zipProgress, setZipProgress] = useState<{ active: boolean; percent: number; statusText: string } | null>(null);
  const [zipSuccessMessage, setZipSuccessMessage] = useState<string | null>(null);
  const [zipErrorMessage, setZipErrorMessage] = useState<string | null>(null);

  // Drag and drop zone state
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dropZoneFileInputRef = useRef<HTMLInputElement | null>(null);

  // Manual Upload Form States
  const [uploadFilesQueue, setUploadFilesQueue] = useState<{
    file: File;
    name: string;
    description: string;
    dataUrl: string;
    size: number;
    type: 'pdf' | 'image' | 'other';
    mimeType: string;
  }[]>([]);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  // Load all app files
  const loadFiles = async () => {
    try {
      setIsLoading(true);
      const db = await getDbData();
      const files = collectAllAppFiles(db);
      setAllFiles(files);
    } catch (err) {
      console.error('Fehler beim Laden der Dateien:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  // Filter & Search
  const filteredFiles = useMemo(() => {
    let result = [...allFiles];

    // Filter by category/type
    if (activeFilter === 'pdf') {
      result = result.filter(f => f.type === 'pdf');
    } else if (activeFilter === 'image') {
      result = result.filter(f => f.type === 'image');
    } else if (activeFilter === 'manual') {
      result = result.filter(f => f.source === 'manual' || f.allSources?.some(s => s.source === 'manual'));
    } else if (activeFilter === 'glossary') {
      result = result.filter(f => f.source.startsWith('glossary') || f.allSources?.some(s => s.source.startsWith('glossary')));
    } else if (activeFilter === 'flashcards') {
      result = result.filter(f => f.source === 'flashcard_image' || f.allSources?.some(s => s.source === 'flashcard_image'));
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(f => 
        f.name.toLowerCase().includes(q) || 
        f.sourceTitle.toLowerCase().includes(q) || 
        (f.allSources && f.allSources.some(s => s.sourceTitle.toLowerCase().includes(q))) ||
        (f.description && f.description.toLowerCase().includes(q))
      );
    }

    // Sorting
    result.sort((a, b) => {
      switch (sortOrder) {
        case 'name_asc':
          return a.name.localeCompare(b.name, 'de', { sensitivity: 'base' });
        case 'name_desc':
          return b.name.localeCompare(a.name, 'de', { sensitivity: 'base' });
        case 'size_desc':
          return (b.size || 0) - (a.size || 0);
        case 'size_asc':
          return (a.size || 0) - (b.size || 0);
        case 'date_asc':
          return (a.uploadedAt || 0) - (b.uploadedAt || 0);
        case 'date_desc':
        default:
          return (b.uploadedAt || 0) - (a.uploadedAt || 0);
      }
    });

    return result;
  }, [allFiles, activeFilter, searchQuery, sortOrder]);

  // Overall Statistics
  const stats = useMemo(() => {
    const totalCount = allFiles.length;
    const totalBytes = allFiles.reduce((acc, f) => acc + (f.size || 0), 0);
    const pdfCount = allFiles.filter(f => f.type === 'pdf').length;
    const imageCount = allFiles.filter(f => f.type === 'image').length;
    const manualCount = allFiles.filter(f => f.source === 'manual' || f.allSources?.some(s => s.source === 'manual')).length;
    return { totalCount, totalBytes, pdfCount, imageCount, manualCount };
  }, [allFiles]);

  // Selection Handlers
  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    const allFilteredSelected = filteredFiles.every(f => selectedIds.has(f.id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredFiles.forEach(f => next.delete(f.id));
      } else {
        filteredFiles.forEach(f => next.add(f.id));
      }
      return next;
    });
  };

  const handleSelectOnlyPdfs = () => {
    setSelectedIds(new Set(allFiles.filter(f => f.type === 'pdf').map(f => f.id)));
  };

  const handleSelectOnlyImages = () => {
    setSelectedIds(new Set(allFiles.filter(f => f.type === 'image').map(f => f.id)));
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  // Download Individual File
  const handleDownloadSingle = async (file: AppFileItem) => {
    try {
      await downloadOriginalFile(file);
    } catch (err: any) {
      alert(`Fehler beim Herunterladen von ${file.name}: ${err.message || err}`);
    }
  };

  // ZIP Downloads
  const handleDownloadAllAsZip = async () => {
    if (allFiles.length === 0) return;
    try {
      setZipErrorMessage(null);
      setZipProgress({ active: true, percent: 5, statusText: 'Starte ZIP-Erstellung für alle Dateien...' });
      
      const dateStr = new Date().toISOString().split('T')[0];
      const res = await exportFilesAsZip(allFiles, {
        zipFileName: `FAB_Alle_Dateien_Archiv_${dateStr}.zip`,
        organizeFolders: true,
        onProgress: (percent, statusText) => {
          setZipProgress({ active: true, percent, statusText });
        }
      });

      setZipSuccessMessage(`ZIP-Archiv mit allen ${res.count} Dateien (${formatFileSize(res.totalBytes)}) erfolgreich erstellt!`);
      setTimeout(() => setZipSuccessMessage(null), 4000);
    } catch (err: any) {
      setZipErrorMessage(`Fehler beim Erstellen der ZIP-Datei: ${err.message || err}`);
    } finally {
      setZipProgress(null);
    }
  };

  const handleDownloadSelectedAsZip = async () => {
    const selectedFiles = allFiles.filter(f => selectedIds.has(f.id));
    if (selectedFiles.length === 0) return;

    try {
      setZipErrorMessage(null);
      setZipProgress({ active: true, percent: 5, statusText: `Packe ${selectedFiles.length} ausgewählte Dateien...` });
      
      const dateStr = new Date().toISOString().split('T')[0];
      const res = await exportFilesAsZip(selectedFiles, {
        zipFileName: `FAB_Auswahl_Dateien_${selectedFiles.length}_Stueck_${dateStr}.zip`,
        organizeFolders: true,
        onProgress: (percent, statusText) => {
          setZipProgress({ active: true, percent, statusText });
        }
      });

      setZipSuccessMessage(`ZIP-Archiv mit ${res.count} ausgewählten Dateien (${formatFileSize(res.totalBytes)}) erfolgreich erstellt!`);
      setTimeout(() => setZipSuccessMessage(null), 4000);
    } catch (err: any) {
      setZipErrorMessage(`Fehler beim Erstellen der ZIP-Datei: ${err.message || err}`);
    } finally {
      setZipProgress(null);
    }
  };

  // File Upload Handlers
  const handleFilesSelected = async (filesList: FileList | null) => {
    if (!filesList || filesList.length === 0) return;

    const newEntries: typeof uploadFilesQueue = [];
    let skippedDuplicatesCount = 0;

    for (let i = 0; i < filesList.length; i++) {
      const file = filesList[i];
      const reader = new FileReader();

      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const detected = detectFileType(file.name, dataUrl);
      const fp = getFileContentFingerprint(dataUrl);
      const nameKey = getFileNameSizeKey(file.name, file.size, detected.type);

      // Check if already in allFiles
      const alreadyInAllFiles = allFiles.some(f => 
        (fp && getFileContentFingerprint(f.dataUrl) === fp) ||
        getFileNameSizeKey(f.name, f.size, f.type) === nameKey
      );

      // Check if already in newEntries queue or uploadFilesQueue
      const alreadyInQueue = uploadFilesQueue.concat(newEntries).some(q => 
        (fp && getFileContentFingerprint(q.dataUrl) === fp) ||
        getFileNameSizeKey(q.name, q.size, q.type) === nameKey
      );

      if (alreadyInAllFiles || alreadyInQueue) {
        skippedDuplicatesCount++;
        continue;
      }

      newEntries.push({
        file,
        name: file.name,
        description: '',
        dataUrl,
        size: file.size,
        type: detected.type,
        mimeType: file.type || detected.mimeType
      });
    }

    if (skippedDuplicatesCount > 0) {
      setZipSuccessMessage(
        `${skippedDuplicatesCount} Datei(en) wurden übersprungen, da sie bereits im Archiv vorhanden sind (keine Duplikate).`
      );
      setTimeout(() => setZipSuccessMessage(null), 4000);
    }

    if (newEntries.length > 0) {
      setUploadFilesQueue(prev => [...prev, ...newEntries]);
      setShowUploadModal(true);
    }
  };

  const handleCommitUploadQueue = async () => {
    if (uploadFilesQueue.length === 0) return;

    try {
      setIsUploading(true);
      const customFiles: CustomUploadedFile[] = uploadFilesQueue.map(item => ({
        id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: item.name.trim() || item.file.name,
        dataUrl: item.dataUrl,
        type: item.type,
        mimeType: item.mimeType,
        size: item.size,
        uploadedAt: Date.now(),
        description: item.description.trim() || undefined
      }));

      const res = await saveMultipleCustomUploadedFiles(customFiles);
      await loadFiles();
      setUploadFilesQueue([]);
      setShowUploadModal(false);

      if (res.skipped > 0) {
        setZipSuccessMessage(`${res.added} Datei(en) gespeichert (${res.skipped} Duplikat(e) übersprungen).`);
      } else {
        setZipSuccessMessage(`${res.added} Datei(en) erfolgreich hochgeladen und gesichert!`);
      }
      setTimeout(() => setZipSuccessMessage(null), 3500);
    } catch (err: any) {
      alert(`Fehler beim Speichern: ${err.message || err}`);
    } finally {
      setIsUploading(false);
    }
  };

  // Drag and drop on main area
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleFilesSelected(e.dataTransfer.files);
    }
  };

  // Delete manual file
  const handleDeleteManualFile = async (file: AppFileItem) => {
    if (file.source !== 'manual' || !file.sourceId) return;
    try {
      await deleteCustomUploadedFile(file.sourceId);
      await loadFiles();
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(file.id);
        return next;
      });
      setDeleteConfirmFile(null);
    } catch (err: any) {
      alert(`Fehler beim Löschen: ${err.message || err}`);
    }
  };

  // Open Preview (PDF or Image)
  const handlePreviewFile = (file: AppFileItem) => {
    if (file.type === 'pdf') {
      setPdfViewerModal({
        url: file.dataUrl,
        name: file.name,
        termTitle: file.sourceTitle
      });
    } else if (file.type === 'image') {
      setLightboxImage({
        url: file.dataUrl,
        title: file.name,
        subtitle: file.sourceTitle
      });
    } else {
      // Fallback: download
      handleDownloadSingle(file);
    }
  };

  const isAllFilteredSelected = filteredFiles.length > 0 && filteredFiles.every(f => selectedIds.has(f.id));
  const someSelected = selectedIds.size > 0;

  return (
    <div 
      className="space-y-6"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden file inputs */}
      <input 
        type="file" 
        ref={fileInputRef}
        multiple 
        onChange={(e) => handleFilesSelected(e.target.files)} 
        className="hidden" 
        accept="application/pdf,image/*,.pdf,.png,.jpg,.jpeg,.webp,.svg,.doc,.docx"
      />
      <input 
        type="file" 
        ref={dropZoneFileInputRef}
        multiple 
        onChange={(e) => handleFilesSelected(e.target.files)} 
        className="hidden" 
        accept="application/pdf,image/*,.pdf,.png,.jpg,.jpeg,.webp,.svg,.doc,.docx"
      />

      {/* Drag & Drop Visual Overlay */}
      {isDraggingOver && (
        <div className="fixed inset-0 z-50 bg-blue-600/20 backdrop-blur-xs border-4 border-dashed border-blue-500 rounded-3xl m-4 flex flex-col items-center justify-center pointer-events-none transition-all">
          <div className="bg-white p-6 rounded-3xl shadow-2xl flex flex-col items-center gap-3">
            <UploadCloud size={48} className="text-blue-600 animate-bounce" />
            <p className="text-base font-bold text-slate-800">Dateien jetzt loslassen zum Hochladen</p>
            <p className="text-xs text-slate-500">PDFs, Bilder &amp; Dokumente werden hinzugefügt</p>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="relative bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute right-10 bottom-6 opacity-10 pointer-events-none hidden md:block">
          <FolderArchive size={160} />
        </div>

        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/20 border border-blue-400/30 rounded-full text-xs font-semibold text-blue-200 mb-3 shadow-2xs">
            <Archive size={14} className="text-blue-400" />
            <span>Datei- &amp; Medien-Zentrale</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-2">
            Datei Zip &amp; Dokumenten-Archiv
          </h1>

          <p className="text-sm sm:text-base text-slate-300 leading-relaxed mb-6">
            Hier findest du alle im Glossar, den Lernkarten und manuell hochgeladenen PDF-Dokumente und Abbildungen gebündelt. 
            Lade Dateien einzeln als Original herunter, wähle gezielt Inhalte für ein ZIP-Archiv aus oder sichere alle Daten mit einem Klick.
          </p>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-3">
              <span className="text-xs text-slate-300 block">Gesamtdateien</span>
              <span className="text-lg sm:text-xl font-black text-white">{stats.totalCount}</span>
              <span className="text-[11px] text-blue-200 block truncate">({formatFileSize(stats.totalBytes)})</span>
            </div>
            <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-3">
              <span className="text-xs text-slate-300 block">PDF-Dokumente</span>
              <span className="text-lg sm:text-xl font-black text-white">{stats.pdfCount}</span>
              <span className="text-[11px] text-blue-200 block">Merkblätter &amp; DIN</span>
            </div>
            <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-3">
              <span className="text-xs text-slate-300 block">Abbildungen</span>
              <span className="text-lg sm:text-xl font-black text-white">{stats.imageCount}</span>
              <span className="text-[11px] text-blue-200 block">Grafiken &amp; Fotos</span>
            </div>
            <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-3">
              <span className="text-xs text-slate-300 block">Manuelle Uploads</span>
              <span className="text-lg sm:text-xl font-black text-white">{stats.manualCount}</span>
              <span className="text-[11px] text-blue-200 block">Eigene Dateien</span>
            </div>
          </div>
        </div>
      </div>

      {/* Global ZIP & Upload Action Toolbar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Left: Upload and Refresh */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold transition-colors shadow-2xs cursor-pointer"
          >
            <UploadCloud size={16} />
            <span>Dateien hochladen</span>
          </button>

          <button
            type="button"
            onClick={loadFiles}
            className="p-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer"
            title="Dateiliste aktualisieren"
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin text-blue-600' : ''} />
          </button>
        </div>

        {/* Right: ZIP Export buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Download Selected as ZIP */}
          <button
            type="button"
            disabled={!someSelected || zipProgress?.active}
            onClick={handleDownloadSelectedAsZip}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-2xs ${
              someSelected
                ? 'bg-purple-600 hover:bg-purple-700 text-white cursor-pointer ring-2 ring-purple-300/50'
                : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
            }`}
            title={someSelected ? `${selectedIds.size} ausgewählte Dateien als ZIP laden` : 'Bitte markiere mindestens eine Datei'}
          >
            <FolderArchive size={16} />
            <span>Auswahl als ZIP ({selectedIds.size})</span>
          </button>

          {/* Download ALL as ZIP */}
          <button
            type="button"
            disabled={allFiles.length === 0 || zipProgress?.active}
            onClick={handleDownloadAllAsZip}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-2xs ${
              allFiles.length > 0
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
            }`}
            title={`Alle ${allFiles.length} Dateien in einem strukturierten ZIP-Archiv bündeln`}
          >
            <Download size={16} />
            <span>Alle als ZIP ({allFiles.length})</span>
          </button>
        </div>
      </div>

      {/* ZIP Progress / Feedback Banner */}
      {zipProgress && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 shadow-sm animate-in fade-in">
          <div className="flex items-center justify-between text-xs font-bold text-blue-900 mb-1.5">
            <span className="flex items-center gap-2">
              <RefreshCw size={14} className="animate-spin text-blue-600" />
              {zipProgress.statusText}
            </span>
            <span>{zipProgress.percent}%</span>
          </div>
          <div className="w-full bg-blue-200/80 rounded-full h-2 overflow-hidden">
            <div 
              className="bg-blue-600 h-full transition-all duration-200 ease-out rounded-full"
              style={{ width: `${zipProgress.percent}%` }}
            />
          </div>
        </div>
      )}

      {zipSuccessMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-3.5 flex items-center justify-between gap-3 text-xs sm:text-sm font-semibold shadow-2xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <Check size={18} className="text-emerald-600 shrink-0" />
            <span>{zipSuccessMessage}</span>
          </div>
          <button 
            onClick={() => setZipSuccessMessage(null)}
            className="text-emerald-500 hover:text-emerald-800 p-1"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {zipErrorMessage && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-3.5 flex items-center justify-between gap-3 text-xs sm:text-sm font-semibold shadow-2xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} className="text-rose-600 shrink-0" />
            <span>{zipErrorMessage}</span>
          </div>
          <button 
            onClick={() => setZipErrorMessage(null)}
            className="text-rose-500 hover:text-rose-800 p-1"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Filter Tabs & Search Controls */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-3">
        {/* Top line: Search and View Layout */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search box */}
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Dateiname, Fachbegriff oder Lernkarte suchen..."
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Sort & Layout */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Sort order select */}
            <div className="relative">
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                className="appearance-none bg-slate-50 border border-slate-200 rounded-xl pl-3 pr-7 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="date_desc">Neueste zuerst</option>
                <option value="date_asc">Älteste zuerst</option>
                <option value="name_asc">Name (A–Z)</option>
                <option value="name_desc">Name (Z–A)</option>
                <option value="size_desc">Größe (Groß zuerst)</option>
                <option value="size_asc">Größe (Klein zuerst)</option>
              </select>
              <ArrowUpDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>

            {/* Layout switch */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setViewLayout('grid')}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${viewLayout === 'grid' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
                title="Kartenansicht"
              >
                <Grid size={15} />
              </button>
              <button
                type="button"
                onClick={() => setViewLayout('list')}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${viewLayout === 'list' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
                title="Tabellenansicht"
              >
                <List size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex space-x-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
          {[
            { id: 'all', label: 'Alle Dateien', count: allFiles.length },
            { id: 'pdf', label: 'PDFs', count: stats.pdfCount },
            { id: 'image', label: 'Bilder', count: stats.imageCount },
            { id: 'manual', label: 'Manuell hochgeladen', count: stats.manualCount },
            { id: 'glossary', label: 'Glossar', count: allFiles.filter(f => f.source.startsWith('glossary') || f.allSources?.some(s => s.source.startsWith('glossary'))).length },
            { id: 'flashcards', label: 'Lernkartei', count: allFiles.filter(f => f.source === 'flashcard_image' || f.allSources?.some(s => s.source === 'flashcard_image')).length }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id as FilterType)}
              className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 ${
                activeFilter === tab.id
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-bold ${
                activeFilter === tab.id ? 'bg-blue-700 text-blue-100' : 'bg-slate-200 text-slate-700'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Multi-Selection Control Bar */}
      <div className="bg-slate-100/90 border border-slate-200 rounded-2xl px-4 py-2.5 flex items-center justify-between gap-3 text-xs flex-wrap">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700 hover:text-blue-600 select-none">
            <input 
              type="checkbox"
              checked={isAllFilteredSelected}
              onChange={handleSelectAllFiltered}
              className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
            />
            <span>
              {isAllFilteredSelected 
                ? 'Alle in Ansicht abwählen' 
                : `Alle ${filteredFiles.length} in Ansicht auswählen`}
            </span>
          </label>

          <span className="text-slate-300">|</span>

          <span className="text-slate-500">
            <strong className="text-blue-600 font-bold">{selectedIds.size}</strong> von {allFiles.length} Dateien ausgewählt
          </span>
        </div>

        <div className="flex items-center gap-2">
          {stats.pdfCount > 0 && (
            <button
              type="button"
              onClick={handleSelectOnlyPdfs}
              className="px-2 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-[11px] font-medium transition-colors cursor-pointer"
            >
              Nur PDFs
            </button>
          )}
          {stats.imageCount > 0 && (
            <button
              type="button"
              onClick={handleSelectOnlyImages}
              className="px-2 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-[11px] font-medium transition-colors cursor-pointer"
            >
              Nur Bilder
            </button>
          )}
          {someSelected && (
            <button
              type="button"
              onClick={handleClearSelection}
              className="px-2 py-1 text-rose-600 hover:bg-rose-50 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
            >
              Auswahl aufheben
            </button>
          )}
        </div>
      </div>

      {/* Files Display Area */}
      {isLoading ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-xs">
          <RefreshCw size={28} className="animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-700">Lade alle Dateien...</p>
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="bg-white rounded-3xl p-10 text-center border border-dashed border-slate-300 shadow-xs">
          <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-100 shadow-2xs">
            <FolderArchive size={28} />
          </div>
          <h3 className="text-base font-bold text-slate-800 mb-1">
            Keine Dateien gefunden
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mb-5">
            {searchQuery 
              ? `Keine Suchergebnisse für „${searchQuery}“. Versuche einen anderen Suchbegriff.`
              : 'Es wurden noch keine Dateien oder PDFs hochgeladen. Ziehe Dateien per Drag & Drop hierher oder klicke auf Hochladen.'}
          </p>
          <button
            type="button"
            onClick={() => dropZoneFileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-2xs"
          >
            <UploadCloud size={15} />
            <span>Jetzt erste Datei hochladen</span>
          </button>
        </div>
      ) : viewLayout === 'grid' ? (
        /* GRID CARDS VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredFiles.map(file => {
            const isSelected = selectedIds.has(file.id);
            const isPdf = file.type === 'pdf';
            const isImage = file.type === 'image';

            return (
              <div
                key={file.id}
                className={`group bg-white rounded-2xl border transition-all duration-150 flex flex-col justify-between overflow-hidden shadow-2xs hover:shadow-md ${
                  isSelected 
                    ? 'border-blue-500 ring-2 ring-blue-500/30 bg-blue-50/10' 
                    : 'border-slate-200/90 hover:border-blue-300'
                }`}
              >
                {/* Card Top / Preview Banner */}
                <div className="relative aspect-4/3 bg-slate-100 flex items-center justify-center overflow-hidden border-b border-slate-100">
                  {/* Select Checkbox badge */}
                  <div className="absolute top-2.5 left-2.5 z-10">
                    <label 
                      onClick={(e) => e.stopPropagation()} 
                      className="cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(file.id)}
                        className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer shadow-xs"
                      />
                    </label>
                  </div>

                  {/* Type Badge */}
                  <div className="absolute top-2.5 right-2.5 z-10">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider ${
                      isPdf 
                        ? 'bg-rose-600 text-white shadow-2xs' 
                        : isImage 
                        ? 'bg-blue-600 text-white shadow-2xs' 
                        : 'bg-slate-700 text-white'
                    }`}>
                      {isPdf ? 'PDF' : isImage ? 'BILD' : 'DATEI'}
                    </span>
                  </div>

                  {/* Thumbnail / Visual */}
                  {isImage ? (
                    <img 
                      src={file.dataUrl} 
                      alt={file.name} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 cursor-pointer"
                      onClick={() => handlePreviewFile(file)}
                    />
                  ) : isPdf ? (
                    <PdfThumbnail 
                      url={file.dataUrl}
                      name={file.name}
                      onClick={() => handlePreviewFile(file)}
                    />
                  ) : (
                    <div 
                      onClick={() => handleDownloadSingle(file)}
                      className="flex flex-col items-center justify-center text-slate-400 p-4 w-full h-full cursor-pointer"
                    >
                      <File size={36} />
                    </div>
                  )}

                  {/* Quick Action Overlay on hover */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => handlePreviewFile(file)}
                      className="p-1.5 bg-white/90 hover:bg-white text-slate-800 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                      title="Vorschau anzeigen"
                    >
                      <Eye size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadSingle(file)}
                      className="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                      title="Als Original herunterladen"
                    >
                      <Download size={13} />
                    </button>
                  </div>
                </div>

                {/* Card Content */}
                <div className="p-3.5 flex-1 flex flex-col justify-between">
                  <div>
                    {/* Source Pill */}
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-1.5 truncate">
                      {file.source === 'manual' ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded">
                          <UploadCloud size={10} /> Manuell
                        </span>
                      ) : file.source.startsWith('glossary') ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded truncate">
                          <BookA size={10} /> {file.sourceTitle}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded truncate">
                          <Layers size={10} /> {file.sourceTitle}
                        </span>
                      )}
                      {file.allSources && file.allSources.length > 1 && (
                        <span 
                          className="shrink-0 px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 cursor-help"
                          title={`In ${file.allSources.length} Bereichen verwendet:\n${file.allSources.map(s => '• ' + s.sourceTitle).join('\n')}`}
                        >
                          +{file.allSources.length - 1} Ort{file.allSources.length > 2 ? 'e' : ''}
                        </span>
                      )}
                    </div>

                    {/* File Name */}
                    <h4 
                      className="font-bold text-xs sm:text-sm text-slate-800 leading-snug line-clamp-2 hover:text-blue-600 cursor-pointer"
                      onClick={() => handlePreviewFile(file)}
                      title={file.name}
                    >
                      {file.name}
                    </h4>

                    {file.description && (
                      <p className="text-[11px] text-slate-500 line-clamp-2 mt-1">
                        {file.description}
                      </p>
                    )}
                  </div>

                  {/* Card Bottom Meta & Actions */}
                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                    <span className="font-medium">
                      {formatFileSize(file.size)}
                    </span>

                    <div className="flex items-center gap-1">
                      {/* Individual Download */}
                      <button
                        type="button"
                        onClick={() => handleDownloadSingle(file)}
                        className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                        title="Original-Datei herunterladen"
                      >
                        <Download size={14} />
                      </button>

                      {/* Delete if manual upload */}
                      {file.source === 'manual' && (
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmFile(file)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Manuelle Datei löschen"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE / LIST VIEW */
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                <tr>
                  <th className="py-3 px-4 w-10">
                    <input 
                      type="checkbox"
                      checked={isAllFilteredSelected}
                      onChange={handleSelectAllFiltered}
                      className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-3">Dateiname</th>
                  <th className="py-3 px-3">Typ</th>
                  <th className="py-3 px-3">Herkunft</th>
                  <th className="py-3 px-3">Dateigröße</th>
                  <th className="py-3 px-4 text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredFiles.map(file => {
                  const isSelected = selectedIds.has(file.id);
                  const isPdf = file.type === 'pdf';
                  const isImage = file.type === 'image';

                  return (
                    <tr 
                      key={file.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isSelected ? 'bg-blue-50/30' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(file.id)}
                          className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
                          <div 
                            onClick={() => handlePreviewFile(file)}
                            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 cursor-pointer overflow-hidden border border-slate-200/80 shadow-2xs ${
                              isPdf ? 'bg-rose-50 text-rose-600' : isImage ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {isPdf ? (
                              <PdfThumbnail 
                                url={file.dataUrl} 
                                name={file.name} 
                                className="!p-0.5 scale-110"
                                onClick={() => handlePreviewFile(file)}
                              />
                            ) : isImage ? (
                              <img src={file.dataUrl} alt={file.name} className="w-full h-full object-cover" />
                            ) : (
                              <File size={16} />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p 
                              onClick={() => handlePreviewFile(file)}
                              className="font-bold text-slate-800 hover:text-blue-600 cursor-pointer truncate max-w-xs md:max-w-md"
                              title={file.name}
                            >
                              {file.name}
                            </p>
                            {file.description && (
                              <p className="text-[11px] text-slate-400 truncate max-w-xs">
                                {file.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          isPdf ? 'bg-rose-50 text-rose-700 border border-rose-200' : isImage ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {isPdf ? 'PDF' : isImage ? 'Bild' : 'Datei'}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5 max-w-xs">
                          <span className="text-[11px] font-medium text-slate-600 truncate block" title={file.sourceTitle}>
                            {file.sourceTitle}
                          </span>
                          {file.allSources && file.allSources.length > 1 && (
                            <span 
                              className="shrink-0 px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200 cursor-help"
                              title={`In ${file.allSources.length} Bereichen verwendet:\n${file.allSources.map(s => '• ' + s.sourceTitle).join('\n')}`}
                            >
                              +{file.allSources.length - 1}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-3 font-medium text-slate-500">
                        {formatFileSize(file.size)}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handlePreviewFile(file)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            title="Vorschau"
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadSingle(file)}
                            className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            title="Als Original herunterladen"
                          >
                            <Download size={15} />
                          </button>
                          {file.source === 'manual' && (
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmFile(file)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Löschen"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Manual File Upload Modal */}
      {showUploadModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setShowUploadModal(false)}
        >
          <div 
            className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-2xs">
                  <UploadCloud size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-800">Dateien hochladen</h3>
                  <p className="text-xs text-slate-500">{uploadFilesQueue.length} Datei(en) in der Warteschlange</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* List of files ready to upload */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-4">
              {uploadFilesQueue.map((item, idx) => (
                <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {item.type === 'pdf' ? (
                        <FileText size={18} className="text-rose-600 shrink-0" />
                      ) : item.type === 'image' ? (
                        <ImageIcon size={18} className="text-blue-600 shrink-0" />
                      ) : (
                        <File size={18} className="text-slate-500 shrink-0" />
                      )}
                      <span className="font-bold text-xs text-slate-800 truncate" title={item.file.name}>
                        {item.file.name}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-medium shrink-0">
                      {formatFileSize(item.size)}
                    </span>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Anzeigename / Titel (optional anpassen):
                    </label>
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => {
                        const val = e.target.value;
                        setUploadFilesQueue(prev => prev.map((q, i) => i === idx ? { ...q, name: val } : q));
                      }}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Beschreibung / Notiz:
                    </label>
                    <input
                      type="text"
                      value={item.description}
                      placeholder="z.B. Merkblatt DIN 19643 Teil 2 oder Filterdiagramm..."
                      onChange={(e) => {
                        const val = e.target.value;
                        setUploadFilesQueue(prev => prev.map((q, i) => i === idx ? { ...q, description: val } : q));
                      }}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              ))}

              {/* Add more files button */}
              <button
                type="button"
                onClick={() => dropZoneFileInputRef.current?.click()}
                className="w-full py-2.5 border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl text-xs font-semibold text-slate-600 hover:text-blue-600 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus size={15} />
                <span>Weitere Dateien hinzufügen</span>
              </button>
            </div>

            {/* Modal actions */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setUploadFilesQueue([]);
                  setShowUploadModal(false);
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                type="button"
                disabled={isUploading || uploadFilesQueue.length === 0}
                onClick={handleCommitUploadQueue}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors shadow-2xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isUploading ? <RefreshCw size={14} className="animate-spin" /> : <UploadCloud size={14} />}
                <span>{uploadFilesQueue.length} Datei(en) speichern</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal for Manual Uploads */}
      {deleteConfirmFile && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setDeleteConfirmFile(null)}
        >
          <div 
            className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4 border border-rose-100 shadow-2xs">
              <Trash2 size={22} />
            </div>
            <h3 className="font-bold text-base text-slate-900 mb-1">
              Datei wirklich löschen?
            </h3>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Möchtest du „<strong className="text-slate-700">{deleteConfirmFile.name}</strong>“ unwiderruflich aus deiner Datenbank entfernen?
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmFile(null)}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => handleDeleteManualFile(deleteConfirmFile)}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors shadow-2xs"
              >
                Löschen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Viewer Modal */}
      {pdfViewerModal && (
        <PdfViewerModal
          url={pdfViewerModal.url}
          name={pdfViewerModal.name}
          termTitle={pdfViewerModal.termTitle}
          onClose={() => setPdfViewerModal(null)}
          onDownload={() => {
            const found = allFiles.find(f => f.name === pdfViewerModal.name && f.dataUrl === pdfViewerModal.url) || allFiles.find(f => f.name === pdfViewerModal.name);
            if (found) {
              handleDownloadSingle(found);
            } else {
              downloadOriginalFile({
                id: `pdf_viewer_${Date.now()}`,
                name: pdfViewerModal.name,
                dataUrl: pdfViewerModal.url,
                type: 'pdf',
                mimeType: 'application/pdf',
                source: 'manual',
                sourceTitle: pdfViewerModal.termTitle
              });
            }
          }}
        />
      )}

      {/* Image Lightbox Modal */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs animate-in fade-in"
          onClick={() => setLightboxImage(null)}
        >
          <div 
            className="relative max-w-4xl max-h-[90vh] bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-700 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-white">
              <div className="min-w-0 pr-4">
                <h4 className="font-bold text-sm truncate">{lightboxImage.title}</h4>
                {lightboxImage.subtitle && (
                  <p className="text-xs text-slate-400 truncate">{lightboxImage.subtitle}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const found = allFiles.find(f => f.name === lightboxImage.title || f.dataUrl === lightboxImage.url);
                    if (found) {
                      handleDownloadSingle(found);
                    }
                  }}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-colors cursor-pointer"
                  title="Bild herunterladen"
                >
                  <Download size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setLightboxImage(null)}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-colors cursor-pointer"
                  title="Schließen"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center p-4 overflow-auto bg-slate-950">
              <img 
                src={lightboxImage.url} 
                alt={lightboxImage.title} 
                className="max-h-[75vh] max-w-full object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
