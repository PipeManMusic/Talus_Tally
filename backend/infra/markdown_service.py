"""
Markdown Service Infrastructure Layer

Provides markdown parsing, rendering, and formatting services for the text editor.
Supports basic markdown syntax and custom markup tokens.
"""

from typing import Dict, List, Tuple, Optional, Any
from dataclasses import dataclass
import re
import html


@dataclass
class MarkdownElement:
    """Represents a parsed markdown element"""
    element_type: str  # 'heading', 'paragraph', 'list', 'bold', 'italic', etc.
    content: str
    start_pos: int
    end_pos: int
    level: Optional[int] = None  # For headings and list nesting
    attributes: Optional[Dict[str, str]] = None


class MarkdownService:
    """
    Markdown parsing and rendering service.
    
    Provides:
    - Markdown to HTML conversion
    - HTML to plain text conversion
    - Markdown syntax highlighting
    - Format detection and validation
    """
    
    def __init__(self):
        self.markup_tokens: Dict[str, str] = {}
    
    def register_markup_token(self, token_id: str, prefix: str) -> None:
        """Register a custom markup token"""
        self.markup_tokens[token_id] = prefix
    
    def parse_markdown(self, text: str) -> List[MarkdownElement]:
        """Parse markdown text into structured elements"""
        elements = []
        lines = text.split('\n')
        current_pos = 0
        
        for line in lines:
            line_length = len(line)
            
            # Headings
            heading_match = re.match(r'^(#{1,6})\s+(.+)$', line)
            if heading_match:
                level = len(heading_match.group(1))
                content = heading_match.group(2)
                elements.append(MarkdownElement(
                    element_type='heading',
                    content=content,
                    start_pos=current_pos,
                    end_pos=current_pos + line_length,
                    level=level
                ))
                current_pos += line_length + 1
                continue
            
            # Bullet lists
            bullet_match = re.match(r'^(\s*)[•\-*]\s+(.+)$', line)
            if bullet_match:
                indent = len(bullet_match.group(1))
                content = bullet_match.group(2)
                elements.append(MarkdownElement(
                    element_type='bullet_list',
                    content=content,
                    start_pos=current_pos,
                    end_pos=current_pos + line_length,
                    level=indent // 2
                ))
                current_pos += line_length + 1
                continue
            
            # Numbered lists
            numbered_match = re.match(r'^(\s*)(\d+)\.\s+(.+)$', line)
            if numbered_match:
                indent = len(numbered_match.group(1))
                content = numbered_match.group(3)
                elements.append(MarkdownElement(
                    element_type='numbered_list',
                    content=content,
                    start_pos=current_pos,
                    end_pos=current_pos + line_length,
                    level=indent // 2
                ))
                current_pos += line_length + 1
                continue
            
            # Regular paragraph
            if line.strip():
                elements.append(MarkdownElement(
                    element_type='paragraph',
                    content=line,
                    start_pos=current_pos,
                    end_pos=current_pos + line_length
                ))
            
            current_pos += line_length + 1
        
        return elements
    
    def to_html(self, text: str) -> str:
        """Convert markdown text to HTML"""
        if not text:
            return ''
        
        html_parts = []
        lines = text.split('\n')
        in_list = False
        list_type = None
        
        for line in lines:
            if not line.strip():
                if in_list:
                    html_parts.append(f'</{list_type}>')
                    in_list = False
                html_parts.append('<br>')
                continue
            
            # Headings
            heading_match = re.match(r'^(#{1,6})\s+(.+)$', line)
            if heading_match:
                if in_list:
                    html_parts.append(f'</{list_type}>')
                    in_list = False
                level = len(heading_match.group(1))
                content = self._apply_inline_formatting(heading_match.group(2))
                html_parts.append(f'<h{level}>{content}</h{level}>')
                continue
            
            # Bullet lists
            bullet_match = re.match(r'^(\s*)[•\-*]\s+(.+)$', line)
            if bullet_match:
                content = self._apply_inline_formatting(bullet_match.group(2))
                if not in_list or list_type != 'ul':
                    if in_list:
                        html_parts.append(f'</{list_type}>')
                    html_parts.append('<ul>')
                    in_list = True
                    list_type = 'ul'
                html_parts.append(f'<li>{content}</li>')
                continue
            
            # Numbered lists
            numbered_match = re.match(r'^(\s*)(\d+)\.\s+(.+)$', line)
            if numbered_match:
                content = self._apply_inline_formatting(numbered_match.group(3))
                if not in_list or list_type != 'ol':
                    if in_list:
                        html_parts.append(f'</{list_type}>')
                    html_parts.append('<ol>')
                    in_list = True
                    list_type = 'ol'
                html_parts.append(f'<li>{content}</li>')
                continue
            
            # Regular paragraph
            if in_list:
                html_parts.append(f'</{list_type}>')
                in_list = False
            content = self._apply_inline_formatting(line)
            html_parts.append(f'<p>{content}</p>')
        
        if in_list:
            html_parts.append(f'</{list_type}>')
        
        return '\n'.join(html_parts)
    
    def _apply_inline_formatting(self, text: str) -> str:
        """Apply inline markdown formatting (bold, italic, underline)"""
        # Escape HTML first
        text = html.escape(text)
        
        # Bold: **text** or __text__
        text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
        text = re.sub(r'__(.+?)__', r'<u>\1</u>', text)
        
        # Italic: *text* or _text_
        text = re.sub(r'\*(.+?)\*', r'<em>\1</em>', text)
        text = re.sub(r'_(.+?)_', r'<em>\1</em>', text)
        
        # Code: `text`
        text = re.sub(r'`(.+?)`', r'<code>\1</code>', text)
        
        return text
    
    def to_plain_text(self, html_text: str) -> str:
        """Convert HTML back to plain text"""
        # Remove HTML tags
        text = re.sub(r'<[^>]+>', '', html_text)
        # Decode HTML entities
        text = html.unescape(text)
        return text
    
    def validate_markdown(self, text: str) -> Dict[str, Any]:
        """Validate markdown syntax and return issues"""
        issues = []
        
        # Check for unclosed formatting
        bold_count = len(re.findall(r'\*\*', text))
        if bold_count % 2 != 0:
            issues.append({
                'type': 'unclosed_formatting',
                'message': 'Unclosed bold formatting (**)',
                'severity': 'warning'
            })
        
        italic_count = len(re.findall(r'(?<!\*)\*(?!\*)', text))
        if italic_count % 2 != 0:
            issues.append({
                'type': 'unclosed_formatting',
                'message': 'Unclosed italic formatting (*)',
                'severity': 'warning'
            })
        
        underline_count = len(re.findall(r'__', text))
        if underline_count % 2 != 0:
            issues.append({
                'type': 'unclosed_formatting',
                'message': 'Unclosed underline formatting (__)',
                'severity': 'warning'
            })
        
        return {
            'is_valid': len(issues) == 0,
            'issues': issues
        }
    
    def get_formatting_at_position(self, text: str, position: int) -> List[str]:
        """Get active formatting at a specific cursor position"""
        active_formats = []
        
        # Check what formatting is active at this position
        before_text = text[:position]
        
        # Bold
        bold_markers = len(re.findall(r'\*\*', before_text))
        if bold_markers % 2 == 1:
            active_formats.append('bold')
        
        # Italic
        italic_markers = len(re.findall(r'(?<!\*)\*(?!\*)', before_text))
        if italic_markers % 2 == 1:
            active_formats.append('italic')
        
        # Underline
        underline_markers = len(re.findall(r'__', before_text))
        if underline_markers % 2 == 1:
            active_formats.append('underline')
        
        return active_formats
