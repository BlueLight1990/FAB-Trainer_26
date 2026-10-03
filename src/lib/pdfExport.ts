import { jsPDF } from 'jspdf';
import { GlossaryTerm, Flashcard, Category } from '../types';
import {
  TRAINING_PLAN_WEEKS,
  TRAINING_ZONES,
  COMMON_EINSCHWIMMPROGRAMM,
  TRAINING_METADATA,
  TrainingWeekPlan
} from '../data/trainingPlan';
import { Capacitor } from '@capacitor/core';
import { Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { writeBinaryBase64FileSafely } from './fileZipUtils';

export interface PdfExportResult {
  success: boolean;
  message: string;
  method: 'capacitor' | 'web-share' | 'browser-download';
  fileName: string;
  blobUrl?: string;
  dataUri?: string;
  itemCount: number;
  hasImages?: boolean;
  imagesCount?: number;
}

export interface PdfExportOptions {
  filterSubtitle?: string;
  includeImages?: boolean;
  onProgress?: (current: number, total: number, statusText: string) => void;
}

export interface FlashcardPdfExportOptions {
  categoryTitle?: string;
  categoryId?: string;
  mode: 'questions_only' | 'with_answers';
  includeImages?: boolean;
  includeAnswerLines?: boolean;
  categories?: Category[];
  sortBy?: 'category_az' | 'date_desc' | 'date_asc' | 'az';
  onProgress?: (current: number, total: number, statusText: string) => void;
}

interface ProcessedPdfImage {
  dataUrl: string;
  format: 'JPEG' | 'PNG';
  width: number;
  height: number;
  aspectRatio: number;
}

/**
 * Prepares and normalizes images for embedding into jsPDF.
 * Resizes large smartphone camera photos, converts transparent/WebP formats
 * into clean standard JPEGs with white background, and preserves natural aspect ratio.
 */
async function prepareImageForPdf(url: string): Promise<ProcessedPdfImage | null> {
  if (!url || typeof window === 'undefined') return null;

  return new Promise((resolve) => {
    try {
      const img = new Image();
      if (!url.startsWith('data:')) {
        img.crossOrigin = 'Anonymous';
      }

      img.onload = () => {
        try {
          const natW = img.naturalWidth || img.width || 400;
          const natH = img.naturalHeight || img.height || 300;
          const aspectRatio = natW / Math.max(1, natH);

          // Constrain dimensions to keep PDF size compact while keeping 300dpi sharpness
          const maxDim = 850;
          let targetW = natW;
          let targetH = natH;
          if (targetW > maxDim || targetH > maxDim) {
            if (targetW > targetH) {
              targetH = Math.round((targetH * maxDim) / targetW);
              targetW = maxDim;
            } else {
              targetW = Math.round((targetW * maxDim) / targetH);
              targetH = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, targetW);
          canvas.height = Math.max(1, targetH);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }

          // Clean white background (prevents black background on transparent PNGs/SVGs in JPEG)
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, targetW, targetH);

          const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.82);
          resolve({
            dataUrl: jpegDataUrl,
            format: 'JPEG',
            width: targetW,
            height: targetH,
            aspectRatio
          });
        } catch (canvasErr) {
          // If canvas export failed due to cross-origin restriction but URL is already a data URI
          if (url.startsWith('data:image/jpeg') || url.startsWith('data:image/png')) {
            const isPng = url.startsWith('data:image/png');
            const natW = img.naturalWidth || 400;
            const natH = img.naturalHeight || 300;
            resolve({
              dataUrl: url,
              format: isPng ? 'PNG' : 'JPEG',
              width: natW,
              height: natH,
              aspectRatio: natW / Math.max(1, natH)
            });
          } else {
            console.warn('Canvas export failed for image:', canvasErr);
            resolve(null);
          }
        }
      };

      img.onerror = (e) => {
        console.warn('Image load error for PDF export:', e);
        resolve(null);
      };

      // 6-second timeout so one unresponsive external image never freezes the PDF export
      setTimeout(() => {
        resolve(null);
      }, 6000);

      img.src = url;
    } catch (e) {
      console.warn('Exception while preparing image for PDF:', e);
      resolve(null);
    }
  });
}

/**
 * Normalizes unicode arrows, symbols and special characters into WinAnsi / PDF compatible strings.
 */
export function sanitizePdfText(raw: string): string {
  if (!raw) return '';
  return String(raw)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\\r\\n|\\n|\\r/g, '\n')
    .replace(/\r\n|\r/g, '\n')
    .replace(/↳/g, '  > ')
    .replace(/→/g, ' -> ')
    .replace(/←/g, ' <- ')
    .replace(/↔/g, ' <-> ')
    .replace(/⇒/g, ' => ')
    .replace(/[•●▪]/g, '- ')
    .replace(/[✔✓]/g, '[+] ')
    .replace(/[✖✗]/g, '[x] ')
    .replace(/[★☆]/g, '* ')
    .replace(/[–—]/g, '-')
    .replace(/[„“”]/g, '"')
    .replace(/[‚‘’]/g, "'")
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '');
}

export interface PdfTextSegment {
  text: string;
  isBold?: boolean;
  isItalic?: boolean;
  isCode?: boolean;
}

export interface PdfFormattedLine {
  indent: number; // in mm
  bulletPrefix?: string;
  isHeading?: boolean;
  isEmpty?: boolean;
  segments: PdfTextSegment[];
}

/**
 * Parses markdown inline tokens: **bold**, *italic*, `code` into styled segments
 * with formula-safe asterisk handling (multiplication * like in mM*TM or a*b is preserved).
 */
function parseLineSegments(lineText: string): PdfTextSegment[] {
  if (!lineText) return [];

  const segments: PdfTextSegment[] = [];
  const regex = /(`[^`\n]+`|\*\*[^*\n]+?\*\*|__[^_\n]+?__|(?<=^|[\s\(\[\{\"\',.;:!?])\*([a-zA-ZäöüÄÖÜß0-9][a-zA-ZäöüÄÖÜß0-9\s,.-]*?[a-zA-ZäöüÄÖÜß0-9]|[a-zA-ZäöüÄÖÜß0-9])\*(?=$|[\s\)\]\}\"\',.;:!?])|(?<=^|[\s\(\[\{\"\',.;:!?])_([a-zA-ZäöüÄÖÜß0-9][a-zA-ZäöüÄÖÜß0-9\s,.-]*?[a-zA-ZäöüÄÖÜß0-9]|[a-zA-ZäöüÄÖÜß0-9])_(?=$|[\s\)\]\}\"\',.;:!?]))/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(lineText)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: lineText.substring(lastIndex, match.index) });
    }

    const token = match[0];
    if (token.startsWith('`') && token.endsWith('`')) {
      segments.push({ text: token.slice(1, -1), isCode: true });
    } else if (token.startsWith('**') && token.endsWith('**')) {
      segments.push({ text: token.slice(2, -2), isBold: true });
    } else if (token.startsWith('__') && token.endsWith('__')) {
      segments.push({ text: token.slice(2, -2), isBold: true });
    } else if (token.startsWith('*') && token.endsWith('*')) {
      segments.push({ text: token.slice(1, -1), isItalic: true });
    } else if (token.startsWith('_') && token.endsWith('_')) {
      segments.push({ text: token.slice(1, -1), isItalic: true });
    } else {
      segments.push({ text: token });
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < lineText.length) {
    segments.push({ text: lineText.substring(lastIndex) });
  }

  return segments;
}

/**
 * Parses raw text into structured PDF lines with indentation, bullet prefixes, and styled segments.
 */
export function parsePdfFormattedText(rawText: string): PdfFormattedLine[] {
  const sanitized = sanitizePdfText(rawText);
  const lines = sanitized.split('\n');
  const result: PdfFormattedLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      result.push({ indent: 0, isEmpty: true, segments: [] });
      continue;
    }

    // Heading: '### ' or '## '
    if (trimmed.startsWith('### ') || trimmed.startsWith('## ')) {
      const headingText = trimmed.replace(/^#{2,3}\s+/, '');
      result.push({
        indent: 0,
        isHeading: true,
        segments: [{ text: headingText, isBold: true }]
      });
      continue;
    }

    // Sub-item arrow / indent: '  > ' or '> ' or '-> '
    if (trimmed.startsWith('> ') || rawLine.startsWith('  > ') || trimmed.startsWith('-> ')) {
      const clean = trimmed.replace(/^(\s*>\s*|\s*->\s*)/, '');
      result.push({
        indent: 4.5,
        bulletPrefix: '> ',
        segments: parseLineSegments(clean)
      });
      continue;
    }

    // Bullet item: '- ', '* '
    const bulletMatch = trimmed.match(/^([\-\*])\s+(.+)$/);
    if (bulletMatch) {
      result.push({
        indent: 4.5,
        bulletPrefix: '- ',
        segments: parseLineSegments(bulletMatch[2])
      });
      continue;
    }

    // Numbered list item: '1. ', '2) '
    const numMatch = trimmed.match(/^(\d+[\.\)])\s+(.+)$/);
    if (numMatch) {
      result.push({
        indent: 5.5,
        bulletPrefix: `${numMatch[1]} `,
        segments: parseLineSegments(numMatch[2])
      });
      continue;
    }

    // Standard line
    result.push({
      indent: 0,
      segments: parseLineSegments(rawLine)
    });
  }

  return result;
}

export interface RenderPdfTextBlockOptions {
  fontSize?: number;
  lineHeight?: number;
  textColor?: [number, number, number];
  headingColor?: [number, number, number];
  bulletColor?: [number, number, number];
}

/**
 * Calculates height and optionally renders rich formatted text block into jsPDF.
 */
export function measureOrRenderPdfFormattedBlock(
  doc: jsPDF,
  rawText: string,
  x: number,
  y: number,
  maxWidth: number,
  options: RenderPdfTextBlockOptions = {},
  render: boolean = true
): number {
  const {
    fontSize = 9,
    lineHeight = 4.3,
    textColor = [51, 65, 85],
    headingColor = [30, 41, 59],
    bulletColor = [37, 99, 235]
  } = options;

  const parsedLines = parsePdfFormattedText(rawText);
  let currentY = y;

  for (const line of parsedLines) {
    if (line.isEmpty) {
      currentY += lineHeight * 0.5;
      continue;
    }

    const currentFontSize = line.isHeading ? fontSize + 1.2 : fontSize;
    const currentLineHeight = line.isHeading ? lineHeight * 1.15 : lineHeight;
    doc.setFontSize(currentFontSize);

    const availableWidth = Math.max(10, maxWidth - line.indent);
    const startX = x + line.indent;

    // Word-wrap line segments across availableWidth
    const words: Array<{ text: string; isBold?: boolean; isItalic?: boolean; isCode?: boolean }> = [];
    for (const seg of line.segments) {
      const segWords = seg.text.split(/(\s+)/);
      for (const w of segWords) {
        if (w) {
          words.push({ text: w, isBold: seg.isBold, isItalic: seg.isItalic, isCode: seg.isCode });
        }
      }
    }

    const wrappedLines: Array<Array<{ text: string; isBold?: boolean; isItalic?: boolean; isCode?: boolean }>> = [];
    let currentLineWords: Array<{ text: string; isBold?: boolean; isItalic?: boolean; isCode?: boolean }> = [];
    let currentLineWidth = 0;

    for (const w of words) {
      doc.setFont('helvetica', (line.isHeading || w.isBold) ? 'bold' : w.isItalic ? 'italic' : 'normal');
      const wWidth = doc.getTextWidth(w.text) + (w.isCode ? 1.5 : 0);

      if (currentLineWords.length > 0 && currentLineWidth + wWidth > availableWidth && w.text.trim().length > 0) {
        wrappedLines.push(currentLineWords);
        currentLineWords = [];
        currentLineWidth = 0;
      }

      currentLineWords.push(w);
      currentLineWidth += wWidth;
    }

    if (currentLineWords.length > 0) {
      wrappedLines.push(currentLineWords);
    }

    if (wrappedLines.length === 0) {
      wrappedLines.push([{ text: '' }]);
    }

    // Render or advance for each wrapped line
    for (let lIdx = 0; lIdx < wrappedLines.length; lIdx++) {
      const lineWords = wrappedLines[lIdx];

      if (render) {
        // Draw bullet prefix on first line of indented item
        if (lIdx === 0 && line.bulletPrefix) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(currentFontSize);
          doc.setTextColor(bulletColor[0], bulletColor[1], bulletColor[2]);
          doc.text(line.bulletPrefix, x + 0.5, currentY);
        }

        let curX = startX;
        for (const w of lineWords) {
          const isBold = line.isHeading || w.isBold || w.isCode;
          doc.setFont('helvetica', isBold ? 'bold' : w.isItalic ? 'italic' : 'normal');
          doc.setFontSize(currentFontSize);

          if (w.isCode) {
            // Draw code/value badge with light gray background and subtle border
            const textW = doc.getTextWidth(w.text);
            const badgeW = textW + 2.2;
            const badgeH = currentLineHeight * 0.88;
            const badgeY = currentY - (badgeH * 0.72);

            doc.setFillColor(241, 245, 249);
            doc.setDrawColor(203, 213, 225);
            doc.roundedRect(curX, badgeY, badgeW, badgeH, 0.6, 0.6, 'FD');

            doc.setTextColor(30, 41, 59);
            doc.text(w.text, curX + 1.1, currentY);
            curX += badgeW + 0.8;
          } else {
            if (line.isHeading) {
              doc.setTextColor(headingColor[0], headingColor[1], headingColor[2]);
            } else if (w.isBold) {
              doc.setTextColor(15, 23, 42);
            } else {
              doc.setTextColor(textColor[0], textColor[1], textColor[2]);
            }
            doc.text(w.text, curX, currentY);
            curX += doc.getTextWidth(w.text);
          }
        }
      }

      currentY += currentLineHeight;
    }
  }

  return currentY - y;
}

/**
 * Universal dispatcher for generated PDF blobs (Capacitor Native, Web Share, Browser Download).
 */
async function saveAndDispatchPdf(
  doc: jsPDF,
  fileName: string,
  itemCount: number,
  shareTitle: string,
  shareDescription: string
): Promise<PdfExportResult> {
  const pdfBlob = doc.output('blob');
  let blobUrl = '';
  try {
    blobUrl = URL.createObjectURL(pdfBlob);
  } catch (e) {
    console.warn('createObjectURL failed:', e);
  }

  const dataUri = doc.output('datauristring');

  // Strategy 1: Capacitor Native Platform (Android / iOS APK)
  if (Capacitor.isNativePlatform()) {
    try {
      const base64Data = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;

      // Write safely in chunks to Cache directory
      const writeResult = await writeBinaryBase64FileSafely(fileName, base64Data, Directory.Cache);

      // Present Android Share/Open Sheet via FileProvider
      try {
        await Share.share({
          title: shareTitle,
          text: shareDescription,
          files: [writeResult.uri],
          dialogTitle: 'PDF öffnen oder speichern'
        });
      } catch (shareErr: any) {
        if (shareErr?.name === 'AbortError' || shareErr?.message?.toLowerCase().includes('cancel')) {
          return {
            success: true,
            message: 'PDF erfolgreich im Gerätespeicher abgelegt.',
            method: 'capacitor',
            fileName,
            blobUrl: undefined,
            dataUri: undefined,
            itemCount
          };
        }
        console.warn('Share error in Capacitor:', shareErr);
      }

      return {
        success: true,
        message: 'PDF erfolgreich erstellt und an dein Android-System übergeben.',
        method: 'capacitor',
        fileName,
        blobUrl: undefined,
        dataUri: undefined,
        itemCount
      };
    } catch (capErr) {
      console.warn('Capacitor native export failed, trying Web Share / browser fallback:', capErr);
    }
  }

  // Strategy 2: Web Share API with File
  if (typeof navigator !== 'undefined' && typeof File !== 'undefined' && navigator.canShare) {
    try {
      const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: shareTitle,
          text: shareDescription
        });

        return {
          success: true,
          message: 'PDF erfolgreich an den Systemdialog übergeben.',
          method: 'web-share',
          fileName,
          blobUrl,
          dataUri,
          itemCount
        };
      }
    } catch (shareErr: any) {
      if (shareErr?.name === 'AbortError') {
        return {
          success: true,
          message: 'PDF wurde erstellt (Teilen abgebrochen).',
          method: 'web-share',
          fileName,
          blobUrl,
          dataUri,
          itemCount
        };
      }
      console.warn('Web Share API error:', shareErr);
    }
  }

  // Strategy 3: Standard Browser Download (Triggered via jsPDF save & anchor click)
  try {
    doc.save(fileName);
  } catch (docSaveErr) {
    console.warn('doc.save failed, trying anchor fallback:', docSaveErr);
    if (blobUrl) {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
      }, 1000);
    }
  }

  return {
    success: true,
    message: 'PDF-Download wurde gestartet.',
    method: 'browser-download',
    fileName,
    blobUrl,
    dataUri,
    itemCount
  };
}

/**
 * Exports Flashcards to PDF with category filter and choice of:
 * - "questions_only": Worksheet / Exam question sheet with handwriting lines
 * - "with_answers": Correction sheet / Master solution key with full answers
 */
export async function exportFlashcardsToPdf(
  cards: Flashcard[],
  options: FlashcardPdfExportOptions
): Promise<PdfExportResult> {
  const {
    categoryTitle = 'Gesamte Lernkartei',
    categoryId = 'all',
    mode = 'with_answers',
    includeImages = true,
    includeAnswerLines = true,
    categories = [],
    sortBy = 'category_az',
    onProgress
  } = options;

  if (cards.length === 0) {
    throw new Error('Keine Lernkarten für den Export vorhanden.');
  }

  // Helper to get category title
  const getCategoryName = (catId: string) => {
    const found = categories.find(c => c.id === catId);
    return found ? found.title : catId === 'custom' ? 'Eigene Lernkarten' : 'Allgemein';
  };

  // Sort cards based on sortBy preference
  const sortedCards = [...cards].sort((a, b) => {
    if (sortBy === 'date_desc') {
      const dateA = a.createdAt || 0;
      const dateB = b.createdAt || 0;
      if (dateB !== dateA) return dateB - dateA;
      return a.question.localeCompare(b.question, 'de', { sensitivity: 'base' });
    }
    if (sortBy === 'date_asc') {
      const dateA = a.createdAt || 0;
      const dateB = b.createdAt || 0;
      if (dateA !== dateB) return dateA - dateB;
      return a.question.localeCompare(b.question, 'de', { sensitivity: 'base' });
    }
    if (sortBy === 'az') {
      return a.question.localeCompare(b.question, 'de', { sensitivity: 'base' });
    }
    // Default: 'category_az'
    if (a.categoryId !== b.categoryId) {
      const nameA = getCategoryName(a.categoryId);
      const nameB = getCategoryName(b.categoryId);
      return nameA.localeCompare(nameB, 'de');
    }
    return a.question.localeCompare(b.question, 'de', { sensitivity: 'base' });
  });

  const isWithAnswers = mode === 'with_answers';

  // Preload and process images if requested (Front = Question image, Back = Answer/Solution image)
  const questionImageCache = new Map<string, ProcessedPdfImage>();
  const answerImageCache = new Map<string, ProcessedPdfImage>();

  if (includeImages) {
    const cardsWithImages = sortedCards.filter(c => !!c.mediaUrlFront || (isWithAnswers && !!c.mediaUrl));
    if (cardsWithImages.length > 0) {
      let processed = 0;
      for (const card of cardsWithImages) {
        if (onProgress) {
          onProgress(processed + 1, cardsWithImages.length, `Bereite Abbildungen vor (${processed + 1}/${cardsWithImages.length})...`);
        }
        // 1. Question image (Front / unbeschriftete Grafik / Skizze / Fragestellung)
        if (card.mediaUrlFront) {
          const prepFront = await prepareImageForPdf(card.mediaUrlFront);
          if (prepFront) {
            questionImageCache.set(card.id, prepFront);
          }
        }
        // 2. Answer image (Back / Lösung / beschriftetes Schaubild) - only needed for Korrekturbogen
        if (isWithAnswers && card.mediaUrl) {
          const prepBack = await prepareImageForPdf(card.mediaUrl);
          if (prepBack) {
            answerImageCache.set(card.id, prepBack);
          }
        }
        processed++;
      }
    }
  }

  if (onProgress) {
    onProgress(sortedCards.length, sortedCards.length, 'Erstelle PDF-Layout...');
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const leftMargin = 20; // 20mm left binder margin for filing in school folders (Schulordner)
  const rightMargin = 14;
  const topMargin = 15;
  const contentWidth = pageWidth - leftMargin - rightMargin;

  let currentY = topMargin;
  const dateStr = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // Draw subtle punch hole guidelines for standard 2-hole and 4-hole European binder filing
  const drawPunchHoleMarkers = () => {
    doc.setDrawColor(203, 213, 225); // slate-300
    doc.setLineWidth(0.2);
    // Center fold tick
    doc.line(2, pageHeight / 2, 6, pageHeight / 2);
    // Standard DIN 80mm punch marks (at center - 40mm and center + 40mm)
    doc.line(2, pageHeight / 2 - 40, 5, pageHeight / 2 - 40);
    doc.line(2, pageHeight / 2 + 40, 5, pageHeight / 2 + 40);
  };

  // Add Page Header
  const addHeader = (isFirstPage: boolean) => {
    drawPunchHoleMarkers();

    if (isFirstPage) {
      // Header Banner
      if (isWithAnswers) {
        // Deep Navy / Slate for Solutions
        doc.setFillColor(30, 41, 59); // slate-800
      } else {
        // Emerald / Teal for Worksheet
        doc.setFillColor(15, 118, 110); // teal-700
      }
      doc.roundedRect(leftMargin, currentY, contentWidth, 24, 2, 2, 'F');

      // Title
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      const titleText = isWithAnswers 
        ? 'FAB Trainer – Lernkartei: Korrekturbogen' 
        : 'FAB Trainer – Lernkartei: Übungsbogen';
      doc.text(titleText, leftMargin + 6, currentY + 9);

      // Subtitle
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const modeLabel = isWithAnswers 
        ? 'Fragen inklusive Musterlösungen zur Korrektur & Nachbereitung' 
        : 'Fragenkatalog & Arbeitsblatt zum Selbsttest';
      const totalImgs = questionImageCache.size + (isWithAnswers ? answerImageCache.size : 0);
      const imgNote = includeImages && totalImgs > 0 ? ` • inkl. ${totalImgs} ${totalImgs === 1 ? 'Abbildung' : 'Abbildungen'}` : '';
      const subtitleText = `${categoryTitle} • ${sortedCards.length} ${sortedCards.length === 1 ? 'Karte' : 'Karten'} • Stand: ${dateStr}${imgNote}`;
      doc.text(subtitleText, leftMargin + 6, currentY + 15.5);
      
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(226, 232, 240);
      doc.text(modeLabel, leftMargin + 6, currentY + 20.5);

      currentY += 36;
    } else {
      // Running Header on subsequent pages
      doc.setTextColor(100, 116, 139); // slate-500
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const subTitle = isWithAnswers ? 'Korrekturbogen & Musterlösung' : 'Übungsbogen / Fragenkatalog';
      doc.text(`FAB Trainer • Lernkartei: ${categoryTitle} (${subTitle})`, leftMargin, currentY);
      doc.setDrawColor(226, 232, 240);
      doc.line(leftMargin, currentY + 2, leftMargin + contentWidth, currentY + 2);
      currentY += 12;
    }
  };

  // Add Page Footers with total count
  const addFooters = () => {
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setDrawColor(226, 232, 240);
      doc.line(leftMargin, pageHeight - 11, leftMargin + contentWidth, pageHeight - 11);
      doc.text(`Seite ${i} von ${totalPages}`, pageWidth - rightMargin - 18, pageHeight - 6.5);
      doc.text('FAB Trainer • Prüfungsvorbereitung Fachangestellte/r für Bäderbetriebe (Schulordner-Export)', leftMargin, pageHeight - 6.5);
    }
  };

  addHeader(true);

  let currentCategorySection = '';

  for (let idx = 0; idx < sortedCards.length; idx++) {
    const card = sortedCards[idx];
    const catName = getCategoryName(card.categoryId);

    // Grouping: Check if new category section should be drawn (if exporting all or multiple)
    if (categoryId === 'all' && catName !== currentCategorySection) {
      currentCategorySection = catName;
      const countInCat = sortedCards.filter(c => getCategoryName(c.categoryId) === catName).length;

      // Section header needs about 20mm
      if (currentY + 22 > pageHeight - 16) {
        doc.addPage();
        currentY = topMargin;
        addHeader(false);
      }

      doc.setFillColor(241, 245, 249); // slate-100
      doc.roundedRect(leftMargin, currentY, contentWidth, 8, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(30, 41, 59); // slate-800
      doc.text(`Rubrik: ${catName} (${countInCat} ${countInCat === 1 ? 'Frage' : 'Fragen'})`, leftMargin + 4, currentY + 5.5);
      currentY += 14;
    }

    // Measure question text with rich formatting
    const qHeight = measureOrRenderPdfFormattedBlock(
      doc,
      card.question || '',
      leftMargin + 2,
      currentY,
      contentWidth - 8,
      { fontSize: 10, lineHeight: 4.8, textColor: [15, 23, 42], headingColor: [15, 23, 42] },
      false
    );

    // Measure question image (Front / unbeschriftet / Fragestellung)
    const qImgObj = includeImages ? questionImageCache.get(card.id) : null;
    let qImgRenderW = 0;
    let qImgRenderH = 0;
    let qImgBlockHeight = 0;

    if (qImgObj) {
      const maxW = 80; // mm
      const maxH = 50; // mm
      if (qImgObj.aspectRatio >= 1) {
        qImgRenderW = maxW;
        qImgRenderH = qImgRenderW / qImgObj.aspectRatio;
        if (qImgRenderH > maxH) {
          qImgRenderH = maxH;
          qImgRenderW = qImgRenderH * qImgObj.aspectRatio;
        }
      } else {
        qImgRenderH = maxH;
        qImgRenderW = qImgRenderH * qImgObj.aspectRatio;
      }
      qImgBlockHeight = qImgRenderH + 5;
    }

    // Measure answer image (Back / Lösung / beschriftetes Schaubild)
    const aImgObj = (includeImages && isWithAnswers) ? answerImageCache.get(card.id) : null;
    let aImgRenderW = 0;
    let aImgRenderH = 0;
    let aImgBlockHeight = 0;

    if (aImgObj) {
      const maxW = 80; // mm
      const maxH = 50; // mm
      if (aImgObj.aspectRatio >= 1) {
        aImgRenderW = maxW;
        aImgRenderH = aImgRenderW / aImgObj.aspectRatio;
        if (aImgRenderH > maxH) {
          aImgRenderH = maxH;
          aImgRenderW = aImgRenderH * aImgObj.aspectRatio;
        }
      } else {
        aImgRenderH = maxH;
        aImgRenderW = aImgRenderH * aImgObj.aspectRatio;
      }
      aImgBlockHeight = aImgRenderH + 5;
    }

    // Measure answer (if with answers)
    let ansHeight = 0;
    let aBlockHeight = 0;
    if (isWithAnswers) {
      aBlockHeight = measureOrRenderPdfFormattedBlock(
        doc,
        card.answer || '',
        leftMargin + 6,
        currentY,
        contentWidth - 14,
        { fontSize: 9, lineHeight: 4.2, textColor: [30, 41, 59] },
        false
      );
      ansHeight = aBlockHeight + 9 + (aImgObj ? aImgBlockHeight : 0); // text + padding + label + answer image
    } else if (includeAnswerLines) {
      // Lines for handwriting: 3 lines of 6.5mm = ~20mm + header
      ansHeight = 24;
    } else {
      ansHeight = 4;
    }

    const cardTotalHeight = 11 + qHeight + qImgBlockHeight + ansHeight + 8;

    // Check if card fits on the page
    if (currentY + cardTotalHeight > pageHeight - 16 && currentY > topMargin + 10) {
      doc.addPage();
      currentY = topMargin;
      addHeader(false);
    }

    // Top Card Label / Badge
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(37, 99, 235); // blue-600
    doc.text(`FRAGE ${idx + 1}`, leftMargin + 2, currentY + 4);

    if (categoryId === 'all' || categoryId === 'custom_selection') {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`[${catName}]`, leftMargin + 24, currentY + 4);
    }

    // Shift question text down with comfortable breathing room below label
    currentY += 10;

    // Print Question Text (Rich Formatted)
    measureOrRenderPdfFormattedBlock(
      doc,
      card.question || '',
      leftMargin + 2,
      currentY,
      contentWidth - 8,
      { fontSize: 10, lineHeight: 4.8, textColor: [15, 23, 42], headingColor: [15, 23, 42] },
      true
    );
    currentY += qHeight + 3.5;

    // Print Question Image (Front image / unbeschriftete Abbildung zur Frage) if attached
    if (qImgObj && qImgRenderW > 0 && qImgRenderH > 0) {
      try {
        const imgX = leftMargin + 2;
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(imgX - 0.5, currentY - 0.5, qImgRenderW + 1, qImgRenderH + 1, 1, 1, 'FD');

        doc.addImage(
          qImgObj.dataUrl,
          qImgObj.format,
          imgX,
          currentY,
          qImgRenderW,
          qImgRenderH,
          undefined,
          'FAST'
        );
        currentY += qImgRenderH + 4;
      } catch (imgErr) {
        console.warn('Question image rendering in flashcard PDF failed:', imgErr);
      }
    }

    // Print Answer or Answer Handwriting Lines
    if (isWithAnswers) {
      // Background box for answer
      const boxHeight = ansHeight;
      doc.setFillColor(248, 250, 252); // slate-50
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.roundedRect(leftMargin + 2, currentY, contentWidth - 4, boxHeight, 1.5, 1.5, 'FD');

      // Left vertical accent line (green)
      doc.setFillColor(16, 185, 129); // emerald-500
      doc.roundedRect(leftMargin + 2, currentY, 1.5, boxHeight, 0.5, 0.5, 'F');

      // Answer Header Label
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(5, 150, 105); // emerald-600
      doc.text('Musterantwort / Lösung:', leftMargin + 6, currentY + 4.5);

      // Print Rich Formatted Answer Text
      measureOrRenderPdfFormattedBlock(
        doc,
        card.answer || '',
        leftMargin + 6,
        currentY + 9,
        contentWidth - 14,
        { fontSize: 9, lineHeight: 4.2, textColor: [30, 41, 59] },
        true
      );

      // Print Answer Image (Back image / beschriftete Lösungsgrafik) inside solution box
      if (aImgObj && aImgRenderW > 0 && aImgRenderH > 0) {
        const textOffset = aBlockHeight + 10;
        const imgX = leftMargin + 6;
        const imgY = currentY + textOffset;

        try {
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(203, 213, 225);
          doc.roundedRect(imgX - 0.5, imgY - 0.5, aImgRenderW + 1, aImgRenderH + 1, 1, 1, 'FD');

          doc.addImage(
            aImgObj.dataUrl,
            aImgObj.format,
            imgX,
            imgY,
            aImgRenderW,
            aImgRenderH,
            undefined,
            'FAST'
          );
        } catch (imgErr) {
          console.warn('Answer image rendering in flashcard PDF failed:', imgErr);
        }
      }

      currentY += boxHeight + 4;
    } else if (includeAnswerLines) {
      // Handwriting practice lines
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text('Ihre Antwort / Notizen:', leftMargin + 2, currentY + 3.5);
      currentY += 5;

      doc.setDrawColor(226, 232, 240);
      for (let l = 0; l < 3; l++) {
        const lineY = currentY + (l * 6.5);
        doc.line(leftMargin + 2, lineY, leftMargin + contentWidth - 2, lineY);
      }
      currentY += 21;
    } else {
      currentY += 2;
    }

    // Subtle divider between cards
    doc.setDrawColor(241, 245, 249);
    doc.line(leftMargin, currentY, leftMargin + contentWidth, currentY);
    currentY += 4;
  }

  // Add all footers
  addFooters();

  // Create clean filename
  const filenameDate = new Date().toISOString().split('T')[0];
  const catSlug = categoryId === 'all' 
    ? 'Alle_Themen' 
    : categoryTitle.replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, '_').substring(0, 25);
  const modeSlug = isWithAnswers ? 'Korrekturbogen' : 'Uebungsbogen';
  const fileName = `FAB_Trainer_Lernkartei_${modeSlug}_${catSlug}_${filenameDate}.pdf`;

  const shareTitle = isWithAnswers ? 'FAB Trainer – Lernkartei Korrekturbogen' : 'FAB Trainer – Lernkartei Übungsbogen';
  const shareDescription = `Lernkarten (${sortedCards.length} Fragen, ${categoryTitle}) als PDF`;

  return await saveAndDispatchPdf(doc, fileName, sortedCards.length, shareTitle, shareDescription);
}

/**
 * Export Glossary to PDF (A-Z)
 */
export async function exportGlossaryToPdf(
  terms: GlossaryTerm[], 
  optionsOrSubtitle?: string | PdfExportOptions
): Promise<PdfExportResult> {
  const options: PdfExportOptions = typeof optionsOrSubtitle === 'string'
    ? { filterSubtitle: optionsOrSubtitle, includeImages: false }
    : (optionsOrSubtitle || {});

  const { filterSubtitle, includeImages = false, onProgress } = options;

  // Sort terms alphabetically by term name
  const sortedTerms = [...terms].sort((a, b) => 
    a.term.localeCompare(b.term, 'de', { sensitivity: 'base' })
  );

  // Optional: Preload and prepare images if requested
  const imageCache = new Map<string, ProcessedPdfImage>();
  if (includeImages) {
    const termsWithImages = sortedTerms.filter(t => !!t.mediaUrl);
    if (termsWithImages.length > 0) {
      let processed = 0;
      for (const item of termsWithImages) {
        if (onProgress) {
          onProgress(processed + 1, termsWithImages.length, `Bereite Bild ${processed + 1} von ${termsWithImages.length} vor...`);
        }
        const prepared = await prepareImageForPdf(item.mediaUrl!);
        if (prepared) {
          imageCache.set(item.id, prepared);
        }
        processed++;
      }
    }
  }

  if (onProgress) {
    onProgress(sortedTerms.length, sortedTerms.length, 'Erstelle PDF-Layout...');
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - (margin * 2);

  let currentY = margin;

  // Helper to add header on every page
  const addHeader = (isFirstPage: boolean) => {
    if (isFirstPage) {
      // Main App Header Banner
      doc.setFillColor(37, 99, 235); // Royal Blue #2563EB
      doc.rect(margin, currentY, contentWidth, 22, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('FAB Trainer – Fachglossar Bäderbetriebe', margin + 6, currentY + 9);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      const dateStr = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const imageCountPart = includeImages && imageCache.size > 0 ? ` • inkl. ${imageCache.size} Abbildungen` : '';
      const subtitleText = filterSubtitle 
        ? `${filterSubtitle} • Stand: ${dateStr} • ${sortedTerms.length} Fachbegriffe${imageCountPart}`
        : `Alphabetisches Nachschlagewerk • Stand: ${dateStr} • ${sortedTerms.length} Fachbegriffe${imageCountPart}`;
      doc.text(subtitleText, margin + 6, currentY + 16);

      currentY += 28;
    } else {
      // Running header on subsequent pages
      doc.setTextColor(148, 163, 184); // slate-400
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('FAB Trainer – Fachglossar für Bäderbetriebe (A-Z)', margin, currentY);
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, currentY + 2, margin + contentWidth, currentY + 2);
      currentY += 8;
    }
  };

  // Helper to add footer
  const addFooters = () => {
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setTextColor(148, 163, 184);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, pageHeight - 12, margin + contentWidth, pageHeight - 12);
      doc.text(`Seite ${i} von ${totalPages}`, pageWidth - margin - 20, pageHeight - 7);
      doc.text('FAB Trainer • Prüfungsvorbereitung Fachangestellte/r für Bäderbetriebe', margin, pageHeight - 7);
    }
  };

  addHeader(true);

  let currentLetter = '';

  for (const item of sortedTerms) {
    const firstChar = item.term.trim().charAt(0).toUpperCase();

    // Check if new letter section
    if (firstChar !== currentLetter) {
      currentLetter = firstChar;

      // Check if enough space for letter section header (at least 25mm)
      if (currentY + 25 > pageHeight - 20) {
        doc.addPage();
        currentY = margin;
        addHeader(false);
      }

      // Draw Letter Section
      doc.setFillColor(241, 245, 249); // slate-100
      doc.roundedRect(margin, currentY, contentWidth, 8, 2, 2, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59); // slate-800
      doc.text(`— ${currentLetter} —`, margin + 5, currentY + 5.5);
      currentY += 12;
    }

    // Measure term and definition text
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    const cleanTerm = sanitizePdfText(item.term);
    const termLines = doc.splitTextToSize(cleanTerm, contentWidth - 4);
    const termHeight = termLines.length * 5;

    // Measure rich formatted definition
    const defHeight = measureOrRenderPdfFormattedBlock(
      doc,
      item.definition || '',
      margin + 2,
      currentY,
      contentWidth - 4,
      { fontSize: 9, lineHeight: 4.2, textColor: [51, 65, 85] },
      false
    );

    // Measure image if available and requested
    const imgObj = includeImages ? imageCache.get(item.id) : null;
    let imgRenderW = 0;
    let imgRenderH = 0;
    let imgBlockHeight = 0;

    if (imgObj) {
      const maxW = 68; // mm
      const maxH = 44; // mm
      if (imgObj.aspectRatio >= 1) {
        imgRenderW = maxW;
        imgRenderH = imgRenderW / imgObj.aspectRatio;
        if (imgRenderH > maxH) {
          imgRenderH = maxH;
          imgRenderW = imgRenderH * imgObj.aspectRatio;
        }
      } else {
        imgRenderH = maxH;
        imgRenderW = imgRenderH * imgObj.aspectRatio;
      }
      imgBlockHeight = imgRenderH + 5; // image + spacing
    }

    const itemTotalHeight = termHeight + defHeight + imgBlockHeight + 6;

    // Check if item fits on page
    if (currentY + itemTotalHeight > pageHeight - 18 && currentY > margin + 10) {
      doc.addPage();
      currentY = margin;
      addHeader(false);

      // Repeat letter indicator if broken across page
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`(Fortsetzung ${currentLetter})`, margin, currentY);
      currentY += 6;
    }

    // Print Term Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(30, 58, 138); // Blue-900
    doc.text(termLines, margin + 2, currentY);
    currentY += termHeight;

    // Print Rich Formatted Definition
    measureOrRenderPdfFormattedBlock(
      doc,
      item.definition || '',
      margin + 2,
      currentY,
      contentWidth - 4,
      { fontSize: 9, lineHeight: 4.2, textColor: [51, 65, 85] },
      true
    );
    currentY += defHeight + 2;

    // Print Image if available
    if (imgObj && imgRenderW > 0 && imgRenderH > 0) {
      try {
        const imgX = margin + 2;
        // Frame / background
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(imgX - 0.8, currentY - 0.8, imgRenderW + 1.6, imgRenderH + 1.6, 1, 1, 'FD');

        doc.addImage(
          imgObj.dataUrl,
          imgObj.format,
          imgX,
          currentY,
          imgRenderW,
          imgRenderH,
          undefined,
          'FAST'
        );
        currentY += imgRenderH + 4;
      } catch (imgErr) {
        console.warn('Could not render image in PDF for term:', item.term, imgErr);
      }
    }

    // Optional subtle divider line
    doc.setDrawColor(241, 245, 249);
    doc.line(margin, currentY, margin + contentWidth, currentY);
    currentY += 4;
  }

  // Add all footers with page numbers
  addFooters();

  const filenameDate = new Date().toISOString().split('T')[0];
  const fileName = `FAB_Trainer_Fachglossar_${filenameDate}.pdf`;

  return await saveAndDispatchPdf(
    doc,
    fileName,
    sortedTerms.length,
    'FAB Trainer Fachglossar',
    `Fachglossar mit ${sortedTerms.length} Fachbegriffen (PDF)`
  );
}

export interface TrainingPlanPdfExportOptions {
  mode: 'all_weeks' | 'single_week';
  selectedWeek?: number;
  completedWeeks?: number[];
  notes?: Record<number, string>;
}

/**
 * Generates and downloads a clean, professional PDF of the 12-Week Training Plan
 */
export async function exportTrainingPlanToPdf(
  options: TrainingPlanPdfExportOptions
): Promise<PdfExportResult> {
  const {
    mode = 'all_weeks',
    selectedWeek = 1,
    completedWeeks = [],
    notes = {}
  } = options;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let currentY = margin;

  const addHeader = (titleText: string, subText: string) => {
    // Header Bar Accent
    doc.setFillColor(30, 58, 138); // blue-900
    doc.rect(margin, margin, contentWidth, 2.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text(titleText, margin, margin + 8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(subText, margin, margin + 12.5);

    // Separator line
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, margin + 14.5, margin + contentWidth, margin + 14.5);

    currentY = margin + 19;
  };

  const addFooters = () => {
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184); // slate-400

      // Divider line
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, pageHeight - 11, margin + contentWidth, pageHeight - 11);

      // Left footer
      doc.text(
        'BDS e.V. Musterplan FAB Azubi bis Abschlussprüfung • Maik Stünkel',
        margin,
        pageHeight - 7
      );

      // Right footer with page number
      const pageStr = `Seite ${p} von ${totalPages}`;
      const pageStrWidth = doc.getTextWidth(pageStr);
      doc.text(pageStr, margin + contentWidth - pageStrWidth, pageHeight - 7);
    }
  };

  if (mode === 'single_week') {
    const weekPlan =
      TRAINING_PLAN_WEEKS.find(w => w.week === selectedWeek) || TRAINING_PLAN_WEEKS[0];
    const zone = TRAINING_ZONES[weekPlan.trainingZone];
    const isDone = completedWeeks.includes(weekPlan.week);
    const userNote = notes[weekPlan.week];

    addHeader(
      `FAB Trainingsplan – Woche ${weekPlan.week} (${weekPlan.phase})`,
      `Trainingsbereich: ${zone.name} (${zone.code}) • Distanz: ca. ${weekPlan.estimatedTotalDistance}m • Status: ${isDone ? 'Abgeschlossen [✓]' : 'Offen'}`
    );

    // Card 1: Common Warm-Up & Drills
    const card1Height = 44;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, currentY, contentWidth, card1Height, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 58, 138);
    doc.text('1. & 2. Einschwimmen & Technische Übungen', margin + 3, currentY + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    let c1Y = currentY + 10;
    doc.text('• 1. Einschwimmen (200m): 200m beliebig (locker, ruhiger Rhythmus zur Erwärmung)', margin + 4, c1Y);
    c1Y += 4.5;
    doc.text('• 2. Technische Übungen (gesamt 400m – Wähle Option 2a, 2b oder 2c):', margin + 4, c1Y);
    c1Y += 4.0;
    doc.text('   - Option 2a (Mini Lagen): 8x50m Lagenreihenfolge (z.B. Delfin/Rücken, Rücken/Brust, Brust/Kraul etc.)', margin + 6, c1Y);
    c1Y += 4.0;
    doc.text('   - Option 2b (Beliebige Lagen): 8x50m Technische Übungen (Wechselzüge, Antriebsübungen, Kontraste etc.)', margin + 6, c1Y);
    c1Y += 4.0;
    doc.text('   - Option 2c (Kraul Technik): 4x100m (je 100m: 25m Wechselzug, 25m Fingerspitzen, 25m Faust, 25m GSA)', margin + 6, c1Y);

    currentY += card1Height + 4;

    // Card 2: Diving Pre-fatigue set
    const card2Height = 25;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, currentY, contentWidth, card2Height, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 58, 138);
    doc.text('3. Tauchserie mit Vorbelastung (8x25m – Gesamt 200m)', margin + 3, currentY + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    let c2Y = currentY + 10;
    doc.text('• Serie: 8 x 25m (Gesamt 200m) mit je 15 Sekunden Pause zwischen den Wiederholungen', margin + 4, c2Y);
    c2Y += 4.2;
    doc.text('• Streckentauchen unter Vorbelastung: Abtauchen an Beckenwand, nach dem Auftauchen 2x einatmen,', margin + 4, c2Y);
    c2Y += 3.8;
    doc.text('  dann Streckentauchen.', margin + 6, c2Y);

    currentY += card2Height + 4;

    // Card 3: MAIN WORKOUT SET (HAUPTSERIE) - Highlighted
    doc.setFillColor(239, 246, 255); // blue-50
    doc.setDrawColor(191, 219, 254); // blue-200
    doc.roundedRect(margin, currentY, contentWidth, 68, 2.5, 2.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(29, 78, 216); // blue-700
    doc.text(`4. HAUPTSERIE – WOCHE ${weekPlan.week} (${zone.code} – ${zone.name})`, margin + 3, currentY + 6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`Schwerpunkt: ${weekPlan.title}`, margin + 3, currentY + 12);
    doc.text(`Serie: ${weekPlan.mainSet.series} (${weekPlan.mainSet.intensity})`, margin + 3, currentY + 17);
    doc.text(`Pause zwischen Wiederholungen: ${weekPlan.mainSet.pause}`, margin + 3, currentY + 22);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text('Übungsablauf & Teilstrecken:', margin + 3, currentY + 28);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    let stepY = currentY + 33;
    weekPlan.mainSet.exercises.forEach((ex, idx) => {
      doc.text(`• [${idx + 1}] ${ex}`, margin + 5, stepY);
      stepY += 4.5;
    });

    // Trainer note inside main set
    const tipText = (weekPlan.mainSet.tips && weekPlan.mainSet.tips[0]) || weekPlan.summary;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(2, 132, 199);
    doc.text(`Trainer-Tipp: ${tipText}`, margin + 3, currentY + 63);

    currentY += 72;

    // Card 4: Cool-Down
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, currentY, contentWidth, 14, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 58, 138);
    doc.text('5. Ausschwimmen', margin + 3, currentY + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text('• 200m beliebig – lockeres Ausschwimmen zur Laktat-Regeneration und Pulsabsenkung', margin + 4, currentY + 10);

    currentY += 18;

    // Card 5: Personal Notes / Checkbox area
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(margin, currentY, contentWidth, 24, 2, 2, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text('Persönliche Trainingsnotizen / Zeiten:', margin + 3, currentY + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    if (userNote && userNote.trim()) {
      const splitNotes = doc.splitTextToSize(userNote, contentWidth - 8);
      doc.text(splitNotes, margin + 3, currentY + 10);
    } else {
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(148, 163, 184);
      doc.text('(Keine Notizen hinterlegt. Nutze diesen Bereich für Zwischenzeiten oder Pulswerte.)', margin + 3, currentY + 11);
    }

    addFooters();
  } else {
    // Mode: all_weeks -> Comprehensive Multi-Page Plan
    // Page 1: Overview & Warm-Up
    addHeader(
      'Muster-Trainingsplan: FAB Azubi bis Abschlussprüfung',
      '12-Wochen-Gesamtübersicht • BDS e.V. Ausbildungsplan • Autor: Maik Stünkel'
    );

    // Precalculate row layouts with proper text wrapping
    const colWidths = {
      woche: 16,
      phase: 40,
      zone: 14,
      serie: 44,
      pause: 45,
      distanz: 19
    };

    const colX = {
      woche: margin + 3,
      phase: margin + 20,
      zone: margin + 61,
      serie: margin + 76,
      pause: margin + 121,
      distanz: margin + contentWidth - 3 // right-aligned
    };

    doc.setFontSize(6.8);
    const lineHeight = 3.0;

    const rowsData = TRAINING_PLAN_WEEKS.map(w => {
      const isDone = completedWeeks.includes(w.week);
      const phaseLines = doc.splitTextToSize(w.phase, colWidths.phase - 2);
      const seriesLines = doc.splitTextToSize(w.mainSet.series, colWidths.serie - 2);
      const pauseLines = doc.splitTextToSize(w.mainSet.pause, colWidths.pause - 2);
      const numLines = Math.max(phaseLines.length, seriesLines.length, pauseLines.length, 1);
      const rowHeight = numLines * lineHeight + 2.5;

      return {
        week: w.week,
        isDone,
        zone: w.trainingZone,
        distance: `${w.estimatedTotalDistance}m`,
        phaseLines,
        seriesLines,
        pauseLines,
        rowHeight
      };
    });

    const totalTableRowsHeight = rowsData.reduce((acc, r) => acc + r.rowHeight, 0);
    const tableHeaderHeight = 6.5;
    const tableTitleHeight = 7;
    const totalBoxHeight = tableTitleHeight + tableHeaderHeight + totalTableRowsHeight + 3;

    // Overview Table Container Box
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, currentY, contentWidth, totalBoxHeight, 2.5, 2.5, 'FD');

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 58, 138);
    doc.text('Übersicht aller 12 Ausbildungswochen', margin + 3.5, currentY + 5.5);

    // Table Header Bar
    let tableY = currentY + 8;
    doc.setFillColor(226, 232, 240);
    doc.rect(margin + 2, tableY, contentWidth - 4, tableHeaderHeight, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(15, 23, 42);
    doc.text('Woche', colX.woche, tableY + 4.2);
    doc.text('Phase / Schwerpunkt', colX.phase, tableY + 4.2);
    doc.text('Bereich', colX.zone, tableY + 4.2);
    doc.text('Hauptserie', colX.serie, tableY + 4.2);
    doc.text('Pausenvorgabe', colX.pause, tableY + 4.2);
    const distHeaderWidth = doc.getTextWidth('Distanz');
    doc.text('Distanz', colX.distanz - distHeaderWidth, tableY + 4.2);

    tableY += tableHeaderHeight;

    // Render Table Rows with Alternating Backgrounds & Text Wrapping
    rowsData.forEach((r, idx) => {
      // Row Background
      if (idx % 2 === 1) {
        doc.setFillColor(241, 245, 249); // slate-100
        doc.rect(margin + 2, tableY, contentWidth - 4, r.rowHeight, 'F');
      }

      // Divider line
      doc.setDrawColor(238, 242, 246);
      doc.line(margin + 2, tableY, margin + contentWidth - 2, tableY);

      doc.setFont('helvetica', r.isDone ? 'bold' : 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(r.isDone ? 16 : 51, r.isDone ? 185 : 65, r.isDone ? 129 : 85);

      // Week label
      doc.text(`W${r.week} ${r.isDone ? '[✓]' : '[ ]'}`, colX.woche, tableY + 3.2);

      // Phase / Focus (wrapped)
      doc.setTextColor(30, 41, 59);
      doc.text(r.phaseLines, colX.phase, tableY + 3.2);

      // Zone tag
      doc.setFont('helvetica', 'bold');
      if (r.zone === 'GA1') doc.setTextColor(3, 105, 161);
      else if (r.zone === 'GA2') doc.setTextColor(217, 119, 6);
      else doc.setTextColor(225, 29, 72);
      doc.text(r.zone, colX.zone, tableY + 3.2);

      // Main set series (wrapped)
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 41, 59);
      doc.text(r.seriesLines, colX.serie, tableY + 3.2);

      // Pause specification (wrapped)
      doc.setTextColor(71, 85, 105);
      doc.text(r.pauseLines, colX.pause, tableY + 3.2);

      // Distance (right aligned)
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      const distWidth = doc.getTextWidth(r.distance);
      doc.text(r.distance, colX.distanz - distWidth, tableY + 3.2);

      tableY += r.rowHeight;
    });

    currentY += totalBoxHeight + 5;

    // Einschwimmprogramm reference box
    const rahmenBoxHeight = 56;
    doc.setFillColor(239, 246, 255);
    doc.setDrawColor(191, 219, 254);
    doc.roundedRect(margin, currentY, contentWidth, rahmenBoxHeight, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(29, 78, 216);
    doc.text('Festes Rahmenprogramm (Vor & nach jeder Hauptserie)', margin + 3.5, currentY + 5.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(30, 41, 59);

    let rhY = currentY + 10.5;
    doc.setFont('helvetica', 'bold');
    doc.text('1. Einschwimmen (200m):', margin + 4, rhY);
    doc.setFont('helvetica', 'normal');
    doc.text('200m beliebig locker einschwimmen (GSA zur Erwärmung).', margin + 39, rhY);
    rhY += 4.2;

    doc.setFont('helvetica', 'bold');
    doc.text('2. Technische Übungen (gesamt 400m):', margin + 4, rhY);
    doc.setFont('helvetica', 'normal');
    doc.text('Wähle eine der drei Optionen (2a, 2b oder 2c):', margin + 57, rhY);
    rhY += 3.8;

    doc.setTextColor(51, 65, 85);
    doc.text('• Option 2a: 8x50m Mini Lagen (Lagenreihenfolge: Delfin/Rücken, Rücken/Brust, Brust/Kraul etc.)', margin + 7, rhY);
    rhY += 3.6;
    doc.text('• Option 2b: 8x50m Technische Übungen beliebige Lagen (Wechselzüge, Antriebsübungen, Kontraste)', margin + 7, rhY);
    rhY += 3.6;
    doc.text('• Option 2c: 4x100m Kraul-Technik (je 100m: 25m Wechselzug + 25m Fingerspitzen + 25m Faust + 25m GSA)', margin + 7, rhY);
    rhY += 4.4;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('3. Tauchserie mit Vorbelastung (200m):', margin + 4, rhY);
    rhY += 3.8;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text('• 8 x 25m Streckentauchen unter Vorbelastung (Pause: je 15 sec):', margin + 7, rhY);
    rhY += 3.6;
    doc.text('  Abtauchen an Beckenwand, nach dem Auftauchen 2x einatmen, dann Streckentauchen.', margin + 7, rhY);
    rhY += 4.4;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('4. HAUPTSERIE:', margin + 4, rhY);
    doc.setFont('helvetica', 'normal');
    doc.text('Wöchentlich wechselnder Schwerpunkt gemäß Wochenplan (siehe Folgeseiten).', margin + 28, rhY);
    rhY += 4.2;

    doc.setFont('helvetica', 'bold');
    doc.text('5. Ausschwimmen (200m):', margin + 4, rhY);
    doc.setFont('helvetica', 'normal');
    doc.text('200m beliebig lockeres Ausschwimmen zur Laktatbeseitigung und Regeneration.', margin + 41, rhY);

    currentY += rahmenBoxHeight + 5;

    // Trainingsbereiche Definition box
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, currentY, contentWidth, 42, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 58, 138);
    doc.text('Definition der Trainingsbereiche & Herzfrequenzen', margin + 3, currentY + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    const zoneDefLines = [
      '• GA1 (Grundlagenausdauer 1): 120–140 bpm | Aerobe Fett- & Kohlenhydratverbrennung | Ruhiger, gleichmäßiger Rhythmus.',
      '• GA2 (Grundlagenausdauer 2): 150–170 bpm | Aerob-anaerober Übergang | Höheres Tempo mit bewusster Pausenkontrolle.',
      '• SA (Schnelligkeitsausdauer): 175–195+ bpm (Maximal) | Laktatakkumulation / All-Out | Wettkampftempo & Prüfungssimulation.'
    ];
    doc.text(zoneDefLines, margin + 4, currentY + 11);

    // Pages 2 - 4: Detailed weeks (4 weeks per page)
    const weeksPerPage = 4;
    for (let i = 0; i < TRAINING_PLAN_WEEKS.length; i += weeksPerPage) {
      doc.addPage();
      const pageWeeks = TRAINING_PLAN_WEEKS.slice(i, i + weeksPerPage);
      const startW = pageWeeks[0].week;
      const endW = pageWeeks[pageWeeks.length - 1].week;

      addHeader(
        `Trainingspläne: Woche ${startW} bis ${endW}`,
        'Detaillierte Hauptserien, Pausenzeiten und Trainer-Tipps'
      );

      let cardY = currentY;
      pageWeeks.forEach(w => {
        const zone = TRAINING_ZONES[w.trainingZone];
        const isDone = completedWeeks.includes(w.week);

        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(margin, cardY, contentWidth, 54, 2, 2, 'FD');

        // Week Title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(30, 58, 138);
        doc.text(
          `Woche ${w.week}: ${w.phase}  [${w.trainingZone} – ${zone.name}]`,
          margin + 3,
          cardY + 5.5
        );

        if (isDone) {
          doc.setFontSize(8);
          doc.setTextColor(16, 185, 129);
          doc.text('✓ Absolviert', margin + contentWidth - 25, cardY + 5.5);
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        doc.text(`Serie: ${w.mainSet.series}   |   Pause: ${w.mainSet.pause}   |   Gesamtdistanz: ca. ${w.estimatedTotalDistance}m`, margin + 3, cardY + 11);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(51, 65, 85);
        let exY = cardY + 16.5;
        w.mainSet.exercises.forEach((ex, exIdx) => {
          doc.text(`• [${exIdx + 1}] ${ex}`, margin + 5, exY);
          exY += 4;
        });

        const tip = (w.mainSet.tips && w.mainSet.tips[0]) || w.summary;
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7);
        doc.setTextColor(2, 132, 199);
        doc.text(`Tipp: ${tip}`, margin + 3, cardY + 49.5);

        cardY += 58;
      });
    }

    addFooters();
  }

  const dateStr = new Date().toISOString().split('T')[0];
  const fileName =
    mode === 'single_week'
      ? `FAB_Trainingsplan_Woche_${selectedWeek}_${dateStr}.pdf`
      : `FAB_12_Wochen_Trainingsplan_${dateStr}.pdf`;

  return await saveAndDispatchPdf(
    doc,
    fileName,
    mode === 'single_week' ? 1 : 12,
    'FAB Azubi Trainingsplan',
    `FAB 12-Wochen-Mustertrainingsplan (PDF)`
  );
}


