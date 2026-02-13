import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, Plus, Save, Trash2, AlertCircle, CheckCircle } from 'lucide-react';
import { apiClient } from '../api/client';
import { TitleBar } from '../components/layout/TitleBar';
import { NodeTypeEditor, type NodeType, type Property } from './NodeTypeEditor';

interface Template {
  id: string;
  uuid?: string;
  name: string;
  version: string;
  description: string;
  node_types: NodeType[];
  blocking_view?: {
    node_size?: {
      base_width?: number;
      base_height?: number;
      max_depth?: number;
      min_scale?: number;
      max_scale?: number;
      direction?: 'up' | 'down';
    };
  };
}

interface TemplateListItem {
  id: string;
  uuid?: string;
  name: string;
  version: string;
  description: string;
}

const generateTemplateUuid = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `tt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

interface ValidationResult {
  is_valid: boolean;
  errors: string[];
}

export function TemplateEditor({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [currentTemplate, setCurrentTemplate] = useState<Template | null>(null);
  const [originalTemplate, setOriginalTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [savedSuccessfully, setSavedSuccessfully] = useState(false);
  const [orphanInfo, setOrphanInfo] = useState<any>(null);

  const defaultNodeSizeConfig = {
    base_width: 160,
    base_height: 100,
    max_depth: 6,
    min_scale: 0.7,
    max_scale: 1.3,
    direction: 'down' as const,
  };

  // Load templates list
  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.listTemplatesForEditor();
        // Deduplicate templates by ID to prevent React key conflicts
        const uniqueTemplates = Array.from(
          new Map((response.templates || []).map((t: TemplateListItem) => [t.id, t])).values()
        );
        setTemplates(uniqueTemplates as TemplateListItem[]);
      
        // Warn if duplicates were found
        if (uniqueTemplates.length < (response.templates || []).length) {
          console.warn('[TemplateEditor] Duplicate template IDs detected and removed');
        }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOpenTemplate = useCallback(async (templateId: string) => {
    setLoading(true);
    setError(null);
    setValidationErrors([]);
    try {
      const template = await apiClient.getTemplateForEditor(templateId);
      setCurrentTemplate(template);
      setOriginalTemplate(JSON.parse(JSON.stringify(template))); // Deep clone
      setSavedSuccessfully(false);
      setOrphanInfo(null);
      setView('editor');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load template');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCreateNewTemplate = useCallback(() => {
    console.log('[TemplateEditor] Creating new template...');
    const newTemplate: Template = {
      id: 'new_template',
      uuid: generateTemplateUuid(),
      name: 'New Template',
      version: '0.1.0',
      description: 'A new template',
      blocking_view: {
        node_size: { ...defaultNodeSizeConfig },
      },
      node_types: [
        {
          id: 'root',
          label: 'Root',
          allowed_children: [],
          properties: [
            {
              id: 'name',
              label: 'Name',
              type: 'text',
            },
          ],
        },
      ],
    };
    setCurrentTemplate(newTemplate);
    setOriginalTemplate(null); // New template has no original
    setValidationErrors([]);
    setError(null);
    setSavedSuccessfully(false);
    setOrphanInfo(null);
    setView('editor');
    console.log('[TemplateEditor] New template created, switching to editor view');
  }, []);

  const handleCancel = useCallback(() => {
    console.log('[TemplateEditor] Cancelling and returning to list...');
    // Reset all state to go back to list
    setCurrentTemplate(null);
    setOriginalTemplate(null);
    setValidationErrors([]);
    setError(null);
    setSavedSuccessfully(false);
    setOrphanInfo(null);
    setView('list');
    console.log('[TemplateEditor] Cancel complete, view set to list');
  }, []);

  const handleSaveTemplate = useCallback(async () => {
    if (!currentTemplate) return;

    setLoading(true);
    setError(null);
    setSavedSuccessfully(false);
    setOrphanInfo(null);

    try {
      const validation: ValidationResult = await apiClient.validateTemplate(currentTemplate);
      if (!validation.is_valid) {
        setValidationErrors(validation.errors);
        setError('Template has validation errors');
        setLoading(false);
        return;
      }
      setValidationErrors([]);

      const isNew = !templates.some(t => t.id === currentTemplate.id);
      let result;
      if (isNew) {
        result = await apiClient.createTemplate(currentTemplate);
      } else {
        result = await apiClient.updateTemplate(currentTemplate.id, currentTemplate);
      }

      if (result?.orphan_info && result.orphan_info.total_orphaned_nodes > 0) {
        setOrphanInfo(result.orphan_info);
      }

      const updatedTemplate: Template = result?.template ?? { ...currentTemplate };
      setCurrentTemplate(updatedTemplate);
      setOriginalTemplate(JSON.parse(JSON.stringify(updatedTemplate)));

      setSavedSuccessfully(true);
      setTimeout(() => {
        setSavedSuccessfully(false);
        setOrphanInfo(null);
      }, 8000);

      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setLoading(false);
    }
  }, [currentTemplate, templates, loadTemplates]);

  const handleDeleteTemplate = useCallback(async () => {
    if (!currentTemplate) return;
    
    if (!window.confirm(`Are you sure you want to delete template "${currentTemplate.name}"?`)) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await apiClient.deleteTemplate(currentTemplate.id);
      setView('list');
      setCurrentTemplate(null);
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete template');
    } finally {
      setLoading(false);
    }
  }, [currentTemplate, loadTemplates]);

  const updateCurrentTemplate = useCallback((updates: Partial<Template>) => {
    setSavedSuccessfully(false);
    setCurrentTemplate(prev => {
      if (!prev) return prev;
      return { ...prev, ...updates };
    });
  }, []);

  const updateBlockingNodeSize = useCallback((updates: Partial<NonNullable<Template['blocking_view']>['node_size']>) => {
    setSavedSuccessfully(false);
    setCurrentTemplate(prev => {
      if (!prev) return prev;
      const node_size = { ...(prev.blocking_view?.node_size || {}), ...updates };
      return {
        ...prev,
        blocking_view: {
          ...(prev.blocking_view || {}),
          node_size,
        },
      };
    });
  }, []);

  const handleNodeTypesChange = useCallback(async (nodeTypes: NodeType[]) => {
    updateCurrentTemplate({ node_types: nodeTypes });
  }, [updateCurrentTemplate]);

  // List View
  if (view === 'list') {
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
                title="Close"
              >
                <ChevronLeft size={24} className="text-fg-primary" />
              </button>
              <h1 className="text-2xl font-display font-bold text-fg-primary">Template Editor</h1>
            </div>
            <button
              onClick={handleCreateNewTemplate}
              className="flex items-center gap-2 px-3 py-2 bg-accent-primary text-bg-dark rounded hover:opacity-90 transition-opacity font-semibold"
            >
              <Plus size={18} />
              New Template
            </button>
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
                <div className="text-fg-secondary">Loading templates...</div>
              </div>
            ) : templates.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <p className="text-lg text-fg-secondary mb-4">No templates found</p>
                <button
                  onClick={handleCreateNewTemplate}
                  className="px-4 py-2 bg-accent-primary text-bg-dark rounded hover:opacity-90 transition-opacity font-semibold"
                >
                  Create the first template
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map(template => (
                  <div
                    key={template.id}
                    className="p-0 border border-border rounded bg-bg-dark hover:border-accent-primary cursor-pointer transition-colors group flex flex-col h-full"
                    onClick={() => handleOpenTemplate(template.id)}
                  >
                    <div className="flex-1 p-4 flex flex-col">
                      <h2 className="text-lg font-semibold text-fg-primary mb-1 font-mono">{template.id}</h2>
                      <p className="text-sm text-fg-secondary">{template.name}</p>
                      {template.description && (
                        <p className="text-xs text-fg-secondary mt-1">{template.description}</p>
                      )}
                    </div>
                    <div className="flex items-center justify-between px-4 pb-4 pt-2">
                      <span className="px-2 py-1 bg-accent-primary/10 text-accent-primary text-xs rounded font-mono inline-block">
                        v{template.version}
                      </span>
                      <button
                        onClick={e => { e.stopPropagation(); handleOpenTemplate(template.id); }}
                        className="px-2 py-1 text-xs font-semibold border border-border rounded hover:border-accent-primary transition-colors"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Editor View - guard against no template selected
  if (!currentTemplate) {
    return null;
  }

  const orphanedNodesCount = orphanInfo?.total_orphaned_nodes ?? 0;
  const orphanedPropertiesCount = orphanInfo?.total_orphaned_properties ?? 0;
  const orphanedSessionsCount = orphanInfo?.orphaned_sessions?.length ?? 0;
  const nodeSizeConfig = currentTemplate.blocking_view?.node_size || defaultNodeSizeConfig;
  const isBlockingSizeEnabled = !!currentTemplate.blocking_view?.node_size;

  return (
    <div className="flex flex-col h-full bg-bg-dark">
      {/* Title Bar - provides window management controls */}
      <TitleBar />
      
      {/* Template Editor Content */}
      <div className="flex flex-col h-full overflow-hidden flex-1">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <button
            onClick={handleCancel}
            className="p-1 hover:bg-bg-dark rounded transition-colors"
            title="Cancel and go back"
            disabled={loading}
          >
            <ChevronLeft size={24} className="text-fg-primary" />
          </button>
          <h1 className="text-2xl font-display font-bold text-fg-primary">{currentTemplate.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          {savedSuccessfully && !orphanInfo && (
            <div className="flex items-center gap-2 px-3 py-2 bg-status-success/10 text-status-success rounded">
              <CheckCircle size={18} />
              <span className="text-sm font-semibold">Saved successfully</span>
            </div>
          )}
          {orphanInfo && (
            <div className="flex items-center gap-2 px-3 py-2 bg-orange-500/10 text-orange-400 rounded border border-orange-500/30">
              <AlertCircle size={18} />
              <div className="text-sm">
                <span className="font-semibold">
                  Saved with {orphanedNodesCount} orphaned node{orphanedNodesCount !== 1 ? 's' : ''}
                  {orphanedPropertiesCount > 0 && (
                    <span> and {orphanedPropertiesCount} orphaned propert{orphanedPropertiesCount !== 1 ? 'ies' : 'y'}</span>
                  )}
                </span>
                <span className="text-xs block text-orange-300/80">
                  {orphanedSessionsCount} active session{orphanedSessionsCount !== 1 ? 's' : ''} affected
                </span>
              </div>
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-status-danger/10 text-status-danger rounded">
              <AlertCircle size={18} />
              <span className="text-sm font-semibold">{error}</span>
            </div>
          )}
          <button
            onClick={handleCancel}
            disabled={loading}
            className="px-4 py-2 bg-bg-dark border border-border text-fg-primary rounded hover:bg-bg-light transition-colors disabled:opacity-50 font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveTemplate}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-fg-primary rounded hover:bg-accent-hover disabled:opacity-50 transition-colors font-semibold"
          >
            <Save size={20} />
            Save
          </button>
          <button
            onClick={handleDeleteTemplate}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-status-danger/20 text-status-danger rounded hover:bg-status-danger/30 disabled:opacity-50 transition-colors font-semibold"
          >
            <Trash2 size={20} />
            Delete
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {validationErrors.length > 0 && (
          <div className="mb-6 p-4 bg-status-danger/10 border border-status-danger rounded">
            <h3 className="font-semibold text-status-danger mb-2">Validation Errors:</h3>
            <ul className="text-sm text-status-danger/90 space-y-1">
              {validationErrors.map((error, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span>•</span>
                  <span>{error}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {orphanInfo && (orphanedNodesCount > 0 || orphanedPropertiesCount > 0) && (
          <div className="mb-6 p-4 bg-orange-500/10 border border-orange-500/30 rounded">
            <h3 className="font-semibold text-orange-400 mb-2 flex items-center gap-2">
              <AlertCircle size={18} />
              Orphaned Data Created
            </h3>
            <p className="text-sm text-orange-300/90 mb-3">
              {orphanedNodesCount > 0 && (
                <span>
                  {orphanedNodesCount} node{orphanedNodesCount !== 1 ? 's' : ''} in{' '}
                  {orphanedSessionsCount} active session{orphanedSessionsCount !== 1 ? 's' : ''}{' '}
                  became orphaned because their node type was removed.
                  {orphanedPropertiesCount > 0 && ' '}
                </span>
              )}
              {orphanedPropertiesCount > 0 && (
                <span>
                  {orphanedNodesCount > 0 && 'Additionally, '}
                  {orphanedPropertiesCount} propert{orphanedPropertiesCount !== 1 ? 'ies' : 'y'} became orphaned because they were removed from node types.
                </span>
              )}
            </p>
            <div className="text-xs text-orange-200/80 space-y-1">
              <p><strong>What this means:</strong></p>
              <ul className="ml-4 space-y-1">
                {orphanedNodesCount > 0 && (
                  <>
                    <li>• <strong>Orphaned nodes:</strong> Preserve all data and properties</li>
                    <li>• You can still view, edit, and delete orphaned nodes</li>
                    <li>• Children cannot be added to orphaned nodes</li>
                    <li>• They exist outside the template structure</li>
                  </>
                )}
                {orphanedPropertiesCount > 0 && (
                  <>
                    <li>• <strong>Orphaned properties:</strong> Preserve existing values</li>
                    <li>• Appear in "Orphaned Properties" section in Inspector</li>
                    <li>• Read-only (cannot be edited)</li>
                    <li>• Can be deleted if no longer needed</li>
                  </>
                )}
              </ul>
            </div>
          </div>
        )}

        {/* Template Info */}
        <div className="bg-bg-dark border border-border rounded p-6 mb-6">
          <h2 className="text-lg font-semibold text-fg-primary mb-4">Template Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-fg-secondary mb-1">ID</label>
              <input
                type="text"
                value={currentTemplate.id}
                onChange={(e) => updateCurrentTemplate({ id: e.target.value })}
                className="w-full px-3 py-2 bg-bg-light border border-border rounded text-fg-primary font-mono"
              />
            </div>
            <div>
              <label className="block text-sm text-fg-secondary mb-1">Version</label>
              <input
                type="text"
                value={currentTemplate.version}
                onChange={(e) => updateCurrentTemplate({ version: e.target.value })}
                className="w-full px-3 py-2 bg-bg-light border border-border rounded text-fg-primary"
                placeholder="0.1.0"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm text-fg-secondary mb-1">Name</label>
              <input
                type="text"
                value={currentTemplate.name}
                onChange={(e) => updateCurrentTemplate({ name: e.target.value })}
                className="w-full px-3 py-2 bg-bg-light border border-border rounded text-fg-primary"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm text-fg-secondary mb-1">Description</label>
              <textarea
                value={currentTemplate.description}
                onChange={(e) => updateCurrentTemplate({ description: e.target.value })}
                className="w-full px-3 py-2 bg-bg-light border border-border rounded text-fg-primary resize-none"
                rows={3}
              />
            </div>
          </div>
        </div>

        {/* Blocking View Settings */}
        <div className="bg-bg-dark border border-border rounded p-6 mb-6">
          <h2 className="text-lg font-semibold text-fg-primary mb-4">Blocking View</h2>
          <label className="flex items-center gap-2 text-sm text-fg-secondary mb-4">
            <input
              type="checkbox"
              checked={isBlockingSizeEnabled}
              onChange={(e) => {
                if (e.target.checked) {
                  updateCurrentTemplate({
                    blocking_view: {
                      node_size: { ...defaultNodeSizeConfig },
                    },
                  });
                } else {
                  updateCurrentTemplate({ blocking_view: undefined });
                }
              }}
              className="rounded"
            />
            Enable size scaling by hierarchy depth
          </label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-fg-secondary mb-1">Base Width</label>
              <input
                type="number"
                min={40}
                step={1}
                value={nodeSizeConfig.base_width ?? ''}
                onChange={(e) => {
                  const value = e.target.value === '' ? undefined : Number(e.target.value);
                  updateBlockingNodeSize({ base_width: value });
                }}
                disabled={!isBlockingSizeEnabled}
                className="w-full px-3 py-2 bg-bg-light border border-border rounded text-fg-primary"
              />
            </div>
            <div>
              <label className="block text-sm text-fg-secondary mb-1">Base Height</label>
              <input
                type="number"
                min={30}
                step={1}
                value={nodeSizeConfig.base_height ?? ''}
                onChange={(e) => {
                  const value = e.target.value === '' ? undefined : Number(e.target.value);
                  updateBlockingNodeSize({ base_height: value });
                }}
                disabled={!isBlockingSizeEnabled}
                className="w-full px-3 py-2 bg-bg-light border border-border rounded text-fg-primary"
              />
            </div>
            <div>
              <label className="block text-sm text-fg-secondary mb-1">Min Scale</label>
              <input
                type="number"
                min={0.1}
                step={0.05}
                value={nodeSizeConfig.min_scale ?? ''}
                onChange={(e) => {
                  const value = e.target.value === '' ? undefined : Number(e.target.value);
                  updateBlockingNodeSize({ min_scale: value });
                }}
                disabled={!isBlockingSizeEnabled}
                className="w-full px-3 py-2 bg-bg-light border border-border rounded text-fg-primary"
              />
            </div>
            <div>
              <label className="block text-sm text-fg-secondary mb-1">Max Scale</label>
              <input
                type="number"
                min={0.1}
                step={0.05}
                value={nodeSizeConfig.max_scale ?? ''}
                onChange={(e) => {
                  const value = e.target.value === '' ? undefined : Number(e.target.value);
                  updateBlockingNodeSize({ max_scale: value });
                }}
                disabled={!isBlockingSizeEnabled}
                className="w-full px-3 py-2 bg-bg-light border border-border rounded text-fg-primary"
              />
            </div>
            <div>
              <label className="block text-sm text-fg-secondary mb-1">Max Depth</label>
              <input
                type="number"
                min={1}
                step={1}
                value={nodeSizeConfig.max_depth ?? ''}
                onChange={(e) => {
                  const value = e.target.value === '' ? undefined : Number(e.target.value);
                  updateBlockingNodeSize({ max_depth: value });
                }}
                disabled={!isBlockingSizeEnabled}
                className="w-full px-3 py-2 bg-bg-light border border-border rounded text-fg-primary"
              />
            </div>
            <div>
              <label className="block text-sm text-fg-secondary mb-1">Direction</label>
              <select
                value={nodeSizeConfig.direction || 'down'}
                onChange={(e) => {
                  const value = e.target.value === 'up' ? 'up' : 'down';
                  updateBlockingNodeSize({ direction: value });
                }}
                disabled={!isBlockingSizeEnabled}
                className="w-full px-3 py-2 bg-bg-light border border-border rounded text-fg-primary"
              >
                <option value="down">Deeper = smaller</option>
                <option value="up">Deeper = larger</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-fg-secondary mt-3">
            Sizes scale by depth from root in the blocking editor. Max Depth caps the effect.
          </p>
        </div>

        {/* Node Types */}
        <div className="bg-bg-dark border border-border rounded p-6">
          <h2 className="text-lg font-semibold text-fg-primary mb-4">Node Types</h2>
          <NodeTypeEditor
            nodeTypes={currentTemplate.node_types}
            onChange={handleNodeTypesChange}
          />
        </div>

        <div className="mt-6 text-sm text-fg-secondary text-center pb-6">
          <p>Support for indicator management and markup profiles coming soon...</p>
        </div>
      </div>
      </div>
    </div>
  );
}

