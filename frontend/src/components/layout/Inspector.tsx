import { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { CurrencyInput } from '../ui/CurrencyInput';
import { TemplateAwareEditor } from '../ui/TemplateAwareEditor';
import type { MarkupToken } from '../../services/markupRenderService';

const WEEKDAY_LABELS = [
  { key: 'monday', short: 'Mon', full: 'Monday' },
  { key: 'tuesday', short: 'Tue', full: 'Tuesday' },
  { key: 'wednesday', short: 'Wed', full: 'Wednesday' },
  { key: 'thursday', short: 'Thu', full: 'Thursday' },
  { key: 'friday', short: 'Fri', full: 'Friday' },
  { key: 'saturday', short: 'Sat', full: 'Saturday' },
  { key: 'sunday', short: 'Sun', full: 'Sunday' },
] as const;

const PERSON_CAPACITY_PROPERTY_IDS = new Set(
  WEEKDAY_LABELS.map((day) => `capacity_${day.key}`),
);

const PERSON_HOURLY_RATE_PROPERTY_IDS = new Set(
  WEEKDAY_LABELS.map((day) => `hourly_rate_${day.key}`),
);

const PERSON_OVERTIME_CAPACITY_PROPERTY_IDS = new Set(
  WEEKDAY_LABELS.map((day) => `overtime_capacity_${day.key}`),
);

const PERSON_SPECIAL_PROPERTY_IDS = new Set([
  ...PERSON_CAPACITY_PROPERTY_IDS,
  ...PERSON_HOURLY_RATE_PROPERTY_IDS,
  ...PERSON_OVERTIME_CAPACITY_PROPERTY_IDS,
  'overtime_capacity',
]);

export interface NodeProperty {
  id: string;
  name: string;
  type: 'text' | 'number' | 'select' | 'textarea' | 'currency' | 'date' | 'checkbox' | 'editor';
  value: string | number | boolean | string[] | null | undefined;
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
  isReadOnly?: boolean;
  readOnlyReason?: string;
  onPropertyChange?: (propId: string, value: string | number | string[]) => void;
  linkedAsset?: LinkedAssetMetadata;
  onLinkedAssetPropertyChange?: (propId: string, value: string | number | string[]) => void;
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
  isReadOnly = false,
  readOnlyReason,
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
  const [personScheduleOpen, setPersonScheduleOpen] = useState(false);
  const [personScheduleDraft, setPersonScheduleDraft] = useState<Record<string, string>>({});
  const [pendingAssigneeByProp, setPendingAssigneeByProp] = useState<Record<string, string>>({});

  const handlePropertyChange = (propId: string, value: string | number | string[]) => {
    onPropertyChange?.(propId, value);
  };

  const handleLinkedAssetPropertyChange = (propId: string, value: string | number | string[]) => {
    onLinkedAssetPropertyChange?.(propId, value);
  };

  const parseAssignedToValue = (rawValue: unknown): string[] => {
    if (Array.isArray(rawValue)) {
      return rawValue
        .map((entry) => String(entry ?? '').trim())
        .filter((entry) => entry.length > 0);
    }

    if (typeof rawValue === 'string') {
      const trimmed = rawValue.trim();
      if (!trimmed) return [];

      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            return parsed
              .map((entry) => String(entry ?? '').trim())
              .filter((entry) => entry.length > 0);
          }
        } catch {
          // fall through to csv parsing
        }
      }

      if (trimmed.includes(',')) {
        return trimmed
          .split(',')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0);
      }

      return [trimmed];
    }

    if (rawValue === null || rawValue === undefined) {
      return [];
    }

    const asString = String(rawValue).trim();
    return asString ? [asString] : [];
  };

  const assignablePeople = useMemo(() => {
    return Object.values(nodes)
      .filter((node: any) => node?.type === 'person')
      .map((node: any) => {
        const id = String(node.id);
        const name = String(node?.properties?.name ?? node?.name ?? '').trim();
        const email = String(node?.properties?.email ?? '').trim();
        const label = name || email || id;
        return { value: id, label };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [nodes]);

  const assigneeLabelById = useMemo(() => {
    const map = new Map<string, string>();
    assignablePeople.forEach((person) => {
      map.set(person.value, person.label);
    });
    return map;
  }, [assignablePeople]);

  const parseManualAllocationsValue = (rawValue: unknown): Record<string, Record<string, number>> => {
    let source: unknown = rawValue;
    if (typeof source === 'string') {
      const trimmed = source.trim();
      if (!trimmed) return {};
      try {
        source = JSON.parse(trimmed);
      } catch {
        return {};
      }
    }

    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      return {};
    }

    const parsed: Record<string, Record<string, number>> = {};
    Object.entries(source as Record<string, unknown>).forEach(([dateKey, dayAllocations]) => {
      if (!dayAllocations || typeof dayAllocations !== 'object' || Array.isArray(dayAllocations)) {
        return;
      }
      const dayMap: Record<string, number> = {};
      Object.entries(dayAllocations as Record<string, unknown>).forEach(([personId, hoursRaw]) => {
        const hours = Number(hoursRaw);
        if (Number.isFinite(hours)) {
          dayMap[personId] = hours;
        }
      });
      if (Object.keys(dayMap).length > 0) {
        parsed[dateKey] = dayMap;
      }
    });
    return parsed;
  };

  useEffect(() => {
    setDraftValues({});
    Object.values(pendingCommits.current).forEach(clearTimeout);
    pendingCommits.current = {};
  }, [nodeId, linkedAsset?.nodeId]);

  const makeDraftKey = (propId: string, isLinkedAsset: boolean) =>
    `${isLinkedAsset ? (linkedAsset?.nodeId ?? 'asset') : (nodeId ?? 'node')}:${isLinkedAsset ? 'asset' : 'node'}:${propId}`;

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

  const flushCommit = (key: string, propId: string, value: string, isLinkedAsset: boolean) => {
    if (pendingCommits.current[key]) {
      clearTimeout(pendingCommits.current[key]);
      delete pendingCommits.current[key];
    }
    commitDraftValue(propId, value, isLinkedAsset);
  };

  const openEditor = (
    propId: string, 
    propName: string, 
    value: string | number | boolean | string[] | null | undefined, 
    isLinkedAsset = false,
    markupProfile?: string
  ) => {
    console.log('[Inspector] Opening editor with:', { propId, propName, markupProfile });
    setEditorState({
      isOpen: true,
      propId,
      propName,
      value: value == null ? '' : String(value),
      isLinkedAsset,
      markupProfile,
    });
  };

  const isPersonNode = nodeType === 'person';
  const personPropertyMap = new Map(properties.map((property) => [property.id, property]));

  const getPersonPropertyNumericValue = (propertyId: string, fallback: number) => {
    const raw = personPropertyMap.get(propertyId)?.value;
    if (raw === '' || raw === null || raw === undefined) {
      return fallback;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const openPersonScheduleEditor = () => {
    const nextDraft: Record<string, string> = {};
    const legacyOvertimeRaw = personPropertyMap.get('overtime_capacity')?.value;
    const legacyOvertime = legacyOvertimeRaw === '' || legacyOvertimeRaw === null || legacyOvertimeRaw === undefined
      ? 0
      : getPersonPropertyNumericValue('overtime_capacity', 0);
    WEEKDAY_LABELS.forEach((day) => {
      const capacityId = `capacity_${day.key}`;
      const rateId = `hourly_rate_${day.key}`;
      const overtimeId = `overtime_capacity_${day.key}`;
      nextDraft[capacityId] = String(getPersonPropertyNumericValue(capacityId, day.key === 'saturday' || day.key === 'sunday' ? 0 : 8));
      const rateRaw = personPropertyMap.get(rateId)?.value;
      nextDraft[rateId] = rateRaw === null || rateRaw === undefined ? '' : String(rateRaw);
      nextDraft[overtimeId] = String(getPersonPropertyNumericValue(overtimeId, legacyOvertime));
    });
    const otRaw = personPropertyMap.get('overtime_capacity')?.value;
    nextDraft['overtime_capacity'] = otRaw === null || otRaw === undefined ? '0' : String(otRaw);
    setPersonScheduleDraft(nextDraft);
    setPersonScheduleOpen(true);
  };

  const savePersonScheduleEditor = () => {
    WEEKDAY_LABELS.forEach((day) => {
      const capacityId = `capacity_${day.key}`;
      const rateId = `hourly_rate_${day.key}`;
      const overtimeId = `overtime_capacity_${day.key}`;

      const rawCapacity = Number(personScheduleDraft[capacityId] ?? 0);
      const safeCapacity = Number.isFinite(rawCapacity)
        ? Math.max(0, Math.min(24, rawCapacity))
        : 0;
      handlePropertyChange(capacityId, safeCapacity);

      const rawRateText = (personScheduleDraft[rateId] ?? '').trim();
      if (!rawRateText) {
        handlePropertyChange(rateId, '');
      } else {
        const parsedRate = Number(rawRateText);
        handlePropertyChange(rateId, Number.isFinite(parsedRate) ? parsedRate : '');
      }

      const rawOvertime = Number(personScheduleDraft[overtimeId] ?? 0);
      const safeOvertime = Number.isFinite(rawOvertime)
        ? Math.max(0, Math.min(24, rawOvertime))
        : 0;
      handlePropertyChange(overtimeId, safeOvertime);
    });

    const overtimeTotal = WEEKDAY_LABELS.reduce((sum, day) => {
      const overtimeId = `overtime_capacity_${day.key}`;
      const parsed = Number(personScheduleDraft[overtimeId] ?? 0);
      return sum + (Number.isFinite(parsed) ? Math.max(0, Math.min(24, parsed)) : 0);
    }, 0);
    handlePropertyChange('overtime_capacity', overtimeTotal / WEEKDAY_LABELS.length);

    setPersonScheduleOpen(false);
  };

  const copyMondayCapacityToWeekdays = () => {
    const mondayCapacity = personScheduleDraft['capacity_monday'] ?? '';
    setPersonScheduleDraft((prev) => ({
      ...prev,
      capacity_tuesday: mondayCapacity,
      capacity_wednesday: mondayCapacity,
      capacity_thursday: mondayCapacity,
      capacity_friday: mondayCapacity,
    }));
  };

  const copyMondayOvertimeToWeekdays = () => {
    const mondayOvertime = personScheduleDraft['overtime_capacity_monday'] ?? '';
    setPersonScheduleDraft((prev) => ({
      ...prev,
      overtime_capacity_tuesday: mondayOvertime,
      overtime_capacity_wednesday: mondayOvertime,
      overtime_capacity_thursday: mondayOvertime,
      overtime_capacity_friday: mondayOvertime,
    }));
  };

  const copyFridayRateToWeekend = () => {
    const fridayRate = personScheduleDraft['hourly_rate_friday'] ?? '';
    setPersonScheduleDraft((prev) => ({
      ...prev,
      hourly_rate_saturday: fridayRate,
      hourly_rate_sunday: fridayRate,
    }));
  };

  const copyMondayRateToWeekdays = () => {
    const mondayRate = personScheduleDraft['hourly_rate_monday'] ?? '';
    setPersonScheduleDraft((prev) => ({
      ...prev,
      hourly_rate_tuesday: mondayRate,
      hourly_rate_wednesday: mondayRate,
      hourly_rate_thursday: mondayRate,
      hourly_rate_friday: mondayRate,
    }));
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
      <div
        className={`flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3 ${
          isReadOnly
            ? '[&_input:disabled]:text-fg-primary [&_input:disabled]:bg-bg-dark/80 [&_input:disabled]:border-border [&_textarea:disabled]:text-fg-primary [&_textarea:disabled]:bg-bg-dark/80 [&_textarea:disabled]:border-border [&_select:disabled]:text-fg-primary [&_select:disabled]:bg-bg-dark/80 [&_select:disabled]:border-border'
            : ''
        }`}
      >
        {isReadOnly && (
          <div className="mb-4 rounded border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-xs text-orange-300">
            <div className="font-semibold text-orange-200">Orphaned Node (Read-only)</div>
            <div>This node is outside the current template schema and cannot be edited until the template is fixed or orphaned data is removed.</div>
            {readOnlyReason && <div className="mt-1 opacity-90">Reason: {readOnlyReason}</div>}
          </div>
        )}

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

        {/* Person Weekly Schedule Summary */}
        {isPersonNode && (
          <div className="mb-4 rounded border border-border bg-bg-dark/30 p-3">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div>
                <div className="text-sm font-semibold text-fg-primary">Weekly Availability</div>
                <div className="text-xs text-fg-secondary">Capacity is limited to 0–24 hours per day</div>
              </div>
              <button
                onClick={openPersonScheduleEditor}
                className="px-3 py-1.5 bg-accent-primary text-fg-primary rounded hover:bg-accent-hover transition-colors text-xs font-semibold"
                disabled={isReadOnly}
              >
                Edit Week
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {WEEKDAY_LABELS.map((day) => {
                const capacityId = `capacity_${day.key}`;
                const rateId = `hourly_rate_${day.key}`;
                const capacity = getPersonPropertyNumericValue(
                  capacityId,
                  day.key === 'saturday' || day.key === 'sunday' ? 0 : 8,
                );
                const rate = personPropertyMap.get(rateId)?.value;
                return (
                  <div key={day.key} className="bg-bg-light rounded border border-border px-1 py-2">
                    <div className="text-fg-secondary font-semibold">{day.short}</div>
                    <div className="text-fg-primary font-mono">{capacity}h</div>
                    <div className="text-fg-muted">{rate !== '' && rate !== null && rate !== undefined ? `$${rate}` : '—'}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
          const sourceProperties = isPersonNode
            ? properties.filter((property) => !PERSON_SPECIAL_PROPERTY_IDS.has(property.id))
            : properties;

          const groups: Record<string, NodeProperty[]> = {};
          for (const prop of sourceProperties) {
            const g = prop.group ?? 'Details';
            (groups[g] ??= []).push(prop);
          }

          // Build an ordered list of groups that have at least one property
          const orderedGroups = GROUP_ORDER.filter(g => groups[g]?.length);
          // Append any custom ui_group values not in the canonical list
          for (const g of Object.keys(groups)) {
            if (!orderedGroups.includes(g)) orderedGroups.push(g);
          }

          if (orderedGroups.length === 0) {
            return null;
          }

          // Helper to render a single property field
          const renderPropertyField = (prop: NodeProperty) => {
            const displayValue = prop.value;
            const draftKey = makeDraftKey(prop.id, false);
            const draftValue = draftValues[draftKey] ?? String(displayValue ?? '');
            const isAssigneeField = prop.id === 'assigned_to';
            const isManualAllocationsField = prop.id === 'manual_allocations';
            const assignedIds = isAssigneeField ? parseAssignedToValue(displayValue) : [];
            const pendingAssignee = pendingAssigneeByProp[prop.id] ?? '';
            const manualAllocations = isManualAllocationsField ? parseManualAllocationsValue(displayValue) : {};
            const manualDates = isManualAllocationsField
              ? Object.keys(manualAllocations).sort((a, b) => a.localeCompare(b))
              : [];
            return (
              <div key={prop.id}>
                {isAssigneeField && (
                  <div>
                    <label className="block text-sm text-fg-secondary mb-1">
                      {prop.name}
                    </label>
                    <div className="flex gap-2 mb-2">
                      <select
                        value={pendingAssignee}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setPendingAssigneeByProp((prev) => ({ ...prev, [prop.id]: nextValue }));
                        }}
                        className="flex-1 bg-bg-dark text-fg-primary border border-border rounded-sm px-2 py-1 text-sm"
                        disabled={isReadOnly}
                      >
                        <option value="">Select person…</option>
                        {assignablePeople
                          .filter((person) => !assignedIds.includes(person.value))
                          .map((person) => (
                            <option key={person.value} value={person.value}>
                              {person.label}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          if (!pendingAssignee) return;
                          if (assignedIds.includes(pendingAssignee)) return;
                          handlePropertyChange(prop.id, [...assignedIds, pendingAssignee]);
                          setPendingAssigneeByProp((prev) => ({ ...prev, [prop.id]: '' }));
                        }}
                        className="px-3 py-1 bg-accent-primary text-fg-primary rounded hover:bg-accent-hover transition-colors text-sm font-semibold"
                        disabled={isReadOnly || !pendingAssignee}
                      >
                        Add
                      </button>
                    </div>
                    {assignedIds.length === 0 ? (
                      <div className="text-xs text-fg-muted">No people assigned</div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {assignedIds.map((assigneeId) => (
                          <span
                            key={assigneeId}
                            className="inline-flex items-center gap-2 bg-bg-dark border border-border rounded px-2 py-1 text-xs text-fg-primary"
                          >
                            <span>{assigneeLabelById.get(assigneeId) ?? assigneeId}</span>
                            <button
                              type="button"
                              onClick={() => {
                                handlePropertyChange(
                                  prop.id,
                                  assignedIds.filter((id) => id !== assigneeId),
                                );
                              }}
                              className="text-fg-secondary hover:text-fg-primary"
                              title="Remove assignee"
                              disabled={isReadOnly}
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {isManualAllocationsField && (
                  <div>
                    <label className="block text-sm text-fg-secondary mb-1">
                      {prop.name}
                    </label>
                    <div className="rounded border border-border bg-bg-dark/40 p-2 space-y-2">
                      {manualDates.length === 0 ? (
                        <div className="text-xs text-fg-muted">No manual allocations set.</div>
                      ) : (
                        manualDates.map((dateKey) => {
                          const personEntries = Object.entries(manualAllocations[dateKey])
                            .sort(([a], [b]) => a.localeCompare(b));
                          return (
                            <div key={dateKey} className="rounded border border-border/60 bg-bg-dark px-2 py-1.5">
                              <div className="text-xs font-semibold text-fg-secondary mb-1">{dateKey}</div>
                              <div className="space-y-1">
                                {personEntries.map(([personId, hours]) => (
                                  <div key={`${dateKey}-${personId}`} className="flex items-center justify-between gap-2 text-xs">
                                    <span className="text-fg-primary truncate">{assigneeLabelById.get(personId) ?? personId}</span>
                                    <span className="text-fg-secondary font-mono">{hours.toFixed(1)}h</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                    <div className="mt-1 text-xs text-fg-muted">
                      Edit per-day allocations in the Manpower view task rows.
                    </div>
                  </div>
                )}
                {prop.type === 'text' && !isAssigneeField && !isManualAllocationsField && (
                  <Input
                    label={prop.name}
                    value={draftValue}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      setDraftValues((prev) => ({ ...prev, [draftKey]: nextValue }));
                      scheduleCommit(draftKey, prop.id, nextValue, false);
                    }}
                    onBlur={(e) => {
                      flushCommit(draftKey, prop.id, e.target.value, false);
                    }}
                    required={prop.required}
                    disabled={isReadOnly}
                  />
                )}
                {prop.type === 'number' && !isAssigneeField && !isManualAllocationsField && (
                  <Input
                    label={prop.name}
                    type="number"
                    value={draftValue}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      setDraftValues((prev) => ({ ...prev, [draftKey]: nextValue }));
                      scheduleCommit(draftKey, prop.id, nextValue, false);
                    }}
                    onBlur={(e) => {
                      flushCommit(draftKey, prop.id, e.target.value, false);
                    }}
                    required={prop.required}
                    disabled={isReadOnly}
                  />
                )}
                {prop.type === 'currency' && !isAssigneeField && !isManualAllocationsField && (
                  <CurrencyInput
                    label={prop.name}
                    value={draftValue}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      setDraftValues((prev) => ({ ...prev, [draftKey]: nextValue }));
                      scheduleCommit(draftKey, prop.id, nextValue, false);
                    }}
                    onBlur={(e) => {
                      flushCommit(draftKey, prop.id, e.target.value, false);
                    }}
                    required={prop.required}
                    disabled={isReadOnly}
                  />
                )}
                {prop.type === 'date' && !isAssigneeField && !isManualAllocationsField && (
                  <Input
                    label={prop.name}
                    type="date"
                    value={draftValue}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      setDraftValues((prev) => ({ ...prev, [draftKey]: nextValue }));
                      scheduleCommit(draftKey, prop.id, nextValue, false);
                    }}
                    onBlur={(e) => {
                      flushCommit(draftKey, prop.id, e.target.value, false);
                    }}
                    required={prop.required}
                    disabled={isReadOnly}
                  />
                )}
                {prop.type === 'select' && prop.options && !isAssigneeField && !isManualAllocationsField && (
                  <Select
                    label={prop.name}
                    value={String(displayValue)}
                    onChange={(e) => handlePropertyChange(prop.id, e.target.value)}
                    options={prop.options}
                    required={prop.required}
                    disabled={isReadOnly}
                  />
                )}
                {prop.type === 'textarea' && !isAssigneeField && !isManualAllocationsField && (
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
                        flushCommit(draftKey, prop.id, e.target.value, false);
                      }}
                      className="w-full bg-bg-dark text-fg-primary border border-border rounded-sm px-2 py-1 text-sm font-body focus:border-accent-primary focus:outline-none resize-none"
                      rows={3}
                      required={prop.required}
                      disabled={isReadOnly}
                    />
                  </div>
                )}
                {prop.type === 'checkbox' && !isAssigneeField && !isManualAllocationsField && (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`checkbox-${prop.id}`}
                      checked={displayValue === 'true' || displayValue === 1 || displayValue === '1'}
                      onChange={(e) =>
                        handlePropertyChange(prop.id, e.target.checked ? 'true' : 'false')
                      }
                      className="w-4 h-4 cursor-pointer accent-accent-primary"
                      disabled={isReadOnly}
                    />
                    <label
                      htmlFor={`checkbox-${prop.id}`}
                      className="text-sm text-fg-secondary cursor-pointer"
                    >
                      {prop.name}
                    </label>
                  </div>
                )}
                {prop.type === 'editor' && !isAssigneeField && !isManualAllocationsField && (
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
                        disabled={isReadOnly}
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
                  <label className="block text-sm text-orange-300 mb-1">{key}</label>
                  <div className="flex gap-2 items-center">
                    <div className="flex-1 bg-bg-dark/80 text-fg-primary border border-orange-500/40 rounded-sm px-2 py-1 text-sm font-medium">
                      {String(value)}
                    </div>
                    {onOrphanedPropertyDelete && (
                      <button
                        onClick={() => onOrphanedPropertyDelete(key)}
                        className="h-8 w-8 inline-flex items-center justify-center bg-status-danger/20 text-status-danger rounded hover:bg-status-danger/30 transition-colors text-sm font-semibold"
                        title="Delete orphaned property"
                        aria-label="Delete orphaned property"
                      >
                        🗑️
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
                          flushCommit(assetDraftKey, prop.id, e.target.value, true);
                        }}
                        required={prop.required}
                      />
                    )}
                    {prop.type === 'number' && (
                      <Input
                        label={prop.name}
                        type="number"
                        value={assetDraftValue}
                        onChange={(e) => {
                          const nextValue = e.target.value;
                          setDraftValues((prev) => ({ ...prev, [assetDraftKey]: nextValue }));
                          scheduleCommit(assetDraftKey, prop.id, nextValue, true);
                        }}
                        onBlur={(e) => {
                          flushCommit(assetDraftKey, prop.id, e.target.value, true);
                        }}
                        required={prop.required}
                      />
                    )}
                    {prop.type === 'currency' && (
                      <CurrencyInput
                        label={prop.name}
                        value={assetDraftValue}
                        onChange={(e) => {
                          const nextValue = e.target.value;
                          setDraftValues((prev) => ({ ...prev, [assetDraftKey]: nextValue }));
                          scheduleCommit(assetDraftKey, prop.id, nextValue, true);
                        }}
                        onBlur={(e) => {
                          flushCommit(assetDraftKey, prop.id, e.target.value, true);
                        }}
                        required={prop.required}
                      />
                    )}
                    {prop.type === 'date' && (
                      <Input
                        label={prop.name}
                        type="date"
                        value={assetDraftValue}
                        onChange={(e) => {
                          const nextValue = e.target.value;
                          setDraftValues((prev) => ({ ...prev, [assetDraftKey]: nextValue }));
                          scheduleCommit(assetDraftKey, prop.id, nextValue, true);
                        }}
                        onBlur={(e) => {
                          flushCommit(assetDraftKey, prop.id, e.target.value, true);
                        }}
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
                              flushCommit(assetDraftKey, prop.id, e.target.value, true);
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

        {/* Person Weekly Schedule Dialog */}
        {personScheduleOpen && isPersonNode && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-3xl bg-bg-light border border-border rounded-lg shadow-xl">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-fg-primary">Weekly Capacity &amp; Hourly Rates</h3>
                  <p className="text-xs text-fg-secondary">Use this table to manage person availability and overtime rates by day.</p>
                </div>
                <button
                  onClick={() => setPersonScheduleOpen(false)}
                  className="px-3 py-1.5 text-xs text-fg-secondary hover:text-fg-primary hover:bg-bg-dark rounded"
                >
                  Close
                </button>
              </div>

              <div className="p-4 overflow-auto max-h-[70vh]">
                <div className="mb-3 flex flex-wrap gap-2">
                  <button
                    onClick={copyMondayCapacityToWeekdays}
                    className="px-2.5 py-1.5 text-xs bg-bg-dark border border-border rounded text-fg-primary hover:bg-bg-selection transition-colors"
                  >
                    Copy Mon Capacity → Tue–Fri
                  </button>
                  <button
                    onClick={copyMondayRateToWeekdays}
                    className="px-2.5 py-1.5 text-xs bg-bg-dark border border-border rounded text-fg-primary hover:bg-bg-selection transition-colors"
                  >
                    Copy Mon Rate → Tue–Fri
                  </button>
                  <button
                    onClick={copyMondayOvertimeToWeekdays}
                    className="px-2.5 py-1.5 text-xs bg-bg-dark border border-border rounded text-fg-primary hover:bg-bg-selection transition-colors"
                  >
                    Copy Mon OT → Tue–Fri
                  </button>
                  <button
                    onClick={copyFridayRateToWeekend}
                    className="px-2.5 py-1.5 text-xs bg-bg-dark border border-border rounded text-fg-primary hover:bg-bg-selection transition-colors"
                  >
                    Copy Fri Rate → Weekend
                  </button>
                </div>
                <table className="w-full text-sm border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <th className="text-left text-fg-secondary px-3 py-2 border-b border-border">Day</th>
                      <th className="text-left text-fg-secondary px-3 py-2 border-b border-border">Capacity (hours, 0-24)</th>
                      <th className="text-left text-fg-secondary px-3 py-2 border-b border-border">OT Capacity (hours, 0-24)</th>
                      <th className="text-left text-fg-secondary px-3 py-2 border-b border-border">Hourly Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {WEEKDAY_LABELS.map((day) => {
                      const capacityId = `capacity_${day.key}`;
                      const rateId = `hourly_rate_${day.key}`;
                      const overtimeId = `overtime_capacity_${day.key}`;
                      return (
                        <tr key={day.key}>
                          <td className="px-3 py-2 border-b border-border text-fg-primary font-medium">{day.full}</td>
                          <td className="px-3 py-2 border-b border-border">
                            <input
                              type="number"
                              min={0}
                              max={24}
                              step={0.25}
                              value={personScheduleDraft[capacityId] ?? ''}
                              onChange={(event) => {
                                const nextValue = event.target.value;
                                const parsed = Number(nextValue);
                                if (nextValue === '') {
                                  setPersonScheduleDraft((prev) => ({ ...prev, [capacityId]: '' }));
                                  return;
                                }
                                const clamped = Number.isFinite(parsed)
                                  ? Math.max(0, Math.min(24, parsed))
                                  : 0;
                                setPersonScheduleDraft((prev) => ({ ...prev, [capacityId]: String(clamped) }));
                              }}
                              className="w-full px-2 py-1 bg-bg-dark border border-border rounded text-fg-primary"
                            />
                          </td>
                          <td className="px-3 py-2 border-b border-border">
                            <input
                              type="number"
                              min={0}
                              max={24}
                              step={0.25}
                              value={personScheduleDraft[overtimeId] ?? '0'}
                              onChange={(event) => {
                                const nextValue = event.target.value;
                                const parsed = Number(nextValue);
                                if (nextValue === '') {
                                  setPersonScheduleDraft((prev) => ({ ...prev, [overtimeId]: '' }));
                                  return;
                                }
                                const clamped = Number.isFinite(parsed)
                                  ? Math.max(0, Math.min(24, parsed))
                                  : 0;
                                setPersonScheduleDraft((prev) => ({ ...prev, [overtimeId]: String(clamped) }));
                              }}
                              className="w-full px-2 py-1 bg-bg-dark border border-border rounded text-fg-primary"
                            />
                          </td>
                          <td className="px-3 py-2 border-b border-border">
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={personScheduleDraft[rateId] ?? ''}
                              onChange={(event) => {
                                const nextValue = event.target.value;
                                setPersonScheduleDraft((prev) => ({ ...prev, [rateId]: nextValue }));
                              }}
                              className="w-full px-2 py-1 bg-bg-dark border border-border rounded text-fg-primary"
                              placeholder="Optional"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="px-4 py-3 border-t border-border flex items-center justify-end gap-2">
                <button
                  onClick={() => setPersonScheduleOpen(false)}
                  className="px-3 py-1.5 text-sm text-fg-secondary hover:text-fg-primary hover:bg-bg-dark rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={savePersonScheduleEditor}
                  className="px-3 py-1.5 text-sm bg-accent-primary text-fg-primary rounded hover:bg-accent-hover transition-colors font-semibold"
                >
                  Save Week
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
