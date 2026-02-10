import { useEffect, useMemo, useState } from 'react';
import { Popover } from './Popover';

const DEFAULT_SWATCHES = [
  '#D94E1F',
  '#FF6B3B',
  '#28a745',
  '#ffc107',
  '#dc3545',
  '#60a5fa',
  '#22d3ee',
  '#a855f7',
  '#e0e0e0',
  '#b0b0b0',
  '#1e1e1e',
  '#121212',
];

const normalizeHex = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }

  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  const match = withHash.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!match) {
    return null;
  }

  if (withHash.length === 4) {
    const expanded = withHash
      .slice(1)
      .split('')
      .map((char) => char + char)
      .join('');
    return `#${expanded.toLowerCase()}`;
  }

  return withHash.toLowerCase();
};

interface ColorPickerProps {
  value?: string;
  onChange: (value: string) => void;
  swatches?: string[];
  placeholder?: string;
  allowEmpty?: boolean;
}

export function ColorPicker({
  value,
  onChange,
  swatches,
  placeholder = '#RRGGBB',
  allowEmpty = false,
}: ColorPickerProps) {
  const normalizedValue = useMemo(() => normalizeHex(value || '') ?? '', [value]);
  const [draft, setDraft] = useState(value || '');

  useEffect(() => {
    setDraft(value || '');
  }, [value]);

  const palette = swatches && swatches.length > 0 ? swatches : DEFAULT_SWATCHES;

  const commitDraft = (nextValue: string) => {
    const normalized = normalizeHex(nextValue);
    if (normalized === null) {
      setDraft(value || '');
      return;
    }

    if (!normalized && !allowEmpty) {
      setDraft(value || '');
      return;
    }

    setDraft(normalized);
    onChange(normalized);
  };

  const swatchStyle = (color: string) => ({
    backgroundColor: color,
  });

  return (
    <div className="flex items-center gap-2">
      <Popover
        content={
          <div className="p-3">
            <div className="grid grid-cols-6 gap-2">
              {palette.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => onChange(color)}
                  className="h-6 w-6 rounded border border-border transition hover:scale-105"
                  style={swatchStyle(color)}
                  title={color}
                />
              ))}
            </div>
          </div>
        }
        trigger={
          <div className="flex items-center gap-2">
            <div
              className="h-9 w-12 rounded border border-border bg-bg-light"
              style={{ backgroundColor: normalizedValue || '#1f2937' }}
            />
          </div>
        }
      />
      <input
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => commitDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commitDraft(draft);
          }
        }}
        placeholder={placeholder}
        className="flex-1 px-3 py-2 bg-bg-light border border-border rounded text-fg-primary text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent-primary"
      />
    </div>
  );
}
