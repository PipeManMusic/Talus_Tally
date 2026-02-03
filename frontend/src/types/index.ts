// Graph Node Types
export interface GraphNode {
  id: string;
  name: string;
  type: 'input' | 'output' | 'processing' | 'decision' | 'data';
  position: { x: number; y: number };
  inputs: Array<{ name: string; type: string }>;
  outputs: Array<{ name: string; type: string }>;
  properties?: Record<string, any>;
}

// React Flow Node Types
export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    label: string;
    nodeType: GraphNode['type'];
    inputs: GraphNode['inputs'];
    outputs: GraphNode['outputs'];
  };
}

// React Flow Edge Types
export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

// Graph State Types
export interface GraphState {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

// API Response Types
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// WebSocket Message Types
export interface WebSocketMessage {
  type: 'node_created' | 'node_updated' | 'node_deleted' | 'edge_created' | 'edge_deleted';
  payload: any;
  timestamp: number;
}
