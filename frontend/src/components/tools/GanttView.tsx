import { useState, useEffect, useCallback, useRef, useMemo, type WheelEvent as ReactWheelEvent } from 'react';
import { AlertCircle, Calendar, ZoomIn, ZoomOut } from 'lucide-react';
import { apiClient, type GanttPayload, type GanttBar, type VelocityScore, type TemplateSchema } from '../../api/client';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useFilterStore } from '../../store/filterStore';
import { evaluateNodeVisibility } from '../../utils/filterEngine';

interface GanttViewProps {
  sessionId: string | null;
  nodes?: Record<string, any>;
  velocityScores?: Record<string, VelocityScore>;
  refreshSignal?: number;
  selectedNodeId?: string | null;
  onNodeSelect?: (nodeId: string | null) => void;
  onGraphChanged?: (result: { graph?: any; is_dirty?: boolean }) => void;
  templateSchema?: TemplateSchema | null;
}

type ZoomLevel = 'day' | 'week' | 'month';

// ── Status-based bar colors ─────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; fill: string }> = {
  'Done':        { bg: 'bg-status-success',       fill: 'bg-status-success' },
  'In Progress': { bg: 'bg-amber-600',            fill: 'bg-amber-400' },
  'To Do':       { bg: 'bg-sky-700',              fill: 'bg-sky-400' },
};

const DEFAULT_STATUS_COLOR = { bg: 'bg-zinc-600', fill: 'bg-zinc-400' };

function statusColor(status: string): { bg: string; fill: string } {
  return STATUS_COLORS[status] || DEFAULT_STATUS_COLOR;
}

// ── Date helpers ────────────────────────────────────────────────────

function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatShortDate(d: Date): string {
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
}

// ── Timeline column generator ───────────────────────────────────────

interface TimelineColumn {
  label: string;
  startDate: Date;
  endDate: Date;  // exclusive
  leftPercent: number;
  widthPercent: number;
}

function generateColumns(earliest: Date, latest: Date, zoom: ZoomLevel): TimelineColumn[] {
  const totalDays = Math.max(daysBetween(earliest, latest), 1);
  const cols: TimelineColumn[] = [];

  if (zoom === 'day') {
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(earliest, i);
      const dow = d.getDay();
      const label = `${SHORT_DAYS[dow]} ${d.getDate()}`;
      cols.push({
        label,
        startDate: d,
        endDate: addDays(d, 1),
        leftPercent: (i / totalDays) * 100,
        widthPercent: (1 / totalDays) * 100,
      });
    }
  } else if (zoom === 'week') {
    let cursor = new Date(earliest);
    const dow = cursor.getDay();
    cursor.setDate(cursor.getDate() - ((dow + 6) % 7));
    while (cursor < latest) {
      const weekEnd = addDays(cursor, 7);
      const visStart = cursor < earliest ? earliest : cursor;
      const visEnd = weekEnd > latest ? latest : weekEnd;
      const left = (daysBetween(earliest, visStart) / totalDays) * 100;
      const width = (daysBetween(visStart, visEnd) / totalDays) * 100;
      cols.push({
        label: formatShortDate(cursor),
        startDate: new Date(cursor),
        endDate: weekEnd,
        leftPercent: left,
        widthPercent: width,
      });
      cursor = weekEnd;
    }
  } else {
    let cursor = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
    while (cursor < latest) {
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      const visStart = cursor < earliest ? earliest : cursor;
      const visEnd = monthEnd > latest ? latest : monthEnd;
      const left = (daysBetween(earliest, visStart) / totalDays) * 100;
      const width = (daysBetween(visStart, visEnd) / totalDays) * 100;
      cols.push({
        label: `${SHORT_MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`,
        startDate: new Date(cursor),
        endDate: monthEnd,
        leftPercent: left,
        widthPercent: width,
      });
      cursor = monthEnd;
    }
  }

  return cols;
}

// ── Resize handle type ──────────────────────────────────────────────

type ResizeEdge = 'left' | 'right';

// ── Component ───────────────────────────────────────────────────────

const LABEL_COL_WIDTH = 220;
const ROW_HEIGHT = 40;

export function GanttView({
  sessionId,
  nodes,
  velocityScores,
  refreshSignal,
  selectedNodeId,
  onNodeSelect,
  onGraphChanged,
  templateSchema,
}: GanttViewProps) {
  const [data, setData] = useState<GanttPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<ZoomLevel>('week');
  const [scale, setScale] = useState(1);          // horizontal zoom 0.5× – 5×
  const refreshPendingRef = useRef(false);
  const refreshingRef = useRef(false);

  const zoomIn  = useCallback(() => setScale(s => Math.min(s + 0.25, 5)), []);
  const zoomOut = useCallback(() => setScale(s => Math.max(s - 0.25, 0.5)), []);

  /** Ctrl+Wheel → horizontal zoom */
  const handleWheel = useCallback((e: ReactWheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    if (e.deltaY < 0) zoomIn(); else zoomOut();
  }, [zoomIn, zoomOut]);

  // ── Template feature helper ─────────────────────────────────────

  const typeFeatures = useMemo(() => {
    const map = new Map<string, string[]>();
    templateSchema?.node_types?.forEach(nt => map.set(nt.id, nt.features || []));
    return map;
  }, [templateSchema]);

  const getTypeLabel = useMemo(() => {
    const map = new Map<string, string>();
    templateSchema?.node_types?.forEach(nt => map.set(nt.id, nt.name));
    return (typeId: string) => map.get(typeId) || typeId;
  }, [templateSchema]);

  // ── Data fetching ───────────────────────────────────────────────

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
    if (!sessionId) return;
    fetchGantt();
  }, [fetchGantt, refreshSignal, sessionId]);

  useWebSocket({
    onNodeCreated: fetchGantt,
    onNodeUpdated: fetchGantt,
    onNodeDeleted: fetchGantt,
    onPropertyChanged: fetchGantt,
  });

  // ── Shared drag math ─────────────────────────────────────────────

  const trackWidthRef = useRef(0);
  const timelineRef = useRef<{ earliest: string; latest: string } | null>(null);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  /** Convert a pixel delta to a day-snapped shift using the stored timeline range. */
  const pixelsToDayShift = useCallback(
    (deltaX: number): number => {
      const tl = timelineRef.current;
      if (!tl) return 0;
      const trackW = trackWidthRef.current || 1;
      const deltaPercent = (deltaX / trackW) * 100;
      const earliest = parseDate(tl.earliest);
      const latest = parseDate(tl.latest);
      const totalDays = Math.max(daysBetween(earliest, latest), 1);
      return Math.round((deltaPercent / 100) * totalDays);
    },
    [],                          // no deps — reads from refs only
  );

  // ── Drag (whole-bar shift) ──────────────────────────────────────

  const [draggingBarId, setDraggingBarId] = useState<string | null>(null);
  const [dragDayShift, setDragDayShift] = useState(0);
  const dragStartXRef = useRef(0);
  const dragBarRef = useRef<GanttBar | null>(null);

  const handleDragStart = useCallback(
    (e: React.MouseEvent, bar: GanttBar) => {
      e.preventDefault();
      dragBarRef.current = bar;
      dragStartXRef.current = e.clientX;
      setDraggingBarId(bar.nodeId);
      setDragDayShift(0);
      const track = (e.currentTarget.closest('[data-gantt-track]') as HTMLElement);
      trackWidthRef.current = track?.offsetWidth || 1;
      // Snapshot timeline at drag start so closures never go stale
      timelineRef.current = data?.timelineRange ?? null;

      const handleMouseMove = (me: MouseEvent) => {
        me.preventDefault();
        setDragDayShift(pixelsToDayShift(me.clientX - dragStartXRef.current));
      };
      const handleMouseUp = async (me: MouseEvent) => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        const b = dragBarRef.current;
        const sid = sessionIdRef.current;
        const shift = pixelsToDayShift(me.clientX - dragStartXRef.current);
        dragBarRef.current = null;
        if (!b || !sid || !timelineRef.current || shift === 0) {
          setDraggingBarId(null);
          setDragDayShift(0);
          return;
        }

        const newStart = addDays(parseDate(b.startDate), shift);
        const newEnd = addDays(parseDate(b.endDate), shift);
        try {
          await apiClient.executeCommand(sid, 'UpdateProperty', {
            node_id: b.nodeId, property_id: 'start_date',
            old_value: b.startDate, new_value: toIso(newStart),
          });
          const endResult = await apiClient.executeCommand(sid, 'UpdateProperty', {
            node_id: b.nodeId, property_id: 'end_date',
            old_value: b.endDate, new_value: toIso(newEnd),
          });
          onGraphChanged?.(endResult);
          // Fetch fresh gantt data directly — bypass the debounce guard
          const result = await apiClient.getGanttPayload(sid);
          setData(result);
        } catch (err) { console.error('Failed to shift dates:', err); }
        setDraggingBarId(null);
        setDragDayShift(0);
      };
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [data, pixelsToDayShift],
  );

  // ── Resize (single-edge drag) ──────────────────────────────────

  const [resizingBarId, setResizingBarId] = useState<string | null>(null);
  const [resizeDayShift, setResizeDayShift] = useState(0);
  const resizeEdgeRef = useRef<ResizeEdge>('right');
  const resizeBarRef = useRef<GanttBar | null>(null);
  const resizeStartXRef = useRef(0);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, bar: GanttBar, edge: ResizeEdge) => {
      e.preventDefault();
      e.stopPropagation();
      resizeBarRef.current = bar;
      resizeEdgeRef.current = edge;
      resizeStartXRef.current = e.clientX;
      setResizingBarId(bar.nodeId);
      setResizeDayShift(0);
      const track = (e.currentTarget.closest('[data-gantt-track]') as HTMLElement);
      trackWidthRef.current = track?.offsetWidth || 1;
      // Snapshot timeline at resize start
      timelineRef.current = data?.timelineRange ?? null;

      const handleMouseMove = (me: MouseEvent) => {
        me.preventDefault();
        setResizeDayShift(pixelsToDayShift(me.clientX - resizeStartXRef.current));
      };
      const handleMouseUp = async (me: MouseEvent) => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        const b = resizeBarRef.current;
        const edg = resizeEdgeRef.current;
        const sid = sessionIdRef.current;
        const shift = pixelsToDayShift(me.clientX - resizeStartXRef.current);
        resizeBarRef.current = null;
        if (!b || !sid || !timelineRef.current || shift === 0) {
          setResizingBarId(null);
          setResizeDayShift(0);
          return;
        }

        try {
          if (edg === 'left') {
            const newStart = addDays(parseDate(b.startDate), shift);
            if (newStart >= parseDate(b.endDate)) { setResizingBarId(null); setResizeDayShift(0); return; }
            const cmdResult = await apiClient.executeCommand(sid, 'UpdateProperty', {
              node_id: b.nodeId, property_id: 'start_date',
              old_value: b.startDate, new_value: toIso(newStart),
            });
            onGraphChanged?.(cmdResult);
          } else {
            const newEnd = addDays(parseDate(b.endDate), shift);
            if (newEnd <= parseDate(b.startDate)) { setResizingBarId(null); setResizeDayShift(0); return; }
            const cmdResult = await apiClient.executeCommand(sid, 'UpdateProperty', {
              node_id: b.nodeId, property_id: 'end_date',
              old_value: b.endDate, new_value: toIso(newEnd),
            });
            onGraphChanged?.(cmdResult);
          }
          // Fetch fresh gantt data directly — bypass the debounce guard
          const result = await apiClient.getGanttPayload(sid);
          setData(result);
        } catch (err) { console.error('Failed to resize:', err); }
        setResizingBarId(null);
        setResizeDayShift(0);
      };
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [data, pixelsToDayShift],
  );

  // ── Derived data ────────────────────────────────────────────────

  const { rules, filterMode } = useFilterStore();

  const filteredBars = useMemo(() => {
    if (!data) return [];
    return data.bars.filter(bar => {
      const features = typeFeatures.get(bar.nodeType) || [];
      if (!features.includes('scheduling')) return false;

      const sourceProps = nodes?.[bar.nodeId]?.properties || {};
      const nodeForFilter = {
        id: bar.nodeId, name: bar.nodeName, type: bar.nodeType,
        properties: { ...sourceProps, name: bar.nodeName },
        velocity: velocityScores?.[bar.nodeId],
      };
      return evaluateNodeVisibility(nodeForFilter, rules);
    });
  }, [data, nodes, velocityScores, rules, typeFeatures]);

  const ghostBarIds = useMemo(() => {
    if (!data || filterMode !== 'ghost') return new Set<string>();
    const ids = new Set<string>();
    data.bars.forEach(bar => {
      const features = typeFeatures.get(bar.nodeType) || [];
      if (!features.includes('scheduling')) return;
      const sourceProps = nodes?.[bar.nodeId]?.properties || {};
      const nodeForFilter = {
        id: bar.nodeId, name: bar.nodeName, type: bar.nodeType,
        properties: { ...sourceProps, name: bar.nodeName },
        velocity: velocityScores?.[bar.nodeId],
      };
      if (!evaluateNodeVisibility(nodeForFilter, rules)) {
        ids.add(bar.nodeId);
      }
    });
    return ids;
  }, [data, nodes, velocityScores, rules, filterMode, typeFeatures]);

  const visibleBars = useMemo(() => {
    if (filterMode === 'ghost' && data) {
      return data.bars.filter(bar => {
        const features = typeFeatures.get(bar.nodeType) || [];
        return features.includes('scheduling');
      });
    }
    return filteredBars;
  }, [filteredBars, data, filterMode, typeFeatures]);

  const columns = useMemo(() => {
    if (!data?.timelineRange) return [];
    return generateColumns(
      parseDate(data.timelineRange.earliest),
      parseDate(data.timelineRange.latest),
      zoom,
    );
  }, [data?.timelineRange, zoom]);

  // ── Today marker ────────────────────────────────────────────────

  const todayPercent = useMemo(() => {
    if (!data?.timelineRange || !data?.today) return null;
    const earliest = parseDate(data.timelineRange.earliest);
    const latest = parseDate(data.timelineRange.latest);
    const today = parseDate(data.today);
    const totalDays = Math.max(daysBetween(earliest, latest), 1);
    const pct = (daysBetween(earliest, today) / totalDays) * 100;
    if (pct < 0 || pct > 100) return null;
    return pct;
  }, [data]);

  // ── Status summary ──────────────────────────────────────────────

  const statusSummary = useMemo(() => {
    const counts: Record<string, number> = { 'To Do': 0, 'In Progress': 0, 'Done': 0, 'Other': 0 };
    visibleBars.forEach(b => {
      if (counts[b.status] !== undefined) counts[b.status]++;
      else counts['Other']++;
    });
    return counts;
  }, [visibleBars]);

  // ── Render ──────────────────────────────────────────────────────

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

      {/* Toolbar: zoom + status summary */}
      {data && (
        <div className="px-4 py-2 border-b border-border bg-bg-light flex items-center justify-between gap-4">
          {/* Status pills */}
          <div className="flex items-center gap-3 text-xs">
            {Object.entries(statusSummary).filter(([, n]) => n > 0).map(([status, count]) => {
              const { bg } = statusColor(status);
              return (
                <span key={status} className="flex items-center gap-1.5">
                  <span className={`inline-block w-2.5 h-2.5 rounded-sm ${bg}`} />
                  <span className="text-fg-secondary">{status}</span>
                  <span className="font-semibold text-fg-primary">{count}</span>
                </span>
              );
            })}
          </div>
          {/* Zoom controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setZoom('day')}
              className={`px-2 py-1 rounded text-xs transition-colors ${zoom === 'day' ? 'bg-accent-primary text-white' : 'text-fg-secondary hover:bg-bg-dark'}`}
            >Day</button>
            <button
              onClick={() => setZoom('week')}
              className={`px-2 py-1 rounded text-xs transition-colors ${zoom === 'week' ? 'bg-accent-primary text-white' : 'text-fg-secondary hover:bg-bg-dark'}`}
            >Week</button>
            <button
              onClick={() => setZoom('month')}
              className={`px-2 py-1 rounded text-xs transition-colors ${zoom === 'month' ? 'bg-accent-primary text-white' : 'text-fg-secondary hover:bg-bg-dark'}`}
            >Month</button>
            <span className="ml-2 text-border">|</span>
            <button
              onClick={zoomOut}
              disabled={scale <= 0.5}
              className="p-1 rounded text-fg-secondary hover:bg-bg-dark transition-colors disabled:opacity-30"
              title="Zoom out (Ctrl+Scroll)"
            ><ZoomOut size={14} /></button>
            <span className="text-[10px] text-fg-secondary min-w-[3ch] text-center">{Math.round(scale * 100)}%</span>
            <button
              onClick={zoomIn}
              disabled={scale >= 5}
              className="p-1 rounded text-fg-secondary hover:bg-bg-dark transition-colors disabled:opacity-30"
              title="Zoom in (Ctrl+Scroll)"
            ><ZoomIn size={14} /></button>
          </div>
        </div>
      )}

      {/* Main chart area */}
      {data && visibleBars.length > 0 && (
        <div className="flex-1 overflow-auto" data-testid="gantt-chart" onWheel={handleWheel}>
          <div className="min-w-max">
            {/* ── Column header row ─────────────────────────────── */}
            <div className="flex sticky top-0 z-20 bg-bg-light border-b border-border">
              <div className="flex-shrink-0 px-4 py-2 text-xs font-semibold text-fg-secondary border-r border-border"
                   style={{ width: LABEL_COL_WIDTH }}>
                Task
              </div>
              <div className="flex-1 relative" style={{ minWidth: 600 * scale }}>
                <div className="flex h-full">
                  {columns.map((col, i) => {
                    const isWeekend = zoom === 'day' && (col.startDate.getDay() === 0 || col.startDate.getDay() === 6);
                    return (
                      <div
                        key={i}
                        className={`border-r border-border text-center text-[10px] py-2 truncate ${
                          isWeekend ? 'text-fg-secondary/50 bg-[#1a1a1a]' : 'text-fg-secondary'
                        }`}
                        style={{ width: `${col.widthPercent}%`, minWidth: zoom === 'day' ? 28 * scale : undefined }}
                      >
                        {col.label}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── Body: labels + chart grid ─────────────────────── */}
            <div className="flex">
              {/* ── Label column ─────────────── */}
              <div className="flex-shrink-0 border-r border-border" style={{ width: LABEL_COL_WIDTH }}>
                {visibleBars.map((bar, rowIdx) => {
                  const isSelected = selectedNodeId === bar.nodeId;
                  const isGhost = ghostBarIds.has(bar.nodeId);
                  return (
                    <div
                      key={bar.nodeId}
                      className={`flex items-center px-3 truncate border-b cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-accent-primary/10 border-accent-primary/30'
                          : rowIdx % 2 === 0
                            ? 'border-border bg-transparent hover:bg-bg-light/50'
                            : 'border-border bg-[#181818] hover:bg-bg-light/50'
                      } ${isGhost ? 'opacity-25' : ''}`}
                      style={{ height: ROW_HEIGHT, paddingLeft: `${bar.depth * 14 + 12}px` }}
                      onClick={() => onNodeSelect?.(bar.nodeId)}
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-xs text-fg-primary truncate leading-tight">
                          {bar.nodeName}
                        </div>
                        <div className="text-[10px] text-fg-secondary truncate leading-tight">
                          {getTypeLabel(bar.nodeType)}
                          {bar.estimatedHours > 0 && ` · ${bar.estimatedHours}h`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── Chart area with full-height grid ─── */}
              <div
                className="flex-1 relative"
                style={{ minWidth: 600 * scale, height: visibleBars.length * ROW_HEIGHT }}
                data-gantt-track
              >
                {/* Horizontal row dividers (full-width) — rendered first so grid lines paint on top */}
                {visibleBars.map((bar, rowIdx) => {
                  const isSelected = selectedNodeId === bar.nodeId;
                  return (
                    <div
                      key={`row-bg-${bar.nodeId}`}
                      className={`absolute left-0 right-0 border-b ${
                        isSelected
                          ? 'bg-accent-primary/10 border-accent-primary/30'
                          : rowIdx % 2 === 0
                            ? 'border-border bg-transparent'
                            : 'border-border bg-[#181818]'
                      }`}
                      style={{ top: rowIdx * ROW_HEIGHT, height: ROW_HEIGHT }}
                    />
                  );
                })}

                {/* Full-height vertical grid lines — rendered after row backgrounds so they stay visible */}
                {columns.map((col, i) => {
                  const isWeekend = zoom === 'day' && (col.startDate.getDay() === 0 || col.startDate.getDay() === 6);
                  return (
                    <div
                      key={`grid-${i}`}
                      className={`absolute top-0 bottom-0 border-r pointer-events-none ${
                        isWeekend
                          ? 'bg-[#1a1a1a] border-border'
                          : 'border-border'
                      }`}
                      style={{ left: `${col.leftPercent}%`, width: `${col.widthPercent}%` }}
                    />
                  );
                })}

                {/* Today marker (full height) */}
                {todayPercent !== null && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-status-danger/70 z-[5] pointer-events-none"
                    style={{ left: `${todayPercent}%` }}
                    data-testid="gantt-today-marker"
                  />
                )}

                {/* ── Bar overlays ────────────── */}
                {visibleBars.map((bar, rowIdx) => {
                  const isGhost = ghostBarIds.has(bar.nodeId);
                  const isDrag = draggingBarId === bar.nodeId;
                  const isResize = resizingBarId === bar.nodeId;
                  const isActive = isDrag || isResize;
                  const { bg, fill } = statusColor(bar.status);

                  // Compute visual offsets for the active bar
                  let adjLeft = bar.leftPercent;
                  let adjWidth = bar.widthPercent;
                  let tooltipDates: { start: string; end: string } | null = null;

                  if ((isDrag || isResize) && data?.timelineRange) {
                    const earliest = parseDate(data.timelineRange.earliest);
                    const latest = parseDate(data.timelineRange.latest);
                    const totalDays = Math.max(daysBetween(earliest, latest), 1);
                    const shiftPct = ((isDrag ? dragDayShift : resizeDayShift) / totalDays) * 100;

                    if (isDrag) {
                      adjLeft = bar.leftPercent + shiftPct;
                      const newStart = addDays(parseDate(bar.startDate), dragDayShift);
                      const newEnd = addDays(parseDate(bar.endDate), dragDayShift);
                      tooltipDates = { start: toIso(newStart), end: toIso(newEnd) };
                    } else if (isResize) {
                      const edge = resizeEdgeRef.current;
                      if (edge === 'left') {
                        adjLeft = bar.leftPercent + shiftPct;
                        adjWidth = bar.widthPercent - shiftPct;
                        const newStart = addDays(parseDate(bar.startDate), resizeDayShift);
                        tooltipDates = { start: toIso(newStart), end: bar.endDate };
                      } else {
                        adjWidth = bar.widthPercent + shiftPct;
                        const newEnd = addDays(parseDate(bar.endDate), resizeDayShift);
                        tooltipDates = { start: bar.startDate, end: toIso(newEnd) };
                      }
                    }
                    // Clamp to non-negative width
                    if (adjWidth < 0.5) adjWidth = 0.5;
                  }

                  return (
                    <div
                      key={bar.nodeId}
                      className={`absolute ${isGhost ? 'opacity-25' : ''}`}
                      style={{
                        top: rowIdx * ROW_HEIGHT + 6,
                        left: `${adjLeft}%`,
                        width: `${adjWidth}%`,
                        height: ROW_HEIGHT - 12,
                        zIndex: isActive ? 10 : undefined,
                        transition: isActive ? 'none' : undefined,
                      }}
                      onClick={() => onNodeSelect?.(bar.nodeId)}
                    >
                      <div
                        className={`w-full h-full rounded group ${bg} ${
                          isActive ? 'opacity-80 ring-1 ring-accent-primary shadow-lg' : 'opacity-90 hover:opacity-100'
                        } transition-opacity cursor-move relative`}
                        style={{ minWidth: 6 }}
                        onMouseDown={(e) => handleDragStart(e, bar)}
                        title={`${bar.nodeName}\n${bar.startDate} → ${bar.endDate}\nStatus: ${bar.status || 'None'}\nProgress: ${Math.round(bar.progress * 100)}%`}
                      >
                        {/* Date tooltip during drag/resize */}
                        {tooltipDates && (
                          <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap bg-bg-dark border border-border rounded px-1.5 py-0.5 text-[10px] text-fg-primary shadow-md z-20 pointer-events-none">
                            {tooltipDates.start} → {tooltipDates.end}
                          </div>
                        )}
                        {/* Progress fill overlay */}
                        {bar.progress > 0 && bar.progress < 1 && (
                          <div
                            className={`absolute inset-y-0 left-0 rounded-l ${fill} opacity-60`}
                            style={{ width: `${bar.progress * 100}%` }}
                          />
                        )}

                        {/* Bar text – show when estimated pixel width > 30px */}
                        {adjWidth * 6 * scale > 30 && (
                          <span className="relative z-[1] flex items-center justify-center h-full px-1.5 text-[10px] text-white font-medium truncate text-center">
                            {bar.nodeName}
                            {bar.progress > 0 && (
                              <span className="ml-1 opacity-75">
                                {Math.round(bar.progress * 100)}%
                              </span>
                            )}
                          </span>
                        )}

                        {/* Resize handle: left edge */}
                        <div
                          className="absolute left-0 top-0 bottom-0 w-3 z-10 cursor-ew-resize bg-white/10 hover:bg-white/30 rounded-l transition-colors"
                          onMouseDown={(e) => handleResizeStart(e, bar, 'left')}
                        />
                        {/* Resize handle: right edge */}
                        <div
                          className="absolute right-0 top-0 bottom-0 w-3 z-10 cursor-ew-resize bg-white/10 hover:bg-white/30 rounded-r transition-colors"
                          onMouseDown={(e) => handleResizeStart(e, bar, 'right')}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && data && visibleBars.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-fg-secondary">
            <Calendar size={48} className="mx-auto mb-3 opacity-30" />
            <div className="text-sm">No nodes with scheduling data</div>
            <div className="text-xs mt-1">
              Enable the &quot;scheduling&quot; feature on node types and set start/end dates
            </div>
          </div>
        </div>
      )}

      {/* Footer legend */}
      {data && visibleBars.length > 0 && (
        <div className="border-t border-border px-4 py-2 bg-bg-light flex items-center justify-between text-[10px] text-fg-secondary">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-sm bg-sky-700" /> To Do
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-sm bg-amber-600" /> In Progress
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-sm bg-status-success" /> Done
            </span>
            <span className="flex items-center gap-1 ml-2">
              <span className="inline-block w-px h-3 bg-status-danger/70" /> Today
            </span>
          </div>
          <span>Drag bar to shift dates · Drag edges to resize</span>
        </div>
      )}
    </div>
  );
}
