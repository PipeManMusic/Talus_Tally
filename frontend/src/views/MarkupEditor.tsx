import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ChevronLeft, AlertCircle, Plus, Trash2, Save } from 'lucide-react';
import { apiClient, type MarkupProfile, type MarkupToken } from '../api/client';
import { TitleBar } from '../components/layout/TitleBar';

export interface MarkupEditorProps {
  onClose: () => void;
}

type FormMode = 'create' | 'edit';

type TokenFormatField =
  | 'text_transform'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'align'
  | 'font_size'
  | 'color'
  | 'background_color';

const emptyProfile: MarkupProfile = {
  id: '',
  label: '',
  description: '',
  tokens: [],
};

const formatTransforms = ['none', 'uppercase', 'lowercase', 'capitalize'] as const;
const formatScopes = ['line', 'prefix', 'inline'] as const;
const alignOptions = ['left', 'center', 'right'] as const;

export function MarkupEditor({ onClose }: MarkupEditorProps) {
  const [profiles, setProfiles] = useState<MarkupProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [formData, setFormData] = useState<MarkupProfile>(emptyProfile);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await apiClient.listMarkupProfiles();
      const fullProfiles = await Promise.all(
        list.map(async (item) => {
          try {
            return await apiClient.getMarkupProfile(item.id);
          } catch {
            return { id: item.id, label: item.label, description: item.description, tokens: [] };
          }
        })
      );
      setProfiles(fullProfiles);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to load markup profiles: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  const openCreateForm = () => {
    setFormMode('create');
    setFormData({ ...emptyProfile });
    setFormError(null);
    setFormOpen(true);
  };

  const openEditForm = (profile: MarkupProfile) => {
    setFormMode('edit');
    setFormData({
      ...profile,
      description: profile.description || '',
      tokens: profile.tokens ? [...profile.tokens] : [],
    });
    setFormError(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setFormError(null);
    setSaving(false);
  };

  const handleDelete = async (profileId: string) => {
    const confirmed = window.confirm(`Delete markup profile "${profileId}"?`);
    if (!confirmed) return;

    try {
      setError(null);
      await apiClient.deleteMarkupProfile(profileId);
      await loadProfiles();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to delete markup profile: ${message}`);
    }
  };

  const normalizeToken = (token: MarkupToken): MarkupToken => {
    const cleaned: MarkupToken = {
      id: token.id.trim(),
      label: token.label.trim(),
    };

    if (token.format_scope) cleaned.format_scope = token.format_scope;
    if (token.prefix?.trim()) cleaned.prefix = token.prefix.trim();
    if (token.pattern?.trim()) cleaned.pattern = token.pattern.trim();

    if (token.format) {
      const format = { ...token.format };
      const formatted: MarkupToken['format'] = {};
      (['text_transform', 'align', 'font_size', 'color', 'background_color'] as const).forEach((field) => {
        const value = format[field];
        if (typeof value === 'string' && value.trim()) {
          formatted[field] = value.trim() as any;
        }
      });
      (['bold', 'italic', 'underline'] as const).forEach((field) => {
        if (format[field]) {
          formatted[field] = true;
        }
      });

      if (Object.keys(formatted).length > 0) {
        cleaned.format = formatted;
      }
    }

    return cleaned;
  };

  const normalizeProfile = (profile: MarkupProfile): MarkupProfile => {
    const cleaned: MarkupProfile = {
      id: profile.id.trim(),
      label: profile.label.trim(),
    };

    if (profile.description?.trim()) {
      cleaned.description = profile.description.trim();
    }

    if (profile.tokens && profile.tokens.length > 0) {
      cleaned.tokens = profile.tokens.map(normalizeToken);
    }

    return cleaned;
  };

  const validateProfile = (profile: MarkupProfile): string | null => {
    if (!profile.id.trim()) return 'Profile ID is required.';
    if (!profile.label.trim()) return 'Profile label is required.';

    for (const token of profile.tokens || []) {
      if (!token.id.trim()) return 'Token ID is required.';
      if (!token.label.trim()) return 'Token label is required.';
    }

    return null;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const validationError = validateProfile(formData);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    try {
      setSaving(true);
      setFormError(null);

      const payload = normalizeProfile(formData);

      if (formMode === 'create') {
        await apiClient.createMarkupProfile(payload);
      } else {
        await apiClient.updateMarkupProfile(payload.id, payload);
      }

      await loadProfiles();
      closeForm();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setFormError(`Failed to ${formMode === 'create' ? 'create' : 'update'} profile: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  const updateToken = (index: number, patch: Partial<MarkupToken>) => {
    setFormData((prev) => {
      const tokens = [...(prev.tokens || [])];
      tokens[index] = { ...tokens[index], ...patch };
      return { ...prev, tokens };
    });
  };

  const updateTokenFormat = (index: number, field: TokenFormatField, value: string | boolean) => {
    setFormData((prev) => {
      const tokens = [...(prev.tokens || [])];
      const token = { ...tokens[index] };
      const format = { ...(token.format || {}) } as NonNullable<MarkupToken['format']>;

      if (typeof value === 'boolean') {
        // Only assign boolean to bold, italic, underline
        if (field === 'bold' || field === 'italic' || field === 'underline') {
          if (value) {
            (format as any)[field] = true;
          } else {
            delete (format as any)[field];
          }
        }
      } else if (value) {
        (format as any)[field] = value;
      } else {
        delete (format as any)[field];
      }

      token.format = Object.keys(format).length > 0 ? format : undefined;
      tokens[index] = token;
      return { ...prev, tokens };
    });
  };

  const addToken = () => {
    setFormData((prev) => ({
      ...prev,
      tokens: [...(prev.tokens || []), { id: '', label: '', format_scope: 'line' }],
    }));
  };

  const removeToken = (index: number) => {
    setFormData((prev) => {
      const tokens = [...(prev.tokens || [])];
      tokens.splice(index, 1);
      return { ...prev, tokens };
    });
  };

  const formTokens = useMemo(() => formData.tokens || [], [formData.tokens]);

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
            <h1 className="text-2xl font-display font-bold text-fg-primary">Markup Editor</h1>
          </div>
          <button
            onClick={openCreateForm}
            className="flex items-center gap-2 px-3 py-2 bg-accent-primary text-bg-dark rounded hover:opacity-90 transition-opacity font-semibold"
          >
            <Plus size={16} />
            New Profile
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
              <div className="text-fg-secondary">Loading markup profiles...</div>
            </div>
          ) : profiles.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-center">
              <p className="text-lg text-fg-secondary">No markup profiles found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {profiles.map((profile) => (
                <div key={profile.id} className="border border-border rounded bg-bg-dark hover:border-accent-primary cursor-pointer transition-colors group flex flex-col h-full">
                  <div className="flex-1 p-4 flex flex-col">
                    <h2 className="text-lg font-semibold text-fg-primary mb-1 font-mono">{profile.id}</h2>
                    <p className="text-sm text-fg-secondary">{profile.label}</p>
                    {profile.description && (
                      <p className="text-xs text-fg-secondary mt-1">{profile.description}</p>
                    )}
                    <div className="text-xs text-fg-secondary mt-2">Tokens: {profile.tokens?.length || 0}</div>
                  </div>
                  <div className="flex items-center justify-end gap-2 px-4 pb-4 pt-2">
                    <button
                      onClick={e => { e.stopPropagation(); openEditForm(profile); }}
                      className="px-2 py-1 text-xs font-semibold border border-border rounded hover:border-accent-primary transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(profile.id); }}
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

        {formOpen && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-bg-light w-full max-w-5xl max-h-[90vh] overflow-auto rounded shadow-lg border border-border">
              <form onSubmit={handleSubmit} className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-fg-primary">
                    {formMode === 'create' ? 'Create Markup Profile' : 'Edit Markup Profile'}
                  </h2>
                  <button
                    type="button"
                    onClick={closeForm}
                    className="text-sm text-fg-secondary hover:text-fg-primary"
                  >
                    Close
                  </button>
                </div>

                {formError && (
                  <div className="mb-4 p-3 bg-status-danger/10 border border-status-danger rounded text-sm text-status-danger">
                    {formError}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="text-sm text-fg-secondary">
                    ID
                    <input
                      type="text"
                      value={formData.id}
                      disabled={formMode === 'edit'}
                      onChange={(e) => setFormData((prev) => ({ ...prev, id: e.target.value }))}
                      className="mt-1 w-full px-3 py-2 border border-border rounded bg-bg-light text-fg-primary"
                      placeholder="script_default"
                    />
                  </label>
                  <label className="text-sm text-fg-secondary">
                    Label
                    <input
                      type="text"
                      value={formData.label}
                      onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
                      className="mt-1 w-full px-3 py-2 border border-border rounded bg-bg-light text-fg-primary"
                      placeholder="Default Script"
                    />
                  </label>
                </div>

                <label className="text-sm text-fg-secondary mt-4 block">
                  Description
                  <textarea
                    value={formData.description || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 border border-border rounded bg-bg-light text-fg-primary"
                    rows={3}
                  />
                </label>

                <div className="mt-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold text-fg-primary">Tokens</h3>
                    <button
                      type="button"
                      onClick={addToken}
                      className="flex items-center gap-2 px-3 py-2 border border-border rounded text-sm text-fg-primary hover:bg-bg-dark"
                    >
                      <Plus size={14} />
                      Add Token
                    </button>
                  </div>

                  {formTokens.length === 0 ? (
                    <div className="text-sm text-fg-secondary py-6 text-center border border-dashed border-border rounded">
                      No tokens added yet.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {formTokens.map((token, index) => (
                        <div key={`${token.id || 'token'}-${index}`} className="border border-border rounded p-4 bg-bg-light">
                          <div className="flex items-start justify-between gap-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1">
                              <label className="text-xs text-fg-secondary">
                                Token ID
                                <input
                                  type="text"
                                  value={token.id}
                                  onChange={(e) => updateToken(index, { id: e.target.value })}
                                  className="mt-1 w-full px-2 py-1 border border-border rounded bg-bg-light text-fg-primary"
                                  placeholder="scene"
                                />
                              </label>
                              <label className="text-xs text-fg-secondary">
                                Label
                                <input
                                  type="text"
                                  value={token.label}
                                  onChange={(e) => updateToken(index, { label: e.target.value })}
                                  className="mt-1 w-full px-2 py-1 border border-border rounded bg-bg-light text-fg-primary"
                                  placeholder="Scene"
                                />
                              </label>
                              <label className="text-xs text-fg-secondary">
                                Format Scope
                                <select
                                  value={token.format_scope || 'line'}
                                  onChange={(e) => updateToken(index, { format_scope: e.target.value as MarkupToken['format_scope'] })}
                                  className="mt-1 w-full px-2 py-1 border border-border rounded bg-bg-light text-fg-primary"
                                >
                                  {formatScopes.map((scope) => (
                                    <option key={scope} value={scope}>
                                      {scope}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="text-xs text-fg-secondary">
                                Prefix
                                <input
                                  type="text"
                                  value={token.prefix || ''}
                                  onChange={(e) => updateToken(index, { prefix: e.target.value })}
                                  className="mt-1 w-full px-2 py-1 border border-border rounded bg-bg-light text-fg-primary"
                                  placeholder="[SCENE]"
                                />
                              </label>
                              <label className="text-xs text-fg-secondary md:col-span-2">
                                Pattern (regex)
                                <input
                                  type="text"
                                  value={token.pattern || ''}
                                  onChange={(e) => updateToken(index, { pattern: e.target.value })}
                                  className="mt-1 w-full px-2 py-1 border border-border rounded bg-bg-light text-fg-primary"
                                  placeholder="^(?P<name>[A-Z]+):"
                                />
                              </label>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeToken(index)}
                              className="p-2 border border-status-danger text-status-danger rounded hover:bg-status-danger/10"
                              title="Remove token"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>

                          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                            <label className="text-xs text-fg-secondary">
                              Text Transform
                              <select
                                value={token.format?.text_transform || 'none'}
                                onChange={(e) => updateTokenFormat(index, 'text_transform', e.target.value)}
                                className="mt-1 w-full px-2 py-1 border border-border rounded bg-bg-light text-fg-primary"
                              >
                                {formatTransforms.map((value) => (
                                  <option key={value} value={value}>
                                    {value}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="text-xs text-fg-secondary">
                              Align
                              <select
                                value={token.format?.align || ''}
                                onChange={(e) => updateTokenFormat(index, 'align', e.target.value)}
                                className="mt-1 w-full px-2 py-1 border border-border rounded bg-bg-light text-fg-primary"
                              >
                                <option value="">Default</option>
                                {alignOptions.map((value) => (
                                  <option key={value} value={value}>
                                    {value}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="text-xs text-fg-secondary">
                              Font Size
                              <input
                                type="text"
                                value={token.format?.font_size || ''}
                                onChange={(e) => updateTokenFormat(index, 'font_size', e.target.value)}
                                className="mt-1 w-full px-2 py-1 border border-border rounded bg-bg-light text-fg-primary"
                                placeholder="14px"
                              />
                            </label>
                            <label className="text-xs text-fg-secondary">
                              Text Color
                              <input
                                type="text"
                                value={token.format?.color || ''}
                                onChange={(e) => updateTokenFormat(index, 'color', e.target.value)}
                                className="mt-1 w-full px-2 py-1 border border-border rounded bg-bg-light text-fg-primary"
                                placeholder="#FF5733"
                              />
                            </label>
                            <label className="text-xs text-fg-secondary">
                              Background Color
                              <input
                                type="text"
                                value={token.format?.background_color || ''}
                                onChange={(e) => updateTokenFormat(index, 'background_color', e.target.value)}
                                className="mt-1 w-full px-2 py-1 border border-border rounded bg-bg-light text-fg-primary"
                                placeholder="#F0F0F0"
                              />
                            </label>
                            <div className="flex items-center gap-4 text-xs text-fg-secondary mt-6">
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={!!token.format?.bold}
                                  onChange={(e) => updateTokenFormat(index, 'bold', e.target.checked)}
                                />
                                Bold
                              </label>
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={!!token.format?.italic}
                                  onChange={(e) => updateTokenFormat(index, 'italic', e.target.checked)}
                                />
                                Italic
                              </label>
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={!!token.format?.underline}
                                  onChange={(e) => updateTokenFormat(index, 'underline', e.target.checked)}
                                />
                                Underline
                              </label>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between mt-6">
                  <button
                    type="button"
                    onClick={closeForm}
                    className="px-4 py-2 border border-border rounded text-fg-primary hover:bg-bg-dark"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded hover:bg-accent/90 disabled:opacity-70"
                  >
                    <Save size={16} />
                    {saving ? 'Saving...' : 'Save Profile'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
