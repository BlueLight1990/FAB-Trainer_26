import React, { useState } from 'react';
import { usePWAInstall } from './usePWAInstall';
import { DownloadCloud } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition whitespace-nowrap"
      >
        <DownloadCloud size={16} />
        <span className="hidden sm:inline">App installieren</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <DownloadCloud size={16} />
          <span className="hidden sm:inline">Installieren</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
              <h3 className="text-lg font-semibold text-slate-900">Installieren auf iOS</h3>
              <p className="mt-2 text-sm text-slate-600">
                1. Tippe auf den <strong>Teilen</strong> Button in Safari.<br />
                2. Scrolle nach unten und wähle <strong>Zum Home-Bildschirm</strong>.
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-lg bg-slate-100 py-2 text-sm font-medium text-slate-800 hover:bg-slate-200"
              >
                Schließen
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
