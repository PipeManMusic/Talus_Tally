import { useState, useEffect } from 'react';
import { VelocityView } from '../components/velocity/VelocityView';
import { NodeBlockingEditor } from '../components/velocity/NodeBlockingEditor';
import { type Node, type TemplateSchema } from '../api/client';

export type ToolsTab = 'velocity' | 'blocking';

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

  // Notify parent when selected node changes
  useEffect(() => {
    onNodeSelect?.(selectedNodeId);
  }, [selectedNodeId, onNodeSelect]);

  return (
    <div className="flex flex-col h-full bg-bg-dark text-fg-primary">
      {/* No header - tabs are in toolbar, just show content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'velocity' ? (
          <VelocityView
            sessionId={sessionId || null}
            nodes={nodes}
            onNodeSelect={setSelectedNodeId}
          />
        ) : (
          <NodeBlockingEditor
            sessionId={sessionId || null}
            nodes={nodes}
            onNodeSelect={setSelectedNodeId}
            onCountsChange={onBlockingCountsChange}
            onDirtyChange={onBlockingDirtyChange}
            fitToViewSignal={blockingFitToViewSignal}
            refreshSignal={blockingRefreshSignal}
            blockingViewConfig={blockingViewConfig}
            templateSchema={templateSchema}
          />
        )}
      </div>
    </div>
  );
}
