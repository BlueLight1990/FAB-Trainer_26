import { jsPDF } from 'jspdf';
import * as fs from 'fs';
import * as path from 'path';
import { FLASHCARDS } from '../src/data/flashcards';
import { DEFAULT_PRESET_CATEGORIES, QUESTIONS } from '../src/data/questions';

function sanitizePdfText(raw: string): string {
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
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

export function buildCompletePdf(): Buffer {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const leftMargin = 20; // 20mm left binder margin for filing in school folders (Schulordner)
  const rightMargin = 14;
  const topMargin = 16;
  const bottomMargin = 16;
  const contentWidth = pageWidth - leftMargin - rightMargin;

  let currentY = topMargin;
  const dateStr = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // Map of category titles
  const categoryMap = new Map<string, string>();
  DEFAULT_PRESET_CATEGORIES.forEach(c => categoryMap.set(c.id, c.title));

  const getCategoryTitle = (id: string) => {
    return categoryMap.get(id) || (id.charAt(0).toUpperCase() + id.slice(1));
  };

  // Draw DIN standard 2-hole and 4-hole European binder punch hole guidelines
  const drawPunchHoleMarkers = () => {
    doc.setDrawColor(203, 213, 225); // slate-300
    doc.setLineWidth(0.2);
    // Center fold tick
    doc.line(2, pageHeight / 2, 6, pageHeight / 2);
    // Standard DIN 80mm punch marks (center - 40mm and center + 40mm)
    doc.line(2, pageHeight / 2 - 40, 5, pageHeight / 2 - 40);
    doc.line(2, pageHeight / 2 + 40, 5, pageHeight / 2 + 40);
  };

  // Add running header
  const addHeader = (isFirstPage: boolean) => {
    drawPunchHoleMarkers();

    if (isFirstPage) {
      // Header Banner
      doc.setFillColor(30, 41, 59); // slate-800 deep navy
      doc.roundedRect(leftMargin, currentY, contentWidth, 26, 2, 2, 'F');

      // Title
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('FAB Trainer – Gesamtkatalog Fragen & Antworten', leftMargin + 6, currentY + 10);

      // Subtitle
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(226, 232, 240); // slate-200
      doc.text(
        `Prüfungsvorbereitung Fachangestellte/r für Bäderbetriebe • Stand: ${dateStr}`,
        leftMargin + 6,
        currentY + 17
      );

      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(
        `Prüfungskatalog: ${FLASHCARDS.length} Lernkarten + 25 Prüfungsfragen nach Rubriken`,
        leftMargin + 6,
        currentY + 22.5
      );

      currentY += 38;
    } else {
      // Running Header on subsequent pages
      doc.setTextColor(100, 116, 139); // slate-500
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('FAB Trainer • Gesamtkatalog: Fragen, Antworten & Rubriken', leftMargin, currentY);
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
      doc.text('FAB Trainer • Offizieller Ausbildungs- & Prüfungskatalog (Schulordner-Ausgabe)', leftMargin, pageHeight - 6.5);
    }
  };

  // 1. First Page Header
  addHeader(true);

  // Group Flashcards by category
  const cardsByCategory = new Map<string, typeof FLASHCARDS>();
  FLASHCARDS.forEach(c => {
    const cat = c.categoryId;
    if (!cardsByCategory.has(cat)) {
      cardsByCategory.set(cat, []);
    }
    cardsByCategory.get(cat)!.push(c);
  });

  // Table of Contents / Overview Box
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  const tocBoxY = currentY;
  
  // Calculate TOC height
  const catEntries = Array.from(cardsByCategory.entries());
  const half = Math.ceil(catEntries.length / 2);
  const leftCol = catEntries.slice(0, half);
  const rightCol = catEntries.slice(half);
  const tocRows = Math.max(leftCol.length, rightCol.length);
  const tocBoxHeight = 14 + (tocRows * 4.6) + 4;

  doc.roundedRect(leftMargin, tocBoxY, contentWidth, tocBoxHeight, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59); // slate-800
  doc.text(`Themenübersicht der Lernkartei (${FLASHCARDS.length} Fragen):`, leftMargin + 5, tocBoxY + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105); // slate-600

  let tocLineY = tocBoxY + 13;
  for (let r = 0; r < tocRows; r++) {
    if (leftCol[r]) {
      const [catId, cards] = leftCol[r];
      const title = getCategoryTitle(catId);
      doc.text(`• ${title}: ${cards.length} ${cards.length === 1 ? 'Frage' : 'Fragen'}`, leftMargin + 6, tocLineY);
    }
    if (rightCol[r]) {
      const [catId, cards] = rightCol[r];
      const title = getCategoryTitle(catId);
      doc.text(`• ${title}: ${cards.length} ${cards.length === 1 ? 'Frage' : 'Fragen'}`, leftMargin + (contentWidth / 2) + 4, tocLineY);
    }
    tocLineY += 4.6;
  }

  currentY += tocBoxHeight + 8;

  // Render Flashcards grouped by category
  let globalCardIndex = 1;

  for (const [catId, cards] of cardsByCategory.entries()) {
    const catTitle = getCategoryTitle(catId);

    // Section Header for the category
    if (currentY + 28 > pageHeight - bottomMargin) {
      doc.addPage();
      currentY = topMargin;
      addHeader(false);
    }

    doc.setFillColor(241, 245, 249); // slate-100
    doc.roundedRect(leftMargin, currentY, contentWidth, 9, 1.5, 1.5, 'F');
    doc.setFillColor(37, 99, 235); // blue-600 left accent tab
    doc.roundedRect(leftMargin, currentY, 3, 9, 1, 1, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59); // slate-800
    doc.text(`Rubrik: ${catTitle} (${cards.length} Fragen)`, leftMargin + 6, currentY + 6.2);
    currentY += 15;

    for (const card of cards) {
      // Clean and sanitize texts
      const qClean = sanitizePdfText(card.question || '');
      const aClean = sanitizePdfText(card.answer || '');

      // Measure question
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      const qLines = doc.splitTextToSize(qClean, contentWidth - 8);
      const qHeight = qLines.length * 4.6;

      // Measure answer
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const ansLines = doc.splitTextToSize(aClean, contentWidth - 14);
      const ansHeight = ansLines.length * 4.1 + 8; // text + padding + label

      const cardTotalHeight = 8 + qHeight + ansHeight + 6;

      // Check page overflow
      if (currentY + cardTotalHeight > pageHeight - bottomMargin) {
        doc.addPage();
        currentY = topMargin;
        addHeader(false);
      }

      // Card Header / Badge
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(37, 99, 235); // blue-600
      doc.text(`Frage ${globalCardIndex} von ${FLASHCARDS.length}`, leftMargin + 2, currentY + 3.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text(`[Rubrik: ${catTitle}]`, leftMargin + 40, currentY + 3.5);

      currentY += 8;

      // Question Text
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text(qLines, leftMargin + 2, currentY);
      currentY += qHeight + 3;

      // Answer Box (light slate with emerald accent)
      doc.setFillColor(248, 250, 252); // slate-50
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.roundedRect(leftMargin + 2, currentY, contentWidth - 4, ansHeight, 1.5, 1.5, 'FD');

      // Left vertical accent line (green)
      doc.setFillColor(16, 185, 129); // emerald-500
      doc.roundedRect(leftMargin + 2, currentY, 1.5, ansHeight, 0.5, 0.5, 'F');

      // Answer Header Label
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(5, 150, 105); // emerald-600
      doc.text('Antwort / Fachlösung:', leftMargin + 6, currentY + 4.2);

      // Answer Content
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(30, 41, 59); // slate-800
      doc.text(ansLines, leftMargin + 6, currentY + 8.5);

      currentY += ansHeight + 4;

      // Subtle separator line
      doc.setDrawColor(241, 245, 249);
      doc.line(leftMargin, currentY, leftMargin + contentWidth, currentY);
      currentY += 4;

      globalCardIndex++;
    }
  }

  // Section 2: Multiple-Choice Prüfungsfragenkatalog (25 Fragen)
  if (QUESTIONS.length > 0) {
    doc.addPage();
    currentY = topMargin;
    addHeader(false);

    // Section title
    doc.setFillColor(30, 41, 59); // slate-800
    doc.roundedRect(leftMargin, currentY, contentWidth, 14, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Anhang: Ergänzender Multiple-Choice Fragenkatalog (25 Prüfungsfragen)', leftMargin + 6, currentY + 6.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(226, 232, 240);
    doc.text('Klausurfragen inklusive markierter Musterlösung und Begründung', leftMargin + 6, currentY + 11);

    currentY += 20;

    let qIdx = 1;
    for (const q of QUESTIONS) {
      const catTitle = getCategoryTitle(q.categoryId);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      const qLines = doc.splitTextToSize(`${qIdx}. ${q.text}`, contentWidth - 8);
      const qHeight = qLines.length * 4.6;

      const optHeights: { lines: string[]; height: number; isCorrect: boolean }[] = [];
      q.options.forEach((opt, oIdx) => {
        const isCorrect = oIdx === q.correctAnswerIndex;
        doc.setFont('helvetica', isCorrect ? 'bold' : 'normal');
        doc.setFontSize(8.5);
        const prefix = isCorrect ? '[X] ' : '[  ] ';
        const optLines = doc.splitTextToSize(`${prefix}${opt}`, contentWidth - 16);
        optHeights.push({
          lines: optLines,
          height: optLines.length * 4 + 1.5,
          isCorrect
        });
      });

      const totalOptHeight = optHeights.reduce((acc, h) => acc + h.height, 0);

      // Measure explanation
      let expHeight = 0;
      let expLines: string[] = [];
      if (q.explanation) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        expLines = doc.splitTextToSize(`Erklärung: ${q.explanation}`, contentWidth - 16);
        expHeight = expLines.length * 3.8 + 6;
      }

      const totalQuestionHeight = 7 + qHeight + totalOptHeight + expHeight + 8;

      if (currentY + totalQuestionHeight > pageHeight - bottomMargin) {
        doc.addPage();
        currentY = topMargin;
        addHeader(false);
      }

      // Rubrik Tag
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(37, 99, 235);
      doc.text(`Prüfungsfrage ${qIdx}`, leftMargin + 2, currentY + 3);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(`[Rubrik: ${catTitle}]`, leftMargin + 32, currentY + 3);
      currentY += 7;

      // Question text
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(qLines, leftMargin + 2, currentY);
      currentY += qHeight + 2;

      // Options
      optHeights.forEach(opt => {
        if (opt.isCorrect) {
          doc.setFillColor(240, 253, 244); // green-50
          doc.roundedRect(leftMargin + 4, currentY - 1, contentWidth - 8, opt.height + 0.5, 1, 1, 'F');
          doc.setTextColor(22, 101, 52); // green-800
          doc.setFont('helvetica', 'bold');
        } else {
          doc.setTextColor(51, 65, 85); // slate-700
          doc.setFont('helvetica', 'normal');
        }
        doc.setFontSize(8.5);
        doc.text(opt.lines, leftMargin + 6, currentY + 2.5);
        currentY += opt.height;
      });

      // Explanation
      if (expHeight > 0) {
        currentY += 2;
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(leftMargin + 4, currentY, contentWidth - 8, expHeight - 2, 1, 1, 'F');
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        doc.text(expLines, leftMargin + 6, currentY + 4);
        currentY += expHeight;
      }

      currentY += 4;
      doc.setDrawColor(241, 245, 249);
      doc.line(leftMargin, currentY, leftMargin + contentWidth, currentY);
      currentY += 4;

      qIdx++;
    }
  }

  // Add all footers
  addFooters();

  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}

// If executed directly
if (process.argv[1]?.endsWith('generate_all_questions_pdf.ts')) {
  console.log('Generating complete PDF with all questions and answers...');
  const pdfBuffer = buildCompletePdf();
  const outDir = path.resolve(process.cwd(), 'public');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const outFile = path.join(outDir, 'FAB_Lernkartei_Fragen_und_Antworten_Komplett.pdf');
  fs.writeFileSync(outFile, pdfBuffer);
  console.log(`Saved successfully to ${outFile} (${(pdfBuffer.length / 1024).toFixed(1)} KB)`);
}
