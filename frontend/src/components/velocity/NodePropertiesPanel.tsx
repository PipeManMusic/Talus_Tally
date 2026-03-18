import React, { useMemo } from 'react';
import { X, Lock, Trash2 } from 'lucide-react';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import type { Node as NodeType } from '../../api/client';

/** Minimal property definition from the template schema, used for grouping / locking. */
export interface PropertyDefinition {
  id: string;
  label: string;
  type: string;
  options?: Array<{ id?: string; name?: string; label?: string }>;
  system_locked?: boolean;
  ui_group?: string;
  semantic_role?: string;
}

interface NodePropertiesPanelProps {
  selectedNodeId: string | null;
  nodes: Record<string, NodeType>;
  blockedByNodes: string[];  // Node IDs that are blocking the selected node
  blocksNodes: string[];     // Node IDs that the selected node blocks
  onPropertyChange: (nodeId: string, propKey: string, value: string | number | Record<string, any>) => void;
  onClearBlocks: (nodeId: string) => void;  // Clear all blocking relationships from this node
  /** Optional property definitions from the template schema for the selected node's type. */
  propertyDefinitions?: PropertyDefinition[];
  /** Orphaned property key-value pairs (read-only, from metadata). */
  orphanedProperties?: Record<string, string | number>;
  /** All nodes (needed to look up assignee names for Daily Overrides). */
  allNodes?: Record<string, import('../../api/client').Node>;
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
  allNodes,
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

  // --- Daily Overrides helpers ---
  const parseAssignedToIds = (value: any): string[] => {
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    if (typeof value === 'string') {
      const s = value.trim();
      if (!s) return [];
      if (s.startsWith('[')) { try { const p = JSON.parse(s); if (Array.isArray(p)) return p.map(String); } catch {} }
      if (s.includes(',')) return s.split(',').map(s => s.trim()).filter(Boolean);
      return [s];
    }
    return [];
  };

  const generateDateRange = (start: string, end: string): string[] => {
    const dates: string[] = [];
    const startD = new Date(start + 'T00:00:00');
    const endD = new Date(end + 'T00:00:00');
    if (isNaN(startD.getTime()) || isNaN(endD.getTime())) return [];
    const cur = new Date(startD);
    while (cur <= endD) {
      dates.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  };

  const nodeProps = selectNode.properties || {};
  const startDateStr = typeof nodeProps.start_date === 'string' ? nodeProps.start_date : '';
  const endDateStr = typeof nodeProps.end_date === 'string' ? nodeProps.end_date : '';
  const assigneeIds = parseAssignedToIds(nodeProps.assigned_to);

  const showDailyOverrides = !!startDateStr && !!endDateStr && assigneeIds.length > 0;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const dateRange = useMemo(
    () => (showDailyOverrides ? generateDateRange(startDateStr, endDateStr) : []),
    [showDailyOverrides, startDateStr, endDateStr]
  );

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const assigneeNames = useMemo(() => {
    const lookup = allNodes || nodes;
    return assigneeIds.reduce<Record<string, string>>((acc, id) => {
      const person = lookup[id];
      acc[id] = person?.properties?.name || id;
      return acc;
    }, {});
  }, [assigneeIds, allNodes, nodes]);

  const getRawManualAllocations = (): Record<string, Record<string, number>> => {
    const raw = nodeProps.manual_allocations;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, Record<string, number>>;
    if (typeof raw === 'string') { try { return JSON.parse(raw) as Record<string, Record<string, number>>; } catch {} }
    return {};
  };

  const handleManualOverrideChange = (date: string, personId: string, inputValue: string) => {
    const current = getRawManualAllocations();
    const updated: Record<string, Record<string, number>> = JSON.parse(JSON.stringify(current));
    if (inputValue === '' || inputValue === null) {
      if (updated[date]) {
        delete updated[date][personId];
        if (Object.keys(updated[date]).length === 0) delete updated[date];
      }
    } else {
      const num = parseFloat(inputValue);
      if (!isNaN(num)) {
        if (!updated[date]) updated[date] = {};
        updated[date][personId] = num;
      }
    }
    onPropertyChange(selectedNodeId, 'manual_allocations', updated);
  };

  const getSelectOptions = (def?: PropertyDefinition) => {
    if (!def?.options || !Array.isArray(def.options)) {
      return [] as Array<{ value: string; label: string }>;
    }
    return def.options
      .map((option) => {
        const value = String(option.id ?? option.name ?? option.label ?? '').trim();
        const label = String(option.name ?? option.label ?? option.id ?? '').trim();
        if (!value) return null;
        return { value, label: label || value };
      })
      .filter((option): option is { value: string; label: string } => Boolean(option));
  };

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
                const selectOptions = getSelectOptions(def);
                return (
                  <div key={key}>
                    <label className="block text-xs text-fg-secondary mb-1 font-medium flex items-center gap-1">
                      {def?.label || key}
                      {def?.system_locked && <Lock size={10} className="text-fg-muted" />}
                    </label>
                    {selectOptions.length > 0 ? (
                      <Select
                        value={String(value ?? '')}
                        onChange={(e) => onPropertyChange(selectedNodeId, key, e.target.value)}
                        options={selectOptions}
                        className="text-xs"
                      />
                    ) : (
                      <input
                        type="text"
                        value={String(value)}
                        onChange={(e) => onPropertyChange(selectedNodeId, key, e.target.value)}
                        className="w-full bg-bg-dark text-fg-primary border border-border rounded px-2 py-1 text-xs focus:border-accent-primary focus:outline-none"
                      />
                    )}
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
                    const selectOptions = getSelectOptions(def);
                    return (
                      <div key={key}>
                        <label className="block text-xs text-fg-secondary mb-1 font-medium flex items-center gap-1">
                          {def?.label || key}
                          {def?.system_locked && <Lock size={10} className="text-fg-muted" />}
                        </label>
                        {selectOptions.length > 0 ? (
                          <Select
                            value={String(value ?? '')}
                            onChange={(e) => onPropertyChange(selectedNodeId, key, e.target.value)}
                            options={selectOptions}
                            className="text-xs"
                          />
                        ) : (
                          <input
                            type="text"
                            value={String(value)}
                            onChange={(e) => onPropertyChange(selectedNodeId, key, e.target.value)}
                            className="w-full bg-bg-dark text-fg-primary border border-border rounded px-2 py-1 text-xs focus:border-accent-primary focus:outline-none"
                          />
                        )}
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

        {/* Daily Overrides Section */}
        {showDailyOverrides && dateRange.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="text-xs font-semibold text-fg-secondary px-2 py-1 border-b border-border mb-2">
              Daily Overrides
            </div>
            <div className="text-xs text-fg-secondary bg-bg-dark/50 rounded px-2 py-1.5 mb-2">
              Hardcode hours for specific days. Remaining hours distribute automatically.
            </div>
            {assigneeIds.map(personId => (
              <div key={personId} className="mb-3">
                <div className="text-xs font-medium text-fg-primary mb-1 truncate">{assigneeNames[personId]}</div>
                <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(dateRange.length, 4)}, 1fr)` }}>
                  {dateRange.map(date => {
                    const manualAllocations = getRawManualAllocations();
                    const currentValue = manualAllocations[date]?.[personId];
                    const displayValue = currentValue !== undefined ? String(currentValue) : '';
                    return (
                      <div key={date} className="flex flex-col items-center">
                        <div className="text-[10px] text-fg-muted mb-0.5">{date.slice(5)}</div>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={displayValue}
                          placeholder="Auto"
                          onChange={e => handleManualOverrideChange(date, personId, e.target.value)}
                          className="w-full bg-bg-dark text-fg-primary border border-border rounded px-1 py-0.5 text-xs focus:border-accent-primary focus:outline-none text-center placeholder-fg-muted"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
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
