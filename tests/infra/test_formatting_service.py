"""
Tests for FormattingService

Tests text transformation and formatting rules for markup tokens.
"""

import pytest
from backend.infra.formatting_service import FormattingService


class TestTextTransform:
    """Test text transformation methods."""
    
    def test_uppercase_transform(self):
        result = FormattingService.apply_text_transform("hello world", "uppercase")
        assert result == "HELLO WORLD"
    
    def test_lowercase_transform(self):
        result = FormattingService.apply_text_transform("HELLO WORLD", "lowercase")
        assert result == "hello world"
    
    def test_capitalize_transform(self):
        result = FormattingService.apply_text_transform("hello world", "capitalize")
        assert result == "Hello world"
    
    def test_none_transform(self):
        result = FormattingService.apply_text_transform("Hello World", "none")
        assert result == "Hello World"
    
    def test_none_transform_explicit_none(self):
        result = FormattingService.apply_text_transform("Hello World", None)
        assert result == "Hello World"


class TestFormatLine:
    """Test line formatting with multiple format rules."""
    
    def test_bold_only(self):
        format_config = {'bold': True}
        result = FormattingService.format_line("hello world", format_config)
        assert result == "**hello world**"
    
    def test_italic_only(self):
        format_config = {'italic': True}
        result = FormattingService.format_line("hello world", format_config)
        assert result == "*hello world*"
    
    def test_underline_only(self):
        format_config = {'underline': True}
        result = FormattingService.format_line("hello world", format_config)
        assert result == "__hello world__"
    
    def test_uppercase_with_bold(self):
        format_config = {
            'text_transform': 'uppercase',
            'bold': True
        }
        result = FormattingService.format_line("hello world", format_config)
        assert result == "**HELLO WORLD**"
    
    def test_lowercase_with_italic(self):
        format_config = {
            'text_transform': 'lowercase',
            'italic': True
        }
        result = FormattingService.format_line("HELLO WORLD", format_config)
        assert result == "*hello world*"
    
    def test_capitalize_with_underline(self):
        format_config = {
            'text_transform': 'capitalize',
            'underline': True
        }
        result = FormattingService.format_line("hello world", format_config)
        assert result == "__Hello world__"
    
    def test_all_formats_combined(self):
        """Bold, italic, underline should all apply (nested markdown)."""
        format_config = {
            'text_transform': 'uppercase',
            'bold': True,
            'italic': True,
            'underline': True
        }
        result = FormattingService.format_line("hello", format_config)
        # Order: uppercase → bold → italic → underline
        assert result == "__***HELLO***__"
    
    def test_empty_format_config(self):
        result = FormattingService.format_line("hello world", {})
        assert result == "hello world"
    
    def test_none_format_config(self):
        result = FormattingService.format_line("hello world", None)
        assert result == "hello world"


class TestApplyTokenFormatting:
    """Test token formatting with format_scope rules."""
    
    def test_line_scope_with_content(self):
        """Format entire line after prefix."""
        token_config = {
            'id': 'scene',
            'prefix': 'INT.',
            'format_scope': 'line',
            'format': {
                'text_transform': 'uppercase',
                'bold': True
            }
        }
        line = "INT. office - day"
        result = FormattingService.apply_token_formatting('scene', token_config, line)
        assert result == "INT. **OFFICE - DAY**"
    
    def test_line_scope_prefix_only(self):
        """Prefix with no content - should return unchanged."""
        token_config = {
            'id': 'scene',
            'prefix': 'INT.',
            'format_scope': 'line',
            'format': {
                'text_transform': 'uppercase'
            }
        }
        line = "INT. "
        result = FormattingService.apply_token_formatting('scene', token_config, line)
        assert result == "INT. "
    
    def test_line_scope_no_prefix(self):
        """Line without prefix - format entire line (no bold since token config doesn't specify it)."""
        token_config = {
            'id': 'scene',
            'prefix': 'INT.',
            'format_scope': 'line',
            'format': {
                'text_transform': 'uppercase'
            }
        }
        line = "office - day"
        result = FormattingService.apply_token_formatting('scene', token_config, line)
        assert result == "OFFICE - DAY"
    
    def test_prefix_scope_formats_prefix_only(self):
        """Format only the prefix part."""
        token_config = {
            'id': 'character',
            'prefix': '[CHAR]',
            'format_scope': 'prefix',
            'format': {
                'text_transform': 'uppercase',
                'bold': True
            }
        }
        line = "[CHAR] John says hello"
        result = FormattingService.apply_token_formatting('character', token_config, line)
        assert result == "**[CHAR]** John says hello"
    
    def test_prefix_scope_no_prefix_found(self):
        """No prefix in line - return unchanged."""
        token_config = {
            'id': 'character',
            'prefix': '[CHAR]',
            'format_scope': 'prefix',
            'format': {
                'text_transform': 'uppercase'
            }
        }
        line = "John says hello"
        result = FormattingService.apply_token_formatting('character', token_config, line)
        assert result == "John says hello"
    
    def test_no_format_scope(self):
        """No format_scope defined - return unchanged."""
        token_config = {
            'id': 'action',
            'prefix': '-',
            'format': {
                'text_transform': 'uppercase'
            }
        }
        line = "- John walks in"
        result = FormattingService.apply_token_formatting('action', token_config, line)
        assert result == "- John walks in"
    
    def test_no_format_rules(self):
        """No format rules defined - return unchanged."""
        token_config = {
            'id': 'action',
            'prefix': '-',
            'format_scope': 'line'
        }
        line = "- John walks in"
        result = FormattingService.apply_token_formatting('action', token_config, line)
        assert result == "- John walks in"


class TestGetFormattingMetadata:
    """Test extraction of visual formatting metadata."""
    
    def test_color_metadata(self):
        token_config = {
            'format': {
                'color': '#FF5733',
                'text_transform': 'uppercase'
            }
        }
        metadata = FormattingService.get_formatting_metadata(token_config)
        assert metadata == {'color': '#FF5733'}
    
    def test_background_color_metadata(self):
        token_config = {
            'format': {
                'background_color': '#F0F0F0'
            }
        }
        metadata = FormattingService.get_formatting_metadata(token_config)
        assert metadata == {'background_color': '#F0F0F0'}
    
    def test_align_metadata(self):
        token_config = {
            'format': {
                'align': 'center'
            }
        }
        metadata = FormattingService.get_formatting_metadata(token_config)
        assert metadata == {'align': 'center'}
    
    def test_font_size_metadata(self):
        token_config = {
            'format': {
                'font_size': '1.2em'
            }
        }
        metadata = FormattingService.get_formatting_metadata(token_config)
        assert metadata == {'font_size': '1.2em'}
    
    def test_multiple_metadata_properties(self):
        token_config = {
            'format': {
                'color': '#FF5733',
                'background_color': '#F0F0F0',
                'align': 'right',
                'font_size': '14px',
                'bold': True  # Not in metadata
            }
        }
        metadata = FormattingService.get_formatting_metadata(token_config)
        assert metadata == {
            'color': '#FF5733',
            'background_color': '#F0F0F0',
            'align': 'right',
            'font_size': '14px'
        }
    
    def test_no_format_rules(self):
        token_config = {}
        metadata = FormattingService.get_formatting_metadata(token_config)
        assert metadata == {}
    
    def test_no_visual_properties(self):
        token_config = {
            'format': {
                'text_transform': 'uppercase',
                'bold': True
            }
        }
        metadata = FormattingService.get_formatting_metadata(token_config)
        assert metadata == {}


class TestScreenplayFormatting:
    """Real-world screenplay formatting scenarios."""
    
    def test_scene_heading(self):
        """INT. office - day -> INT. **OFFICE - DAY**"""
        token_config = {
            'id': 'scene_heading',
            'prefix': 'INT.',
            'format_scope': 'line',
            'format': {
                'text_transform': 'uppercase',
                'bold': True
            }
        }
        line = "INT. office - day"
        result = FormattingService.apply_token_formatting('scene_heading', token_config, line)
        assert result == "INT. **OFFICE - DAY**"
    
    def test_exterior_scene(self):
        """EXT. parking lot - night -> EXT. **PARKING LOT - NIGHT**"""
        token_config = {
            'id': 'ext_scene',
            'prefix': 'EXT.',
            'format_scope': 'line',
            'format': {
                'text_transform': 'uppercase',
                'bold': True
            }
        }
        line = "EXT. parking lot - night"
        result = FormattingService.apply_token_formatting('ext_scene', token_config, line)
        assert result == "EXT. **PARKING LOT - NIGHT**"
    
    def test_character_name_centered(self):
        """Character names are uppercase, centered."""
        token_config = {
            'id': 'character',
            'prefix': '[CHAR]',
            'format_scope': 'line',
            'format': {
                'text_transform': 'uppercase',
                'align': 'center'
            }
        }
        line = "[CHAR] john"
        result = FormattingService.apply_token_formatting('character', token_config, line)
        assert result == "[CHAR] JOHN"
    
    def test_dialogue_no_formatting(self):
        """Dialogue has no special formatting."""
        token_config = {
            'id': 'dialogue',
            'prefix': '[DIALOGUE]',
            'format_scope': 'line'
        }
        line = "[DIALOGUE] I can't believe it!"
        result = FormattingService.apply_token_formatting('dialogue', token_config, line)
        assert result == "[DIALOGUE] I can't believe it!"
    
    def test_transition_right_aligned_uppercase(self):
        """Transitions are RIGHT ALIGNED and UPPERCASE."""
        token_config = {
            'id': 'transition',
            'prefix': 'FADE TO:',
            'format_scope': 'line',
            'format': {
                'text_transform': 'uppercase',
                'align': 'right'
            }
        }
        line = "FADE TO: black"
        result = FormattingService.apply_token_formatting('transition', token_config, line)
        assert result == "FADE TO: BLACK"


class TestEdgeCases:
    """Test edge cases and error handling."""
    
    def test_empty_string(self):
        format_config = {'text_transform': 'uppercase'}
        result = FormattingService.format_line("", format_config)
        assert result == ""
    
    def test_whitespace_only(self):
        format_config = {'text_transform': 'uppercase'}
        result = FormattingService.format_line("   ", format_config)
        assert result == "   "
    
    def test_special_characters(self):
        format_config = {'text_transform': 'uppercase', 'bold': True}
        result = FormattingService.format_line("hello, world! @#$%", format_config)
        assert result == "**HELLO, WORLD! @#$%**"
    
    def test_unicode_characters(self):
        format_config = {'text_transform': 'uppercase'}
        result = FormattingService.format_line("café résumé", format_config)
        assert result == "CAFÉ RÉSUMÉ"
    
    def test_multiline_string_single_line_processing(self):
        """format_line processes single lines - newlines should be preserved."""
        format_config = {'text_transform': 'uppercase'}
        result = FormattingService.format_line("hello\nworld", format_config)
        assert result == "HELLO\nWORLD"
    
    def test_invalid_transform_type(self):
        """Invalid transform type should be treated as 'none'."""
        result = FormattingService.apply_text_transform("hello", "invalid_type")
        assert result == "hello"
    
    def test_prefix_with_special_chars(self):
        """Prefix with regex special characters."""
        token_config = {
            'id': 'note',
            'prefix': '** NOTE:',
            'format_scope': 'line',
            'format': {
                'text_transform': 'uppercase'
            }
        }
        line = "** NOTE: important detail"
        result = FormattingService.apply_token_formatting('note', token_config, line)
        assert result == "** NOTE: IMPORTANT DETAIL"
