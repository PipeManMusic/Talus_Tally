import React, { useCallback, useEffect } from 'react';
import { mapNodeIndicator } from './mapNodeIndicator';
import ReactFlow, {
  type Node,
  addEdge,
  type Connection,
  useNodesState,
  useEdgesState,
  Panel,
  Background,
  Controls,
  MiniMap,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useGraphStore } from '@/store';
import { useGraphAPI } from '@/hooks';
import { LoadingSpinner, Alert } from '@/components';
import CustomNode from './CustomNode';
import '@/styles/graph.css';
import { apiClient } from '@/api/client';
import { normalizeGraph } from '@/utils/graph';

// Define nodeTypes outside component to prevent recreation warnings
const nodeTypes = {
  custom: CustomNode,
};

interface GraphCanvasProps {
  width?: string | number;
  height?: string | number;
  showMinimap?: boolean;
  showControls?: boolean;
  graphId?: string;
  onSave?: () => void;
}

export default function GraphCanvas({
  width = '100%',
  height = '100%',
  showMinimap = true,
  showControls = true,
  graphId,
  onSave,
}: GraphCanvasProps) {
  const { currentGraph, nodes: storeNodes, selectedNodeId, selectNode, setCurrentGraph } = useGraphStore();
  const { loading, error, saving, loadGraph, saveGraph, clearError } = useGraphAPI();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Sync store nodes to React Flow nodes
  useEffect(() => {
    const nodeList = Object.values(storeNodes || {}) as any[];
    // Create a stable signature of all node data to trigger effect on any content change
    const nodeSignature = JSON.stringify(
      nodeList.map(n => ({
        id: n.id,
        indicator_id: n.indicator_id,
        indicator_set: n.indicator_set,
        status: n.properties?.status,
        type: n.type,
        name: n.properties?.name,
        // Add more fields if needed for reactivity
      }))
    );
    Promise.all(
      nodeList.map(async (node) => {
        const nodeWithIndicator = await mapNodeIndicator(node);
        return {
          id: node.id,
          data: { label: node.properties?.name || node.type, nodeData: nodeWithIndicator },
          position: node.properties?.position || { x: 0, y: 0 },
          type: 'custom',
          selected: node.id === selectedNodeId,
          style: {
            borderColor: node.id === selectedNodeId ? '#e63946' : '#a8dadc',
          },
        };
      })
    ).then(setNodes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, setNodes]); // nodeSignature is implicitly tracked via storeNodes changes

  // Sync store edges to React Flow edges
  useEffect(() => {
    const storeEdges = (currentGraph as any)?.edges || [];
    const flowEdges = storeEdges.map((edge: any) => ({
      id: `${edge.from}-${edge.to}`,
      source: edge.from,
      target: edge.to,
      animated: true,
    }));
    setEdges(flowEdges);
  }, [currentGraph, setEdges]);

  // Handle new connections (edges)
  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        setEdges((eds) => addEdge(connection, eds));
      }
    },
    [setEdges]
  );

  // Handle node selection
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      selectNode(node.id);
    },
    [selectNode]
  );

  const applyGraphUpdate = useCallback((result: any) => {
    const graph = normalizeGraph(result.graph ?? result);
    setCurrentGraph(graph);
  }, [setCurrentGraph]);

  const getSessionId = useCallback(() => localStorage.getItem('talus_tally_session_id'), []);

  // Handle node drag end
  const handleNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const graphNode = (storeNodes || {})[node.id] as any;
      const sessionId = getSessionId();
      if (!sessionId || !graphNode) {
        return;
      }

      apiClient
        .executeCommand(sessionId, 'UpdateProperty', {
          node_id: node.id,
          property_id: 'position',
          old_value: graphNode.properties?.position ?? null,
          new_value: node.position,
        })
        .then((result) => applyGraphUpdate(result))
        .catch((err) => {
          console.error('Failed to persist node position:', err);
        });
    },
    [storeNodes, getSessionId, applyGraphUpdate]
  );

  // Note: Node selection is now handled in the main sync effect above

  // Load graph from API if graphId is provided
  useEffect(() => {
    if (graphId) {
      loadGraph(graphId).catch((err) => {
        console.error('Failed to load graph:', err);
      });
    }
  }, [graphId, loadGraph]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (graphId) {
          saveGraph(graphId).then(() => {
            if (onSave) onSave();
          }).catch((err) => {
            console.error('Failed to save graph:', err);
          });
        }
      }

      // Delete key to remove selected nodes
      if (e.key === 'Delete') {
        e.preventDefault();
        const sessionId = getSessionId();
        if (!sessionId) {
          console.warn('[GraphCanvas] No session, cannot delete nodes via API');
          return;
        }
        const selectedNodes = nodes.filter((n) => n.selected);
        selectedNodes.forEach((node) => {
          apiClient
            .executeCommand(sessionId, 'DeleteNode', {
              node_id: node.id,
            })
            .then((result) => applyGraphUpdate(result))
            .catch((err) => {
              console.error('Failed to delete node via API:', err);
            });
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, storeNodes, graphId, saveGraph, onSave]);

  // Debug: Log nodes before rendering ReactFlow
  console.log('[GraphCanvas] nodes:', nodes);
  return (
    <div className="graph-canvas-container" style={{ width, height }}>
      {/* Loading State */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-dark bg-opacity-75 z-50">
          <LoadingSpinner size="lg" label="Loading graph..." />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 w-96">
          <Alert variant="error" message={error} onClose={clearError} />
        </div>
      )}

      {/* Saving Indicator */}
      {saving && (
        <div className="absolute top-4 right-4 z-50">
          <div className="bg-bg-darker border border-border rounded-lg px-4 py-2 flex items-center gap-2">
            <LoadingSpinner size="sm" />
            <span className="text-sm text-fg-secondary">Saving...</span>
          </div>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onNodeDragStop={handleNodeDragStop}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background color="#aaa" gap={16} size={0.5} />
        {showControls && <Controls />}
        {showMinimap && <MiniMap />}

        <Panel position="top-left" className="graph-info-panel">
          <div className="text-xs text-gray-400">
            {(currentGraph as any)?.name || 'Graph Canvas'} • {Object.keys(storeNodes || {}).length} nodes
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
