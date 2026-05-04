import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2, X, Bookmark, BookmarkCheck, Play } from 'lucide-react';
import { useFilterStore, type FilterOperator } from '../../store/filterStore';
import { extractUniquePropertyKeys } from '../../utils/filterEngine';
import { useGraphStore } from '../../store';
import type { TemplateSchema } from '../../api/client';
import {
  getSelectOptionsByProperty,
  getPropertyLabelMap,
  getPropertyGroups,
  type PropertyGroup,
} from '../../utils/propertyValueDisplay';

const OPERATORS: FilterOperator[] = [
  'equals',
  'not_equals',
  'contains',
  'greater_than',
  'less_than',
  'before',
  'after',
  'on_or_before',
  'on_or_after',
];

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  equals: 'Equals',
  not_equals: 'Not Equals',
  contains: 'Contains',
  greater_than: 'Greater Than',
  less_than: 'Less Than',
  before: 'Before (date)',
  after: 'After (date)',
  on_or_before: 'On or Before (date)',
  on_or_after: 'On or After (date)',
};

const DATE_OPERATORS: ReadonlySet<FilterOperator> = new Set([
  'before',
  'after',
  'on_or_before',
  'on_or_after',
]);

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

  // Property groups built from the template schema. One entry per unique
  // (label, type) pair — collapses the per-node-type UUID duplication that
  // otherwise renders e.g. "Status" 8 times in the property dropdown.
  const propertyGroups = useMemo<PropertyGroup[]>(
    () => getPropertyGroups(templateSchema),
    [templateSchema],
  );

  // Reverse index: every UUID known to any group → that group's token.
  // Used to map legacy single-UUID rule.property values onto a group entry
  // so existing saved filter sets keep displaying the right label.
  const uuidToGroupToken = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    propertyGroups.forEach((group) => {
      group.uuids.forEach((uuid) => {
        if (!map[uuid]) {
          map[uuid] = group.token;
        }
      });
    });
    return map;
  }, [propertyGroups]);

  /**
   * Resolves the dropdown's *displayed* value for a stored rule.property.
   * Handles three shapes:
   *   - special properties (`node_type` / `velocity_score` / `blocking_status`)
   *   - already-grouped tokens (pipe-joined UUIDs that match a known group)
   *   - legacy single UUIDs that belong to a group
   * Falls back to the raw property string for anything unrecognized so the
   * value still round-trips even if the schema changed.
   */
  const resolveDropdownValue = (storedProperty: string): string => {
    if (!storedProperty) return '';
    if (
      storedProperty === 'node_type' ||
      storedProperty === 'velocity_score' ||
      storedProperty === 'blocking_status'
    ) {
      return storedProperty;
    }
    // Direct group-token match
    if (storedProperty.includes('|')) {
      const exact = propertyGroups.find((g) => g.token === storedProperty);
      if (exact) return exact.token;
    }
    // Legacy single UUID → look up its group
    const groupToken = uuidToGroupToken[storedProperty];
    if (groupToken) return groupToken;
    return storedProperty;
  };

  // Property keys actually present on at least one node — used to keep
  // entries that aren't in the schema (orphaned properties) reachable.
  const orphanPropertyKeys = useMemo(() => {
    const nodeList = Object.values(nodes);
    const extracted = extractUniquePropertyKeys(nodeList);
    const knownUuids = new Set(Object.keys(uuidToGroupToken));
    return extracted.filter((key) => !knownUuids.has(key));
  }, [nodes, uuidToGroupToken]);

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

  // Map group token → schema-declared type. For grouped properties the type
  // is taken from the group itself; for legacy/orphan keys we fall back to
  // searching by id/uuid in the raw schema so date inputs still appear.
  const groupByToken = useMemo<Record<string, PropertyGroup>>(() => {
    const map: Record<string, PropertyGroup> = {};
    propertyGroups.forEach((g) => {
      map[g.token] = g;
    });
    return map;
  }, [propertyGroups]);

  const isDateRule = (rule: { property: string; operator: FilterOperator }): boolean => {
    if (DATE_OPERATORS.has(rule.operator)) return true;
    const dropdownValue = resolveDropdownValue(rule.property);
    return groupByToken[dropdownValue]?.type === 'date';
  };

  /**
   * Merge select options across every UUID in a group so a unified
   * dropdown surfaces the union of choices. For non-grouped (single
   * UUID / id-slug) properties this falls back to the existing per-key map.
   */
  const getSelectOptionsForRule = (storedProperty: string) => {
    const dropdownValue = resolveDropdownValue(storedProperty);
    const group = groupByToken[dropdownValue];
    if (!group) {
      return selectOptionsByProperty[storedProperty] ?? selectOptionsByProperty[dropdownValue];
    }
    const seen = new Map<string, { value: string; label: string }>();
    group.uuids.forEach((uuid) => {
      const opts = selectOptionsByProperty[uuid];
      if (!opts) return;
      opts.forEach((opt) => {
        if (!seen.has(opt.value)) {
          seen.set(opt.value, opt);
        }
      });
    });
    if (seen.size === 0) return undefined;
    return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label));
  };

  /**
   * The list of <option> elements rendered inside the property <select>.
   * Built from: special filterable properties, then one entry per
   * (label, type) group derived from the template schema, then any
   * orphan property keys present on nodes but absent from the schema.
   */
  const renderPropertyOptions = (currentDropdownValue: string) => {
    const specials: Array<{ value: string; label: string }> = [
      { value: 'node_type', label: PROPERTY_LABELS.node_type },
      { value: 'velocity_score', label: PROPERTY_LABELS.velocity_score },
      { value: 'blocking_status', label: PROPERTY_LABELS.blocking_status },
    ];

    const orphanOptions = orphanPropertyKeys.map((key) => ({
      value: key,
      label: propertyLabelMap[key] || key,
    }));

    // If the rule's stored value isn't in any of the buckets above, surface
    // it as a "(legacy)" option so the user can still see and edit the rule.
    const allKnownValues = new Set<string>([
      ...specials.map((s) => s.value),
      ...propertyGroups.map((g) => g.token),
      ...orphanOptions.map((o) => o.value),
      '',
    ]);
    const legacyOption =
      currentDropdownValue && !allKnownValues.has(currentDropdownValue)
        ? [{ value: currentDropdownValue, label: `${propertyLabelMap[currentDropdownValue] || currentDropdownValue} (legacy)` }]
        : [];

    return (
      <>
        <option value="">Select property...</option>
        {specials.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
        {propertyGroups.length > 0 && <option disabled>──────────</option>}
        {propertyGroups.map((group) => (
          <option key={group.token} value={group.token}>
            {group.label}
            {group.uuids.length > 1 ? ` (${group.uuids.length})` : ''}
          </option>
        ))}
        {orphanOptions.length > 0 && <option disabled>── orphans ──</option>}
        {orphanOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
        {legacyOption.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </>
    );
  };

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
                        value={resolveDropdownValue(rule.property)}
                        onChange={(e) => updateRule(rule.id, { property: e.target.value })}
                        className="w-full px-2 py-1.5 text-sm bg-bg-dark border border-border rounded text-fg-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                      >
                        {renderPropertyOptions(resolveDropdownValue(rule.property))}
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
                      ) : isDateRule(rule) ? (
                        <input
                          type="date"
                          value={typeof rule.value === 'string' ? rule.value : ''}
                          onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm bg-bg-dark border border-border rounded text-fg-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                        />
                      ) : rule.property && getSelectOptionsForRule(rule.property)?.length ? (
                        <select
                          value={rule.value}
                          onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm bg-bg-dark border border-border rounded text-fg-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                        >
                          <option value="">Select value...</option>
                          {getSelectOptionsForRule(rule.property)!.map((option) => (
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
                        value={resolveDropdownValue(rule.property)}
                        onChange={(e) => updateRule(rule.id, { property: e.target.value })}
                        className="flex-1 px-2 py-1 text-sm bg-bg-dark border border-border rounded text-fg-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                      >
                        {renderPropertyOptions(resolveDropdownValue(rule.property))}
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
                      ) : isDateRule(rule) ? (
                        <input
                          type="date"
                          value={typeof rule.value === 'string' ? rule.value : ''}
                          onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                          className="flex-1 px-2 py-1 text-sm bg-bg-dark border border-border rounded text-fg-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                        />
                      ) : rule.property && getSelectOptionsForRule(rule.property)?.length ? (
                        <select
                          value={rule.value}
                          onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                          className="flex-1 px-2 py-1 text-sm bg-bg-dark border border-border rounded text-fg-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                        >
                          <option value="">Select value...</option>
                          {getSelectOptionsForRule(rule.property)!.map((option) => (
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
