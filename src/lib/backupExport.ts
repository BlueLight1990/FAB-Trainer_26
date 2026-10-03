import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { getDbData, saveDbData, AppDatabase } from './db';

export interface BackupExportResult {
  success: boolean;
  message: string;
  method: 'capacitor' | 'web-share' | 'browser-download' | 'clipboard';
  fileName: string;
  jsonStr?: string;
  itemCount: {
    questions: number;
    flashcards: number;
    glossary: number;
    customCategories: number;
    swimDisciplines?: number;
    swimEntries?: number;
  };
}

export interface BackupImportResult {
  success: boolean;
  message: string;
  fileName?: string;
  itemCount?: {
    questions: number;
    flashcards: number;
    glossary: number;
    customCategories?: number;
    swimDisciplines?: number;
    swimEntries?: number;
    customUploadedFiles?: number;
  };
}

const CHUNK_SIZE = 512 * 1024; // 512 KB per chunk to avoid Android bridge IPC limits

/**
 * Safely writes text data to the device filesystem in chunks.
 * Uses native UTF8 encoding so no memory-heavy base64 string conversions are needed.
 */
async function writeTextFileSafely(
  fileName: string,
  dataStr: string,
  directory: Directory = Directory.Cache
): Promise<{ uri: string }> {
  // If data is small (<= 512KB), write in one single call
  if (dataStr.length <= CHUNK_SIZE) {
    const res = await Filesystem.writeFile({
      path: fileName,
      data: dataStr,
      directory,
      encoding: Encoding.UTF8,
      recursive: true
    });
    return { uri: res.uri };
  }

  // Write first chunk with writeFile to create/truncate file
  const firstChunk = dataStr.slice(0, CHUNK_SIZE);
  const writeRes = await Filesystem.writeFile({
    path: fileName,
    data: firstChunk,
    directory,
    encoding: Encoding.UTF8,
    recursive: true
  });

  // Append subsequent chunks in 512KB parts
  for (let offset = CHUNK_SIZE; offset < dataStr.length; offset += CHUNK_SIZE) {
    const nextChunk = dataStr.slice(offset, offset + CHUNK_SIZE);
    await Filesystem.appendFile({
      path: fileName,
      data: nextChunk,
      directory,
      encoding: Encoding.UTF8
    });
  }

  return { uri: writeRes.uri };
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Robustly exports the entire FAB Trainer database as a JSON backup file.
 * Completely crash-proof on Android / Capacitor APK:
 * - Direct UTF-8 writing in chunks (no base64 conversions, no call stack / heap OOM)
 * - FileProvider file sharing via `files: [uri]` (no FileUriExposedException)
 * - Safe user cancellation handling without throwing
 * - Strict separation between native APK file system and browser download fallback
 */
export async function exportAppDataBackup(
  onProgress?: (percent: number, status: string) => void
): Promise<BackupExportResult> {
  onProgress?.(15, 'Lokale Datenbank wird ausgelesen...');
  await sleep(150);

  const db = await getDbData();
  
  onProgress?.(45, 'JSON-Sicherungsdatei wird generiert...');
  await sleep(150);

  // Use compact JSON to minimize memory footprint and file size
  const jsonStr = JSON.stringify(db);
  const dateStr = new Date().toISOString().split('T')[0];
  const fileName = `fab_trainer_backup_${dateStr}.json`;

  const counts = {
    questions: db.questions?.length || 0,
    flashcards: db.flashcards?.length || 0,
    glossary: db.glossary?.length || 0,
    customCategories: db.customCategories?.length || 0,
    swimDisciplines: db.swimDisciplines?.length || 0,
    swimEntries: db.swimEntries?.length || 0
  };

  onProgress?.(75, Capacitor.isNativePlatform() ? 'Datei wird im Gerätespeicher bereitgestellt...' : 'Download wird vorbereitet...');
  await sleep(150);

  // -------------------------------------------------------------
  // Strategy 1: Capacitor Native Platform (Android / iOS APK)
  // -------------------------------------------------------------
  if (Capacitor.isNativePlatform()) {
    try {
      // 1. Write file to Cache safely in chunks
      const writeResult = await writeTextFileSafely(fileName, jsonStr, Directory.Cache);

      onProgress?.(90, 'Systemdialog zum Speichern/Teilen wird geöffnet...');

      // 2. Present Android Share Sheet using FileProvider
      try {
        await Share.share({
          title: 'FAB Trainer Backup',
          text: `FAB Trainer Backup (${dateStr}) mit ${counts.questions} Fragen, ${counts.flashcards} Lernkarten und ${counts.glossary} Begriffen`,
          files: [writeResult.uri],
          dialogTitle: 'Backup speichern oder teilen'
        });

        onProgress?.(100, 'Backup erfolgreich übergeben!');
        return {
          success: true,
          message: 'Backup erfolgreich erstellt und an das Android-System zum Speichern übergeben.',
          method: 'capacitor',
          fileName,
          jsonStr: jsonStr.length < 500000 ? jsonStr : undefined,
          itemCount: counts
        };
      } catch (shareErr: any) {
        const errMsg = String(shareErr?.message || shareErr || '').toLowerCase();
        if (errMsg.includes('cancel') || errMsg.includes('abort') || shareErr?.name === 'AbortError') {
          onProgress?.(100, 'Backup im Gerätespeicher gespeichert.');
          return {
            success: true,
            message: 'Backup-Datei wurde im Gerätespeicher abgelegt (Teilen abgebrochen).',
            method: 'capacitor',
            fileName,
            jsonStr: jsonStr.length < 500000 ? jsonStr : undefined,
            itemCount: counts
          };
        }

        // Share sheet was dismissed or not handled, but file is already written
        onProgress?.(100, 'Backup im Gerätespeicher gespeichert.');
        return {
          success: true,
          message: `Backup wurde erfolgreich im internen Gerätespeicher abgelegt (${fileName}).`,
          method: 'capacitor',
          fileName,
          jsonStr: jsonStr.length < 500000 ? jsonStr : undefined,
          itemCount: counts
        };
      }
    } catch (capErr: any) {
      console.error('Capacitor native backup export failed:', capErr);

      // On native platform, DO NOT trigger browser download (blob: URLs crash Android WebViews)
      try {
        if (jsonStr.length < 1000000) {
          await navigator.clipboard.writeText(jsonStr);
          onProgress?.(100, 'Backup in Zwischenablage kopiert.');
          return {
            success: true,
            message: 'Dateisystem nicht beschreibbar: Backup wurde als Text in die Zwischenablage kopiert.',
            method: 'clipboard',
            fileName,
            jsonStr,
            itemCount: counts
          };
        }
      } catch {
        // ignore clipboard error
      }

      onProgress?.(100, 'Fehler beim Erstellen des Backups');
      return {
        success: false,
        message: 'Fehler beim Erstellen des Backups: ' + (capErr?.message || 'Speicherzugriff fehlgeschlagen'),
        method: 'capacitor',
        fileName,
        itemCount: counts
      };
    }
  }

  // -------------------------------------------------------------
  // Strategy 2: Web Share API with File (Mobile Web / PWA)
  // -------------------------------------------------------------
  if (typeof navigator !== 'undefined' && typeof File !== 'undefined' && (navigator as any).canShare) {
    try {
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const file = new File([blob], fileName, { type: 'application/json' });
      if ((navigator as any).canShare({ files: [file] })) {
        onProgress?.(90, 'Systemdialog wird aufgerufen...');
        await navigator.share({
          files: [file],
          title: 'FAB Trainer Backup',
          text: `FAB Trainer Backup-Datei (${dateStr})`
        });

        onProgress?.(100, 'Backup erfolgreich abgeschlossen!');
        return {
          success: true,
          message: 'Backup erfolgreich an den Systemdialog übergeben.',
          method: 'web-share',
          fileName,
          jsonStr: jsonStr.length < 500000 ? jsonStr : undefined,
          itemCount: counts
        };
      }
    } catch (shareErr: any) {
      if (shareErr?.name === 'AbortError') {
        onProgress?.(100, 'Backup bereitgestellt.');
        return {
          success: true,
          message: 'Backup wurde erstellt (Teilen abgebrochen).',
          method: 'web-share',
          fileName,
          jsonStr: jsonStr.length < 500000 ? jsonStr : undefined,
          itemCount: counts
        };
      }
      console.warn('Web Share API error, fallback to browser download:', shareErr);
    }
  }

  // -------------------------------------------------------------
  // Strategy 3: Standard Browser Download via Blob URL & Anchor
  // -------------------------------------------------------------
  try {
    onProgress?.(90, 'Datei-Download wird gestartet...');
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    }, 2000);

    onProgress?.(100, 'Download erfolgreich gestartet!');
    return {
      success: true,
      message: 'Backup-Download wurde gestartet.',
      method: 'browser-download',
      fileName,
      jsonStr: jsonStr.length < 500000 ? jsonStr : undefined,
      itemCount: counts
    };
  } catch (downloadErr: any) {
    console.warn('Browser download failed:', downloadErr);
  }

  // -------------------------------------------------------------
  // Strategy 4: Fallback Copy to Clipboard
  // -------------------------------------------------------------
  try {
    await navigator.clipboard.writeText(jsonStr);
    onProgress?.(100, 'Backup in Zwischenablage kopiert!');
    return {
      success: true,
      message: 'Backup als Text in die Zwischenablage kopiert.',
      method: 'clipboard',
      fileName,
      jsonStr,
      itemCount: counts
    };
  } catch (clipErr) {
    onProgress?.(100, 'Export fehlgeschlagen');
    return {
      success: false,
      message: 'Export fehlgeschlagen: Die Datei konnte nicht gespeichert werden.',
      method: 'browser-download',
      fileName,
      itemCount: counts
    };
  }
}

/**
 * Robustly parses, validates, and imports a backup JSON file into IndexedDB
 * with progressive status updates.
 */
export async function importAppDataBackup(
  file: File,
  onProgress?: (percent: number, status: string) => void
): Promise<BackupImportResult> {
  return new Promise((resolve) => {
    onProgress?.(10, `Lese Sicherungsdatei „${file.name}“ ein...`);

    const reader = new FileReader();

    reader.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        const filePct = Math.round((event.loaded / event.total) * 25);
        onProgress?.(10 + filePct, `Lese Datei (${Math.round((event.loaded / 1024))} KB)...`);
      }
    };

    reader.onerror = () => {
      onProgress?.(100, 'Fehler beim Lesen der Datei');
      resolve({
        success: false,
        message: 'Die Backup-Datei konnte vom Dateisystem nicht gelesen werden.',
        fileName: file.name
      });
    };

    reader.onload = async (e) => {
      try {
        onProgress?.(40, 'Analysiere JSON-Struktur...');
        await sleep(150);

        const content = e.target?.result as string;
        if (!content || typeof content !== 'string') {
          throw new Error('Datei ist leer oder nicht lesbar.');
        }

        let parsed: AppDatabase;
        try {
          parsed = JSON.parse(content) as AppDatabase;
        } catch (jsonErr) {
          throw new Error('Ungültiges JSON-Format. Bitte überprüfe die Datei.');
        }

        onProgress?.(65, 'Prüfe Datenintegrität (Fragen, Lernkarten, Fachbegriffe)...');
        await sleep(150);

        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Ungültiges Backup-Objekt.');
        }

        // Basic schema checks: Must contain at least questions, flashcards, or glossary arrays
        const hasQuestions = Array.isArray(parsed.questions);
        const hasFlashcards = Array.isArray(parsed.flashcards);
        const hasGlossary = Array.isArray(parsed.glossary);

        if (!hasQuestions || !hasFlashcards || !hasGlossary) {
          throw new Error('Ungültiges Backup-Format: Notwendige Datenstrukturen (Fragen, Lernkarten, Fachbegriffe) fehlen.');
        }

        onProgress?.(85, 'Schreibe Daten in die lokale Datenbank...');
        await sleep(150);

        // Ensure flags and consistency
        parsed.initialized = true;
        parsed.emptyAppVersion = 1;
        if (!parsed.customCategories) parsed.customCategories = [];
        if (!parsed.presetOverrides) parsed.presetOverrides = {};
        if (!parsed.swimDisciplines) parsed.swimDisciplines = [];
        if (!parsed.swimEntries) parsed.swimEntries = [];
        if (!parsed.customUploadedFiles) parsed.customUploadedFiles = [];

        // Auto-reconstruct categories for flashcards / questions
        const KNOWN_STANDARD_TITLES: Record<string, string> = {
          anatomie: 'Anatomie',
          organisation: 'Bäderorganisation',
          technik: 'Bädertechnik',
          chemie: 'Chemie',
          erste_hilfe: 'Erste Hilfe',
          hygiene: 'Hygiene',
          kommunikation: 'Kommunikation',
          reinigung: 'Reinigung',
          retten: 'Retten',
          schwimmen: 'Schwimmen',
          trainingslehre: 'Trainingslehre',
          wirtschaft_politik: 'Wirtschaftslehre, Politik',
          custom: 'Eigene Kategorie'
        };

        const existingCatIds = new Set(parsed.customCategories.map(c => c.id));
        const referencedCatIds = new Set<string>();
        parsed.flashcards?.forEach(f => {
          if (f.categoryId && f.categoryId !== 'all') referencedCatIds.add(f.categoryId);
        });
        parsed.questions?.forEach(q => {
          if (q.categoryId && q.categoryId !== 'all') referencedCatIds.add(q.categoryId);
        });

        for (const catId of referencedCatIds) {
          if (!existingCatIds.has(catId)) {
            const title = KNOWN_STANDARD_TITLES[catId] || catId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            parsed.customCategories.push({
              id: catId,
              title,
              description: `Themenbereich ${title}`,
              iconName: 'Folder'
            });
            existingCatIds.add(catId);
          }
        }

        await saveDbData(parsed);

        onProgress?.(100, 'Import erfolgreich abgeschlossen!');
        await sleep(100);

        const counts = {
          questions: parsed.questions.length,
          flashcards: parsed.flashcards.length,
          glossary: parsed.glossary.length,
          customCategories: parsed.customCategories.length,
          swimDisciplines: parsed.swimDisciplines.length,
          swimEntries: parsed.swimEntries.length,
          customUploadedFiles: parsed.customUploadedFiles.length
        };

        resolve({
          success: true,
          message: 'Die Daten wurden erfolgreich wiederhergestellt und geladen.',
          fileName: file.name,
          itemCount: counts
        });
      } catch (err: any) {
        onProgress?.(100, 'Import fehlgeschlagen');
        resolve({
          success: false,
          message: err?.message || 'Fehler beim Verarbeiten des Backups.',
          fileName: file.name
        });
      }
    };

    reader.readAsText(file);
  });
}

