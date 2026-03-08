import { useEffect, useRef, useState } from 'react';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { CurrencyInput } from '../ui/CurrencyInput';
import { TemplateAwareEditor } from '../ui/TemplateAwareEditor';
import type { MarkupToken } from '../../services/markupRenderService';

export interface NodeProperty {
  id: string;
  name: string;
  type: 'text' | 'number' | 'select' | 'textarea' | 'currency' | 'date' | 'checkbox' | 'editor';
  value: string | number;
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
  markupTokens?: MarkupToken[];
  markupProfile?: string;
  /**
   * Display group for property grouping in the Inspector.
   * Properties with the same group are rendered together under a section header.
   */
  group?: string;
}

export interface LinkedAssetMetadata {
  nodeId: string;
  nodeType: string;
  name: string;
  properties: NodeProperty[];
}

export interface VelocityScore {
  nodeId: string;
  baseScore: number;
  inheritedScore: number;
  statusScore: number;
  numericalScore: number;
  blockingPenalty: number;
  blockingBonus: number;
  totalVelocity: number;
  isBlocked: boolean;
  blockedByNodes?: string[];
  blocksNodeIds?: string[];
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
  blockedByNodes?: string[];
  blocksNodes?: string[];
  nodes?: Record<string, any>;
  onClearBlocks?: (nodeId: string) => void;
  /** Clear a single blocking relationship. blockedNodeId is the node being unblocked. */
  onClearSingleBlock?: (blockedNodeId: string) => void;
  velocityScore?: VelocityScore;
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
  blockedByNodes = [],
  blocksNodes = [],
  nodes = {},
  onClearBlocks,
  onClearSingleBlock,
  velocityScore,
}: InspectorProps) {
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const pendingCommits = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [editorState, setEditorState] = useState<{
    isOpen: boolean;
    propId: string;
    propName: string;
    value: string;
    isLinkedAsset: boolean;
    markupProfile?: string;
  }>({ isOpen: false, propId: '', propName: '', value: '', isLinkedAsset: false });

  const handlePropertyChange = (propId: string, value: string | number) => {
    onPropertyChange?.(propId, value);
  };

  const handleLinkedAssetPropertyChange = (propId: string, value: string | number) => {
    onLinkedAssetPropertyChange?.(propId, value);
  };

  useEffect(() => {
    setDraftValues({});
    Object.values(pendingCommits.current).forEach(clearTimeout);
    pendingCommits.current = {};
  }, [nodeId, linkedAsset?.nodeId]);

  const makeDraftKey = (propId: string, isLinkedAsset: boolean) =>
    `${isLinkedAsset ? 'asset' : 'node'}:${propId}`;

  const commitDraftValue = (propId: string, value: string, isLinkedAsset: boolean) => {
    if (isLinkedAsset) {
      handleLinkedAssetPropertyChange(propId, value);
    } else {
      handlePropertyChange(propId, value);
    }
  };

  const scheduleCommit = (key: string, propId: string, value: string, isLinkedAsset: boolean) => {
    if (pendingCommits.current[key]) {
      clearTimeout(pendingCommits.current[key]);
    }
    pendingCommits.current[key] = setTimeout(() => {
      commitDraftValue(propId, value, isLinkedAsset);
      delete pendingCommits.current[key];
    }, 250);
  };

  const openEditor = (
    propId: string, 
    propName: string, 
    value: string | number, 
    isLinkedAsset = false,
    markupProfile?: string
  ) => {
    console.log('[Inspector] Opening editor with:', { propId, propName, markupProfile });
    setEditorState({
      isOpen: true,
      propId,
      propName,
      value: String(value),
      isLinkedAsset,
      markupProfile,
    });
  };

  const closeEditor = () => {
    console.log('[Inspector] Closing editor');
    setEditorState({ isOpen: false, propId: '', propName: '', value: '', isLinkedAsset: false, markupProfile: undefined });
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
      <div className="text-sm font-semibold border-b border-accent-primary pb-2 mb-3 px-3 pt-3 flex-shrink-0">
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
          <div className="text-sm text-fg-muted font-mono bg-bg-dark/60 rounded px-2 py-1 truncate opacity-60" title={nodeId}>
            {nodeId}
          </div>
        </div>

        {/* Properties — grouped by section */}
        {(() => {
          // Ordered group names — properties are rendered within each group
          // that has at least one property.
          const GROUP_ORDER = [
            'Identity',
            'Details',
            'Status',
            'Notes',
            'Dates',
            'Financial',
          ];

          // Bucket properties by group
          const groups: Record<string, NodeProperty[]> = {};
          for (const prop of properties) {
            const g = prop.group ?? 'Details';
            (groups[g] ??= []).push(prop);
          }

          // Build an ordered list of groups that have at least one property
          const orderedGroups = GROUP_ORDER.filter(g => groups[g]?.length);
          // Append any custom ui_group values not in the canonical list
          for (const g of Object.keys(groups)) {
            if (!orderedGroups.includes(g)) orderedGroups.push(g);
          }

          // Helper to render a single property field
          const renderPropertyField = (prop: NodeProperty) => {
            const displayValue = prop.value;
            const draftKey = makeDraftKey(prop.id, false);
            const draftValue = draftValues[draftKey] ?? String(displayValue ?? '');
            return (
              <div key={prop.id}>
                {prop.type === 'text' && (
                  <Input
                    label={prop.name}
                    value={draftValue}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      setDraftValues((prev) => ({ ...prev, [draftKey]: nextValue }));
                      scheduleCommit(draftKey, prop.id, nextValue, false);
                    }}
                    onBlur={(e) => {
                      commitDraftValue(prop.id, e.target.value, false);
                    }}
                    required={prop.required}
                  />
                )}
                {prop.type === 'number' && (
                  <Input
                    label={prop.name}
                    type="number"
                    value={displayValue}
                    onChange={(e) =>
                      handlePropertyChange(prop.id, e.target.valueAsNumber)
                    }
                    required={prop.required}
                  />
                )}
                {prop.type === 'currency' && (
                  <CurrencyInput
                    label={prop.name}
                    value={displayValue}
                    onChange={(e) => handlePropertyChange(prop.id, e.target.value)}
                    required={prop.required}
                  />
                )}
                {prop.type === 'date' && (
                  <Input
                    label={prop.name}
                    type="date"
                    value={displayValue}
                    onChange={(e) => handlePropertyChange(prop.id, e.target.value)}
                    required={prop.required}
                  />
                )}
                {prop.type === 'select' && prop.options && (
                  <Select
                    label={prop.name}
                    value={String(displayValue)}
                    onChange={(e) => handlePropertyChange(prop.id, e.target.value)}
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
                      value={draftValue}
                      onChange={(e) => {
                        const nextValue = e.target.value;
                        setDraftValues((prev) => ({ ...prev, [draftKey]: nextValue }));
                        scheduleCommit(draftKey, prop.id, nextValue, false);
                      }}
                      onBlur={(e) => {
                        commitDraftValue(prop.id, e.target.value, false);
                      }}
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
                      checked={displayValue === 'true' || displayValue === 1 || displayValue === '1'}
                      onChange={(e) =>
                        handlePropertyChange(prop.id, e.target.checked ? 'true' : 'false')
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
                        {String(displayValue).substring(0, 50)}{String(displayValue).length > 50 ? '...' : ''}
                      </div>
                      <button
                        onClick={() => openEditor(prop.id, prop.name, displayValue, false, prop.markupProfile)}
                        className="px-3 py-1 bg-accent-primary text-fg-primary rounded hover:bg-accent-hover transition-colors text-sm font-semibold"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          };

          return orderedGroups.map((groupName, idx) => (
            <div key={groupName}>
              {/* Section separator — skip the first group to avoid a leading line */}
              {idx > 0 && (
                <div className="flex items-center gap-2 mt-4 mb-2">
                  <div className="flex-1 border-t border-border" />
                  <span className="text-xs font-semibold text-fg-secondary uppercase tracking-wider whitespace-nowrap">
                    {groupName}
                  </span>
                  <div className="flex-1 border-t border-border" />
                </div>
              )}
              <div className="space-y-3">
                {groups[groupName].map(renderPropertyField)}
              </div>
            </div>
          ));
        })()}

        {/* Blocking */}
        {(blockedByNodes.length > 0 || blocksNodes.length > 0) && (
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 border-t border-border" />
              <span className="text-xs font-semibold text-fg-secondary uppercase tracking-wider whitespace-nowrap">
                Blocking
              </span>
              <div className="flex-1 border-t border-border" />
            </div>
            {blockedByNodes.length > 0 && (
              <div className="mb-3">
                <div className="text-xs text-fg-secondary mb-1">
                  Blocked By ({blockedByNodes.length})
                </div>
                <div className="space-y-1">
                  {blockedByNodes.map((blockerId) => {
                    const blocker = nodes[blockerId];
                    const blockerName = blocker?.properties?.name || blockerId;
                    return (
                      <div key={blockerId} className="flex items-center justify-between gap-1 text-sm text-fg-primary bg-bg-dark/50 rounded px-2 py-1">
                        <span className="truncate" title={blockerName}>{blockerName}</span>
                        {onClearSingleBlock && nodeId && (
                          <button
                            onClick={() => onClearSingleBlock(nodeId)}
                            className="flex-shrink-0 text-xs text-orange-400 hover:text-orange-300 hover:bg-orange-500/20 rounded px-1 transition-colors"
                            title={`Remove blocker: ${blockerName}`}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {blocksNodes.length > 0 && (
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs text-fg-secondary">
                    Blocks ({blocksNodes.length})
                  </div>
                  {onClearBlocks && nodeId && blocksNodes.length > 1 && (
                    <button
                      onClick={() => onClearBlocks(nodeId)}
                      className="text-xs px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded border border-orange-500/50 hover:bg-orange-500/30 transition-colors"
                    >
                      Clear All
                    </button>
                  )}
                </div>
                <div className="space-y-1">
                  {blocksNodes.map((blockedId) => {
                    const blocked = nodes[blockedId];
                    const blockedName = blocked?.properties?.name || blockedId;
                    return (
                      <div key={blockedId} className="flex items-center justify-between gap-1 text-sm text-fg-primary bg-bg-dark/50 rounded px-2 py-1">
                        <span className="truncate" title={blockedName}>{blockedName}</span>
                        {onClearSingleBlock && (
                          <button
                            onClick={() => onClearSingleBlock(blockedId)}
                            className="flex-shrink-0 text-xs text-orange-400 hover:text-orange-300 hover:bg-orange-500/20 rounded px-1 transition-colors"
                            title={`Unblock: ${blockedName}`}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Velocity Section */}
        {velocityScore && (
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 border-t border-border" />
              <span className="text-xs font-semibold text-fg-secondary uppercase tracking-wider whitespace-nowrap">
                Velocity
              </span>
              <div className="flex-1 border-t border-border" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-fg-secondary">Total Score:</span>
                <span className="text-sm font-semibold text-fg-primary">{velocityScore.totalVelocity}</span>
              </div>
              <div className="text-xs text-fg-secondary border-t border-border/50 pt-2 space-y-1">
                <div className="flex justify-between items-center">
                  <span>Base:</span>
                  <span className="text-fg-primary">{velocityScore.baseScore}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Inherited:</span>
                  <span className="text-fg-primary">{velocityScore.inheritedScore}</span>
                </div>
                {velocityScore.statusScore !== 0 && (
                  <div className="flex justify-between items-center">
                    <span>Status:</span>
                    <span className="text-fg-primary">{velocityScore.statusScore}</span>
                  </div>
                )}
                {velocityScore.numericalScore !== 0 && (
                  <div className="flex justify-between items-center">
                    <span>Numerical:</span>
                    <span className="text-fg-primary">{velocityScore.numericalScore}</span>
                  </div>
                )}
                {velocityScore.blockingBonus !== 0 && (
                  <div className="flex justify-between items-center">
                    <span>Blocking Bonus:</span>
                    <span className="text-fg-primary">{velocityScore.blockingBonus}</span>
                  </div>
                )}
                {velocityScore.blockingPenalty !== 0 && (
                  <div className="flex justify-between items-center">
                    <span>Blocking Penalty:</span>
                    <span className="text-fg-primary">{velocityScore.blockingPenalty}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Orphaned Properties Section */}
        {orphanedProperties && Object.keys(orphanedProperties).length > 0 && (
          <div className="mt-6 pt-6 border-t border-border">
            <div className="text-sm font-semibold border-b border-orange-500/50 pb-2 mb-3 text-orange-400 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Orphaned Properties
            </div>
            <div className="mb-3 text-xs text-orange-300/80 bg-orange-500/10 border border-orange-500/30 rounded px-2 py-2">
              These properties were removed from the template but their values are preserved. They are read-only.
            </div>
            <div className="space-y-3">
              {Object.entries(orphanedProperties).map(([key, value]) => (
                <div key={key} className="relative">
                  <label className="block text-sm text-fg-secondary mb-1">{key}</label>
                  <div className="flex gap-2 items-center">
                    <div className="flex-1 bg-bg-dark/50 text-fg-primary/70 border border-orange-500/30 rounded-sm px-2 py-1 text-sm">
                      {String(value)}
                    </div>
                    {onOrphanedPropertyDelete && (
                      <button
                        onClick={() => onOrphanedPropertyDelete(key)}
                        className="px-3 py-1 bg-status-danger/20 text-status-danger rounded hover:bg-status-danger/30 transition-colors text-sm font-semibold"
                        title="Delete orphaned property"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Linked Asset Metadata Section */}
        {linkedAsset && (
          <div className="mt-6 pt-6 border-t border-border">
            <div className="text-sm font-semibold border-b border-accent-success pb-2 mb-3 text-accent-success">
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
              <div className="text-sm text-fg-muted font-mono bg-bg-dark/60 rounded px-2 py-1 truncate opacity-60" title={linkedAsset.nodeId}>
                {linkedAsset.nodeId}
              </div>
            </div>
            <div className="space-y-3">
              {linkedAsset.properties.map((prop) => {
                const assetDisplayValue = prop.value;
                const assetDraftKey = makeDraftKey(prop.id, true);
                const assetDraftValue = draftValues[assetDraftKey] ?? String(assetDisplayValue ?? '');
                return (
                  <div key={prop.id}>
                    {prop.type === 'text' && (
                      <Input
                        label={prop.name}
                        value={assetDraftValue}
                        onChange={(e) => {
                          const nextValue = e.target.value;
                          setDraftValues((prev) => ({ ...prev, [assetDraftKey]: nextValue }));
                          scheduleCommit(assetDraftKey, prop.id, nextValue, true);
                        }}
                        onBlur={(e) => {
                          commitDraftValue(prop.id, e.target.value, true);
                        }}
                        required={prop.required}
                      />
                    )}
                    {prop.type === 'number' && (
                      <Input
                        label={prop.name}
                        type="number"
                        value={assetDisplayValue}
                        onChange={(e) =>
                          handleLinkedAssetPropertyChange(prop.id, e.target.valueAsNumber)
                        }
                        required={prop.required}
                      />
                    )}
                    {prop.type === 'currency' && (
                      <CurrencyInput
                        label={prop.name}
                        value={assetDisplayValue}
                        onChange={(e) => handleLinkedAssetPropertyChange(prop.id, e.target.value)}
                        required={prop.required}
                      />
                    )}
                    {prop.type === 'date' && (
                      <Input
                        label={prop.name}
                        type="date"
                        value={assetDisplayValue}
                        onChange={(e) => handleLinkedAssetPropertyChange(prop.id, e.target.value)}
                        required={prop.required}
                      />
                    )}
                    {prop.type === 'select' && prop.options && (
                      <Select
                        label={prop.name}
                        value={String(assetDisplayValue)}
                        onChange={(e) => handleLinkedAssetPropertyChange(prop.id, e.target.value)}
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
                          value={assetDraftValue}
                          onChange={(e) => {
                            const nextValue = e.target.value;
                            setDraftValues((prev) => ({ ...prev, [assetDraftKey]: nextValue }));
                            scheduleCommit(assetDraftKey, prop.id, nextValue, true);
                          }}
                          onBlur={(e) => {
                            commitDraftValue(prop.id, e.target.value, true);
                          }}
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
                          checked={assetDisplayValue === 'true' || assetDisplayValue === 1 || assetDisplayValue === '1'}
                          onChange={(e) =>
                            handleLinkedAssetPropertyChange(prop.id, e.target.checked ? 'true' : 'false')
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
                            {String(assetDisplayValue).substring(0, 50)}{String(assetDisplayValue).length > 50 ? '...' : ''}
                          </div>
                          <button
                            onClick={() => openEditor(prop.id, prop.name, assetDisplayValue, true, prop.markupProfile)}
                            className="px-3 py-1 bg-accent-primary text-fg-primary rounded hover:bg-accent-hover transition-colors text-sm font-semibold"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        
        {/* Template-Aware Editor Modal */}
        <TemplateAwareEditor
          isOpen={editorState.isOpen}
          title={editorState.propName}
          value={editorState.value}
          propertyId={editorState.propId}
          nodeId={nodeId || ''}
          onChange={(newValue) => {
            setEditorState({ ...editorState, value: newValue });
          }}
          onClose={closeEditor}
          onSave={saveEditorContent}
          template={undefined}
          markupProfile={editorState.markupProfile}
        />
      </div>
    </aside>
  );
}
