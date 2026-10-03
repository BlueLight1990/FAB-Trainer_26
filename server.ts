import express from "express";
import path from "path";
import * as fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import * as dotenv from 'dotenv';
import { buildCompletePdf } from "./scripts/generate_all_questions_pdf";
import { buildCompleteExcelBuffer } from "./scripts/generate_all_cards_excel";
dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Enable CORS for mobile app (Capacitor) requests
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Serve static public folder files (PDFs, worker scripts, assets)
  app.use(express.static(path.join(process.cwd(), 'public')));

  // Increase payload limit for base64 images
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  const defaultAi = process.env.GEMINI_API_KEY
    ? new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      })
    : null;

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // Download PDF route: All questions, answers & categories
  app.get("/api/download/alle-fragen-pdf", (req, res) => {
    try {
      const publicDir = path.join(process.cwd(), 'public');
      const pdfPath = path.join(publicDir, 'FAB_Lernkartei_Fragen_und_Antworten_Komplett.pdf');
      
      let pdfBuffer: Buffer;
      if (fs.existsSync(pdfPath)) {
        pdfBuffer = fs.readFileSync(pdfPath);
      } else {
        pdfBuffer = buildCompletePdf();
        if (!fs.existsSync(publicDir)) {
          fs.mkdirSync(publicDir, { recursive: true });
        }
        fs.writeFileSync(pdfPath, pdfBuffer);
      }

      const isInline = req.query.inline === 'true' || req.query.inline === '1';
      const disposition = isInline ? 'inline' : 'attachment';

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `${disposition}; filename="FAB_Lernkartei_Fragen_und_Antworten_Komplett.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (err: any) {
      console.error('Error generating/serving PDF:', err);
      res.status(500).send('Fehler beim Erstellen der PDF-Datei.');
    }
  });

  // Download Excel route: All flashcards, categories & questions
  app.get("/api/download/alle-karten-excel", (req, res) => {
    try {
      const publicDir = path.join(process.cwd(), 'public');
      const excelPath = path.join(publicDir, 'FAB_Lernkartei_Fragen_und_Antworten.xlsx');

      let excelBuffer: Buffer;
      if (fs.existsSync(excelPath)) {
        excelBuffer = fs.readFileSync(excelPath);
      } else {
        excelBuffer = buildCompleteExcelBuffer();
        if (!fs.existsSync(publicDir)) {
          fs.mkdirSync(publicDir, { recursive: true });
        }
        fs.writeFileSync(excelPath, excelBuffer);
      }

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="FAB_Lernkartei_Fragen_und_Antworten.xlsx"');
      res.setHeader('Content-Length', excelBuffer.length);
      res.send(excelBuffer);
    } catch (err: any) {
      console.error('Error generating/serving Excel file:', err);
      res.status(500).send('Fehler beim Erstellen der Excel-Datei.');
    }
  });

  // Endpoint to check if server has built-in Gemini capability
  app.get("/api/gemini-status", (req, res) => {
    res.json({
      serverKeyAvailable: !!process.env.GEMINI_API_KEY,
      model: "gemini-3.7-flash"
    });
  });

  // Helper to extract human-friendly error message from Google API responses
  const parseGeminiError = (error: any): { status: number; message: string } => {
    const rawMsg = error?.message || String(error);
    let extracted = rawMsg;
    try {
      const parsed = JSON.parse(rawMsg);
      if (parsed?.error?.message) {
        extracted = parsed.error.message;
      }
    } catch {
      // Not raw JSON
    }

    if (rawMsg.includes("403") || rawMsg.includes("caller does not have permission")) {
      return {
        status: 403,
        message: 'Berechtigungsfehler (403): Der Schlüssel hat Einschränkungen oder die "Generative Language API" ist im Google Cloud Projekt nicht aktiv.'
      };
    }

    if (extracted.includes("API key not valid") || extracted.includes("INVALID_ARGUMENT") || rawMsg.includes("invalid argument")) {
      return {
        status: 400,
        message: 'Ungültiger API-Schlüssel: Bitte prüfe deinen Schlüssel auf Tippfehler oder Leerzeichen.'
      };
    }

    if (rawMsg.includes("503") || rawMsg.includes("high demand") || rawMsg.includes("UNAVAILABLE")) {
      return {
        status: 503,
        message: 'Das KI-Modell erfährt gerade hohe Nachfrage (503). Bitte versuche es in Kürze erneut.'
      };
    }

    return {
      status: 400,
      message: `API-Meldung: ${extracted}`
    };
  };

  // Endpoint to test an API key safely server-side
  app.post("/api/test-key", async (req, res) => {
    const customKey = (req.body.apiKey || "").trim();
    const keyToUse = customKey || process.env.GEMINI_API_KEY;

    if (!keyToUse) {
      return res.status(400).json({
        ok: false,
        message: "Kein API-Schlüssel angegeben und kein Server-Schlüssel hinterlegt."
      });
    }

    const client = new GoogleGenAI({
      apiKey: keyToUse,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const testModels = ["gemini-3.8-flash", "gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3.1-pro-preview"];
    let lastError: any = null;

    for (const m of testModels) {
      try {
        const response = await client.models.generateContent({
          model: m,
          contents: "Test ping"
        });

        if (response && response.text) {
          return res.json({
            ok: true,
            message: `API-Schlüssel ist gültig und einsatzbereit! (Modell: ${m})`
          });
        }
      } catch (err: any) {
        lastError = err;
        const parsed = parseGeminiError(err);
        // If it's a permission or invalid key error, stop trying other models
        if (parsed.status === 403 || parsed.status === 400) {
          return res.status(parsed.status).json({ ok: false, message: parsed.message });
        }
      }
    }

    const parsed = parseGeminiError(lastError);
    return res.status(parsed.status).json({ ok: false, message: parsed.message });
  });

  // API route for extracting flashcards or glossary terms from images
  app.post("/api/extract", async (req, res) => {
    try {
      const { 
        imageBase64, 
        mimeType, 
        images: rawImages, 
        frontImage, 
        backImage, 
        type, 
        mode, 
        apiKey: customKey 
      } = req.body;
      
      // Normalize incoming image parts
      const imageList: Array<{ imageBase64: string; mimeType: string; label?: string }> = [];
      
      if (Array.isArray(rawImages) && rawImages.length > 0) {
        for (const item of rawImages) {
          if (item?.imageBase64) {
            imageList.push({
              imageBase64: item.imageBase64,
              mimeType: item.mimeType || 'image/jpeg',
              label: item.label
            });
          }
        }
      } else if (frontImage?.imageBase64 || backImage?.imageBase64) {
        if (frontImage?.imageBase64) {
          imageList.push({
            imageBase64: frontImage.imageBase64,
            mimeType: frontImage.mimeType || 'image/jpeg',
            label: 'Vorderseite (Frage / Begriff)'
          });
        }
        if (backImage?.imageBase64) {
          imageList.push({
            imageBase64: backImage.imageBase64,
            mimeType: backImage.mimeType || 'image/jpeg',
            label: 'Rückseite (Antwort / Erklärung)'
          });
        }
      } else if (imageBase64 && mimeType) {
        imageList.push({
          imageBase64,
          mimeType,
          label: 'Karteikarten-Foto'
        });
      }

      if (imageList.length === 0) {
        return res.status(400).json({ error: "Mindestens ein Bild ist erforderlich." });
      }

      const keyToUse = (customKey || "").trim() || process.env.GEMINI_API_KEY;
      if (!keyToUse) {
        return res.status(400).json({
          error: "Kein API-Schlüssel vorhanden. Bitte trage deinen Gemini API-Schlüssel in den Einstellungen ein."
        });
      }

      const client = new GoogleGenAI({
        apiKey: keyToUse,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const isGlossary = type === 'glossary';
      const isHandwritten = mode === 'handwritten_card' || imageList.some(i => i.label?.toLowerCase().includes('vorder') || i.label?.toLowerCase().includes('rück'));
      
      let promptStr = "";
      let schema: any = null;

      if (isGlossary) {
        promptStr = `Extrahiere alle Fachbegriffe und Definitionen aus diesem Bild bezogen auf Schwimmbadbetrieb / Fachangestellte/r für Bäderbetriebe (FAB).
Formatierungsregeln:
- Behalte Absätze (\n\n), Aufzählungen (- Stichpunkt) und Zeilenumbrüche (\n) bei.
- Verwende Markdown-Fettschrift (**Begriff**) für wichtige Schlüsselwörter und Grenzwerte.
- Stelle sicher, dass Fachbegriffe und Definitionen auf Deutsch sind.`;
        schema = {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              term: { type: Type.STRING },
              definition: { type: Type.STRING }
            },
            required: ["term", "definition"]
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
   - "rubrik": Die oben auf der Karteikarte stehende Rubrik (Themenbereich / Fachgebiet) genau so wie aufgeschrieben (z. B. "Bädertechnik", "Erste Hilfe", "DIN 19643", "Wasseraufbereitung", etc.). Falls oben kein Rubrikname explizit notiert ist, leite eine passende, kurze fachliche Rubrik ab.
   - "question": Die Frage oder Aufgabenstellung von der Karteikarte (Vorderseite / linker Bereich).
   - "answer": Die Antwort (rechts daneben oder von der Rückseite).
2. Formatierung 1:1 übernehmen:
   - Fettgedruckt & Hervorhebungen: Setze handschriftlich unterstrichene, dick geschriebene, eingerahmte oder optisch hervorgehobene Signalwörter, Formeln, DIN-Normen und Grenzwerte in Markdown-Fettschrift (z. B. **DIN 19643**, **Freies Chlor: 0,3 - 0,6 mg/l**, **pH-Wert: 6,5 - 7,2**, **V = a · b · h**).
   - Absätze & Zeilenumbrüche: Behalte alle Zeilenumbrüche (\n) und Absätze (\n\n) der Handschrift exakt bei. Niemals Aufzählungen oder Absätze zu einem einzigen Fließtextblock zusammenquetschen!
   - Aufzählungen & Listen: Übernimm handschriftliche Stichpunkte und Aufzählungen mit echten Zeilenumbrüchen und Spiegelstrichen (z. B. "- Punkt 1\\n- Punkt 2\\n- Punkt 3") oder Nummerierungen ("1. Schritt\\n2. Schritt").
3. Transkribiere die deutsche Handschrift gewissenhaft und lesbar. Korrigiere offensichtliche handschriftliche Flüchtigkeitsfehler behutsam, erhalte den exakten fachlichen Sinn für FAB.
4. Wenn zwei Bilder (Vorderseite & Rückseite) vorliegen, führe Frage und Antwort als zusammengehöriges Lernkarten-Paar zusammen.
5. Falls auf einem Bild mehrere Karten oder Frage links und Antwort rechts nebeneinander stehen, extrahiere jede Karte als eigenständiges Objekt im Array.`;

        schema = {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              rubrik: { 
                type: Type.STRING, 
                description: "Die oben auf der Karteikarte stehende Rubrik bzw. Themenbereich (z. B. Bädertechnik, DIN 19643, Erste Hilfe, Bäderbetrieb & Recht, Rettungslehre)" 
              },
              question: { 
                type: Type.STRING, 
                description: "Präzise transkribierte Frage / Begriff von der Vorderseite mit Formatierung (Markdown **fett**, Zeilenumbrüche)" 
              },
              answer: { 
                type: Type.STRING, 
                description: "Fachlich fundierte, transkribierte Antwort mit erhaltener Formatierung (Markdown **fett**, Absätze \\n\\n, Stichpunkte - , Formeln)" 
              }
            },
            required: ["question", "answer"]
          }
        };
      } else {
        promptStr = `Extrahiere Lern-Karteikarten (Fragen und Antworten) aus diesem Bild zum Thema Bäderbetrieb / Fachangestellter für Bäderbetriebe (FAB).
Formatierungsregeln:
- Behalte Absätze (\\n\\n), Zeilenumbrüche (\\n) und Aufzählungen (- Stichpunkt) exakt bei.
- Verwende Markdown-Fettschrift (**wichtig**) für hervorgehobene Begriffe, Grenzwerte und Formeln.
- Stelle sicher, dass Fragen und Antworten auf Deutsch formuliert sind.`;
        schema = {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              answer: { type: Type.STRING }
            },
            required: ["question", "answer"]
          }
        };
      }

      // Build multimodal parts: prompt + each image with label
      const parts: any[] = [{ text: promptStr }];
      for (let idx = 0; idx < imageList.length; idx++) {
        const img = imageList[idx];
        if (img.label) {
          parts.push({ text: `Bild ${idx + 1} (${img.label}):` });
        }
        parts.push({
          inlineData: {
            data: img.imageBase64,
            mimeType: img.mimeType,
          },
        });
      }

      const candidateModels = ["gemini-3.8-flash", "gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3.1-pro-preview"];
      let response: any = null;
      let lastExtractError: any = null;

      for (const model of candidateModels) {
        try {
          response = await client.models.generateContent({
            model: model,
            contents: {
              parts
            },
            config: {
              responseMimeType: "application/json",
              responseSchema: schema,
            }
          });
          if (response && response.text) {
            break;
          }
        } catch (err: any) {
          lastExtractError = err;
          console.warn(`Extraction attempt with model ${model}:`, err.message || err);
        }
      }

      if (!response || !response.text) {
        throw lastExtractError || new Error("Keine Antwort vom Modell erhalten.");
      }

      const jsonStr = response.text?.trim() || "[]";
      let parsed = [];
      try {
        parsed = JSON.parse(jsonStr);
      } catch (e) {
        console.error("Failed to parse JSON:", e);
      }
      
      res.json({ results: parsed });
    } catch (error: any) {
      console.error("Extraction error:", error);
      res.status(500).json({ error: error.message || "Failed to extract" });
    }
  });

  // API route for converting flashcards to glossary terms with AI
  app.post("/api/flashcard-to-glossary", async (req, res) => {
    try {
      const { cards, apiKey: customKey } = req.body;
      if (!Array.isArray(cards) || cards.length === 0) {
        return res.status(400).json({ error: "Cards array is required" });
      }

      const keyToUse = (customKey || "").trim() || process.env.GEMINI_API_KEY;
      if (!keyToUse) {
        return res.status(400).json({
          error: "Kein API-Schlüssel vorhanden. Bitte trage deinen Gemini API-Schlüssel in den Einstellungen ein."
        });
      }

      const client = new GoogleGenAI({
        apiKey: keyToUse,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const promptStr = `Du bist ein fachlicher Ausbildungs- und Prüfungsexperte für den Ausbildungsberuf Fachangestellte/r für Bäderbetriebe (FAB).
Wandle die folgenden Lernkarten (Frage und Antwort) in prägnante, professionelle Glossar-Einträge für das Bäder-Fachglossar um.
Regeln:
1. 'term': Der konkrete Fachbegriff, das Schlagwort oder die Kernbezeichnung (z. B. "Freies Chlor", "Totraum", "Rautek-Griff", "DIN 19643", "Hypochlorige Säure").
2. 'definition': Eine klare, präzise und fachlich korrekte Begriffsdefinition/Erklärung, die die Kerninformationen der Karte verständlich und nachschlagbar zusammenfasst.
3. Sprache: Deutsch.
4. Gib für jede übergebene Lernkarte genau einen passenden Glossar-Eintrag zurück.

Eingabe-Lernkarten:
${JSON.stringify(cards, null, 2)}`;

      const schema = {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            term: { type: Type.STRING },
            definition: { type: Type.STRING },
            originalQuestion: { type: Type.STRING },
            originalAnswer: { type: Type.STRING }
          },
          required: ["term", "definition"]
        }
      };

      const candidateModels = ["gemini-3.8-flash", "gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3.1-pro-preview"];
      let response: any = null;
      let lastError: any = null;

      for (const model of candidateModels) {
        try {
          response = await client.models.generateContent({
            model: model,
            contents: promptStr,
            config: {
              responseMimeType: "application/json",
              responseSchema: schema,
            }
          });
          if (response && response.text) {
            break;
          }
        } catch (err: any) {
          lastError = err;
          console.warn(`Flashcard to glossary conversion with model ${model}:`, err.message || err);
        }
      }

      if (!response || !response.text) {
        // Fallback: If AI is temporarily unavailable, synthesize fallback entries
        const fallbackResults = cards.map((c: any) => ({
          term: (c.question || '').replace(/\?+$/, '').trim(),
          definition: (c.answer || '').trim()
        }));
        return res.json({ 
          results: fallbackResults,
          warning: "KI-Dienst temporär ausgelastet. Einträge wurden vorformatiert bereitgestellt."
        });
      }

      const jsonStr = response.text?.trim() || "[]";
      let parsed = [];
      try {
        parsed = JSON.parse(jsonStr);
      } catch (e) {
        console.error("Failed to parse JSON:", e);
      }

      res.json({ results: parsed });
    } catch (error: any) {
      console.error("Flashcard to glossary error:", error);
      res.status(500).json({ error: error.message || "Failed to convert flashcards" });
    }
  });

  // API route for generating a glossary definition with AI for a given term
  app.post("/api/generate-definition", async (req, res) => {
    try {
      const { term, context, apiKey: customKey } = req.body;
      const cleanTerm = (term || "").trim();
      if (!cleanTerm) {
        return res.status(400).json({ error: "Bitte gib einen Begriff / eine Bezeichnung an." });
      }

      const keyToUse = (customKey || "").trim() || process.env.GEMINI_API_KEY;
      if (!keyToUse) {
        return res.status(400).json({
          error: "Kein API-Schlüssel vorhanden. Bitte trage deinen Gemini API-Schlüssel in den Einstellungen ein."
        });
      }

      const client = new GoogleGenAI({
        apiKey: keyToUse,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const promptStr = `Du bist ein fachlicher Ausbilder und Prüfungsexperte für den Ausbildungsberuf "Fachangestellte/r für Bäderbetriebe (FAB)".
Formuliere eine präzise, fachlich fundierte und leicht verständliche Definition bzw. Erklärung für folgenden Fachbegriff im Bäderwesen / Schwimmbadbetrieb:

Fachbegriff: "${cleanTerm}"
${context ? `Zusatzkontext: "${context}"` : ''}

Anforderungen an die Erklärung:
1. Kläre zuerst die Kernbedeutung des Begriffs für den Bäderbetrieb (z. B. Wasseraufbereitung, Bädertechnik, Rettungsdienst/Sicherheit, Hygiene, Chemie, Physik, Rechtskunde oder Badebetrieb).
2. Erwähne, falls fachlich relevant, wichtige Grenzwerte, Einheiten, DIN-Normen (z. B. DIN 19643, GUV/DGUV) oder gesetzliche Vorschriften.
3. Formuliere flüssig auf Deutsch im verständlichen Glossar-Stil (ca. 2-5 prägnante Sätze oder Absätze mit Bulletpoints bei Aufzählungen).
4. Keine Metadaten oder Einleitungssätze wie "Hier ist die Erklärung:", sondern direkt den Text der Definition.`;

      const candidateModels = ["gemini-3.8-flash", "gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3.1-pro-preview"];
      let response: any = null;
      let lastError: any = null;

      for (const model of candidateModels) {
        try {
          response = await client.models.generateContent({
            model: model,
            contents: promptStr,
          });
          if (response && response.text) {
            break;
          }
        } catch (err: any) {
          lastError = err;
          console.warn(`Generate definition with model ${model}:`, err.message || err);
        }
      }

      if (!response || !response.text) {
        throw lastError || new Error("Keine Antwort vom KI-Modell erhalten.");
      }

      const definitionText = response.text.trim();
      res.json({ term: cleanTerm, definition: definitionText });
    } catch (error: any) {
      console.error("Generate definition error:", error);
      const parsed = parseGeminiError(error);
      res.status(parsed.status).json({ error: parsed.message });
    }
  });

  // API route for generating a flashcard answer with AI for a given question
  app.post("/api/generate-card-answer", async (req, res) => {
    try {
      const { question, category, apiKey: customKey } = req.body;
      const cleanQuestion = (question || "").trim();
      if (!cleanQuestion) {
        return res.status(400).json({ error: "Bitte gib eine Frage / Aufgabenstellung an." });
      }

      const keyToUse = (customKey || "").trim() || process.env.GEMINI_API_KEY;
      if (!keyToUse) {
        return res.status(400).json({
          error: "Kein API-Schlüssel vorhanden. Bitte trage deinen Gemini API-Schlüssel in den Einstellungen ein."
        });
      }

      const client = new GoogleGenAI({
        apiKey: keyToUse,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const promptStr = `Du bist ein fachlicher Ausbilder und Prüfungsexperte für den Ausbildungsberuf "Fachangestellte/r für Bäderbetriebe (FAB)".
Beantworte die folgende Prüfungs- oder Lernkartenfrage fachlich fundiert, strukturiert und präzise für die Rückseite einer Lernkarte:

Frage / Thema: "${cleanQuestion}"
${category ? `Themenbereich / Rubrik: "${category}"` : ''}

Anforderungen an die Antwort:
1. Klare, korrekte und prüfungsrelevante Fakten für FAB.
2. Wenn relevant: Grenzwerte, Formeln, DIN-Normen (z. B. DIN 19643) oder Sicherheitsregeln.
3. Sprache: Deutsch.
4. Direkt die Antwort ohne Einleitung wie "Die Antwort lautet:".`;

      const candidateModels = ["gemini-3.8-flash", "gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3.1-pro-preview"];
      let response: any = null;
      let lastError: any = null;

      for (const model of candidateModels) {
        try {
          response = await client.models.generateContent({
            model: model,
            contents: promptStr,
          });
          if (response && response.text) {
            break;
          }
        } catch (err: any) {
          lastError = err;
          console.warn(`Generate card answer with model ${model}:`, err.message || err);
        }
      }

      if (!response || !response.text) {
        throw lastError || new Error("Keine Antwort vom KI-Modell erhalten.");
      }

      res.json({ question: cleanQuestion, answer: response.text.trim() });
    } catch (error: any) {
      console.error("Generate card answer error:", error);
      const parsed = parseGeminiError(error);
      res.status(parsed.status).json({ error: parsed.message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
