import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { AlertCircle, RefreshCcw, Trash2, Users } from 'lucide-react';
import { ask } from '@tauri-apps/plugin-dialog';

import { apiClient, type Node, type TemplateSchema, type VelocityScore } from '../../api/client';
import { useManpowerPayload } from '../../hooks/useManpowerPayload';
import { useGraphStore } from '../../store';
import { useFilterStore } from '../../store/filterStore';
import { evaluateNodeVisibility } from '../../utils/filterEngine';
import { buildPropertyUuidMap } from '../../utils/propertyResolver';

// Context menu state for row (person) and column (date) right-click menus
type ManpowerContextMenu =
  | { type: 'row'; id: string; x: number; y: number }
  | { type: 'col'; id: string; x: number; y: number }
  | null;

interface ManpowerViewProps {
  sessionId: string | null;
  nodes?: Record<string, Node>;
  velocityScores?: Record<string, VelocityScore>;
  refreshSignal?: number;
  selectedNodeId?: string | null;
  onNodeSelect?: (nodeId: string | null) => void;
  /** Called whenever the number of overloaded person-days changes. */
  onOverloadChange?: (overloadedDayCount: number) => void;
  /** Called when an edit makes the project dirty (e.g. manual allocation change). */
  onDirtyChange?: (isDirty: boolean) => void;
  templateSchema?: TemplateSchema | null;
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
  onDirtyChange,
  templateSchema,
}: ManpowerViewProps) {
  const { data, loading, error, refresh, silentRefresh, patchData } = useManpowerPayload({
    sessionId,
    refreshSignal,
  });
  const { updateNode } = useGraphStore();
  const { rules, filterMode } = useFilterStore();
  const [isSavingAllocation, setIsSavingAllocation] = useState(false);
  // Per-task save queue: ensures concurrent edits to the same task are serialized,
  // so each save reads the Zustand store AFTER the previous save's updateNode has run.
  const saveQueues = useRef<Record<string, Promise<void>>>({});
  const debouncedRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isRecalculating, setIsRecalculating] = useState(false);
  // Per-cell inline draft: key = `${taskId}:${personId}:${date}`. Auto-saved to API on input blur.
  const [inlineDrafts, setInlineDrafts] = useState<Record<string, string>>({});
  const [collapsedPersons, setCollapsedPersons] = useState<Set<string>>(new Set());
  // Local optimistic selection — provides instant visual feedback while the
  // full App re-render happens inside a React transition (non-blocking).
  const [localSelection, setLocalSelection] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ManpowerContextMenu>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasScrolledToTodayRef = useRef(false);
  const effectiveSelection = localSelection ?? selectedNodeId;
  // Clear local override once the parent prop catches up
  useEffect(() => { setLocalSelection(null); }, [selectedNodeId]);
  // Cleanup debounced refresh timer on unmount
  useEffect(() => () => { if (debouncedRefreshTimer.current) clearTimeout(debouncedRefreshTimer.current); }, []);
  // Close context menu on escape or click outside
  useEffect(() => {
    if (!contextMenu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setContextMenu(null); };
    const onClick = () => setContextMenu(null);
    window.addEventListener('keydown', onKey as any);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey as any);
      window.removeEventListener('mousedown', onClick);
    };
  }, [contextMenu]);
  /** Schedule a silent background refresh, debounced so rapid edits batch. */
  const scheduleSilentRefresh = useCallback((delayMs = 800) => {
    if (debouncedRefreshTimer.current) clearTimeout(debouncedRefreshTimer.current);
    debouncedRefreshTimer.current = setTimeout(() => {
      debouncedRefreshTimer.current = null;
      void silentRefresh();
    }, delayMs);
  }, [silentRefresh]);
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
  // Auto-scroll to today's date column on initial data load
  useEffect(() => {
    if (hasScrolledToTodayRef.current || !todayInRange || !scrollContainerRef.current) return;
    const todayTh = scrollContainerRef.current.querySelector<HTMLElement>('[data-date-today]');
    if (todayTh) {
      // Scroll so today is the first visible date column (offset by the sticky columns)
      const stickyOffset = todayTh.closest('table')?.querySelector<HTMLElement>('th:nth-child(2)');
      const leftOffset = stickyOffset ? stickyOffset.offsetLeft + stickyOffset.offsetWidth : 0;
      scrollContainerRef.current.scrollLeft = todayTh.offsetLeft - leftOffset;
      hasScrolledToTodayRef.current = true;
    }
  }, [todayInRange, hasData]);
  const getDayCapacity = (resource: { capacity: number; capacity_by_day?: Record<string, number> }, day: string) => {
    return resource.capacity_by_day?.[day] ?? resource.capacity;
  };
  const getDayOvertimeCapacity = (resource: { overtime_capacity?: number; overtime_capacity_by_day?: Record<string, number> }, day: string) => {
    return resource.overtime_capacity_by_day?.[day] ?? resource.overtime_capacity ?? 0;
  };

  // Build per-node-type allocation UUID map so reads/writes target the UUID key
  const allocationUuidByType = useMemo(() => {
    const map = new Map<string, string>();
    if (!templateSchema?.node_types) return map;
    for (const nt of templateSchema.node_types) {
      const uuidMap = buildPropertyUuidMap(nt);
      const allocUuid = uuidMap?.get('allocations');
      if (allocUuid) map.set(nt.id, allocUuid);
    }
    return map;
  }, [templateSchema]);

  const getAllocationPropertyId = (taskNode: Node): string => {
    return allocationUuidByType.get(taskNode.type) ?? 'allocations';
  };

  /** Read allocation data from a task node's properties (UUID key, fallback to semantic). */
  const getTaskAllocations = (taskNode: Node): Record<string, Record<string, number>> | undefined => {
    const uuid = allocationUuidByType.get(taskNode.type);
    const raw = (uuid ? taskNode.properties?.[uuid] : undefined) ?? taskNode.properties?.allocations;
    if (!raw) return undefined;
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch { return undefined; }
    }
    return raw as Record<string, Record<string, number>>;
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

  // Compute the set of task IDs that pass the current filter rules.
  // Used to scope AutoCalc and Clear to visible tasks only.
  const filteredTaskIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [, tasks] of personTaskMap) {
      for (const task of tasks) {
        if (ids.has(task.id)) continue;
        const taskNode = nodes?.[task.id];
        const nodeForFilter = {
          id: task.id,
          name: task.name,
          type: taskNode?.type,
          properties: { ...taskNode?.properties, name: task.name },
        };
        if (evaluateNodeVisibility(nodeForFilter, rules)) {
          ids.add(task.id);
        }
      }
    }
    return ids;
  }, [personTaskMap, nodes, rules]);

  const hasActiveFilter = rules.length > 0;

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

      const currentManual = getTaskAllocations(taskNode);
      let nextManual: Record<string, Record<string, number>> = {};

      if (currentManual && typeof currentManual === 'object' && !Array.isArray(currentManual)) {
        nextManual = JSON.parse(JSON.stringify(currentManual));
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
          property_id: allocationPropertyId,
          old_value: currentManual ?? null,
          new_value: nextManual,
        });

        // Immediately patch the Zustand store so the NEXT queued save for this
        // task reads the correct accumulated state.
        const updatedProps = { ...taskNode.properties, [allocationPropertyId]: nextManual };
        // Clean up legacy semantic key if different from the UUID key
        if (allocationPropertyId !== 'allocations') delete updatedProps['allocations'];
        updateNode(taskId, {
          ...taskNode,
          properties: updatedProps,
        });

        // Optimistic local patch: update the cell value in the payload data
        // immediately so the UI reflects the edit without a full backend round-trip.
        const newHours = rawValue.trim() === '' ? 0 : Number(rawValue);
        patchData((prev) => {
          const resource = prev.resources[personId];
          if (!resource) return prev;
          const nextResources = { ...prev.resources };
          const nextResource = { ...resource, load: { ...resource.load } };
          const existingLoad = nextResource.load[date];
          const oldTasks = existingLoad?.tasks ?? [];
          const existingTask = oldTasks.find((t) => t.id === taskId);
          const prevHours = existingTask?.hours ?? 0;
          const hoursDelta = newHours - prevHours;
          const nextTasks = existingTask
            ? oldTasks.map((t) => (t.id === taskId ? { ...t, hours: newHours } : t))
            : [...oldTasks, { id: taskId, name: taskNode.name ?? taskId, hours: newHours }];
          nextResource.load[date] = {
            total: (existingLoad?.total ?? 0) + hoursDelta,
            tasks: nextTasks.filter((t) => t.hours > 0),
          };
          nextResources[personId] = nextResource;

          // Also patch task_allocations totals for the sidebar status indicators
          const nextTaskAllocations = (prev.task_allocations ?? []).map((ta) => {
            if (ta.node_id === taskId && ta.person_id === personId) {
              const nextAllocated = ta.allocated_hours + hoursDelta;
              const delta = nextAllocated - ta.target_hours;
              const status = Math.abs(delta) <= 0.05 ? 'full' : delta > 0 ? 'over' : 'under';
              return { ...ta, allocated_hours: nextAllocated, status } as typeof ta;
            }
            return ta;
          });

          return { ...prev, resources: nextResources, task_allocations: nextTaskAllocations };
        });

        onDirtyChange?.(true);
        // Schedule a debounced silent refresh so totals/status fully reconcile
        // from the backend without a visible flash.
        scheduleSilentRefresh();
      } catch (updateError) {
        console.error('Failed to update manual allocation:', updateError);
        // On error, force a full refresh to reset to server truth
        await refresh();
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

  /** Sync changes from a backend result into the graph store and trigger refresh. */
  const applyChangesAndRefresh = async (result: any) => {
    if (result.changes && result.changes.length > 0) {
      const { nodes: storeNodes } = useGraphStore.getState();
      for (const change of result.changes) {
        const existing = storeNodes[change.node_id];
        if (existing) {
          const updatedProps = { ...existing.properties, [change.property_id]: change.new_value };
          // Clean up legacy semantic "allocations" key if the change is under a UUID key
          if (change.property_id !== 'allocations' && 'allocations' in updatedProps) {
            delete updatedProps['allocations'];
          }
          updateNode(change.node_id, {
            ...existing,
            properties: updatedProps,
          });
        }
      }
      onDirtyChange?.(true);
    }
    await refresh();
  };

  const handleRecalculate = async () => {
    if (!sessionId) {
      return;
    }
    setIsRecalculating(true);
    try {
      // When a filter is active, only recalculate visible tasks
      const nodeIds = hasActiveFilter ? Array.from(filteredTaskIds) : undefined;
      const result = await apiClient.recalculateManpower(sessionId, nodeIds);
      await applyChangesAndRefresh(result);
    } catch (recalculateError) {
      console.error('Failed to recalculate manpower allocations:', recalculateError);
    } finally {
      setIsRecalculating(false);
    }
  };

  const [isClearing, setIsClearing] = useState(false);

  const handleClearFiltered = async () => {
    if (!sessionId || filteredTaskIds.size === 0) {
      return;
    }
    const count = filteredTaskIds.size;
    const msg = hasActiveFilter
      ? `Clear allocations for ${count} filtered task${count === 1 ? '' : 's'}?`
      : 'Clear ALL task allocations? This cannot be undone easily.';
    if (!await ask(msg, { title: 'Confirm Clear', kind: 'warning' })) return;
    setIsClearing(true);
    try {
      const result = await apiClient.clearManpowerAllocations(sessionId, Array.from(filteredTaskIds));
      await applyChangesAndRefresh(result);
    } catch (clearError) {
      console.error('Failed to clear manpower allocations:', clearError);
    } finally {
      setIsClearing(false);
    }
  };

  /** Context-menu action for a person row: clear or autocalc tasks assigned to this person. */
  const handleRowAction = async (personId: string, action: 'clear' | 'autocalc') => {
    if (!sessionId) return;
    // Intersect this person's tasks with the current filter set
    const personTasks = personTaskMap.get(personId) ?? [];
    const nodeIds = personTasks.map((t) => t.id).filter((id) => filteredTaskIds.has(id));
    if (nodeIds.length === 0) return;
    if (action === 'clear') {
      const personName = data?.resources?.[personId]?.name ?? personId;
      if (!await ask(`Clear allocations for "${personName}" (${nodeIds.length} task${nodeIds.length === 1 ? '' : 's'})?`, { title: 'Confirm Clear', kind: 'warning' })) return;
    }
    try {
      if (action === 'clear') {
        setIsClearing(true);
        const result = await apiClient.clearManpowerAllocations(sessionId, nodeIds);
        await applyChangesAndRefresh(result);
      } else {
        setIsRecalculating(true);
        const result = await apiClient.recalculateManpower(sessionId, nodeIds);
        await applyChangesAndRefresh(result);
      }
    } catch (err) {
      console.error(`Failed to ${action} row for person ${personId}:`, err);
    } finally {
      setIsClearing(false);
      setIsRecalculating(false);
    }
  };

  /** Context-menu action for a date column: clear or autocalc for a specific date. */
  const handleColAction = async (day: string, action: 'clear' | 'autocalc') => {
    if (!sessionId) return;
    const nodeIds = Array.from(filteredTaskIds);
    if (nodeIds.length === 0) return;
    if (action === 'clear') {
      if (!await ask(`Clear allocations for ${day}?`, { title: 'Confirm Clear', kind: 'warning' })) return;
    }
    try {
      if (action === 'clear') {
        setIsClearing(true);
        const result = await apiClient.clearManpowerAllocations(sessionId, nodeIds, [day]);
        await applyChangesAndRefresh(result);
      } else {
        setIsRecalculating(true);
        const result = await apiClient.recalculateManpower(sessionId, nodeIds, [day]);
        await applyChangesAndRefresh(result);
      }
    } catch (err) {
      console.error(`Failed to ${action} column for day ${day}:`, err);
    } finally {
      setIsClearing(false);
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
                title={hasActiveFilter
                  ? `AutoCalc filtered (${filteredTaskIds.size} tasks): evenly distribute allocations for visible tasks only`
                  : 'AutoCalc: evenly distribute allocations based on personnel standard availability'}
              >
                <RefreshCcw size={14} className={isRecalculating ? 'animate-spin' : ''} />
                {isRecalculating ? 'AutoCalc…' : hasActiveFilter ? `AutoCalc (${filteredTaskIds.size})` : 'AutoCalc'}
              </button>
              <button
                type="button"
                onClick={handleClearFiltered}
                disabled={isClearing || loading || filteredTaskIds.size === 0}
                className="inline-flex items-center gap-1.5 rounded border border-border px-2.5 py-1.5 text-xs font-semibold text-status-danger hover:bg-status-danger/10 disabled:opacity-50 disabled:cursor-not-allowed"
                title={hasActiveFilter
                  ? `Clear allocations for ${filteredTaskIds.size} filtered tasks`
                  : 'Clear all task allocations'}
              >
                <Trash2 size={14} />
                {isClearing ? 'Clearing…' : hasActiveFilter ? `Clear (${filteredTaskIds.size})` : 'Clear All'}
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
          <div className="flex-1 overflow-auto" ref={scrollContainerRef}>
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
                    data-date-today={isTodayColumn ? '' : undefined}
                    className={`px-3 py-3 text-center font-semibold border-b border-r border-border min-w-24 ${
                      isTodayColumn
                        ? 'bg-emerald-500/60 text-fg-primary border-emerald-300/80'
                        : 'text-fg-secondary'
                    }`}
                    style={isTodayColumn ? undefined : { backgroundColor: '#121212' }}
                    title={isTodayColumn ? 'Today' : undefined}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ type: 'col', id: day, x: e.clientX, y: e.clientY });
                    }}
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
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setContextMenu({ type: 'row', id: personId, x: e.clientX, y: e.clientY });
                      }}
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
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setContextMenu({ type: 'row', id: personId, x: e.clientX, y: e.clientY });
                          }}
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

      {/* Context menu for row/column actions (matches tree view style) */}
      {contextMenu && (
        <div
          className="fixed bg-bg-light border border-border rounded-sm shadow-lg z-50 min-w-max"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseLeave={() => setContextMenu(null)}
        >
          {contextMenu.type === 'row' && (() => {
            const personName = data?.resources?.[contextMenu.id]?.name ?? contextMenu.id;
            return (
              <>
                <button
                  className="w-full text-left px-4 py-2 text-sm text-fg-primary hover:bg-bg-selection transition-colors first:rounded-t-sm"
                  onClick={() => { handleRowAction(contextMenu.id, 'autocalc'); setContextMenu(null); }}
                >
                  ⚡ AutoCalc &ldquo;{personName}&rdquo;
                </button>
                <div className="border-t border-border my-0.5" />
                <button
                  className="w-full text-left px-4 py-2 text-sm text-fg-primary hover:bg-status-danger hover:text-fg-primary transition-colors last:rounded-b-sm"
                  onClick={() => { handleRowAction(contextMenu.id, 'clear'); setContextMenu(null); }}
                >
                  🧹 Clear &ldquo;{personName}&rdquo;
                </button>
              </>
            );
          })()}
          {contextMenu.type === 'col' && (
            <>
              <button
                className="w-full text-left px-4 py-2 text-sm text-fg-primary hover:bg-bg-selection transition-colors first:rounded-t-sm"
                onClick={() => { handleColAction(contextMenu.id, 'autocalc'); setContextMenu(null); }}
              >
                ⚡ AutoCalc {contextMenu.id}
              </button>
              <div className="border-t border-border my-0.5" />
              <button
                className="w-full text-left px-4 py-2 text-sm text-fg-primary hover:bg-status-danger hover:text-fg-primary transition-colors last:rounded-b-sm"
                onClick={() => { handleColAction(contextMenu.id, 'clear'); setContextMenu(null); }}
              >
                🧹 Clear {contextMenu.id}
              </button>
            </>
          )}
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
