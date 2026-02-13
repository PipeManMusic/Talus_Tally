"""
Text Formatting Service

Handles text transformations and formatting rules for markup tokens.
Operates at the infrastructure layer so all editing operations maintain consistency.
"""

from typing import Optional, Dict, Any
from enum import Enum


class TextTransform(str, Enum):
    """Text transformation types"""
    UPPERCASE = "uppercase"
    LOWERCASE = "lowercase"
    CAPITALIZE = "capitalize"
    NONE = "none"


class FormattingService:
    """
    Applies text formatting rules defined in markup token configurations.
    
    Handles:
    - Text transformations (case changes)
    - Applying format rules to content
    - Preserving plain text for undo/redo
    """
    
    @staticmethod
    def apply_text_transform(text: str, transform: Optional[str]) -> str:
        """
        Apply text case transformation.
        
        Args:
            text: Text to transform
            transform: Transformation type (uppercase, lowercase, capitalize, none)
            
        Returns:
            Transformed text
        """
        if not transform or transform == TextTransform.NONE or transform == "none":
            return text
        
        if transform == TextTransform.UPPERCASE or transform == "uppercase":
            return text.upper()
        elif transform == TextTransform.LOWERCASE or transform == "lowercase":
            return text.lower()
        elif transform == TextTransform.CAPITALIZE or transform == "capitalize":
            return text.capitalize()
        
        return text
    
    @staticmethod
    def format_line(text: str, format_config: Optional[Dict[str, Any]]) -> str:
        """
        Apply formatting rules to a line of text.
        
        Args:
            text: Text to format
            format_config: Formatting configuration dict with properties like:
                - text_transform: "uppercase", "lowercase", "capitalize"
                - bold: bool (prefix with ** in markdown)
                - italic: bool (prefix with * in markdown)
                - underline: bool (prefix with __ in markdown)
                
        Returns:
            Formatted text (may include markdown markers)
        """
        if not format_config:
            return text
        
        result = text
        
        # Apply text transformation
        text_transform = format_config.get('text_transform')
        if text_transform:
            result = FormattingService.apply_text_transform(result, text_transform)
        
        # Apply markdown-style markers for styling
        # Note: These are plain text markers that preserve undo/redo while indicating formatting intent
        if format_config.get('bold'):
            result = f"**{result}**"
        
        if format_config.get('italic'):
            result = f"*{result}*"
        
        if format_config.get('underline'):
            result = f"__{result}__"
        
        return result
    
    @staticmethod
    def apply_token_formatting(
        token_id: str,
        token_config: Dict[str, Any],
        current_line: str
    ) -> str:
        """
        Apply token formatting rules to a line.
        
        Handles format_scope (line vs prefix) and applies appropriate transformations.
        
        Args:
            token_id: Token identifier
            token_config: Token configuration with 'format_scope' and 'format' properties
            current_line: Current line content (may already have prefix)
            
        Returns:
            Formatted line content
        """
        format_scope = token_config.get('format_scope')
        format_rules = token_config.get('format')
        prefix = token_config.get('prefix', '')
        
        if not format_scope or not format_rules:
            return current_line
        
        if format_scope == 'line':
            # Format the entire line (after the prefix)
            # Extract prefix if it exists
            if prefix and current_line.startswith(prefix):
                # Keep prefix unformatted, format the remainder
                remainder = current_line[len(prefix):].strip()
                if remainder:
                    formatted_remainder = FormattingService.format_line(remainder, format_rules)
                    return f"{prefix} {formatted_remainder}"
                else:
                    # Just prefix, no content yet - return as is
                    return current_line
            else:
                # No prefix found, format entire line
                return FormattingService.format_line(current_line.strip(), format_rules)
        elif format_scope == 'prefix':
            # Only format the prefix part if it's at the start
            if prefix and current_line.startswith(prefix):
                # Format just the prefix
                remainder = current_line[len(prefix):]
                formatted_prefix = FormattingService.format_line(prefix, format_rules)
                return formatted_prefix + remainder
        
        return current_line
    
    @staticmethod
    def get_formatting_metadata(token_config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Extract formatting metadata from token configuration for frontend rendering.
        
        Returns metadata about colors, alignment, font size, etc. that the
        frontend can use for visualization (separate from plain text).
        
        Args:
            token_config: Token configuration
            
        Returns:
            Dictionary with rendering hints (color, align, font_size, etc.)
        """
        format_rules = token_config.get('format')
        if not format_rules:
            return {}
        
        metadata = {}
        
        # Extract visual properties (frontend rendering hints only)
        if 'color' in format_rules:
            metadata['color'] = format_rules['color']
        
        if 'background_color' in format_rules:
            metadata['background_color'] = format_rules['background_color']
        
        if 'align' in format_rules:
            metadata['align'] = format_rules['align']
        
        if 'font_size' in format_rules:
            metadata['font_size'] = format_rules['font_size']
        
        return metadata
