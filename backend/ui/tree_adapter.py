from backend.core.node import Node


class NodeTreeAdapter:
    """Adapter that converts Node objects to Toga-compatible tree row data."""
    
    def __init__(self, renderer=None):
        """Initialize the tree adapter.
        
        Args:
            renderer: Optional TreeViewModel for icon/visual rendering
        """
        self.renderer = renderer
    
    def node_to_row(self, node: Node) -> tuple:
        """Convert a Node to a tree row tuple.
        
        Args:
            node: The Node to convert
            
        Returns:
            Tuple of (icon, label, node_id) for tree rendering
        """
        icon = self.renderer.get_icon(node) if self.renderer else "file"
        label = node.name
        node_id = node.id
        
        return (icon, label, node_id)
    
    def row_to_node_id(self, row_data: tuple) -> str:
        """Extract node ID from a row tuple.
        
        Args:
            row_data: The row data tuple
            
        Returns:
            The node ID (third element)
        """
        return row_data[2] if len(row_data) > 2 else None
