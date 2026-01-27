from typing import Dict, Any, List
from uuid import UUID
from backend.core.graph import ProjectGraph


class GraphService:
    """Service layer for graph operations, preparing data for the UI."""
    
    def __init__(self, graph: ProjectGraph):
        """
        Initialize the service.
        
        Args:
            graph: The ProjectGraph to work with
        """
        self.graph = graph
    
    def get_tree(self, root_id: UUID) -> Dict[str, Any]:
        """
        Get a nested dictionary representation of the tree starting from a root node.
        
        Args:
            root_id: The UUID of the root node
            
        Returns:
            A nested dictionary with 'id', 'name', and 'children' keys
        """
        root_node = self.graph.get_node(root_id)
        if not root_node:
            return {}
        
        return self._build_tree_dict(root_node)
    
    def _build_tree_dict(self, node) -> Dict[str, Any]:
        """
        Recursively build a tree dictionary from a node.
        
        Args:
            node: The Node to convert
            
        Returns:
            A dictionary representing the node and its children
        """
        tree_dict = {
            'id': node.id,
            'name': node.name,
            'children': []
        }
        
        for child_id in node.children:
            child_node = self.graph.get_node(child_id)
            if child_node:
                tree_dict['children'].append(self._build_tree_dict(child_node))
        
        return tree_dict
