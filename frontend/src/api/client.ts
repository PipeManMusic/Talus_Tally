export interface Template {
  id: string;
  uuid?: string;
  name: string;
  description: string;
}

export interface Graph {
  id: string;
  nodes: Node[];
  edges: Array<{ source: string; target: string }>;
}
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
  icon_id?: string;
  schema_shape?: string;
  schema_color?: string;
  allowed_children?: string[]; // From backend schema enrichment
  parent_id?: string;
  metadata?: {
    orphaned?: boolean;
    orphaned_properties?: Record<string, any>;
    [key: string]: any;
  };
}

export interface CsvColumnMapping {
  header: string;
  property_id: string;
}

export interface CsvImportRowError {
  row_number: number;
  messages: string[];
}

export interface CsvImportResult {
  success: boolean;
  created_count: number;
  created_node_ids: string[];
  graph: Graph;
  undo_available: boolean;
  redo_available: boolean;
}

export interface CsvImportError extends Error {
  code?: string;
  rowErrors?: CsvImportRowError[];
  status?: number;
}

export interface NodeTypeSchema {
  id: string;
  name: string;
  allowed_children: string[];
  allowed_asset_types?: string[];
  icon?: string;
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
    markup_profile?: string;
    markup_tokens?: Array<{
      id: string;
      label: string;
      prefix?: string;
      pattern?: string;
      [k: string]: any;
    }>;
    indicator_set?: string;
    description?: string;
    [k: string]: any;
  }>;
}

export interface TemplateSchema {
  id: string;
  uuid?: string;
  name: string;
  description: string;
  node_types: NodeTypeSchema[];
  blocking_view?: {
    node_size?: {
      base_width?: number;
      base_height?: number;
      max_depth?: number;
      min_scale?: number;
      max_scale?: number;
      direction?: 'up' | 'down';
    };
  };
}

export interface ProjectResponse {
  project_id: string;
  session_id: string;
  graph: Graph;
}

export interface IconCatalog {
  id: string;
  file: string;
  description: string;
  url?: string;
}

export interface MarkupProfileListItem {
  id: string;
  label: string;
  description?: string;
}

export interface MarkupTokenFormat {
  text_transform?: 'uppercase' | 'lowercase' | 'capitalize' | 'none';
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: 'left' | 'center' | 'right';
  font_size?: string;
  color?: string;
  background_color?: string;
}

export interface MarkupToken {
  id: string;
  label: string;
  prefix?: string;
  pattern?: string;
  format_scope?: 'line' | 'prefix' | 'inline';
  format?: MarkupTokenFormat;
}

export interface MarkupProfile {
  id: string;
  label: string;
  description?: string;
  tokens?: MarkupToken[];
  features?: Record<string, any>;
  formatting?: Record<string, any>;
  lists?: Record<string, any>;
  indentation?: Record<string, any>;
}

export interface IconFileUploadResponse {
  file: string;
}

export interface IndicatorDef {
  id: string;
  file: string;
  description: string;
  url?: string;
}

export interface IndicatorTheme {
  indicator_color: string;
  text_color: string;
  text_style?: string;
}

export interface IndicatorThemeResponse {
  id: string;
  theme: IndicatorTheme;
}

export interface IndicatorFileUploadResponse {
  file: string;
}

export interface IndicatorSet {
  description: string;
  style_guide?: string;
  indicators: IndicatorDef[];
  default_theme?: Record<string, IndicatorTheme>;
}

export interface ExportTemplate {
  id: string;
  name: string;
  extension: string;
}

export interface IconsConfig {
  icons: IconCatalog[];
}

export interface IndicatorsConfig {
  indicator_sets: Record<string, IndicatorSet>;
}

export interface IndicatorSetListResponse {
  set_id: string;
  indicators: IndicatorDef[];
}

// --- Velocity System Interfaces ---

export interface VelocityConfig {
  baseScore?: number;
  scoreMode?: 'inherit' | 'fixed';
  penaltyScore?: boolean;
}

export interface PropertyVelocityConfig {
  enabled: boolean;
  mode: 'multiplier' | 'status';
  multiplierFactor?: number;
  penaltyMode?: boolean;
  statusScores?: Record<string, number>;
}

export interface VelocityScore {
  nodeId: string;
  baseScore: number;
  inheritedScore: number;
  statusScore: number;
  numericalScore: number;
  blockingPenalty: number;
  blockingBonus: number;
  totalVelocity: number;
  isBlocked: boolean;
  blockedByNodes?: string[];
  blocksNodeIds?: string[];
}

export interface BlockingRelationship {
  blockedNodeId: string;
  blockingNodeId: string;
}

export interface VelocityRanking {
  nodes: Array<VelocityScore & { nodeName: string; nodeType: string }>;
  timestamp: number;
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

  async getOrphanedNodes(sessionId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/v1/sessions/${sessionId}/orphaned-nodes`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error?.error?.message || 'Failed to get orphaned nodes');
    }
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
    if (!response.ok) {
      throw new Error(`Failed to fetch template schema: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  async listMarkupProfiles(): Promise<MarkupProfileListItem[]> {
    const response = await fetch(`${this.baseUrl}/api/v1/markups`);
    if (!response.ok) {
      throw new Error(`Failed to fetch markup profiles: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return data.profiles || [];
  }

  async getMarkupProfile(profileId: string): Promise<MarkupProfile> {
    const response = await fetch(`${this.baseUrl}/api/v1/markup/${profileId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch markup profile: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  async createMarkupProfile(profile: MarkupProfile): Promise<MarkupProfile> {
    const response = await fetch(`${this.baseUrl}/api/v1/markup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    if (!response.ok) {
      throw new Error(`Failed to create markup profile: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  async updateMarkupProfile(profileId: string, profile: MarkupProfile): Promise<MarkupProfile> {
    const response = await fetch(`${this.baseUrl}/api/v1/markup/${profileId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    if (!response.ok) {
      throw new Error(`Failed to update markup profile: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  async deleteMarkupProfile(profileId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/v1/markup/${profileId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`Failed to delete markup profile: ${response.status} ${response.statusText}`);
    }
  }

  // Config Management
  async getIconsConfig(): Promise<IconsConfig> {
    const response = await fetch(`${this.baseUrl}/api/v1/config/icons`);
    if (!response.ok) {
      throw new Error(`Failed to fetch icons config: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  async getIndicatorsConfig(): Promise<IndicatorsConfig> {
    const response = await fetch(`${this.baseUrl}/api/v1/config/indicators`);
    if (!response.ok) {
      throw new Error(`Failed to fetch indicators config: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  // Icon Catalog Management
  async listIcons(): Promise<IconsConfig> {
    const response = await fetch(`${this.baseUrl}/api/v1/icon-catalog/icons`);
    if (!response.ok) {
      throw new Error(`Failed to list icons: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  async createIcon(payload: IconCatalog): Promise<IconCatalog> {
    const response = await fetch(`${this.baseUrl}/api/v1/icon-catalog/icons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        icon_id: payload.id,
        file: payload.file,
        description: payload.description,
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      const message = error?.error?.message || `Failed to create icon: ${response.status}`;
      throw new Error(message);
    }
    return response.json();
  }

  async updateIcon(iconId: string, payload: IconCatalog): Promise<IconCatalog> {
    const response = await fetch(`${this.baseUrl}/api/v1/icon-catalog/icons/${encodeURIComponent(iconId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        icon_id: payload.id,
        file: payload.file,
        description: payload.description,
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      const message = error?.error?.message || `Failed to update icon: ${response.status}`;
      throw new Error(message);
    }
    return response.json();
  }

  async deleteIcon(iconId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/v1/icon-catalog/icons/${encodeURIComponent(iconId)}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      const message = error?.error?.message || `Failed to delete icon: ${response.status}`;
      throw new Error(message);
    }
  }

  async uploadIconFile(iconId: string, file: File): Promise<IconFileUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(
      `${this.baseUrl}/api/v1/icon-catalog/icons/${encodeURIComponent(iconId)}/file`,
      {
        method: 'POST',
        body: formData,
      }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      const message = error?.error?.message || `Failed to upload icon file: ${response.status}`;
      throw new Error(message);
    }
    return response.json();
  }

  // Indicator Catalog Management
  async listIndicatorSetIndicators(setId: string): Promise<IndicatorSetListResponse> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/indicator-catalog/sets/${encodeURIComponent(setId)}/indicators`
    );
    if (!response.ok) {
      throw new Error(`Failed to list indicators: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  async getIndicator(setId: string, indicatorId: string): Promise<IndicatorDef> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/indicator-catalog/sets/${encodeURIComponent(setId)}/indicators/${encodeURIComponent(indicatorId)}`
    );
    if (!response.ok) {
      throw new Error(`Failed to get indicator: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  async createIndicator(setId: string, payload: IndicatorDef): Promise<IndicatorDef> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/indicator-catalog/sets/${encodeURIComponent(setId)}/indicators`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          indicator_id: payload.id,
          file: payload.file,
          description: payload.description,
        }),
      }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      const message = error?.error?.message || `Failed to create indicator: ${response.status}`;
      throw new Error(message);
    }
    return response.json();
  }

  async updateIndicator(
    setId: string,
    indicatorId: string,
    payload: Partial<IndicatorDef>
  ): Promise<IndicatorDef> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/indicator-catalog/sets/${encodeURIComponent(setId)}/indicators/${encodeURIComponent(indicatorId)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          indicator_id: payload.id,
          file: payload.file,
          description: payload.description,
        }),
      }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      const message = error?.error?.message || `Failed to update indicator: ${response.status}`;
      throw new Error(message);
    }
    return response.json();
  }

  async uploadIndicatorFile(
    setId: string,
    indicatorId: string,
    file: File
  ): Promise<IndicatorFileUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(
      `${this.baseUrl}/api/v1/indicator-catalog/sets/${encodeURIComponent(setId)}/indicators/${encodeURIComponent(indicatorId)}/file`,
      {
        method: 'POST',
        body: formData,
      }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      const message = error?.error?.message || `Failed to upload indicator file: ${response.status}`;
      throw new Error(message);
    }
    return response.json();
  }

  async deleteIndicator(setId: string, indicatorId: string): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/indicator-catalog/sets/${encodeURIComponent(setId)}/indicators/${encodeURIComponent(indicatorId)}`,
      { method: 'DELETE' }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      const message = error?.error?.message || `Failed to delete indicator: ${response.status}`;
      throw new Error(message);
    }
  }

  async setIndicatorTheme(
    setId: string,
    indicatorId: string,
    theme: IndicatorTheme
  ): Promise<IndicatorThemeResponse> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/indicator-catalog/sets/${encodeURIComponent(setId)}/indicators/${encodeURIComponent(indicatorId)}/theme`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(theme),
      }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      const message = error?.error?.message || `Failed to set indicator theme: ${response.status}`;
      throw new Error(message);
    }
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

  async loadGraphIntoSession(
    sessionId: string,
    graph: any,
    templateId: string | null,
    blockingRelationships: Array<{ blockedNodeId: string; blockingNodeId: string }> = []
  ): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/v1/sessions/${sessionId}/load-graph`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        graph,
        template_id: templateId,
        blocking_relationships: blockingRelationships,
      }),
    });
    if (!response.ok) {
      throw new Error('Failed to load graph into session');
    }
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

  async reloadBlueprint(sessionId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/v1/sessions/${sessionId}/reload-blueprint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      throw new Error('Failed to reload blueprint');
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
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload?.error?.message || 'Command failed';
      throw new Error(message);
    }
    return payload;
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

  async importNodesFromCsv(params: {
    sessionId: string;
    parentId: string;
    blueprintTypeId: string;
    columnMap: CsvColumnMapping[];
    file: File;
  }): Promise<CsvImportResult> {
    const formData = new FormData();
    formData.append('session_id', params.sessionId);
    formData.append('parent_id', params.parentId);
    formData.append('blueprint_type_id', params.blueprintTypeId);
    formData.append('column_map', JSON.stringify(params.columnMap));
    formData.append('file', params.file);

    const response = await fetch(`${this.baseUrl}/api/v1/imports/csv`, {
      method: 'POST',
      body: formData,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const message = payload?.error?.message || 'CSV import failed';
      const error: CsvImportError = Object.assign(new Error(message), {
        code: payload?.error?.code,
        rowErrors: payload?.error?.rows,
        status: response.status,
      });
      throw error;
    }

    return payload as CsvImportResult;
  }

  // Migration Management
  async getMigrationStatus(sessionId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/v1/session/${sessionId}/migrations/status`);
    if (!response.ok) {
      throw new Error('Failed to get migration status');
    }
    return response.json();
  }

  async applyMigrations(sessionId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/v1/session/${sessionId}/migrations/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      throw new Error('Failed to apply migrations');
    }
    return response.json();
  }

  // Template Editor - CRUD Operations
  async listTemplatesForEditor(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/v1/templates/editor/list`);
    if (!response.ok) {
      throw new Error('Failed to list templates');
    }
    return response.json();
  }

  async getTemplateForEditor(templateId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/v1/templates/editor/${templateId}`);
    if (!response.ok) {
      throw new Error('Failed to load template');
    }
    return response.json();
  }

  async createTemplate(templateData: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/v1/templates/editor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(templateData),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to create template');
    }
    return response.json();
  }

  async updateTemplate(templateId: string, templateData: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/v1/templates/editor/${templateId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(templateData),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to update template');
    }
    return response.json();
  }

  async deleteTemplate(templateId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/v1/templates/editor/${templateId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to delete template');
    }
    return response.json();
  }

  async validateTemplate(templateData: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/v1/templates/editor/${templateData.id}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(templateData),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to validate template');
    }
    return response.json();
  }

  // Export API
  async listExportTemplates(): Promise<{ templates: ExportTemplate[]; count: number }> {
    const response = await fetch(`${this.baseUrl}/api/export/list`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to list export templates');
    }
    return response.json();
  }

  async downloadExport(sessionId: string, templateId: string, context?: Record<string, any>): Promise<Blob> {
    const response = await fetch(`${this.baseUrl}/api/export/${sessionId}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template_id: templateId,
        context: context || {},
      }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to download export');
    }
    return response.blob();
  }

  // Velocity System API
  async getVelocityRanking(sessionId: string): Promise<VelocityRanking> {
    const response = await fetch(`${this.baseUrl}/api/v1/sessions/${sessionId}/velocity`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to get velocity ranking');
    }
    return response.json();
  }

  async getNodeVelocity(sessionId: string, nodeId: string): Promise<VelocityScore> {
    const response = await fetch(`${this.baseUrl}/api/v1/sessions/${sessionId}/nodes/${nodeId}/velocity`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to get node velocity');
    }
    return response.json();
  }

  async updateBlockingRelationship(
    sessionId: string,
    blockedNodeId: string,
    blockingNodeId: string | null
  ): Promise<any> {
    return this.executeCommand(sessionId, 'UpdateBlockingRelationship', {
      blocked_node_id: blockedNodeId,
      blocking_node_id: blockingNodeId,
    });
  }

  async getBlockingGraph(sessionId: string): Promise<{ relationships: BlockingRelationship[] }> {
    const response = await fetch(`${this.baseUrl}/api/v1/sessions/${sessionId}/blocking-graph`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to get blocking graph');
    }
    return response.json();
  }

  // WebSocket Connection
  connectSocket(callbacks: {
    onConnect?: () => void;
    onNodeCreated?: (data: any) => void;
    onNodeUpdated?: (data: any) => void;
    onNodeDeleted?: (data: any) => void;
    onDisconnect?: () => void;
    sessionId?: string | null;
  }): Socket {
    // Reuse existing socket if already connected
    if (this.socket && this.socket.connected) {
      return this.socket;
    }

    // Disconnect old socket if it exists but is not connected
    if (this.socket) {
      this.socket.disconnect();
    }

    this.socket = io(`${SOCKET_URL}/graph`, {
      transports: ['polling'],
      upgrade: false,
    });

    this.socket.on('connect', () => {
      if (callbacks.sessionId) {
        this.socket?.emit('join_session', { session_id: callbacks.sessionId });
      }
      callbacks.onConnect?.();
    });

    if (callbacks.onNodeCreated) {
      this.socket.on('node-created', callbacks.onNodeCreated);
    }

    if (callbacks.onNodeUpdated) {
      this.socket.on('node-updated', callbacks.onNodeUpdated);
    }

    if (callbacks.onNodeDeleted) {
      this.socket.on('node-deleted', callbacks.onNodeDeleted);
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
