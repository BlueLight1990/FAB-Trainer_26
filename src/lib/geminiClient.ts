// Client-side and server-assisted Gemini API client
// Supports both direct standalone usage and backend-assisted verification

import { getApiUrl } from './api';

export const GEMINI_API_KEY_STORAGE_KEY = 'user_gemini_api_key';

export const sanitizeApiKey = (raw: string): string => {
  if (!raw) return '';
  let key = raw.trim();
  // Strip enclosing quotes, backticks, or brackets
  key = key.replace(/^["'`<]+|["'`>]+$/g, '').trim();
  // Strip common variable assignment prefixes
  key = key.replace(/^(?:GEMINI_API_KEY|API_KEY|KEY)\s*[:=]\s*/i, '').trim();
  key = key.replace(/^Bearer\s+/i, '').trim();
  return key;
};

export const getStoredGeminiApiKey = (): string => {
  if (typeof window === 'undefined') return '';
  const stored = localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY) || '';
  return sanitizeApiKey(stored);
};

export const setStoredGeminiApiKey = (key: string): void => {
  if (typeof window === 'undefined') return;
  const cleaned = sanitizeApiKey(key);
  if (!cleaned) {
    localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
  } else {
    localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, cleaned);
  }
};

export const checkServerGeminiStatus = async (): Promise<{ serverKeyAvailable: boolean; model?: string }> => {
  try {
    const res = await fetch(getApiUrl('/api/gemini-status'));
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Offline or server not reachable
  }
  return { serverKeyAvailable: false };
};

export const testGeminiApiKey = async (apiKey: string): Promise<{ ok: boolean; message: string }> => {
  const cleanKey = sanitizeApiKey(apiKey);
  if (!cleanKey) {
    return { ok: false, message: 'Bitte gib einen API-Schlüssel ein.' };
  }

  // 1. First priority: Direct official Google models list check.
  // This endpoint verifies key validity & API enablement instantly without triggering LLM 503 high-demand load.
  try {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cleanKey)}`;
    const listRes = await fetch(listUrl, {
      headers: {
        'Accept': 'application/json',
        'x-goog-api-key': cleanKey
      }
    });

    if (listRes.ok) {
      const listData = await listRes.json().catch(() => null);
      const models = (listData?.models || []).map((m: any) => m.name.replace('models/', ''));
      const activeModel = models.find((m: string) => m === 'gemini-3.6-flash' || m === 'gemini-3.7-flash' || m.includes('flash')) || 'gemini-flash';
      return {
        ok: true,
        message: `API-Schlüssel ist gültig und einsatzbereit! (Modell: ${activeModel})`
      };
    } else {
      const errJson = await listRes.json().catch(() => null);
      const errMsg = errJson?.error?.message || `HTTP ${listRes.status}`;

      if (listRes.status === 403 || errMsg.toLowerCase().includes('caller does not have permission')) {
        return {
          ok: false,
          message: `Berechtigungsfehler (403 Forbidden): "${errMsg}". Ursache: Der Google Cloud API-Schlüssel hat Anwendungsbeschränkungen (z. B. IP/Website-Sperre) oder die "Generative Language API" ist in deinem Google Cloud Projekt nicht aktiviert.`
        };
      }

      if (listRes.status === 400 && (errMsg.includes('API key not valid') || errMsg.includes('INVALID_ARGUMENT'))) {
        return {
          ok: false,
          message: `Ungültiger API-Schlüssel: ${errMsg}`
        };
      }
    }
  } catch (err) {
    console.warn('ListModels check unavailable, falling back to server/ping test:', err);
  }

  // 2. Try server-side validation via official SDK in backend
  try {
    const serverUrl = getApiUrl('/api/test-key');
    const serverRes = await fetch(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: cleanKey })
    });
    
    const serverData = await serverRes.json().catch(() => null);
    if (serverData && typeof serverData.ok === 'boolean') {
      return serverData;
    }
  } catch (e) {
    console.warn('Server test-key endpoint not reached, attempting direct client ping:', e);
  }

  // Modern models in order of preference
  const modernModels = [
    'gemini-3.8-flash',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',
    'gemini-3.1-pro-preview'
  ];
  let lastError = '';

  for (const model of modernModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(cleanKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': cleanKey
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Ping test' }] }]
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const errMsg = errJson?.error?.message || `HTTP ${res.status}`;
        lastError = errMsg;

        if (res.status === 403 || errMsg.toLowerCase().includes('caller does not have permission')) {
          return { 
            ok: false, 
            message: `Berechtigungsfehler (403 Forbidden): "${errMsg}". Ursache: Der Google Cloud API-Schlüssel hat Anwendungsbeschränkungen (z. B. IP/Website-Sperre) oder die "Generative Language API" ist in deinem Google Cloud Projekt nicht aktiviert.`
          };
        }

        if (res.status === 400 && errMsg.includes('API key not valid')) {
          return { ok: false, message: `Ungültiger API-Schlüssel: ${errMsg}` };
        }

        // If this specific model is experiencing 503 (high demand), 429 (rate limit) or 404 (not found), try next model!
        if (
          res.status === 503 ||
          res.status === 429 ||
          res.status === 404 ||
          errMsg.toLowerCase().includes('high demand') ||
          errMsg.toLowerCase().includes('unavailable') ||
          errMsg.includes('not found') ||
          errMsg.includes('no longer available')
        ) {
          continue;
        }

        return { ok: false, message: `Google API Fehler (${res.status}): ${errMsg}` };
      }

      return { ok: true, message: `API-Schlüssel ist gültig und einsatzbereit! (Modell: ${model})` };
    } catch (err: any) {
      lastError = err.message || 'Verbindung fehlgeschlagen';
    }
  }

  return { ok: false, message: `Verbindungstest fehlgeschlagen: ${lastError}` };
};

export interface ExtractImagePart {
  imageBase64: string;
  mimeType: string;
  label?: string;
}

export const extractFromImageDirect = async (
  apiKey: string,
  imageInput: string | ExtractImagePart[],
  mimeType: string = 'image/jpeg',
  type: 'glossary' | 'flashcard' = 'flashcard',
  mode: 'standard' | 'handwritten_cards' = 'standard'
): Promise<any[]> => {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    throw new Error('Kein Gemini API-Schlüssel hinterlegt.');
  }

  // Normalize into array of images
  const imageParts: ExtractImagePart[] = [];
  if (Array.isArray(imageInput)) {
    for (const item of imageInput) {
      if (item?.imageBase64) {
        imageParts.push({
          imageBase64: item.imageBase64,
          mimeType: item.mimeType || 'image/jpeg',
          label: item.label
        });
      }
    }
  } else if (typeof imageInput === 'string' && imageInput) {
    imageParts.push({
      imageBase64: imageInput,
      mimeType: mimeType || 'image/jpeg',
      label: 'Bild'
    });
  }

  if (imageParts.length === 0) {
    throw new Error('Kein Bild zur Analyse übergeben.');
  }

  const isGlossary = type === 'glossary';
  const isHandwritten = mode === 'handwritten_cards' || imageParts.some(p => p.label?.toLowerCase().includes('vorder') || p.label?.toLowerCase().includes('rück'));

  let promptStr = '';
  let schema: any = null;

  if (isGlossary) {
    promptStr = `Extrahiere alle Fachbegriffe und deren Definitionen/Erklärungen aus diesem Bild zum Thema Bäderbetrieb / Fachangestellter für Bäderbetriebe (FAB).
Formatierungsregeln:
- Behalte Absätze (\n\n), Aufzählungen (- Stichpunkt) und Zeilenumbrüche (\n) bei.
- Verwende Markdown-Fettschrift (**Begriff**) für wichtige Signalwörter und Grenzwerte.
- Sprache: Deutsch.`;
    schema = {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          term: { type: 'STRING' },
          definition: { type: 'STRING' }
        },
        required: ['term', 'definition']
      }
    };
  } else if (isHandwritten) {
    promptStr = `Du bist ein fachlicher Ausbildungs- und Prüfungsexperte für den Ausbildungsberuf "Fachangestellte/r für Bäderbetriebe (FAB)" und Experte für die Entzifferung handschriftlicher Notizen und Karteikarten.
Vor dir liegen Foto(s) von handgeschriebenen Karteikarten (Vorder- und Rückseite oder Einzelaufnahmen).

WICHTIGER AUFBAU DER KARTEIKARTEN:
- OBEN steht die RUBRIK (Themenbereich / Fachgebiet / Kategorie, z. B. 'Bädertechnik', 'Wasseraufbereitung', 'DIN 19643', 'Bäderbetrieb & Recht', 'Rettungslehre', 'Erste Hilfe', 'Chlorung', 'Schwimmen', 'Bäderhygiene', 'Arbeitssicherheit', etc.).
- Darunter folgt die FRAGE (bzw. Aufgabenstellung / Prüfungsfrage / Suchbegriff).
- RECHTS (oder auf der Rückseite) steht die ANTWORT (Lösung, Erklärung, Grenzwerte, Formeln, DIN-Normen oder Verhaltensregeln).

WICHTIGE FORMATIERUNGS- UND EXTRAKTIONSREGELN (Formatierung des Scans exakt übernehmen):
1. Extrahiere für jede Karteikarte präzise:
   - "rubrik": Die oben auf der Karteikarte stehende Rubrik (Themenbereich / Fachgebiet) genau so wie notiert (z. B. "Bädertechnik", "Erste Hilfe", "DIN 19643", "Wasseraufbereitung", etc.). Falls oben kein Rubrikname explizit notiert ist, leite eine passende fachliche Rubrik ab.
   - "question": Die Frage oder Aufgabenstellung von der Karteikarte (Vorderseite / linker Bereich).
   - "answer": Die Antwort (rechts daneben oder von der Rückseite).
2. Formatierung 1:1 übernehmen:
   - Fettgedruckt & Hervorhebungen: Setze handschriftlich unterstrichene, dick geschriebene, eingerahmte oder optisch hervorgehobene Signalwörter, Formeln, DIN-Normen und Grenzwerte in Markdown-Fettschrift (z. B. **DIN 19643**, **Freies Chlor: 0,3 - 0,6 mg/l**, **pH-Wert: 6,5 - 7,2**, **V = a · b · h**).
   - Absätze & Zeilenumbrüche: Behalte alle Zeilenumbrüche (\\n) und Absätze (\\n\\n) der Handschrift exakt bei. Niemals Aufzählungen oder Absätze zu einem einzigen Fließtextblock zusammenquetschen!
   - Aufzählungen & Listen: Übernimm handschriftliche Stichpunkte und Aufzählungen mit echten Zeilenumbrüchen und Spiegelstrichen (z. B. "- Punkt 1\\n- Punkt 2\\n- Punkt 3") oder Nummerierungen ("1. Schritt\\n2. Schritt").
3. Transkribiere die deutsche Handschrift gewissenhaft und lesbar. Korrigiere offensichtliche handschriftliche Flüchtigkeitsfehler behutsam, erhalte den fachlichen Sinn für FAB.
4. Wenn zwei Bilder (Vorderseite & Rückseite) vorliegen, führe Frage und Antwort als zusammengehöriges Lernkarten-Paar zusammen.
5. Falls auf einem Bild mehrere Karten oder Frage links und Antwort rechts nebeneinander stehen, extrahiere jede Karte als eigenständiges Objekt im Array.`;

    schema = {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          rubrik: { 
            type: 'STRING',
            description: 'Die oben auf der Karteikarte stehende Rubrik bzw. Themenbereich'
          },
          question: { 
            type: 'STRING',
            description: 'Präzise transkribierte Frage von der Karteikarte'
          },
          answer: { 
            type: 'STRING',
            description: 'Fachliche Antwort (rechts oder von der Rückseite)'
          }
        },
        required: ['question', 'answer']
      }
    };
  } else {
    // Flashcard default
    promptStr = `Extrahiere Lern-Karteikarten (Fragen und Antworten) aus diesem Bild zum Thema Bäderbetrieb / Fachangestellter für Bäderbetriebe (FAB).
Formatierungsregeln:
- Behalte Absätze (\\n\\n), Zeilenumbrüche (\\n) und Aufzählungen (- Stichpunkt) exakt bei.
- Verwende Markdown-Fettschrift (**wichtig**) für hervorgehobene Begriffe, Grenzwerte und Formeln.
- Sprache: Deutsch.`;
    schema = {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          question: { type: 'STRING' },
          answer: { type: 'STRING' }
        },
        required: ['question', 'answer']
      }
    };
  }

  // Modern models in order of preference
  const candidateModels = [
    'gemini-3.8-flash',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',
    'gemini-3.1-pro-preview'
  ];

  let lastErrorMsg = '';

  for (const modelName of candidateModels) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(cleanKey)}`;

    // Build multimodal parts
    const parts: any[] = [{ text: promptStr }];
    for (let idx = 0; idx < imageParts.length; idx++) {
      const img = imageParts[idx];
      if (img.label) {
        parts.push({ text: `Bild ${idx + 1} (${img.label}):` });
      }
      parts.push({
        inlineData: {
          mimeType: img.mimeType || 'image/jpeg',
          data: img.imageBase64
        }
      });
    }

    const bodyPayload: any = {
      contents: [
        {
          parts
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema
      }
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': cleanKey
        },
        body: JSON.stringify(bodyPayload)
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const errMsg = errJson?.error?.message || `HTTP ${res.status}`;
        lastErrorMsg = errMsg;
        
        // If 503 (high demand), 429 (rate limit), or 404 (not found), try next model candidate!
        if (
          res.status === 503 ||
          res.status === 429 ||
          res.status === 404 ||
          errMsg.toLowerCase().includes('high demand') ||
          errMsg.toLowerCase().includes('unavailable') ||
          errMsg.includes('not found') ||
          errMsg.includes('no longer available')
        ) {
          continue;
        }
        throw new Error(`Google Gemini Fehler (${res.status}): ${errMsg}`);
      }

      const data = await res.json();
      const textResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

      // Clean JSON string in case markdown code blocks are present
      let cleanJson = textResponse.trim();
      if (cleanJson.startsWith('```json')) {
        cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const parsed = JSON.parse(cleanJson);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      if (parsed && typeof parsed === 'object') {
        const firstArrayKey = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
        if (firstArrayKey) {
          return parsed[firstArrayKey];
        }
      }
      return [];
    } catch (err: any) {
      if (err.message?.includes('Google Gemini Fehler')) {
        throw err;
      }
      lastErrorMsg = err.message;
    }
  }

  throw new Error(`Konnte die Analyse nicht durchführen: ${lastErrorMsg}`);
};

export interface FlashcardInputForGlossary {
  id?: string;
  question: string;
  answer: string;
  mediaUrl?: string;
}

export interface ConvertedGlossaryResult {
  id: string;
  sourceFlashcardId?: string;
  originalQuestion: string;
  originalAnswer: string;
  mediaUrl?: string;
  term: string;
  definition: string;
}

/**
 * Converts one or multiple flashcards into glossary entries using AI.
 * Tries server-side first (via /api/flashcard-to-glossary) and falls back to client direct call.
 */
export const convertFlashcardsToGlossaryWithAI = async (
  cards: FlashcardInputForGlossary[]
): Promise<ConvertedGlossaryResult[]> => {
  if (!cards || cards.length === 0) {
    return [];
  }

  const currentApiKey = getStoredGeminiApiKey();

  // 1. Try server-assisted endpoint
  try {
    const targetUrl = getApiUrl('/api/flashcard-to-glossary');
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        cards: cards.map(c => ({
          question: c.question,
          answer: c.answer
        })),
        apiKey: currentApiKey || undefined
      })
    });

    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && Array.isArray(data.results) && data.results.length > 0) {
        return data.results.map((r: any, idx: number) => {
          const matchingCard = cards[idx] || cards[0];
          return {
            id: `gl_conv_${Date.now()}_${idx}`,
            sourceFlashcardId: matchingCard?.id,
            originalQuestion: matchingCard?.question || '',
            originalAnswer: matchingCard?.answer || '',
            mediaUrl: matchingCard?.mediaUrl,
            term: (r.term || '').trim(),
            definition: (r.definition || '').trim()
          };
        });
      }
    } else if (!currentApiKey) {
      const errData = await res.json().catch(() => null);
      throw new Error(errData?.error || `Serverfehler (${res.status})`);
    }
  } catch (serverErr: any) {
    if (!currentApiKey) {
      throw serverErr;
    }
    console.warn('Server conversion unavailable, falling back to direct client API call:', serverErr);
  }

  // 2. Direct client-side fallback
  if (!currentApiKey) {
    throw new Error('Kein API-Schlüssel hinterlegt. Bitte trage deinen Gemini API-Schlüssel in den Einstellungen ein.');
  }

  const promptStr = `Du bist ein fachlicher Ausbildungs- und Prüfungsexperte für den Ausbildungsberuf Fachangestellte/r für Bäderbetriebe (FAB).
Wandle die folgenden Lernkarten (Frage und Antwort) in prägnante, professionelle Glossar-Einträge für das Bäder-Fachglossar um.
Regeln:
1. 'term': Der konkrete Fachbegriff, das Schlagwort oder die Kernbezeichnung (z. B. "Freies Chlor", "Totraum", "Rautek-Griff", "DIN 19643", "Hypochlorige Säure").
2. 'definition': Eine klare, präzise und fachlich korrekte Begriffsdefinition/Erklärung, die die Kerninformationen der Karte verständlich und nachschlagbar zusammenfasst.
3. Sprache: Deutsch.
4. Gib für jede übergebene Lernkarte genau ein JSON-Objekt mit 'term' und 'definition' zurück.

Lernkarten:
${JSON.stringify(cards.map(c => ({ question: c.question, answer: c.answer })), null, 2)}`;

  const schema = {
    type: 'ARRAY',
    items: {
      type: 'OBJECT',
      properties: {
        term: { type: 'STRING' },
        definition: { type: 'STRING' }
      },
      required: ['term', 'definition']
    }
  };

  const candidateModels = [
    'gemini-3.8-flash',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',
    'gemini-3.1-pro-preview'
  ];

  let lastErrorMsg = '';

  for (const modelName of candidateModels) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(currentApiKey)}`;

    const bodyPayload: any = {
      contents: [
        {
          parts: [{ text: promptStr }]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema
      }
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': currentApiKey
        },
        body: JSON.stringify(bodyPayload)
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const errMsg = errJson?.error?.message || `HTTP ${res.status}`;
        lastErrorMsg = errMsg;
        if (
          res.status === 503 ||
          res.status === 429 ||
          res.status === 404 ||
          errMsg.toLowerCase().includes('high demand') ||
          errMsg.toLowerCase().includes('unavailable')
        ) {
          continue;
        }
        throw new Error(`Google Gemini Fehler (${res.status}): ${errMsg}`);
      }

      const data = await res.json();
      const textResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

      let cleanJson = textResponse.trim();
      if (cleanJson.startsWith('```json')) {
        cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const parsed = JSON.parse(cleanJson);
      const items = Array.isArray(parsed) ? parsed : [];
      
      return items.map((r: any, idx: number) => {
        const matchingCard = cards[idx] || cards[0];
        return {
          id: `gl_conv_${Date.now()}_${idx}`,
          sourceFlashcardId: matchingCard?.id,
          originalQuestion: matchingCard?.question || '',
          originalAnswer: matchingCard?.answer || '',
          mediaUrl: matchingCard?.mediaUrl,
          term: (r.term || '').trim(),
          definition: (r.definition || '').trim()
        };
      });
    } catch (err: any) {
      if (err.message?.includes('Google Gemini Fehler')) {
        throw err;
      }
      lastErrorMsg = err.message;
    }
  }

  throw new Error(`Konnte die Umwandlung nicht durchführen: ${lastErrorMsg}`);
};

/**
 * Formulates a high-quality definition/explanation for a given glossary term using AI.
 * Tries server endpoint /api/generate-definition first, falls back to direct client call.
 */
export const generateDefinitionWithAI = async (
  term: string,
  context?: string
): Promise<string> => {
  const cleanTerm = (term || '').trim();
  if (!cleanTerm) {
    throw new Error('Bitte gib einen Begriff / eine Fachbezeichnung ein.');
  }

  const currentApiKey = getStoredGeminiApiKey();

  // 1. Try server-assisted route
  try {
    const targetUrl = getApiUrl('/api/generate-definition');
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        term: cleanTerm,
        context: context || undefined,
        apiKey: currentApiKey || undefined
      })
    });

    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && typeof data.definition === 'string' && data.definition.trim()) {
        return data.definition.trim();
      }
    } else if (!currentApiKey) {
      const errData = await res.json().catch(() => null);
      throw new Error(errData?.error || `Serverfehler (${res.status})`);
    }
  } catch (serverErr: any) {
    if (!currentApiKey) {
      throw serverErr;
    }
    console.warn('Server definition generation unavailable, attempting direct client call:', serverErr);
  }

  // 2. Direct client fallback
  if (!currentApiKey) {
    throw new Error('Kein API-Schlüssel hinterlegt. Bitte trage deinen Gemini API-Schlüssel in den Einstellungen ein.');
  }

  const promptStr = `Du bist ein fachlicher Ausbilder und Prüfungsexperte für den Ausbildungsberuf "Fachangestellte/r für Bäderbetriebe (FAB)".
Formuliere eine präzise, fachlich fundierte und leicht verständliche Definition bzw. Erklärung für folgenden Fachbegriff im Bäderwesen / Schwimmbadbetrieb:

Fachbegriff: "${cleanTerm}"
${context ? `Zusatzkontext: "${context}"` : ''}

Anforderungen an die Erklärung:
1. Kläre zuerst die Kernbedeutung des Begriffs für den Bäderbetrieb (z. B. Wasseraufbereitung, Bädertechnik, Rettungsdienst/Sicherheit, Hygiene, Chemie, Physik, Rechtskunde oder Badebetrieb).
2. Erwähne, falls fachlich relevant, wichtige Grenzwerte, Einheiten, DIN-Normen (z. B. DIN 19643, GUV/DGUV) oder gesetzliche Vorschriften.
3. Formuliere flüssig auf Deutsch im verständlichen Glossar-Stil (ca. 2-5 prägnante Sätze oder Absätze mit Bulletpoints bei Aufzählungen).
4. Keine Metadaten oder Einleitungssätze wie "Hier ist die Erklärung:", sondern direkt den Text der Definition.`;

  const candidateModels = [
    'gemini-3.8-flash',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',
    'gemini-3.1-pro-preview'
  ];

  let lastErrorMsg = '';

  for (const modelName of candidateModels) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(currentApiKey)}`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': currentApiKey
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptStr }] }]
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const errMsg = errJson?.error?.message || `HTTP ${res.status}`;
        lastErrorMsg = errMsg;
        if (
          res.status === 503 ||
          res.status === 429 ||
          res.status === 404 ||
          errMsg.toLowerCase().includes('high demand') ||
          errMsg.toLowerCase().includes('unavailable')
        ) {
          continue;
        }
        throw new Error(`Google Gemini Fehler (${res.status}): ${errMsg}`);
      }

      const data = await res.json();
      const textResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (textResponse.trim()) {
        return textResponse.trim();
      }
    } catch (err: any) {
      if (err.message?.includes('Google Gemini Fehler')) {
        throw err;
      }
      lastErrorMsg = err.message;
    }
  }

  throw new Error(`Konnte die Erklärung nicht generieren: ${lastErrorMsg}`);
};

/**
 * Formulates a flashcard answer for a given question using AI.
 */
export const generateCardAnswerWithAI = async (
  question: string,
  category?: string
): Promise<string> => {
  const cleanQ = (question || '').trim();
  if (!cleanQ) {
    throw new Error('Bitte gib eine Frage / Aufgabenstellung ein.');
  }

  const currentApiKey = getStoredGeminiApiKey();

  // 1. Try server-assisted route
  try {
    const targetUrl = getApiUrl('/api/generate-card-answer');
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        question: cleanQ,
        category: category || undefined,
        apiKey: currentApiKey || undefined
      })
    });

    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && typeof data.answer === 'string' && data.answer.trim()) {
        return data.answer.trim();
      }
    } else if (!currentApiKey) {
      const errData = await res.json().catch(() => null);
      throw new Error(errData?.error || `Serverfehler (${res.status})`);
    }
  } catch (serverErr: any) {
    if (!currentApiKey) {
      throw serverErr;
    }
    console.warn('Server card answer generation unavailable, attempting direct client call:', serverErr);
  }

  // 2. Direct client fallback
  if (!currentApiKey) {
    throw new Error('Kein API-Schlüssel hinterlegt. Bitte trage deinen Gemini API-Schlüssel in den Einstellungen ein.');
  }

  const promptStr = `Du bist ein fachlicher Ausbilder und Prüfungsexperte für den Ausbildungsberuf "Fachangestellte/r für Bäderbetriebe (FAB)".
Beantworte die folgende Prüfungs- oder Lernkartenfrage fachlich fundiert, strukturiert und präzise für die Rückseite einer Lernkarte:

Frage / Thema: "${cleanQ}"
${category ? `Themenbereich / Rubrik: "${category}"` : ''}

Anforderungen an die Antwort:
1. Klare, korrekte und prüfungsrelevante Fakten für FAB.
2. Wenn relevant: Grenzwerte, Formeln, DIN-Normen (z. B. DIN 19643) oder Sicherheitsregeln.
3. Sprache: Deutsch.
4. Direkt die Antwort ohne Einleitung wie "Die Antwort lautet:".`;

  const candidateModels = [
    'gemini-3.8-flash',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',
    'gemini-3.1-pro-preview'
  ];

  let lastErrorMsg = '';

  for (const modelName of candidateModels) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(currentApiKey)}`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': currentApiKey
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptStr }] }]
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const errMsg = errJson?.error?.message || `HTTP ${res.status}`;
        lastErrorMsg = errMsg;
        if (
          res.status === 503 ||
          res.status === 429 ||
          res.status === 404 ||
          errMsg.toLowerCase().includes('high demand') ||
          errMsg.toLowerCase().includes('unavailable')
        ) {
          continue;
        }
        throw new Error(`Google Gemini Fehler (${res.status}): ${errMsg}`);
      }

      const data = await res.json();
      const textResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (textResponse.trim()) {
        return textResponse.trim();
      }
    } catch (err: any) {
      if (err.message?.includes('Google Gemini Fehler')) {
        throw err;
      }
      lastErrorMsg = err.message;
    }
  }

  throw new Error(`Konnte die Antwort nicht generieren: ${lastErrorMsg}`);
};


