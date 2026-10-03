import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { FLASHCARDS } from '../src/data/flashcards';
import { DEFAULT_PRESET_CATEGORIES, QUESTIONS } from '../src/data/questions';

export function buildCompleteExcelBuffer(): Buffer {
  const wb = XLSX.utils.book_new();

  // 1. Mapping for categories
  const categoryMap = new Map<string, { title: string; description: string }>();
  DEFAULT_PRESET_CATEGORIES.forEach(c => {
    categoryMap.set(c.id, { title: c.title, description: c.description || '' });
  });

  const getCategoryTitle = (id: string) => {
    return categoryMap.get(id)?.title || (id.charAt(0).toUpperCase() + id.slice(1));
  };

  // 2. Data for Sheet 1: Lernkarten
  const flashcardRows = FLASHCARDS.map((card, idx) => {
    const catTitle = getCategoryTitle(card.categoryId);
    return {
      'Nr.': idx + 1,
      'Rubrik': catTitle,
      'Frage / Thema': card.question.replace(/\\n/g, '\n'),
      'Antwort / Fachwissen': card.answer.replace(/\\n/g, '\n'),
      'Rubrik-Schlüssel': card.categoryId,
      'Karten-ID': card.id
    };
  });

  const wsFlashcards = XLSX.utils.json_to_sheet(flashcardRows);

  // Set column widths for Sheet 1
  wsFlashcards['!cols'] = [
    { wch: 6 },   // Nr.
    { wch: 25 },  // Rubrik
    { wch: 45 },  // Frage
    { wch: 75 },  // Antwort
    { wch: 18 },  // Rubrik-Schlüssel
    { wch: 14 }   // Karten-ID
  ];

  XLSX.utils.book_append_sheet(wb, wsFlashcards, `Lernkarten (${FLASHCARDS.length})`);

  // 3. Data for Sheet 2: Rubriken-Übersicht
  const cardCounts = new Map<string, number>();
  FLASHCARDS.forEach(c => {
    cardCounts.set(c.categoryId, (cardCounts.get(c.categoryId) || 0) + 1);
  });

  const categoryRows = DEFAULT_PRESET_CATEGORIES.map(cat => ({
    'Rubrik': cat.title,
    'Kartenanzahl': cardCounts.get(cat.id) || 0,
    'Beschreibung / Prüfungsrelevanz': cat.description || '',
    'Schlüssel': cat.id
  }));

  const wsCategories = XLSX.utils.json_to_sheet(categoryRows);
  wsCategories['!cols'] = [
    { wch: 25 }, // Rubrik
    { wch: 14 }, // Anzahl
    { wch: 60 }, // Beschreibung
    { wch: 18 }  // Schlüssel
  ];

  XLSX.utils.book_append_sheet(wb, wsCategories, 'Rubriken-Übersicht');

  // 4. Data for Sheet 3: Multiple-Choice Prüfungsfragen (25 Fragen)
  if (QUESTIONS && QUESTIONS.length > 0) {
    const mcRows = QUESTIONS.map((q, idx) => {
      const correctLetter = ['A', 'B', 'C', 'D'][q.correctAnswerIndex] || '';
      const correctText = q.options[q.correctAnswerIndex] || '';
      return {
        'Nr.': idx + 1,
        'Rubrik': getCategoryTitle(q.categoryId),
        'Prüfungsfrage': q.text,
        'Option A': q.options[0] || '',
        'Option B': q.options[1] || '',
        'Option C': q.options[2] || '',
        'Option D': q.options[3] || '',
        'Musterlösung (Buchstabe)': correctLetter,
        'Musterlösung (Text)': correctText,
        'Fachliche Erklärung': q.explanation || ''
      };
    });

    const wsMC = XLSX.utils.json_to_sheet(mcRows);
    wsMC['!cols'] = [
      { wch: 6 },  // Nr.
      { wch: 25 }, // Rubrik
      { wch: 50 }, // Frage
      { wch: 30 }, // A
      { wch: 30 }, // B
      { wch: 30 }, // C
      { wch: 30 }, // D
      { wch: 22 }, // Buchstabe
      { wch: 35 }, // Text
      { wch: 65 }  // Erklärung
    ];

    XLSX.utils.book_append_sheet(wb, wsMC, 'Prüfungsfragen MC (25)');
  }

  // Generate buffer in .xlsx format
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// Direct CLI execution
if (process.argv[1]?.endsWith('generate_all_cards_excel.ts')) {
  console.log('Generating Excel workbook...');
  const buffer = buildCompleteExcelBuffer();
  const publicDir = path.resolve(process.cwd(), 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  const outFile = path.join(publicDir, 'FAB_Lernkartei_Fragen_und_Antworten.xlsx');
  fs.writeFileSync(outFile, buffer);
  console.log(`Excel file created successfully: ${outFile} (${(buffer.length / 1024).toFixed(1)} KB)`);
}
