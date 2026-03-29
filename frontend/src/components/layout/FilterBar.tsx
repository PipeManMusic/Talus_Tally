import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2, X, Bookmark, BookmarkCheck, Play } from 'lucide-react';
import { useFilterStore, type FilterOperator } from '../../store/filterStore';
import { extractUniquePropertyKeys } from '../../utils/filterEngine';
import { useGraphStore } from '../../store';
import type { TemplateSchema } from '../../api/client';
import { getSelectOptionsByProperty, getPropertyLabelMap } from '../../utils/propertyValueDisplay';

const OPERATORS: FilterOperator[] = ['equals', 'not_equals', 'contains', 'greater_than', 'less_than'];

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  equals: 'Equals',
  not_equals: 'Not Equals',
  contains: 'Contains',
  greater_than: 'Greater Than',
  less_than: 'Less Than',
};

const BLOCKING_STATUS_VALUES = [
  { value: 'blocked', label: 'Blocked' },
  { value: 'blocking', label: 'Blocking Other Nodes' },
  { value: 'not_blocked', label: 'Not Blocked' },
  { value: 'not_blocking', label: 'Not Blocking' },
];

// Help text for special filter properties
const PROPERTY_HELP: Record<string, string> = {
  velocity_score: 'Filter by velocity score (numeric)',
  blocking_status: 'Filter 4 statuses: blocked, blocking, not_blocked, not_blocking',
  node_type: 'Filter by node blueprint type (task, season, etc.)',
};

const PROPERTY_LABELS: Record<string, string> = {
  velocity_score: '⚡ Velocity Score',
  blocking_status: '🔒 Blocking Status',
  node_type: '🏷 Node Type',
};

export function FilterBar({
  forceExpanded = false,
  templateSchema,
}: {
  forceExpanded?: boolean;
  templateSchema?: TemplateSchema | null;
}) {
  const {
    rules, filterMode, isExpanded, addRule, updateRule, removeRule, clearRules,
    setFilterMode, toggleExpanded, savedFilterSets,
    saveCurrentAsFilterSet, applySavedFilterSet, deleteSavedFilterSet,
  } = useFilterStore();
  const { nodes } = useGraphStore();
  const [saveAsName, setSaveAsName] = useState('');

  // Extract all unique property keys from current nodes, plus special velocity/blocking properties
  const availableProperties = useMemo(() => {
    const nodeList = Object.values(nodes);
    const extracted = extractUniquePropertyKeys(nodeList);
    // Special filterable properties always available
    const special = ['node_type', 'velocity_score', 'blocking_status'];
    // Put special properties first for visibility, then regular properties sorted
    return [...special, ...extracted.sort()];
  }, [nodes]);

  const availableNodeTypes = useMemo(() => {
    const types = new Set<string>();
    Object.values(nodes).forEach((node) => {
      if (node?.type && typeof node.type === 'string') {
        types.add(node.type);
      }
    });
    return Array.from(types).sort();
  }, [nodes]);

  const nodeTypeLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    templateSchema?.node_types?.forEach((nt) => {
      if (nt.id && nt.name) {
        map[nt.id] = nt.name;
      }
    });
    return map;
  }, [templateSchema]);

  const selectOptionsByProperty = useMemo(
    () => getSelectOptionsByProperty(templateSchema),
    [templateSchema],
  );

  const propertyLabelMap = useMemo(
    () => getPropertyLabelMap(templateSchema),
    [templateSchema],
  );

  const hasActiveFilters = rules.length > 0;
  const showExpanded = forceExpanded || isExpanded;

  return (
    <div className={forceExpanded ? '' : 'bg-bg-light border-b border-border'}>
      {/* Collapsed View — only shown when not forced open */}
      {!showExpanded && (
        <div className="px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleExpanded}
              className="p-1 hover:bg-bg-dark rounded transition-colors"
              title="Expand filter bar"
            >
              <ChevronDown size={18} className="text-fg-secondary" />
            </button>
            <span className="text-sm text-fg-secondary">
              {hasActiveFilters ? `Filters: ${rules.length} Active (${filterMode})` : 'No filters active'}
            </span>
          </div>
        </div>
      )}

      {/* Expanded View */}
      {showExpanded && (
        <div className={`space-y-4 ${forceExpanded ? 'p-3' : 'px-4 py-4'}`}>
          {/* Collapse Header — only when not forced open */}
          {!forceExpanded && (
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleExpanded}
                  className="p-1 hover:bg-bg-dark rounded transition-colors"
                  title="Collapse filter bar"
                >
                  <ChevronUp size={18} className="text-fg-secondary" />
                </button>
                <h3 className="text-sm font-semibold text-fg-primary">Query Builder / Filters</h3>
              </div>
            </div>
          )}

          {forceExpanded && (
            <div className="flex items-center justify-end">
              <span className="text-xs text-fg-secondary">{rules.length} rule{rules.length === 1 ? '' : 's'}</span>
            </div>
          )}

          {/* Filter Rules */}
          <div className="space-y-3 bg-bg-dark rounded p-3 border border-border">
            {rules.length === 0 ? (
              <p className="text-sm text-fg-secondary italic">No filters configured</p>
            ) : (
              rules.map((rule, index) => (
                <div
                  key={rule.id}
                  className={
                    forceExpanded
                      ? 'bg-bg-light rounded p-2 border border-border space-y-2'
                      : 'flex items-center gap-2 bg-bg-light rounded p-2 border border-border'
                  }
                >
                  {forceExpanded ? (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] uppercase tracking-wide text-fg-secondary">Rule {index + 1}</span>
                        <button
                          onClick={() => removeRule(rule.id)}
                          className="p-1 hover:bg-red-900/30 text-red-400 rounded transition-colors"
                          title="Delete this filter rule"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <select
                        value={rule.property}
                        onChange={(e) => updateRule(rule.id, { property: e.target.value })}
                        className="w-full px-2 py-1.5 text-sm bg-bg-dark border border-border rounded text-fg-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                      >
                        <option value="">Select property...</option>
                        {availableProperties.map((prop) => (
                          <option key={prop} value={prop}>
                            {PROPERTY_LABELS[prop as keyof typeof PROPERTY_LABELS] || propertyLabelMap[prop] || prop}
                          </option>
                        ))}
                      </select>

                      <select
                        value={rule.operator}
                        onChange={(e) => updateRule(rule.id, { operator: e.target.value as FilterOperator })}
                        className="w-full px-2 py-1.5 text-sm bg-bg-dark border border-border rounded text-fg-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                      >
                        {OPERATORS.map((op) => (
                          <option key={op} value={op}>
                            {OPERATOR_LABELS[op]}
                          </option>
                        ))}
                      </select>

                      {rule.property === 'node_type' ? (
                        <select
                          value={rule.value}
                          onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm bg-bg-dark border border-border rounded text-fg-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                        >
                          <option value="">Select node type...</option>
                          {availableNodeTypes.map((nodeType) => (
                            <option key={nodeType} value={nodeType}>
                              {nodeTypeLabelMap[nodeType] || nodeType}
                            </option>
                          ))}
                        </select>
                      ) : rule.property && selectOptionsByProperty[rule.property]?.length ? (
                        <select
                          value={rule.value}
                          onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm bg-bg-dark border border-border rounded text-fg-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                        >
                          <option value="">Select value...</option>
                          {selectOptionsByProperty[rule.property].map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={rule.value}
                          onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                          placeholder={rule.property === 'blocking_status' ? 'blocked | blocking | not_blocked | not_blocking' : 'Value...'}
                          className="w-full px-2 py-1.5 text-sm bg-bg-dark border border-border rounded text-fg-primary placeholder-fg-tertiary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                        />
                      )}
                    </>
                  ) : (
                    <>
                      {/* Property Select */}
                      <select
                        value={rule.property}
                        onChange={(e) => updateRule(rule.id, { property: e.target.value })}
                        className="flex-1 px-2 py-1 text-sm bg-bg-dark border border-border rounded text-fg-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                      >
                        <option value="">Select property...</option>
                        {availableProperties.map((prop) => (
                          <option key={prop} value={prop}>
                            {PROPERTY_LABELS[prop as keyof typeof PROPERTY_LABELS] || propertyLabelMap[prop] || prop}
                          </option>
                        ))}
                      </select>

                      {/* Operator Select */}
                      <select
                        value={rule.operator}
                        onChange={(e) => updateRule(rule.id, { operator: e.target.value as FilterOperator })}
                        className="px-2 py-1 text-sm bg-bg-dark border border-border rounded text-fg-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                      >
                        {OPERATORS.map((op) => (
                          <option key={op} value={op}>
                            {OPERATOR_LABELS[op]}
                          </option>
                        ))}
                      </select>

                      {/* Value Input */}
                      {rule.property === 'node_type' ? (
                        <select
                          value={rule.value}
                          onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                          className="flex-1 px-2 py-1 text-sm bg-bg-dark border border-border rounded text-fg-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                        >
                          <option value="">Select node type...</option>
                          {availableNodeTypes.map((nodeType) => (
                            <option key={nodeType} value={nodeType}>
                              {nodeTypeLabelMap[nodeType] || nodeType}
                            </option>
                          ))}
                        </select>
                      ) : rule.property && selectOptionsByProperty[rule.property]?.length ? (
                        <select
                          value={rule.value}
                          onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                          className="flex-1 px-2 py-1 text-sm bg-bg-dark border border-border rounded text-fg-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                        >
                          <option value="">Select value...</option>
                          {selectOptionsByProperty[rule.property].map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={rule.value}
                          onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                          placeholder={rule.property === 'blocking_status' ? 'blocked | blocking | not_blocked | not_blocking' : 'Value...'}
                          className="flex-1 px-2 py-1 text-sm bg-bg-dark border border-border rounded text-fg-primary placeholder-fg-tertiary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                        />
                      )}

                      {/* Delete Rule Button */}
                      <button
                        onClick={() => removeRule(rule.id)}
                        className="p-1 hover:bg-red-900/30 text-red-400 rounded transition-colors"
                        title="Delete this filter rule"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Action Buttons */}
          <div className={forceExpanded ? 'space-y-2' : 'flex items-center justify-between gap-3'}>
            <div className={forceExpanded ? 'grid grid-cols-1 gap-2' : 'flex items-center gap-2'}>
              <button
                onClick={() => addRule({ property: '', operator: 'equals', value: '' })}
                className={`px-3 py-1.5 text-sm bg-accent-primary hover:bg-accent-primary/90 text-fg-primary rounded font-medium transition-colors flex items-center gap-2 ${forceExpanded ? 'justify-center w-full' : ''}`}
              >
                <Plus size={16} />
                Add Filter
              </button>

              {hasActiveFilters && (
                <button
                  onClick={clearRules}
                  className={`px-3 py-1.5 text-sm bg-red-900/40 hover:bg-red-900/60 text-red-300 rounded font-medium transition-colors flex items-center gap-2 ${forceExpanded ? 'justify-center w-full' : ''}`}
                >
                  <X size={16} />
                  Clear All
                </button>
              )}
            </div>

            {/* Filter Mode Toggle */}
            <div className={`flex items-center gap-2 px-3 py-1.5 bg-bg-dark border border-border rounded ${forceExpanded ? 'justify-between' : ''}`}>
              <span className="text-xs font-medium text-fg-secondary">Mode:</span>
              <button
                onClick={() => setFilterMode('ghost')}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${forceExpanded ? 'flex-1 text-center' : ''} ${
                  filterMode === 'ghost'
                    ? 'bg-accent-primary text-fg-primary'
                    : 'bg-bg-light text-fg-secondary hover:text-fg-primary'
                }`}
              >
                Ghost
              </button>
              <button
                onClick={() => setFilterMode('hide')}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${forceExpanded ? 'flex-1 text-center' : ''} ${
                  filterMode === 'hide'
                    ? 'bg-accent-primary text-fg-primary'
                    : 'bg-bg-light text-fg-secondary hover:text-fg-primary'
                }`}
              >
                Hide
              </button>
            </div>
          </div>

          {/* Saved Filter Workflows */}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-fg-secondary flex items-center gap-1.5">
                <Bookmark size={12} />
                Saved Workflows
              </h4>
              <span className="text-xs text-fg-tertiary">{savedFilterSets.length} saved</span>
            </div>

            {/* Save current filters as a new workflow */}
            <div className={forceExpanded ? 'flex flex-col gap-1.5' : 'flex items-center gap-2'}>
              <input
                type="text"
                value={saveAsName}
                onChange={(e) => setSaveAsName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && saveAsName.trim()) {
                    saveCurrentAsFilterSet(saveAsName.trim());
                    setSaveAsName('');
                  }
                }}
                placeholder="Workflow name..."
                className={`px-2 py-1.5 text-sm bg-bg-dark border border-border rounded text-fg-primary placeholder-fg-tertiary focus:outline-none focus:ring-1 focus:ring-accent-primary ${forceExpanded ? 'w-full' : 'flex-1'}`}
              />
              <button
                onClick={() => {
                  if (saveAsName.trim()) {
                    saveCurrentAsFilterSet(saveAsName.trim());
                    setSaveAsName('');
                  }
                }}
                disabled={!saveAsName.trim()}
                title="Save current filters as a named workflow"
                className={`px-3 py-1.5 text-sm bg-accent-primary hover:bg-accent-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-fg-primary rounded font-medium transition-colors flex items-center gap-1.5 ${forceExpanded ? 'justify-center w-full' : 'shrink-0'}`}
              >
                <BookmarkCheck size={14} />
                Save
              </button>
            </div>

            {/* List of saved workflows */}
            {savedFilterSets.length > 0 && (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {savedFilterSets.map((fset) => (
                  <div
                    key={fset.id}
                    className="flex items-center gap-2 bg-bg-dark border border-border rounded px-2 py-1.5"
                  >
                    <span className="flex-1 text-sm text-fg-primary truncate" title={fset.name}>
                      {fset.name}
                    </span>
                    <span className="text-xs text-fg-tertiary shrink-0">
                      {fset.rules.length}r / {fset.filterMode}
                    </span>
                    <button
                      onClick={() => applySavedFilterSet(fset.id)}
                      title={`Apply "${fset.name}"`}
                      className="p-1 hover:bg-accent-primary/20 text-accent-primary rounded transition-colors shrink-0"
                    >
                      <Play size={13} />
                    </button>
                    <button
                      onClick={() => deleteSavedFilterSet(fset.id)}
                      title={`Delete "${fset.name}"`}
                      className="p-1 hover:bg-red-900/30 text-red-400 rounded transition-colors shrink-0"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
