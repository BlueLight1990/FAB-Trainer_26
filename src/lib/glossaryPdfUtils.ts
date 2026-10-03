import { GlossaryTerm, GlossaryPdfAttachment } from '../types';
import { Capacitor } from '@capacitor/core';
import { Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { writeBinaryBase64FileSafely, createStreamingZipArchive, StreamingZipFileEntry } from './fileZipUtils';

/**
 * Normalizes and extracts all attached PDFs from a GlossaryTerm.
 * Seamlessly supports both single attachment (pdfUrl, pdfName, pdfSize)
 * and multiple attachments (pdfAttachments array).
 */
export function getTermPdfAttachments(term: GlossaryTerm): GlossaryPdfAttachment[] {
  const result: GlossaryPdfAttachment[] = [];
  const seenUrls = new Set<string>();

  if (Array.isArray(term.pdfAttachments) && term.pdfAttachments.length > 0) {
    for (const att of term.pdfAttachments) {
      if (!att || !att.dataUrl) continue;
      const cleanUrl = att.dataUrl.trim();
      if (!seenUrls.has(cleanUrl)) {
        seenUrls.add(cleanUrl);
        result.push(att);
      }
    }
  }

  // If there's also a legacy or direct pdfUrl not already in pdfAttachments
  if (term.pdfUrl && term.pdfUrl.trim().length > 0) {
    const cleanUrl = term.pdfUrl.trim();
    if (!seenUrls.has(cleanUrl)) {
      seenUrls.add(cleanUrl);
      result.unshift({
        id: `${term.id}_pdf_primary`,
        name: term.pdfName || `${term.term.replace(/[/\\?%*:|"<>]/g, '_')}.pdf`,
        dataUrl: term.pdfUrl,
        size: term.pdfSize,
        uploadedAt: term.createdAt
      });
    }
  }

  return result;
}

/**
 * Format bytes into human-readable format (e.g. 145 KB, 2.4 MB).
 */
export function formatFileSize(bytes?: number): string {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Converts a base64 Data URI into a Blob object.
 */
export function dataUriToBlob(dataUri: string): Blob {
  try {
    const parts = dataUri.split(',');
    const header = parts[0] || '';
    const base64 = parts[1] || '';
    const mimeMatch = header.match(/:(.*?);/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'application/pdf';

    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  } catch (err) {
    console.error('Fehler bei dataUriToBlob Konvertierung:', err);
    return new Blob([], { type: 'application/pdf' });
  }
}

/**
 * Download or share an individual PDF attachment.
 */
export async function downloadPdfAttachment(
  pdf: { name: string; dataUrl: string; size?: number },
  termTitle?: string
): Promise<{ success: boolean; method: string; fileName: string }> {
  let fileName = pdf.name.trim();
  if (!fileName.toLowerCase().endsWith('.pdf')) {
    fileName = `${fileName}.pdf`;
  }
  // Sanitize filename
  fileName = fileName.replace(/[/\\?%*:|"<>]/g, '_');

  // Capacitor Native Mobile
  if (Capacitor.isNativePlatform()) {
    try {
      let base64Data: string;
      if (pdf.dataUrl.startsWith('data:')) {
        const commaIdx = pdf.dataUrl.indexOf(',');
        base64Data = commaIdx !== -1 ? pdf.dataUrl.slice(commaIdx + 1) : pdf.dataUrl;
      } else if (pdf.dataUrl.startsWith('blob:') || pdf.dataUrl.startsWith('http') || pdf.dataUrl.startsWith('/')) {
        const resp = await fetch(pdf.dataUrl);
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
        base64Data = pdf.dataUrl;
      }
      const writeResult = await writeBinaryBase64FileSafely(fileName, base64Data, Directory.Cache);

      try {
        await Share.share({
          title: termTitle ? `${termTitle} – PDF Anhang` : fileName,
          text: `Angehängtes PDF: ${fileName}`,
          files: [writeResult.uri],
          dialogTitle: 'PDF öffnen oder speichern'
        });
      } catch (shareErr: any) {
        if (shareErr?.name === 'AbortError' || shareErr?.message?.toLowerCase().includes('cancel')) {
          return { success: true, method: 'capacitor', fileName };
        }
        console.warn('Share error in Capacitor:', shareErr);
      }

      return { success: true, method: 'capacitor', fileName };
    } catch (capErr) {
      console.warn('Capacitor PDF Download fehlgeschlagen:', capErr);
      return { success: false, method: 'capacitor', fileName };
    }
  }

  // Web Share API with File (e.g. mobile chrome/safari)
  const blob = dataUriToBlob(pdf.dataUrl);
  if (typeof navigator !== 'undefined' && typeof File !== 'undefined' && (navigator as any).canShare) {
    try {
      const file = new File([blob], fileName, { type: 'application/pdf' });
      if ((navigator as any).canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: termTitle ? `${termTitle} – PDF Anhang` : fileName,
          text: `Angehängtes PDF: ${fileName}`
        });
        return { success: true, method: 'web-share', fileName };
      }
    } catch (shareErr: any) {
      if (shareErr?.name === 'AbortError') {
        return { success: true, method: 'web-share', fileName };
      }
      console.warn('Web Share API Fehler:', shareErr);
    }
  }

  // Standard Browser Download
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

  return { success: true, method: 'browser-download', fileName };
}

export interface PdfExportItem {
  termId: string;
  termTitle: string;
  attachment: GlossaryPdfAttachment;
}

/**
 * Collect all PDF attachments across a collection of glossary terms.
 */
export function getAllGlossaryPdfItems(terms: GlossaryTerm[]): PdfExportItem[] {
  const items: PdfExportItem[] = [];
  for (const term of terms) {
    const attachments = getTermPdfAttachments(term);
    for (const att of attachments) {
      if (att.dataUrl) {
        items.push({
          termId: term.id,
          termTitle: term.term,
          attachment: att
        });
      }
    }
  }
  return items;
}

/**
 * Bundles all attached PDFs into a single, organized ZIP archive.
 */
export async function exportGlossaryPdfsAsZip(
  terms: GlossaryTerm[],
  options?: {
    customZipName?: string;
    onProgress?: (percent: number, statusText: string) => void;
  }
): Promise<{
  success: boolean;
  count: number;
  totalBytes: number;
  fileName: string;
  blobUrl?: string;
  method: string;
  error?: string;
}> {
  const allPdfItems = getAllGlossaryPdfItems(terms);

  if (allPdfItems.length === 0) {
    throw new Error('Keine angehängten PDF-Dateien im Glossar gefunden.');
  }

  const nameCounts: Record<string, number> = {};
  const entries: StreamingZipFileEntry[] = [];

  for (const item of allPdfItems) {
    const termClean = item.termTitle.replace(/[/\\?%*:|"<>]/g, '_').trim().substring(0, 40);
    let originalName = item.attachment.name.trim();
    if (!originalName.toLowerCase().endsWith('.pdf')) {
      originalName = `${originalName}.pdf`;
    }
    const cleanOrigName = originalName.replace(/[/\\?%*:|"<>]/g, '_');
    
    // Construct clean name, e.g. "Flockung - DIN_19643_Teil1.pdf"
    let zipEntryName = `${termClean} - ${cleanOrigName}`;
    if (nameCounts[zipEntryName]) {
      nameCounts[zipEntryName]++;
      const dotIdx = zipEntryName.lastIndexOf('.');
      zipEntryName = `${zipEntryName.substring(0, dotIdx)}_${nameCounts[zipEntryName]}.pdf`;
    } else {
      nameCounts[zipEntryName] = 1;
    }

    entries.push({
      path: zipEntryName,
      dataUrl: item.attachment.dataUrl,
      size: item.attachment.size
    });
  }

  const dateStr = new Date().toISOString().split('T')[0];
  const zipFileName = options?.customZipName || `FAB_Glossar_PDF_Anhaenge_${dateStr}.zip`;

  return await createStreamingZipArchive(entries, {
    zipFileName,
    shareTitle: 'FAB Trainer – PDF-Anhänge',
    shareDescription: `Sammlung aller ${allPdfItems.length} angehängten PDF-Dokumente aus dem Glossar`,
    onProgress: options?.onProgress
  });
}
