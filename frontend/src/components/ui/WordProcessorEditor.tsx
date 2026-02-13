/**
 * Word Processor Style Text Editor
 * 
 * A fully functional word processor with:
 * - Inline spell checking with context menus
 * - Rich text formatting toolbar
 * - Template-based formatting rules
 * - Dark theme UI with white editor area (like Word)
 * 
 * Architecture: MVC via service layer
 * - Text mutations through textEditorService
 * - Spell checking through spellCheckerService
 * - Template rules applied via markupRenderService
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  X,
  Bold,
  Italic,
  Underline,
  Undo2,
  Redo2,
} from 'lucide-react';
import { textEditorService } from '../../services/textEditorService';
import type { TextEditState } from '../../services/textEditorService';
import type { MarkupToken } from '../../services/markupRenderService';
import { spellCheckerService } from '../../services/spellCheckerService';
import '../../styles/word-processor-editor.css';

interface WordProcessorEditorProps {
  isOpen: boolean;
  title: string;
  value: string;
  propertyId: string;
  nodeId: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: (value: string) => void;
  markupTokens: MarkupToken[];
}

interface SpellingError {
  word: string;
  suggestions: string[];
  position: number;
  length: number;
}

export function WordProcessorEditor({
  isOpen,
  title,
  value,
  propertyId,
  nodeId,
  onChange,
  onClose,
  onSave,
  markupTokens,
}: WordProcessorEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [spellingErrors, setSpellingErrors] = useState<SpellingError[]>([]);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    word: string;
    suggestions: string[];
    position: number;
  } | null>(null);
  const [editState, setEditState] = useState<TextEditState | null>(null);
  const spellCheckTimer = useRef<NodeJS.Timeout | null>(null);

  // Initialize session (once per open)
  useEffect(() => {
    if (!isOpen || sessionId) return;

    const initSession = async () => {
      try {
        const { sessionId: newSessionId, state } = await textEditorService.createSession(
          propertyId,
          nodeId,
          value
        );
        setSessionId(newSessionId);
        setEditState(state);
        setCanUndo(state.canUndo);
        setCanRedo(state.canRedo);
      } catch (error) {
        console.error('Failed to create editing session:', error);
      }
    };

    initSession();
  }, [isOpen, propertyId, nodeId]);

  // Cleanup session when closing
  useEffect(() => {
    return () => {
      if (sessionId && !isOpen) {
        textEditorService.closeSession(sessionId).catch(console.error);
      }
      if (spellCheckTimer.current) {
        clearTimeout(spellCheckTimer.current);
      }
    };
  }, [sessionId, isOpen]);

  // Auto-focus editor when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Run spell check with debounce
  useEffect(() => {
    if (!isOpen || !value) {
      setSpellingErrors([]);
      return;
    }

    if (spellCheckTimer.current) {
      clearTimeout(spellCheckTimer.current);
    }

    spellCheckTimer.current = setTimeout(async () => {
      try {
        const result = await spellCheckerService.checkText(value);
        if (result.misspellings) {
          setSpellingErrors(
            result.misspellings.map((m) => ({
              word: m.word,
              suggestions: m.suggestions || [],
              position: m.position || 0,
              length: m.word.length,
            }))
          );
        }
      } catch (error) {
        console.error('Spell check failed:', error);
      }
    }, 500);

    return () => {
      if (spellCheckTimer.current) {
        clearTimeout(spellCheckTimer.current);
      }
    };
  }, [value, isOpen]);

  const handleInput = useCallback(
    async (event: React.FormEvent<HTMLDivElement>) => {
      const newText = event.currentTarget.textContent || '';

      onChange(newText);

      // Update backend
      if (sessionId) {
        try {
          const operation = {
            beforeText: value,
            afterText: newText,
            cursorPosition: 0,
            selectionStart: 0,
            selectionEnd: 0,
            operationType: 'replace' as const,
          };
          const newState = await textEditorService.applyEdit(sessionId, operation);
          setEditState(newState);
          setCanUndo(newState.canUndo);
          setCanRedo(newState.canRedo);
        } catch (error) {
          console.error('Failed to apply edit:', error);
        }
      }
    },
    [sessionId, value, onChange]
  );

  const handleUndo = useCallback(async () => {
    if (!sessionId) return;
    try {
      const result = await textEditorService.undo(sessionId);
      if (result) {
        onChange(result.text);
        setCanUndo(result.canUndo);
        setCanRedo(result.canRedo);
        if (inputRef.current) {
          inputRef.current.textContent = result.text;
          inputRef.current.focus();
        }
      }
    } catch (error) {
      console.error('Undo failed:', error);
    }
  }, [sessionId, onChange]);

  const handleRedo = useCallback(async () => {
    if (!sessionId) return;
    try {
      const result = await textEditorService.redo(sessionId);
      if (result) {
        onChange(result.text);
        setCanUndo(result.canUndo);
        setCanRedo(result.canRedo);
        if (inputRef.current) {
          inputRef.current.textContent = result.text;
          inputRef.current.focus();
        }
      }
    } catch (error) {
      console.error('Redo failed:', error);
    }
  }, [sessionId, onChange]);

  const handleContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();

      // Find if cursor is on a misspelled word
      const range = document.caretRangeFromPoint(event.clientX, event.clientY);
      if (!range) return;

      const offset = range.startOffset;
      const error = spellingErrors.find(
        (e) => offset >= e.position && offset <= e.position + e.length
      );

      if (error) {
        setContextMenu({
          x: event.clientX,
          y: event.clientY,
          word: error.word,
          suggestions: error.suggestions,
          position: error.position,
        });
      }
    },
    [spellingErrors]
  );

  const handleSuggestSpelling = useCallback(
    (suggestion: string) => {
      if (!value || !contextMenu) return;

      const newText =
        value.slice(0, contextMenu.position) +
        suggestion +
        value.slice(contextMenu.position + contextMenu.word.length);

      onChange(newText);
      setContextMenu(null);

      if (inputRef.current) {
        inputRef.current.textContent = newText;
        inputRef.current.focus();
      }
    },
    [value, contextMenu, onChange]
  );

  const handleSave = useCallback(() => {
    onSave(value);
    onClose();
  }, [value, onSave, onClose]);

  if (!isOpen) return null;

  return (
    <div className="wp-editor-modal">
      <div className="wp-overlay" onClick={onClose} />
      <div className="wp-container" ref={editorRef}>
        {/* Header */}
        <div className="wp-header">
          <h2 className="wp-title">{title}</h2>
          <button className="wp-close-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="wp-toolbar">
          <div className="wp-toolbar-group">
            <button
              className="wp-tool-btn"
              onClick={handleUndo}
              disabled={!canUndo}
              title="Undo"
            >
              <Undo2 size={18} />
            </button>
            <button
              className="wp-tool-btn"
              onClick={handleRedo}
              disabled={!canRedo}
              title="Redo"
            >
              <Redo2 size={18} />
            </button>
          </div>

          <div className="wp-toolbar-divider" />

          <div className="wp-toolbar-group">
            <button
              className="wp-tool-btn"
              title="Bold"
              onClick={() => document.execCommand('bold', false)}
            >
              <Bold size={18} />
            </button>
            <button
              className="wp-tool-btn"
              title="Italic"
              onClick={() => document.execCommand('italic', false)}
            >
              <Italic size={18} />
            </button>
            <button
              className="wp-tool-btn"
              title="Underline"
              onClick={() => document.execCommand('underline', false)}
            >
              <Underline size={18} />
            </button>
          </div>

          <div className="wp-toolbar-spacer" />

          <div className="wp-toolbar-group">
            <button className="wp-save-btn" onClick={handleSave}>
              Save
            </button>
            <button className="wp-cancel-btn" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>

        {/* Editor Area */}
        <div className="wp-editor-area">
          <div
            ref={inputRef}
            className="wp-editor-content"
            contentEditable
            onInput={handleInput}
            onContextMenu={handleContextMenu}
            suppressContentEditableWarning
          >
            {value}
          </div>

          {/* Context Menu */}
          {contextMenu && (
            <div
              className="wp-context-menu"
              style={{ top: contextMenu.y, left: contextMenu.x }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="wp-context-word">{contextMenu.word}</div>
              <div className="wp-context-divider" />
              {contextMenu.suggestions.length > 0 ? (
                <>
                  {contextMenu.suggestions.slice(0, 5).map((suggestion, idx) => (
                    <button
                      key={idx}
                      className="wp-context-item"
                      onClick={() => handleSuggestSpelling(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                  <div className="wp-context-divider" />
                </>
              ) : null}
              <button
                className="wp-context-item wp-context-ignore"
                onClick={() => setContextMenu(null)}
              >
                Ignore
              </button>
              <button
                className="wp-context-item wp-context-add"
                onClick={async () => {
                  await spellCheckerService.addToDictionary(contextMenu.word);
                  setSpellingErrors(
                    spellingErrors.filter((e) => e.word !== contextMenu.word)
                  );
                  setContextMenu(null);
                }}
              >
                Add to Dictionary
              </button>
            </div>
          )}
        </div>

        {/* Status Bar */}
        <div className="wp-status-bar">
          <span>{value.length} characters</span>
          <span>{value.split('\n').length} lines</span>
          {spellingErrors.length > 0 && (
            <span className="wp-spell-count">{spellingErrors.length} misspellings</span>
          )}
        </div>
      </div>
    </div>
  );
}
