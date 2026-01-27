from typing import Any, List
from backend.handlers.command import Command
from backend.core.graph import ProjectGraph


class CommandDispatcher:
    """Manages command execution, undo, and redo."""
    
    def __init__(self, graph: ProjectGraph):
        """
        Initialize the dispatcher with a project graph.
        
        Args:
            graph: The ProjectGraph to operate on
        """
        self.graph = graph
        self.undo_stack: List[Command] = []
        self.redo_stack: List[Command] = []
    
    def execute(self, command: Command) -> Any:
        """
        Execute a command.
        
        Args:
            command: The Command to execute
            
        Returns:
            The result of the command's execute method
        """
        # Inject graph into command if it has the attribute
        if hasattr(command, 'graph') and command.graph is None:
            command.graph = self.graph
        result = command.execute()
        self.undo_stack.append(command)
        self.redo_stack.clear()  # Clear redo stack on new command
        return result
    
    def undo(self) -> None:
        """Undo the last command."""
        if self.undo_stack:
            command = self.undo_stack.pop()
            command.undo()
            self.redo_stack.append(command)
    
    def redo(self) -> None:
        """Redo the last undone command."""
        if self.redo_stack:
            command = self.redo_stack.pop()
            command.execute()
            self.undo_stack.append(command)
