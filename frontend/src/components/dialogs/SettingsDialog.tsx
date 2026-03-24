import { X, FolderOpen, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { API_BASE_URL, apiClient } from '../../api/client';

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
    const updatedStyle = String(styleContent)
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

type OverrideDirKey =
  | 'custom_blueprint_templates_dir'
  | 'custom_export_templates_dir'
  | 'custom_markup_templates_dir'
  | 'custom_indicators_dir'
  | 'custom_icons_dir';

const OVERRIDE_DIR_FIELDS: Array<{
  key: OverrideDirKey;
  label: string;
  section: 'templates' | 'assets';
}> = [
  {
    key: 'custom_blueprint_templates_dir',
    label: 'Blueprint Templates',
    section: 'templates',
  },
  {
    key: 'custom_export_templates_dir',
    label: 'Export Templates',
    section: 'templates',
  },
  {
    key: 'custom_markup_templates_dir',
    label: 'Markup Templates',
    section: 'templates',
  },
  {
    key: 'custom_indicators_dir',
    label: 'Indicators',
    section: 'assets',
  },
  {
    key: 'custom_icons_dir',
    label: 'Icons',
    section: 'assets',
  },
];

export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
  const [indicatorSize, setIndicatorSize] = useState<number>(14);
  const [indicatorCatalog, setIndicatorCatalog] = useState<IndicatorCatalog | null>(null);
  const [indicatorSvgs, setIndicatorSvgs] = useState<Record<string, string>>({});
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [overrideDirs, setOverrideDirs] = useState<Record<OverrideDirKey, string>>({
    custom_blueprint_templates_dir: '',
    custom_export_templates_dir: '',
    custom_markup_templates_dir: '',
    custom_indicators_dir: '',
    custom_icons_dir: '',
  });
  const [defaultPaths, setDefaultPaths] = useState<Record<string, string>>({});
  const [overrideDirsSaved, setOverrideDirsSaved] = useState(false);

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
    apiClient.getSettings().then((settings) => {
      setOverrideDirs({
        custom_blueprint_templates_dir: settings.custom_blueprint_templates_dir || '',
        custom_export_templates_dir: settings.custom_export_templates_dir || '',
        custom_markup_templates_dir: settings.custom_markup_templates_dir || '',
        custom_indicators_dir: settings.custom_indicators_dir || '',
        custom_icons_dir: settings.custom_icons_dir || '',
      });
    }).catch(() => {});
    apiClient.getSettingsDefaults().then((defaults) => {
      setDefaultPaths(defaults);
    }).catch(() => {});
  }, [isOpen]);

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
        const MAX_PREVIEW = 5;
        let count = 0;

        for (const [setId, setData] of Object.entries(sets)) {
          for (const indicator of setData.indicators || []) {
            if (count >= MAX_PREVIEW) break;
            count++;
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
          }
          if (count >= MAX_PREVIEW) break;
        }

        await Promise.all(requests);
        setIndicatorSvgs(svgs);
      } catch {
        setCatalogError('Failed to load indicator preview');
      }
    };

    void loadCatalog();
  }, [isOpen]);

  const applyIndicatorSize = (size: number) => {
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

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          <section>
            <h3 className="text-sm font-semibold text-[var(--color-fg-primary)] mb-3">Appearance</h3>

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

              <div className="space-y-3 p-3 bg-[var(--color-bg-dark)] rounded border border-[var(--color-border-default)]">
                <div className="text-sm text-[var(--color-fg-secondary)]">Preview:</div>
                {catalogError ? (
                  <div className="text-xs text-[var(--color-fg-secondary)]">{catalogError}</div>
                ) : indicatorCatalog ? (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(indicatorCatalog.indicator_sets || {}).flatMap(([setId, setData]) =>
                      (setData.indicators || []).map((indicator) => {
                        const key = `${setId}:${indicator.id}`;
                        return { key, indicator, svg: indicatorSvgs[key] };
                      })
                    ).filter(item => item.svg).map(({ key, indicator, svg }) => (
                      <div
                        key={key}
                        className="flex items-center gap-2 px-2 py-1 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-light)]"
                      >
                        <span
                          className="status-indicator-svg"
                          // eslint-disable-next-line react/no-danger
                          dangerouslySetInnerHTML={{ __html: recolorPreviewSvg(svg, '#ffffff') }}
                        />
                        <span className="text-xs text-[var(--color-fg-secondary)]">
                          {indicator.id}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-[var(--color-fg-secondary)]">Loading indicators...</div>
                )}
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[var(--color-fg-primary)]">File Locations</h3>
              <button
                onClick={async () => {
                  try {
                    const defaults = await apiClient.getSettingsDefaults();
                    const resetDirs: Record<OverrideDirKey, string> = {
                      custom_blueprint_templates_dir: '',
                      custom_export_templates_dir: '',
                      custom_markup_templates_dir: '',
                      custom_indicators_dir: '',
                      custom_icons_dir: '',
                    };
                    for (const key of Object.keys(resetDirs) as OverrideDirKey[]) {
                      resetDirs[key] = '';
                    }
                    setOverrideDirs(resetDirs);
                    const payload: Record<string, null> = {};
                    for (const key of Object.keys(resetDirs)) {
                      payload[key] = null;
                    }
                    await apiClient.updateSettings(payload);
                    setDefaultPaths(defaults);
                    setOverrideDirsSaved(true);
                  } catch (err) {
                    console.error('Failed to reset to defaults:', err);
                  }
                }}
                className="flex items-center gap-1 px-2 py-1 text-xs text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] hover:bg-[var(--color-bg-selection)] rounded transition-colors"
                title="Clear all overrides and use default locations"
              >
                <RotateCcw size={12} />
                Reset to Defaults
              </button>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-[var(--color-fg-secondary)] leading-relaxed">
                Override the default folder locations for templates, indicators, and icons.
                Leave a field empty to use the default location shown as placeholder text.
              </p>

              <div className="space-y-1 mt-2">
                <div className="text-xs font-semibold text-[var(--color-fg-secondary)] uppercase tracking-wide mb-1">Templates</div>
                {OVERRIDE_DIR_FIELDS.filter(e => e.section === 'templates').map((entry) => (
                  <div key={entry.key} className="space-y-1">
                    <div className="text-xs font-medium text-[var(--color-fg-secondary)]">{entry.label}</div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={overrideDirs[entry.key]}
                        onChange={(e) => {
                          setOverrideDirs((current) => ({
                            ...current,
                            [entry.key]: e.target.value,
                          }));
                          setOverrideDirsSaved(false);
                        }}
                        placeholder={defaultPaths[entry.key] || 'Loading...'}
                        className="flex-1 bg-[var(--color-bg-dark)] text-[var(--color-fg-primary)] border border-[var(--color-border-default)] rounded-sm px-2 py-1 text-sm font-body focus:border-[var(--color-accent-primary)] focus:outline-none placeholder:text-[var(--color-fg-secondary)]/50"
                      />
                      <button
                        onClick={async () => {
                          try {
                            const { open } = await import('@tauri-apps/plugin-dialog');
                            const selected = await open({
                              directory: true,
                              multiple: false,
                              title: `Select ${entry.label} Folder`,
                            });
                            if (selected && typeof selected === 'string') {
                              setOverrideDirs((current) => ({
                                ...current,
                                [entry.key]: selected,
                              }));
                              setOverrideDirsSaved(false);
                            }
                          } catch {
                            // Not in Tauri or dialog cancelled — ignore
                          }
                        }}
                        className="p-1.5 hover:bg-[var(--color-bg-selection)] rounded transition-colors border border-[var(--color-border-default)]"
                        title={`Browse for ${entry.label} folder`}
                      >
                        <FolderOpen size={16} className="text-[var(--color-fg-secondary)]" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-1 mt-3">
                <div className="text-xs font-semibold text-[var(--color-fg-secondary)] uppercase tracking-wide mb-1">Assets</div>
                {OVERRIDE_DIR_FIELDS.filter(e => e.section === 'assets').map((entry) => (
                  <div key={entry.key} className="space-y-1">
                    <div className="text-xs font-medium text-[var(--color-fg-secondary)]">{entry.label}</div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={overrideDirs[entry.key]}
                        onChange={(e) => {
                          setOverrideDirs((current) => ({
                            ...current,
                            [entry.key]: e.target.value,
                          }));
                          setOverrideDirsSaved(false);
                        }}
                        placeholder={defaultPaths[entry.key] || 'Loading...'}
                        className="flex-1 bg-[var(--color-bg-dark)] text-[var(--color-fg-primary)] border border-[var(--color-border-default)] rounded-sm px-2 py-1 text-sm font-body focus:border-[var(--color-accent-primary)] focus:outline-none placeholder:text-[var(--color-fg-secondary)]/50"
                      />
                      <button
                        onClick={async () => {
                          try {
                            const { open } = await import('@tauri-apps/plugin-dialog');
                            const selected = await open({
                              directory: true,
                              multiple: false,
                              title: `Select ${entry.label} Folder`,
                            });
                            if (selected && typeof selected === 'string') {
                              setOverrideDirs((current) => ({
                                ...current,
                                [entry.key]: selected,
                              }));
                              setOverrideDirsSaved(false);
                            }
                          } catch {
                            // Not in Tauri or dialog cancelled — ignore
                          }
                        }}
                        className="p-1.5 hover:bg-[var(--color-bg-selection)] rounded transition-colors border border-[var(--color-border-default)]"
                        title={`Browse for ${entry.label} folder`}
                      >
                        <FolderOpen size={16} className="text-[var(--color-fg-secondary)]" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={async () => {
                    try {
                      const payload: Record<string, string | null> = {};
                      for (const entry of OVERRIDE_DIR_FIELDS) {
                        payload[entry.key] = overrideDirs[entry.key] || null;
                      }
                      await apiClient.updateSettings(payload);
                      setOverrideDirsSaved(true);
                    } catch (err) {
                      console.error('Failed to save folder settings:', err);
                    }
                  }}
                  className="px-3 py-1 text-xs bg-[var(--color-accent-primary)] hover:bg-[var(--color-accent-hover)] text-white rounded transition-colors"
                >
                  Apply
                </button>
                {overrideDirsSaved && (
                  <span className="text-xs text-green-400">Saved. Restart or reload to take effect.</span>
                )}
              </div>
            </div>
          </section>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--color-border-default)]">
          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] hover:bg-[var(--color-bg-selection)] rounded transition-colors"
          >
            Reset Indicator Size
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
