import { useEffect, useRef } from 'react';
import { X, Bold, Italic, Underline, List, ListOrdered, RotateCcw, Tag } from 'lucide-react';

export interface MarkupToken {
  id: string;
  label: string;
  prefix?: string;
  pattern?: string;
}

interface TextEditorModalProps {
  isOpen: boolean;
  title: string;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: (value: string) => void;
  markupTokens?: MarkupToken[];
}

export function TextEditorModal({
  isOpen,
  title,
  value,
  onChange,
  onClose,
  onSave,
  markupTokens = [],
}: TextEditorModalProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
      // Focus at end of text
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length
      );
    }
  }, [isOpen]);

  const handleDone = () => {
    onSave(value);
    onClose();
  };

  const insertFormatting = (before: string, after: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);
    const newValue = 
      value.substring(0, start) +
      before +
      selectedText +
      after +
      value.substring(end);
    
    onChange(newValue);
    
    // Restore selection after state update
    setTimeout(() => {
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(
          start + before.length,
          start + before.length + selectedText.length
        );
      }
    }, 0);
  };

  const insertBulletList = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const before = value.substring(0, lineStart);
    const after = value.substring(lineStart);
    
    const newValue = before + '• ' + after;
    onChange(newValue);

    setTimeout(() => {
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(lineStart + 2, lineStart + 2);
      }
    }, 0);
  };

  const insertNumberedList = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const before = value.substring(0, lineStart);
    const after = value.substring(lineStart);
    
    // Count existing numbered items to get the next number
    const lines = before.split('\n');
    let maxNum = 0;
    lines.forEach(line => {
      const match = line.match(/^(\d+)\./);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
    });
    
    const newValue = before + (maxNum + 1) + '. ' + after;
    onChange(newValue);

    setTimeout(() => {
      if (textarea) {
        textarea.focus();
        const prefix = (maxNum + 1) + '. ';
        textarea.setSelectionRange(lineStart + prefix.length, lineStart + prefix.length);
      }
    }, 0);
  };

  const clearFormatting = () => {
    onChange('');
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }, 0);
  };

  const insertMarkupToken = (token: MarkupToken) => {
    const textarea = textareaRef.current;
    if (!textarea || !token.prefix) return;

    const start = textarea.selectionStart;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = value.indexOf('\n', start);
    const actualLineEnd = lineEnd === -1 ? value.length : lineEnd;
    
    const before = value.substring(0, lineStart);
    const after = value.substring(actualLineEnd);
    const prefix = token.prefix + ' ';
    
    const newValue = before + prefix + after;
    onChange(newValue);

    setTimeout(() => {
      if (textarea) {
        textarea.focus();
        // Position cursor after the prefix
        textarea.setSelectionRange(lineStart + prefix.length, lineStart + prefix.length);
      }
    }, 0);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-bg-light border border-border rounded-lg shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col max-h-screen">
        {/* Header */}
        <div className="flex items-center justify-between py-3 px-4 border-b border-border flex-shrink-0">
          <h2 className="text-lg font-display font-semibold text-fg-primary">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-bg-dark rounded transition-colors"
            aria-label="Close editor"
          >
            <X size={20} className="text-fg-secondary" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="bg-bg-dark border-b border-border px-3 py-2 flex flex-wrap gap-1 flex-shrink-0">
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
          
          {/* Markup Tokens (if available) */}
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
          
          <div className="w-px bg-border mx-1"></div>
          
          <button
            onClick={clearFormatting}
            title="Clear All Text"
            className="p-2 hover:bg-bg-light rounded transition-colors text-fg-secondary hover:text-status-danger"
          >
            <RotateCcw size={18} />
          </button>
        </div>

        {/* Editor Area */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-bg-dark text-fg-primary border-none px-4 py-3 font-mono text-sm focus:outline-none resize-none"
          spellCheck="true"
          placeholder="Enter your text here. Use **text** for bold, *text* for italic, __text__ for underline..."
        />

        {/* Footer */}
        <div className="flex items-center justify-between py-3 px-4 border-t border-border flex-shrink-0 bg-bg-dark">
          <div className="text-xs text-fg-secondary">
            {value.length} character{value.length !== 1 ? 's' : ''} • {value.split('\n').length} line{value.split('\n').length !== 1 ? 's' : ''}
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
  );
}
