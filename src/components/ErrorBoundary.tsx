import React, { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
  showHomeButton?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('Error caught by boundary:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  handleGoHome = (): void => {
    window.location.href = '/';
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const { fallbackMessage, showHomeButton = true } = this.props;
      const { error, errorInfo } = this.state;

      return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
          <div className="max-w-2xl w-full bg-gray-900 rounded-lg shadow-xl border border-gray-800 p-8">
            <div className="flex items-start gap-4 mb-6">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-red-900/30 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-400" />
                </div>
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-white mb-2">
                  Something went wrong
                </h1>
                <p className="text-gray-400">
                  {fallbackMessage || 'An unexpected error occurred. Please try refreshing the page or returning to the home page.'}
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-gray-800 rounded-lg border border-gray-700">
                <h2 className="text-sm font-semibold text-red-400 mb-2">Error Details</h2>
                <p className="text-sm text-gray-300 font-mono break-all">
                  {error.toString()}
                </p>
              </div>
            )}

            {import.meta.env.DEV && errorInfo && (
              <details className="mb-6 p-4 bg-gray-800 rounded-lg border border-gray-700">
                <summary className="text-sm font-semibold text-yellow-400 cursor-pointer mb-2">
                  Stack Trace (Development Only)
                </summary>
                <pre className="text-xs text-gray-400 overflow-x-auto whitespace-pre-wrap">
                  {errorInfo.componentStack}
                </pre>
              </details>
            )}

            <div className="flex gap-3">
              <button
                onClick={this.handleReset}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
              {showHomeButton && (
                <button
                  onClick={this.handleGoHome}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  <Home className="w-4 h-4" />
                  Go Home
                </button>
              )}
            </div>

            <div className="mt-6 pt-6 border-t border-gray-800">
              <p className="text-sm text-gray-500">
                If this problem persists, try clearing your browser cache or exporting your data from Settings before refreshing.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
