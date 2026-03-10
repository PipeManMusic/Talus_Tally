import { useState, useEffect } from 'react';
import { VelocityView } from '../components/velocity/VelocityView';
import { NodeBlockingEditor } from '../components/velocity/NodeBlockingEditor';
import { BudgetView } from '../components/tools/BudgetView';
import { GanttView } from '../components/tools/GanttView';
import { apiClient, type Node, type TemplateSchema, type VelocityScore } from '../api/client';

export type ToolsTab = 'velocity' | 'blocking' | 'budget' | 'gantt';

interface ToolsViewProps {
  sessionId?: string | null;
  nodes?: Record<string, Node>;
  onNodeSelect?: (nodeId: string | null) => void;
  activeTab?: ToolsTab;
  onBlockingCountsChange?: (nodeCount: number, edgeCount: number) => void;
  onBlockingDirtyChange?: (isDirty: boolean) => void;
  blockingFitToViewSignal?: number;
  blockingRefreshSignal?: number;
  blockingViewConfig?: TemplateSchema['blocking_view'];
  templateSchema?: TemplateSchema | null;
}

export function ToolsView({ 
  sessionId, 
  nodes = {}, 
  onNodeSelect,
  activeTab = 'velocity',
  onBlockingCountsChange,
  onBlockingDirtyChange,
  blockingFitToViewSignal,
  blockingRefreshSignal,
  blockingViewConfig,
  templateSchema,
}: ToolsViewProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [velocityScores, setVelocityScores] = useState<Record<string, VelocityScore>>({});

  // Fetch velocity scores for filtering
  useEffect(() => {
    if (!sessionId) {
      setVelocityScores({});
      return;
    }

    const fetchVelocity = async () => {
      try {
        const result = await apiClient.getVelocityRanking(sessionId);
        const scoresMap: Record<string, VelocityScore> = {};
        result.nodes.forEach((score) => {
          scoresMap[score.nodeId] = {
            nodeId: score.nodeId,
            baseScore: score.baseScore,
            inheritedScore: score.inheritedScore,
            statusScore: score.statusScore,
            numericalScore: score.numericalScore,
            blockingPenalty: score.blockingPenalty,
            blockingBonus: score.blockingBonus,
            totalVelocity: score.totalVelocity,
            isBlocked: score.isBlocked,
            blockedByNodes: score.blockedByNodes,
            blocksNodeIds: score.blocksNodeIds,
          };
        });
        setVelocityScores(scoresMap);
      } catch (err) {
        console.error('Failed to fetch velocity scores:', err);
      }
    };

    fetchVelocity();
  }, [sessionId]);

  // Notify parent when selected node changes
  useEffect(() => {
    onNodeSelect?.(selectedNodeId);
  }, [selectedNodeId, onNodeSelect]);

  return (
    <div className="flex flex-col h-full bg-bg-dark text-fg-primary">
      {/* View Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'velocity' && (
          <VelocityView
            sessionId={sessionId || null}
            nodes={nodes}
            onNodeSelect={setSelectedNodeId}
          />
        )}
        {activeTab === 'blocking' && (
          <NodeBlockingEditor
            sessionId={sessionId || null}
            nodes={nodes}
            velocityScores={velocityScores}
            onNodeSelect={setSelectedNodeId}
            onCountsChange={onBlockingCountsChange}
            onDirtyChange={onBlockingDirtyChange}
            fitToViewSignal={blockingFitToViewSignal}
            refreshSignal={blockingRefreshSignal}
            blockingViewConfig={blockingViewConfig}
            templateSchema={templateSchema}
          />
        )}
        {activeTab === 'budget' && (
          <BudgetView
            sessionId={sessionId || null}
            nodes={nodes}
            velocityScores={velocityScores}
            onNodeSelect={setSelectedNodeId}
          />
        )}
        {activeTab === 'gantt' && (
          <GanttView
            sessionId={sessionId || null}
            nodes={nodes}
            velocityScores={velocityScores}
            onNodeSelect={setSelectedNodeId}
          />
        )}
      </div>
    </div>
  );
}
