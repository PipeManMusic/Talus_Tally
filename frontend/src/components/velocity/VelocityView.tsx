import { useState, useEffect, useCallback, useRef } from 'react';
import { AlertCircle, TrendingUp, Lock, Zap } from 'lucide-react';
import { apiClient, type VelocityRanking, type VelocityScore } from '../../api/client';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useFilterStore } from '../../store/filterStore';
import { evaluateNodeVisibility } from '../../utils/filterEngine';

interface VelocityViewProps {
  sessionId: string | null;
  nodes?: Record<string, any>;
  selectedNodeId?: string | null;
  onNodeSelect?: (nodeId: string | null) => void;
}

export function VelocityView({ sessionId, nodes = {}, selectedNodeId, onNodeSelect }: VelocityViewProps) {
  const [ranking, setRanking] = useState<(VelocityScore & { nodeName: string; nodeType: string })[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshPendingRef = useRef(false);
  const refreshingRef = useRef(false);
  const { rules, filterMode } = useFilterStore();

  const fetchRanking = useCallback(async () => {
    if (!sessionId) return;
    if (refreshingRef.current) {
      refreshPendingRef.current = true;
      return;
    }

    refreshingRef.current = true;
    try {
      setLoading(true);
      setError(null);
      const result = await apiClient.getVelocityRanking(sessionId);
      setRanking(result.nodes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load velocity ranking');
      console.error('Error loading velocity ranking:', err);
    } finally {
      setLoading(false);
      refreshingRef.current = false;
      if (refreshPendingRef.current) {
        refreshPendingRef.current = false;
        fetchRanking();
      }
    }
  }, [sessionId]);

  useEffect(() => {
    fetchRanking();
  }, [fetchRanking]);

  useWebSocket({
    onNodeCreated: fetchRanking,
    onNodeUpdated: fetchRanking,
    onNodeDeleted: fetchRanking,
  });

  const displayNodes = useCallback(() => {
    const rankingById = new Map(ranking.map((node) => [node.nodeId, node]));
    const sourceNodes = Object.values(nodes || {});

    if (sourceNodes.length === 0) {
      return ranking;
    }

    const merged = sourceNodes
      .filter((node: any) => node?.type !== 'project' && node?.type !== 'project_root')
      .map((node: any) => {
        const rankedNode = rankingById.get(node.id);
        return {
          nodeId: node.id,
          nodeName: node.properties?.name || node.name || node.id,
          nodeType: node.type || 'unknown',
          baseScore: rankedNode?.baseScore ?? 0,
          inheritedScore: rankedNode?.inheritedScore ?? 0,
          statusScore: rankedNode?.statusScore ?? 0,
          numericalScore: rankedNode?.numericalScore ?? 0,
          blockingPenalty: rankedNode?.blockingPenalty ?? 0,
          blockingBonus: rankedNode?.blockingBonus ?? 0,
          totalVelocity: rankedNode?.totalVelocity ?? 0,
          isBlocked: rankedNode?.isBlocked ?? false,
          blockedByNodes: rankedNode?.blockedByNodes ?? [],
          blocksNodeIds: rankedNode?.blocksNodeIds ?? [],
        };
      });

    merged.sort((left, right) => right.totalVelocity - left.totalVelocity || left.nodeName.localeCompare(right.nodeName));
    return merged;
  }, [nodes, ranking]);

  const visibleRanking = displayNodes();

  if (!sessionId) {
    return (
      <div className="flex-1 flex items-center justify-center text-fg-secondary bg-bg-dark">
        <div className="text-center">
          <div className="text-lg mb-2">No project loaded</div>
          <div className="text-sm">Load a project to see velocity rankings</div>
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
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-fg-secondary">Loading velocity ranking...</div>
        </div>
      )}

      {/* Velocity List */}
      {!loading && visibleRanking.length > 0 && (
        <div className="flex-1 overflow-auto">
          <div className="space-y-0">
            {visibleRanking.map((node, index) => {
              const storeNode = nodes[node.nodeId];
              const filterNode = {
                id: node.nodeId,
                name: node.nodeName,
                type: node.nodeType,
                properties: storeNode?.properties || {},
                // Include velocity data for filtering
                velocity: {
                  totalVelocity: node.totalVelocity,
                  isBlocked: node.isBlocked,
                  blocksNodeIds: node.blocksNodeIds,
                  blockedByNodes: node.blockedByNodes,
                },
              };
              const passes = evaluateNodeVisibility(filterNode, rules);
              if (!passes && filterMode === 'hide') return null;
              return (
              <div
                key={node.nodeId}
                onClick={() => onNodeSelect?.(node.nodeId)}
                className={`border-b border-border transition-colors cursor-pointer${!passes ? ' opacity-30' : ''}${selectedNodeId === node.nodeId ? ' bg-accent-primary/20 border-accent-primary/50 ring-1 ring-inset ring-accent-primary/40' : ' hover:bg-bg-light'}`}
              >
                <div className="px-6 py-4">
                  {/* Rank and Title */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-accent-primary text-fg-primary font-bold text-sm">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-fg-primary">{node.nodeName}</div>
                        <div className="text-xs text-fg-secondary">{node.nodeType}</div>
                      </div>
                    </div>

                    {/* Main Velocity Score */}
                    <div className="text-right">
                      <div className="text-2xl font-bold text-accent-primary">
                        {node.totalVelocity.toFixed(0)}
                      </div>
                      <div className="text-xs text-fg-secondary">velocity</div>
                    </div>
                  </div>

                  {/* Score Breakdown */}
                  <div className="grid grid-cols-4 gap-3 text-xs">
                    <div className="bg-bg-dark p-2 rounded">
                      <div className="text-fg-secondary">Base</div>
                      <div className="font-semibold text-fg-primary">+{node.baseScore.toFixed(0)}</div>
                    </div>
                    <div className="bg-bg-dark p-2 rounded">
                      <div className="text-fg-secondary">Inherited</div>
                      <div className="font-semibold text-fg-primary">+{node.inheritedScore.toFixed(0)}</div>
                    </div>
                    <div className="bg-bg-dark p-2 rounded">
                      <div className="text-fg-secondary">Status</div>
                      <div className="font-semibold text-fg-primary">+{node.statusScore.toFixed(0)}</div>
                    </div>
                    <div className="bg-bg-dark p-2 rounded">
                      <div className="text-fg-secondary">Numerical</div>
                      <div className="font-semibold text-fg-primary">+{node.numericalScore.toFixed(0)}</div>
                    </div>
                  </div>
                  {(node.blockingBonus !== 0 || node.blockingPenalty !== 0) && (
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      {node.blockingBonus !== 0 && (
                        <div className="bg-bg-dark px-2 py-1 rounded text-fg-primary">
                          Blocking Bonus: +{node.blockingBonus.toFixed(0)}
                        </div>
                      )}
                      {node.blockingPenalty !== 0 && (
                        <div className="bg-bg-dark px-2 py-1 rounded text-fg-primary">
                          Blocking Penalty: {node.blockingPenalty.toFixed(0)}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Status Indicators */}
                  {(node.isBlocked || (node.blockedByNodes && node.blockedByNodes.length > 0)) && (
                    <div className="mt-3 pt-3 border-t border-border">
                      {node.isBlocked && (
                        <div className="flex items-center gap-2 text-status-danger text-xs mb-2">
                          <Lock size={14} />
                          <span>Blocked by {node.blockedByNodes?.length || 0} node(s)</span>
                        </div>
                      )}
                      {node.blocksNodeIds && node.blocksNodeIds.length > 0 && (
                        <div className="flex items-center gap-2 text-accent-primary text-xs">
                          <Zap size={14} />
                          <span>Blocking {node.blocksNodeIds.length} node(s)</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && visibleRanking.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-fg-secondary">
            <TrendingUp size={48} className="mx-auto mb-3 opacity-30" />
            <div className="text-sm">No nodes in project</div>
          </div>
        </div>
      )}

      {/* Legend */}
      {visibleRanking.length > 0 && (
        <div className="border-t border-border px-6 py-3 bg-bg-light text-xs text-fg-secondary">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <strong>Score Components:</strong>
              <div className="mt-1 space-y-1">
                <div>• Base: Fixed points from node type</div>
                <div>• Inherited: Cumulative parent scores</div>
                <div>• Status: Points from current status</div>
                <div>• Numerical: Value × multiplier</div>
              </div>
            </div>
            <div>
              <strong>Blocking Logic:</strong>
              <div className="mt-1 space-y-1">
                <div>• Blocked nodes score is zeroed</div>
                <div>• Blocking node gains blocked scores</div>
                <div>• Floats important tasks to top</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
