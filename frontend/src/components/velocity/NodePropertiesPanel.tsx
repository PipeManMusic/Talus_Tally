import React from 'react';
import { X } from 'lucide-react';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import type { Node as NodeType } from '../../api/client';

interface NodePropertiesPanelProps {
  selectedNodeId: string | null;
  nodes: Record<string, NodeType>;
  blockedByNodes: string[];  // Node IDs that are blocking the selected node
  blocksNodes: string[];     // Node IDs that the selected node blocks
  onPropertyChange: (nodeId: string, propKey: string, value: string | number) => void;
  onClearBlocks: (nodeId: string) => void;  // Clear all blocking relationships from this node
}

export function NodePropertiesPanel({
  selectedNodeId,
  nodes,
  blockedByNodes,
  blocksNodes,
  onPropertyChange,
  onClearBlocks,
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
        {selectNode.properties && Object.keys(selectNode.properties).length > 0 && (
          <div className="space-y-3">
            <div className="text-xs font-semibold text-fg-secondary px-2 py-1 border-b border-border">
              Properties
            </div>
            {Object.entries(selectNode.properties).map(([key, value]) => (
              <div key={key}>
                <label className="block text-xs text-fg-secondary mb-1 font-medium">
                  {key}
                </label>
                <input
                  type="text"
                  value={String(value)}
                  onChange={(e) => onPropertyChange(selectedNodeId, key, e.target.value)}
                  className="w-full bg-bg-dark text-fg-primary border border-border rounded px-2 py-1 text-xs focus:border-accent-primary focus:outline-none"
                />
              </div>
            ))}
          </div>
        )}

        {!selectNode.properties || Object.keys(selectNode.properties).length === 0 && 
          blockedByNodes.length === 0 && 
          blocksNodes.length === 0 && (
          <div className="text-xs text-fg-secondary text-center py-8">
            No properties or blocking info
          </div>
        )}
      </div>
    </div>
  );
}
