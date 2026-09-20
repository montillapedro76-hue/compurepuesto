import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  onReset?: () => void;
  componentName?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[ErrorBoundary] Error capturado en ${this.props.componentName || 'componente'}:`, error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error || new Error('Unknown error'), this.handleReset);
      }
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isModuleError =
        this.state.error?.message?.includes('dynamically imported module') ||
        this.state.error?.message?.includes('Failed to fetch') ||
        this.state.error?.name === 'TypeError';

      return (
        <div className="min-h-[420px] flex flex-col items-center justify-center p-8 bg-white dark:bg-slate-900 rounded-3xl border border-rose-100 dark:border-rose-950 shadow-sm text-center select-none my-4 max-w-xl mx-auto">
          <div className="w-14 h-14 bg-rose-50 dark:bg-rose-950/50 rounded-2xl flex items-center justify-center text-rose-600 dark:text-rose-400 mb-4 border border-rose-150">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h3 className="text-base font-black uppercase tracking-wide text-slate-900 dark:text-slate-100">
            {isModuleError ? 'Error al Cargar el Módulo' : 'Ocurrió un Inconveniente'}
          </h3>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed max-w-md">
            {isModuleError
              ? 'Hubo una pausa temporal de red al descargar los recursos del panel. Haz clic en "Reintentar" para cargarlo de nuevo.'
              : this.state.error?.message || 'Error inesperado al renderizar la vista.'}
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={this.handleReset}
              className="px-5 py-2.5 bg-[#FF9900] hover:bg-[#e68a00] text-[#131921] font-black text-xs uppercase tracking-wider rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <RefreshCw className="w-4 h-4" />
              Reintentar
            </button>
            <button
              type="button"
              onClick={() => {
                this.handleReset();
                window.location.reload();
              }}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            >
              Recargar Página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
