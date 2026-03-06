import React from 'react';
import { X, Lock, Trash2 } from 'lucide-react';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import type { Node as NodeType } from '../../api/client';

/** Minimal property definition from the template schema, used for grouping / locking. */
export interface PropertyDefinition {
  id: string;
  label: string;
  type: string;
  system_locked?: boolean;
  ui_group?: string;
  semantic_role?: string;
}

interface NodePropertiesPanelProps {
  selectedNodeId: string | null;
  nodes: Record<string, NodeType>;
  blockedByNodes: string[];  // Node IDs that are blocking the selected node
  blocksNodes: string[];     // Node IDs that the selected node blocks
  onPropertyChange: (nodeId: string, propKey: string, value: string | number) => void;
  onClearBlocks: (nodeId: string) => void;  // Clear all blocking relationships from this node
  /** Optional property definitions from the template schema for the selected node's type. */
  propertyDefinitions?: PropertyDefinition[];
  /** Orphaned property key-value pairs (read-only, from metadata). */
  orphanedProperties?: Record<string, string | number>;
  /** Called when the user clicks the trash icon on an orphaned property. */
  onOrphanedPropertyDelete?: (propKey: string) => void;
}

export function NodePropertiesPanel({
  selectedNodeId,
  nodes,
  blockedByNodes,
  blocksNodes,
  onPropertyChange,
  onClearBlocks,
  propertyDefinitions,
  orphanedProperties,
  onOrphanedPropertyDelete,
}: NodePropertiesPanelProps) {
  if (!selectedNodeId || !nodes[selectedNodeId]) {
    return (
      <div className="w-80 border-l border-border bg-bg-light p-4 flex items-center justify-center">
        <div className="text-sm text-fg-secondary text-center">
          Select a node to view properties
        </div>
      </div>
    );
  }

  const selectNode = nodes[selectedNodeId];
  const nodeLabel = selectNode.properties?.name || selectedNodeId;

  return (
    <div className="w-80 border-l border-border bg-bg-light flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-border px-4 py-3 flex-shrink-0 bg-accent-primary/10">
        <div className="text-sm font-semibold text-fg-primary truncate" title={nodeLabel}>
          {nodeLabel}
        </div>
        <div className="text-xs text-fg-secondary font-mono truncate mt-1" title={selectedNodeId}>
          {selectedNodeId}
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Blocked By Section */}
        {blockedByNodes.length > 0 && (
          <div className="bg-status-danger/10 border border-status-danger/30 rounded p-3">
            <div className="text-xs font-semibold text-status-danger mb-2 flex items-center gap-1">
              🔒 Blocked By ({blockedByNodes.length})
            </div>
            <div className="space-y-1">
              {blockedByNodes.map(blockerId => {
                const blocker = nodes[blockerId];
                const blockerLabel = blocker?.properties?.name || blockerId;
                return (
                  <div
                    key={blockerId}
                    className="text-xs text-fg-primary bg-status-danger/5 rounded px-2 py-1 truncate hover:bg-status-danger/10 transition-colors"
                    title={blockerLabel}
                  >
                    {blockerLabel}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Blocks Section */}
        {blocksNodes.length > 0 && (
          <div className="bg-accent-warning/10 border border-accent-warning/30 rounded p-3">
            <div className="text-xs font-semibold text-accent-warning mb-2 flex items-center justify-between">
              <span>⚡ Blocks ({blocksNodes.length})</span>
              <button
                onClick={() => onClearBlocks(selectedNodeId)}
                className="px-2 py-0.5 bg-accent-warning/20 hover:bg-accent-warning/30 text-accent-warning rounded text-xs transition-colors"
                title="Clear all blocking relationships from this node"
              >
                Clear
              </button>
            </div>
            <div className="space-y-1">
              {blocksNodes.map(blockedId => {
                const blocked = nodes[blockedId];
                const blockedLabel = blocked?.properties?.name || blockedId;
                return (
                  <div
                    key={blockedId}
                    className="text-xs text-fg-primary bg-accent-warning/5 rounded px-2 py-1 truncate hover:bg-accent-warning/10 transition-colors"
                    title={blockedLabel}
                  >
                    {blockedLabel}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Properties Section */}
        {selectNode.properties && Object.keys(selectNode.properties).length > 0 && (() => {
          const propEntries = Object.entries(selectNode.properties);
          // Build a quick lookup from property definitions
          const defByKey: Record<string, PropertyDefinition> = {};
          (propertyDefinitions || []).forEach(d => { defByKey[d.id] = d; });

          // Split into ungrouped (custom) and grouped (ui_group)
          const ungrouped: [string, any][] = [];
          const grouped: Record<string, [string, any][]> = {};

          propEntries.forEach(([key, value]) => {
            const def = defByKey[key];
            if (def?.ui_group) {
              if (!grouped[def.ui_group]) grouped[def.ui_group] = [];
              grouped[def.ui_group].push([key, value]);
            } else {
              ungrouped.push([key, value]);
            }
          });

          const groupNames = Object.keys(grouped).sort();

          return (
            <div className="space-y-3">
              <div className="text-xs font-semibold text-fg-secondary px-2 py-1 border-b border-border">
                Properties
              </div>

              {/* Ungrouped (custom) properties first */}
              {ungrouped.map(([key, value]) => {
                const def = defByKey[key];
                return (
                  <div key={key}>
                    <label className="block text-xs text-fg-secondary mb-1 font-medium flex items-center gap-1">
                      {def?.label || key}
                      {def?.system_locked && <Lock size={10} className="text-fg-muted" />}
                    </label>
                    <input
                      type="text"
                      value={String(value)}
                      onChange={(e) => onPropertyChange(selectedNodeId, key, e.target.value)}
                      className="w-full bg-bg-dark text-fg-primary border border-border rounded px-2 py-1 text-xs focus:border-accent-primary focus:outline-none"
                    />
                  </div>
                );
              })}

              {/* Grouped properties by ui_group */}
              {groupNames.map(group => (
                <React.Fragment key={group}>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 border-t border-border" />
                    <span className="text-xs font-semibold text-fg-secondary whitespace-nowrap">{group}</span>
                    <div className="flex-1 border-t border-border" />
                  </div>
                  {grouped[group].map(([key, value]) => {
                    const def = defByKey[key];
                    return (
                      <div key={key}>
                        <label className="block text-xs text-fg-secondary mb-1 font-medium flex items-center gap-1">
                          {def?.label || key}
                          {def?.system_locked && <Lock size={10} className="text-fg-muted" />}
                        </label>
                        <input
                          type="text"
                          value={String(value)}
                          onChange={(e) => onPropertyChange(selectedNodeId, key, e.target.value)}
                          className="w-full bg-bg-dark text-fg-primary border border-border rounded px-2 py-1 text-xs focus:border-accent-primary focus:outline-none"
                        />
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          );
        })()}

        {!selectNode.properties || Object.keys(selectNode.properties).length === 0 && 
          blockedByNodes.length === 0 && 
          blocksNodes.length === 0 && (
          <div className="text-xs text-fg-secondary text-center py-8">
            No properties or blocking info
          </div>
        )}

        {/* Orphaned Properties Section */}
        {orphanedProperties && Object.keys(orphanedProperties).length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="text-xs font-semibold border-b border-orange-500/50 pb-2 mb-3 text-orange-400 flex items-center gap-2">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Orphaned Properties
            </div>
            <div className="mb-2 text-xs text-orange-300/80 bg-orange-500/10 border border-orange-500/30 rounded px-2 py-1.5">
              Removed from template. Read-only.
            </div>
            <div className="space-y-2">
              {Object.entries(orphanedProperties).map(([key, value]) => (
                <div key={key}>
                  <label className="block text-xs text-fg-secondary mb-1 font-medium">{key}</label>
                  <div className="flex gap-1 items-center">
                    <div className="flex-1 bg-bg-dark/50 text-fg-primary/70 border border-orange-500/30 rounded px-2 py-1 text-xs truncate">
                      {String(value)}
                    </div>
                    {onOrphanedPropertyDelete && (
                      <button
                        onClick={() => onOrphanedPropertyDelete(key)}
                        className="p-1 text-status-danger/70 hover:text-status-danger hover:bg-status-danger/10 rounded transition-colors"
                        title="Delete orphaned property"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
