import React, { useEffect, useRef, useState, useCallback } from 'react';
import { pdfjsLib, getSafePdfDocumentSource } from '../lib/pdfWorkerSetup';
import { 
  X, Download, ExternalLink, ChevronLeft, ChevronRight, 
  ZoomIn, ZoomOut, RotateCw, Loader2, AlertCircle, Share2, Eye
} from 'lucide-react';
import { dataUriToBlob } from '../lib/glossaryPdfUtils';
import { Capacitor } from '@capacitor/core';

interface PdfViewerModalProps {
  url: string; // Data URI, Blob URL or web URL
  name: string;
  termTitle: string;
  onClose: () => void;
  onDownload: () => void;
}

export const PdfViewerModal: React.FC<PdfViewerModalProps> = ({
  url,
  name,
  termTitle,
  onClose,
  onDownload
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<any>(null);
  const loadingTaskRef = useRef<any>(null);
  
  const [pdfDoc, setPdfDoc] = useState<any | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [rotation, setRotation] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Convert URL/dataURI to safe source and load PDF with timeout protection
  const loadPdf = useCallback(async () => {
    let isCancelled = false;
    let timeoutId: any = null;

    try {
      setLoading(true);
      setError(null);

      // Cancel previous loading task if any
      if (loadingTaskRef.current) {
        try {
          loadingTaskRef.current.destroy();
        } catch {}
      }

      const source = await getSafePdfDocumentSource(url);
      if (isCancelled) return;

      const loadingTask = pdfjsLib.getDocument(source);
      loadingTaskRef.current = loadingTask;

      // Timeout race: 12 seconds max before gracefully falling back
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('Das Laden der PDF-Datei hat das Zeitlimit überschritten.'));
        }, 12000);
      });

      const doc = await Promise.race([loadingTask.promise, timeoutPromise]) as any;
      clearTimeout(timeoutId);

      if (isCancelled) return;
      setPdfDoc(doc);
      setNumPages(doc.numPages);
      setCurrentPage(1);
    } catch (err: any) {
      if (isCancelled) return;
      clearTimeout(timeoutId);
      console.error('Fehler beim Laden des PDFs:', err);
      setError(err?.message || 'Das PDF-Dokument konnte nicht geladen werden.');
    } finally {
      if (!isCancelled) {
        setLoading(false);
      }
    }

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [url]);

  useEffect(() => {
    loadPdf();
    return () => {
      if (loadingTaskRef.current) {
        try {
          loadingTaskRef.current.destroy();
        } catch {}
      }
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
      }
    };
  }, [loadPdf]);

  // Render current page onto canvas
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    let isMounted = true;

    const renderPage = async () => {
      try {
        // Cancel existing page render task if still in progress
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch {}
          renderTaskRef.current = null;
        }

        const page = await pdfDoc.getPage(currentPage);
        if (!isMounted) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext('2d');
        if (!context) return;

        // Calculate viewport based on container width for initial optimal fit
        const baseViewport = page.getViewport({ scale: 1, rotation });
        let targetScale = scale;

        // Auto-scale to container width if default scale (1.0)
        if (containerRef.current && scale === 1.0) {
          const containerWidth = Math.max(containerRef.current.clientWidth - 32, 280);
          if (containerWidth > 0 && baseViewport.width > 0) {
            const fitScale = containerWidth / baseViewport.width;
            targetScale = Math.min(Math.max(fitScale, 0.5), 3.0);
          }
        }

        const viewport = page.getViewport({ scale: targetScale, rotation });
        
        // Support Retina / High-DPI screens for super sharp rendering in WebView
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2.5);
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

        const currentRenderTask = page.render({
          canvasContext: context,
          canvas: canvas,
          viewport: viewport
        });

        renderTaskRef.current = currentRenderTask;
        await currentRenderTask.promise;
        renderTaskRef.current = null;
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.warn('Render exception:', err);
        }
      }
    };

    renderPage();

    return () => {
      isMounted = false;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
        renderTaskRef.current = null;
      }
    };
  }, [pdfDoc, currentPage, scale, rotation]);

  const handlePrevPage = () => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage(prev => Math.min(prev + 1, numPages));
  };

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + 0.25, 3.5));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev - 0.25, 0.5));
  };

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  const handleOpenInNewTab = () => {
    try {
      const blob = dataUriToBlob(url);
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    } catch (err) {
      console.error('Konnte Tab nicht öffnen:', err);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150"
      style={{
        paddingTop: 'calc(0.5rem + env(safe-area-inset-top, 0px))',
        paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))',
      }}
      onClick={onClose}
    >
      <div 
        className="relative bg-slate-900 rounded-2xl max-w-4xl w-full h-[92vh] sm:h-[88vh] overflow-hidden shadow-2xl border border-slate-700 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-slate-800 bg-slate-900/90 shrink-0 text-white gap-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center shrink-0 font-bold text-xs">
              PDF
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-slate-100 text-sm sm:text-base truncate">
                {termTitle}
              </h3>
              <p className="text-xs text-slate-400 truncate" title={name}>
                {name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {!Capacitor.isNativePlatform() && (
              <button
                type="button"
                onClick={handleOpenInNewTab}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors"
                title="In neuem Browser-Tab öffnen"
              >
                <ExternalLink size={13} />
                <span>Neuer Tab</span>
              </button>
            )}

            {/* Native Android / System PDF Reader button */}
            <button
              type="button"
              onClick={onDownload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
              title={Capacitor.isNativePlatform() ? "Im Android PDF-Viewer öffnen / teilen" : "PDF herunterladen"}
            >
              {Capacitor.isNativePlatform() ? <Share2 size={13} /> : <Download size={13} />}
              <span>{Capacitor.isNativePlatform() ? 'Öffnen / Teilen' : 'Download'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors ml-1 cursor-pointer"
              title="Schließen"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Floating Controls Bar (Zoom & Pages) */}
        <div className="flex items-center justify-between px-3 py-2 bg-slate-800/90 border-b border-slate-700/60 text-xs text-slate-300 shrink-0 gap-2 flex-wrap">
          {/* Page navigation */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={currentPage <= 1 || loading}
              onClick={handlePrevPage}
              className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-300 disabled:opacity-30 transition-colors cursor-pointer"
              title="Vorherige Seite"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="font-medium px-1 select-none">
              Seite <span className="text-white font-bold">{currentPage}</span> von{' '}
              <span className="text-white font-bold">{numPages || 1}</span>
            </span>
            <button
              type="button"
              disabled={currentPage >= numPages || loading}
              onClick={handleNextPage}
              className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-300 disabled:opacity-30 transition-colors cursor-pointer"
              title="Nächste Seite"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Zoom and Rotate controls */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={scale <= 0.5 || loading}
              className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-300 disabled:opacity-30 transition-colors cursor-pointer"
              title="Verkleinern"
            >
              <ZoomOut size={15} />
            </button>
            <button
              type="button"
              onClick={() => setScale(1.0)}
              className="px-2 py-1 rounded-md hover:bg-slate-700 text-[11px] font-mono font-medium text-slate-300 select-none cursor-pointer"
              title="Zoom zurücksetzen"
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={scale >= 3.5 || loading}
              className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-300 disabled:opacity-30 transition-colors cursor-pointer"
              title="Vergrößern"
            >
              <ZoomIn size={15} />
            </button>
            <button
              type="button"
              onClick={handleRotate}
              disabled={loading}
              className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-300 disabled:opacity-30 transition-colors ml-1 cursor-pointer"
              title="90° drehen"
            >
              <RotateCw size={14} />
            </button>
          </div>
        </div>

        {/* Content Area: Canvas rendering */}
        <div 
          ref={containerRef}
          className="flex-1 overflow-auto bg-slate-950 p-2 sm:p-4 flex flex-col relative touch-pan-x touch-pan-y"
        >
          {loading && (
            <div className="m-auto flex flex-col items-center justify-center gap-3 text-slate-400 py-12">
              <Loader2 size={32} className="animate-spin text-rose-500" />
              <p className="text-xs font-medium">PDF wird vorbereitet...</p>
            </div>
          )}

          {error && !loading && (
            <div className="m-auto max-w-md p-6 bg-slate-900 border border-slate-800 rounded-2xl text-center space-y-4">
              <AlertCircle size={36} className="text-rose-400 mx-auto" />
              <div>
                <h4 className="text-sm font-bold text-white mb-1">In-App Vorschau nicht möglich</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Dieses Dokument kann direkt mit dem Standard-PDF-Betrachter deines Geräts geöffnet werden ({error}).
                </p>
              </div>
              <button
                type="button"
                onClick={onDownload}
                className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm cursor-pointer"
              >
                {Capacitor.isNativePlatform() ? <Share2 size={15} /> : <Download size={15} />}
                <span>{Capacitor.isNativePlatform() ? 'Im Android PDF-Viewer öffnen' : 'PDF herunterladen'}</span>
              </button>
            </div>
          )}

          <div className="m-auto flex items-center justify-center p-2">
            <canvas 
              ref={canvasRef} 
              className={`shadow-2xl rounded-sm bg-white transition-all duration-150 ${loading || error ? 'hidden' : 'block'}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
