import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Plus, Save, Trash2, AlertCircle, CheckCircle } from 'lucide-react';
import { apiClient, type TemplateSchema, type NodeTypeSchema } from '../../api/client';
import { TitleBar } from '../layout/TitleBar';
import type {
  NodeTemplate,
  NodeTemplateListEntry,
  NodeTemplateNode,
} from '../../types/nodeTemplate';
import { emptyTemplateNode } from '../../types/nodeTemplate';

type Props = {
  onClose: () => void;
  sessionId: string | null;
  blueprint: TemplateSchema | null;
  onChanged?: () => void;
};

type EditableTemplate = {
  id: string | null; // null when creating
  name: string;
  description: string;
  root: NodeTemplateNode;
};

function cloneTemplateNode(node: NodeTemplateNode): NodeTemplateNode {
  return {
    blueprint_type_id: node.blueprint_type_id,
    name: node.name,
    properties: { ...(node.properties ?? {}) },
    children: (node.children ?? []).map(cloneTemplateNode),
  };
}

function findNodeType(blueprint: TemplateSchema | null, typeId: string): NodeTypeSchema | undefined {
  if (!blueprint) return undefined;
  return blueprint.node_types.find((nt) => nt.id === typeId);
}

function rootCandidateTypes(blueprint: TemplateSchema | null): NodeTypeSchema[] {
  if (!blueprint) return [];
  // All node types are valid template roots. Even types marked is_root can be
  // useful when starting a sub-section or duplicating a top-level structure.
  return blueprint.node_types;
}

// Recursive node editor.
function TemplateNodeEditor({
  node,
  blueprint,
  onChange,
  onRemove,
  depth = 0,
}: {
  node: NodeTemplateNode;
  blueprint: TemplateSchema | null;
  onChange: (next: NodeTemplateNode) => void;
  onRemove?: () => void;
  depth?: number;
}) {
  const nodeType = findNodeType(blueprint, node.blueprint_type_id);
  const allowedChildren = nodeType?.allowed_children ?? [];
  const [addType, setAddType] = useState<string>(allowedChildren[0] ?? '');

  useEffect(() => {
    if (allowedChildren.length > 0 && !allowedChildren.includes(addType)) {
      setAddType(allowedChildren[0]);
    }
  }, [allowedChildren, addType]);

  const updateProperty = (propId: string, value: unknown) => {
    onChange({ ...node, properties: { ...node.properties, [propId]: value } });
  };

  const removeProperty = (propId: string) => {
    const next = { ...node.properties };
    delete next[propId];
    onChange({ ...node, properties: next });
  };

  const addChild = () => {
    if (!addType) return;
    const childType = findNodeType(blueprint, addType);
    const childName = childType?.name ?? addType;
    onChange({
      ...node,
      children: [...node.children, emptyTemplateNode(addType, `New ${childName}`)],
    });
  };

  const updateChild = (idx: number, next: NodeTemplateNode) => {
    const children = node.children.slice();
    children[idx] = next;
    onChange({ ...node, children });
  };

  const removeChild = (idx: number) => {
    const children = node.children.slice();
    children.splice(idx, 1);
    onChange({ ...node, children });
  };

  const renderPropertyEditor = (prop: NodeTypeSchema['properties'][number]) => {
    const current = node.properties[prop.id];
    const stringValue = current === undefined || current === null ? '' : String(current);
    const handle = (raw: string) => {
      if (raw === '') {
        removeProperty(prop.id);
        return;
      }
      if (prop.type === 'number' || prop.type === 'integer') {
        const parsed = prop.type === 'integer' ? parseInt(raw, 10) : parseFloat(raw);
        if (Number.isFinite(parsed)) {
          updateProperty(prop.id, parsed);
        } else {
          updateProperty(prop.id, raw);
        }
        return;
      }
      if (prop.type === 'boolean') {
        updateProperty(prop.id, raw === 'true');
        return;
      }
      updateProperty(prop.id, raw);
    };

    if (prop.type === 'boolean') {
      return (
        <select
          className="px-3 py-1.5 bg-bg-dark border border-border rounded text-sm text-fg-primary focus:outline-none focus:border-accent-primary transition-colors"
          value={stringValue || ''}
          onChange={(e) => handle(e.target.value)}
        >
          <option value="">(unset)</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      );
    }
    if (prop.type === 'select' && prop.options) {
      return (
        <select
          className="px-3 py-1.5 bg-bg-dark border border-border rounded text-sm text-fg-primary focus:outline-none focus:border-accent-primary transition-colors"
          value={stringValue}
          onChange={(e) => handle(e.target.value)}
        >
          <option value="">(unset)</option>
          {prop.options.map((opt) => (
            <option key={opt.id} value={opt.id}>{opt.name}</option>
          ))}
        </select>
      );
    }
    if (prop.type === 'number' || prop.type === 'integer') {
      return (
        <input
          type="number"
          className="px-3 py-1.5 bg-bg-dark border border-border rounded text-sm text-fg-primary focus:outline-none focus:border-accent-primary transition-colors w-40"
          value={stringValue}
          onChange={(e) => handle(e.target.value)}
        />
      );
    }
    return (
      <input
        type="text"
        className="px-3 py-1.5 bg-bg-dark border border-border rounded text-sm text-fg-primary focus:outline-none focus:border-accent-primary transition-colors flex-1"
        value={stringValue}
        onChange={(e) => handle(e.target.value)}
      />
    );
  };

  return (
    <div
      className="border border-border rounded bg-bg-dark p-4 mb-3"
      style={{ marginLeft: depth > 0 ? 16 : 0 }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="px-2 py-0.5 bg-accent-primary/10 text-accent-primary text-[11px] uppercase tracking-wide rounded font-mono">
          {nodeType?.name ?? node.blueprint_type_id}
        </span>
        <input
          type="text"
          value={node.name}
          onChange={(e) => onChange({ ...node, name: e.target.value })}
          placeholder="Default name"
          className="flex-1 px-3 py-1.5 bg-bg-light border border-border rounded text-sm text-fg-primary focus:outline-none focus:border-accent-primary transition-colors"
        />
        {onRemove && (
          <button
            onClick={onRemove}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-border rounded text-fg-secondary hover:border-status-danger hover:text-status-danger transition-colors"
            title="Remove this child"
          >
            <Trash2 size={12} />
            Remove
          </button>
        )}
      </div>

      {nodeType && nodeType.properties.length > 0 && (
        <div className="mb-3">
          <div className="text-[11px] uppercase tracking-wide text-fg-secondary font-semibold mb-2">Default values</div>
          <div className="space-y-2">
            {nodeType.properties
              .filter((p) => p.id !== 'name')
              .map((prop) => (
                <div key={prop.id} className="flex items-center gap-3 text-sm">
                  <span className="w-40 shrink-0 truncate text-fg-secondary" title={prop.id}>{prop.name || prop.id}</span>
                  {renderPropertyEditor(prop)}
                </div>
              ))}
          </div>
        </div>
      )}

      {allowedChildren.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex items-center gap-2 mb-2">
            <select
              value={addType}
              onChange={(e) => setAddType(e.target.value)}
              className="px-3 py-1.5 bg-bg-light border border-border rounded text-sm text-fg-primary focus:outline-none focus:border-accent-primary transition-colors"
            >
              {allowedChildren.map((id) => {
                const t = findNodeType(blueprint, id);
                return <option key={id} value={id}>{t?.name ?? id}</option>;
              })}
            </select>
            <button
              onClick={addChild}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-border rounded text-fg-primary hover:border-accent-primary hover:text-accent-primary transition-colors"
            >
              <Plus size={14} />
              Add child
            </button>
          </div>
          {node.children.map((child, idx) => (
            <TemplateNodeEditor
              key={idx}
              node={child}
              blueprint={blueprint}
              onChange={(next) => updateChild(idx, next)}
              onRemove={() => removeChild(idx)}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function NodeTemplateEditorDialog({ onClose, sessionId, blueprint, onChanged }: Props) {
  const [templates, setTemplates] = useState<NodeTemplateListEntry[]>([]);
  const [editing, setEditing] = useState<EditableTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedSuccessfully, setSavedSuccessfully] = useState(false);

  const rootTypes = useMemo(() => rootCandidateTypes(blueprint), [blueprint]);

  const refresh = useCallback(async () => {
    if (!sessionId) {
      setTemplates([]);
      return;
    }
    try {
      const list = await apiClient.listNodeTemplates(sessionId);
      setTemplates(list);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
    setError(null);
  }, [refresh]);

  const startCreate = () => {
    if (rootTypes.length === 0) {
      setError('No node types available in the current blueprint.');
      return;
    }
    const first = rootTypes[0];
    setEditing({
      id: null,
      name: 'New Template',
      description: '',
      root: emptyTemplateNode(first.id, first.name || first.id),
    });
    setSavedSuccessfully(false);
  };

  const startEdit = (entry: NodeTemplateListEntry) => {
    setEditing({
      id: entry.id,
      name: entry.name,
      description: entry.description ?? '',
      root: cloneTemplateNode(entry.root),
    });
    setSavedSuccessfully(false);
  };

  const handleDelete = async (entry: NodeTemplateListEntry) => {
    if (!sessionId) return;
    if (!confirm(`Delete template "${entry.name}"?`)) return;
    try {
      await apiClient.deleteNodeTemplate(sessionId, entry.id);
      await refresh();
      onChanged?.();
      if (editing?.id === entry.id) setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRootTypeChange = (typeId: string) => {
    if (!editing) return;
    const t = findNodeType(blueprint, typeId);
    setEditing({ ...editing, root: emptyTemplateNode(typeId, t?.name ?? typeId) });
  };

  const handleSave = async () => {
    if (!editing || !sessionId) return;
    if (!editing.name.trim()) {
      setError('Template name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    setSavedSuccessfully(false);
    try {
      const payload: Omit<NodeTemplate, 'id'> & { id?: string } = {
        name: editing.name.trim(),
        description: editing.description,
        root: editing.root,
      };
      if (editing.id) {
        await apiClient.updateNodeTemplate(sessionId, editing.id, { id: editing.id, ...payload });
      } else {
        const newId =
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        await apiClient.createNodeTemplate(sessionId, { id: newId, ...payload });
      }
      await refresh();
      onChanged?.();
      setSavedSuccessfully(true);
      window.setTimeout(() => setSavedSuccessfully(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-bg-dark">
      <TitleBar />

      <div className="flex flex-col overflow-hidden flex-1 bg-bg-light">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-1 hover:bg-bg-dark rounded transition-colors"
              title="Close"
            >
              <ChevronLeft size={24} className="text-fg-primary" />
            </button>
            <h1 className="text-2xl font-display font-bold text-fg-primary">Node Templates</h1>
          </div>
          <div className="flex items-center gap-2">
            {savedSuccessfully && (
              <div className="flex items-center gap-2 px-3 py-2 bg-status-success/10 text-status-success rounded">
                <CheckCircle size={18} />
                <span className="text-sm font-semibold">Saved successfully</span>
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 px-3 py-2 bg-status-danger/10 text-status-danger rounded">
                <AlertCircle size={18} />
                <span className="text-sm font-semibold">{error}</span>
              </div>
            )}
            {editing && (
              <>
                <button
                  onClick={() => setEditing(null)}
                  disabled={saving}
                  className="px-4 py-2 bg-bg-dark border border-border text-fg-primary rounded hover:bg-bg-light transition-colors disabled:opacity-50 font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-fg-primary rounded hover:bg-accent-hover disabled:opacity-50 transition-colors font-semibold"
                >
                  <Save size={20} />
                  {saving ? 'Saving…' : editing.id ? 'Save' : 'Create'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Body: split pane */}
        <div className="flex-1 overflow-hidden flex">
          {/* Left: template list */}
          <div className="w-72 border-r border-border flex flex-col bg-bg-dark">
            <div className="p-3 border-b border-border">
              <button
                onClick={startCreate}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-accent-primary text-fg-primary rounded hover:bg-accent-hover transition-colors font-semibold"
              >
                <Plus size={18} />
                New Template
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {templates.length === 0 && (
                <div className="p-4 text-sm text-fg-secondary">No templates yet. Click <em>New Template</em> to create one.</div>
              )}
              {templates.map((tpl) => {
                const rootTypeLabel = findNodeType(blueprint, tpl.root.blueprint_type_id)?.name
                  ?? tpl.root.blueprint_type_id;
                const isActive = editing?.id === tpl.id;
                return (
                  <div
                    key={tpl.id}
                    onClick={() => startEdit(tpl)}
                    className={`px-3 py-2 cursor-pointer border-b border-border flex items-center justify-between transition-colors ${
                      isActive ? 'bg-bg-light border-l-2 border-l-accent-primary' : 'hover:bg-bg-light/50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-fg-primary truncate">{tpl.name}</div>
                      <div className="text-[11px] text-fg-secondary truncate font-mono">{rootTypeLabel}</div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDelete(tpl);
                      }}
                      className="ml-2 p-1 text-fg-secondary hover:text-status-danger transition-colors"
                      title="Delete template"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: editor */}
          <div className="flex-1 overflow-y-auto p-6">
            {!editing && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <p className="text-lg text-fg-secondary mb-2">No template selected</p>
                <p className="text-sm text-fg-secondary/80">
                  Select a template on the left, or click <em>New Template</em> to create one from scratch.
                </p>
              </div>
            )}
            {editing && (
              <div className="max-w-3xl">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <label className="flex flex-col text-sm font-semibold text-fg-secondary">
                    Name
                    <input
                      type="text"
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      className="mt-1 px-3 py-2 bg-bg-dark border border-border rounded text-fg-primary focus:outline-none focus:border-accent-primary transition-colors"
                    />
                  </label>
                  <label className="flex flex-col text-sm font-semibold text-fg-secondary">
                    Root type
                    <select
                      value={editing.root.blueprint_type_id}
                      onChange={(e) => handleRootTypeChange(e.target.value)}
                      disabled={editing.id !== null}
                      className="mt-1 px-3 py-2 bg-bg-dark border border-border rounded text-fg-primary focus:outline-none focus:border-accent-primary transition-colors disabled:opacity-60"
                      title={editing.id !== null ? 'Root type is fixed once a template is saved' : ''}
                    >
                      {rootTypes.map((t) => (
                        <option key={t.id} value={t.id}>{t.name || t.id}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="flex flex-col text-sm font-semibold text-fg-secondary mb-6">
                  Description
                  <textarea
                    value={editing.description}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                    rows={2}
                    className="mt-1 px-3 py-2 bg-bg-dark border border-border rounded text-fg-primary focus:outline-none focus:border-accent-primary transition-colors resize-none"
                  />
                </label>

                <div className="text-xs uppercase tracking-wide text-fg-secondary font-semibold mb-2">
                  Structure
                </div>
                <TemplateNodeEditor
                  node={editing.root}
                  blueprint={blueprint}
                  onChange={(next) => setEditing({ ...editing, root: next })}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
