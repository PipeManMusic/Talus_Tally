import { useEffect, useState, type FormEvent } from 'react';
import { ChevronLeft, AlertCircle, Plus } from 'lucide-react';
import { apiClient, API_BASE_URL, type IconCatalog } from '../api/client';
import { TitleBar } from '../components/layout/TitleBar';

export interface IconEditorProps {
  onClose: () => void;
}

export function IconEditor({ onClose }: IconEditorProps) {
  const [icons, setIcons] = useState<IconCatalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ id: '', file: '', description: '' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [svgPreviewUrl, setSvgPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    loadIcons();
  }, []);

  const loadIcons = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.getIconsConfig();
      setIcons(data.icons || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to load icons: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  const openCreateForm = () => {
    setFormMode('create');
    setEditingId(null);
    setFormData({ id: '', file: '', description: '' });
    setSelectedFile(null);
    setSvgPreviewUrl(null);
    setFormError(null);
    setFormOpen(true);
  };

  const openEditForm = (icon: IconCatalog) => {
    setFormMode('edit');
    setEditingId(icon.id);
    setFormData({
      id: icon.id,
      file: icon.file,
      description: icon.description || '',
    });
    setSelectedFile(null);

    if (icon.file) {
      const svgUrl = `${API_BASE_URL}/api/v1/assets/icons/${icon.id}`;
      setSvgPreviewUrl(svgUrl);
    } else {
      setSvgPreviewUrl(null);
    }

    setFormError(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setSelectedFile(null);
    setSvgPreviewUrl(null);
    setFormError(null);
    setSaving(false);
  };

  const handleDelete = async (iconId: string) => {
    const confirmed = window.confirm(`Delete icon "${iconId}"?`);
    if (!confirmed) {
      return;
    }

    try {
      setError(null);
      await apiClient.deleteIcon(iconId);
      await loadIcons();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to delete icon: ${message}`);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!formData.id || !formData.file || !formData.description) {
      setFormError('ID, file, and description are required.');
      return;
    }

    try {
      setSaving(true);
      setFormError(null);

      let resolvedFile = formData.file;

      if (formMode === 'create') {
        await apiClient.createIcon({
          id: formData.id,
          file: resolvedFile,
          description: formData.description,
        });

        if (selectedFile) {
          const upload = await apiClient.uploadIconFile(formData.id, selectedFile);
          resolvedFile = upload.file;
          await apiClient.updateIcon(formData.id, {
            id: formData.id,
            file: resolvedFile,
            description: formData.description,
          });
        }
      } else if (editingId) {
        if (selectedFile) {
          const targetId = formData.id || editingId;
          const upload = await apiClient.uploadIconFile(targetId, selectedFile);
          resolvedFile = upload.file;
        }

        await apiClient.updateIcon(editingId, {
          id: formData.id,
          file: resolvedFile,
          description: formData.description,
        });
      }

      await loadIcons();
      closeForm();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setFormError(`Failed to ${formMode} icon: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-bg-dark">
      <TitleBar />
      <div className="flex flex-col h-full overflow-hidden flex-1 bg-bg-light">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-1 hover:bg-bg-dark rounded transition-colors"
              title="Go back"
            >
              <ChevronLeft size={24} className="text-fg-primary" />
            </button>
            <h1 className="text-2xl font-display font-bold text-fg-primary">Icon Editor</h1>
          </div>
          <button
            onClick={openCreateForm}
            className="flex items-center gap-2 px-3 py-2 bg-accent-primary text-bg-dark rounded hover:opacity-90 transition-opacity font-semibold"
          >
            <Plus size={18} />
            New Icon
          </button>
        </div>

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
              <div className="text-fg-secondary">Loading icons...</div>
            </div>
          ) : icons.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-center">
              <p className="text-lg text-fg-secondary">No icons found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {icons.map((icon) => (
                <div
                  key={icon.id}
                  className="p-4 bg-bg-dark border border-border rounded hover:border-accent-primary transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-mono text-sm font-semibold text-fg-primary mb-2">
                        {icon.id}
                      </h3>
                      {icon.description && (
                        <p className="text-xs text-fg-secondary mb-3">{icon.description}</p>
                      )}
                      {icon.file && (
                        <p className="text-xs text-fg-secondary mb-2">
                          <span className="font-semibold">File:</span> {icon.file}
                        </p>
                      )}
                    </div>
                    <div className="h-10 w-10 rounded bg-bg-light flex items-center justify-center">
                      <div
                        style={{
                          backgroundColor: '#e5e7eb',
                          maskImage: `url(${API_BASE_URL}/api/v1/assets/icons/${icon.id})`,
                          maskSize: 'contain',
                          maskRepeat: 'no-repeat',
                          maskPosition: 'center',
                          WebkitMaskImage: `url(${API_BASE_URL}/api/v1/assets/icons/${icon.id})`,
                          WebkitMaskSize: 'contain',
                          WebkitMaskRepeat: 'no-repeat',
                          WebkitMaskPosition: 'center',
                        }}
                        className="h-6 w-6"
                      />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <button
                      onClick={() => openEditForm(icon)}
                      className="px-2 py-1 text-xs font-semibold border border-border rounded hover:border-accent-primary transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(icon.id)}
                      className="px-2 py-1 text-xs font-semibold border border-status-danger text-status-danger rounded hover:bg-status-danger/10 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded border border-border bg-bg-dark max-h-96 overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-lg font-semibold text-fg-primary">
                {formMode === 'create' ? 'Create Icon' : 'Edit Icon'}
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
                    if (file) {
                      const url = URL.createObjectURL(file);
                      setSvgPreviewUrl(url);
                    } else {
                      setSvgPreviewUrl(null);
                    }
                  }}
                  className="w-full rounded border border-border bg-bg-light px-3 py-2 text-sm text-fg-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
                />
                <div className="text-xs text-fg-secondary">
                  {selectedFile ? (
                    `New file selected: ${selectedFile.name}`
                  ) : formMode === 'edit' ? (
                    'Leave empty to keep current file, or select a new one.'
                  ) : (
                    'Choose an SVG file to copy into the icons folder.'
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

              {svgPreviewUrl && (
                <div className="space-y-2 rounded border border-border bg-bg-dark p-4">
                  <h3 className="text-sm font-semibold text-fg-secondary">Preview</h3>
                  <div className="flex items-center justify-center rounded bg-bg-light p-4">
                    <div
                      style={{
                        backgroundColor: '#e5e7eb',
                        maskImage: `url(${svgPreviewUrl})`,
                        maskSize: 'contain',
                        maskRepeat: 'no-repeat',
                        maskPosition: 'center',
                        WebkitMaskImage: `url(${svgPreviewUrl})`,
                        WebkitMaskSize: 'contain',
                        WebkitMaskRepeat: 'no-repeat',
                        WebkitMaskPosition: 'center',
                      }}
                      className="h-12 w-12"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-3 py-2 text-sm font-semibold border border-border rounded hover:border-accent-primary transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-3 py-2 text-sm font-semibold bg-accent-primary text-bg-dark rounded hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {saving ? 'Saving...' : formMode === 'create' ? 'Create Icon' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
