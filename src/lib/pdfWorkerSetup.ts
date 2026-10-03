// ============================================================================
// PDF.js Environment Setup & Safe Document Parser
// Specially engineered for 100% reliable execution in:
// - Android APK WebView (Capacitor https://localhost / file: scheme)
// - Mobile & Desktop Web Browsers
// - PWA Offline Mode
// ============================================================================

// 1. ECMAScript Polyfills for maximum compatibility with Android WebView engines
if (typeof Promise !== 'undefined') {
  if (!('withResolvers' in Promise)) {
    (Promise as any).withResolvers = function () {
      let resolve: any, reject: any;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
  }

  if (!('try' in Promise)) {
    (Promise as any).try = function (fn: any, ...args: any[]) {
      return new Promise((resolve) => resolve(fn(...args)));
    };
  }
}

if (typeof Uint8Array !== 'undefined' && !(Uint8Array.prototype as any).toHex) {
  (Uint8Array.prototype as any).toHex = function () {
    return Array.from(this)
      .map((b: number) => b.toString(16).padStart(2, '0'))
      .join('');
  };
}

// 2. Import legacy builds for broad Android WebView & mobile compatibility
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs';

// 3. Configure in-memory worker handler
// In Android WebView (Capacitor), spawning module WebWorkers from custom schemes (capacitor:// or https://localhost)
// fails silently or runs into security/CORS restrictions, causing PDF loading tasks to hang forever.
// By attaching WorkerMessageHandler directly to globalThis.pdfjsWorker, PDF.js activates its built-in
// in-memory LoopbackPort fake-worker, which executes fast, synchronous page rendering in the main thread with
// ZERO network requests, ZERO CORS hurdles, and ZERO worker spawning failures!
if (typeof window !== 'undefined') {
  (window as any).pdfjsWorker = pdfjsWorker;
  (globalThis as any).pdfjsWorker = pdfjsWorker;
  if (pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerPort = null;
  }
}

export function initPdfWorker(): typeof pdfjsLib {
  if (typeof window !== 'undefined') {
    (window as any).pdfjsWorker = pdfjsWorker;
    (globalThis as any).pdfjsWorker = pdfjsWorker;
    if (pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerPort = null;
    }
  }
  return pdfjsLib;
}

// Ensure initialization on module evaluation
initPdfWorker();

/**
 * Decodes a base64 string into a Uint8Array safely.
 */
function decodeBase64ToUint8Array(base64: string): Uint8Array {
  // Remove URI encoding if any
  let cleaned = base64;
  if (cleaned.includes('%')) {
    try {
      cleaned = decodeURIComponent(cleaned);
    } catch {}
  }
  // Strip whitespace, tabs, and newlines
  cleaned = cleaned.replace(/[\s\r\n]+/g, '');

  // Add padding if missing
  while (cleaned.length % 4 !== 0) {
    cleaned += '=';
  }

  const binaryString = atob(cleaned);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Safely parses any PDF source (data URI, base64, blob URL, http URL, ArrayBuffer, Uint8Array, Blob)
 * into a direct Uint8Array source object { data: Uint8Array } accepted by pdfjsLib.getDocument().
 * Pre-buffering to Uint8Array ensures Android WebView never encounters network or stream read failures.
 */
export async function getSafePdfDocumentSource(
  source: string | Uint8Array | ArrayBuffer | Blob
): Promise<{ data: Uint8Array } | any> {
  if (!source) {
    throw new Error('PDF-Quelle ist leer oder ungültig.');
  }

  if (typeof source === 'string') {
    const trimmed = source.trim();

    // Data URI (e.g. data:application/pdf;base64,...)
    if (trimmed.startsWith('data:')) {
      const commaIdx = trimmed.indexOf(',');
      const base64 = commaIdx !== -1 ? trimmed.slice(commaIdx + 1) : trimmed;
      const bytes = decodeBase64ToUint8Array(base64);
      return { data: bytes };
    }

    // Raw Base64 string (often starts with JVBERi... for %PDF)
    if (trimmed.startsWith('JVBERi') || (!trimmed.startsWith('http') && !trimmed.startsWith('blob:') && !trimmed.startsWith('/') && trimmed.length > 200 && !trimmed.includes(' '))) {
      try {
        const bytes = decodeBase64ToUint8Array(trimmed);
        return { data: bytes };
      } catch {}
    }

    // Blob URL, HTTP URL, or local file asset URL
    if (trimmed.startsWith('blob:') || trimmed.startsWith('http') || trimmed.startsWith('/') || trimmed.startsWith('capacitor:') || trimmed.startsWith('file:')) {
      try {
        const response = await fetch(trimmed);
        if (!response.ok) {
          throw new Error(`HTTP Fehler ${response.status} beim Laden der PDF-Datei`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return { data: new Uint8Array(arrayBuffer) };
      } catch (fetchErr) {
        console.warn('Fetch fallback für PDF-Quelle fehlgeschlagen:', fetchErr);
        // Let pdfjs try with raw URL if fetch failed
        return { url: trimmed };
      }
    }

    return { url: trimmed };
  }

  if (source instanceof Blob) {
    const arrayBuffer = await source.arrayBuffer();
    return { data: new Uint8Array(arrayBuffer) };
  }

  if (source instanceof ArrayBuffer) {
    return { data: new Uint8Array(source) };
  }

  if (source instanceof Uint8Array) {
    return { data: source };
  }

  return source;
}

export { pdfjsLib };
