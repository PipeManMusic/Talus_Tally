import { useState, useEffect } from 'react';
import { VelocityView } from '../components/velocity/VelocityView';
import { NodeBlockingEditor } from '../components/velocity/NodeBlockingEditor';
import { BudgetView } from '../components/tools/BudgetView';
import { GanttView } from '../components/tools/GanttView';
import { ChartsView } from '../components/tools/ChartsView';
import { apiClient, type Node, type TemplateSchema, type VelocityScore } from '../api/client';

export type ToolsTab = 'velocity' | 'blocking' | 'budget' | 'gantt' | 'charts';

interface ToolsViewProps {
  sessionId?: string | null;
  nodes?: Record<string, Node>;
  selectedNodeId?: string | null;
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
  selectedNodeId,
  onNodeSelect,
  activeTab = 'velocity',
  onBlockingCountsChange,
  onBlockingDirtyChange,
  blockingFitToViewSignal,
  blockingRefreshSignal,
  blockingViewConfig,
  templateSchema,
}: ToolsViewProps) {
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

  return (
    <div className="flex flex-col h-full bg-bg-dark text-fg-primary">
      {/* View Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'velocity' && (
          <VelocityView
            sessionId={sessionId || null}
            nodes={nodes}
            selectedNodeId={selectedNodeId}
            onNodeSelect={onNodeSelect}
          />
        )}
        {activeTab === 'blocking' && (
          <NodeBlockingEditor
            sessionId={sessionId || null}
            nodes={nodes}
            velocityScores={velocityScores}
            selectedNodeId={selectedNodeId}
            onNodeSelect={onNodeSelect}
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
            selectedNodeId={selectedNodeId}
            onNodeSelect={onNodeSelect}
          />
        )}
        {activeTab === 'gantt' && (
          <GanttView
            sessionId={sessionId || null}
            nodes={nodes}
            velocityScores={velocityScores}
            selectedNodeId={selectedNodeId}
            onNodeSelect={onNodeSelect}
          />
        )}
        {activeTab === 'charts' && (
          <ChartsView
            nodes={nodes}
            velocityScores={velocityScores}
            templateSchema={templateSchema}
          />
        )}
      </div>
    </div>
  );
}
