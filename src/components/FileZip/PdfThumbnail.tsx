import React, { useState, useEffect, useRef } from 'react';
import { pdfjsLib, getSafePdfDocumentSource } from '../../lib/pdfWorkerSetup';
import { FileText, Loader2 } from 'lucide-react';

// Global in-memory cache for generated PDF thumbnails (dataUrl -> image dataUrl)
const thumbnailCache = new Map<string, string>();
const numPagesCache = new Map<string, number>();

interface PdfThumbnailProps {
  url: string;
  name: string;
  className?: string;
  onClick?: () => void;
}

export const PdfThumbnail: React.FC<PdfThumbnailProps> = ({
  url,
  name,
  className = '',
  onClick
}) => {
  const [thumbUrl, setThumbUrl] = useState<string | null>(() => thumbnailCache.get(url) || null);
  const [pageCount, setPageCount] = useState<number | null>(() => numPagesCache.get(url) || null);
  const [loading, setLoading] = useState<boolean>(!thumbnailCache.has(url));
  const [hasError, setHasError] = useState<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;

    // If already in cache, use it immediately
    if (thumbnailCache.has(url)) {
      setThumbUrl(thumbnailCache.get(url)!);
      setPageCount(numPagesCache.get(url) || null);
      setLoading(false);
      setHasError(false);
      return;
    }

    let cancel = false;
    let timeoutId: any = null;
    let loadingTaskRef: any = null;

    const generateThumbnail = async () => {
      try {
        setLoading(true);
        setHasError(false);

        const source = await getSafePdfDocumentSource(url);
        if (cancel || !isMountedRef.current) return;

        const loadingTask = pdfjsLib.getDocument(source);
        loadingTaskRef = loadingTask;

        // Set a 6-second timeout for thumbnail rendering
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Thumbnail timeout')), 6000);
        });

        const doc = await Promise.race([loadingTask.promise, timeoutPromise]) as any;
        clearTimeout(timeoutId);
        if (cancel || !isMountedRef.current) return;

        numPagesCache.set(url, doc.numPages);
        setPageCount(doc.numPages);

        // Load first page
        const page = await doc.getPage(1);
        if (cancel || !isMountedRef.current) return;

        // Render to canvas with reasonable thumbnail dimensions (width ~ 320px)
        const unscaledViewport = page.getViewport({ scale: 1 });
        const targetWidth = 320;
        const scale = targetWidth / (unscaledViewport.width || targetWidth);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not get 2d context');

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        await page.render({
          canvasContext: context,
          canvas: canvas,
          viewport: viewport
        }).promise;

        if (cancel || !isMountedRef.current) return;

        const dataUri = canvas.toDataURL('image/jpeg', 0.85);
        thumbnailCache.set(url, dataUri);

        setThumbUrl(dataUri);
        setLoading(false);
      } catch (err) {
        clearTimeout(timeoutId);
        if (!cancel && isMountedRef.current) {
          console.warn('PDF-Vorschau Generierung:', name, err);
          setHasError(true);
          setLoading(false);
        }
      } finally {
        if (loadingTaskRef) {
          try {
            loadingTaskRef.destroy();
          } catch {}
        }
      }
    };

    generateThumbnail();

    return () => {
      cancel = true;
      isMountedRef.current = false;
      clearTimeout(timeoutId);
      if (loadingTaskRef) {
        try {
          loadingTaskRef.destroy();
        } catch {}
      }
    };
  }, [url, name]);

  if (loading) {
    return (
      <div 
        onClick={onClick}
        className={`w-full h-full flex flex-col items-center justify-center bg-slate-100/90 text-slate-400 p-4 transition-colors cursor-pointer select-none ${className}`}
      >
        <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center mb-2 shadow-2xs">
          <Loader2 size={18} className="animate-spin text-rose-500" />
        </div>
        <span className="text-[11px] font-medium text-slate-500 text-center">
          Vorschau wird geladen...
        </span>
      </div>
    );
  }

  if (hasError || !thumbUrl) {
    return (
      <div 
        onClick={onClick}
        className={`w-full h-full flex flex-col items-center justify-center p-4 cursor-pointer bg-gradient-to-b from-rose-50/70 to-slate-100 hover:from-rose-50 hover:to-rose-100/60 transition-colors select-none group/pdf ${className}`}
      >
        <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shadow-2xs group-hover/pdf:scale-110 transition-transform mb-2">
          <FileText size={24} />
        </div>
        <span className="text-xs font-bold text-slate-700 text-center truncate max-w-[90%]">
          PDF-Vorschau öffnen
        </span>
        {pageCount && (
          <span className="text-[10px] text-slate-400 mt-0.5">
            {pageCount} {pageCount === 1 ? 'Seite' : 'Seiten'}
          </span>
        )}
      </div>
    );
  }

  return (
    <div 
      onClick={onClick}
      className={`relative w-full h-full flex items-center justify-center p-2.5 bg-slate-100/80 hover:bg-slate-200/60 transition-colors cursor-pointer group/thumb select-none overflow-hidden ${className}`}
    >
      {/* Paper page replica card */}
      <div className="relative max-h-full max-w-full bg-white shadow-sm group-hover/thumb:shadow-md transition-shadow duration-200 rounded-sm border border-slate-200/90 overflow-hidden flex items-center justify-center">
        <img 
          src={thumbUrl} 
          alt={`PDF-Vorschau von ${name}`} 
          className="max-h-full max-w-full object-contain group-hover/thumb:scale-102 transition-transform duration-200"
          loading="lazy"
        />
        {/* Subtle document corner fold look */}
        <div className="absolute top-0 right-0 w-3.5 h-3.5 bg-gradient-to-bl from-slate-200 via-slate-100 to-transparent pointer-events-none opacity-60" />
      </div>

      {/* Mini Page Count Badge */}
      {pageCount && (
        <div className="absolute bottom-2 left-2 z-10">
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-black/60 backdrop-blur-xs text-white text-[10px] font-bold rounded shadow-xs">
            {pageCount} {pageCount === 1 ? 'S.' : 'Seiten'}
          </span>
        </div>
      )}

      {/* Quick Hover Overlay */}
      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
        <span className="px-3 py-1 bg-white/95 text-slate-800 text-xs font-bold rounded-xl shadow-md backdrop-blur-xs">
          PDF öffnen
        </span>
      </div>
    </div>
  );
};
