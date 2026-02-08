from typing import Dict, List, Optional
from uuid import UUID
from backend.core.node import Node


class ProjectGraph:
    """Global registry of all nodes in a project."""
    
    def __init__(self, template_id: Optional[str] = None, template_version: Optional[str] = None):
        """Initialize an empty graph.
        
        Args:
            template_id: The ID of the template this graph uses (e.g. 'project_talus')
            template_version: The version of the template (e.g. '0.2.0')
        """
        self.nodes: Dict[UUID, Node] = {}
        self.template_id = template_id
        self.template_version = template_version
    
    @property
    def roots(self) -> List[Node]:
        """Get all root nodes (nodes without parents)."""
        return [node for node in self.nodes.values() if node.parent_id is None]
    
    def add_node(self, node: Node) -> None:
        print(f"[DEBUG][ProjectGraph.add_node] node.id={node.id} type(node)={type(node)} node.blueprint_type_id={getattr(node, 'blueprint_type_id', None)} type(blueprint_type_id)={type(getattr(node, 'blueprint_type_id', None))}")
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
        Remove a node from the graph and clean up all references.
        
        Args:
            node_id: The UUID of the node to remove
        """
        if node_id in self.nodes:
            node = self.nodes[node_id]
            
            # Remove from parent's children list
            if node.parent_id and node.parent_id in self.nodes:
                parent = self.nodes[node.parent_id]
                if hasattr(parent, 'children') and node_id in parent.children:
                    parent.children.remove(node_id)
                    print(f"[remove_node] Removed {node_id} from parent {parent.id}.children")
            
            # Remove from roots if it's a root node
            if node in self.roots:
                self.roots.remove(node)
                print(f"[remove_node] Removed {node_id} from roots")
            
            # Delete the node
            del self.nodes[node_id]
            print(f"[remove_node] Deleted node {node_id}")
    
    def get_orphans(self) -> List[Node]:
        """
        Get all nodes that have no parent.
        
        Returns:
            List of nodes with no parent_id set
        """
        return [node for node in self.nodes.values() if node.parent_id is None]
