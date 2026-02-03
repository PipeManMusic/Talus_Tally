import { io, Socket } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || API_URL;
export const API_BASE_URL = API_URL;

// Detect if running in Tauri
let isTauri = false;
try {
  isTauri = !!(window as any).__TAURI__;
} catch {
  isTauri = false;
}

export interface Session {
  session_id?: string;
  id?: string;
  createdAt?: number;
  lastActivity?: number;
}

export interface Node {
  id: string;
  type: string;
  properties: Record<string, any>;
  children: string[]; // IDs of child nodes
  indicator_id?: string;
  indicator_set?: string;
  statusIndicatorSvg?: string;
  statusText?: string;
}

export interface Graph {
  id: string;
  nodes: Node[];
  edges: Array<{ source: string; target: string }>;
}

export interface Template {
  id: string;
  name: string;
  description: string;
}

export interface NodeTypeSchema {
  id: string;
  name: string;
  allowed_children: string[];
  properties: Array<{
    id: string;
    name: string;
    type: string;
    required: boolean;
    options?: Array<{
      id: string;
      name: string;
      indicator_id?: string;
    }>;
  }>;
}

export interface TemplateSchema {
  id: string;
  name: string;
  description: string;
  node_types: NodeTypeSchema[];
}

export interface ProjectResponse {
  project_id: string;
  session_id: string;
  graph: Graph;
}

export class APIClient {
  private baseUrl: string;
  private socket: Socket | null = null;

  constructor(baseUrl: string = API_URL) {
    this.baseUrl = baseUrl;
  }

  // Check backend readiness (especially for Tauri)
  async waitForBackend(maxRetries: number = 30, retryDelayMs: number = 200): Promise<boolean> {
    if (!isTauri) {
      // In browser mode, assume backend is ready
      return true;
    }

    // In Tauri mode, wait for backend health check
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(`${this.baseUrl}/api/v1/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(1000),
        });
        if (response.ok) {
          return true;
        }
      } catch {
        // Backend not ready yet
      }
      
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      }
    }

    console.warn('Backend did not become ready within timeout');
    return false;
  }

  // Session Management
  async createSession(): Promise<Session> {
    const response = await fetch(`${this.baseUrl}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return response.json();
  }

  async getSessionInfo(sessionId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/v1/sessions/${sessionId}/info`);
    if (!response.ok) {
      throw new Error('Session not found');
    }
    return response.json();
  }

  async getSessionGraph(sessionId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/v1/sessions/${sessionId}/graph`);
    if (!response.ok) {
      throw new Error('No graph in session');
    }
    return response.json();
  }

  async getSession(id: string): Promise<Session> {
    const response = await fetch(`${this.baseUrl}/api/v1/sessions/${id}`);
    return response.json();
  }

  // Node Management
  async createNode(nodeData: Partial<Node>): Promise<Node> {
    const response = await fetch(`${this.baseUrl}/api/v1/nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nodeData),
    });
    return response.json();
  }

  async updateNode(id: string, data: Partial<Node>): Promise<Node> {
    const response = await fetch(`${this.baseUrl}/api/v1/nodes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  }

  async deleteNode(id: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/v1/nodes/${id}`, {
      method: 'DELETE',
    });
  }

  async getNode(id: string): Promise<Node> {
    const response = await fetch(`${this.baseUrl}/api/v1/nodes/${id}`);
    return response.json();
  }

  // Graph Management
  async getGraph(id: string): Promise<Graph> {
    const response = await fetch(`${this.baseUrl}/api/v1/graphs/${id}`);
    return response.json();
  }

  async saveGraph(id: string, graph: Graph): Promise<Graph> {
    const response = await fetch(`${this.baseUrl}/api/v1/graphs/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(graph),
    });
    return response.json();
  }

  // Template Management
  async listTemplates(): Promise<Template[]> {
    const response = await fetch(`${this.baseUrl}/api/v1/templates`);
    const data = await response.json();
    return data.templates || [];
  }

  async getTemplateSchema(templateId: string): Promise<TemplateSchema> {
    const response = await fetch(`${this.baseUrl}/api/v1/templates/${templateId}/schema`);
    return response.json();
  }

  // Project Management
  async createProject(templateId: string, projectName: string): Promise<ProjectResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_id: templateId, project_name: projectName }),
    });
    return response.json();
  }

  // Dirty State Management
  async checkDirtyState(sessionId: string): Promise<{ session_id: string; is_dirty: boolean }> {
    const response = await fetch(`${this.baseUrl}/api/v1/sessions/${sessionId}/dirty`);
    if (!response.ok) {
      throw new Error('Failed to check dirty state');
    }
    return response.json();
  }

  async saveSession(sessionId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/v1/sessions/${sessionId}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      throw new Error('Failed to save session');
    }
    return response.json();
  }

  async resetDirtyState(sessionId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/v1/sessions/${sessionId}/reset-dirty`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      throw new Error('Failed to reset dirty state');
    }
    return response.json();
  }

  // Command Execution
  async executeCommand(sessionId: string, commandType: string, data: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/v1/commands/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, command_type: commandType, data }),
    });
    return response.json();
  }

  async undo(sessionId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/v1/sessions/${sessionId}/undo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return response.json();
  }

  async redo(sessionId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/v1/sessions/${sessionId}/redo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return response.json();
  }

  // WebSocket Connection
  connectSocket(callbacks: {
    onConnect?: () => void;
    onNodeCreated?: (data: any) => void;
    onNodeUpdated?: (data: any) => void;
    onNodeDeleted?: (data: any) => void;
    onDisconnect?: () => void;
  }): Socket {
    // Reuse existing socket if already connected
    if (this.socket && this.socket.connected) {
      return this.socket;
    }

    // Disconnect old socket if it exists but is not connected
    if (this.socket) {
      this.socket.disconnect();
    }

    this.socket = io(SOCKET_URL);

    if (callbacks.onConnect) {
      this.socket.on('connect', callbacks.onConnect);
    }

    if (callbacks.onNodeCreated) {
      this.socket.on('node:created', callbacks.onNodeCreated);
    }

    if (callbacks.onNodeUpdated) {
      this.socket.on('node:updated', callbacks.onNodeUpdated);
    }

    if (callbacks.onNodeDeleted) {
      this.socket.on('node:deleted', callbacks.onNodeDeleted);
    }

    if (callbacks.onDisconnect) {
      this.socket.on('disconnect', callbacks.onDisconnect);
    }

    return this.socket;
  }

  disconnectSocket(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getSocket(): Socket | null {
    return this.socket;
  }
}

export const apiClient = new APIClient();
