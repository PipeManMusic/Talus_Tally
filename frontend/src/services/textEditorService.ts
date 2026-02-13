/**
 * Text Editor Service
 * 
 * Provides text editing operations with server-side undo/redo support.
 * Each editing session is managed independently with its own history stack.
 */

import { API_BASE_URL } from '../api/client';

export interface TextEditState {
  sessionId: string;
  propertyId: string;
  nodeId: string;
  currentText: string;
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
  lastModified: string;
  formattedText?: string;
}

export interface UndoRedoResult {
  text: string;
  cursorPosition: number;
  selectionStart: number;
  selectionEnd: number;
  canUndo: boolean;
  canRedo: boolean;
}

export interface TokenFormat {
  text_transform?: 'uppercase' | 'lowercase' | 'capitalize' | 'none';
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: 'left' | 'center' | 'right';
  font_size?: string;
  color?: string;
  background_color?: string;
}

export interface TokenConfig {
  id: string;
  label: string;
  prefix?: string;
  format_scope?: 'line' | 'prefix';
  format?: TokenFormat;
}

export interface TextEditOperation {
  beforeText: string;
  afterText: string;
  cursorPosition: number;
  selectionStart: number;
  selectionEnd: number;
  operationType?: 'insert' | 'delete' | 'replace' | 'format';
  tokenConfig?: TokenConfig;
}

export class TextEditorService {
  private baseUrl: string;
  
  constructor() {
    this.baseUrl = `${API_BASE_URL}/api/v1/text-editor`;
  }
  
  /**
   * Transform backend snake_case state to frontend camelCase
   */
  private transformState(backendState: any): TextEditState {
    return {
      sessionId: backendState.session_id,
      propertyId: backendState.property_id,
      nodeId: backendState.node_id,
      currentText: backendState.current_text,
      canUndo: backendState.can_undo,
      canRedo: backendState.can_redo,
      undoCount: backendState.undo_count,
      redoCount: backendState.redo_count,
      lastModified: backendState.last_modified,
      formattedText: backendState.formatted_text,
    };
  }
  
  /**
   * Create a new text editing session
   */
  async createSession(
    propertyId: string,
    nodeId: string,
    initialText: string = ''
  ): Promise<{ sessionId: string; state: TextEditState }> {
    const response = await fetch(`${this.baseUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        property_id: propertyId,
        node_id: nodeId,
        initial_text: initialText,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to create text editing session: ${response.statusText}`);
    }
    
    const data = await response.json();
    return {
      sessionId: data.session_id,
      state: this.transformState(data.state),
    };
  }
  
  /**
   * Get the current state of a text editing session
   */
  async getSessionState(sessionId: string): Promise<TextEditState> {
    const response = await fetch(`${this.baseUrl}/session/${sessionId}`);
    
    if (!response.ok) {
      throw new Error(`Failed to get session state: ${response.statusText}`);
    }
    
    const data = await response.json();
    return this.transformState(data.state);
  }
  
  /**
   * Close a text editing session and get the final text
   */
  async closeSession(sessionId: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/session/${sessionId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      throw new Error(`Failed to close session: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.final_text;
  }
  
  /**
   * Apply a text edit operation
   */
  async applyEdit(
    sessionId: string,
    operation: TextEditOperation
  ): Promise<TextEditState> {
    const payload: any = {
      before_text: operation.beforeText,
      after_text: operation.afterText,
      cursor_position: operation.cursorPosition,
      selection_start: operation.selectionStart,
      selection_end: operation.selectionEnd,
      operation_type: operation.operationType || 'replace',
    };
    
    if (operation.tokenConfig) {
      payload.token_config = operation.tokenConfig;
    }
    
    const response = await fetch(`${this.baseUrl}/session/${sessionId}/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to apply edit: ${response.statusText}`);
    }
    
    const data = await response.json();
    const state = this.transformState(data.state);
    
    // Include formatted text if backend provided it
    if (data.formatted_text) {
      state.formattedText = data.formatted_text;
    }
    
    return state;
  }
  
  /**
   * Undo the last edit operation
   */
  async undo(sessionId: string): Promise<UndoRedoResult | null> {
    const response = await fetch(`${this.baseUrl}/session/${sessionId}/undo`, {
      method: 'POST',
    });
    
    if (response.status === 400) {
      // Nothing to undo
      return null;
    }
    
    if (!response.ok) {
      throw new Error(`Failed to undo: ${response.statusText}`);
    }
    
    const data = await response.json();
    return {
      text: data.text,
      cursorPosition: data.cursor_position,
      selectionStart: data.selection_start,
      selectionEnd: data.selection_end,
      canUndo: data.can_undo,
      canRedo: data.can_redo,
    };
  }
  
  /**
   * Redo the last undone edit operation
   */
  async redo(sessionId: string): Promise<UndoRedoResult | null> {
    const response = await fetch(`${this.baseUrl}/session/${sessionId}/redo`, {
      method: 'POST',
    });
    
    if (response.status === 400) {
      // Nothing to redo
      return null;
    }
    
    if (!response.ok) {
      throw new Error(`Failed to redo: ${response.statusText}`);
    }
    
    const data = await response.json();
    return {
      text: data.text,
      cursorPosition: data.cursor_position,
      selectionStart: data.selection_start,
      selectionEnd: data.selection_end,
      canUndo: data.can_undo,
      canRedo: data.can_redo,
    };
  }
}

// Export singleton instance
export const textEditorService = new TextEditorService();
