import * as XLSX from 'xlsx';
import { Flashcard, Category, Question } from '../types';

export interface ExcelExportOptions {
  fileName?: string;
  categories?: Category[];
  questions?: Question[];
}

export const exportCardsToExcel = (
  cards: Flashcard[],
  categories: Category[],
  options: ExcelExportOptions = {}
): void => {
  const wb = XLSX.utils.book_new();

  // Category map
  const catMap = new Map<string, string>();
  categories.forEach(c => catMap.set(c.id, c.title));

  const getCatTitle = (catId: string) => {
    return catMap.get(catId) || (catId.charAt(0).toUpperCase() + catId.slice(1));
  };

  // 1. Sheet: Lernkarten
  const cardRows = cards.map((c, idx) => ({
    'Nr.': idx + 1,
    'Rubrik': getCatTitle(c.categoryId),
    'Frage / Thema': (c.question || '').replace(/\\n/g, '\n'),
    'Antwort / Fachwissen': (c.answer || '').replace(/\\n/g, '\n'),
    'Rubrik-ID': c.categoryId,
    'Karten-ID': c.id
  }));

  const wsCards = XLSX.utils.json_to_sheet(cardRows);
  wsCards['!cols'] = [
    { wch: 6 },
    { wch: 25 },
    { wch: 45 },
    { wch: 75 },
    { wch: 18 },
    { wch: 16 }
  ];
  XLSX.utils.book_append_sheet(wb, wsCards, `Lernkarten (${cards.length})`);

  // 2. Sheet: Rubriken-Übersicht
  const cardCounts = new Map<string, number>();
  cards.forEach(c => {
    cardCounts.set(c.categoryId, (cardCounts.get(c.categoryId) || 0) + 1);
  });

  const catRows = categories.map(cat => ({
    'Rubrik': cat.title,
    'Kartenanzahl': cardCounts.get(cat.id) || 0,
    'Beschreibung': cat.description || '',
    'Rubrik-ID': cat.id
  }));

  const wsCats = XLSX.utils.json_to_sheet(catRows);
  wsCats['!cols'] = [
    { wch: 25 },
    { wch: 14 },
    { wch: 60 },
    { wch: 18 }
  ];
  XLSX.utils.book_append_sheet(wb, wsCats, 'Rubriken-Übersicht');

  // 3. Sheet: Prüfungsfragen (if provided)
  if (options.questions && options.questions.length > 0) {
    const qRows = options.questions.map((q, idx) => {
      const correctLetter = ['A', 'B', 'C', 'D'][q.correctAnswerIndex] || '';
      const correctText = q.options[q.correctAnswerIndex] || '';
      return {
        'Nr.': idx + 1,
        'Rubrik': getCatTitle(q.categoryId),
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

    const wsQ = XLSX.utils.json_to_sheet(qRows);
    wsQ['!cols'] = [
      { wch: 6 },
      { wch: 25 },
      { wch: 50 },
      { wch: 30 },
      { wch: 30 },
      { wch: 30 },
      { wch: 30 },
      { wch: 22 },
      { wch: 35 },
      { wch: 65 }
    ];
    XLSX.utils.book_append_sheet(wb, wsQ, `Prüfungsfragen (${options.questions.length})`);
  }

  const fileName = options.fileName || 'FAB_Lernkartei_Fragen_und_Antworten.xlsx';
  XLSX.writeFile(wb, fileName);
};
