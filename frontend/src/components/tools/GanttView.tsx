import { useState, useEffect, useCallback, useRef } from 'react';
import { AlertCircle, Calendar } from 'lucide-react';
import { apiClient, type GanttPayload, type GanttBar } from '../../api/client';
import { useWebSocket } from '../../hooks/useWebSocket';

interface GanttViewProps {
  sessionId: string | null;
  nodes?: Record<string, any>;
  onNodeSelect?: (nodeId: string | null) => void;
}

/** Depth-based bar colour palette */
const DEPTH_COLORS = [
  'bg-accent-primary',
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-purple-500',
  'bg-rose-500',
];

function depthColor(depth: number): string {
  return DEPTH_COLORS[depth % DEPTH_COLORS.length];
}

export function GanttView({ sessionId, onNodeSelect }: GanttViewProps) {
  const [data, setData] = useState<GanttPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshPendingRef = useRef(false);
  const refreshingRef = useRef(false);

  // Drag state
  const [draggingBarId, setDraggingBarId] = useState<string | null>(null);
  const dragStartXRef = useRef<number>(0);
  const dragBarRef = useRef<GanttBar | null>(null);
  const trackWidthRef = useRef<number>(0);

  const fetchGantt = useCallback(async () => {
    if (!sessionId) return;
    if (refreshingRef.current) {
      refreshPendingRef.current = true;
      return;
    }

    refreshingRef.current = true;
    try {
      setLoading(true);
      setError(null);
      const result = await apiClient.getGanttPayload(sessionId);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load gantt data');
      console.error('Error loading gantt:', err);
    } finally {
      setLoading(false);
      refreshingRef.current = false;
      if (refreshPendingRef.current) {
        refreshPendingRef.current = false;
        fetchGantt();
      }
    }
  }, [sessionId]);

  useEffect(() => {
    fetchGantt();
  }, [fetchGantt]);

  useWebSocket({
    onNodeCreated: fetchGantt,
    onNodeUpdated: fetchGantt,
    onNodeDeleted: fetchGantt,
    onPropertyChanged: fetchGantt,
  });

  // ── Drag handlers ─────────────────────────────────────────────────

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, bar: GanttBar) => {
      e.dataTransfer.effectAllowed = 'move';
      // Store the bar being dragged and the initial mouse X
      dragBarRef.current = bar;
      dragStartXRef.current = e.clientX;
      setDraggingBarId(bar.nodeId);

      // Measure the track width from the parent container
      const track = (e.currentTarget.parentElement as HTMLElement);
      trackWidthRef.current = track?.offsetWidth || 1;
    },
    [],
  );

  const handleDragEnd = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      const bar = dragBarRef.current;
      setDraggingBarId(null);
      dragBarRef.current = null;
      if (!bar || !sessionId || !data?.timelineRange) return;

      const deltaX = e.clientX - dragStartXRef.current;
      const trackW = trackWidthRef.current || 1;
      const deltaPercent = (deltaX / trackW) * 100;

      // Convert percent shift to day shift
      const earliest = new Date(data.timelineRange.earliest);
      const latest = new Date(data.timelineRange.latest);
      const totalDays = Math.max((latest.getTime() - earliest.getTime()) / 86_400_000, 1);
      const dayShift = Math.round((deltaPercent / 100) * totalDays);

      if (dayShift === 0) return;

      // Calculate new dates
      const oldStart = new Date(bar.startDate);
      const oldEnd = new Date(bar.endDate);
      const newStart = new Date(oldStart.getTime() + dayShift * 86_400_000);
      const newEnd = new Date(oldEnd.getTime() + dayShift * 86_400_000);

      const toIso = (d: Date) => d.toISOString().split('T')[0];

      // Dispatch two UpdateProperty commands: start_date and end_date
      try {
        await apiClient.executeCommand(sessionId, 'UpdateProperty', {
          node_id: bar.nodeId,
          property_id: 'start_date',
          old_value: bar.startDate,
          new_value: toIso(newStart),
        });
        await apiClient.executeCommand(sessionId, 'UpdateProperty', {
          node_id: bar.nodeId,
          property_id: 'end_date',
          old_value: bar.endDate,
          new_value: toIso(newEnd),
        });
      } catch (err) {
        console.error('Failed to update dates via drag:', err);
      }
      // WebSocket will trigger a refresh
    },
    [sessionId, data],
  );

  // ── Render helpers ────────────────────────────────────────────────

  if (!sessionId) {
    return (
      <div className="flex-1 flex items-center justify-center text-fg-secondary bg-bg-dark">
        <div className="text-center">
          <div className="text-lg mb-2">No project loaded</div>
          <div className="text-sm">Load a project to see Gantt chart</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-bg-dark text-fg-primary">
      {/* Error Display */}
      {error && (
        <div className="px-6 py-3 bg-status-danger/10 border-b border-status-danger text-status-danger">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} />
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && !data && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-fg-secondary">Loading Gantt chart...</div>
        </div>
      )}

      {/* Timeline header */}
      {data?.timelineRange && (
        <div className="px-6 py-3 border-b border-border bg-bg-light flex items-center justify-between text-xs text-fg-secondary">
          <div className="flex items-center gap-2">
            <Calendar size={14} />
            <span>{data.timelineRange.earliest}</span>
          </div>
          <span className="font-semibold text-fg-primary">Timeline</span>
          <span>{data.timelineRange.latest}</span>
        </div>
      )}

      {/* Gantt Bars */}
      {data && data.bars.length > 0 && (
        <div className="flex-1 overflow-auto">
          {data.bars.map((bar) => (
            <div
              key={bar.nodeId}
              className="flex items-center border-b border-border hover:bg-bg-light transition-colors cursor-pointer"
              onClick={() => onNodeSelect?.(bar.nodeId)}
            >
              {/* Label column */}
              <div
                className="w-48 flex-shrink-0 px-4 py-3 truncate"
                style={{ paddingLeft: `${bar.depth * 16 + 16}px` }}
              >
                <div className="font-medium text-sm text-fg-primary truncate">
                  {bar.nodeName}
                </div>
                <div className="text-xs text-fg-secondary">{bar.nodeType}</div>
              </div>

              {/* Bar track */}
              <div className="flex-1 relative h-10 mx-2">
                <div
                  draggable
                  onDragStart={(e) => handleDragStart(e, bar)}
                  onDragEnd={handleDragEnd}
                  className={`absolute top-1 h-8 rounded ${depthColor(bar.depth)} ${
                    draggingBarId === bar.nodeId ? 'opacity-50' : 'opacity-90 hover:opacity-100'
                  } transition-opacity cursor-grab active:cursor-grabbing flex items-center justify-center`}
                  style={{
                    left: `${bar.leftPercent}%`,
                    width: `${bar.widthPercent}%`,
                    minWidth: '4px',
                  }}
                  title={`${bar.startDate} → ${bar.endDate}`}
                >
                  {bar.widthPercent > 8 && (
                    <span className="text-[10px] text-white font-medium truncate px-1">
                      {bar.startDate} — {bar.endDate}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && data && data.bars.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-fg-secondary">
            <Calendar size={48} className="mx-auto mb-3 opacity-30" />
            <div className="text-sm">No nodes with scheduling data</div>
            <div className="text-xs mt-1">
              Enable the "scheduling" feature on node types and set start/end dates
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      {data && data.bars.length > 0 && (
        <div className="border-t border-border px-6 py-3 bg-bg-light text-xs text-fg-secondary">
          <strong>Tip:</strong> Drag a bar left/right to shift its start &amp; end dates.
        </div>
      )}
    </div>
  );
}
