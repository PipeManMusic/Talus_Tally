import { useState } from 'react';
import type { NodeProperty } from '../layout/Inspector';

// ── Public types ──────────────────────────────────────────────────────

export interface SpreadsheetRow {
  nodeId: string;
  nodeName: string;
  /** Raw property values keyed by property id (may be any serializable type). */
  values: Record<string, unknown>;
}

export interface SpreadsheetChange {
  nodeId: string;
  propId: string;
  oldValue: unknown;
  newValue: unknown;
}

type ColumnDef = {
  id: string;
  key?: string;
  name: string;
  type: NodeProperty['type'];
  options?: Array<{ value: string; label: string }>;
};

interface SpreadsheetEditorModalProps {
  /** Column definitions (skip 'name' — it is always the first column). */
  columns: ColumnDef[];
  rows: SpreadsheetRow[];
  onSave: (changes: SpreadsheetChange[]) => void;
  onCancel: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────

function rawToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function rawToBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === 'true' || value === '1';
  return Boolean(value);
}

// ── Component ─────────────────────────────────────────────────────────

export function SpreadsheetEditorModal({
  columns,
  rows,
  onSave,
  onCancel,
}: SpreadsheetEditorModalProps) {
  // Local editable state: cellValues[nodeId][propId] = display value (string or bool)
  const [cellValues] = useState<Record<string, Record<string, string | boolean>>>(() => {
    const init: Record<string, Record<string, string | boolean>> = {};
    for (const row of rows) {
      init[row.nodeId] = { name: rawToString(row.nodeName) };
      for (const col of columns) {
        const raw = row.values[col.id];
        init[row.nodeId][col.id] =
          col.type === 'checkbox' ? rawToBool(raw) : rawToString(raw);
      }
    }
    return init;
  });

  // We use a separate ref-based approach: edits write to a mutable draft object
  // so we don't incur per-keystroke full re-renders of large tables.
  const [draftValues, setDraftValues] = useState<Record<string, Record<string, string | boolean>>>(
    () => JSON.parse(JSON.stringify(cellValues)),
  );

  const setCell = (nodeId: string, propId: string, value: string | boolean) => {
    setDraftValues((prev) => ({
      ...prev,
      [nodeId]: { ...prev[nodeId], [propId]: value },
    }));
  };

  const handleSave = () => {
    const changes: SpreadsheetChange[] = [];

    for (const row of rows) {
      // Name column
      const origName = rawToString(row.nodeName);
      const editedName = String(draftValues[row.nodeId]?.['name'] ?? '');
      if (editedName !== origName) {
        changes.push({ nodeId: row.nodeId, propId: 'name', oldValue: row.nodeName, newValue: editedName });
      }

      // Other columns
      for (const col of columns) {
        if (col.type === 'editor') continue; // read-only in spreadsheet

        const origRaw = row.values[col.id];
        const edited = draftValues[row.nodeId]?.[col.id];

        let newValue: unknown;
        if (col.type === 'checkbox') {
          newValue = Boolean(edited);
        } else if (col.type === 'number' || col.type === 'currency') {
          const n = parseFloat(String(edited ?? ''));
          newValue = isNaN(n) ? (edited === '' ? '' : origRaw) : n;
        } else {
          newValue = String(edited ?? '');
        }

        const origNorm: unknown =
          col.type === 'checkbox'
            ? rawToBool(origRaw)
            : col.type === 'number' || col.type === 'currency'
              ? origRaw == null || origRaw === ''
                ? ''
                : parseFloat(String(origRaw))
              : rawToString(origRaw);

        if (newValue !== origNorm) {
          changes.push({ nodeId: row.nodeId, propId: col.id, oldValue: origRaw, newValue });
        }
      }
    }

    onSave(changes);
  };

  // ── Cell renderer ──────────────────────────────────────────────────
  const renderCell = (nodeId: string, col: ColumnDef) => {
    const value = draftValues[nodeId]?.[col.id];

    if (col.type === 'editor') {
      return (
        <span className="text-xs italic opacity-40 select-none">rich text</span>
      );
    }

    if (col.type === 'checkbox') {
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => setCell(nodeId, col.id, e.target.checked)}
          className="block mx-auto cursor-pointer accent-accent-primary"
        />
      );
    }

    if (col.options && col.options.length > 0) {
      return (
        <select
          value={String(value ?? '')}
          onChange={(e) => setCell(nodeId, col.id, e.target.value)}
          className="w-full bg-bg-dark border border-border rounded px-1 py-0.5 text-xs text-fg-primary"
        >
          <option value="">—</option>
          {col.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }

    if (col.type === 'number' || col.type === 'currency') {
      return (
        <input
          type="number"
          value={String(value ?? '')}
          onChange={(e) => setCell(nodeId, col.id, e.target.value)}
          className="w-full bg-bg-dark border border-border rounded px-1 py-0.5 text-xs text-fg-primary text-right min-w-[72px]"
        />
      );
    }

    if (col.type === 'date') {
      return (
        <input
          type="date"
          value={String(value ?? '')}
          onChange={(e) => setCell(nodeId, col.id, e.target.value)}
          className="w-full bg-bg-dark border border-border rounded px-1 py-0.5 text-xs text-fg-primary min-w-[110px]"
        />
      );
    }

    // text / textarea / default
    return (
      <input
        type="text"
        value={String(value ?? '')}
        onChange={(e) => setCell(nodeId, col.id, e.target.value)}
        className="w-full bg-bg-dark border border-border rounded px-1 py-0.5 text-xs text-fg-primary min-w-[90px]"
      />
    );
  };

  const editableColumns = columns.filter((c) => c.type !== 'editor');
  const readOnlyColumns = columns.filter((c) => c.type === 'editor');

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50"
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
    >
      <div
        className="bg-bg-light border border-border rounded-lg shadow-2xl flex flex-col"
        style={{ width: 'min(96vw, 1200px)', maxHeight: '88vh' }}
        role="dialog"
        aria-modal="true"
        aria-label="Bulk Edit"
      >
        {/* ── Header ───────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
          <div>
            <h2 className="font-display text-base font-bold text-fg-primary leading-tight">
              Bulk Edit
            </h2>
            <p className="text-xs text-fg-secondary mt-0.5">
              {rows.length} node{rows.length !== 1 ? 's' : ''} selected
              {readOnlyColumns.length > 0 && (
                <span className="ml-2 opacity-60">
                  (rich-text columns are read-only)
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="text-fg-secondary hover:text-fg-primary text-xl leading-none ml-4"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* ── Table ────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto min-h-0">
          <table className="w-full border-collapse text-sm" data-testid="spreadsheet-table">
            <thead className="sticky top-0 bg-bg-dark z-10">
              <tr>
                <th className="text-left px-3 py-2 text-fg-secondary font-medium border-b border-border whitespace-nowrap text-xs min-w-[120px]">
                  Name
                </th>
                {editableColumns.map((col) => (
                  <th
                    key={col.id}
                    className="text-left px-3 py-2 text-fg-secondary font-medium border-b border-border whitespace-nowrap text-xs"
                  >
                    {col.name}
                    {col.type === 'currency' && (
                      <span className="ml-1 opacity-50">($)</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={row.nodeId}
                  className={idx % 2 === 0 ? 'bg-bg-light' : 'bg-bg-dark/20'}
                  data-testid="spreadsheet-row"
                >
                  {/* Name cell */}
                  <td className="px-3 py-1.5 border-b border-border/40">
                    <input
                      type="text"
                      value={String(draftValues[row.nodeId]?.['name'] ?? '')}
                      onChange={(e) => setCell(row.nodeId, 'name', e.target.value)}
                      className="w-full bg-bg-dark border border-border rounded px-1 py-0.5 text-xs text-fg-primary min-w-[90px]"
                    />
                  </td>
                  {/* Property cells */}
                  {editableColumns.map((col) => (
                    <td key={col.id} className="px-3 py-1.5 border-b border-border/40">
                      {renderCell(row.nodeId, col)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Footer ───────────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-border flex-shrink-0">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-bg-dark border border-border rounded text-fg-primary hover:bg-bg-selection text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-accent-primary rounded text-fg-primary hover:bg-accent-hover text-sm font-medium"
            data-testid="spreadsheet-save-btn"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
