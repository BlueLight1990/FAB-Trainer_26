import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    try {
      localStorage.removeItem('fab_last_flashcard_category');
      localStorage.removeItem('fab_flashcard_active_category');
      localStorage.removeItem('fab_flashcard_progress_v2');
      localStorage.removeItem('fab_flashcard_reviews_v2');
    } catch {}
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-xl text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4 border border-amber-200">
              <AlertTriangle size={28} />
            </div>
            
            <h1 className="text-xl font-bold text-slate-800 mb-2">
              Ein unerwarteter Fehler ist aufgetreten
            </h1>
            
            <p className="text-xs sm:text-sm text-slate-500 mb-6">
              Die App wurde angehalten, um Datenverlust zu verhindern. Deine Lernkarten und Daten sind sicher gespeichert.
            </p>

            {this.state.error?.message && (
              <div className="p-3 bg-slate-100 rounded-xl text-left text-xs font-mono text-slate-700 mb-6 overflow-x-auto max-h-32">
                {this.state.error.message}
              </div>
            )}

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors shadow-sm cursor-pointer"
              >
                <RefreshCw size={16} />
                <span>App neu laden</span>
              </button>

              <button
                type="button"
                onClick={this.handleReset}
                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Home size={14} />
                <span>Ansicht-Cache bereinigen &amp; starten</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
