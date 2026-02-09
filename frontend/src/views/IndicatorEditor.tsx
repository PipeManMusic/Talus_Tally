import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { apiClient } from '../api/client';

export interface IndicatorEditorProps {
  onClose: () => void;
}

export function IndicatorEditor({ onClose }: IndicatorEditorProps) {
  const [indicators, setIndicators] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadIndicators();
  }, []);

  const loadIndicators = async () => {
    try {
      setLoading(true);
      setError(null);
      // TODO: Add indicator API endpoint to fetch indicators
      // const data = await apiClient.getIndicators();
      // setIndicators(data);
      console.log('Loading indicators...');
      setIndicators([]);
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
            {indicators.length === 0 ? (
              <div className="text-fg-secondary">
                <p>No indicators found.</p>
                <p className="text-sm mt-2">Indicators will be displayed here once they are created.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {indicators.map((indicator: any) => (
                  <div key={indicator.id} className="p-4 bg-bg-lighter rounded border border-bg-medium">
                    <h3 className="font-semibold text-fg-primary">{indicator.name}</h3>
                    {indicator.description && (
                      <p className="text-sm text-fg-secondary mt-1">{indicator.description}</p>
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
