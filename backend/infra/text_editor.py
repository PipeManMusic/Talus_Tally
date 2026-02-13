"""
Text Editor Infrastructure Layer

Provides text editing operations with undo/redo support, maintaining
edit history stacks separate from graph command operations.
"""

from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field
from datetime import datetime
import uuid
from .formatting_service import FormattingService


@dataclass
class TextEdit:
    """Represents a single text edit operation"""
    id: str
    timestamp: datetime
    before_text: str
    after_text: str
    cursor_position: int
    selection_start: int
    selection_end: int
    operation_type: str  # 'insert', 'delete', 'replace', 'format'
    
    @classmethod
    def create(
        cls,
        before_text: str,
        after_text: str,
        cursor_position: int,
        selection_start: int,
        selection_end: int,
        operation_type: str = 'replace'
    ) -> 'TextEdit':
        """Create a new text edit operation"""
        return cls(
            id=str(uuid.uuid4()),
            timestamp=datetime.now(),
            before_text=before_text,
            after_text=after_text,
            cursor_position=cursor_position,
            selection_start=selection_start,
            selection_end=selection_end,
            operation_type=operation_type
        )


@dataclass
class TextEditorSession:
    """Manages a text editing session with undo/redo stacks"""
    session_id: str
    property_id: str
    node_id: str
    current_text: str
    undo_stack: List[TextEdit] = field(default_factory=list)
    redo_stack: List[TextEdit] = field(default_factory=list)
    max_history_size: int = 500  # Increased from 100 to 500 for better history
    created_at: datetime = field(default_factory=datetime.now)
    last_modified: datetime = field(default_factory=datetime.now)
    
    def apply_edit(self, edit: TextEdit) -> None:
        """Apply a text edit and update stacks"""
        self.undo_stack.append(edit)
        self.redo_stack.clear()  # Clear redo stack on new edit
        self.current_text = edit.after_text
        self.last_modified = datetime.now()
        
        # Limit undo stack size
        if len(self.undo_stack) > self.max_history_size:
            self.undo_stack.pop(0)
    
    def undo(self) -> Optional[Dict[str, Any]]:
        """Undo the last edit operation"""
        if not self.undo_stack:
            return None
        
        edit = self.undo_stack.pop()
        self.redo_stack.append(edit)
        self.current_text = edit.before_text
        self.last_modified = datetime.now()
        
        return {
            'text': self.current_text,
            'cursor_position': edit.cursor_position,
            'selection_start': edit.selection_start,
            'selection_end': edit.selection_end,
            'can_undo': len(self.undo_stack) > 0,
            'can_redo': len(self.redo_stack) > 0
        }
    
    def redo(self) -> Optional[Dict[str, Any]]:
        """Redo the last undone edit operation"""
        if not self.redo_stack:
            return None
        
        edit = self.redo_stack.pop()
        self.undo_stack.append(edit)
        self.current_text = edit.after_text
        self.last_modified = datetime.now()
        
        return {
            'text': self.current_text,
            'cursor_position': edit.cursor_position,
            'selection_start': edit.selection_start,
            'selection_end': edit.selection_end,
            'can_undo': len(self.undo_stack) > 0,
            'can_redo': len(self.redo_stack) > 0
        }
    
    def can_undo(self) -> bool:
        """Check if undo is available"""
        return len(self.undo_stack) > 0
    
    def can_redo(self) -> bool:
        """Check if redo is available"""
        return len(self.redo_stack) > 0
    
    def get_state(self) -> Dict[str, Any]:
        """Get current editor state"""
        return {
            'session_id': self.session_id,
            'property_id': self.property_id,
            'node_id': self.node_id,
            'current_text': self.current_text,
            'can_undo': self.can_undo(),
            'can_redo': self.can_redo(),
            'undo_count': len(self.undo_stack),
            'redo_count': len(self.redo_stack),
            'last_modified': self.last_modified.isoformat()
        }


class TextEditorService:
    """
    Service for managing text editor sessions with undo/redo support.
    
    Each editing session is isolated and maintains its own undo/redo stacks,
    allowing multiple text fields to be edited simultaneously without
    interference.
    """
    
    def __init__(self):
        self.sessions: Dict[str, TextEditorSession] = {}
        self.session_timeout_minutes = 30
    
    def create_session(self, property_id: str, node_id: str, initial_text: str = '') -> TextEditorSession:
        """Create a new text editing session"""
        session_id = str(uuid.uuid4())
        session = TextEditorSession(
            session_id=session_id,
            property_id=property_id,
            node_id=node_id,
            current_text=initial_text
        )
        self.sessions[session_id] = session
        return session
    
    def get_session(self, session_id: str) -> Optional[TextEditorSession]:
        """Get an existing text editing session"""
        return self.sessions.get(session_id)
    
    def close_session(self, session_id: str) -> Optional[str]:
        """Close a text editing session and return final text"""
        session = self.sessions.pop(session_id, None)
        return session.current_text if session else None
    
    def apply_edit(
        self,
        session_id: str,
        before_text: str,
        after_text: str,
        cursor_position: int,
        selection_start: int,
        selection_end: int,
        operation_type: str = 'replace'
    ) -> Optional[Dict[str, Any]]:
        """Apply a text edit to a session"""
        session = self.get_session(session_id)
        if not session:
            return None
        
        edit = TextEdit.create(
            before_text=before_text,
            after_text=after_text,
            cursor_position=cursor_position,
            selection_start=selection_start,
            selection_end=selection_end,
            operation_type=operation_type
        )
        session.apply_edit(edit)
        return session.get_state()
    
    def undo(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Undo the last edit in a session"""
        session = self.get_session(session_id)
        if not session:
            return None
        return session.undo()
    
    def redo(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Redo the last undone edit in a session"""
        session = self.get_session(session_id)
        if not session:
            return None
        return session.redo()
    
    def cleanup_old_sessions(self) -> int:
        """Remove sessions that haven't been modified recently"""
        from datetime import timedelta
        
        cutoff_time = datetime.now() - timedelta(minutes=self.session_timeout_minutes)
        expired_sessions = [
            session_id for session_id, session in self.sessions.items()
            if session.last_modified < cutoff_time
        ]
        
        for session_id in expired_sessions:
            del self.sessions[session_id]
        
        return len(expired_sessions)
    
    @staticmethod
    def apply_token_formatting(
        text: str,
        token_config: Dict[str, Any]
    ) -> str:
        """
        Apply formatting rules from a markup token to text.
        
        This is called when a markup token is inserted to apply any
        text transformations (uppercase, lowercase, etc.) defined in the token.
        
        For multi-line text, finds the line with the token prefix and formats it.
        
        Args:
            text: The full text content (may be multi-line)
            token_config: Token configuration with 'format_scope' and 'format' properties
            
        Returns:
            Formatted text with transformations and markdown markers applied
        """
        prefix = token_config.get('prefix', '')
        if not prefix:
            return text
        
        # Split into lines
        lines = text.split('\n')
        
        # Find the line with the token prefix
        for i, line in enumerate(lines):
            if prefix in line:
                # Apply formatting to this line
                formatted_line = FormattingService.apply_token_formatting(
                    token_id=token_config.get('id'),
                    token_config=token_config,
                    current_line=line
                )
                lines[i] = formatted_line
                break
        
        return '\n'.join(lines)
