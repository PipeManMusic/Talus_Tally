/**
 * Enhanced Text Editor with Undo/Redo, Markdown Preview, and Spell Checking
 * 
 * This refactored text editor provides:
 * - Server-side undo/redo stack management
 * - Real-time markdown preview
 * - Spell checking with suggestions
 * - Proper infrastructure layer integration
 */

import { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
import {
  X,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Undo2,
  Redo2,
  Eye,
  EyeOff,
  Tag,
  SpellCheck,
  AlertCircle,
  Code,
} from 'lucide-react';
import { textEditorService } from '../../services/textEditorService';
import { spellCheckerService, type SpellingSuggestion } from '../../services/spellCheckerService';
import { markdownService } from '../../services/markdownService';

export interface MarkupToken {
  id: string;
  label: string;
  prefix?: string;
  pattern?: string;
  format_scope?: 'line' | 'prefix';
  format?: {
    text_transform?: 'uppercase' | 'lowercase' | 'capitalize' | 'none';
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    align?: 'left' | 'center' | 'right';
    font_size?: string;
    color?: string;
    background_color?: string;
  };
}

interface EnhancedTextEditorProps {
  isOpen: boolean;
  title: string;
  value: string;
  propertyId: string;
  nodeId: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: (value: string) => void;
  markupTokens?: MarkupToken[];
}

export function EnhancedTextEditor({
  isOpen,
  title,
  value,
  propertyId,
  nodeId,
  onChange,
  onClose,
  onSave,
  markupTokens = [],
}: EnhancedTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const textContentRef = useRef<string>('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [misspellings, setMisspellings] = useState<SpellingSuggestion[]>([]);
  const [showSpellCheck, setShowSpellCheck] = useState(false);
  const [showMarkdownIndicators, setShowMarkdownIndicators] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number; misspelling: SpellingSuggestion } | null>(null);
  const editDebounceTimer = useRef<NodeJS.Timeout | null>(null);
  const markdownDebounceTimer = useRef<NodeJS.Timeout | null>(null);
  const lastEditSavedTime = useRef<number>(0);
  const maxDebounceTime = 1000; // Force save after 1 second of continuous typing

  // Helper to safely render plain text in contentEditable
  const renderPlainText = (text: string) => {
    if (!editorRef.current) return;
    console.log('[renderPlainText] Setting text:', { length: text.length });
    
    // Use textContent for plain text in contentEditable
    // This is the proper way to set plain text without HTML interpretation
    editorRef.current.textContent = text;
    
    console.log('[renderPlainText] Content rendered');
  };

  // Initialize editing session when opening (only run when editor is opened)
  useEffect(() => {
    console.log('[Init] useEffect running:', { isOpen, sessionId, valueLength: value?.length });
    if (isOpen && !sessionId) {
      console.log('[Init] Initializing session and rendering text');
      initializeSession();
      // Sync initial value only on open
      if (editorRef.current) {
        console.log('[Init] Rendering initial value');
        renderPlainText(value || '');
        textContentRef.current = value || '';
      }
    }
  }, [isOpen, sessionId]);

  // Only re-sync when spell check is toggled (to reset display)
  useEffect(() => {
    if (!showSpellCheck && editorRef.current && textContentRef.current) {
      // When spell check is turned off, ensure editor shows plain text
      renderPlainText(textContentRef.current);
    }
  }, [showSpellCheck]);

  // Sync editor when value changes from undo/redo
  useEffect(() => {
    console.log('[ValueSync] Value changed from parent (undo/redo)');
    if (value !== textContentRef.current && editorRef.current) {
      textContentRef.current = value;
      if (showMarkdownIndicators) {
        // Show with markdown styling
        updateEditorWithMarkdown(value);
      } else {
        // Show plain text
        renderPlainText(value);
      }
    }
  }, [value, showMarkdownIndicators]);

  // Handle markdown toggle display updates
  useEffect(() => {
    console.log('[MarkdownToggle] Toggle state changed, updating display');
    if (!editorRef.current) return;
    
    const plainText = textContentRef.current || value;
    if (showMarkdownIndicators) {
      // User enabled markdown - show with styling
      updateEditorWithMarkdown(plainText);
    } else {
      // User disabled markdown - show plain text
      editorRef.current.textContent = plainText;
    }
  }, [showMarkdownIndicators]);
  
  // Cleanup session on unmount
  useEffect(() => {
    return () => {
      if (editDebounceTimer.current) {
        clearTimeout(editDebounceTimer.current);
      }
      if (markdownDebounceTimer.current) {
        clearTimeout(markdownDebounceTimer.current);
      }
      spellCheckerService.cancelDebounced('editor-spell-check');
      if (sessionId) {
        cleanupSession();
      }
    };
  }, [sessionId]);

  const initializeSession = async () => {
    try {
      setIsLoading(true);
      const { sessionId: newSessionId, state } = await textEditorService.createSession(
        propertyId,
        nodeId,
        value
      );
      setSessionId(newSessionId);
      setCanUndo(state.canUndo);
      setCanRedo(state.canRedo);
    } catch (error) {
      console.error('Failed to initialize text editor session:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const cleanupSession = async () => {
    if (!sessionId) return;
    
    try {
      await textEditorService.closeSession(sessionId);
    } catch (error) {
      console.error('Failed to cleanup session:', error);
    }
    setSessionId(null);
  };

  // Auto-save edit operations with debounce
  const applyEditOperation = useCallback(
    async (beforeValue: string, newValue: string) => {
      if (!sessionId) return;

      try {
        const state = await textEditorService.applyEdit(sessionId, {
          beforeText: beforeValue,
          afterText: newValue,
          cursorPosition: 0,
          selectionStart: 0,
          selectionEnd: 0,
          operationType: 'replace',
        });
        
        setCanUndo(state.canUndo);
        setCanRedo(state.canRedo);
      } catch (error) {
        console.error('Failed to apply edit:', error);
      }
    },
    [sessionId]
  );

  // Handle text changes
  const handleTextChange = (newValue: string) => {
    const oldValue = textContentRef.current;
    textContentRef.current = newValue;
    onChange(newValue);
    
    // Don't update markdown display on every keystroke - let effects handle it
    // to avoid cursor position issues from innerHTML
    
    const now = Date.now();
    const timeSinceLastSave = now - lastEditSavedTime.current;
    
    // Clear existing debounce timer
    if (editDebounceTimer.current) {
      clearTimeout(editDebounceTimer.current);
    }
    
    // Force save if we've been typing for too long without saving
    if (timeSinceLastSave >= maxDebounceTime) {
      applyEditOperation(oldValue, newValue);
      lastEditSavedTime.current = now;
    } else {
      // Normal debounced edit application
      editDebounceTimer.current = setTimeout(() => {
        applyEditOperation(oldValue, newValue);
        lastEditSavedTime.current = Date.now();
      }, 150);
    }
    
    // Debounced markdown indicator update (only if markdown is enabled)
    if (showMarkdownIndicators) {
      if (markdownDebounceTimer.current) {
        clearTimeout(markdownDebounceTimer.current);
      }
      
      markdownDebounceTimer.current = setTimeout(() => {
        if (editorRef.current) {
          updateEditorWithMarkdown(newValue);
        }
      }, 300); // Wait 300ms after user stops typing
    }
  };

  // Get value from editor
  const getEditorValue = (): string => {
    return textContentRef.current;
  };

  // Update editor display with spell check underlines
  const updateEditorDisplay = useCallback((text: string, misspellings: SpellingSuggestion[]) => {
    if (!editorRef.current) return;

    let html = text;
    
    // Sort by position descending to maintain correct indices when replacing
    const sorted = [...misspellings].sort((a, b) => b.position - a.position);
    
    for (const misspelling of sorted) {
      const word = misspelling.word;
      const start = misspelling.position;
      const end = start + word.length;
      
      const before = html.substring(0, start);
      const highlighted = `<span class="spell-error" data-position="${start}" data-word="${word}" style="text-decoration-line: underline; text-decoration-color: red; text-decoration-style: wavy; cursor: pointer;">${html.substring(start, end)}</span>`;
      const after = html.substring(end);
      
      html = before + highlighted + after;
    }
    
    editorRef.current.innerHTML = html;
  }, []);

  // Undo operation
  const handleUndo = useCallback(async () => {
    if (!sessionId || !canUndo) return;
    
    try {
      const result = await textEditorService.undo(sessionId);
      if (result) {
        onChange(result.text);
        setCanUndo(result.canUndo);
        setCanRedo(result.canRedo);
      }
    } catch (error) {
      console.error('Failed to undo:', error);
    }
  }, [sessionId, canUndo, onChange]);

  // Redo operation
  const handleRedo = useCallback(async () => {
    if (!sessionId || !canRedo) return;
    
    try {
      const result = await textEditorService.redo(sessionId);
      if (result) {
        onChange(result.text);
        setCanUndo(result.canUndo);
        setCanRedo(result.canRedo);
      }
    } catch (error) {
      console.error('Failed to redo:', error);
    }
  }, [sessionId, canRedo, onChange]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + Z = Undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      
      // Cmd/Ctrl + Shift + Z or Cmd/Ctrl + Y = Redo
      if ((e.metaKey || e.ctrlKey) && ((e.shiftKey && e.key === 'z') || e.key === 'y')) {
        e.preventDefault();
        handleRedo();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleUndo, handleRedo]);

  // Update preview when value changes
  useEffect(() => {
    if (showPreview && value) {
      const html = markdownService.renderPreview(value);
      setPreviewHtml(html);
    }
  }, [value, showPreview]);

  // Spell check debounced and update display
  useEffect(() => {
    if (!value || !showSpellCheck) {
      setMisspellings([]);
      spellCheckerService.cancelDebounced('editor-spell-check');
      // Don't update innerHTML when spell check is off - let contentEditable handle it naturally
      return;
    }
    
    spellCheckerService.checkTextDebounced(
      value,
      (result) => {
        setMisspellings(result.misspellings);
        updateEditorDisplay(value, result.misspellings);
      },
      1000,
      'editor-spell-check'
    );
  }, [value, showSpellCheck, updateEditorDisplay]);

  const insertFormatting = (before: string, after: string = '') => {
    if (!editorRef.current) return;

    const plainText = getEditorValue();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(editorRef.current);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    const start = preCaretRange.toString().length;
    const end = start + range.toString().length;

    if (start !== end) {
      const selectedText = plainText.substring(start, end);
      const newValue = plainText.substring(0, start) + before + selectedText + after + plainText.substring(end);
      handleTextChange(newValue);
      
      // Re-position cursor after formatting
      setTimeout(() => {
        const editor = editorRef.current;
        if (editor && editor.firstChild) {
          const newRange = document.createRange();
          newRange.setStart(editor.firstChild, start + before.length);
          newRange.setEnd(editor.firstChild, end + before.length);
          sel.removeAllRanges();
          sel.addRange(newRange);
        }
      }, 0);
    }
  };

  const insertBulletList = () => {
    if (!editorRef.current) return;

    const plainText = getEditorValue();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(editorRef.current);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    const position = preCaretRange.toString().length;

    const lineStart = plainText.lastIndexOf('\n', position - 1) + 1;
    const before = plainText.substring(0, lineStart);
    const after = plainText.substring(lineStart);
    
    const newValue = before + '• ' + after;
    handleTextChange(newValue);
  };

  const insertNumberedList = () => {
    if (!editorRef.current) return;

    const plainText = getEditorValue();
    const lines = plainText.split('\n');
    let maxNum = 0;
    lines.forEach(line => {
      const match = line.match(/^(\d+)\./);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
    });

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(editorRef.current);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    const position = preCaretRange.toString().length;

    const lineStart = plainText.lastIndexOf('\n', position - 1) + 1;
    const before = plainText.substring(0, lineStart);
    const after = plainText.substring(lineStart);
    
    const newValue = before + (maxNum + 1) + '. ' + after;
    handleTextChange(newValue);
  };

  const applyLocalFormatting = (text: string, format: MarkupToken['format']): string => {
    if (!format) return text;
    
    let result = text;
    
    // Apply text transformation
    if (format.text_transform) {
      switch (format.text_transform) {
        case 'uppercase':
          result = result.toUpperCase();
          break;
        case 'lowercase':
          result = result.toLowerCase();
          break;
        case 'capitalize':
          result = result.charAt(0).toUpperCase() + result.slice(1).toLowerCase();
          break;
      }
    }
    
    // Apply markdown markers
    if (format.bold) {
      result = `**${result}**`;
    }
    if (format.italic) {
      result = `*${result}*`;
    }
    if (format.underline) {
      result = `__${result}__`;
    }
    
    return result;
  };

  const updateEditorWithMarkdown = (text: string) => {
    if (!editorRef.current) return;
    if (!showMarkdownIndicators) {
      // When markdown is off, just show plain text
      editorRef.current.textContent = text;
      return;
    }

    // Build HTML with markdown markers styled
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    // Highlight markdown MARKERS (not the content) with background colors
    // Bold markers **
    html = html.replace(/(\*\*)([^\*]+?)(\*\*)/g, 
      '<span class="markdown-bold">$1</span>$2<span class="markdown-bold">$3</span>');
    
    // Italic markers *
    html = html.replace(/(\*)([^\*]+?)(\*)/g, 
      '<span class="markdown-italic">$1</span>$2<span class="markdown-italic">$3</span>');
    
    // Underline markers __
    html = html.replace(/(__+)([^_]+?)(__+)/g, 
      '<span class="markdown-underline">$1</span>$2<span class="markdown-underline">$3</span>');
    
    // Preserve line breaks
    html = html.replace(/\n/g, '<br />');
    
    editorRef.current.innerHTML = html;
  };

  const insertMarkupToken = (token: MarkupToken) => {
    if (!editorRef.current || !token.prefix) return;

    const plainText = getEditorValue();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(editorRef.current);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    const position = preCaretRange.toString().length;

    const lineStart = plainText.lastIndexOf('\n', position - 1) + 1;
    const lineEnd = plainText.indexOf('\n', position);
    const actualLineEnd = lineEnd === -1 ? plainText.length : lineEnd;
    
    const currentLine = plainText.substring(lineStart, actualLineEnd);
    const before = plainText.substring(0, lineStart);
    const after = plainText.substring(actualLineEnd);
    
    // Check if line already has this prefix
    const hasPrefix = currentLine.startsWith(token.prefix + ' ');
    
    let newLine: string;
    if (hasPrefix) {
      // Already has prefix - get the content after prefix
      const content = currentLine.substring(token.prefix.length + 1);
      
      // Apply formatting based on scope
      if (token.format_scope === 'line' && content.trim()) {
        // Format the content after the prefix
        const formatted = applyLocalFormatting(content.trim(), token.format);
        newLine = `${token.prefix} ${formatted}`;
      } else if (token.format_scope === 'prefix') {
        // Format just the prefix
        const formattedPrefix = applyLocalFormatting(token.prefix, token.format);
        newLine = `${formattedPrefix} ${content}`;
      } else {
        newLine = currentLine;
      }
    } else {
      // Add prefix to start of line
      if (token.format_scope === 'line' && currentLine.trim()) {
        // Format the existing line content
        const formatted = applyLocalFormatting(currentLine.trim(), token.format);
        newLine = `${token.prefix} ${formatted}`;
      } else if (token.format_scope === 'prefix') {
        // Format just the prefix
        const formattedPrefix = applyLocalFormatting(token.prefix, token.format);
        newLine = `${formattedPrefix} ${currentLine}`;
      } else {
        newLine = `${token.prefix} ${currentLine}`;
      }
    }
    
    // Construct new text with formatted line
    const newValue = before + newLine + after;
    
    // Send to backend WITHOUT token config since we already formatted locally
    handleTextChange(newValue);
  };

  const handleDone = () => {
    onSave(value);
    onClose();
  };

  const replaceWord = (wordToReplace: string, position: number, replacement: string) => {
    // Find the word at the position and replace it
    const plainText = getEditorValue();
    const beforeWord = plainText.substring(0, position);
    const afterWord = plainText.substring(position + wordToReplace.length);
    const newValue = beforeWord + replacement + afterWord;
    
    handleTextChange(newValue);
    
    // Focus back on editor
    setTimeout(() => {
      const editor = editorRef.current;
      if (editor) {
        editor.focus();
      }
    }, 0);
  };

  const ignoreWord = async (word: string) => {
    try {
      await spellCheckerService.ignoreWord(word);
      // Trigger re-check
      if (value && showSpellCheck) {
        const result = await spellCheckerService.checkText(value);
        setMisspellings(result.misspellings);
        updateEditorDisplay(value, result.misspellings);
      }
    } catch (error) {
      console.error('Failed to ignore word:', error);
    }
  };

  const addToDictionary = async (word: string) => {
    try {
      await spellCheckerService.addToDictionary(word);
      // Trigger re-check
      if (value && showSpellCheck) {
        const result = await spellCheckerService.checkText(value);
        setMisspellings(result.misspellings);
        updateEditorDisplay(value, result.misspellings);
      }
      setContextMenuPosition(null);
    } catch (error) {
      console.error('Failed to add to dictionary:', error);
    }
  };

  // Close context menu when clicking elsewhere
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // Don't close if clicking on context menu itself
      const target = e.target as HTMLElement;
      if (target.closest('.spell-context-menu')) {
        return;
      }
      if (contextMenuPosition) {
        setContextMenuPosition(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenuPosition]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-bg-light border border-border rounded-lg shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col max-h-screen">
        {/* Header */}
        <div className="flex items-center justify-between py-3 px-4 border-b border-border flex-shrink-0">
          <h2 className="text-lg font-display font-semibold text-fg-primary">
            {title}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="p-2 hover:bg-bg-dark rounded transition-colors text-fg-secondary hover:text-fg-primary"
              title={showPreview ? 'Hide Preview' : 'Show Preview'}
            >
              {showPreview ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
            <button
              onClick={() => setShowMarkdownIndicators(!showMarkdownIndicators)}
              className="p-2 hover:bg-bg-dark rounded transition-colors text-fg-secondary hover:text-fg-primary"
              title={showMarkdownIndicators ? 'Hide Markdown Indicators' : 'Show Markdown Indicators'}
            >
              <Code size={20} className={showMarkdownIndicators ? 'text-accent-primary' : ''} />
            </button>
            <button
              onClick={() => setShowSpellCheck(!showSpellCheck)}
              className="p-2 hover:bg-bg-dark rounded transition-colors text-fg-secondary hover:text-fg-primary"
              title={showSpellCheck ? 'Hide Spell Check' : 'Show Spell Check'}
            >
              <SpellCheck size={20} className={showSpellCheck ? 'text-accent-primary' : ''} />
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-bg-dark rounded transition-colors"
              aria-label="Close editor"
            >
              <X size={20} className="text-fg-secondary" />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-bg-dark border-b border-border px-3 py-2 flex flex-wrap gap-1 flex-shrink-0">
          {/* Undo/Redo */}
          <button
            onClick={handleUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className="p-2 hover:bg-bg-light rounded transition-colors text-fg-secondary hover:text-fg-primary disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Undo2 size={18} />
          </button>
          <button
            onClick={handleRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            className="p-2 hover:bg-bg-light rounded transition-colors text-fg-secondary hover:text-fg-primary disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Redo2 size={18} />
          </button>
          
          <div className="w-px bg-border mx-1"></div>
          
          {/* Formatting */}
          <button
            onClick={() => insertFormatting('**', '**')}
            title="Bold (Ctrl+B)"
            className="p-2 hover:bg-bg-light rounded transition-colors text-fg-secondary hover:text-fg-primary"
          >
            <Bold size={18} />
          </button>
          <button
            onClick={() => insertFormatting('*', '*')}
            title="Italic (Ctrl+I)"
            className="p-2 hover:bg-bg-light rounded transition-colors text-fg-secondary hover:text-fg-primary"
          >
            <Italic size={18} />
          </button>
          <button
            onClick={() => insertFormatting('__', '__')}
            title="Underline"
            className="p-2 hover:bg-bg-light rounded transition-colors text-fg-secondary hover:text-fg-primary"
          >
            <Underline size={18} />
          </button>
          
          <div className="w-px bg-border mx-1"></div>
          
          {/* Lists */}
          <button
            onClick={insertBulletList}
            title="Bullet List"
            className="p-2 hover:bg-bg-light rounded transition-colors text-fg-secondary hover:text-fg-primary"
          >
            <List size={18} />
          </button>
          <button
            onClick={insertNumberedList}
            title="Numbered List"
            className="p-2 hover:bg-bg-light rounded transition-colors text-fg-secondary hover:text-fg-primary"
          >
            <ListOrdered size={18} />
          </button>
          
          {/* Markup Tokens */}
          {markupTokens.length > 0 && (
            <>
              <div className="w-px bg-border mx-1"></div>
              {markupTokens.map((token) => (
                <button
                  key={token.id}
                  onClick={() => insertMarkupToken(token)}
                  title={`Insert ${token.label}`}
                  className="p-2 hover:bg-bg-light rounded transition-colors text-fg-secondary hover:text-fg-primary flex items-center gap-1 text-xs font-medium"
                >
                  <Tag size={16} />
                  {token.label}
                </button>
              ))}
            </>
          )}
        </div>

        {/* Editor Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Text Editor */}
          <div className="flex-1 flex flex-col relative">
            {/* Markdown Indicator Layer removed - now styling editor directly */}
            
            <div
              ref={editorRef}
              contentEditable
              onInput={(e) => {
                const text = e.currentTarget.textContent || '';
                textContentRef.current = text;
                handleTextChange(text);
              }}
              onScroll={() => {
                // Scroll handling - no longer needed for highlight layer syncing
              }}
              onContextMenu={(e) => {
                const target = e.target as HTMLElement;
                if (target.classList.contains('spell-error')) {
                  e.preventDefault();
                  const word = target.getAttribute('data-word');
                  const position = parseInt(target.getAttribute('data-position') || '0');
                  const misspelling = misspellings.find(m => m.word === word && m.position === position);
                  
                  if (misspelling) {
                    setContextMenuPosition({
                      x: e.clientX,
                      y: e.clientY,
                      misspelling
                    });
                  }
                }
              }}
              suppressContentEditableWarning
              style={{
                flex: 1,
                border: 'none',
                padding: '16px',
                fontFamily: 'monospace',
                fontSize: '14px',
                outline: 'none',
                overflow: 'auto',
                backgroundColor: '#1e1e1e',
                color: '#e0e0e0',
                lineHeight: '1.5',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                position: 'relative',
                zIndex: 2,
              }}
            />
            
            {/* Context menu for spell corrections */}
            {contextMenuPosition && (
              <div
                className="fixed bg-bg-light border border-border rounded shadow-lg p-2 z-50 spell-context-menu"
                style={{
                  left: `${contextMenuPosition.x}px`,
                  top: `${contextMenuPosition.y}px`,
                  minWidth: '200px'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-xs font-semibold text-fg-secondary mb-2">
                  "{contextMenuPosition.misspelling.word}"
                </div>
                {contextMenuPosition.misspelling.suggestions.length > 0 ? (
                  <>
                    <div className="text-xs text-fg-muted mb-1">Suggestions:</div>
                    {contextMenuPosition.misspelling.suggestions.slice(0, 5).map((suggestion, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          replaceWord(
                            contextMenuPosition.misspelling.word,
                            contextMenuPosition.misspelling.position,
                            suggestion
                          );
                          setContextMenuPosition(null);
                        }}
                        className="block w-full text-left px-2 py-1 hover:bg-accent-primary hover:text-fg-primary rounded text-fg-primary transition-colors text-sm"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </>
                ) : (
                  <div className="text-xs text-fg-muted mb-1">No suggestions</div>
                )}
                <div className="border-t border-border mt-2 pt-2 flex gap-1">
                  <button
                    onClick={() => {
                      ignoreWord(contextMenuPosition.misspelling.word);
                      setContextMenuPosition(null);
                    }}
                    className="px-2 py-1 text-xs hover:bg-bg-dark rounded text-fg-secondary hover:text-fg-primary transition-colors"
                  >
                    Ignore
                  </button>
                  <button
                    onClick={() => {
                      addToDictionary(contextMenuPosition.misspelling.word);
                      setContextMenuPosition(null);
                    }}
                    className="px-2 py-1 text-xs hover:bg-bg-dark rounded text-fg-secondary hover:text-fg-primary transition-colors"
                  >
                    Add to Dictionary
                  </button>
                </div>
              </div>
            )}
          </div>
          
          {/* Preview Pane */}
          {showPreview && (
            <div className="w-1/2 border-l border-border bg-bg-light overflow-auto">
              <div className="p-4">
                <div className="text-xs font-semibold text-fg-secondary mb-3">Preview</div>
                <div
                  className="prose prose-sm max-w-none text-fg-primary"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between py-3 px-4 border-t border-border flex-shrink-0 bg-bg-dark">
          <div className="text-xs text-fg-secondary flex items-center gap-3">
            <span>
              {value.length} character{value.length !== 1 ? 's' : ''}
            </span>
            <span>•</span>
            <span>
              {value.split('\n').length} line{value.split('\n').length !== 1 ? 's' : ''}
            </span>
            {showSpellCheck && misspellings.length > 0 && (
              <>
                <span>•</span>
                <span className="text-status-danger">
                  {misspellings.length} spelling {misspellings.length === 1 ? 'issue' : 'issues'}
                </span>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-bg-light text-fg-primary border border-border rounded hover:bg-bg-light/80 transition-colors text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={handleDone}
              className="px-3 py-1.5 bg-accent-primary text-fg-primary rounded hover:bg-accent-hover transition-colors text-sm font-semibold"
            >
              Done
            </button>
          </div>
        </div>
      </div>
      </div>

      {/* Markdown Indicator Styles */}
      <style>{`
        .markdown-bold {
          background-color: rgba(255, 215, 0, 0.4);
          padding: 0 2px;
          border-radius: 2px;
          font-weight: bold;
          display: inline;
          color: inherit;
        }
        
        .markdown-italic {
          background-color: rgba(100, 200, 255, 0.4);
          padding: 0 2px;
          border-radius: 2px;
          font-style: italic;
          display: inline;
          color: inherit;
        }
        
        .markdown-underline {
          background-color: rgba(150, 200, 100, 0.4);
          padding: 0 2px;
          border-radius: 2px;
          text-decoration: underline;
          text-decoration-color: rgba(200, 255, 150, 0.8);
          display: inline;
          color: inherit;
        }
      `}</style>
    </>
  );
}
