/**
 * Tests for Markup Render Service
 * 
 * Pure function tests for markup parsing and rendering
 */

import { describe, it, expect } from 'vitest';
import {
  renderMarkup,
  parseMarkup,
  type MarkupToken,
  type StyledRange,
} from '../services/markupRenderService';

describe('markupRenderService', () => {
  const mockTokens: MarkupToken[] = [
    {
      id: 'bold',
      label: 'Bold',
      prefix: '**',
      format_scope: 'inline',
      format: { bold: true },
    },
    {
      id: 'italic',
      label: 'Italic',
      prefix: '*',
      format_scope: 'inline',
      format: { italic: true },
    },
    {
      id: 'scene',
      label: 'Scene Heading',
      prefix: 'INT. ',
      format_scope: 'line',
      format: { bold: true, text_transform: 'uppercase' },
    },
  ];

  describe('renderMarkup', () => {
    it('should return escaped HTML for plain text without markup', () => {
      const text = 'Hello world';
      const result = renderMarkup(text, []);
      expect(result).toBe('Hello world');
    });

    it('should escape HTML special characters', () => {
      const text = '<script>alert("xss")</script>';
      const result = renderMarkup(text, []);
      expect(result).toContain('&lt;script&gt;');
      expect(result).toContain('&lt;/script&gt;');
    });

    it('should apply inline markup with prefix', () => {
      const text = '**bold text** normal text';
      const result = renderMarkup(text, mockTokens);
      expect(result).toContain('class="markup-token"');
      expect(result).toContain('data-token="bold"');
      expect(result).toContain('font-weight: bold');
    });

    it('should handle multiple markup types', () => {
      const text = '**bold** and *italic*';
      const result = renderMarkup(text, mockTokens);
      expect(result).toContain('data-token="bold"');
      expect(result).toContain('data-token="italic"');
    });

    it('should handle line-based markup', () => {
      const text = 'INT. OFFICE - DAY\nCharacter speaks.';
      const result = renderMarkup(text, mockTokens);
      expect(result).toContain('data-token="scene"');
    });

    it('should preserve newlines in output', () => {
      const text = 'Line 1\nLine 2';
      const result = renderMarkup(text, []);
      expect(result).toContain('Line 1');
      expect(result).toContain('Line 2');
    });

    it('should handle empty string', () => {
      const result = renderMarkup('', mockTokens);
      expect(result).toBe('');
    });

    it('should apply correct CSS styles for format properties', () => {
      const tokens: MarkupToken[] = [
        {
          id: 'colored',
          label: 'Colored',
          prefix: '@@',
          format_scope: 'inline',
          format: {
            color: '#ff0000',
            background_color: '#ffff00',
            bold: true,
          },
        },
      ];
      const text = '@@red text@@';
      const result = renderMarkup(text, tokens);
      expect(result).toContain('color: #ff0000');
      expect(result).toContain('background-color: #ffff00');
      expect(result).toContain('font-weight: bold');
    });
  });

  describe('parseMarkup', () => {
    it('should return empty array for text without markup', () => {
      const text = 'Plain text with no markup';
      const ranges = parseMarkup(text, mockTokens);
      expect(ranges).toEqual([]);
    });

    it('should identify inline markup ranges', () => {
      const text = '**bold text**';
      const ranges = parseMarkup(text, mockTokens);
      expect(ranges).toHaveLength(1);
      expect(ranges[0]).toEqual({
        start: 0,
        end: 12,
        tokenId: 'bold',
        format: mockTokens[0].format,
      });
    });

    it('should handle multiple ranges of same type', () => {
      const text = '**bold one** and **bold two**';
      const ranges = parseMarkup(text, mockTokens);
      const boldRanges = ranges.filter(r => r.tokenId === 'bold');
      expect(boldRanges).toHaveLength(2);
    });

    it('should identify line-based markup', () => {
      const text = 'INT. OFFICE - DAY\nSome action';
      const ranges = parseMarkup(text, mockTokens);
      const sceneRange = ranges.find(r => r.tokenId === 'scene');
      expect(sceneRange).toBeDefined();
      expect(sceneRange?.start).toBe(0);
      expect(sceneRange?.end).toBeGreaterThanOrEqual(17); // At least until end of line 1
    });

    it('should sort ranges by start position', () => {
      const tokens: MarkupToken[] = [
        {
          id: 'a',
          label: 'A',
          prefix: 'A',
          format_scope: 'inline',
          format: {},
        },
      ];
      const text = 'AZA';
      const ranges = parseMarkup(text, tokens);
      for (let i = 1; i < ranges.length; i++) {
        expect(ranges[i].start).toBeGreaterThanOrEqual(ranges[i - 1].start);
      }
    });

    it('should handle tokens without prefix or pattern gracefully', () => {
      const tokens: MarkupToken[] = [
        {
          id: 'incomplete',
          label: 'Incomplete',
          format: {},
        },
      ];
      const text = 'Some text';
      const ranges = parseMarkup(text, tokens);
      expect(ranges).toEqual([]);
    });

    it('should identify ranges correctly with multiple token types', () => {
      const text = '**bold** and *italic*';
      const ranges = parseMarkup(text, mockTokens);
      expect(ranges).toHaveLength(2);
      expect(ranges.map(r => r.tokenId).sort()).toEqual(['bold', 'italic']);
    });
  });

  describe('edge cases', () => {
    it('should handle markup at text boundaries', () => {
      const text = '**start and end**';
      const result = renderMarkup(text, mockTokens);
      expect(result).toContain('data-token="bold"');
    });

    it('should handle adjacent markup regions', () => {
      const text = '**bold***italic*';
      const result = renderMarkup(text, mockTokens);
      expect(result).toContain('data-token="bold"');
      expect(result).toContain('data-token="italic"');
    });

    it('should handle unclosed markup prefixes', () => {
      const text = '**bold without closing';
      const result = renderMarkup(text, mockTokens);
      // Should still render, behavior depends on format_scope rules
      expect(typeof result).toBe('string');
    });

    it('should preserve spacing', () => {
      const text = 'word1   word2';
      const result = renderMarkup(text, []);
      expect(result).toBe('word1   word2');
    });

    it('should handle tabs and special whitespace', () => {
      const text = 'before\ttab\tafter';
      const result = renderMarkup(text, []);
      expect(result).toBe('before\ttab\tafter');
    });
  });
});
