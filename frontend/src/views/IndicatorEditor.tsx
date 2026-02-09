import { useEffect, useState } from 'react';
import { ChevronLeft, AlertCircle } from 'lucide-react';
import { apiClient, type IndicatorsConfig, type IndicatorSet } from '../api/client';
import { TitleBar } from '../components/layout/TitleBar';

export interface IndicatorEditorProps {
  onClose: () => void;
}

export function IndicatorEditor({ onClose }: IndicatorEditorProps) {
  const [indicatorSets, setIndicatorSets] = useState<Record<string, IndicatorSet>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadIndicators();
  }, []);

  const loadIndicators = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.getIndicatorsConfig();
      setIndicatorSets(data.indicator_sets || {});
      console.log('Loaded indicator sets:', data.indicator_sets);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to load indicators: ${message}`);
      console.error('Failed to load indicators:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-bg-dark">
      <TitleBar />
      <div className="flex flex-col h-full overflow-hidden flex-1 bg-bg-light">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-1 hover:bg-bg-dark rounded transition-colors"
              title="Go back"
            >
              <ChevronLeft size={24} className="text-fg-primary" />
            </button>
            <h1 className="text-2xl font-display font-bold text-fg-primary">Indicator Editor</h1>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {error && (
            <div className="mb-4 p-4 bg-status-danger/10 border border-status-danger rounded flex items-start gap-3">
              <AlertCircle size={20} className="text-status-danger flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-status-danger">Error</h3>
                <p className="text-sm text-status-danger/80">{error}</p>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-fg-secondary">Loading indicators...</div>
            </div>
          ) : Object.keys(indicatorSets).length === 0 ? (
            <div className="flex items-center justify-center h-64 text-center">
              <p className="text-lg text-fg-secondary">No indicator sets found</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(indicatorSets).map(([setId, set]) => (
                <div key={setId} className="border border-border rounded">
                  {/* Set Header */}
                  <div className="px-6 py-4 border-b border-border bg-bg-dark">
                    <h2 className="text-lg font-semibold text-fg-primary mb-1 font-mono">{setId}</h2>
                    {set.description && (
                      <p className="text-sm text-fg-secondary">{set.description}</p>
                    )}
                  </div>

                  {/* Set Indicators */}
                  {set.indicators && set.indicators.length > 0 ? (
                    <div className="p-6 bg-bg-light">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {set.indicators.map((indicator) => (
                          <div
                            key={indicator.id}
                            className="p-4 bg-bg-dark border border-border rounded hover:border-accent-primary transition-colors"
                          >
                            <h3 className="font-mono text-sm font-semibold text-fg-primary mb-2">
                              {indicator.id}
                            </h3>
                            {indicator.description && (
                              <p className="text-xs text-fg-secondary mb-3">{indicator.description}</p>
                            )}
                            {indicator.file && (
                              <p className="text-xs text-fg-secondary mb-2">
                                <span className="font-semibold">File:</span> {indicator.file}
                              </p>
                            )}
                            {indicator.url && (
                              <p className="text-xs">
                                <a
                                  href={indicator.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-accent-primary hover:underline"
                                >
                                  View Details →
                                </a>
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 bg-bg-light text-center text-sm text-fg-secondary">
                      No indicators in this set.
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
    </div>
  );
}