import { useState, useEffect } from 'react';
import { VelocityView } from '../components/velocity/VelocityView';
import { NodeBlockingEditor } from '../components/velocity/NodeBlockingEditor';
import { BudgetView } from '../components/tools/BudgetView';
import { GanttView } from '../components/tools/GanttView';
import { ManpowerView } from '../components/tools/ManpowerView';
import { ChartsView } from '../components/tools/ChartsView';
import { AgileView } from '../components/tools/AgileView';
import { apiClient, type Node, type TemplateSchema, type VelocityScore } from '../api/client';

export type ToolsTab = 'velocity' | 'blocking' | 'budget' | 'gantt' | 'manpower' | 'charts' | 'agile';

interface ToolsViewProps {
  sessionId?: string | null;
  nodes?: Record<string, Node>;
  selectedNodeId?: string | null;
  onNodeSelect?: (nodeId: string | null) => void;
  onNodePropertyChange?: (args: {
    nodeId: string;
    propertyId: string;
    oldValue: unknown;
    newValue: unknown;
  }) => Promise<void>;
  activeTab?: ToolsTab;
  onBlockingCountsChange?: (nodeCount: number, edgeCount: number) => void;
  onBlockingDirtyChange?: (isDirty: boolean) => void;
  onBlockingRelationshipsChange?: () => void;
  blockingFitToViewSignal?: number;
  blockingRefreshSignal?: number;
  ganttRefreshSignal?: number;
  onGanttGraphChanged?: (result: { graph?: any; is_dirty?: boolean }) => void;
  blockingViewConfig?: TemplateSchema['blocking_view'];
  templateSchema?: TemplateSchema | null;
  onManpowerOverloadChange?: (count: number) => void;
}

export function ToolsView({ 
  sessionId, 
  nodes = {}, 
  selectedNodeId,
  onNodeSelect,
  onNodePropertyChange,
  activeTab = 'velocity',
  onBlockingCountsChange,
  onBlockingDirtyChange,
  onBlockingRelationshipsChange,
  blockingFitToViewSignal,
  blockingRefreshSignal,
  ganttRefreshSignal,
  onGanttGraphChanged,
  blockingViewConfig,
  templateSchema,
  onManpowerOverloadChange,
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
  }, [sessionId, ganttRefreshSignal]);

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
            refreshSignal={ganttRefreshSignal}
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
            onRelationshipsChange={onBlockingRelationshipsChange}
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
            templateSchema={templateSchema}
            refreshSignal={ganttRefreshSignal}
          />
        )}
        {activeTab === 'gantt' && (
          <GanttView
            sessionId={sessionId || null}
            nodes={nodes}
            velocityScores={velocityScores}
            refreshSignal={ganttRefreshSignal}
            selectedNodeId={selectedNodeId}
            onNodeSelect={onNodeSelect}
            onGraphChanged={onGanttGraphChanged}
            templateSchema={templateSchema}
          />
        )}
        {activeTab === 'manpower' && (
          <ManpowerView
            sessionId={sessionId || null}
            nodes={nodes}
            velocityScores={velocityScores}
            refreshSignal={ganttRefreshSignal}
            selectedNodeId={selectedNodeId}
            onNodeSelect={onNodeSelect}
            onOverloadChange={onManpowerOverloadChange}
            onDirtyChange={onBlockingDirtyChange}
            templateSchema={templateSchema}
          />
        )}
        {activeTab === 'charts' && (
          <ChartsView
            nodes={nodes}
            velocityScores={velocityScores}
            templateSchema={templateSchema}
          />
        )}
        {activeTab === 'agile' && (
          <AgileView
            nodes={nodes}
            velocityScores={velocityScores}
            templateSchema={templateSchema}
            sessionId={sessionId}
            selectedNodeId={selectedNodeId}
            onNodeSelect={onNodeSelect}
            onNodePropertyChange={onNodePropertyChange}
          />
        )}
      </div>
    </div>
  );
}
