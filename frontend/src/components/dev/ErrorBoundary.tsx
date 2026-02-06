import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Store error info in state
    this.setState({ errorInfo });
    // Log error info
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('ErrorBoundary caught:', error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-status-danger/10 border border-status-danger rounded m-4">
          <div className="flex items-start gap-3">
            <div className="text-status-danger text-2xl">⚠</div>
            <div className="flex-1">
              <h2 className="text-lg font-display text-status-danger mb-2">
                Application Error
              </h2>
              <p className="text-sm text-fg-secondary mb-3">
                An error occurred while rendering this component. This might be due to:
              </p>
              <ul className="text-sm text-fg-secondary list-disc list-inside space-y-1 mb-4">
                <li>Invalid or corrupted template data</li>
                <li>Missing required fields in the data</li>
                <li>Incompatible template version</li>
                <li>Network connection issues</li>
              </ul>
              <details className="text-xs bg-bg-dark rounded p-2 mt-2 mb-4">
                <summary className="cursor-pointer text-fg-primary font-semibold mb-2">
                  Error Details
                </summary>
                <div className="font-mono text-status-danger whitespace-pre-wrap text-xs">
                  <strong>Error:</strong> {String(this.state.error?.message || this.state.error)}
                  {this.state.errorInfo && (
                    <>
                      {'\n\nComponent Stack:\n'}
                      {this.state.errorInfo.componentStack}
                    </>
                  )}
                </div>
              </details>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-accent-primary text-bg-dark rounded hover:bg-accent-primary/80 transition-colors text-sm font-semibold"
              >
                Reload Application
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
