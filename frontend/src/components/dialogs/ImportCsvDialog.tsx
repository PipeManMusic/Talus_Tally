import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type {
  Graph,
  Node,
  TemplateSchema,
  CsvImportRowError,
} from '../../api/client';
import { apiClient, type CsvColumnMapping, type CsvImportError } from '../../api/client';
import { parseCsvPreview, CsvParseError, type CsvPreview } from '../../utils/csvPreview';

type EnsureSessionFn = () => Promise<string>;

type BlueprintProperty = {
  id: string;
  name: string;
  type: string;
  required: boolean;
  options?: Array<{ id: string; name: string }>;
};

interface ImportCsvDialogProps {
  isOpen: boolean;
  selectedNodeId: string | null;
  nodes: Record<string, Node>;
  templateSchema: TemplateSchema | null;
  ensureSession: EnsureSessionFn;
  onClose: () => void;
  onImported: (details: {
    graph: Graph;
    createdNodeIds: string[];
    parentId: string;
    blueprintTypeId: string;
    createdCount: number;
    undoAvailable: boolean;
    redoAvailable: boolean;
  }) => void;
}

interface ParentOption {
  id: string;
  label: string;
  type: string;
}

export function ImportCsvDialog({
  isOpen,
  selectedNodeId,
  nodes,
  templateSchema,
  ensureSession,
  onClose,
  onImported,
}: ImportCsvDialogProps) {
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [selectedBlueprintType, setSelectedBlueprintType] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string | null>>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<CsvImportRowError[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const parentOptions = useMemo<ParentOption[]>(() => {
    return Object.values(nodes)
      .map((node) => ({
        id: node.id,
        label: `${node.properties?.name ?? node.type} (${node.type})`,
        type: node.type,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [nodes]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedParentId(null);
      setSelectedBlueprintType(null);
      setFile(null);
      setPreview(null);
      setAssignments({});
      setParseError(null);
      setSubmitError(null);
      setRowErrors([]);
      setIsParsing(false);
      setIsSubmitting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    setSelectedParentId((prev) => prev ?? selectedNodeId ?? null);
  }, [isOpen, selectedNodeId]);

  const selectedParent = selectedParentId ? nodes[selectedParentId] : null;

  const allowedChildTypeIds = useMemo(() => {
    if (!selectedParent || !templateSchema) {
      return [] as string[];
    }

    if (selectedParent.allowed_children && selectedParent.allowed_children.length > 0) {
      return selectedParent.allowed_children;
    }

    const parentSchema = templateSchema.node_types.find((nt) => nt.id === selectedParent.type);
    return parentSchema?.allowed_children ?? [];
  }, [selectedParent, templateSchema]);

  const blueprintTypeOptions = useMemo(() => {
    if (!templateSchema) {
      return [] as Array<{ id: string; name: string }>;
    }

    if (allowedChildTypeIds.length === 0) {
      return templateSchema.node_types.map((type) => ({ id: type.id, name: type.name || type.id }));
    }

    return allowedChildTypeIds
      .map((id) => {
        const entry = templateSchema.node_types.find((type) => type.id === id);
        return entry ? { id: entry.id, name: entry.name || entry.id } : null;
      })
      .filter((entry): entry is { id: string; name: string } => Boolean(entry));
  }, [allowedChildTypeIds, templateSchema]);

  useEffect(() => {
    if (!blueprintTypeOptions.length) {
      setSelectedBlueprintType(null);
      return;
    }

    setSelectedBlueprintType((current) => {
      if (!current) {
        return blueprintTypeOptions[0]?.id ?? null;
      }
      const stillValid = blueprintTypeOptions.some((option) => option.id === current);
      return stillValid ? current : blueprintTypeOptions[0]?.id ?? null;
    });
  }, [blueprintTypeOptions]);

  const blueprintProperties = useMemo<BlueprintProperty[]>(() => {
    if (!templateSchema || !selectedBlueprintType) {
      return [];
    }

    const nodeType = templateSchema.node_types.find((type) => type.id === selectedBlueprintType);
    if (!nodeType) {
      return [];
    }

    const properties: BlueprintProperty[] = nodeType.properties.map((prop) => ({
      id: prop.id,
      name: prop.name,
      type: prop.type,
      required: Boolean(prop.required),
      options: prop.options?.map((opt) => ({ id: opt.id, name: opt.name })),
    }));

    const hasNameProperty = properties.some((prop) => prop.id === 'name');
    if (!hasNameProperty) {
      properties.unshift({
        id: 'name',
        name: 'Name',
        type: 'string',
        required: true,
      });
    } else {
      properties.forEach((prop) => {
        if (prop.id === 'name') {
          prop.required = true;
        }
      });
    }

    return properties;
  }, [selectedBlueprintType, templateSchema]);

  useEffect(() => {
    if (!blueprintProperties.length) {
      setAssignments({});
      return;
    }

    setAssignments((current) => {
      const next: Record<string, string | null> = {};
      blueprintProperties.forEach((prop) => {
        next[prop.id] = current?.[prop.id] ?? null;
      });
      return next;
    });
  }, [blueprintProperties]);

  useEffect(() => {
    if (!preview || !blueprintProperties.length) {
      return;
    }

    setAssignments((current) => {
      const hasExistingSelection = Object.values(current).some((value) => value);
      if (hasExistingSelection) {
        return current;
      }

      const next: Record<string, string | null> = {};
      const takenHeaders = new Set<string>();
      blueprintProperties.forEach((prop) => {
        const headerMatch = preview.headers.find((header) => header.toLowerCase() === prop.id.toLowerCase());
        const nameMatch = preview.headers.find((header) => header.toLowerCase() === prop.name.toLowerCase());
        const candidate = headerMatch ?? nameMatch ?? null;
        if (candidate && !takenHeaders.has(candidate)) {
          next[prop.id] = candidate;
          takenHeaders.add(candidate);
        } else {
          next[prop.id] = null;
        }
      });
      return next;
    });
  }, [preview, blueprintProperties]);

  const requiredPropertyIds = useMemo(() =>
    blueprintProperties.filter((prop) => prop.required).map((prop) => prop.id),
  [blueprintProperties]);

  const missingRequired = requiredPropertyIds.filter((propId) => !assignments[propId]);

  const columnMap = useMemo<CsvColumnMapping[]>(() => {
    return Object.entries(assignments)
      .filter(([, header]) => Boolean(header))
      .map(([property_id, header]) => ({ property_id, header: header as string }));
  }, [assignments]);

  const canSubmit =
    Boolean(selectedParentId) &&
    Boolean(selectedBlueprintType) &&
    Boolean(file) &&
    missingRequired.length === 0 &&
    columnMap.length > 0 &&
    !isSubmitting;

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const pickedFile = event.target.files?.[0] ?? null;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    setFile(pickedFile);
    setPreview(null);
    setParseError(null);
    setSubmitError(null);
    setRowErrors([]);

    if (!pickedFile) {
      return;
    }

    try {
      setIsParsing(true);
      const csvPreview = await parseCsvPreview(pickedFile, { maxRows: 5 });
      setPreview(csvPreview);
    } catch (err) {
      if (err instanceof CsvParseError) {
        setParseError(err.message);
      } else {
        setParseError('Failed to read CSV file');
      }
      setPreview(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleAssignmentChange = (propertyId: string, header: string) => {
    setAssignments((current) => ({
      ...current,
      [propertyId]: header || null,
    }));
  };

  const handleClose = () => {
    if (isSubmitting) {
      return;
    }
    onClose();
  };

  const handleSubmit = async () => {
    if (!canSubmit || !selectedParentId || !selectedBlueprintType || !file) {
      return;
    }

    setSubmitError(null);
    setRowErrors([]);
    setIsSubmitting(true);

    try {
      const sid = await ensureSession();
      const result = await apiClient.importNodesFromCsv({
        sessionId: sid,
        parentId: selectedParentId,
        blueprintTypeId: selectedBlueprintType,
        columnMap,
        file,
      });

      onImported({
        graph: result.graph,
        createdNodeIds: result.created_node_ids,
        parentId: selectedParentId,
        blueprintTypeId: selectedBlueprintType,
        createdCount: result.created_count,
        undoAvailable: result.undo_available,
        redoAvailable: result.redo_available,
      });
      onClose();
    } catch (err) {
      const error = err as CsvImportError;
      setSubmitError(error.message || 'Import failed');
      setRowErrors(error.rowErrors || []);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getSampleValue = (prop: BlueprintProperty): string => {
    switch (prop.type) {
      case 'number':
      case 'integer':
        return '0';
      case 'boolean':
        return 'true';
      case 'select':
        return prop.options?.[0]?.id ?? '';
      case 'multi_select':
        return prop.options?.slice(0, 2).map((opt) => opt.id).join('|') ?? '';
      default:
        return prop.id === 'name' ? 'Example Name' : '';
    }
  };

  const escapeCsvValue = (value: string): string => {
    if (value.includes('"') || value.includes(',') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const handleDownloadTemplate = useCallback(async () => {
    if (!selectedBlueprintType || blueprintProperties.length === 0) {
      alert('Select a node type before exporting a template CSV.');
      return;
    }

    const headers = blueprintProperties.map((prop) => prop.id);
    const sampleRow = blueprintProperties.map((prop) => getSampleValue(prop));

    const csvContent = [headers, sampleRow]
      .map((row) => row.map((cell) => escapeCsvValue(cell)).join(','))
      .join('\n');

    const filename = `talus-import-${selectedBlueprintType}.csv`;
    const isTauri =
      typeof window !== 'undefined' &&
      (Boolean((window as any).__TAURI__) || Boolean((window as any).__TAURI_INTERNALS__));

    if (isTauri) {
      let saved = false;
      try {
        const [{ save }, { writeTextFile }] = await Promise.all([
          import('@tauri-apps/plugin-dialog'),
          import('@tauri-apps/plugin-fs'),
        ]);
        const targetPath = await save({
          defaultPath: filename,
          filters: [{ name: 'CSV Files', extensions: ['csv'] }],
        });
        if (targetPath) {
          await writeTextFile(targetPath, csvContent);
          alert('Template CSV saved.');
          saved = true;
        }
      } catch (error) {
        console.error('Failed to save CSV template via Tauri:', error);
        alert('Failed to save template CSV via desktop save dialog. Falling back to browser download.');
      }
      if (saved) {
        return;
      }
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [blueprintProperties, selectedBlueprintType]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-bg-light border border-border rounded-lg shadow-xl w-[720px] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display text-lg font-bold text-fg-primary">Import Nodes from CSV</h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-fg-secondary hover:text-fg-primary"
            aria-label="Close import dialog"
          >
            X
          </button>
        </div>

        <div className="px-6 py-4 space-y-6">
          {!templateSchema && (
            <div className="p-3 border border-yellow-500/40 bg-yellow-500/10 text-yellow-200 rounded">
              Load a template before importing nodes.
            </div>
          )}

          <section className="space-y-3">
            <div className="text-sm text-fg-secondary uppercase tracking-wide">Parent Selection</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm text-fg-primary">Parent Node</label>
              <select
                className="w-full px-3 py-2 bg-bg-dark border border-border rounded text-fg-primary"
                value={selectedParentId ?? ''}
                onChange={(event) => setSelectedParentId(event.target.value || null)}
              >
                <option value="">Select parent node...</option>
                {parentOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm text-fg-primary">Node Type</label>
              <select
                className="w-full px-3 py-2 bg-bg-dark border border-border rounded text-fg-primary"
                value={selectedBlueprintType ?? ''}
                onChange={(event) => setSelectedBlueprintType(event.target.value || null)}
                disabled={!blueprintTypeOptions.length}
              >
                <option value="">Select node type...</option>
                {blueprintTypeOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section className="space-y-3">
            <div className="text-sm text-fg-secondary uppercase tracking-wide">CSV File</div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="w-full text-sm text-fg-primary"
            />
            {isParsing && <div className="text-sm text-fg-secondary">Reading CSV...</div>}
            {file && preview && (
              <div className="text-sm text-fg-secondary">Loaded {file.name} ({preview.headers.length} columns)</div>
            )}
            {parseError && (
              <div className="text-sm text-red-400">{parseError}</div>
            )}
          </section>

          {preview && (
            <section className="space-y-2">
              <div className="text-sm text-fg-secondary uppercase tracking-wide">Preview</div>
              <div className="overflow-auto border border-border rounded">
                <table className="min-w-full text-sm">
                  <thead className="bg-bg-dark/60">
                    <tr>
                      {preview.headers.map((header) => (
                        <th key={header} className="px-3 py-2 text-left font-medium text-fg-secondary border-b border-border">
                          {header || '(blank)'}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.length === 0 ? (
                      <tr>
                        <td className="px-3 py-2 text-fg-secondary" colSpan={preview.headers.length}>
                          No data rows detected in CSV.
                        </td>
                      </tr>
                    ) : (
                      preview.rows.map((row, index) => (
                        <tr key={`row-${index}`} className="odd:bg-bg-dark/40">
                          {row.map((cell, cellIndex) => (
                            <td key={`${index}-${cellIndex}`} className="px-3 py-2 border-b border-border text-fg-primary">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-fg-secondary uppercase tracking-wide">Column Mapping</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="px-3 py-1 text-xs bg-bg-dark border border-border rounded text-fg-primary hover:bg-bg-selection disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleDownloadTemplate}
                  disabled={!selectedBlueprintType || blueprintProperties.length === 0}
                >
                  Download template CSV
                </button>
                {!preview && (
                  <div className="text-xs text-fg-secondary">Load a CSV to configure mappings.</div>
                )}
              </div>
            </div>
            <div className="space-y-3">
              {blueprintProperties.map((prop) => (
                <div key={prop.id} className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:items-center">
                  <div className="sm:col-span-1">
                    <div className="text-sm text-fg-primary font-medium">
                      {prop.name}
                      {prop.required && <span className="text-xs text-red-400 ml-2">Required</span>}
                    </div>
                    <div className="text-xs text-fg-secondary">{prop.type}</div>
                  </div>
                  <div className="sm:col-span-2">
                    <select
                      className="w-full px-3 py-2 bg-bg-dark border border-border rounded text-fg-primary"
                      value={assignments[prop.id] ?? ''}
                      onChange={(event) => handleAssignmentChange(prop.id, event.target.value)}
                      disabled={!preview}
                    >
                      <option value="">Not mapped</option>
                      {preview?.headers.map((header) => (
                        <option key={`${prop.id}-${header}`} value={header}>
                          {header || '(blank)'}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
            {missingRequired.length > 0 && (
              <div className="text-sm text-red-400">
                Map required fields: {missingRequired.join(', ')}.
              </div>
            )}
          </section>

          {submitError && (
            <div className="p-3 border border-red-500/40 bg-red-500/10 text-red-200 rounded">
              {submitError}
            </div>
          )}

          {rowErrors.length > 0 && (
            <section className="space-y-2">
              <div className="text-sm text-fg-secondary uppercase tracking-wide">Row Errors</div>
              <div className="space-y-2 max-h-40 overflow-auto border border-border rounded px-3 py-2">
                {rowErrors.map((error) => (
                  <div key={error.row_number} className="text-sm text-red-200">
                    <div className="font-semibold">Row {error.row_number}</div>
                    <ul className="list-disc list-inside text-xs text-red-300">
                      {error.messages.map((message, index) => (
                        <li key={`${error.row_number}-${index}`}>{message}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end gap-2 bg-bg-light">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 bg-bg-dark border border-border rounded text-fg-primary hover:bg-bg-selection"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-4 py-2 bg-accent-primary rounded text-fg-primary hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!canSubmit}
          >
            {isSubmitting ? 'Importing...' : 'Import Nodes'}
          </button>
        </div>
      </div>
    </div>
  );
}
