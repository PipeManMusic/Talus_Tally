import { useEffect, useState, type FormEvent } from 'react';
import { ChevronLeft, AlertCircle } from 'lucide-react';
import { apiClient, type IndicatorSet } from '../api/client';
import { TitleBar } from '../components/layout/TitleBar';

export interface IndicatorEditorProps {
  onClose: () => void;
}

export function IndicatorEditor({ onClose }: IndicatorEditorProps) {
  const [indicatorSets, setIndicatorSets] = useState<Record<string, IndicatorSet>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ id: '', file: '', description: '' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  const openCreateForm = (setId: string) => {
    setFormMode('create');
    setActiveSetId(setId);
    setEditingId(null);
    setFormData({ id: '', file: '', description: '' });
    setSelectedFile(null);
    setFormError(null);
    setFormOpen(true);
  };

  const openEditForm = (setId: string, indicator: { id: string; file: string; description: string }) => {
    setFormMode('edit');
    setActiveSetId(setId);
    setEditingId(indicator.id);
    setFormData({
      id: indicator.id,
      file: indicator.file,
      description: indicator.description || '',
    });
    setSelectedFile(null);
    setFormError(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setSelectedFile(null);
    setFormError(null);
    setSaving(false);
  };

  const handleDelete = async (setId: string, indicatorId: string) => {
    const confirmed = window.confirm(`Delete indicator "${indicatorId}" from set "${setId}"?`);
    if (!confirmed) {
      return;
    }

    try {
      setError(null);
      await apiClient.deleteIndicator(setId, indicatorId);
      await loadIndicators();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to delete indicator: ${message}`);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!activeSetId) {
      setFormError('No indicator set selected.');
      return;
    }

    if (!formData.id || !formData.file || !formData.description) {
      setFormError('ID, file, and description are required.');
      return;
    }

    try {
      setSaving(true);
      setFormError(null);

      let resolvedFile = formData.file;
      if (selectedFile) {
        const targetId = formData.id || editingId || '';
        if (!targetId) {
          setFormError('Indicator ID is required before uploading a file.');
          setSaving(false);
          return;
        }
        const upload = await apiClient.uploadIndicatorFile(activeSetId, targetId, selectedFile);
        resolvedFile = upload.file;
      }

      if (formMode === 'create') {
        await apiClient.createIndicator(activeSetId, {
          id: formData.id,
          file: resolvedFile,
          description: formData.description,
        });
      } else if (editingId) {
        await apiClient.updateIndicator(activeSetId, editingId, {
          id: formData.id,
          file: resolvedFile,
          description: formData.description,
        });
      }

      await loadIndicators();
      closeForm();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setFormError(`Failed to ${formMode} indicator: ${message}`);
    } finally {
      setSaving(false);
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
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-semibold text-fg-primary mb-1 font-mono">{setId}</h2>
                        {set.description && (
                          <p className="text-sm text-fg-secondary">{set.description}</p>
                        )}
                      </div>
                      <button
                        onClick={() => openCreateForm(setId)}
                        className="px-3 py-1.5 text-sm font-semibold bg-accent-primary text-bg-dark rounded hover:opacity-90 transition-opacity"
                      >
                        New Indicator
                      </button>
                    </div>
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
                            <div className="mt-4 flex items-center gap-2">
                              <button
                                onClick={() => openEditForm(setId, indicator)}
                                className="px-2 py-1 text-xs font-semibold border border-border rounded hover:border-accent-primary transition-colors"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(setId, indicator.id)}
                                className="px-2 py-1 text-xs font-semibold border border-status-danger text-status-danger rounded hover:bg-status-danger/10 transition-colors"
                              >
                                Delete
                              </button>
                            </div>
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

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded border border-border bg-bg-dark">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-lg font-semibold text-fg-primary">
                {formMode === 'create' ? 'Create Indicator' : 'Edit Indicator'}
              </h2>
              <button
                onClick={closeForm}
                className="text-sm text-fg-secondary hover:text-fg-primary"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 p-4">
              {formError && (
                <div className="rounded border border-status-danger bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
                  {formError}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-semibold text-fg-secondary">ID</label>
                <input
                  type="text"
                  value={formData.id}
                  onChange={(event) =>
                    setFormData({ ...formData, id: event.target.value })
                  }
                  className="w-full rounded border border-border bg-bg-light px-3 py-2 text-sm text-fg-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-fg-secondary">SVG File</label>
                  {formMode === 'edit' && formData.file && (
                    <span className="text-xs text-fg-secondary">Current: {formData.file}</span>
                  )}
                </div>
                <input
                  type="file"
                  accept=".svg"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    setSelectedFile(file);
                    setFormData({ ...formData, file: file ? file.name : formData.file });
                  }}
                  className="w-full rounded border border-border bg-bg-light px-3 py-2 text-sm text-fg-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
                />
                <div className="text-xs text-fg-secondary">
                  {selectedFile ? (
                    `New file selected: ${selectedFile.name}`
                  ) : formMode === 'edit' ? (
                    'Leave empty to keep current file, or select a new one.'
                  ) : (
                    'Choose an SVG file to copy into the indicators folder.'
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-fg-secondary">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(event) =>
                    setFormData({ ...formData, description: event.target.value })
                  }
                  rows={3}
                  className="w-full rounded border border-border bg-bg-light px-3 py-2 text-sm text-fg-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
                />
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-3 py-2 text-sm font-semibold text-fg-secondary hover:text-fg-primary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-semibold bg-accent-primary text-bg-dark rounded hover:opacity-90 disabled:opacity-60"
                >
                  {saving ? 'Saving...' : formMode === 'create' ? 'Create' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}