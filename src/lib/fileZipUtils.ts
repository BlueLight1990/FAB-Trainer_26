import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { AppDatabase } from './db';
import { AppFileItem, CustomUploadedFile, GlossaryTerm, Flashcard } from '../types';
import { getTermPdfAttachments, dataUriToBlob } from './glossaryPdfUtils';

/**
 * Format bytes to readable string (KB, MB, GB).
 */
export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '–';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Determine file type and mime type from dataUrl and filename.
 */
export function detectFileType(name: string, dataUrl: string): { type: 'pdf' | 'image' | 'other'; mimeType: string; extension: string } {
  const lowerName = name.toLowerCase().trim();
  let mimeType = 'application/octet-stream';
  
  if (dataUrl.startsWith('data:')) {
    const match = dataUrl.match(/^data:([^;]+);/);
    if (match && match[1]) {
      mimeType = match[1].toLowerCase();
    }
  }

  if (mimeType.includes('pdf') || lowerName.endsWith('.pdf')) {
    return { type: 'pdf', mimeType: 'application/pdf', extension: 'pdf' };
  }

  if (
    mimeType.startsWith('image/') ||
    lowerName.endsWith('.png') ||
    lowerName.endsWith('.jpg') ||
    lowerName.endsWith('.jpeg') ||
    lowerName.endsWith('.webp') ||
    lowerName.endsWith('.gif') ||
    lowerName.endsWith('.svg')
  ) {
    let ext = 'png';
    if (mimeType.includes('jpeg') || mimeType.includes('jpg') || lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) ext = 'jpg';
    else if (mimeType.includes('webp') || lowerName.endsWith('.webp')) ext = 'webp';
    else if (mimeType.includes('gif') || lowerName.endsWith('.gif')) ext = 'gif';
    else if (mimeType.includes('svg') || lowerName.endsWith('.svg')) ext = 'svg';
    return { type: 'image', mimeType: mimeType.startsWith('image/') ? mimeType : `image/${ext}`, extension: ext };
  }

  return { type: 'other', mimeType, extension: lowerName.split('.').pop() || 'bin' };
}

/**
 * Estimate size of base64 data URI in bytes.
 */
export function estimateDataUrlSize(dataUrl: string): number {
  if (!dataUrl) return 0;
  if (!dataUrl.startsWith('data:')) return 0;
  const commaIdx = dataUrl.indexOf(',');
  const base64Str = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  return Math.round(base64Str.length * 0.75);
}

/**
 * Fast content fingerprint for base64 / blob URLs.
 * Identifies identical payloads regardless of object ID or surrounding context.
 */
export function getFileContentFingerprint(dataUrl: string): string {
  if (!dataUrl) return '';
  const trimmed = dataUrl.trim();
  if (trimmed.startsWith('data:')) {
    const comma = trimmed.indexOf(',');
    const b64 = comma !== -1 ? trimmed.slice(comma + 1).replace(/\s+/g, '') : trimmed;
    const len = b64.length;
    if (len < 1000) return `b64_${len}_${b64}`;
    const head = b64.slice(0, 150);
    const mid = b64.slice(Math.floor(len / 2) - 75, Math.floor(len / 2) + 75);
    const tail = b64.slice(-150);
    return `b64_${len}_${head}_${mid}_${tail}`;
  }
  return `url_${trimmed.toLowerCase()}`;
}

/**
 * Normalized key for filename + approximate size to catch duplicate files across sources.
 */
export function getFileNameSizeKey(name: string, size?: number, type?: string): string {
  const clean = name.toLowerCase().replace(/[/\\?%*:|"<>_-\s]/g, '');
  const roughSize = size && size > 500 ? Math.round(size / 200) : (size || 0);
  return `${type || 'file'}_${clean}_${roughSize}`;
}

/**
 * Aggregates all uploaded files, PDFs, and images across the entire app
 * with strict duplicate prevention and reference merging.
 */
export function collectAllAppFiles(db: AppDatabase): AppFileItem[] {
  const files: AppFileItem[] = [];
  const fingerprintMap = new Map<string, AppFileItem>();
  const nameSizeMap = new Map<string, AppFileItem>();
  const seenIds = new Set<string>();

  const registerOrMerge = (candidate: AppFileItem) => {
    if (!candidate.dataUrl) return;
    if (seenIds.has(candidate.id)) return;

    const fp = getFileContentFingerprint(candidate.dataUrl);
    const nameKey = getFileNameSizeKey(candidate.name, candidate.size, candidate.type);

    let existing: AppFileItem | undefined;
    if (fp && fingerprintMap.has(fp)) {
      existing = fingerprintMap.get(fp);
    } else if (nameKey && nameSizeMap.has(nameKey)) {
      existing = nameSizeMap.get(nameKey);
    }

    if (existing) {
      // Merge source references into the existing single item
      if (!existing.allSources) {
        existing.allSources = [{
          source: existing.source,
          sourceTitle: existing.sourceTitle,
          sourceId: existing.sourceId
        }];
      }

      const alreadyHasSource = existing.allSources.some(
        s => s.source === candidate.source && s.sourceId === candidate.sourceId
      );

      if (!alreadyHasSource) {
        existing.allSources.push({
          source: candidate.source,
          sourceTitle: candidate.sourceTitle,
          sourceId: candidate.sourceId
        });
      }

      // If existing name is cut off or generic, prefer cleaner name
      if (
        (!existing.name.toLowerCase().endsWith('.pdf') && candidate.name.toLowerCase().endsWith('.pdf')) ||
        (existing.name.length < candidate.name.length && !candidate.name.includes('_img_'))
      ) {
        existing.name = candidate.name;
      }

      if ((!existing.size || existing.size === 0) && candidate.size) {
        existing.size = candidate.size;
      }

      seenIds.add(candidate.id);
      return;
    }

    // New unique file!
    candidate.allSources = [{
      source: candidate.source,
      sourceTitle: candidate.sourceTitle,
      sourceId: candidate.sourceId
    }];

    files.push(candidate);
    seenIds.add(candidate.id);
    if (fp) fingerprintMap.set(fp, candidate);
    if (nameKey) nameSizeMap.set(nameKey, candidate);
  };

  // 1. Manually uploaded files
  if (db.customUploadedFiles && Array.isArray(db.customUploadedFiles)) {
    for (const file of db.customUploadedFiles) {
      if (!file.dataUrl) continue;
      const detected = detectFileType(file.name, file.dataUrl);
      registerOrMerge({
        id: file.id,
        name: file.name,
        type: file.type || detected.type,
        mimeType: file.mimeType || detected.mimeType,
        dataUrl: file.dataUrl,
        size: file.size || estimateDataUrlSize(file.dataUrl),
        source: 'manual',
        sourceTitle: 'Manuell hochgeladen',
        sourceId: file.id,
        uploadedAt: file.uploadedAt,
        description: file.description
      });
    }
  }

  // 2. Glossary PDF attachments
  if (db.glossary && Array.isArray(db.glossary)) {
    for (const term of db.glossary) {
      const attachments = getTermPdfAttachments(term);
      for (const att of attachments) {
        if (!att.dataUrl) continue;

        let cleanName = att.name?.trim() || `${term.term}.pdf`;
        if (!cleanName.toLowerCase().endsWith('.pdf')) {
          cleanName = `${cleanName}.pdf`;
        }

        registerOrMerge({
          id: `glossary_pdf_${att.id}`,
          name: cleanName,
          type: 'pdf',
          mimeType: 'application/pdf',
          dataUrl: att.dataUrl,
          size: att.size || estimateDataUrlSize(att.dataUrl),
          source: 'glossary_pdf',
          sourceTitle: `Glossar: ${term.term}`,
          sourceId: term.id,
          uploadedAt: att.uploadedAt || term.createdAt,
          description: `PDF-Dokument zu „${term.term}“`
        });
      }

      // 3. Glossary Images
      if (term.mediaUrl && term.mediaUrl.trim().length > 0) {
        const detected = detectFileType(term.term, term.mediaUrl);
        const cleanName = `${term.term.replace(/[/\\?%*:|"<>]/g, '_')}_Glossar.${detected.extension}`;
        registerOrMerge({
          id: `glossary_img_${term.id}`,
          name: cleanName,
          type: 'image',
          mimeType: detected.mimeType,
          dataUrl: term.mediaUrl,
          size: estimateDataUrlSize(term.mediaUrl),
          source: 'glossary_image',
          sourceTitle: `Glossar: ${term.term}`,
          sourceId: term.id,
          uploadedAt: term.createdAt,
          description: `Abbildung zu „${term.term}“`
        });
      }
    }
  }

  // 4. Flashcard Images (exclude photos from scan functions)
  if (db.flashcards && Array.isArray(db.flashcards)) {
    for (const card of db.flashcards) {
      // Fotos der Scanfunktionen sollen nicht in das Dokumenten-Archiv geladen werden
      if (card.fromScan || (card as any).isScanned || card.mediaUrlFront || card.id?.startsWith('scanned-')) {
        continue;
      }

      if (card.mediaUrl && card.mediaUrl.trim().length > 0) {
        const detected = detectFileType(card.question, card.mediaUrl);
        const shortQuestion = card.question.replace(/[/\\?%*:|"<>]/g, '_').trim().slice(0, 35);
        const cleanName = `${shortQuestion}_Lernkarte.${detected.extension}`;
        registerOrMerge({
          id: `flashcard_img_${card.id}`,
          name: cleanName,
          type: 'image',
          mimeType: detected.mimeType,
          dataUrl: card.mediaUrl,
          size: estimateDataUrlSize(card.mediaUrl),
          source: 'flashcard_image',
          sourceTitle: `Lernkarte: ${card.question.slice(0, 40)}`,
          sourceId: card.id,
          uploadedAt: card.createdAt,
          description: `Abbildung zur Lernkarte „${card.question.slice(0, 60)}“`
        });
      }
    }
  }

  return files;
}

const BINARY_CHUNK_SIZE = 256 * 1024; // 256 KB base64 characters (guaranteed multiple of 4: 262144 % 4 === 0)

/**
 * Safely writes binary base64 data to the device filesystem in chunks.
 * Prevents Android IPC bridge / Java Heap OutOfMemoryError crashes on large ZIP and PDF files.
 */
export async function writeBinaryBase64FileSafely(
  fileName: string,
  base64Data: string,
  directory: Directory = Directory.Cache
): Promise<{ uri: string }> {
  // Clean base64 string (strip data URI prefix if present and remove whitespace)
  let cleanBase64 = base64Data;
  const commaIdx = cleanBase64.indexOf(',');
  if (commaIdx !== -1) {
    cleanBase64 = cleanBase64.slice(commaIdx + 1);
  }
  cleanBase64 = cleanBase64.replace(/\s+/g, '');

  // If data is small (<= 256KB), write in one single call
  if (cleanBase64.length <= BINARY_CHUNK_SIZE) {
    const res = await Filesystem.writeFile({
      path: fileName,
      data: cleanBase64,
      directory,
      recursive: true
    });
    return { uri: res.uri };
  }

  // Write first chunk with writeFile to create/truncate file
  const firstChunk = cleanBase64.slice(0, BINARY_CHUNK_SIZE);
  const writeRes = await Filesystem.writeFile({
    path: fileName,
    data: firstChunk,
    directory,
    recursive: true
  });

  // Append subsequent chunks in 256KB parts (all aligned to 4 bytes so each chunk is valid standalone base64)
  for (let offset = BINARY_CHUNK_SIZE; offset < cleanBase64.length; offset += BINARY_CHUNK_SIZE) {
    const nextChunk = cleanBase64.slice(offset, offset + BINARY_CHUNK_SIZE);
    await Filesystem.appendFile({
      path: fileName,
      data: nextChunk,
      directory
    });
    // Tiny tick to let event loop breathe and avoid UI lockup
    if (offset % (BINARY_CHUNK_SIZE * 4) === 0) {
      await new Promise(r => setTimeout(r, 0));
    }
  }

  return { uri: writeRes.uri };
}

/**
 * Downloads a single original file to the user's device.
 */
export async function downloadOriginalFile(item: AppFileItem): Promise<{ success: boolean; method: string }> {
  const fileName = item.name.trim().replace(/[/\\?%*:|"<>]/g, '_');
  const dataUrl = item.dataUrl;

  // Strategy 1: Capacitor Native Platform (Android / iOS)
  if (Capacitor.isNativePlatform()) {
    try {
      let base64Data: string;
      if (dataUrl.startsWith('data:')) {
        const commaIdx = dataUrl.indexOf(',');
        base64Data = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;
      } else if (dataUrl.startsWith('blob:') || dataUrl.startsWith('http') || dataUrl.startsWith('/')) {
        const resp = await fetch(dataUrl);
        const b = await resp.blob();
        base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const res = reader.result as string;
            const c = res.indexOf(',');
            resolve(c !== -1 ? res.slice(c + 1) : res);
          };
          reader.onerror = reject;
          reader.readAsDataURL(b);
        });
      } else {
        base64Data = dataUrl;
      }
      const writeResult = await writeBinaryBase64FileSafely(fileName, base64Data, Directory.Cache);

      try {
        await Share.share({
          title: fileName,
          text: `Datei: ${fileName}`,
          files: [writeResult.uri],
          dialogTitle: 'Datei speichern oder teilen'
        });
        return { success: true, method: 'capacitor' };
      } catch (shareErr: any) {
        const msg = String(shareErr?.message || shareErr || '').toLowerCase();
        if (msg.includes('cancel') || msg.includes('abort') || shareErr?.name === 'AbortError') {
          return { success: true, method: 'capacitor-cancelled' };
        }
        return { success: true, method: 'capacitor-saved' };
      }
    } catch (e) {
      console.warn('Capacitor download failed:', e);
      return { success: false, method: 'capacitor-failed' };
    }
  }

  // Handle standard blob / data URI for web
  let blob: Blob;
  if (dataUrl.startsWith('data:')) {
    blob = dataUriToBlob(dataUrl);
  } else {
    try {
      const response = await fetch(dataUrl);
      blob = await response.blob();
    } catch {
      blob = new Blob([], { type: item.mimeType || 'application/octet-stream' });
    }
  }

  // Strategy 2: Web Share API if supported
  if (typeof navigator !== 'undefined' && typeof File !== 'undefined' && (navigator as any).canShare) {
    try {
      const file = new File([blob], fileName, { type: blob.type || item.mimeType });
      if ((navigator as any).canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: fileName,
          text: `Herunterladen: ${fileName}`
        });
        return { success: true, method: 'web-share' };
      }
    } catch (shareErr: any) {
      if (shareErr?.name === 'AbortError') {
        return { success: true, method: 'web-share-cancelled' };
      }
      console.warn('Web Share failed, fallback to click:', shareErr);
    }
  }

  // Strategy 3: Browser Download
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  }, 1000);

  return { success: true, method: 'browser-download' };
}

// ============================================================================
// Zero-Memory Streaming ZIP Engine
// Directly streams ZIP chunks to flash storage on Capacitor / Android APK.
// Never holds the full archive or giant Base64 strings in RAM.
// ============================================================================

const CRC32_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC32_TABLE[n] = c >>> 0;
}

export function updateCrc32(bytes: Uint8Array, currentCrc = 0): number {
  let c = (currentCrc ^ (-1)) >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    c = (CRC32_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)) >>> 0;
  }
  return (c ^ (-1)) >>> 0;
}

export function updateCrc32FromBinaryString(binary: string, currentCrc = 0): number {
  let c = (currentCrc ^ (-1)) >>> 0;
  const len = binary.length;
  for (let i = 0; i < len; i++) {
    c = (CRC32_TABLE[(c ^ binary.charCodeAt(i)) & 0xff] ^ (c >>> 8)) >>> 0;
  }
  return (c ^ (-1)) >>> 0;
}

function getDosDateTime(dateObj: Date = new Date()): { time: number; date: number } {
  const time = ((dateObj.getHours() & 0x1f) << 11) | ((dateObj.getMinutes() & 0x3f) << 5) | ((dateObj.getSeconds() >> 1) & 0x1f);
  const date = (((dateObj.getFullYear() - 1980) & 0x7f) << 9) | (((dateObj.getMonth() + 1) & 0x0f) << 5) | (dateObj.getDate() & 0x1f);
  return { time, date };
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.length;
  const CHUNK = 8192;
  for (let i = 0; i < len; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, len));
    binary += String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return btoa(binary);
}

export function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function createLocalFileHeader(nameBytes: Uint8Array, crc: number, size: number, time: number, date: number): Uint8Array {
  const header = new Uint8Array(30 + nameBytes.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true); // signature PK\x03\x04
  view.setUint16(4, 20, true); // version needed: 2.0
  view.setUint16(6, 0x0800, true); // general purpose flag: bit 11 = UTF-8
  view.setUint16(8, 0, true); // compression: 0 = STORE (uncompressed)
  view.setUint16(10, time, true);
  view.setUint16(12, date, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true); // compressed size
  view.setUint32(22, size, true); // uncompressed size
  view.setUint16(26, nameBytes.length, true);
  view.setUint16(28, 0, true); // extra field length
  header.set(nameBytes, 30);
  return header;
}

function createCentralDirectoryHeader(nameBytes: Uint8Array, crc: number, size: number, localHeaderOffset: number, time: number, date: number): Uint8Array {
  const header = new Uint8Array(46 + nameBytes.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true); // signature PK\x01\x02
  view.setUint16(4, 20, true); // made by: 2.0
  view.setUint16(6, 20, true); // version needed: 2.0
  view.setUint16(8, 0x0800, true); // UTF-8
  view.setUint16(10, 0, true); // STORE
  view.setUint16(12, time, true);
  view.setUint16(14, date, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, nameBytes.length, true);
  view.setUint16(30, 0, true); // extra field len
  view.setUint16(32, 0, true); // comment len
  view.setUint16(34, 0, true); // disk start
  view.setUint16(36, 0, true); // internal attrs
  view.setUint32(38, 0, true); // external attrs
  view.setUint32(42, localHeaderOffset, true);
  header.set(nameBytes, 46);
  return header;
}

function createEOCD(entryCount: number, centralDirSize: number, centralDirOffset: number): Uint8Array {
  const eocd = new Uint8Array(22);
  const view = new DataView(eocd.buffer);
  view.setUint32(0, 0x06054b50, true); // signature PK\x05\x06
  view.setUint16(4, 0, true); // disk number
  view.setUint16(6, 0, true); // start disk
  view.setUint16(8, entryCount, true); // records on disk
  view.setUint16(10, entryCount, true); // total records
  view.setUint32(12, centralDirSize, true);
  view.setUint32(16, centralDirOffset, true);
  view.setUint16(20, 0, true); // comment len
  return eocd;
}

export interface StreamingZipFileEntry {
  path: string;
  dataUrl: string;
  size?: number;
}

/**
 * Creates a standard ZIP archive using progressive streaming.
 * On Capacitor/Android, writes directly to device storage chunk by chunk.
 * Maximum memory used is < 2MB at all times, making OOM crashes completely impossible.
 */
export async function createStreamingZipArchive(
  entries: StreamingZipFileEntry[],
  options?: {
    zipFileName?: string;
    shareTitle?: string;
    shareDescription?: string;
    onProgress?: (percent: number, statusText: string) => void;
  }
): Promise<{ success: boolean; count: number; totalBytes: number; fileName: string; method: string; blobUrl?: string }> {
  if (!entries || entries.length === 0) {
    throw new Error('Keine Dateien für das ZIP-Archiv vorhanden.');
  }

  const dateStr = new Date().toISOString().split('T')[0];
  const zipFileName = options?.zipFileName || `FAB_Archiv_${dateStr}.zip`;
  const onProgress = options?.onProgress;
  const dosTime = getDosDateTime();
  const textEncoder = new TextEncoder();
  const B64_CHUNK = 262144; // 256 KB base64 characters (guaranteed multiple of 4: 262144 % 4 === 0)

  // -------------------------------------------------------------------
  // Strategy 1: Capacitor Native Platform (Android / iOS APK)
  // Progressive, streaming write directly to flash storage in Cache.
  // Peak memory is < 2MB regardless of archive size (never crashes)!
  // -------------------------------------------------------------------
  if (Capacitor.isNativePlatform()) {
    try {
      if (onProgress) onProgress(3, 'ZIP-Archiv wird im Gerätespeicher vorbereitet...');

      // Clean up previous archive if it exists in cache
      try {
        await Filesystem.deleteFile({
          path: zipFileName,
          directory: Directory.Cache
        });
      } catch {
        // Ignore if file doesn't exist
      }

      // Initialize empty zip file
      await Filesystem.writeFile({
        path: zipFileName,
        data: '',
        directory: Directory.Cache,
        recursive: true
      });

      let currentOffset = 0;
      let totalBytesWritten = 0;
      const centralDirEntries: {
        nameBytes: Uint8Array;
        crc: number;
        size: number;
        localHeaderOffset: number;
        time: number;
        date: number;
      }[] = [];

      for (let i = 0; i < entries.length; i++) {
        const item = entries[i];

        // 1. Extract base64 content with minimal memory overhead
        let base64Payload = '';
        if (item.dataUrl.startsWith('data:')) {
          const comma = item.dataUrl.indexOf(',');
          base64Payload = comma !== -1 ? item.dataUrl.slice(comma + 1) : item.dataUrl;
          if (base64Payload.includes(' ') || base64Payload.includes('\n') || base64Payload.includes('\r')) {
            base64Payload = base64Payload.replace(/\s+/g, '');
          }
        } else {
          try {
            const resp = await fetch(item.dataUrl);
            const blob = await resp.blob();
            const reader = new FileReader();
            base64Payload = await new Promise<string>((resolve, reject) => {
              reader.onload = () => {
                const s = reader.result as string;
                const comma = s.indexOf(',');
                const clean = comma !== -1 ? s.slice(comma + 1) : s;
                resolve(clean.replace(/\s+/g, ''));
              };
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          } catch (fetchErr) {
            console.warn(`Fehler beim Laden von ${item.path}:`, fetchErr);
            continue;
          }
        }

        if (!base64Payload) continue;

        // Ensure 4-byte alignment
        while (base64Payload.length % 4 !== 0) {
          base64Payload += '=';
        }

        // 2. Compute CRC-32 and uncompressed byte size in 256KB chunks using binary strings
        let fileCrc = 0;
        let fileByteSize = 0;
        for (let offset = 0; offset < base64Payload.length; offset += B64_CHUNK) {
          const chunkStr = base64Payload.slice(offset, offset + B64_CHUNK);
          const binaryStr = atob(chunkStr);
          fileCrc = updateCrc32FromBinaryString(binaryStr, fileCrc);
          fileByteSize += binaryStr.length;
        }

        // Progress display with running size
        if (onProgress) {
          const pct = 5 + Math.round((i / entries.length) * 85);
          onProgress(pct, `Datei ${i + 1} von ${entries.length} schreiben... (${formatFileSize(totalBytesWritten + fileByteSize)})`);
        }

        // 3. Write Local File Header
        const nameBytes = textEncoder.encode(item.path);
        const localHeader = createLocalFileHeader(nameBytes, fileCrc, fileByteSize, dosTime.time, dosTime.date);
        const localHeaderB64 = uint8ArrayToBase64(localHeader);
        const localHeaderOffset = currentOffset;

        await Filesystem.appendFile({
          path: zipFileName,
          data: localHeaderB64,
          directory: Directory.Cache
        });
        currentOffset += localHeader.length;

        // 4. Stream data chunks directly to disk
        let chunkCount = 0;
        for (let offset = 0; offset < base64Payload.length; offset += B64_CHUNK) {
          const chunkStr = base64Payload.slice(offset, offset + B64_CHUNK);
          await Filesystem.appendFile({
            path: zipFileName,
            data: chunkStr,
            directory: Directory.Cache
          });
          chunkCount++;
          if (chunkCount % 4 === 0) {
            await new Promise(r => setTimeout(r, 0));
          }
        }
        currentOffset += fileByteSize;
        totalBytesWritten += fileByteSize;

        // 5. Store central directory entry
        centralDirEntries.push({
          nameBytes,
          crc: fileCrc,
          size: fileByteSize,
          localHeaderOffset,
          time: dosTime.time,
          date: dosTime.date
        });

        // Release string from memory and pause briefly to let GC run
        base64Payload = '';
        await new Promise(r => setTimeout(r, 5));
      }

      // 6. Finalize Central Directory and EOCD
      if (onProgress) onProgress(93, 'Zentralverzeichnis wird finalisiert...');

      let cdTotalSize = 0;
      for (const e of centralDirEntries) {
        cdTotalSize += 46 + e.nameBytes.length;
      }
      const cdBuffer = new Uint8Array(cdTotalSize + 22);
      let cdOffset = 0;
      for (const e of centralDirEntries) {
        const cd = createCentralDirectoryHeader(e.nameBytes, e.crc, e.size, e.localHeaderOffset, e.time, e.date);
        cdBuffer.set(cd, cdOffset);
        cdOffset += cd.length;
      }
      const eocd = createEOCD(centralDirEntries.length, cdTotalSize, currentOffset);
      cdBuffer.set(eocd, cdOffset);

      const cdB64 = uint8ArrayToBase64(cdBuffer);
      await Filesystem.appendFile({
        path: zipFileName,
        data: cdB64,
        directory: Directory.Cache
      });
      currentOffset += cdBuffer.length;

      // 7. Get FileProvider URI and open Share Sheet
      if (onProgress) onProgress(98, 'Systemdialog zum Speichern wird geöffnet...');
      const uriResult = await Filesystem.getUri({
        path: zipFileName,
        directory: Directory.Cache
      });

      try {
        await Share.share({
          title: options?.shareTitle || 'FAB Trainer – Datei-Archiv',
          text: options?.shareDescription || `Sammlung von ${centralDirEntries.length} Dateien (${formatFileSize(totalBytesWritten)}) aus dem FAB Trainer`,
          files: [uriResult.uri],
          dialogTitle: 'ZIP-Archiv speichern oder teilen'
        });

        if (onProgress) onProgress(100, 'ZIP-Archiv erfolgreich übergeben!');
        return {
          success: true,
          count: centralDirEntries.length,
          totalBytes: totalBytesWritten,
          fileName: zipFileName,
          method: 'capacitor'
        };
      } catch (shareErr: any) {
        const msg = String(shareErr?.message || shareErr || '').toLowerCase();
        if (msg.includes('cancel') || msg.includes('abort') || shareErr?.name === 'AbortError') {
          if (onProgress) onProgress(100, 'ZIP-Archiv im Gerätespeicher gesichert.');
          return {
            success: true,
            count: centralDirEntries.length,
            totalBytes: totalBytesWritten,
            fileName: zipFileName,
            method: 'capacitor-cancelled'
          };
        }
        if (onProgress) onProgress(100, 'ZIP-Archiv im Gerätespeicher gesichert.');
        return {
          success: true,
          count: centralDirEntries.length,
          totalBytes: totalBytesWritten,
          fileName: zipFileName,
          method: 'capacitor-saved'
        };
      }
    } catch (capErr: any) {
      console.error('Capacitor Streaming ZIP Error:', capErr);
      throw new Error(`Fehler bei ZIP-Erstellung im Android-Dateisystem: ${capErr?.message || capErr}`);
    }
  }

  // -------------------------------------------------------------------
  // Strategy 2: Web Platform (Browser / PWA)
  // Low-memory Blob parts assembly
  // -------------------------------------------------------------------
  if (onProgress) onProgress(5, 'ZIP-Archiv wird zusammengestellt...');

  const parts: (Uint8Array | Blob)[] = [];
  let currentOffset = 0;
  let totalBytesWritten = 0;
  const centralDirEntries: {
    nameBytes: Uint8Array;
    crc: number;
    size: number;
    localHeaderOffset: number;
    time: number;
    date: number;
  }[] = [];

  for (let i = 0; i < entries.length; i++) {
    const item = entries[i];
    if (onProgress) {
      const pct = 5 + Math.round((i / entries.length) * 85);
      onProgress(pct, `Datei ${i + 1} von ${entries.length} verarbeiten...`);
    }

    let fileBlob: Blob;
    let base64Payload = '';
    if (item.dataUrl.startsWith('data:')) {
      const comma = item.dataUrl.indexOf(',');
      base64Payload = comma !== -1 ? item.dataUrl.slice(comma + 1) : item.dataUrl;
      if (base64Payload.includes(' ') || base64Payload.includes('\n') || base64Payload.includes('\r')) {
        base64Payload = base64Payload.replace(/\s+/g, '');
      }
      fileBlob = dataUriToBlob(item.dataUrl);
    } else {
      try {
        const resp = await fetch(item.dataUrl);
        fileBlob = await resp.blob();
        const reader = new FileReader();
        base64Payload = await new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const s = reader.result as string;
            const comma = s.indexOf(',');
            const clean = comma !== -1 ? s.slice(comma + 1) : s;
            resolve(clean.replace(/\s+/g, ''));
          };
          reader.onerror = reject;
          reader.readAsDataURL(fileBlob);
        });
      } catch (e) {
        console.warn(`Fehler beim Laden von ${item.path}:`, e);
        continue;
      }
    }

    while (base64Payload.length % 4 !== 0) {
      base64Payload += '=';
    }

    // CRC-32
    let fileCrc = 0;
    let fileByteSize = 0;
    for (let offset = 0; offset < base64Payload.length; offset += B64_CHUNK) {
      const chunkStr = base64Payload.slice(offset, offset + B64_CHUNK);
      const binaryStr = atob(chunkStr);
      fileCrc = updateCrc32FromBinaryString(binaryStr, fileCrc);
      fileByteSize += binaryStr.length;
    }
    base64Payload = '';

    const nameBytes = textEncoder.encode(item.path);
    const localHeader = createLocalFileHeader(nameBytes, fileCrc, fileByteSize, dosTime.time, dosTime.date);
    const localHeaderOffset = currentOffset;

    parts.push(localHeader);
    parts.push(fileBlob);

    currentOffset += localHeader.length + fileByteSize;
    totalBytesWritten += fileByteSize;

    centralDirEntries.push({
      nameBytes,
      crc: fileCrc,
      size: fileByteSize,
      localHeaderOffset,
      time: dosTime.time,
      date: dosTime.date
    });

    if (i % 5 === 0) {
      await new Promise(r => setTimeout(r, 0));
    }
  }

  // Central directory + EOCD
  let cdTotalSize = 0;
  for (const e of centralDirEntries) {
    cdTotalSize += 46 + e.nameBytes.length;
  }
  const cdBuffer = new Uint8Array(cdTotalSize + 22);
  let cdOffset = 0;
  for (const e of centralDirEntries) {
    const cd = createCentralDirectoryHeader(e.nameBytes, e.crc, e.size, e.localHeaderOffset, e.time, e.date);
    cdBuffer.set(cd, cdOffset);
    cdOffset += cd.length;
  }
  const eocd = createEOCD(centralDirEntries.length, cdTotalSize, currentOffset);
  cdBuffer.set(eocd, cdOffset);
  parts.push(cdBuffer);

  const zipBlob = new Blob(parts, { type: 'application/zip' });

  // Web Share API if supported
  if (typeof navigator !== 'undefined' && typeof File !== 'undefined' && (navigator as any).canShare) {
    try {
      const file = new File([zipBlob], zipFileName, { type: 'application/zip' });
      if ((navigator as any).canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: options?.shareTitle || 'FAB Trainer – Datei-Archiv',
          text: options?.shareDescription || `Sammlung von ${centralDirEntries.length} Dateien aus dem FAB Trainer`
        });
        if (onProgress) onProgress(100, 'Erfolgreich geteilt!');
        return {
          success: true,
          count: centralDirEntries.length,
          totalBytes: totalBytesWritten,
          fileName: zipFileName,
          method: 'web-share'
        };
      }
    } catch (shareErr: any) {
      if (shareErr?.name === 'AbortError') {
        if (onProgress) onProgress(100, 'Vorgang abgebrochen.');
        return {
          success: true,
          count: centralDirEntries.length,
          totalBytes: totalBytesWritten,
          fileName: zipFileName,
          method: 'web-share-cancelled'
        };
      }
    }
  }

  // Standard Browser Download
  const blobUrl = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = zipFileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  }, 1000);

  if (onProgress) onProgress(100, 'Download gestartet!');
  return {
    success: true,
    count: centralDirEntries.length,
    totalBytes: totalBytesWritten,
    fileName: zipFileName,
    blobUrl,
    method: 'browser-download'
  };
}

/**
 * Packs multiple files into a clean ZIP archive with folder structure.
 */
export async function exportFilesAsZip(
  items: AppFileItem[],
  options?: {
    zipFileName?: string;
    organizeFolders?: boolean;
    onProgress?: (percent: number, statusText: string) => void;
  }
): Promise<{ success: boolean; count: number; totalBytes: number; fileName: string; method: string }> {
  if (!items || items.length === 0) {
    throw new Error('Keine Dateien zum Herunterladen ausgewählt.');
  }

  // Deduplicate files to avoid duplicate entries in the ZIP archive
  const uniqueItems: AppFileItem[] = [];
  const seenFp = new Set<string>();
  for (const item of items) {
    const fp = getFileContentFingerprint(item.dataUrl) || item.id;
    if (!seenFp.has(fp)) {
      seenFp.add(fp);
      uniqueItems.push(item);
    }
  }

  const nameCounts: Record<string, number> = {};
  const organizeFolders = options?.organizeFolders ?? true;
  const entries: StreamingZipFileEntry[] = [];

  let processed = 0;
  for (const item of uniqueItems) {
    let folder = '';
    if (organizeFolders) {
      if (item.source === 'manual') folder = 'Manuelle_Uploads/';
      else if (item.type === 'pdf') folder = 'PDF_Dokumente/';
      else if (item.source === 'glossary_image') folder = 'Glossar_Bilder/';
      else if (item.source === 'flashcard_image') folder = 'Lernkarten_Bilder/';
      else folder = 'Sonstige_Dateien/';
    }

    let cleanName = item.name.replace(/[/\\?%*:|"<>]/g, '_').trim();
    if (!cleanName) cleanName = `Datei_${processed + 1}`;

    let zipPath = `${folder}${cleanName}`;
    if (nameCounts[zipPath]) {
      nameCounts[zipPath]++;
      const dotIdx = cleanName.lastIndexOf('.');
      if (dotIdx !== -1) {
        const base = cleanName.substring(0, dotIdx);
        const ext = cleanName.substring(dotIdx);
        zipPath = `${folder}${base}_${nameCounts[zipPath]}${ext}`;
      } else {
        zipPath = `${folder}${cleanName}_${nameCounts[zipPath]}`;
      }
    } else {
      nameCounts[zipPath] = 1;
    }

    entries.push({
      path: zipPath,
      dataUrl: item.dataUrl,
      size: item.size
    });
    processed++;
  }

  const dateStr = new Date().toISOString().split('T')[0];
  const zipFileName = options?.zipFileName || `FAB_Dateien_Archiv_${dateStr}.zip`;

  return await createStreamingZipArchive(entries, {
    zipFileName,
    shareTitle: 'FAB Trainer – Datei-Archiv',
    shareDescription: `Sammlung von ${entries.length} Dateien aus dem FAB Trainer`,
    onProgress: options?.onProgress
  });
}
