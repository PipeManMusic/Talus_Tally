import { useMemo, useState } from 'react';
import { apiClient, type Node, type VelocityScore, type TemplateSchema } from '../../api/client';
import { useGraphStore } from '../../store';
import { useFilterStore } from '../../store/filterStore';
import { evaluateNodeVisibility } from '../../utils/filterEngine';

interface AgileViewProps {
  nodes?: Record<string, Node>;
  velocityScores?: Record<string, VelocityScore>;
  templateSchema?: TemplateSchema | null;
  sessionId?: string | null;
  selectedNodeId?: string | null;
  onNodeSelect?: (nodeId: string | null) => void;
  onNodePropertyChange?: (args: {
    nodeId: string;
    propertyId: string;
    oldValue: unknown;
    newValue: unknown;
  }) => Promise<void>;
}

const STATUS_COLUMNS = ['To Do', 'In Progress', 'Done'] as const;
type KanbanStatus = (typeof STATUS_COLUMNS)[number];
const AGILE_STATUS_PROPERTY_ID = 'agile_status';

function normalizeStatus(raw: string): KanbanStatus {
  const lower = raw.trim().toLowerCase();
  if (lower === 'in progress' || lower === 'in-progress' || lower === 'inprogress') return 'In Progress';
  if (lower === 'done' || lower === 'complete' || lower === 'completed') return 'Done';
  return 'To Do';
}

export function AgileView({
  nodes = {},
  velocityScores = {},
  templateSchema,
  sessionId,
  selectedNodeId,
  onNodeSelect,
  onNodePropertyChange,
}: AgileViewProps) {
  const { nodes: storeNodes } = useGraphStore();
  const { rules } = useFilterStore();
  const [statusOverrides, setStatusOverrides] = useState<Record<string, KanbanStatus>>({});
  const [savingByNodeId, setSavingByNodeId] = useState<Record<string, boolean>>({});
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<KanbanStatus | null>(null);

  const typeFeatures = useMemo(() => {
    const map = new Map<string, string[]>();
    templateSchema?.node_types?.forEach(nt => map.set(nt.id, nt.features || []));
    return map;
  }, [templateSchema]);

  const effectiveNodes = useMemo(() => {
    return Object.keys(nodes).length > 0 ? nodes : storeNodes;
  }, [nodes, storeNodes]);

  const filteredNodes = useMemo(() => {
    return Object.values(effectiveNodes).filter(node => {
      const features = typeFeatures.get(node.type) || [];
      if (features.includes('is_root') || features.includes('is_person')) return false;
      const isVisible = evaluateNodeVisibility(
        {
          id: node.id,
          type: node.type,
          properties: node.properties || {},
          velocity: velocityScores[node.id],
        },
        rules,
      );
      const estimatedHours = Number(node.properties?.estimated_hours);
      const hasEstimatedHours = Number.isFinite(estimatedHours) && estimatedHours > 0;

      const nodeVelocity = Number(node.properties?.velocity);
      const scoreVelocity = Number(velocityScores[node.id]?.totalVelocity);
      const hasVelocity = (Number.isFinite(nodeVelocity) && nodeVelocity !== 0)
        || (Number.isFinite(scoreVelocity) && scoreVelocity !== 0);

      return isVisible && (hasEstimatedHours || hasVelocity);
    });
  }, [effectiveNodes, rules, velocityScores]);

  const getNodeStatus = (node: Node): KanbanStatus => {
    const override = statusOverrides[node.id];
    if (override) return override;

    const agileStatusRaw = node.properties?.[AGILE_STATUS_PROPERTY_ID];
    if (typeof agileStatusRaw === 'string' && agileStatusRaw.trim()) {
      return normalizeStatus(agileStatusRaw);
    }

    const legacyStatusRaw = node.properties?.status;
    if (typeof legacyStatusRaw === 'string' && legacyStatusRaw.trim()) {
      return normalizeStatus(legacyStatusRaw);
    }

    return 'To Do';
  };

  const columns = useMemo(() => {
    const groups: Record<KanbanStatus, Node[]> = { 'To Do': [], 'In Progress': [], 'Done': [] };

    for (const node of filteredNodes) {
      const status = getNodeStatus(node);
      groups[status].push(node);
    }
    // Sort "To Do" by velocity descending (highest velocity = highest priority)
    groups['To Do'].sort((a, b) => {
      const va = velocityScores[a.id]?.totalVelocity ?? 0;
      const vb = velocityScores[b.id]?.totalVelocity ?? 0;
      return vb - va;
    });
    return groups;
  }, [filteredNodes, statusOverrides, velocityScores]);

  const updateAgileStatus = async (node: Node, nextStatus: KanbanStatus) => {
    if (!sessionId) {
      return;
    }

    const nodeId = node.id;
    const oldValue = node.properties?.[AGILE_STATUS_PROPERTY_ID] ?? null;
    const previousOverride = statusOverrides[nodeId];

    setStatusOverrides((prev) => ({ ...prev, [nodeId]: nextStatus }));
    setSavingByNodeId((prev) => ({ ...prev, [nodeId]: true }));

    try {
      if (onNodePropertyChange) {
        await onNodePropertyChange({
          nodeId,
          propertyId: AGILE_STATUS_PROPERTY_ID,
          oldValue,
          newValue: nextStatus,
        });
      } else {
        await apiClient.executeCommand(sessionId, 'UpdateProperty', {
          node_id: nodeId,
          property_id: AGILE_STATUS_PROPERTY_ID,
          old_value: oldValue,
          new_value: nextStatus,
        });
      }
    } catch (error) {
      console.error('Failed to update agile status:', error);
      setStatusOverrides((prev) => {
        const next = { ...prev };
        if (previousOverride) {
          next[nodeId] = previousOverride;
        } else {
          delete next[nodeId];
        }
        return next;
      });
    } finally {
      setSavingByNodeId((prev) => {
        const next = { ...prev };
        delete next[nodeId];
        return next;
      });
    }
  };

  // Backlog projection
  const totalBacklogHours = useMemo(
    () => columns['To Do'].reduce((sum, node) => sum + (Number(node.properties?.estimated_hours) || 0), 0),
    [columns],
  );

  const avgCapacity = useMemo(() => {
    const persons = Object.values(effectiveNodes).filter(n => typeFeatures.get(n.type)?.includes('is_person'));
    if (persons.length === 0) return 8;
    const caps = persons
      .map(p => Number(p.properties?.daily_capacity) || 0)
      .filter(c => c > 0);
    if (caps.length === 0) return 8;
    return caps.reduce((a, b) => a + b, 0) / caps.length;
  }, [effectiveNodes]);

  const projectedDays = useMemo(() => {
    if (avgCapacity <= 0 || totalBacklogHours <= 0) return 0;
    return Math.ceil(totalBacklogHours / avgCapacity);
  }, [totalBacklogHours, avgCapacity]);

  // Check if a node in "To Do" is actively blocked by an incomplete task
  const isActivelyBlocked = (node: Node): boolean => {
    const score = velocityScores[node.id];
    if (!score?.isBlocked || !score.blockedByNodes?.length) return false;
    return score.blockedByNodes.some(blockerId => {
      const blocker = effectiveNodes[blockerId];
      if (!blocker) return true; // unknown blocker = treat as still blocking
      const blockerStatus = getNodeStatus(blocker);
      return blockerStatus !== 'Done';
    });
  };

  const handleDropToStatus = async (targetStatus: KanbanStatus, droppedNodeId?: string) => {
    setDragOverStatus(null);

    if (!sessionId) {
      setDraggedNodeId(null);
      return;
    }

    const nodeId = droppedNodeId || draggedNodeId;
    if (!nodeId) {
      return;
    }

    const node = effectiveNodes[nodeId];
    if (!node) {
      setDraggedNodeId(null);
      return;
    }

    const currentStatus = getNodeStatus(node);
    if (currentStatus === targetStatus) {
      setDraggedNodeId(null);
      return;
    }

    await updateAgileStatus(node, targetStatus);
    setDraggedNodeId(null);
  };

  const COLUMN_STYLES: Record<KanbanStatus, { header: string; bg: string }> = {
    'To Do': {
      header: 'bg-accent-primary/20 text-accent-primary border-accent-primary/30',
      bg: 'bg-bg-light',
    },
    'In Progress': {
      header: 'bg-accent-warning/20 text-accent-warning border-accent-warning/30',
      bg: 'bg-bg-light',
    },
    Done: {
      header: 'bg-status-success/20 text-status-success border-status-success/30',
      bg: 'bg-bg-light',
    },
  };

  if (filteredNodes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-fg-secondary bg-bg-dark">
        <div className="text-center">
          <div className="text-lg mb-2">No visible nodes</div>
          <div className="text-sm">Load a project or adjust your filters to see Kanban cards.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bg-dark text-fg-primary overflow-hidden">
      {/* Three-column Kanban grid */}
      <div className="flex-1 grid grid-cols-3 gap-3 p-4 overflow-hidden">
        {STATUS_COLUMNS.map(status => {
          const colNodes = columns[status];
          const styles = COLUMN_STYLES[status];

          return (
            <div
              key={status}
              data-testid={`agile-column-${status.toLowerCase().replace(/\s+/g, '-')}`}
              onDragOver={(event) => {
                if (!sessionId) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setDragOverStatus(status);
              }}
              onDragLeave={() => {
                if (dragOverStatus === status) {
                  setDragOverStatus(null);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                const droppedNodeId = event.dataTransfer.getData('text/plain') || undefined;
                void handleDropToStatus(status, droppedNodeId);
              }}
              className={`flex flex-col rounded-lg border border-border ${styles.bg} overflow-hidden ${
                dragOverStatus === status ? 'ring-2 ring-accent-primary/50' : ''
              }`}
            >
              {/* Column header */}
              <div className={`px-3 py-2 border-b ${styles.header} flex items-center justify-between flex-shrink-0`}>
                <span className="text-sm font-semibold">{status}</span>
                <span className="text-xs font-mono opacity-70">{colNodes.length}</span>
              </div>

              {/* Projection banner (To Do only) */}
              {status === 'To Do' && (
                <div className="px-3 py-2 bg-accent-primary/5 border-b border-accent-primary/20 flex-shrink-0">
                  <div className="text-xs text-accent-primary font-medium">
                    Backlog: {totalBacklogHours.toFixed(1)} hrs
                    {projectedDays > 0 && ` (~${projectedDays} day${projectedDays !== 1 ? 's' : ''} to clear)`}
                  </div>
                </div>
              )}

              {/* Cards */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {colNodes.length === 0 ? (
                  <div className="text-xs text-fg-muted text-center py-4 opacity-50">Empty</div>
                ) : (
                  colNodes.map(node => {
                    const velocity = velocityScores[node.id];
                    const blocked = status === 'To Do' && isActivelyBlocked(node);
                    const orphanedReason = typeof (node as any).metadata?.orphaned_reason === 'string'
                      ? ((node as any).metadata.orphaned_reason as string).toLowerCase()
                      : '';
                    const isOrphaned = Boolean((node as any).metadata?.orphaned)
                      && (orphanedReason.includes('not found in current template') || orphanedReason.includes('removed from template'));
                    const name = node.properties?.name || node.id;
                    const hours = Number(node.properties?.estimated_hours) || 0;
                    const vel = velocity?.totalVelocity ?? 0;
                    const isSelected = selectedNodeId === node.id;
                    const isSaving = Boolean(savingByNodeId[node.id]);

                    return (
                      <div
                        key={node.id}
                        data-testid={`agile-card-${node.id}`}
                        draggable={Boolean(sessionId) && !isSaving}
                        onDragStart={(event) => {
                          setDraggedNodeId(node.id);
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('text/plain', node.id);
                        }}
                        onDragEnd={() => {
                          setDraggedNodeId(null);
                          setDragOverStatus(null);
                        }}
                        onClick={() => onNodeSelect?.(node.id)}
                        className={`rounded border px-3 py-2 cursor-pointer transition-all select-none ${
                          isSelected
                            ? 'border-accent-primary bg-accent-primary/15 ring-1 ring-accent-primary/40'
                            : isOrphaned
                              ? 'border-status-danger/40 bg-status-danger/10 hover:bg-status-danger/20'
                              : 'border-border hover:border-border-muted hover:bg-bg-darker'
                        } ${blocked ? 'opacity-50' : ''} ${isOrphaned ? 'opacity-80' : ''}`}
                        title={isOrphaned ? 'Orphaned node' : (blocked ? 'Blocked by incomplete task' : (sessionId ? 'Drag to another column to update Agile status' : undefined))}
                      >
                        <div className="flex items-start justify-between gap-1 mb-1">
                          <span className="text-xs font-medium text-fg-primary leading-tight truncate flex-1">
                            {isOrphaned && <span className="mr-1 text-status-danger">⚠</span>}
                            {blocked && <span className="mr-1">🔒</span>}
                            {name}
                          </span>
                          <span className="text-[10px] text-fg-muted font-mono" title="Drag handle">⋮⋮</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {hours > 0 && (
                            <span className="text-[10px] bg-bg-dark px-1.5 py-0.5 rounded text-fg-secondary font-mono">
                              {hours}h
                            </span>
                          )}
                          {vel !== 0 && (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                                vel > 0
                                  ? 'bg-status-success/15 text-status-success'
                                  : 'bg-status-danger/15 text-status-danger'
                              }`}
                            >
                              ⚡{vel > 0 ? '+' : ''}{vel.toFixed(0)}
                            </span>
                          )}
                          <span className="text-[10px] text-fg-muted capitalize">{node.type}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
