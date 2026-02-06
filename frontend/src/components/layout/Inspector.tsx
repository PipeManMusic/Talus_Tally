import { useState } from 'react';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { CurrencyInput } from '../ui/CurrencyInput';
import { TextEditorModal, type MarkupToken } from '../ui/TextEditorModal';

export interface NodeProperty {
  id: string;
  name: string;
  type: 'text' | 'number' | 'select' | 'textarea' | 'currency' | 'date' | 'checkbox' | 'editor';
  value: string | number;
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
  markupTokens?: MarkupToken[];
}

export interface LinkedAssetMetadata {
  nodeId: string;
  nodeType: string;
  name: string;
  properties: NodeProperty[];
}

interface InspectorProps {
  nodeId?: string;
  nodeName?: string;
  nodeType?: string;
  properties: NodeProperty[];
  onPropertyChange?: (propId: string, value: string | number) => void;
  linkedAsset?: LinkedAssetMetadata;
  onLinkedAssetPropertyChange?: (propId: string, value: string | number) => void;
  orphanedProperties?: Record<string, string | number>;
  onOrphanedPropertyDelete?: (propKey: string) => void;
}

export function Inspector({
  nodeId,
  nodeName,
  nodeType,
  properties,
  onPropertyChange,
  linkedAsset,
  onLinkedAssetPropertyChange,
  orphanedProperties,
  onOrphanedPropertyDelete,
}: InspectorProps) {
  const [editorState, setEditorState] = useState<{
    isOpen: boolean;
    propId: string;
    propName: string;
    value: string;
    isLinkedAsset: boolean;
    markupTokens?: MarkupToken[];
  }>({ isOpen: false, propId: '', propName: '', value: '', isLinkedAsset: false, markupTokens: [] });

  const openEditor = (
    propId: string, 
    propName: string, 
    value: string | number, 
    isLinkedAsset = false,
    markupTokens: MarkupToken[] = []
  ) => {
    setEditorState({
      isOpen: true,
      propId,
      propName,
      value: String(value),
      isLinkedAsset,
      markupTokens,
    });
  };

  const closeEditor = () => {
    setEditorState({ isOpen: false, propId: '', propName: '', value: '', isLinkedAsset: false, markupTokens: [] });
  };

  const saveEditorContent = (newValue: string) => {
    if (editorState.isLinkedAsset) {
      onLinkedAssetPropertyChange?.(editorState.propId, newValue);
    } else {
      onPropertyChange?.(editorState.propId, newValue);
    }
    closeEditor();
  };

  if (!nodeId) {
    return (
      <aside className="bg-bg-light border-l border-border p-3 flex items-center justify-center">
        <div className="text-sm text-fg-secondary text-center">
          Select a node to view properties
        </div>
      </aside>
    );
  }

  return (
    <aside className="bg-bg-light border-l border-border flex-1 flex flex-col h-full overflow-hidden">
      <div className="font-display text-sm border-b border-accent-primary pb-2 mb-3 px-3 pt-3 flex-shrink-0">
        Properties
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3">
        {/* Node Info */}
        <div className="mb-3">
          <div className="text-xs text-fg-secondary mb-1">Node Type</div>
          <div className="text-sm text-fg-primary font-semibold bg-accent-primary/10 rounded px-2 py-1 capitalize">
            {nodeType || 'Unknown'}
          </div>
        </div>
        <div className="mb-3">
          <div className="text-xs text-fg-secondary mb-1">Node ID</div>
          <div className="text-sm text-fg-primary font-mono bg-bg-dark rounded px-2 py-1 truncate" title={nodeId}>
            {nodeId}
          </div>
        </div>
        {/* Properties */}
        <div className="space-y-3">
        {properties.map((prop) => (
          <div key={prop.id}>
            {prop.type === 'text' && (
              <Input
                label={prop.name}
                value={prop.value}
                onChange={(e) => onPropertyChange?.(prop.id, e.target.value)}
                required={prop.required}
              />
            )}
            {prop.type === 'number' && (
              <Input
                label={prop.name}
                type="number"
                value={prop.value}
                onChange={(e) =>
                  onPropertyChange?.(prop.id, e.target.valueAsNumber)
                }
                required={prop.required}
              />
            )}
            {prop.type === 'currency' && (
              <CurrencyInput
                label={prop.name}
                value={prop.value}
                onChange={(e) => onPropertyChange?.(prop.id, e.target.value)}
                required={prop.required}
              />
            )}
            {prop.type === 'date' && (
              <Input
                label={prop.name}
                type="date"
                value={prop.value}
                onChange={(e) => onPropertyChange?.(prop.id, e.target.value)}
                required={prop.required}
              />
            )}
            {prop.type === 'select' && prop.options && (
              <Select
                label={prop.name}
                value={String(prop.value)}
                onChange={(e) => onPropertyChange?.(prop.id, e.target.value)}
                options={prop.options}
                required={prop.required}
              />
            )}
            {prop.type === 'textarea' && (
              <div>
                <label className="block text-sm text-fg-secondary mb-1">
                  {prop.name}
                </label>
                <textarea
                  value={prop.value}
                  onChange={(e) =>
                    onPropertyChange?.(prop.id, e.target.value)
                  }
                  className="w-full bg-bg-dark text-fg-primary border border-border rounded-sm px-2 py-1 text-sm font-body focus:border-accent-primary focus:outline-none resize-none"
                  rows={3}
                  required={prop.required}
                />
              </div>
            )}
            {prop.type === 'checkbox' && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`checkbox-${prop.id}`}
                  checked={prop.value === 'true' || prop.value === 1 || prop.value === '1'}
                  onChange={(e) =>
                    onPropertyChange?.(prop.id, e.target.checked ? 'true' : 'false')
                  }
                  className="w-4 h-4 cursor-pointer accent-accent-primary"
                />
                <label
                  htmlFor={`checkbox-${prop.id}`}
                  className="text-sm text-fg-secondary cursor-pointer"
                >
                  {prop.name}
                </label>
              </div>
            )}
            {prop.type === 'editor' && (
              <div>
                <label className="block text-sm text-fg-secondary mb-1">
                  {prop.name}
                </label>
                <div className="flex gap-2 items-center">
                  <div className="flex-1 bg-bg-dark text-fg-primary border border-border rounded-sm px-2 py-1 text-sm truncate">
                    {String(prop.value).substring(0, 50)}{String(prop.value).length > 50 ? '...' : ''}
                  </div>
                  <button
                    onClick={() => openEditor(prop.id, prop.name, prop.value, false, prop.markupTokens || [])}
                    className="px-3 py-1 bg-accent-primary text-fg-primary rounded hover:bg-accent-hover transition-colors text-sm font-semibold"
                  >
                    Edit
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        </div>

        {/* Orphaned Properties Section */}
        {orphanedProperties && Object.keys(orphanedProperties).length > 0 && (
          <div className="mt-6 pt-6 border-t border-border">
            <div className="font-display text-sm border-b border-orange-500/50 pb-2 mb-3 text-orange-400 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Orphaned Properties
            </div>
            <div className="mb-3 text-xs text-orange-300/80 bg-orange-500/10 border border-orange-500/30 rounded px-2 py-2">
              These properties were removed from the template but their values are preserved. They are read-only and can be deleted.
            </div>
            <div className="space-y-3">
              {Object.entries(orphanedProperties).map(([key, value]) => (
                <div key={key} className="relative">
                  <label className="block text-sm text-fg-secondary mb-1">{key}</label>
                  <div className="flex gap-2 items-center">
                    <div className="flex-1 bg-bg-dark/50 text-fg-primary/70 border border-orange-500/30 rounded-sm px-2 py-1 text-sm">
                      {String(value)}
                    </div>
                    <button
                      onClick={() => onOrphanedPropertyDelete?.(key)}
                      className="px-3 py-1 bg-status-danger/20 text-status-danger rounded hover:bg-status-danger/30 transition-colors text-sm font-semibold"
                      title="Delete orphaned property"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Linked Asset Metadata Section */}
        {linkedAsset && (
          <div className="mt-6 pt-6 border-t border-border">
            <div className="font-display text-sm border-b border-accent-success pb-2 mb-3 text-accent-success">
              Linked Asset: {linkedAsset.name}
            </div>
            <div className="mb-3">
              <div className="text-xs text-fg-secondary mb-1">Asset Type</div>
              <div className="text-sm text-fg-primary font-semibold bg-accent-success/10 rounded px-2 py-1 capitalize">
                {linkedAsset.nodeType}
              </div>
            </div>
            <div className="mb-3">
              <div className="text-xs text-fg-secondary mb-1">Asset ID</div>
              <div className="text-sm text-fg-primary font-mono bg-bg-dark rounded px-2 py-1 truncate" title={linkedAsset.nodeId}>
                {linkedAsset.nodeId}
              </div>
            </div>
            <div className="space-y-3">
              {linkedAsset.properties.map((prop) => (
                <div key={prop.id}>
                  {prop.type === 'text' && (
                    <Input
                      label={prop.name}
                      value={prop.value}
                      onChange={(e) => onLinkedAssetPropertyChange?.(prop.id, e.target.value)}
                      required={prop.required}
                    />
                  )}
                  {prop.type === 'number' && (
                    <Input
                      label={prop.name}
                      type="number"
                      value={prop.value}
                      onChange={(e) =>
                        onLinkedAssetPropertyChange?.(prop.id, e.target.valueAsNumber)
                      }
                      required={prop.required}
                    />
                  )}
                  {prop.type === 'currency' && (
                    <CurrencyInput
                      label={prop.name}
                      value={prop.value}
                      onChange={(e) => onLinkedAssetPropertyChange?.(prop.id, e.target.value)}
                      required={prop.required}
                    />
                  )}
                  {prop.type === 'date' && (
                    <Input
                      label={prop.name}
                      type="date"
                      value={prop.value}
                      onChange={(e) => onLinkedAssetPropertyChange?.(prop.id, e.target.value)}
                      required={prop.required}
                    />
                  )}
                  {prop.type === 'select' && prop.options && (
                    <Select
                      label={prop.name}
                      value={String(prop.value)}
                      onChange={(e) => onLinkedAssetPropertyChange?.(prop.id, e.target.value)}
                      options={prop.options}
                      required={prop.required}
                    />
                  )}
                  {prop.type === 'textarea' && (
                    <div>
                      <label className="block text-sm text-fg-secondary mb-1">
                        {prop.name}
                      </label>
                      <textarea
                        value={prop.value}
                        onChange={(e) =>
                          onLinkedAssetPropertyChange?.(prop.id, e.target.value)
                        }
                        className="w-full bg-bg-dark text-fg-primary border border-border rounded-sm px-2 py-1 text-sm font-body focus:border-accent-primary focus:outline-none resize-none"
                        rows={3}
                        required={prop.required}
                      />
                    </div>
                  )}
                  {prop.type === 'checkbox' && (
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`checkbox-asset-${prop.id}`}
                        checked={prop.value === 'true' || prop.value === 1 || prop.value === '1'}
                        onChange={(e) =>
                          onLinkedAssetPropertyChange?.(prop.id, e.target.checked ? 'true' : 'false')
                        }
                        className="w-4 h-4 cursor-pointer accent-accent-primary"
                      />
                      <label
                        htmlFor={`checkbox-asset-${prop.id}`}
                        className="text-sm text-fg-secondary cursor-pointer"
                      >
                        {prop.name}
                      </label>
                    </div>
                  )}
                  {prop.type === 'editor' && (
                    <div>
                      <label className="block text-sm text-fg-secondary mb-1">
                        {prop.name}
                      </label>
                      <div className="flex gap-2 items-center">
                        <div className="flex-1 bg-bg-dark text-fg-primary border border-border rounded-sm px-2 py-1 text-sm truncate">
                          {String(prop.value).substring(0, 50)}{String(prop.value).length > 50 ? '...' : ''}
                        </div>
                        <button
                          onClick={() => openEditor(prop.id, prop.name, prop.value, true, prop.markupTokens || [])}
                          className="px-3 py-1 bg-accent-primary text-fg-primary rounded hover:bg-accent-hover transition-colors text-sm font-semibold"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Text Editor Modal */}
        <TextEditorModal
          isOpen={editorState.isOpen}
          title={editorState.propName}
          value={editorState.value}
          onChange={(newValue) => {
            setEditorState({ ...editorState, value: newValue });
          }}
          onClose={closeEditor}
          onSave={saveEditorContent}
          markupTokens={editorState.markupTokens}
        />
      </div>
    </aside>
  );
}
