import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../api/client';

type IndicatorCatalog = {
  indicator_sets: Record<
    string,
    {
      description?: string;
      indicators?: Array<{
        id: string;
        file?: string;
        description?: string;
      }>;
    }
  >;
};

const recolorPreviewSvg = (svgString: string, color: string): string => {
  if (!svgString) return svgString;

  let recolored = svgString;

  recolored = recolored
    .replace(/fill="([^"]*)"/gi, (_match, value) => {
      const normalized = String(value).trim().toLowerCase();
      if (normalized === 'none' || normalized === 'transparent') {
        return `fill="${value}"`;
      }
      return `fill="${color}"`;
    })
    .replace(/fill='([^']*)'/gi, (_match, value) => {
      const normalized = String(value).trim().toLowerCase();
      if (normalized === 'none' || normalized === 'transparent') {
        return `fill='${value}'`;
      }
      return `fill='${color}'`;
    })
    .replace(/stroke="([^"]*)"/gi, (_match, value) => {
      const normalized = String(value).trim().toLowerCase();
      if (normalized === 'none' || normalized === 'transparent') {
        return `stroke="${value}"`;
      }
      return `stroke="${color}"`;
    })
    .replace(/stroke='([^']*)'/gi, (_match, value) => {
      const normalized = String(value).trim().toLowerCase();
      if (normalized === 'none' || normalized === 'transparent') {
        return `stroke='${value}'`;
      }
      return `stroke='${color}'`;
    });

  recolored = recolored.replace(/style="([^"]*)"/g, (_match, styleContent) => {
    let updatedStyle = String(styleContent)
      .replace(/fill:\s*[^;]+/gi, (fillMatch) => {
        const value = fillMatch.split(':')[1]?.trim().toLowerCase();
        if (value === 'none' || value === 'transparent') {
          return fillMatch;
        }
        return `fill:${color}`;
      })
      .replace(/stroke:\s*[^;]+/gi, (strokeMatch) => {
        const value = strokeMatch.split(':')[1]?.trim().toLowerCase();
        if (value === 'none' || value === 'transparent') {
          return strokeMatch;
        }
        return `stroke:${color}`;
      });
    return `style="${updatedStyle}"`;
  });

  return recolored;
};

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
  const [indicatorSize, setIndicatorSize] = useState<number>(14);
  const [indicatorCatalog, setIndicatorCatalog] = useState<IndicatorCatalog | null>(null);
  const [indicatorSvgs, setIndicatorSvgs] = useState<Record<string, string>>({});
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSize = localStorage.getItem('indicator_size');
    if (savedSize) {
      const size = parseInt(savedSize, 10);
      if (!isNaN(size)) {
        setIndicatorSize(size);
        applyIndicatorSize(size);
      }
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const loadCatalog = async () => {
      try {
        setCatalogError(null);
        const response = await fetch(`${API_BASE_URL}/api/v1/indicators/catalog`);
        if (!response.ok) {
          throw new Error(`Failed to load catalog (${response.status})`);
        }
        const catalog = (await response.json()) as IndicatorCatalog;
        setIndicatorCatalog(catalog);

        const svgs: Record<string, string> = {};
        const sets = catalog.indicator_sets || {};
        const requests: Array<Promise<void>> = [];

        Object.entries(sets).forEach(([setId, setData]) => {
          (setData.indicators || []).forEach((indicator) => {
            const key = `${setId}:${indicator.id}`;
            requests.push(
              fetch(`${API_BASE_URL}/api/v1/indicators/${setId}/${indicator.id}`)
                .then((res) => (res.ok ? res.text() : ''))
                .then((svg) => {
                  if (svg) {
                    svgs[key] = svg;
                  }
                })
                .catch(() => {
                  // Ignore individual indicator errors
                })
            );
          });
        });

        await Promise.all(requests);
        setIndicatorSvgs(svgs);
      } catch (error) {
        setCatalogError('Failed to load indicator preview');
      }
    };

    void loadCatalog();
  }, [isOpen]);

  const applyIndicatorSize = (size: number) => {
    // Update CSS custom property
    document.documentElement.style.setProperty('--indicator-size', `${size}px`);
  };

  const handleSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const size = parseInt(e.target.value, 10);
    if (!isNaN(size)) {
      setIndicatorSize(size);
      applyIndicatorSize(size);
      localStorage.setItem('indicator_size', String(size));
    }
  };

  const handleReset = () => {
    const defaultSize = 14;
    setIndicatorSize(defaultSize);
    applyIndicatorSize(defaultSize);
    localStorage.setItem('indicator_size', String(defaultSize));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[var(--color-bg-light)] border border-[var(--color-border-default)] rounded-lg shadow-xl w-[500px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-default)]">
          <h2 className="text-lg font-semibold text-[var(--color-fg-primary)]">Settings</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[var(--color-bg-selection)] rounded transition-colors"
            aria-label="Close"
          >
            <X size={20} className="text-[var(--color-fg-secondary)]" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Appearance Section */}
          <section>
            <h3 className="text-sm font-semibold text-[var(--color-fg-primary)] mb-3">Appearance</h3>
            
            {/* Indicator Size */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="indicator-size" className="text-sm text-[var(--color-fg-secondary)]">
                  Indicator Size
                </label>
                <span className="text-sm text-[var(--color-fg-primary)] font-mono">{indicatorSize}px</span>
              </div>
              
              <div className="flex items-center gap-4">
                <input
                  id="indicator-size"
                  type="range"
                  min="8"
                  max="32"
                  step="2"
                  value={indicatorSize}
                  onChange={handleSizeChange}
                  className="flex-1 h-2 bg-[var(--color-bg-selection)] rounded-lg appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none 
                    [&::-webkit-slider-thumb]:w-4 
                    [&::-webkit-slider-thumb]:h-4 
                    [&::-webkit-slider-thumb]:rounded-full 
                    [&::-webkit-slider-thumb]:bg-[var(--color-accent-primary)]
                    [&::-webkit-slider-thumb]:cursor-pointer
                    [&::-moz-range-thumb]:w-4 
                    [&::-moz-range-thumb]:h-4 
                    [&::-moz-range-thumb]:rounded-full 
                    [&::-moz-range-thumb]:bg-[var(--color-accent-primary)]
                    [&::-moz-range-thumb]:border-0
                    [&::-moz-range-thumb]:cursor-pointer"
                />
                <span className="text-xs text-[var(--color-fg-secondary)] w-16 text-right">8-32px</span>
              </div>

              {/* Preview */}
              <div className="space-y-3 p-3 bg-[var(--color-bg-dark)] rounded border border-[var(--color-border-default)]">
                <div className="text-sm text-[var(--color-fg-secondary)]">Preview:</div>
                {catalogError ? (
                  <div className="text-xs text-[var(--color-fg-secondary)]">{catalogError}</div>
                ) : indicatorCatalog ? (
                  <div className="space-y-3">
                    {Object.entries(indicatorCatalog.indicator_sets || {}).map(([setId, setData]) => (
                      <div key={setId} className="space-y-2">
                        <div className="text-xs font-semibold text-[var(--color-fg-secondary)] uppercase tracking-wide">
                          {setId}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(setData.indicators || []).map((indicator) => {
                            const key = `${setId}:${indicator.id}`;
                            const svg = indicatorSvgs[key];
                            return (
                              <div
                                key={key}
                                className="flex items-center gap-2 px-2 py-1 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-light)]"
                              >
                                {svg ? (
                                  <span
                                    className="status-indicator-svg"
                                    // eslint-disable-next-line react/no-danger
                                    dangerouslySetInnerHTML={{ __html: recolorPreviewSvg(svg, '#ffffff') }}
                                  />
                                ) : (
                                  <span className="status-indicator-text text-xs opacity-60">...</span>
                                )}
                                <span className="text-xs text-[var(--color-fg-secondary)]">
                                  {indicator.id}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-[var(--color-fg-secondary)]">Loading indicators...</div>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--color-border-default)]">
          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] hover:bg-[var(--color-bg-selection)] rounded transition-colors"
          >
            Reset to Default
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-[var(--color-accent-primary)] hover:bg-[var(--color-accent-hover)] text-white rounded transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
