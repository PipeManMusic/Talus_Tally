import { useEffect } from 'react';
import { AlertCircle, Users } from 'lucide-react';

import type { Node, VelocityScore } from '../../api/client';
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

function formatHours(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function cellTone(load: number, capacity: number): string {
  if (load <= 0) {
    return 'bg-bg-dark text-fg-secondary';
  }

  if (capacity <= 0) {
    return 'bg-status-danger/25 text-status-danger';
  }

  const ratio = load / capacity;
  if (ratio >= 1.1) {
    return 'bg-status-danger/30 text-status-danger';
  }
  if (ratio >= 0.85) {
    return 'bg-amber-500/20 text-amber-200';
  }
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
  const { data, loading, error } = useManpowerPayload({
    sessionId,
    refreshSignal,
  });

  const resources = Object.entries(data?.resources ?? {});
  const totalCapacity = resources.reduce((sum, [, resource]) => sum + resource.capacity, 0);
  const totalAssigned = resources.reduce(
    (sum, [, resource]) => sum + Object.values(resource.load).reduce((daySum, value) => daySum + value, 0),
    0,
  );
  const hasData = Boolean(data && resources.length > 0 && data.date_columns.length > 0);
  const firstDate = data?.date_columns[0] ?? null;
  const lastDate = data?.date_columns[data.date_columns.length - 1] ?? null;

  // Count person-days that are over capacity and notify parent
  const overloadedDayCount = data
    ? resources.reduce(
        (acc, [, resource]) =>
          acc +
          (data.date_columns.filter(
            (day) => resource.capacity > 0 && (resource.load[day] ?? 0) / resource.capacity > 1.05,
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
        </div>
      )}

      {hasData && data && (
        <div className="flex-1 overflow-auto">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="sticky left-0 z-20 bg-bg-darker px-4 py-3 text-left font-semibold text-fg-secondary border-b border-r border-border min-w-56">
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
              {resources.map(([resourceId, resource]) => {
                const isSelected = selectedNodeId === resourceId;
                return (
                  <tr
                    key={resourceId}
                    className={`transition-colors cursor-pointer ${
                      isSelected ? 'bg-accent-primary/12' : 'hover:bg-bg-light/60'
                    }`}
                    onClick={() => onNodeSelect?.(resourceId)}
                  >
                    <td className="sticky left-0 z-10 bg-inherit px-4 py-3 border-b border-r border-border">
                      <div className="font-medium text-fg-primary">{resource.name}</div>
                      <div className="text-xs text-fg-secondary">{resourceId}</div>
                    </td>
                    <td className="px-3 py-3 text-right font-mono border-b border-r border-border text-fg-primary">
                      {formatHours(resource.capacity)}
                    </td>
                    {data.date_columns.map((day) => {
                      const load = resource.load[day] ?? 0;
                      return (
                        <td
                          key={day}
                          className={`px-3 py-3 text-center font-mono border-b border-r border-border ${cellTone(load, resource.capacity)}`}
                          title={`Load ${formatHours(load)} / Capacity ${formatHours(resource.capacity)}`}
                        >
                          {load > 0 ? formatHours(load) : '—'}
                        </td>
                      );
                    })}
                  </tr>
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
            <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500/40" />
            Under capacity
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-amber-500/40" />
            Near capacity (&ge; 85 %)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-status-danger/40" />
            Overloaded (&ge; 110 %)
          </span>
          {overloadedDayCount > 0 && (
            <span className="ml-auto text-status-danger font-semibold">
              {overloadedDayCount} overloaded person-{overloadedDayCount === 1 ? 'day' : 'days'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
