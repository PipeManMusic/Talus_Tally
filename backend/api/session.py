from typing import List


class SessionManager:
    """Manages UI session state like current selection."""
    
    def __init__(self):
        """Initialize the session manager."""
        self.selection: List[str] = []
    
    def select(self, node_id: str) -> None:
        """
        Select a single node.
        
        Args:
            node_id: The ID of the node to select
        """
        self.selection = [node_id]
    
    def clear_selection(self) -> None:
        """Clear the current selection."""
        self.selection = []
