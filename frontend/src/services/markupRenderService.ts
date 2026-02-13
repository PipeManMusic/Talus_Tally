/**
 * Markup Render Service
 * 
 * Pure utility for parsing markup patterns and converting to styled HTML.
 * No side effects - pure functions only.
 * 
 * This service takes:
 * - Plain text content
 * - Markup token definitions (from template)
 * 
 * And returns:
 * - Styled HTML with proper escaping
 * - Ranges of formatted text
 */

export interface MarkupToken {
  id: string;
  label: string;
  prefix?: string;
  pattern?: string;
  format_scope?: 'line' | 'prefix' | 'inline';
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

export interface StyledRange {
  start: number;
  end: number;
  tokenId: string;
  format: MarkupToken['format'];
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

/**
 * Find all ranges in text that match markup patterns
 */
function findMarkupRanges(text: string, tokens: MarkupToken[]): StyledRange[] {
  const ranges: StyledRange[] = [];

  for (const token of tokens) {
    if (!token.prefix && !token.pattern) {
      continue;
    }

    if (token.format_scope === 'line') {
      // Line-based markup: token.prefix at start of line
      if (token.prefix) {
        const lines = text.split('\n');
        let currentPos = 0;

        for (const line of lines) {
          if (line.startsWith(token.prefix)) {
            const contentStart = currentPos + token.prefix.length;
            const contentEnd = currentPos + line.length;
            ranges.push({
              start: currentPos,
              end: contentEnd,
              tokenId: token.id,
              format: token.format,
            });
          }
          currentPos += line.length + 1; // +1 for newline
        }
      }
    } else if (token.format_scope === 'prefix' || token.format_scope === 'inline') {
      // Prefix-based markup: token.prefix marks start, continues until newline or next prefix
      if (token.prefix) {
        let searchPos = 0;
        while (true) {
          const index = text.indexOf(token.prefix, searchPos);
          if (index === -1) break;

          // Find end: either next prefix of same type, or end of line
          let endPos = index + token.prefix.length;
          const nextPrefixIndex = text.indexOf(token.prefix, endPos);
          const nextNewlineIndex = text.indexOf('\n', endPos);

          if (nextNewlineIndex !== -1 && (nextPrefixIndex === -1 || nextNewlineIndex < nextPrefixIndex)) {
            endPos = nextNewlineIndex;
          } else if (nextPrefixIndex !== -1) {
            endPos = nextPrefixIndex;
          } else {
            endPos = text.length;
          }

          ranges.push({
            start: index,
            end: endPos,
            tokenId: token.id,
            format: token.format,
          });

          searchPos = endPos;
        }
      }
    }
  }

  // Merge overlapping ranges (later tokens take precedence)
  return ranges.sort((a, b) => a.start - b.start);
}

/**
 * Build HTML with styled spans for marked-up text
 */
export function renderMarkup(text: string, tokens: MarkupToken[]): string {
  if (!text) return '';

  const ranges = findMarkupRanges(text, tokens);
  if (ranges.length === 0) {
    return escapeHtml(text);
  }

  let html = '';
  let lastEnd = 0;

  for (const range of ranges) {
    // Add unformatted text before this range
    if (lastEnd < range.start) {
      html += escapeHtml(text.substring(lastEnd, range.start));
    }

    // Add formatted text
    const rangeText = escapeHtml(text.substring(range.start, range.end));
    const styles = buildHtmlStyles(range.format);
    html += `<span class="markup-token" data-token="${range.tokenId}" style="${styles}">${rangeText}</span>`;

    lastEnd = range.end;
  }

  // Add remaining unformatted text
  if (lastEnd < text.length) {
    html += escapeHtml(text.substring(lastEnd, text.length));
  }

  return html;
}

/**
 * Convert format object to inline CSS styles
 */
function buildHtmlStyles(format?: MarkupToken['format']): string {
  if (!format) return '';

  const styles: string[] = [];

  if (format.bold) {
    styles.push('font-weight: bold');
  }
  if (format.italic) {
    styles.push('font-style: italic');
  }
  if (format.underline) {
    styles.push('text-decoration: underline');
  }
  if (format.color) {
    styles.push(`color: ${format.color}`);
  }
  if (format.background_color) {
    styles.push(`background-color: ${format.background_color}`);
  }
  if (format.font_size) {
    styles.push(`font-size: ${format.font_size}`);
  }
  if (format.align) {
    styles.push(`text-align: ${format.align}`);
  }

  return styles.join('; ');
}

/**
 * Get styles for CSS class
 */
export function getMarkupTokenStyles(format?: MarkupToken['format']): React.CSSProperties {
  if (!format) return {};

  const styles: React.CSSProperties = {};

  if (format.bold) {
    styles.fontWeight = 'bold';
  }
  if (format.italic) {
    styles.fontStyle = 'italic';
  }
  if (format.underline) {
    styles.textDecoration = 'underline';
  }
  if (format.color) {
    styles.color = format.color;
  }
  if (format.background_color) {
    styles.backgroundColor = format.background_color;
  }
  if (format.font_size) {
    styles.fontSize = format.font_size;
  }
  if (format.align) {
    styles.textAlign = format.align as any;
  }

  return styles;
}

/**
 * Parse markup ranges from text (returns data structure, not HTML)
 * Useful for components that want to render themselves
 */
export function parseMarkup(text: string, tokens: MarkupToken[]): StyledRange[] {
  return findMarkupRanges(text, tokens);
}

export const markupRenderService = {
  renderMarkup,
  parseMarkup,
  getMarkupTokenStyles,
};
