import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { apiClient, type IndicatorsConfig, type IndicatorSet } from '../api/client';

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
    <div className="flex flex-col h-full bg-bg-dark text-fg-primary">
      {/* Header with back button */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-bg-lighter bg-bg-dark">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1 hover:bg-bg-lighter rounded transition-colors"
            title="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-fg-primary" />
          </button>
          <h1 className="text-xl font-bold">Indicator Editor</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full text-fg-secondary">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-fg-primary mx-auto mb-4"></div>
              <div>Loading indicators...</div>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-fg-error">
              <div className="text-lg font-semibold mb-2">Error Loading Indicators</div>
              <p>{error}</p>
              <button
                onClick={loadIndicators}
                className="mt-4 px-4 py-2 bg-fg-primary text-bg-dark rounded hover:opacity-90 transition-opacity"
              >
                Retry
              </button>
            </div>
          </div>
        ) : (
          <div>
            {Object.keys(indicatorSets).length === 0 ? (
              <div className="text-center text-fg-secondary py-12">
                <p className="text-lg mb-2">No indicator sets found</p>
                <p className="text-sm">Indicator sets will be displayed here once they are available.</p>
              </div>
            ) : (
              <div className="space-y-8">
                {Object.entries(indicatorSets).map(([setId, set]) => (
                  <div key={setId} className="border border-bg-medium rounded-lg p-6">
                    <div className="mb-4">
                      <h2 className="text-lg font-semibold text-fg-primary mb-1">{setId}</h2>
                      {set.description && (
                        <p className="text-sm text-fg-secondary">{set.description}</p>
                      )}
                    </div>
                    {set.indicators && set.indicators.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {set.indicators.map((indicator) => (
                          <div
                            key={indicator.id}
                            className="p-4 bg-bg-lighter rounded border border-bg-medium hover:border-fg-primary transition-colors"
                          >
                            <h3 className="font-mono text-sm font-semibold text-fg-primary mb-2">
                              {indicator.id}
                            </h3>
                            {indicator.description && (
                              <p className="text-xs text-fg-secondary mb-2">{indicator.description}</p>
                            )}
                            {indicator.file && (
                              <p className="text-xs text-fg-secondary">
                                <span className="font-semibold">File:</span> {indicator.file}
                              </p>
                            )}
                            {indicator.url && (
                              <p className="text-xs text-fg-secondary mt-2">
                                <span className="font-semibold">URL:</span>{' '}
                                <a
                                  href={indicator.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-fg-primary hover:underline"
                                >
                                  Open
                                </a>
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-fg-secondary">No indicators in this set.</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
