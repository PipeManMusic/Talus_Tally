/**
 * Markdown Service
 * 
 * Provides markdown rendering, validation, and conversion utilities.
 */

import { API_BASE_URL } from '../api/client';

export interface MarkdownValidationIssue {
  type: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface MarkdownValidation {
  isValid: boolean;
  issues: MarkdownValidationIssue[];
}

export class MarkdownService {
  private baseUrl: string;
  
  constructor() {
    this.baseUrl = `${API_BASE_URL}/api/v1/text-editor`;
  }
  
  /**
   * Convert markdown text to HTML
   */
  async toHtml(text: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/markdown/to-html`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to convert markdown: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.html;
  }
  
  /**
   * Validate markdown syntax
   */
  async validate(text: string): Promise<MarkdownValidation> {
    const response = await fetch(`${this.baseUrl}/markdown/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to validate markdown: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.validation;
  }
  
  /**
   * Client-side markdown preview rendering
   * (Simple implementation for immediate feedback without server roundtrip)
   */
  renderPreview(text: string): string {
    if (!text) return '';
    
    let html = text;
    
    // Escape HTML first
    html = html
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    // Headings
    html = html.replace(/^#{6}\s+(.+)$/gm, '<h6>$1</h6>');
    html = html.replace(/^#{5}\s+(.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^#{4}\s+(.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^#{3}\s+(.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^#{2}\s+(.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^#{1}\s+(.+)$/gm, '<h1>$1</h1>');
    
    // Bold: **text** or __text__
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<u>$1</u>');
    
    // Italic: *text*
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    
    // Code: `text`
    html = html.replace(/`(.+?)`/g, '<code>$1</code>');
    
    // Bullet lists
    html = html.replace(/^[•\-*]\s+(.+)$/gm, '<li>$1</li>');
    
    // Numbered lists
    html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');
    
    // Paragraphs (lines not already tagged)
    const lines = html.split('\n');
    const processedLines = lines.map(line => {
      if (!line.trim()) return '<br>';
      if (line.match(/^<(h\d|li)/)) return line;
      return `<p>${line}</p>`;
    });
    
    return processedLines.join('\n');
  }
  
  /**
   * Get current formatting at cursor position
   * (Helper for toolbar state management)
   */
  getFormattingAtPosition(text: string, position: number): string[] {
    const activeFormats: string[] = [];
    const beforeCursor = text.substring(0, position);
    
    // Count markdown markers before cursor
    const boldMarkers = (beforeCursor.match(/\*\*/g) || []).length;
    if (boldMarkers % 2 === 1) activeFormats.push('bold');
    
    const italicMarkers = (beforeCursor.match(/(?<!\*)\*(?!\*)/g) || []).length;
    if (italicMarkers % 2 === 1) activeFormats.push('italic');
    
    const underlineMarkers = (beforeCursor.match(/__/g) || []).length;
    if (underlineMarkers % 2 === 1) activeFormats.push('underline');
    
    return activeFormats;
  }
  
  /**
   * Insert formatting at current cursor/selection
   */
  insertFormatting(
    text: string,
    selectionStart: number,
    selectionEnd: number,
    before: string,
    after: string = ''
  ): { newText: string; newCursorStart: number; newCursorEnd: number } {
    const selectedText = text.substring(selectionStart, selectionEnd);
    const newText =
      text.substring(0, selectionStart) +
      before +
      selectedText +
      after +
      text.substring(selectionEnd);
    
    return {
      newText,
      newCursorStart: selectionStart + before.length,
      newCursorEnd: selectionStart + before.length + selectedText.length,
    };
  }
}

// Export singleton instance
export const markdownService = new MarkdownService();
