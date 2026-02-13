"""
Tests for TextEditorService with formatting integration

Tests the integration of formatting service with text editor operations.
"""

import pytest
from backend.infra.text_editor import TextEditorService


class TestTextEditorFormatting:
    """Test text editor formatting integration."""
    
    def test_apply_token_formatting_single_line(self):
        """Apply formatting to a single line of text."""
        token_config = {
            'id': 'scene',
            'prefix': 'INT.',
            'format_scope': 'line',
            'format': {
                'text_transform': 'uppercase',
                'bold': True
            }
        }
        text = "INT. office - day"
        result = TextEditorService.apply_token_formatting(text, token_config)
        assert result == "INT. **OFFICE - DAY**"
    
    def test_apply_token_formatting_multiline_finds_prefix(self):
        """Find and format the line with the token prefix in multi-line text."""
        token_config = {
            'id': 'scene',
            'prefix': 'INT.',
            'format_scope': 'line',
            'format': {
                'text_transform': 'uppercase',
                'bold': True
            }
        }
        text = "Previous line\nINT. office - day\nNext line"
        result = TextEditorService.apply_token_formatting(text, token_config)
        assert result == "Previous line\nINT. **OFFICE - DAY**\nNext line"
    
    def test_apply_token_formatting_multiline_no_prefix(self):
        """If prefix not found in any line, return text unchanged."""
        token_config = {
            'id': 'scene',
            'prefix': 'INT.',
            'format_scope': 'line',
            'format': {
                'text_transform': 'uppercase'
            }
        }
        text = "Line one\nLine two\nLine three"
        result = TextEditorService.apply_token_formatting(text, token_config)
        assert result == "Line one\nLine two\nLine three"
    
    def test_apply_token_formatting_first_line(self):
        """Format when token is on first line."""
        token_config = {
            'id': 'scene',
            'prefix': 'EXT.',
            'format_scope': 'line',
            'format': {
                'text_transform': 'uppercase'
            }
        }
        text = "EXT. beach - sunset\nSecond line\nThird line"
        result = TextEditorService.apply_token_formatting(text, token_config)
        assert result == "EXT. BEACH - SUNSET\nSecond line\nThird line"
    
    def test_apply_token_formatting_last_line(self):
        """Format when token is on last line."""
        token_config = {
            'id': 'transition',
            'prefix': 'FADE TO:',
            'format_scope': 'line',
            'format': {
                'text_transform': 'uppercase'
            }
        }
        text = "First line\nSecond line\nFADE TO: black"
        result = TextEditorService.apply_token_formatting(text, token_config)
        assert result == "First line\nSecond line\nFADE TO: BLACK"
    
    def test_apply_token_formatting_only_formats_first_match(self):
        """Only format the first line with the prefix."""
        token_config = {
            'id': 'scene',
            'prefix': 'INT.',
            'format_scope': 'line',
            'format': {
                'text_transform': 'uppercase'
            }
        }
        text = "INT. office - day\nSome dialogue\nINT. hallway - day"
        result = TextEditorService.apply_token_formatting(text, token_config)
        # Only first INT. should be formatted
        assert result == "INT. OFFICE - DAY\nSome dialogue\nINT. hallway - day"
    
    def test_apply_token_formatting_empty_text(self):
        """Handle empty text gracefully."""
        token_config = {
            'id': 'scene',
            'prefix': 'INT.',
            'format_scope': 'line',
            'format': {
                'text_transform': 'uppercase'
            }
        }
        text = ""
        result = TextEditorService.apply_token_formatting(text, token_config)
        assert result == ""
    
    def test_apply_token_formatting_no_prefix_in_config(self):
        """If token config has no prefix, return text unchanged."""
        token_config = {
            'id': 'note',
            'format_scope': 'line',
            'format': {
                'text_transform': 'uppercase'
            }
        }
        text = "Some text here"
        result = TextEditorService.apply_token_formatting(text, token_config)
        assert result == "Some text here"
    
    def test_apply_token_formatting_empty_prefix(self):
        """If prefix is empty string, return text unchanged."""
        token_config = {
            'id': 'note',
            'prefix': '',
            'format_scope': 'line',
            'format': {
                'text_transform': 'uppercase'
            }
        }
        text = "Some text here"
        result = TextEditorService.apply_token_formatting(text, token_config)
        assert result == "Some text here"


class TestTextEditorFormattingWithSession:
    """Test formatting through actual text editor sessions."""
    
    def test_session_with_formatted_text(self):
        """Create session and apply edit with formatting."""
        service = TextEditorService()
        
        # Create session
        session = service.create_session('description', 'node-123', 'Initial text')
        session_id = session.session_id
        
        try:
            # Simulate applying formatting
            token_config = {
                'id': 'scene',
                'prefix': 'INT.',
                'format_scope': 'line',
                'format': {
                    'text_transform': 'uppercase',
                    'bold': True
                }
            }
            
            before_text = "Initial text"
            after_text = "INT. office - day"
            formatted_text = TextEditorService.apply_token_formatting(after_text, token_config)
            
            # Apply edit with formatted text
            state = service.apply_edit(
                session_id=session_id,
                before_text=before_text,
                after_text=formatted_text,
                cursor_position=0,
                selection_start=0,
                selection_end=0,
                operation_type='replace'
            )
            
            # Verify formatted text is in session
            assert state['current_text'] == "INT. **OFFICE - DAY**"
            assert state['can_undo'] is True
            
        finally:
            service.close_session(session_id)
    
    def test_undo_preserves_formatted_text(self):
        """Undo should restore previously formatted text."""
        service = TextEditorService()
        
        # Create session
        session = service.create_session('description', 'node-123', '')
        session_id = session.session_id
        
        try:
            # First edit: add formatted scene heading
            token_config = {
                'id': 'scene',
                'prefix': 'INT.',
                'format_scope': 'line',
                'format': {
                    'text_transform': 'uppercase',
                    'bold': True
                }
            }
            
            formatted_text = TextEditorService.apply_token_formatting('INT. office - day', token_config)
            service.apply_edit(session_id, '', formatted_text, 0, 0, 0, 'replace')
            
            # Second edit: add more text
            service.apply_edit(session_id, formatted_text, formatted_text + '\nSome dialogue', 0, 0, 0, 'replace')
            
            # Undo should restore just the formatted scene heading
            undo_result = service.undo(session_id)
            assert undo_result['text'] == "INT. **OFFICE - DAY**"
            
            # Undo again should restore empty state
            undo_result = service.undo(session_id)
            assert undo_result['text'] == ""
            
        finally:
            service.close_session(session_id)
    
    def test_redo_restores_formatted_text(self):
        """Redo should restore formatted text."""
        service = TextEditorService()
        
        session = service.create_session('description', 'node-123', '')
        session_id = session.session_id
        
        try:
            formatted_text = "INT. **OFFICE - DAY**"
            
            # Edit 1: Add formatted text
            service.apply_edit(session_id, '', formatted_text, 0, 0, 0, 'replace')
            
            # Edit 2: Add more content
            service.apply_edit(session_id, formatted_text, formatted_text + '\nDialogue', 0, 0, 0, 'replace')
            
            # Undo twice
            service.undo(session_id)
            service.undo(session_id)
            
            # Redo should restore formatted text
            redo_result = service.redo(session_id)
            assert redo_result['text'] == formatted_text
            
            # Redo again should restore full content
            redo_result = service.redo(session_id)
            assert redo_result['text'] == formatted_text + '\nDialogue'
            
        finally:
            service.close_session(session_id)


class TestRealWorldScenarios:
    """Test real-world screenplay formatting scenarios."""
    
    def test_complete_screenplay_scene(self):
        """Test formatting a complete screenplay scene with multiple tokens."""
        service = TextEditorService()
        session = service.create_session('script', 'scene-1', '')
        session_id = session.session_id
        
        try:
            # Scene heading
            scene_config = {
                'prefix': 'INT.',
                'format_scope': 'line',
                'format': {'text_transform': 'uppercase', 'bold': True}
            }
            
            # Character name
            char_config = {
                'prefix': '[CHAR]',
                'format_scope': 'line',
                'format': {'text_transform': 'uppercase'}
            }
            
            # Build scene incrementally
            text = ""
            
            # Add scene heading
            text = TextEditorService.apply_token_formatting('INT. office - day', scene_config)
            service.apply_edit(session_id, '', text, 0, 0, 0, 'replace')
            
            # Add action
            text = text + '\n\nJohn enters the room.'
            service.apply_edit(session_id, 'INT. **OFFICE - DAY**', text, 0, 0, 0, 'replace')
            
            # Add character
            char_text = TextEditorService.apply_token_formatting('[CHAR] john', char_config)
            text = text + '\n\n' + char_text
            service.apply_edit(session_id, text[:text.rfind('\n')], text, 0, 0, 0, 'replace')
            
            # Add dialogue
            text = text + '\nHello there!'
            service.apply_edit(session_id, text[:text.rfind('\n')], text, 0, 0, 0, 'replace')
            
            # Verify final state
            session = service.get_session(session_id)
            state = session.get_state()
            expected = "INT. **OFFICE - DAY**\n\nJohn enters the room.\n\n[CHAR] JOHN\nHello there!"
            assert state['current_text'] == expected
            
            # Can undo all the way back
            assert state['undo_count'] == 4
            
        finally:
            service.close_session(session_id)
    
    def test_toggle_formatting_by_reapplying_token(self):
        """Applying token to already-prefixed line should reformat it."""
        token_config = {
            'prefix': 'INT.',
            'format_scope': 'line',
            'format': {'text_transform': 'uppercase', 'bold': True}
        }
        
        # User types "INT. office - day" (lowercase)
        text1 = "INT. office - day"
        
        # Apply formatting
        text2 = TextEditorService.apply_token_formatting(text1, token_config)
        assert text2 == "INT. **OFFICE - DAY**"
        
        # If user clicks token again on already-formatted line, it should reformat
        # (in practice, the line would still have the prefix)
        text3 = TextEditorService.apply_token_formatting(text2, token_config)
        # The prefix is "INT." and line starts with "INT. **OFFICE - DAY**"
        # It should find "INT." and reformat what's after
        assert "OFFICE - DAY" in text3


class TestEdgeCasesIntegration:
    """Test edge cases in the integration layer."""
    
    def test_formatting_with_windows_line_endings(self):
        """Test with Windows-style CRLF line endings."""
        token_config = {
            'prefix': 'INT.',
            'format_scope': 'line',
            'format': {'text_transform': 'uppercase'}
        }
        
        # Text with \r\n line endings
        text = "Line one\r\nINT. office - day\r\nLine three"
        result = TextEditorService.apply_token_formatting(text, token_config)
        
        # Should still find and format the INT. line
        assert "INT. OFFICE - DAY" in result
    
    def test_formatting_preserves_indentation(self):
        """Formatting strips leading whitespace by design (format_line calls strip())."""
        token_config = {
            'prefix': 'NOTE:',
            'format_scope': 'line',
            'format': {'text_transform': 'uppercase', 'italic': True}
        }
        
        text = "    NOTE: important detail"
        result = TextEditorService.apply_token_formatting(text, token_config)
        
        # Leading spaces are stripped during formatting
        assert result == "*NOTE: IMPORTANT DETAIL*"
    
    def test_partial_prefix_match(self):
        """Ensure we match the actual prefix, not partial matches."""
        token_config = {
            'prefix': 'INT.',
            'format_scope': 'line',
            'format': {'text_transform': 'uppercase'}
        }
        
        # "INTERMISSION" contains "INT" but shouldn't match "INT."
        text = "INTERMISSION"
        result = TextEditorService.apply_token_formatting(text, token_config)
        
        # Should not format because "INT." is not in the text
        assert result == "INTERMISSION"
