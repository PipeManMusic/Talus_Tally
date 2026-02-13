/**
 * Template-Aware Text Editor
 * 
 * Architecture:
 * - Uses <textarea> for stable cursor (no contentEditable issues)
 * - Toolbar generated from template configuration
 * - Buttons insert template syntax (e.g., ** wraps bold)
 * - Overlay render layer shows styled preview
 * - Spell checking with context menu
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  X,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Undo2,
  Redo2,
} from 'lucide-react';
import { textEditorService } from '../../services/textEditorService';
import type { TextEditState } from '../../services/textEditorService';
import { markupRenderService, type MarkupToken } from '../../services/markupRenderService';
import { spellCheckerService } from '../../services/spellCheckerService';
import '../../styles/template-aware-editor.css';

interface TemplateConfig {
  name: string;
  features?: {
    spell_check?: boolean;
    undo_redo?: boolean;
  };
  formatting?: Record<string, any>;
  lists?: Record<string, any>;
  indentation?: {
    enabled?: boolean;
    tab_size?: number;
    max_levels?: number;
  };
  tokens?: MarkupToken[];
}

interface EditorProps {
  isOpen: boolean;
  title: string;
  value: string;
  propertyId: string;
  nodeId: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: (value: string) => void;
  template?: TemplateConfig;
  markupProfile?: string;
}

interface SpellingError {
  word: string;
  suggestions: string[];
  position: number;
  length: number;
}

export function TemplateAwareEditor({
  isOpen,
  title,
  value,
  propertyId,
  nodeId,
  onChange,
  onClose,
  onSave,
  template,
  markupProfile,
}: EditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const renderLayerRef = useRef<HTMLDivElement>(null);
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
  const [indentLevel, setIndentLevel] = useState(0);
  const [loadedTemplate, setLoadedTemplate] = useState<TemplateConfig | undefined>(template);
  const [viewMode, setViewMode] = useState<'formatted' | 'raw'>('formatted');
  const [currentTokenAtCursor, setCurrentTokenAtCursor] = useState<string>('');
  const spellCheckTimer = useRef<NodeJS.Timeout | null>(null);
  const lineTagsRef = useRef<Map<number, string>>(new Map()); // Track which tags are on which lines

  // Strip tag prefixes from text for formatted mode editing
  const stripTagPrefixes = (text: string, tokenList: MarkupToken[]): string => {
    if (viewMode === 'raw' || tokenList.length === 0) return text;
    
    let result = text;
    const lines = result.split('\n');
    
    // For each line, remove any token prefix from the start
    const cleanedLines = lines.map((line, lineIdx) => {
      for (const token of tokenList) {
        if (!token.prefix || token.format_scope !== 'line') continue;
        if (line.startsWith(token.prefix)) {
          lineTagsRef.current.set(lineIdx, token.id);
          return line.substring(token.prefix.length);
        }
      }
      lineTagsRef.current.delete(lineIdx);
      return line;
    });
    
    return cleanedLines.join('\n');
  };

  const mapDisplayOffsetToRaw = (
    rawText: string,
    displayText: string,
    offset: number,
    tokenList: MarkupToken[]
  ) => {
    if (viewMode !== 'formatted') return offset;

    const lineTokens = tokenList.filter((t) => t.format_scope === 'line' && t.prefix);
    const rawLines = rawText.split('\n');
    const displayLines = displayText.split('\n');
    let rawPos = 0;
    let displayPos = 0;

    for (let i = 0; i < displayLines.length; i += 1) {
      const rawLine = rawLines[i] || '';
      const displayLine = displayLines[i] || '';
      const prefixLength =
        lineTokens.find((t) => t.prefix && rawLine.startsWith(t.prefix))?.prefix?.length || 0;

      if (offset <= displayPos + displayLine.length) {
        return rawPos + prefixLength + (offset - displayPos);
      }

      rawPos += rawLine.length + 1;
      displayPos += displayLine.length + 1;
    }

    return rawText.length;
  };

  const mapRawOffsetToDisplay = (
    rawText: string,
    displayText: string,
    offset: number,
    tokenList: MarkupToken[]
  ) => {
    if (viewMode !== 'formatted') return offset;

    const lineTokens = tokenList.filter((t) => t.format_scope === 'line' && t.prefix);
    const rawLines = rawText.split('\n');
    const displayLines = displayText.split('\n');
    let rawPos = 0;
    let displayPos = 0;

    for (let i = 0; i < rawLines.length; i += 1) {
      const rawLine = rawLines[i] || '';
      const displayLine = displayLines[i] || '';
      const prefixLength =
        lineTokens.find((t) => t.prefix && rawLine.startsWith(t.prefix))?.prefix?.length || 0;

      if (offset <= rawPos + rawLine.length) {
        const adjusted = Math.max(0, offset - rawPos - prefixLength);
        return displayPos + Math.min(displayLine.length, adjusted);
      }

      rawPos += rawLine.length + 1;
      displayPos += displayLine.length + 1;
    }

    return displayText.length;
  };

  // Re-inject tag prefixes after editing in formatted mode
  const reinjectTagPrefixes = (cleanText: string, tokenList: MarkupToken[]): string => {
    if (viewMode === 'raw' || tokenList.length === 0) return cleanText;
    
    const lines = cleanText.split('\n');
    const result = lines.map((line, lineIdx) => {
      const tokenId = lineTagsRef.current.get(lineIdx);
      if (!tokenId) return line;
      
      const token = tokenList.find(t => t.id === tokenId);
      if (!token || !token.prefix) return line;
      
      return `${token.prefix}${line}`;
    });
    
    return result.join('\n');
  };

  // Inject prefixes into tokens (format: [TOKEN_ID] in uppercase)
  const injectTokenPrefixes = (tokensArray: MarkupToken[]): MarkupToken[] => {
    return tokensArray.map((token) => {
      // Always use bracket format: [TOKEN_ID]
      return {
        ...token,
        prefix: `[${token.id.toUpperCase()}]`,
      };
    });
  };

  // Load markup profile if specified
  useEffect(() => {
    console.log('[TemplateAwareEditor] Profile loading effect triggered:', {
      markupProfile,
      isDefined: !!markupProfile,
    });

    if (!markupProfile) {
      console.log('[TemplateAwareEditor] No markup profile specified, using template');
      if (template) {
        const templateWithPrefixes: TemplateConfig = {
          ...template,
          tokens: injectTokenPrefixes(template.tokens || []),
        };
        setLoadedTemplate(templateWithPrefixes);
      } else {
        setLoadedTemplate(template);
      }
      return;
    }

    const loadProfile = async () => {
      try {
        console.log(`[TemplateAwareEditor] Starting to load markup profile: ${markupProfile}`);
        // Fetch the markup profile from the API
        const response = await fetch(`/api/v1/markup/${markupProfile}`);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[TemplateAwareEditor] API error (${response.status}):`, errorText);
          setLoadedTemplate(template);
          return;
        }
        
        const responseText = await response.text();
        console.log(`[TemplateAwareEditor] Raw API response:`, responseText);
        
        if (!responseText) {
          console.error('[TemplateAwareEditor] Empty response from API');
          setLoadedTemplate(template);
          return;
        }
        
        let profileData;
        try {
          profileData = JSON.parse(responseText);
        } catch (parseError) {
          console.error(`[TemplateAwareEditor] Failed to parse JSON response:`, parseError, 'Response:', responseText);
          setLoadedTemplate(template);
          return;
        }
        
        console.log(`[TemplateAwareEditor] Loaded markup profile "${markupProfile}":`, profileData);
        
        const profileConfig: TemplateConfig = {
          name: profileData.name || profileData.label || markupProfile,
          tokens: injectTokenPrefixes(profileData.tokens || []),
          features: profileData.features || {},
          formatting: profileData.formatting,
          lists: profileData.lists,
          indentation: profileData.indentation,
        };
        
        console.log(`[TemplateAwareEditor] Tokens loaded: ${profileConfig.tokens?.length || 0} tokens with injected prefixes`);
        console.log('[TemplateAwareEditor] Token prefixes:', profileConfig.tokens?.map(t => ({ id: t.id, prefix: t.prefix })));
        setLoadedTemplate(profileConfig);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : '';
        console.error(`[TemplateAwareEditor] Error loading markup profile ${markupProfile}: ${errorMessage}`, errorStack);
        setLoadedTemplate(template);
      }
    };

    loadProfile();
  }, [markupProfile, template]);

  const tokens = loadedTemplate?.tokens || [];
  const spellCheckEnabled = loadedTemplate?.features?.spell_check ?? true;

  // Display value: clean version in formatted mode, raw in raw mode
  const displayValue = viewMode === 'formatted' ? stripTagPrefixes(value, tokens) : value;

  // Debug: Log component props on mount and when markupProfile changes
  useEffect(() => {
    console.log('[TemplateAwareEditor] Component mounted/updated:', {
      markupProfile,
      markupProfileDefined: markupProfile !== undefined,
      template: template?.name,
      isOpen,
    });
  }, [markupProfile, template, isOpen]);

  // Log when template loads
  useEffect(() => {
    console.log(`[TemplateAwareEditor] Loaded template:`, {
      name: loadedTemplate?.name,
      tokensCount: tokens.length,
      tokens: tokens.map(t => ({ id: t.id, label: t.label, prefix: t.prefix })),
      features: loadedTemplate?.features,
    });
  }, [loadedTemplate]);

  // Initialize session
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
        setCanUndo(state.canUndo);
        setCanRedo(state.canRedo);
      } catch (error) {
        console.error('Failed to create session:', error);
      }
    };

    initSession();
  }, [isOpen, propertyId, nodeId]);

  // Cleanup
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

  // Auto-focus
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  // Sync render layer scroll with textarea
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (renderLayerRef.current) {
      renderLayerRef.current.scrollTop = e.currentTarget.scrollTop;
      renderLayerRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const escapeHtml = (text: string) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
  };

  const buildInlineStyles = (format?: MarkupToken['format']) => {
    if (!format) return '';
    const styles: string[] = [];

    if (format.bold) styles.push('font-weight: bold');
    if (format.italic) styles.push('font-style: italic');
    if (format.underline) styles.push('text-decoration: underline');
    if (format.color) styles.push(`color: ${format.color}`);
    if (format.background_color) styles.push(`background-color: ${format.background_color}`);
    if (format.font_size) styles.push(`font-size: ${format.font_size}`);
    if (format.align) styles.push(`text-align: ${format.align}`);

    return styles.join('; ');
  };

  const getPrefixOccurrences = (text: string, tokenList: MarkupToken[]) => {
    const occurrences: Array<{ index: number; token: MarkupToken }> = [];

    for (const token of tokenList) {
      if (!token.prefix) continue;

      if (token.format_scope === 'line') {
        const lines = text.split('\n');
        let currentPos = 0;
        for (const line of lines) {
          if (line.startsWith(token.prefix)) {
            occurrences.push({ index: currentPos, token });
          }
          currentPos += line.length + 1;
        }
      } else {
        let searchPos = 0;
        while (true) {
          const index = text.indexOf(token.prefix, searchPos);
          if (index === -1) break;
          occurrences.push({ index, token });
          searchPos = index + token.prefix.length;
        }
      }
    }

    return occurrences.sort((a, b) => a.index - b.index);
  };

  const applyTextTransform = (text: string, format?: MarkupToken['format']) => {
    if (!format?.text_transform || format.text_transform === 'none') {
      return text;
    }
    if (format.text_transform === 'uppercase') {
      return text.toUpperCase();
    }
    if (format.text_transform === 'lowercase') {
      return text.toLowerCase();
    }
    if (format.text_transform === 'capitalize') {
      return text.replace(/\b\w/g, (char) => char.toUpperCase());
    }
    return text;
  };

  const buildFormattedHtml = (text: string, tokenList: MarkupToken[]) => {
    if (!text) return '';

    const lineTokens = tokenList.filter((token) => token.prefix && token.format_scope === 'line');

    const buildHighlightedHtml = (
      source: string,
      ranges: Array<{ start: number; end: number }>,
      format?: MarkupToken['format']
    ) => {
      const transformed = applyTextTransform(source, format);
      if (ranges.length === 0) {
        return escapeHtml(transformed);
      }

      const sorted = ranges
        .filter((range) => range.end > range.start)
        .sort((a, b) => a.start - b.start);

      let html = '';
      let lastIndex = 0;
      for (const range of sorted) {
        if (range.start < lastIndex) continue;
        if (range.start > lastIndex) {
          html += escapeHtml(transformed.slice(lastIndex, range.start));
        }
        html += `<span class="tae-spelling-error">${escapeHtml(
          transformed.slice(range.start, range.end)
        )}</span>`;
        lastIndex = range.end;
      }
      if (lastIndex < transformed.length) {
        html += escapeHtml(transformed.slice(lastIndex));
      }
      return html;
    };

    const lines = text.split('\n');
    const renderedLines: string[] = [];
    let currentPos = 0;

    for (const line of lines) {
      let working = line;
      let lineFormat: MarkupToken['format'] | undefined;
      let prefixLength = 0;

      for (const token of lineTokens) {
        if (token.prefix && working.startsWith(token.prefix)) {
          prefixLength = token.prefix.length;
          working = working.slice(prefixLength);
          lineFormat = token.format;
          break;
        }
      }

      const lineStartIndex = currentPos;
      const lineEndIndex = currentPos + line.length;

      const ranges = spellingErrors
        .filter((err) => err.position >= lineStartIndex && err.position < lineEndIndex)
        .map((err) => {
          const start = err.position - lineStartIndex - prefixLength;
          const end = start + err.length;
          if (end <= 0 || start >= working.length) {
            return null;
          }
          return {
            start: Math.max(0, start),
            end: Math.min(working.length, end),
          };
        })
        .filter((range): range is { start: number; end: number } => range !== null);

      const htmlLine = buildHighlightedHtml(working, ranges, lineFormat);
      const lineStyle = buildInlineStyles(lineFormat);
      if (lineStyle) {
        renderedLines.push(`<div class="markup-line" style="${lineStyle}">${htmlLine}</div>`);
      } else {
        renderedLines.push(`<div class="markup-line">${htmlLine}</div>`);
      }

      currentPos += line.length + 1;
    }

    return renderedLines.join('');
  };

  // Update render layer when text changes
  const renderHtml = useMemo(() => {
    if (!isOpen || viewMode !== 'formatted') {
      return null;
    }
    return buildFormattedHtml(value, tokens);
  }, [isOpen, value, tokens, viewMode, spellingErrors]);

  // Debug logging
  useEffect(() => {
    if (tokens.length > 0 && renderHtml) {
      console.log(`[TemplateAwareEditor] Rendered ${tokens.length} tokens, HTML length: ${renderHtml.length}`);
    }
  }, [renderHtml, tokens.length]);

  // Spell check with debounce
  useEffect(() => {
    if (!isOpen || !spellCheckEnabled || !value) {
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
  }, [value, isOpen, spellCheckEnabled]);

  const handleTextChange = useCallback(
    async (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newText = event.currentTarget.value;
      // If in formatted mode, convert the clean text back to tagged version
      const textToSave = viewMode === 'formatted' ? reinjectTagPrefixes(newText, tokens) : newText;
      onChange(textToSave);

      if (sessionId) {
        try {
          const operation = {
            beforeText: value,
            afterText: textToSave,
            cursorPosition: event.currentTarget.selectionStart,
            selectionStart: event.currentTarget.selectionStart,
            selectionEnd: event.currentTarget.selectionEnd,
            operationType: 'replace' as const,
          };
          const newState = await textEditorService.applyEdit(sessionId, operation);
          setCanUndo(newState.canUndo);
          setCanRedo(newState.canRedo);
        } catch (error) {
          console.error('Failed to apply edit:', error);
        }
      }

      // Detect which token is at cursor
      setTimeout(() => detectTokenAtCursor(), 0);
    },
    [sessionId, value, onChange]
  );

  const handleCursorMove = useCallback(() => {
    // Detect which token is at cursor when cursor moves
    detectTokenAtCursor();
  }, []);

  const applyProgrammaticEdit = useCallback(
    async (newText: string, selectionStart: number, selectionEnd: number) => {
      onChange(newText);

      if (sessionId) {
        try {
          const operation = {
            beforeText: value,
            afterText: newText,
            cursorPosition: selectionEnd,
            selectionStart,
            selectionEnd,
            operationType: 'replace' as const,
          };
          const newState = await textEditorService.applyEdit(sessionId, operation);
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
      if (result && textareaRef.current) {
        onChange(result.text);
        setCanUndo(result.canUndo);
        setCanRedo(result.canRedo);
        textareaRef.current.selectionStart = result.cursorPosition;
        textareaRef.current.selectionEnd = result.cursorPosition;
      }
    } catch (error) {
      console.error('Undo failed:', error);
    }
  }, [sessionId, onChange]);

  const handleRedo = useCallback(async () => {
    if (!sessionId) return;
    try {
      const result = await textEditorService.redo(sessionId);
      if (result && textareaRef.current) {
        onChange(result.text);
        setCanUndo(result.canUndo);
        setCanRedo(result.canRedo);
        textareaRef.current.selectionStart = result.cursorPosition;
        textareaRef.current.selectionEnd = result.cursorPosition;
      }
    } catch (error) {
      console.error('Redo failed:', error);
    }
  }, [sessionId, onChange]);

  // Insert markup at cursor or wrap selection
  const insertMarkup = async (prefix: string, suffix: string = prefix) => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end) || 'text';
    const before = value.substring(0, start);
    const after = value.substring(end);

    const newText = `${before}${prefix}${selectedText}${suffix}${after}`;
    const newStart = start + prefix.length;
    const newEnd = newStart + selectedText.length;
    await applyProgrammaticEdit(newText, newStart, newEnd);

    // Restore focus and position cursor inside markup
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newStart, newEnd);
    }, 0);
  };

  // Insert list item or indent
  const insertBullet = async () => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const before = value.substring(0, start);
    const after = value.substring(start);

    // Check if we're at the start of a line
    const lastNewline = before.lastIndexOf('\n');
    const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;
    const indent = '  '.repeat(indentLevel);

    let newText: string;
    if (start === lineStart || before[start - 1] === '\n') {
      // At line start, insert bullet
      newText = `${before}${indent}- ${after}`;
    } else {
      // Mid-line, go to next line
      newText = `${before}\n${indent}- ${after}`;
    }

    const cursorPos = newText.length;
    await applyProgrammaticEdit(newText, cursorPos, cursorPos);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(cursorPos, cursorPos);
    }, 0);
  };

  const insertLinePrefix = async (prefix: string) => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const before = value.substring(0, start);
    const after = value.substring(start);

    // Check if we're at the start of a line
    const lastNewline = before.lastIndexOf('\n');
    const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;

    let newText: string;
    if (start === lineStart || before[start - 1] === '\n') {
      // At line start, insert prefix
      newText = `${before}${prefix}${after}`;
    } else {
      // Mid-line, go to next line
      newText = `${before}\n${prefix}${after}`;
    }

    const newStart = newText.indexOf(prefix) + prefix.length;
    await applyProgrammaticEdit(newText, newStart, newStart);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newStart, newStart);
    }, 0);
  };

  const insertNumbered = async () => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const before = value.substring(0, start);
    const after = value.substring(start);

    const lastNewline = before.lastIndexOf('\n');
    const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;
    const indent = '  '.repeat(indentLevel);

    // Count current list number
    const linesBefore = before.substring(0, lineStart).split('\n');
    let itemNumber = 1;
    for (let i = linesBefore.length - 2; i >= 0; i--) {
      const match = linesBefore[i].match(/^\s*(\d+)\./);
      if (match) {
        itemNumber = parseInt(match[1]) + 1;
        break;
      }
    }

    let newText: string;
    if (start === lineStart || before[start - 1] === '\n') {
      newText = `${before}${indent}${itemNumber}. ${after}`;
    } else {
      newText = `${before}\n${indent}${itemNumber}. ${after}`;
    }

    const cursorPos = newText.length;
    await applyProgrammaticEdit(newText, cursorPos, cursorPos);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(cursorPos, cursorPos);
    }, 0);
  };

  const increaseIndent = () => {
    const maxLevels = template?.indentation?.max_levels ?? 5;
    setIndentLevel(Math.min(indentLevel + 1, maxLevels));
  };

  const decreaseIndent = () => {
    setIndentLevel(Math.max(indentLevel - 1, 0));
  };

  const detectTokenAtCursor = () => {
    if (!textareaRef.current) {
      setCurrentTokenAtCursor('');
      return;
    }

    const cursorPos = textareaRef.current.selectionStart;
    const occurrences = getPrefixOccurrences(value, tokens);

    // Find current line boundaries
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastNewlineBeforeCursor = textBeforeCursor.lastIndexOf('\n');
    const lineStart = lastNewlineBeforeCursor === -1 ? 0 : lastNewlineBeforeCursor + 1;
    const nextNewline = value.indexOf('\n', cursorPos);
    const lineEnd = nextNewline === -1 ? value.length : nextNewline;

    // First, check if cursor is directly within any token prefix
    for (const occurrence of occurrences) {
      const token = occurrence.token;
      const prefixLength = token.prefix?.length || 0;
      
      if (token.format_scope === 'line') {
        // For line tokens, check if cursor is on that line
        if (occurrence.index >= lineStart && occurrence.index < lineEnd) {
          if (cursorPos >= occurrence.index && cursorPos <= occurrence.index + prefixLength) {
            setCurrentTokenAtCursor(token.id);
            return;
          }
        }
      } else {
        // For inline tokens, check if cursor is within the prefix
        if (cursorPos >= occurrence.index && cursorPos < occurrence.index + prefixLength) {
          setCurrentTokenAtCursor(token.id);
          return;
        }
      }
    }

    // If no token directly at cursor, check if ANY token is on the current line
    for (const occurrence of occurrences) {
      const token = occurrence.token;
      if (token.format_scope === 'line' && occurrence.index >= lineStart && occurrence.index < lineEnd) {
        setCurrentTokenAtCursor(token.id);
        return;
      }
    }

    // No token on current line
    setCurrentTokenAtCursor('');
  };

  const applyMarkupTag = async (token: MarkupToken) => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const hasSelection = start !== end;

    const displayText = viewMode === 'formatted' ? displayValue : value;
    const startRaw = mapDisplayOffsetToRaw(value, displayText, start, tokens);
    const endRaw = mapDisplayOffsetToRaw(value, displayText, end, tokens);

    const before = value.substring(0, startRaw);
    const selected = value.substring(startRaw, endRaw);
    const after = value.substring(endRaw);

    let newText: string;
    let newStart: number;
    let newEnd: number;
    const prefix = token.prefix || '';

    if (token.format_scope === 'line') {
      // For line-scoped tags, insert prefix at the start of each selected line
      const linePrefixes = tokens
        .filter((t) => t.format_scope === 'line' && t.prefix)
        .map((t) => t.prefix as string);

      const blockStart = value.lastIndexOf('\n', startRaw - 1) + 1;
      const blockEndIndex = value.indexOf('\n', endRaw);
      const blockEnd = blockEndIndex === -1 ? value.length : blockEndIndex;
      const blockText = value.substring(blockStart, blockEnd);

      const selectionStartInBlock = startRaw - blockStart;
      const selectionEndInBlock = endRaw - blockStart;

      const blockLines = blockText.split('\n');
      let addedBeforeStart = 0;
      let addedBeforeEnd = 0;
      let lineOffset = 0;

      const updatedLines = blockLines.map((line, idx) => {
        const hasAnyPrefix = linePrefixes.some((p) => line.startsWith(p));
        const shouldAddPrefix = !hasAnyPrefix && line !== '' && prefix;
        if (shouldAddPrefix) {
          if (selectionStartInBlock >= lineOffset) {
            addedBeforeStart += prefix.length;
          }
          if (selectionEndInBlock >= lineOffset) {
            addedBeforeEnd += prefix.length;
          }
        }
        lineOffset += line.length + 1;
        return shouldAddPrefix ? `${prefix}${line}` : line;
      });

      const updatedBlock = updatedLines.join('\n');
      newText = `${value.substring(0, blockStart)}${updatedBlock}${value.substring(blockEnd)}`;
      newStart = startRaw + addedBeforeStart;
      newEnd = hasSelection ? endRaw + addedBeforeEnd : newStart;
    } else {
      // For inline tags, wrap the selected text (or insert at cursor if no selection)
      if (hasSelection) {
        // Wrap selected text with prefix on both sides
        newText = `${before}${prefix}${selected}${prefix}${after}`;
        newStart = startRaw + prefix.length;
        newEnd = startRaw + prefix.length + selected.length;
      } else {
        // No selection: insert prefix at cursor, ready for user to type
        newText = `${before}${prefix}${after}`;
        newStart = startRaw + prefix.length;
        newEnd = newStart;
      }
    }

    if (newText === value) {
      return;
    }

    await applyProgrammaticEdit(newText, newStart, newEnd);
    const displayTextAfter = viewMode === 'formatted' ? stripTagPrefixes(newText, tokens) : newText;
    const displayStart = mapRawOffsetToDisplay(newText, displayTextAfter, newStart, tokens);
    const displayEnd = mapRawOffsetToDisplay(newText, displayTextAfter, newEnd, tokens);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(displayStart, displayEnd);
    }, 0);
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const textarea = e.currentTarget;
    const offset = textarea.selectionStart;

    const error = spellingErrors.find(
      (err) => offset >= err.position && offset <= err.position + err.length
    );

    if (error) {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        word: error.word,
        suggestions: error.suggestions,
        position: error.position,
      });
    } else {
      setContextMenu(null);
    }
  };

  const applySpellingSuggestion = (suggestion: string) => {
    if (!contextMenu) return;

    const newText =
      value.substring(0, contextMenu.position) +
      suggestion +
      value.substring(contextMenu.position + contextMenu.word.length);

    onChange(newText);
    setContextMenu(null);

    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        contextMenu.position + suggestion.length,
        contextMenu.position + suggestion.length
      );
    }
  };

  const dismissContextMenu = () => {
    if (contextMenu) {
      setContextMenu(null);
    }
  };

  const handleSave = () => {
    onSave(value);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="tae-modal">
      <div className="tae-overlay" onClick={dismissContextMenu} />
      <div className="tae-container" onClick={dismissContextMenu}>
        {/* Header */}
        <div className="tae-header">
          <h2 className="tae-title">{title}</h2>
          <button className="tae-close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="tae-toolbar">
          {/* Markup Tag Selector - always visible */}
          <div className="tae-toolbar-group">
            <select
              className="tae-markup-selector"
              value={currentTokenAtCursor}
              disabled={tokens.length === 0}
              onChange={(e) => {
                if (e.target.value) {
                  const token = tokens.find(t => t.id === e.target.value);
                  if (token) {
                    applyMarkupTag(token);
                  }
                }
              }}
              title={
                tokens.length === 0
                  ? "No markup tags available for this template"
                  : currentTokenAtCursor
                  ? `Current tag on this line: ${currentTokenAtCursor}. Select a new tag to apply.`
                  : "Select a tag to apply to selected text, or just insert at cursor"
              }
            >
              <option value="">
                {tokens.length === 0 ? "No markup tags" : currentTokenAtCursor ? `${currentTokenAtCursor} (current)` : "Apply Markup Tag..."}
              </option>
              {tokens.map((token) => (
                <option key={token.id} value={token.id}>
                  {token.label}
                </option>
              ))}
            </select>
          </div>

          <div className="tae-toolbar-divider" />

          {/* Undo/Redo */}
          <div className="tae-toolbar-group">
            <button
              className="tae-btn"
              onClick={handleUndo}
              disabled={!canUndo}
              title="Undo"
            >
              <Undo2 size={18} />
            </button>
            <button
              className="tae-btn"
              onClick={handleRedo}
              disabled={!canRedo}
              title="Redo"
            >
              <Redo2 size={18} />
            </button>
          </div>

          <div className="tae-toolbar-divider" />

          {/* Text Formatting */}
          <div className="tae-toolbar-group">
            <button
              className="tae-btn"
              onClick={() => insertMarkup('**', '**')}
              title="Bold"
            >
              <Bold size={18} />
            </button>
            <button
              className="tae-btn"
              onClick={() => insertMarkup('*', '*')}
              title="Italic"
            >
              <Italic size={18} />
            </button>
            <button
              className="tae-btn"
              onClick={() => insertMarkup('__', '__')}
              title="Underline"
            >
              <Underline size={18} />
            </button>
          </div>

          <div className="tae-toolbar-divider" />

          {/* Lists */}
          <div className="tae-toolbar-group">
            <button className="tae-btn" onClick={insertBullet} title="Bullet List">
              <List size={18} />
            </button>
            <button className="tae-btn" onClick={insertNumbered} title="Numbered List">
              <ListOrdered size={18} />
            </button>
          </div>

          <div className="tae-toolbar-divider" />

          {/* Indentation */}
          <div className="tae-toolbar-group">
            <label className="tae-indent-label">
              Indent: <span className="tae-indent-level">{indentLevel}</span>
            </label>
            <button className="tae-btn tae-btn-sm" onClick={decreaseIndent} title="Decrease indent">
              -
            </button>
            <button className="tae-btn tae-btn-sm" onClick={increaseIndent} title="Increase indent">
              +
            </button>
          </div>

          <div className="tae-toolbar-spacer" />

          {/* View Toggle */}
          <div className="tae-toolbar-group">
            <button
              className={`tae-btn ${viewMode === 'formatted' ? 'tae-btn-active' : ''}`}
              onClick={() => setViewMode('formatted')}
              title="Formatted view"
            >
              Formatted
            </button>
            <button
              className={`tae-btn ${viewMode === 'raw' ? 'tae-btn-active' : ''}`}
              onClick={() => setViewMode('raw')}
              title="Raw view"
            >
              Raw
            </button>
          </div>

          <div className="tae-toolbar-divider" />

          {/* Save/Cancel */}
          <div className="tae-toolbar-group">
            <button className="tae-save-btn" onClick={handleSave}>
              Save
            </button>
            <button className="tae-cancel-btn" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>

        {/* Editor Area */}
        <div className="tae-editor-wrapper">
          <textarea
            ref={textareaRef}
            className="tae-textarea"
            value={displayValue}
            onChange={handleTextChange}
            onScroll={handleScroll}
            onContextMenu={handleContextMenu}
            onClick={handleCursorMove}
            onKeyUp={handleCursorMove}
            placeholder="Start typing..."
            spellCheck="false"
            data-view-mode={viewMode}
          />
          {viewMode === 'formatted' && (
            <div className="tae-render-layer tae-render-layer-overlay" ref={renderLayerRef}>
              {renderHtml && (
                <div
                  className="tae-rendered-content"
                  dangerouslySetInnerHTML={{ __html: renderHtml }}
                />
              )}
            </div>
          )}
        </div>

        {/* Context Menu */}
        {contextMenu && (
          <div
            className="tae-context-menu"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="tae-context-word">{contextMenu.word}</div>
            <div className="tae-context-divider" />
            {contextMenu.suggestions.slice(0, 5).map((suggestion, idx) => (
              <button
                key={idx}
                className="tae-context-item"
                onClick={() => applySpellingSuggestion(suggestion)}
              >
                {suggestion}
              </button>
            ))}
            <div className="tae-context-divider" />
            <button
              className="tae-context-item"
              onClick={async () => {
                await spellCheckerService.addToDictionary(contextMenu.word);
                setSpellingErrors(spellingErrors.filter((e) => e.word !== contextMenu.word));
                setContextMenu(null);
              }}
            >
              Add to Dictionary
            </button>
            <button
              className="tae-context-item"
              onClick={() => setContextMenu(null)}
            >
              Ignore
            </button>
          </div>
        )}

        {/* Status Bar */}
        <div className="tae-status-bar">
          <span>{value.length} characters</span>
          <span>{value.split('\n').length} lines</span>
          {spellCheckEnabled && (
            <span className={`tae-spell-count ${spellingErrors.length > 0 ? 'tae-spell-error' : 'tae-spell-ok'}`}>
              {spellingErrors.length === 0 ? '✓ No errors' : `⚠ ${spellingErrors.length} misspellings`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
