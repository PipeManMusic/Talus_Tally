import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { AlertCircle, RefreshCcw, Users } from 'lucide-react';

import { apiClient, type Node, type VelocityScore } from '../../api/client';
import { useManpowerPayload } from '../../hooks/useManpowerPayload';
import { useGraphStore } from '../../store';
import { useFilterStore } from '../../store/filterStore';
import { evaluateNodeVisibility } from '../../utils/filterEngine';

interface ManpowerViewProps {
  sessionId: string | null;
  nodes?: Record<string, Node>;
  velocityScores?: Record<string, VelocityScore>;
  refreshSignal?: number;
  selectedNodeId?: string | null;
  onNodeSelect?: (nodeId: string | null) => void;
  /** Called whenever the number of overloaded person-days changes. */
  onOverloadChange?: (overloadedDayCount: number) => void;
}

interface SelectedCellTask {
  id: string;
  name: string;
  hours: number;
}

interface SelectedCellState {
  personId: string;
  personName: string;
  date: string;
  tasks: SelectedCellTask[];
}

interface PersonTaskRow {
  id: string;
  name: string;
}

interface TaskAllocationStatus {
  status: 'under' | 'over' | 'full';
  allocatedHours: number;
  targetHours: number;
}

interface TaskAllocationEntry {
  node_id: string;
  name: string;
  person_id: string;
}

function formatHours(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatHoursFixed(value: number): string {
  return value.toFixed(1);
}

function getLoadTotal(load: unknown): number {
  if (typeof load === 'number') {
    return load;
  }
  if (load && typeof load === 'object' && 'total' in (load as Record<string, unknown>)) {
    const total = (load as { total?: unknown }).total;
    return typeof total === 'number' ? total : Number(total) || 0;
  }
  return 0;
}

function getLoadTasks(load: unknown): SelectedCellTask[] {
  if (load && typeof load === 'object' && 'tasks' in (load as Record<string, unknown>)) {
    const tasks = (load as { tasks?: unknown }).tasks;
    if (Array.isArray(tasks)) {
      return tasks.map((task) => ({
        id: String((task as { id?: unknown }).id ?? ''),
        name: String((task as { name?: unknown }).name ?? ''),
        hours: Number((task as { hours?: unknown }).hours ?? 0),
      }));
    }
  }
  return [];
}

function normalizeDateKey(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const raw = String(value).trim();
  if (!raw) {
    return null;
  }
  if (raw.includes('T')) {
    return raw.split('T', 1)[0] || null;
  }
  return raw;
}

const ALLOCATION_EPSILON = 0.05;

function getVisualTaskStatus(taskStatus: TaskAllocationStatus): 'under' | 'over' | 'full' {
  const delta = taskStatus.allocatedHours - taskStatus.targetHours;
  if (Math.abs(delta) <= ALLOCATION_EPSILON) {
    return 'full';
  }
  return delta > 0 ? 'over' : 'under';
}

function isOverbooked(load: number, capacity: number, overtimeCapacity: number = 0): boolean {
  if (capacity <= 0) {
    return load > ALLOCATION_EPSILON;
  }
  const totalSafe = capacity + overtimeCapacity;
  return load > totalSafe + ALLOCATION_EPSILON;
}

function cellTone(load: number, capacity: number, overtimeCapacity: number = 0): string {
  if (capacity <= 0) {
    return load > ALLOCATION_EPSILON ? 'bg-status-warning/60 text-fg-primary' : 'bg-neutral-600/40 text-fg-secondary';
  }
  if (Math.abs(load - capacity) <= ALLOCATION_EPSILON) {
    return 'bg-emerald-500/60 text-fg-primary';
  }
  if (load < capacity - ALLOCATION_EPSILON) {
    return 'bg-status-warning/60 text-fg-primary';
  }
  const totalSafe = capacity + overtimeCapacity;
  if (overtimeCapacity > ALLOCATION_EPSILON && load <= totalSafe + ALLOCATION_EPSILON) {
    return 'bg-orange-500/60 text-fg-primary';
  }
  return 'bg-status-danger/60 text-fg-primary';
}

export const ManpowerView = memo(function ManpowerView({
  sessionId,
  nodes,
  velocityScores,
  refreshSignal,
  selectedNodeId,
  onNodeSelect,
  onOverloadChange,
}: ManpowerViewProps) {
  const { data, loading, error, refresh } = useManpowerPayload({
    sessionId,
    refreshSignal,
  });
  const { updateNode } = useGraphStore();
  const { rules, filterMode } = useFilterStore();
  const [isSavingAllocation, setIsSavingAllocation] = useState(false);
  // Per-task save queue: ensures concurrent edits to the same task are serialized,
  // so each save reads the Zustand store AFTER the previous save's updateNode has run.
  const saveQueues = useRef<Record<string, Promise<void>>>({});
  const [isRecalculating, setIsRecalculating] = useState(false);
  // Per-cell inline draft: key = `${taskId}:${personId}:${date}`. Auto-saved to API on input blur.
  const [inlineDrafts, setInlineDrafts] = useState<Record<string, string>>({});
  const [collapsedPersons, setCollapsedPersons] = useState<Set<string>>(new Set());
  // Local optimistic selection — provides instant visual feedback while the
  // full App re-render happens inside a React transition (non-blocking).
  const [localSelection, setLocalSelection] = useState<string | null>(null);
  const effectiveSelection = localSelection ?? selectedNodeId;
  // Clear local override once the parent prop catches up
  useEffect(() => { setLocalSelection(null); }, [selectedNodeId]);
  const handleSelect = useCallback((nodeId: string) => {
    setLocalSelection(nodeId);
    onNodeSelect?.(nodeId);
  }, [onNodeSelect]);
  const togglePersonCollapse = (personId: string) => {
    setCollapsedPersons((prev) => {
      const next = new Set(prev);
      if (next.has(personId)) { next.delete(personId); } else { next.add(personId); }
      return next;
    });
  };

  const resources = useMemo(
    () => Object.entries(data?.resources ?? {}),
    [data?.resources],
  );
  const totalCapacity = resources.reduce((sum, [, resource]) => sum + resource.capacity, 0);
  const totalAssigned = resources.reduce(
    (sum, [, resource]) => sum + Object.values(resource.load).reduce((daySum, value) => daySum + getLoadTotal(value), 0),
    0,
  );
  const hasData = Boolean(data && resources.length > 0 && data.date_columns.length > 0);
  const firstDate = data?.date_columns[0] ?? null;
  const lastDate = data?.date_columns[data.date_columns.length - 1] ?? null;
  const unallocatedTasks = data?.unallocated_tasks ?? [];
  const todayKey = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);
  const todayInRange = useMemo(
    () => Boolean(data?.date_columns?.some((day) => normalizeDateKey(day) === todayKey)),
    [data?.date_columns, todayKey],
  );
  const getDayCapacity = (resource: { capacity: number; capacity_by_day?: Record<string, number> }, day: string) => {
    return resource.capacity_by_day?.[day] ?? resource.capacity;
  };
  const getDayOvertimeCapacity = (resource: { overtime_capacity?: number; overtime_capacity_by_day?: Record<string, number> }, day: string) => {
    return resource.overtime_capacity_by_day?.[day] ?? resource.overtime_capacity ?? 0;
  };

  const getAllocationPropertyId = (_taskNode: Node): 'allocations' => {
    return 'allocations';
  };

  // Build a task date range lookup from the backend's person_tasks so the
  // view can shade cells outside scheduled windows without scanning nodeMap.
  const taskDateRangeMap = useMemo(() => {
    const map = new Map<string, { start: string | null; end: string | null }>();
    const backendPersonTasks = data?.person_tasks ?? {};
    for (const tasks of Object.values(backendPersonTasks)) {
      for (const t of tasks) {
        if (!map.has(t.node_id)) {
          map.set(t.node_id, {
            start: normalizeDateKey(t.start_date),
            end: normalizeDateKey(t.end_date),
          });
        }
      }
    }
    return map;
  }, [data?.person_tasks]);

  // Lightweight helper to look up a person's load bucket for a given day.
  const resource_load_lookup = (personId: string, day: string) => {
    return data?.resources?.[personId]?.load?.[day];
  };

  const allocationStatusMap = useMemo(() => {
    const map = new Map<string, TaskAllocationStatus>();
    (data?.task_allocations ?? []).forEach((allocation) => {
      map.set(`${allocation.node_id}:${allocation.person_id}`, {
        status: allocation.status,
        allocatedHours: allocation.allocated_hours,
        targetHours: allocation.target_hours,
      });
    });
    return map;
  }, [data?.task_allocations]);

  // Build per-person task list from the backend's pre-computed person_tasks.
  // The backend already knows which tasks are schedulable for each person, so
  // we avoid the expensive O(n) scan of every node in the graph.
  const personTaskMap = useMemo(() => {
    const map = new Map<string, PersonTaskRow[]>();
    const backendPersonTasks = data?.person_tasks ?? {};

    resources.forEach(([personId]) => {
      const seen = new Set<string>();
      const tasks: PersonTaskRow[] = [];

      // Primary source: backend's authoritative schedulable-task list
      (backendPersonTasks[personId] ?? []).forEach((bt) => {
        if (!seen.has(bt.node_id)) {
          seen.add(bt.node_id);
          tasks.push({ id: bt.node_id, name: bt.name });
        }
      });

      // Fallback: pick up any tasks that appear in allocation or load data
      // but weren't in person_tasks (shouldn't happen, but defensive).
      (data?.task_allocations ?? []).forEach((allocation) => {
        const typedAllocation = allocation as TaskAllocationEntry;
        if (typedAllocation.person_id !== personId || seen.has(typedAllocation.node_id)) {
          return;
        }
        seen.add(typedAllocation.node_id);
        tasks.push({ id: typedAllocation.node_id, name: typedAllocation.name });
      });

      (data?.date_columns ?? []).forEach((day) => {
        getLoadTasks(resource_load_lookup(personId, day)).forEach((task) => {
          if (!seen.has(task.id)) {
            seen.add(task.id);
            tasks.push({ id: task.id, name: task.name });
          }
        });
      });

      map.set(personId, tasks);
    });
    return map;
  }, [data, resources]);

  useEffect(() => {
    if (!selectedNodeId) {
      return;
    }

    const ownerPersonId = resources.find(([personId]) => {
      const personTasks = personTaskMap.get(personId) ?? [];
      return personTasks.some((task) => task.id === selectedNodeId);
    })?.[0];

    if (!ownerPersonId) {
      return;
    }

    setCollapsedPersons((prev) => {
      if (!prev.has(ownerPersonId)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(ownerPersonId);
      return next;
    });
  }, [personTaskMap, resources, selectedNodeId]);

  const updateManualAllocation = (taskId: string, personId: string, date: string, rawValue: string): Promise<void> => {
    if (!sessionId) {
      return Promise.resolve();
    }

    // Chain onto the previous save for this task so that concurrent blurs (e.g.
    // tab key between cells) are serialized: each save reads from the Zustand store
    // AFTER the prior save's updateNode has committed, preventing the classic
    // read-modify-write race where the later write clobbers an earlier cell's edit.
    const prior = saveQueues.current[taskId] ?? Promise.resolve();
    const thisOp = prior.then(async () => {
      // Reading INSIDE the chained callback ensures we see the latest store value
      // written by any preceding save in this task's queue.
      const taskNode = useGraphStore.getState().nodes[taskId];
      if (!taskNode) {
        console.error('Task not found for manual allocation update:', taskId);
        return;
      }

      const allocationPropertyId = getAllocationPropertyId(taskNode);

      const currentManual = taskNode.properties?.allocations;
      let nextManual: Record<string, Record<string, number>> = {};

      if (currentManual && typeof currentManual === 'object' && !Array.isArray(currentManual)) {
        nextManual = JSON.parse(JSON.stringify(currentManual));
      } else if (typeof currentManual === 'string') {
        try {
          nextManual = JSON.parse(currentManual);
        } catch {
          nextManual = {};
        }
      }

      if (rawValue.trim() === '') {
        if (nextManual[date]) {
          delete nextManual[date][personId];
          if (Object.keys(nextManual[date]).length === 0) {
            delete nextManual[date];
          }
        }
      } else {
        const parsed = Number(rawValue);
        if (Number.isNaN(parsed)) {
          return;
        }
        if (!nextManual[date]) {
          nextManual[date] = {};
        }
        nextManual[date][personId] = parsed;
      }

      setIsSavingAllocation(true);
      try {
        await apiClient.executeCommand(sessionId, 'UpdateProperty', {
          node_id: taskId,
          property_id: 'allocations',
          old_value: taskNode.properties?.allocations ?? null,
          new_value: nextManual,
        });

        // Immediately patch the Zustand store so the NEXT queued save for this
        // task reads the correct accumulated state.
        updateNode(taskId, {
          ...taskNode,
          properties: { ...taskNode.properties, allocations: nextManual },
        });

        await refresh();
      } catch (updateError) {
        console.error('Failed to update manual allocation:', updateError);
      } finally {
        setIsSavingAllocation(false);
      }
    });

    // Store the tail of the chain; swallow errors so later saves still run.
    saveQueues.current[taskId] = thisOp.catch(() => undefined);
    return thisOp;
  };

  const commitManualAllocationDraft = async (
    taskId: string,
    personId: string,
    day: string,
    draftKey: string,
    rawValue: string,
  ) => {
    if (!/^\d*(?:\.\d*)?$/.test(rawValue.trim()) && rawValue.trim() !== '') {
      return;
    }

    await updateManualAllocation(taskId, personId, day, rawValue);
    setInlineDrafts((prev) => {
      const next = { ...prev };
      delete next[draftKey];
      return next;
    });
  };

  const handleManualAllocationKeyDown = async (
    event: KeyboardEvent<HTMLInputElement>,
    taskId: string,
    personId: string,
    day: string,
    draftKey: string,
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      await commitManualAllocationDraft(taskId, personId, day, draftKey, event.currentTarget.value);
      event.currentTarget.blur();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setInlineDrafts((prev) => {
        const next = { ...prev };
        delete next[draftKey];
        return next;
      });
      event.currentTarget.blur();
      return;
    }
    if (event.key.length === 1 && !/[0-9.]/.test(event.key)) {
      event.preventDefault();
    }
  };

  const handleRecalculate = async () => {
    if (!sessionId) {
      return;
    }
    setIsRecalculating(true);
    try {
      const result = await apiClient.recalculateManpower(sessionId);

      // Sync allocation changes into the graph store so subsequent manual
      // edits read the auto-allocated data instead of stale empty values.
      if (result.changes) {
        const { nodes: storeNodes } = useGraphStore.getState();
        for (const change of result.changes) {
          const existing = storeNodes[change.node_id];
          if (existing) {
            updateNode(change.node_id, {
              ...existing,
              properties: { ...existing.properties, [change.property_id]: change.new_value },
            });
          }
        }
      }

      await refresh();
    } catch (recalculateError) {
      console.error('Failed to recalculate manpower allocations:', recalculateError);
    } finally {
      setIsRecalculating(false);
    }
  };

  // Count person-days that are overbooked (exceed capacity + overtime_capacity)
  const overloadedDayCount = useMemo(
    () =>
      data
        ? resources.reduce(
            (acc, [, resource]) =>
              acc +
              (data.date_columns.filter(
                (day) => {
                  const dayCapacity = getDayCapacity(resource, day);
                  const overtimeCap = getDayOvertimeCapacity(resource, day);
                  return isOverbooked(getLoadTotal(resource.load[day]), dayCapacity, overtimeCap);
                },
              ).length),
            0,
          )
        : 0,
    [data, resources],
  );

  const statusSummary = error
    ? {
      toneClass: 'text-status-danger bg-status-danger/15 border-status-danger/50',
      text: error,
    }
    : unallocatedTasks.length > 0
      ? {
        toneClass: 'text-status-warning bg-status-warning/15 border-status-warning/50',
        text: `${unallocatedTasks.length} task${unallocatedTasks.length === 1 ? '' : 's'} not fully allocated`,
      }
      : overloadedDayCount > 0
        ? {
          toneClass: 'text-status-danger bg-status-danger/15 border-status-danger/50',
          text: `${overloadedDayCount} overbooked person-${overloadedDayCount === 1 ? 'day' : 'days'}`,
        }
        : {
          toneClass: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/40',
          text: 'No allocation issues',
        };

  useEffect(() => {
    onOverloadChange?.(overloadedDayCount);
  }, [overloadedDayCount, onOverloadChange]);

  void velocityScores;

  if (!sessionId) {
    return (
      <div className="flex-1 flex items-center justify-center text-fg-secondary bg-bg-dark">
        <div className="text-center">
          <div className="text-lg mb-2">No project loaded</div>
          <div className="text-sm">Load a project to see manpower loading</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-bg-dark text-fg-primary">
      {loading && !data && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-fg-secondary">Loading manpower data...</div>
        </div>
      )}

      {data && (
        <div className="px-6 py-4 border-b border-border bg-bg-light">
          <div className="flex items-center justify-between gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <Users size={20} className="text-accent-primary" />
              <div>
                <div className="text-sm font-semibold text-fg-primary">Manpower Loading</div>
                <div className="text-xs text-fg-secondary">
                  {firstDate && lastDate ? `${firstDate} to ${lastDate}` : 'No timeline available'}
                </div>
                {!todayInRange && firstDate && lastDate && (
                  <div className="text-xs text-emerald-300 mt-0.5">
                    Today: {todayKey} (outside visible range)
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-6 text-sm font-mono">
              <div className="text-fg-secondary">
                Resources: <span className="text-fg-primary">{resources.length}</span>
              </div>
              <div className="text-fg-secondary">
                Capacity: <span className="text-fg-primary">{formatHours(totalCapacity)}</span>
              </div>
              <div className="text-fg-secondary">
                Assigned: <span className="text-fg-primary">{formatHours(totalAssigned)}</span>
              </div>
              <button
                type="button"
                onClick={handleRecalculate}
                disabled={isRecalculating || loading}
                className="inline-flex items-center gap-1.5 rounded border border-border px-2.5 py-1.5 text-xs font-semibold text-fg-primary hover:bg-bg-dark/60 disabled:opacity-50 disabled:cursor-not-allowed"
                title="AutoCalc: evenly distribute allocations based on personnel standard availability"
              >
                <RefreshCcw size={14} className={isRecalculating ? 'animate-spin' : ''} />
                {isRecalculating ? 'AutoCalc…' : 'AutoCalc'}
              </button>
            </div>
          </div>
          <div className="mt-3">
            <div className={`inline-flex items-center gap-2 rounded border px-3 py-1.5 text-xs font-semibold ${statusSummary.toneClass}`}>
              <AlertCircle size={14} />
              <span>{statusSummary.text}</span>
            </div>
          </div>
        </div>
      )}

      {hasData && data && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-50">
              <tr>
                <th className="sticky left-0 z-50 px-4 py-3 text-left font-semibold text-fg-secondary border-b border-r border-border w-56 min-w-56 max-w-56 overflow-hidden" style={{ backgroundColor: '#121212' }}>
                  Resource
                </th>
                <th className="sticky left-[14rem] z-50 px-3 py-3 text-right font-semibold text-fg-secondary border-b border-r border-border min-w-28" style={{ backgroundColor: '#121212' }}>
                  Capacity
                </th>
                {data.date_columns.map((day) => (
                  (() => {
                    const normalizedDay = normalizeDateKey(day);
                    const isTodayColumn = normalizedDay === todayKey;
                    return (
                  <th
                    key={day}
                    className={`px-3 py-3 text-center font-semibold border-b border-r border-border min-w-24 ${
                      isTodayColumn
                        ? 'bg-emerald-500/60 text-fg-primary border-emerald-300/80'
                        : 'text-fg-secondary'
                    }`}
                    style={isTodayColumn ? undefined : { backgroundColor: '#121212' }}
                    title={isTodayColumn ? 'Today' : undefined}
                  >
                    {day}
                  </th>
                    );
                  })()
                ))}
              </tr>
            </thead>
            <tbody>
              {resources.map(([personId, resource]) => {
                const isSelected = selectedNodeId === personId;
                const personTasks = personTaskMap.get(personId) ?? [];
                const hasSelectedTask = personTasks.some((task) => task.id === selectedNodeId);
                const isSelectedCluster = isSelected || hasSelectedTask;
                const isCollapsed = collapsedPersons.has(personId);

                const totalPersonAssigned = data.date_columns.reduce(
                  (sum, day) => sum + getLoadTotal(resource.load[day]),
                  0,
                );
                const remainingCapacity = resource.capacity - totalPersonAssigned;
                const totalOvertimeCap = data.date_columns.reduce(
                  (sum, day) => sum + getDayOvertimeCapacity(resource, day),
                  0,
                );
                const totalSafeCap = resource.capacity + totalOvertimeCap;
                const personCapacityTone = totalPersonAssigned > totalSafeCap + ALLOCATION_EPSILON
                  ? 'bg-status-danger text-fg-primary'
                  : totalPersonAssigned > resource.capacity + ALLOCATION_EPSILON && totalOvertimeCap > ALLOCATION_EPSILON
                    ? 'bg-orange-500 text-fg-primary'
                    : Math.abs(remainingCapacity) <= ALLOCATION_EPSILON
                      ? 'bg-status-success text-fg-primary'
                      : resource.capacity > ALLOCATION_EPSILON
                        ? 'bg-status-warning text-fg-primary'
                        : 'bg-bg-dark text-fg-secondary';
                return (
                  <Fragment key={personId}>
                    {/* Person summary row */}
                    <tr
                      className={`transition-colors cursor-pointer ${
                        isSelectedCluster
                          ? 'bg-accent-primary/25 ring-2 ring-accent-primary/60'
                          : 'hover:bg-bg-light/60'
                      }`}
                      onClick={() => onNodeSelect?.(personId)}
                    >
                      <td
                        className={`relative sticky left-0 z-40 px-4 py-2 border-b border-r border-border w-56 min-w-56 max-w-56 overflow-hidden ${
                          isSelectedCluster ? 'bg-bg-selection' : ''
                        }`}
                        style={isSelectedCluster ? undefined : { backgroundColor: '#121212' }}
                      >
                        {isSelectedCluster && <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-bg-darker" />}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="shrink-0 text-fg-secondary hover:text-fg-primary transition-colors w-4 text-xs"
                            onClick={(e) => { e.stopPropagation(); togglePersonCollapse(personId); }}
                            title={isCollapsed ? 'Expand tasks' : 'Collapse tasks'}
                          >
                            {isCollapsed ? '▶' : '▼'}
                          </button>
                          <span className="font-medium text-fg-primary truncate">{resource.name}</span>
                          {personTasks.length > 0 && (
                            <span className="text-xs text-fg-secondary ml-auto shrink-0 pr-1">{personTasks.length} task{personTasks.length !== 1 ? 's' : ''}</span>
                          )}
                        </div>
                      </td>
                      <td
                        className={`relative sticky left-[14rem] z-30 px-3 py-2 text-right font-mono border-b border-r border-border ${personCapacityTone} ${
                          isSelectedCluster ? 'bg-bg-selection' : ''
                        }`}
                        style={isSelectedCluster ? undefined : { backgroundColor: '#121212' }}
                        title={`Total capacity: ${formatHours(resource.capacity)}h, Assigned: ${formatHours(totalPersonAssigned)}h, Remaining: ${formatHours(remainingCapacity)}h`}
                      >
                        {isSelectedCluster && <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-bg-darker" />}
                        {formatHours(remainingCapacity)}
                      </td>
                      {data.date_columns.map((day) => {
                        const load = resource.load[day];
                        const loadTotal = getLoadTotal(load);
                        const dayCapacity = getDayCapacity(resource, day);
                        const overtimeCap = getDayOvertimeCapacity(resource, day);
                        const totalSafe = dayCapacity + overtimeCap;
                        return (
                          <td
                            key={day}
                            className={`px-3 py-2 text-center font-mono border-b border-r border-border ${cellTone(loadTotal, dayCapacity, overtimeCap)}`}
                            title={`Load ${formatHours(loadTotal)} / Regular ${formatHours(dayCapacity)}${overtimeCap > 0 ? ` / OT limit ${formatHours(totalSafe)}` : ''}`}
                          >
                            {loadTotal > 0 ? formatHours(loadTotal) : '—'}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Task sub-rows — one per task, inline editable */}
                    {!isCollapsed && personTasks.map((task) => {
                      // Apply filter rules to task nodes
                      const taskNode = nodes?.[task.id];
                      const nodeForFilter = {
                        id: task.id,
                        name: task.name,
                        type: taskNode?.type,
                        properties: { ...taskNode?.properties, name: task.name },
                      };
                      const isTaskVisible = evaluateNodeVisibility(nodeForFilter, rules);
                      if (!isTaskVisible && filterMode === 'hide') {
                        return null;
                      }
                      const isTaskGhosted = !isTaskVisible && filterMode === 'ghost';

                      const isTaskSelected = selectedNodeId === task.id;
                      const taskStatus = allocationStatusMap.get(`${task.id}:${personId}`);
                      const visualTaskStatus = taskStatus ? getVisualTaskStatus(taskStatus) : null;
                      const remainingTaskHours = taskStatus
                        ? (() => {
                          const delta = taskStatus.targetHours - taskStatus.allocatedHours;
                          return Math.abs(delta) <= ALLOCATION_EPSILON ? 0 : delta;
                        })()
                        : null;
                      const statusIcon = visualTaskStatus === 'full'
                        ? { char: '✓', cls: 'text-emerald-400' }
                        : visualTaskStatus === 'over'
                          ? { char: '↑', cls: 'text-status-danger' }
                          : { char: '↓', cls: 'text-status-warning' };
                      return (
                        <tr
                          key={task.id}
                          className={`cursor-pointer transition-colors ${
                            isTaskSelected
                              ? 'bg-accent-primary/25 ring-2 ring-accent-primary/60'
                              : 'bg-bg-darker/40 hover:bg-bg-darker/60'
                          }${isTaskGhosted ? ' opacity-30' : ''}`}
                          onClick={() => onNodeSelect?.(task.id)}
                        >
                          <td
                            className={`relative sticky left-0 z-40 px-4 py-2 border-b border-r border-border w-56 min-w-56 max-w-56 overflow-hidden ${
                              isTaskSelected ? 'bg-bg-selection' : ''
                            }`}
                            style={isTaskSelected ? undefined : { backgroundColor: '#121212' }}
                          >
                            {isTaskSelected && <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-bg-darker" />}
                            <div className="flex items-center gap-1.5 pl-6">
                              <span className="text-fg-secondary shrink-0">└</span>
                              {taskStatus && (
                                <span
                                  className={`shrink-0 text-sm font-bold ${statusIcon.cls}`}
                                  title={`Allocated ${formatHours(taskStatus.allocatedHours)}h / Target ${formatHours(taskStatus.targetHours)}h`}
                                >
                                  {statusIcon.char}
                                </span>
                              )}
                              <span className="text-fg-primary truncate">{task.name}</span>
                            </div>
                          </td>
                          <td
                            className={`relative sticky left-[14rem] z-30 px-3 py-2 border-b border-r border-border text-center font-mono ${
                              isTaskSelected ? 'bg-bg-selection' : 'bg-bg-dark'
                            } ${
                              visualTaskStatus
                                ? visualTaskStatus === 'full'
                                  ? 'text-emerald-400'
                                  : visualTaskStatus === 'over'
                                    ? 'text-status-danger'
                                    : 'text-status-warning'
                                : 'text-fg-secondary'
                            }`}
                            title={taskStatus ? `Allocated: ${formatHours(taskStatus.allocatedHours)}h / Target: ${formatHours(taskStatus.targetHours)}h` : undefined}
                          >
                            {isTaskSelected && <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-bg-darker" />}
                            {remainingTaskHours !== null
                              ? formatHours(remainingTaskHours)
                              : '—'}
                          </td>
                          {data.date_columns.map((day) => {
                            const backendHours = getLoadTasks(resource.load[day]).find((t) => t.id === task.id)?.hours ?? 0;
                            const draftKey = `${task.id}:${personId}:${day}`;
                            const draftValue = inlineDrafts[draftKey];
                            const displayValue = draftValue !== undefined ? draftValue : (backendHours > 0 ? formatHoursFixed(backendHours) : '');
                            const taskDates = taskDateRangeMap.get(task.id);
                            const taskStart = taskDates?.start ?? null;
                            const taskEnd = taskDates?.end ?? null;
                            const isOutsideScheduledWindow = Boolean(
                              taskStart && taskEnd && (day < taskStart || day > taskEnd),
                            );
                            return (
                              <td
                                key={day}
                                className={`px-2 py-2 border-2 ${
                                  isOutsideScheduledWindow
                                    ? 'bg-bg-dark/70 border-border/80'
                                    : 'border-emerald-500/80'
                                }`}
                                title={isOutsideScheduledWindow ? 'Outside scheduled task duration' : undefined}
                              >
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={displayValue}
                                  placeholder="—"
                                  disabled={isSavingAllocation}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => e.stopPropagation()}
                                  onFocus={(e) => {
                                    e.stopPropagation();
                                    e.currentTarget.select();
                                  }}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val !== '' && !/^\d*(?:\.\d*)?$/.test(val)) {
                                      return;
                                    }
                                    setInlineDrafts((prev) => ({ ...prev, [draftKey]: val }));
                                  }}
                                  onKeyDown={async (e) => {
                                    await handleManualAllocationKeyDown(e, task.id, personId, day, draftKey);
                                  }}
                                  onBlur={async (e) => {
                                    const nextValue = e.currentTarget.value;
                                    const hasDraft = inlineDrafts[draftKey] !== undefined;
                                    if (!hasDraft && nextValue === displayValue) {
                                      return;
                                    }
                                    await commitManualAllocationDraft(task.id, personId, day, draftKey, nextValue);
                                  }}
                                  className="w-full bg-transparent text-center font-mono text-fg-primary focus:outline-none focus:bg-bg-dark/60 rounded disabled:opacity-40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
            </table>
          </div>

        </div>
      )}

      {!loading && data && !hasData && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-fg-secondary">
            <Users size={48} className="mx-auto mb-3 opacity-30" />
            <div className="text-sm">No manpower data available</div>
            <div className="text-xs mt-1">
              Add person nodes, assign tasks, and set scheduling dates with estimated hours
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      {hasData && (
        <div className="relative z-50 border-t border-border px-6 py-3 bg-bg-light flex items-center gap-6 text-xs text-fg-secondary flex-wrap">
          <span className="font-semibold text-fg-primary">Legend:</span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-neutral-600/40 border border-border" />
            Unavailable
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-bg-dark border border-border" />
            Empty
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-status-warning/60" />
            Under Allocated
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500/60" />
            Fully Allocated
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-orange-500/60" />
            Overtime
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-status-danger/60" />
            Over Allocated
          </span>
        </div>
      )}

      {error && !hasData && (
        <div className="px-6 py-3 bg-status-danger/10 border-t border-status-danger text-status-danger">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} />
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

    </div>
  );
});
