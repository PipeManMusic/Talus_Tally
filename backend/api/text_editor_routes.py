"""
Text Editor API Routes

Provides RESTful endpoints for text editing operations with undo/redo support,
spell checking, and markdown conversion.
"""

from flask import Blueprint, request, jsonify
from typing import Optional

from backend.infra.text_editor import TextEditorService
from backend.infra.spell_checker import SpellCheckerService
from backend.infra.markdown_service import MarkdownService


# Create blueprint
text_editor_bp = Blueprint('text_editor', __name__, url_prefix='/api/v1/text-editor')

# Service instances
text_editor_service = TextEditorService()
spell_checker = SpellCheckerService()
markdown_service = MarkdownService()


@text_editor_bp.route('/session', methods=['POST'])
def create_session():
    """
    Create a new text editing session.
    
    Request body:
    {
        "property_id": "description",
        "node_id": "node-123",
        "initial_text": "Initial content..."
    }
    
    Response:
    {
        "session_id": "uuid-123",
        "state": { ... }
    }
    """
    try:
        data = request.get_json()
        property_id = data.get('property_id', '')
        node_id = data.get('node_id', '')
        initial_text = data.get('initial_text', '')
        
        session = text_editor_service.create_session(property_id, node_id, initial_text)
        
        return jsonify({
            'success': True,
            'session_id': session.session_id,
            'state': session.get_state()
        }), 201
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@text_editor_bp.route('/session/<session_id>', methods=['GET'])
def get_session(session_id: str):
    """
    Get the current state of a text editing session.
    
    Response:
    {
        "success": true,
        "state": {
            "session_id": "...",
            "current_text": "...",
            "can_undo": true,
            "can_redo": false,
            ...
        }
    }
    """
    try:
        session = text_editor_service.get_session(session_id)
        if not session:
            return jsonify({'success': False, 'error': 'Session not found'}), 404
        
        return jsonify({
            'success': True,
            'state': session.get_state()
        }), 200
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@text_editor_bp.route('/session/<session_id>', methods=['DELETE'])
def close_session(session_id: str):
    """
    Close a text editing session and return final text.
    
    Response:
    {
        "success": true,
        "final_text": "..."
    }
    """
    try:
        final_text = text_editor_service.close_session(session_id)
        if final_text is None:
            return jsonify({'success': False, 'error': 'Session not found'}), 404
        
        return jsonify({
            'success': True,
            'final_text': final_text
        }), 200
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@text_editor_bp.route('/session/<session_id>/edit', methods=['POST'])
def apply_edit(session_id: str):
    """
    Apply a text edit to a session.
    
    Optionally applies markup token formatting if token_config is provided.
    Formatting is applied to the after_text before storing in undo/redo stack.
    
    Request body:
    {
        "before_text": "...",
        "after_text": "...",
        "cursor_position": 10,
        "selection_start": 5,
        "selection_end": 10,
        "operation_type": "insert",  // optional
        "token_config": { ... }      // optional - applies formatting if provided
    }
    
    Response:
    {
        "success": true,
        "state": { ... },
        "formatted_text": "..."     // optional - the formatted text if formatting was applied
    }
    """
    try:
        data = request.get_json()
        
        after_text = data.get('after_text', '')
        token_config = data.get('token_config')
        formatted_text = after_text
        
        # Apply token formatting if provided
        if token_config:
            formatted_text = TextEditorService.apply_token_formatting(after_text, token_config)
        
        state = text_editor_service.apply_edit(
            session_id=session_id,
            before_text=data.get('before_text', ''),
            after_text=formatted_text,
            cursor_position=data.get('cursor_position', 0),
            selection_start=data.get('selection_start', 0),
            selection_end=data.get('selection_end', 0),
            operation_type=data.get('operation_type', 'replace')
        )
        
        if not state:
            return jsonify({'success': False, 'error': 'Session not found'}), 404
        
        response = {
            'success': True,
            'state': state
        }
        
        # Include formatted text if formatting was applied
        if token_config and formatted_text != after_text:
            response['formatted_text'] = formatted_text
        
        return jsonify(response), 200
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@text_editor_bp.route('/session/<session_id>/undo', methods=['POST'])
def undo_edit(session_id: str):
    """
    Undo the last edit operation.
    
    Response:
    {
        "success": true,
        "text": "...",
        "cursor_position": 10,
        "selection_start": 5,
        "selection_end": 10,
        "can_undo": true,
        "can_redo": true
    }
    """
    try:
        result = text_editor_service.undo(session_id)
        if not result:
            return jsonify({'success': False, 'error': 'Nothing to undo'}), 400
        
        return jsonify({
            'success': True,
            **result
        }), 200
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@text_editor_bp.route('/session/<session_id>/redo', methods=['POST'])
def redo_edit(session_id: str):
    """
    Redo the last undone edit operation.
    
    Response:
    {
        "success": true,
        "text": "...",
        "cursor_position": 10,
        "selection_start": 5,
        "selection_end": 10,
        "can_undo": true,
        "can_redo": true
    }
    """
    try:
        result = text_editor_service.redo(session_id)
        if not result:
            return jsonify({'success': False, 'error': 'Nothing to redo'}), 400
        
        return jsonify({
            'success': True,
            **result
        }), 200
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@text_editor_bp.route('/spell-check', methods=['POST'])
def check_spelling():
    """
    Check spelling of text and return suggestions.
    
    Request body:
    {
        "text": "Text to check for speling errors..."
    }
    
    Response:
    {
        "success": true,
        "misspellings": [
            {
                "word": "speling",
                "suggestions": ["spelling", "spieling"],
                "position": 20,
                "context": "...check for speling errors..."
            }
        ]
    }
    """
    try:
        data = request.get_json()
        text = data.get('text', '')
        
        misspellings = spell_checker.check_text(text)
        
        return jsonify({
            'success': True,
            'misspellings': [
                {
                    'word': m.word,
                    'suggestions': m.suggestions,
                    'position': m.position,
                    'context': m.context
                }
                for m in misspellings
            ]
        }), 200
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@text_editor_bp.route('/spell-check/add-word', methods=['POST'])
def add_to_dictionary():
    """
    Add a word to the custom dictionary.
    
    Request body:
    {
        "word": "Talus"
    }
    
    Response:
    {
        "success": true
    }
    """
    try:
        data = request.get_json()
        word = data.get('word', '')
        
        if not word:
            return jsonify({'success': False, 'error': 'No word provided'}), 400
        
        spell_checker.add_to_custom_dictionary(word)
        
        return jsonify({
            'success': True,
            'message': f'Added "{word}" to custom dictionary'
        }), 200
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@text_editor_bp.route('/spell-check/ignore', methods=['POST'])
def ignore_word():
    """
    Add a word to the ignore list for current session.
    
    Request body:
    {
        "word": "TODO"
    }
    
    Response:
    {
        "success": true
    }
    """
    try:
        data = request.get_json()
        word = data.get('word', '')
        
        if not word:
            return jsonify({'success': False, 'error': 'No word provided'}), 400
        
        spell_checker.add_to_ignore_list(word)
        
        return jsonify({
            'success': True,
            'message': f'Ignoring "{word}"'
        }), 200
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@text_editor_bp.route('/markdown/to-html', methods=['POST'])
def markdown_to_html():
    """
    Convert markdown text to HTML.
    
    Request body:
    {
        "text": "# Heading\n\nSome **bold** text"
    }
    
    Response:
    {
        "success": true,
        "html": "<h1>Heading</h1><p>Some <strong>bold</strong> text</p>"
    }
    """
    try:
        data = request.get_json()
        text = data.get('text', '')
        
        html = markdown_service.to_html(text)
        
        return jsonify({
            'success': True,
            'html': html
        }), 200
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@text_editor_bp.route('/markdown/validate', methods=['POST'])
def validate_markdown():
    """
    Validate markdown syntax.
    
    Request body:
    {
        "text": "Some **unclosed bold markdown"
    }
    
    Response:
    {
        "success": true,
        "validation": {
            "is_valid": false,
            "issues": [...]
        }
    }
    """
    try:
        data = request.get_json()
        text = data.get('text', '')
        
        validation = markdown_service.validate_markdown(text)
        
        return jsonify({
            'success': True,
            'validation': validation
        }), 200
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@text_editor_bp.route('/session/<session_id>/apply-token', methods=['POST'])
def apply_token_formatting(session_id: str):
    """
    Apply markup token formatting to text.
    
    Handles text transformations (uppercase, lowercase, etc.) defined in markup token configs.
    Maintains proper undo/redo stack by storing the formatted result as an edit operation.
    
    Request body:
    {
        "line_text": "hello world",
        "token_config": {
            "id": "scene",
            "prefix": "SCENE:",
            "format_scope": "line",
            "format": {
                "text_transform": "uppercase"
            }
        }
    }
    
    Response:
    {
        "success": true,
        "formatted_text": "HELLO WORLD",
        "state": { ... }
    }
    """
    try:
        data = request.get_json()
        line_text = data.get('line_text', '')
        token_config = data.get('token_config', {})
        
        if not token_config:
            return jsonify({'success': False, 'error': 'token_config required'}), 400
        
        # Apply formatting using the text editor service
        formatted_text = TextEditorService.apply_token_formatting(line_text, token_config)
        
        return jsonify({
            'success': True,
            'formatted_text': formatted_text,
            'token_id': token_config.get('id')
        }), 200
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@text_editor_bp.route('/sessions/cleanup', methods=['POST'])
def cleanup_sessions():
    """
    Cleanup old expired sessions.
    
    Response:
    {
        "success": true,
        "removed_count": 5
    }
    """
    try:
        removed_count = text_editor_service.cleanup_old_sessions()
        
        return jsonify({
            'success': True,
            'removed_count': removed_count
        }), 200
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
