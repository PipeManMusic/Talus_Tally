import React, { useState, useEffect, useRef } from 'react';
import { apiClient, type Node as NodeType } from '../../api/client';
import { AlertCircle } from 'lucide-react';

interface NodeData {
  id: string;
  label: string;
  x: number;
  y: number;
}

interface Edge {
  from: string;
  to: string;
}

interface Props {
  sessionId: string | null;
  nodes: Record<string, NodeType>;
}

export function NodeBlockingEditor({ sessionId, nodes }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodePositions, setNodePositions] = useState<NodeData[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [drawingWire, setDrawingWire] = useState<{ from: string; x: number; y: number } | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);

  // Initialize node positions
  useEffect(() => {
    const nodeIds = Object.keys(nodes);
    if (nodeIds.length === 0) return;

    const positions: NodeData[] = nodeIds.map((id, idx) => ({
      id,
      label: nodes[id].properties?.name || id,
      x: (idx % 5) * 220 + 50,
      y: Math.floor(idx / 5) * 140 + 50
    }));
    setNodePositions(positions);
  }, [nodes]);

  // Fetch existing relationships
  useEffect(() => {
    if (!sessionId) return;

    const fetchRelationships = async () => {
      try {
        const response = await apiClient.getBlockingGraph(sessionId);
        setEdges(response.relationships.map(r => ({
          from: r.blockingNodeId,
          to: r.blockedNodeId
        })));
      } catch (error) {
        console.error('Failed to fetch blocking relationships:', error);
      }
    };

    fetchRelationships();
  }, [sessionId]);

  const getNodePosition = (nodeId: string) => {
    return nodePositions.find(n => n.id === nodeId);
  };

  const handleNodeMouseDown = (nodeId: string, e: React.MouseEvent) => {
    if (e.button === 0) { // Left click
      setDraggingNode(nodeId);
      e.preventDefault();
    }
  };

  const handleNodeStartWire = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDrawingWire({ from: nodeId, x: 0, y: 0 });
  };

  const handleSVGMouseMove = (e: React.MouseEvent) => {
    if (!svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - pan.x) / scale;
    const y = (e.clientY - rect.top - pan.y) / scale;

    if (draggingNode) {
      setNodePositions(positions =>
        positions.map(n =>
          n.id === draggingNode
            ? { ...n, x: x - 60, y: y - 30 }
            : n
        )
      );
    }

    if (drawingWire) {
      setDrawingWire(w => w ? { ...w, x, y } : null);
    }

    if (isPanning) {
      const newX = pan.x + (e.clientX - rect.left - panStart.x);
      const newY = pan.y + (e.clientY - rect.top - panStart.y);
      setPan({ x: newX, y: newY });
      setPanStart({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  };

  const handleSVGMouseUp = () => {
    setDraggingNode(null);
    setIsPanning(false);
  };

  const handleNodeMouseEnter = (nodeId: string) => {
    if (!drawingWire) {
      setHoveredNode(nodeId);
    }
  };

  const handleNodeMouseLeave = () => {
    if (!drawingWire) {
      setHoveredNode(null);
    }
  };

  const handleNodeDrop = async (toNodeId: string) => {
    if (!drawingWire || !sessionId) return;

    const { from } = drawingWire;
    
    if (from === toNodeId) {
      setMessage({ type: 'error', text: 'A node cannot block itself' });
      setDrawingWire(null);
      return;
    }

    if (edges.some(e => e.from === from && e.to === toNodeId)) {
      setMessage({ type: 'error', text: 'This relationship already exists' });
      setDrawingWire(null);
      return;
    }

    try {
      await apiClient.updateBlockingRelationship(sessionId, toNodeId, from);
      setEdges([...edges, { from, to: toNodeId }]);
      setMessage({ type: 'success', text: 'Blocking relationship created' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to create relationship' });
    }

    setDrawingWire(null);
  };

  const handleEdgeClick = async (from: string, to: string) => {
    if (!sessionId) return;

    try {
      await apiClient.updateBlockingRelationship(sessionId, to, null);
      setEdges(edges.filter(e => !(e.from === from && e.to === to)));
      setMessage({ type: 'success', text: 'Relationship removed' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to remove relationship' });
    }
  };

  const handleSVGMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2 || e.ctrlKey || e.metaKey) { // Right click or Ctrl/Cmd for panning
      setIsPanning(true);
      const rect = svgRef.current!.getBoundingClientRect();
      setPanStart({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
      e.preventDefault();
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const newScale = Math.max(0.5, Math.min(3, scale - e.deltaY * 0.001));
    setScale(newScale);
  };

  if (!sessionId) {
    return (
      <div className="flex items-center justify-center h-full bg-bg-dark text-fg-secondary">
        <div className="text-center">
          <AlertCircle size={48} className="mx-auto mb-3 opacity-50" />
          <p>Please open a project to configure blocking relationships</p>
        </div>
      </div>
    );
  }

  const nodeSize = { width: 140, height: 70 };
  const edgeKey = (edge: Edge) => `${edge.from}-${edge.to}`;

  return (
    <div className="flex flex-col h-full bg-bg-dark">
      {/* Header */}
      <div className="p-4 border-b border-border bg-bg-light">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-fg-primary">Node Blocker Editor</h3>
            <p className="text-xs text-fg-secondary mt-1">Drag from blue circle → target node to create blocking relationship</p>
          </div>
          <div className="text-xs text-fg-secondary">
            {nodePositions.length} nodes • {edges.length} relationships
          </div>
        </div>
      </div>

      {message && (
        <div className={`mx-4 mt-3 p-2 rounded-md text-sm ${
          message.type === 'success' ? 'bg-status-success/20 text-status-success' : 'bg-status-danger/20 text-status-danger'
        }`}>
          {message.text}
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1 overflow-hidden relative bg-gradient-to-br from-bg-dark to-bg-light cursor-grab active:cursor-grabbing">
        <svg
          ref={svgRef}
          className="w-full h-full"
          onMouseMove={handleSVGMouseMove}
          onMouseUp={handleSVGMouseUp}
          onMouseDown={handleSVGMouseDown}
          onWheel={handleWheel}
          onContextMenu={(e) => e.preventDefault()}
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 10 3, 0 6" fill="#ef4444" />
            </marker>
            <marker
              id="arrowhead-hover"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 10 3, 0 6" fill="#dc2626" />
            </marker>
          </defs>

          {/* Background grid */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`} pointerEvents="none">
            <defs>
              <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#374151" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="5000" height="5000" fill="url(#grid)" />
          </g>

          {/* Draw edges */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
            {edges.map((edge) => {
              const fromNode = getNodePosition(edge.from);
              const toNode = getNodePosition(edge.to);
              if (!fromNode || !toNode) return null;

              const edgeId = edgeKey(edge);
              const isHovered = hoveredEdge === edgeId;

              const x1 = fromNode.x + nodeSize.width;
              const y1 = fromNode.y + nodeSize.height / 2;
              const x2 = toNode.x;
              const y2 = toNode.y + nodeSize.height / 2;

              // Quadratic bezier for curve
              const controlX = (x1 + x2) / 2;
              const controlY = (y1 + y2) / 2 - 40;
              const pathData = `M ${x1} ${y1} Q ${controlX} ${controlY} ${x2} ${y2}`;

              return (
                <g key={edgeId}>
                  <path
                    d={pathData}
                    fill="none"
                    stroke={isHovered ? '#dc2626' : '#ef4444'}
                    strokeWidth={isHovered ? '3' : '2'}
                    markerEnd={isHovered ? 'url(#arrowhead-hover)' : 'url(#arrowhead)'}
                    className="cursor-pointer transition-all"
                    onClick={() => handleEdgeClick(edge.from, edge.to)}
                    onMouseEnter={() => setHoveredEdge(edgeId)}
                    onMouseLeave={() => setHoveredEdge(null)}
                    opacity="0.7"
                    strokeDasharray="5,5"
                  />
                  <text
                    x={(x1 + x2) / 2}
                    y={(y1 + y2) / 2 - 50}
                    textAnchor="middle"
                    fontSize="12"
                    fill="#ef4444"
                    className="cursor-pointer pointer-events-none select-none"
                    fontWeight="600"
                  >
                    blocks
                  </text>
                </g>
              );
            })}

            {/* Draw wire being created */}
            {drawingWire && getNodePosition(drawingWire.from) && (
              <line
                x1={getNodePosition(drawingWire.from)!.x + nodeSize.width}
                y1={getNodePosition(drawingWire.from)!.y + nodeSize.height / 2}
                x2={drawingWire.x}
                y2={drawingWire.y}
                stroke="#3b82f6"
                strokeWidth="2"
                strokeDasharray="4,4"
                markerEnd="url(#arrowhead-hover)"
                pointerEvents="none"
              />
            )}

            {/* Draw nodes */}
            {nodePositions.map(nodeData => (
              <g key={nodeData.id}>
                <rect
                  x={nodeData.x}
                  y={nodeData.y}
                  width={nodeSize.width}
                  height={nodeSize.height}
                  rx="12"
                  fill={hoveredNode === nodeData.id ? '#1e3a8a' : '#1f2937'}
                  stroke={hoveredNode === nodeData.id || drawingWire?.from === nodeData.id ? '#3b82f6' : '#4b5563'}
                  strokeWidth="2"
                  className="cursor-move select-none transition-all"
                  onMouseDown={(e) => handleNodeMouseDown(nodeData.id, e)}
                  onMouseEnter={() => handleNodeMouseEnter(nodeData.id)}
                  onMouseLeave={handleNodeMouseLeave}
                />

                {/* Node label */}
                <text
                  x={nodeData.x + nodeSize.width / 2}
                  y={nodeData.y + nodeSize.height / 2 + 6}
                  textAnchor="middle"
                  fontSize="13"
                  fontWeight="600"
                  className="pointer-events-none select-none"
                  fill="#e5e7eb"
                >
                  {nodeData.label.length > 14 ? nodeData.label.substring(0, 12) + '...' : nodeData.label}
                </text>

                {/* Output handle (wire start) */}
                <circle
                  cx={nodeData.x + nodeSize.width}
                  cy={nodeData.y + nodeSize.height / 2}
                  r="7"
                  fill="#3b82f6"
                  stroke="#1e40af"
                  strokeWidth="1"
                  className="cursor-crosshair hover:opacity-90 transition-opacity"
                  onMouseDown={(e) => handleNodeStartWire(nodeData.id, e)}
                />

                {/* Input handle (wire end) */}
                <circle
                  cx={nodeData.x}
                  cy={nodeData.y + nodeSize.height / 2}
                  r="7"
                  fill={hoveredNode === nodeData.id && drawingWire ? '#10b981' : '#6b7280'}
                  stroke={hoveredNode === nodeData.id && drawingWire ? '#059669' : '#4b5563'}
                  strokeWidth="2"
                  className="cursor-crosshair transition-all"
                  onMouseUp={() => drawingWire && handleNodeDrop(nodeData.id)}
                  onMouseEnter={() => {
                    if (drawingWire) handleNodeMouseEnter(nodeData.id);
                  }}
                />
              </g>
            ))}
          </g>
        </svg>
      </div>

      {/* Footer Controls */}
      <div className="p-4 border-t border-border bg-bg-light text-xs text-fg-secondary space-y-2">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="font-semibold text-fg-primary mb-1">Map Controls</p>
            <ul className="space-y-0.5">
              <li><span className="font-mono">Left Drag:</span> Move nodes</li>
              <li><span className="font-mono">Right Drag:</span> Pan canvas</li>
              <li><span className="font-mono">Scroll:</span> Zoom in/out</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-fg-primary mb-1">Wire Controls</p>
            <ul className="space-y-0.5">
              <li><span className="font-mono">Blue Circle:</span> Start connection</li>
              <li><span className="font-mono">Drag to Node:</span> Create relationship</li>
              <li><span className="font-mono">Click Line:</span> Delete relationship</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
