from typing import Dict, List, Optional
from uuid import UUID
from backend.core.node import Node


class ProjectGraph:
    """Global registry of all nodes in a project."""
    
    def __init__(self):
        """Initialize an empty graph."""
        self.nodes: Dict[UUID, Node] = {}
    
    def add_node(self, node: Node) -> None:
        """
        Add a node to the graph.
        
        Args:
            node: The Node to add
        """
        self.nodes[node.id] = node
    
    def get_node(self, node_id: UUID) -> Optional[Node]:
        """
        Retrieve a node by ID.
        
        Args:
            node_id: The UUID of the node to retrieve
            
        Returns:
            The Node if found, None otherwise
        """
        return self.nodes.get(node_id)
    
    def remove_node(self, node_id: UUID) -> None:
        """
        Remove a node from the graph.
        
        Args:
            node_id: The UUID of the node to remove
        """
        if node_id in self.nodes:
            del self.nodes[node_id]
    
    def get_orphans(self) -> List[Node]:
        """
        Get all nodes that have no parent.
        
        Returns:
            List of nodes with no parent_id set
        """
        return [node for node in self.nodes.values() if node.parent_id is None]
