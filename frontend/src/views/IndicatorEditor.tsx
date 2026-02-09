import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-bg-lighter">
        <h1 className="text-2xl font-display font-bold text-fg-primary">Indicator Editor</h1>
        <button
          onClick={onClose}
          className="p-1 hover:bg-bg-lighter rounded transition-colors"
          title="Close"
        >
          <X className="w-6 h-6 text-fg-primary" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-fg-secondary">
            <div>Loading indicators...</div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-fg-error">
            <div>{error}</div>
          </div>
        ) : (
          <div className="p-4">
            {Object.keys(indicatorSets).length === 0 ? (
              <div className="text-fg-secondary">
                <p>No indicator sets found.</p>
                <p className="text-sm mt-2">Indicator sets will be displayed here once they are available.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(indicatorSets).map(([setId, set]) => (
                  <div key={setId} className="border-b border-bg-medium pb-6">
                    <h2 className="text-lg font-semibold text-fg-primary mb-2">{setId}</h2>
                    {set.description && (
                      <p className="text-sm text-fg-secondary mb-4">{set.description}</p>
                    )}
                    {set.indicators && set.indicators.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {set.indicators.map((indicator) => (
                          <div key={indicator.id} className="p-3 bg-bg-lighter rounded border border-bg-medium">
                            <h3 className="font-mono text-sm text-fg-primary">{indicator.id}</h3>
                            {indicator.description && (
                              <p className="text-xs text-fg-secondary mt-1">{indicator.description}</p>
                            )}
                            {indicator.file && (
                              <p className="text-xs text-fg-secondary mt-1">File: {indicator.file}</p>
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
