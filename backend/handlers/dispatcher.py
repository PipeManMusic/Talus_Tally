from typing import Any, List
from backend.handlers.command import Command
from backend.core.graph import ProjectGraph
from backend.infra.logging import LogManager
from backend.api.broadcaster import (
    emit_command_executing,
    emit_command_executed,
    emit_undo,
    emit_redo
)


class CommandDispatcher:
    """Manages command execution, undo, and redo."""
    
    def __init__(self, graph: ProjectGraph, session_id: str = None):
        """
        Initialize the dispatcher with a project graph.
        
        Args:
            graph: The ProjectGraph to operate on
            session_id: Optional session ID for event broadcasting
        """
        self.graph = graph
        self.undo_stack: List[Command] = []
        self.redo_stack: List[Command] = []
        self.logger = LogManager()
        self.session_id = session_id
    
    def execute(self, command: Command) -> Any:
        """
        Execute a command.
        
        Args:
            command: The Command to execute
            
        Returns:
            The result of the command's execute method
        """
        print(f"DEBUG Dispatcher.execute: command={type(command).__name__}")
        command_id = str(id(command))
        command_type = type(command).__name__
        
        # Emit command-executing event
        if self.session_id:
            emit_command_executing(self.session_id, command_id, command_type)
        
        # Emit start event (legacy logging)
        self.logger.emit("Dispatcher", "EXECUTE_START", {
            "command": command_type
        })
        
        # Inject graph into command if it has the attribute
        if hasattr(command, 'graph') and command.graph is None:
            command.graph = self.graph
        
        try:
            result = command.execute()
            self.undo_stack.append(command)
            self.redo_stack.clear()  # Clear redo stack on new command
            
            # Emit command-executed event (success)
            if self.session_id:
                emit_command_executed(self.session_id, command_id, success=True)
            
            # Emit complete event (legacy logging)
            self.logger.emit("Dispatcher", "EXECUTE_COMPLETE", {
                "command": command_type,
                "result": str(result) if result is not None else None
            })
            
            return result
        except Exception as e:
            # Emit command-executed event (failure)
            if self.session_id:
                emit_command_executed(self.session_id, command_id, success=False, error=str(e))
            raise
    
    def undo(self) -> None:
        """Undo the last command."""
        if self.undo_stack:
            command = self.undo_stack.pop()
            command_id = str(id(command))
            command.undo()
            self.redo_stack.append(command)
            
            # Emit undo event
            if self.session_id:
                emit_undo(self.session_id, command_id)
    
    def redo(self) -> None:
        """Redo the last undone command."""
        if self.redo_stack:
            command = self.redo_stack.pop()
            command_id = str(id(command))
            command.execute()
            self.undo_stack.append(command)
            
            # Emit redo event
            if self.session_id:
                emit_redo(self.session_id, command_id)
