import { Fragment, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Users } from 'lucide-react';

import { apiClient, type Node, type VelocityScore } from '../../api/client';
import { useManpowerPayload } from '../../hooks/useManpowerPayload';

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

function formatHours(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatHoursFixed(value: number): string {
  return value.toFixed(1);
}

function getAssignedPersonIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => String(entry ?? '').trim()).filter(Boolean);
      }
    } catch {
      // Fall through to delimiter parsing.
    }
    return trimmed.split(/[;,]/).map((entry) => entry.trim()).filter(Boolean);
  }
  return [];
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

function cellTone(load: number, capacity: number, overtimeCapacity: number = 0): string {
  if (load <= 0) {
    return 'bg-bg-dark text-fg-secondary';
  }

  if (capacity <= 0) {
    // No regular capacity — treat everything as overbooked
    return 'bg-status-danger/30 text-status-danger';
  }

  const totalSafe = capacity + overtimeCapacity;

  if (load > totalSafe) {
    // Overbooked — exceeds even overtime budget
    return 'bg-status-danger/30 text-status-danger';
  }
  if (overtimeCapacity > 0 && load > capacity) {
    // Overtime zone — over regular capacity but within overtime allowance
    return 'bg-orange-500/25 text-orange-200';
  }
  // Within regular (optimal) capacity
  return 'bg-emerald-500/18 text-emerald-200';
}

export function ManpowerView({
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
  const [isSavingAllocation, setIsSavingAllocation] = useState(false);
  // Per-cell inline draft: key = `${taskId}:${date}`. Auto-saved to API on input blur.
  const [inlineDrafts, setInlineDrafts] = useState<Record<string, string>>({});
  const [collapsedPersons, setCollapsedPersons] = useState<Set<string>>(new Set());
  const togglePersonCollapse = (personId: string) => {
    setCollapsedPersons((prev) => {
      const next = new Set(prev);
      if (next.has(personId)) { next.delete(personId); } else { next.add(personId); }
      return next;
    });
  };

  const resources = Object.entries(data?.resources ?? {});
  const totalCapacity = resources.reduce((sum, [, resource]) => sum + resource.capacity, 0);
  const totalAssigned = resources.reduce(
    (sum, [, resource]) => sum + Object.values(resource.load).reduce((daySum, value) => daySum + getLoadTotal(value), 0),
    0,
  );
  const hasData = Boolean(data && resources.length > 0 && data.date_columns.length > 0);
  const firstDate = data?.date_columns[0] ?? null;
  const lastDate = data?.date_columns[data.date_columns.length - 1] ?? null;
  const unallocatedTasks = data?.unallocated_tasks ?? [];
  const getDayCapacity = (resource: { capacity: number; capacity_by_day?: Record<string, number> }, day: string) => {
    return resource.capacity_by_day?.[day] ?? resource.capacity;
  };
  const getDayOvertimeCapacity = (resource: { overtime_capacity?: number; overtime_capacity_by_day?: Record<string, number> }, day: string) => {
    return resource.overtime_capacity_by_day?.[day] ?? resource.overtime_capacity ?? 0;
  };

  const nodeMap = useMemo(() => nodes ?? {}, [nodes]);

  // Collect all unique tasks per person, including assigned tasks not yet represented in dated load buckets.
  const personTaskMap = useMemo(() => {
    const map = new Map<string, PersonTaskRow[]>();
    resources.forEach(([personId, resource]) => {
      const seen = new Set<string>();
      const tasks: PersonTaskRow[] = [];
      (data?.date_columns ?? []).forEach((day) => {
        getLoadTasks(resource.load[day]).forEach((task) => {
          if (!seen.has(task.id)) {
            seen.add(task.id);
            tasks.push({ id: task.id, name: task.name });
          }
        });
      });

      Object.values(nodeMap).forEach((node) => {
        if (node?.type !== 'task') {
          return;
        }
        const assignedPersonIds = getAssignedPersonIds(node.properties?.assigned_to);
        if (!assignedPersonIds.includes(personId) || seen.has(node.id)) {
          return;
        }
        seen.add(node.id);
        tasks.push({
          id: node.id,
          name: String(node.properties?.name || node.id),
        });
      });

      map.set(personId, tasks);
    });
    return map;
  }, [data, nodeMap, resources]);

  const updateManualAllocation = async (taskId: string, personId: string, date: string, rawValue: string) => {
    if (!sessionId) {
      return;
    }

    const taskNode = nodeMap[taskId];
    if (!taskNode) {
      console.error('Task not found for manual allocation update:', taskId);
      return;
    }

    const currentManual = taskNode.properties?.manual_allocations;
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
        property_id: 'manual_allocations',
        old_value: taskNode.properties?.manual_allocations ?? null,
        new_value: nextManual,
      });

      await refresh();
    } catch (updateError) {
      console.error('Failed to update manual allocation:', updateError);
    } finally {
      setIsSavingAllocation(false);
    }
  };

  // Count person-days that are overbooked (exceed capacity + overtime_capacity)
  const overloadedDayCount = data
    ? resources.reduce(
        (acc, [, resource]) =>
          acc +
          (data.date_columns.filter(
            (day) => {
              const dayCapacity = getDayCapacity(resource, day);
              const overtimeCap = getDayOvertimeCapacity(resource, day);
              const totalSafe = dayCapacity + overtimeCap;
              return totalSafe > 0 && getLoadTotal(resource.load[day]) > totalSafe;
            },
          ).length),
        0,
      )
    : 0;

  useEffect(() => {
    onOverloadChange?.(overloadedDayCount);
  }, [overloadedDayCount, onOverloadChange]);

  void nodes;
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
      {error && (
        <div className="px-6 py-3 bg-status-danger/10 border-b border-status-danger text-status-danger">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} />
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

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
            </div>
          </div>
          {unallocatedTasks.length > 0 && (
            <div className="mt-3 rounded border border-status-danger/40 bg-status-danger/10 px-3 py-2 text-xs text-status-danger">
              <div className="font-semibold">
                {unallocatedTasks.length} task{unallocatedTasks.length === 1 ? '' : 's'} exceed available capacity in their scheduled date range
              </div>
              <div className="mt-1 space-y-1">
                {unallocatedTasks.slice(0, 3).map((task) => (
                  <div key={task.node_id}>
                    {task.name}: {formatHours(task.unallocated_hours)}h unallocated ({task.start_date} → {task.end_date})
                  </div>
                ))}
                {unallocatedTasks.length > 3 && <div>…and {unallocatedTasks.length - 3} more</div>}
              </div>
            </div>
          )}
        </div>
      )}

      {hasData && data && (
        <div className="flex-1 overflow-auto">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="sticky left-0 z-40 bg-bg-darker px-4 py-3 text-left font-semibold text-fg-secondary border-b border-r border-border min-w-56">
                  Resource
                </th>
                <th className="bg-bg-darker px-3 py-3 text-right font-semibold text-fg-secondary border-b border-r border-border min-w-28">
                  Capacity
                </th>
                {data.date_columns.map((day) => (
                  <th
                    key={day}
                    className="bg-bg-darker px-3 py-3 text-center font-semibold text-fg-secondary border-b border-r border-border min-w-24"
                  >
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resources.map(([personId, resource]) => {
                const isSelected = selectedNodeId === personId;
                const personTasks = personTaskMap.get(personId) ?? [];
                const isCollapsed = collapsedPersons.has(personId);
                return (
                  <Fragment key={personId}>
                    {/* Person summary row */}
                    <tr
                      className={`transition-colors cursor-pointer ${
                        isSelected ? 'bg-accent-primary/12' : 'hover:bg-bg-light/60'
                      }`}
                      onClick={() => onNodeSelect?.(personId)}
                    >
                      <td
                        className={`sticky left-0 z-30 px-4 py-2 border-b border-r border-border min-w-56 ${
                          isSelected ? 'bg-bg-darker' : 'bg-bg-dark'
                        }`}
                      >
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
                      <td className="px-3 py-2 text-right font-mono border-b border-r border-border text-fg-primary">
                        {formatHours(resource.capacity)}
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
                      const isTaskSelected = selectedNodeId === task.id;
                      return (
                        <tr
                          key={task.id}
                          className={`cursor-pointer transition-colors ${
                            isTaskSelected ? 'bg-accent-primary/12' : 'bg-bg-darker/40 hover:bg-bg-darker/60'
                          }`}
                          onClick={() => onNodeSelect?.(task.id)}
                        >
                          <td className={`sticky left-0 z-30 px-4 py-2 border-b border-r border-border min-w-56 ${
                            isTaskSelected ? 'bg-bg-darker' : 'bg-bg-darker/60'
                          }`}>
                            <div className="flex items-center gap-1.5 pl-6">
                              <span className="text-fg-secondary shrink-0">└</span>
                              <span className="text-fg-primary truncate">{task.name}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 border-b border-r border-border text-center text-fg-secondary">—</td>
                          {data.date_columns.map((day) => {
                            const backendHours = getLoadTasks(resource.load[day]).find((t) => t.id === task.id)?.hours ?? 0;
                            const draftKey = `${task.id}:${day}`;
                            const draftValue = inlineDrafts[draftKey];
                            const displayValue = draftValue !== undefined ? draftValue : (backendHours > 0 ? formatHoursFixed(backendHours) : '');
                            return (
                              <td key={day} className="px-2 py-2 border-b border-r border-border">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.25"
                                  value={displayValue}
                                  placeholder="—"
                                  disabled={isSavingAllocation}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setInlineDrafts((prev) => ({ ...prev, [draftKey]: val }));
                                  }}
                                  onBlur={async () => {
                                    const draft = inlineDrafts[draftKey];
                                    if (draft === undefined) return;
                                    await updateManualAllocation(task.id, personId, day, draft);
                                    setInlineDrafts((prev) => {
                                      const next = { ...prev };
                                      delete next[draftKey];
                                      return next;
                                    });
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
        <div className="border-t border-border px-6 py-3 bg-bg-light flex items-center gap-6 text-xs text-fg-secondary flex-wrap">
          <span className="font-semibold text-fg-primary">Legend:</span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-bg-dark border border-border" />
            Empty
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500/40" />
            Optimal
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-orange-500/40" />
            Overtime
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-status-danger/40" />
            Overbooked
          </span>
          {overloadedDayCount > 0 && (
            <span className="ml-auto text-status-danger font-semibold">
              {overloadedDayCount} overbooked person-{overloadedDayCount === 1 ? 'day' : 'days'}
            </span>
          )}
        </div>
      )}

    </div>
  );
}
