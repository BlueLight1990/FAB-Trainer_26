import React from 'react';
import { Trash2, AlertTriangle, AlertCircle, HelpCircle, X } from 'lucide-react';

export interface ConfirmDialogConfig {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

interface Props {
  config: ConfirmDialogConfig | null;
  onClose: () => void;
}

export const ConfirmModal: React.FC<Props> = ({ config, onClose }) => {
  if (!config || !config.isOpen) return null;

  const {
    title,
    message,
    confirmLabel = 'Löschen',
    cancelLabel = 'Abbrechen',
    isDestructive = true,
    onConfirm
  } = config;

  const handleConfirm = async () => {
    try {
      await onConfirm();
    } finally {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div 
        className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden transform transition-all animate-scale-in"
        role="dialog"
        aria-modal="true"
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
              isDestructive ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-blue-50 text-blue-600 border border-blue-100'
            }`}>
              {isDestructive ? <Trash2 className="w-6 h-6" /> : <HelpCircle className="w-6 h-6" />}
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-slate-800 leading-snug">
                {title}
              </h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                {message}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 p-1 -mr-1 -mt-1 rounded-lg transition-colors"
              aria-label="Schließen"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors shadow-sm"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className={`px-5 py-2 text-sm font-bold text-white rounded-xl shadow-md transition-all ${
              isDestructive 
                ? 'bg-red-600 hover:bg-red-700 shadow-red-500/20 active:scale-95' 
                : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20 active:scale-95'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
