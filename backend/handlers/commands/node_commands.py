from uuid import UUID
from typing import Optional
from backend.handlers.command import Command
from backend.core.node import Node


class CreateNodeCommand(Command):
    """Command to create a new node in the graph."""
    
    def __init__(self, blueprint_type_id: str, name: str, graph=None):
        """
        Initialize the command.
        
        Args:
            blueprint_type_id: The type ID of the blueprint
            name: The name of the node
            graph: The ProjectGraph to add the node to
        """
        self.blueprint_type_id = blueprint_type_id
        self.name = name
        self.graph = graph
        self.node: Node = None
    
    def execute(self) -> UUID:
        """
        Execute the command by creating and adding a node.
        
        Returns:
            The UUID of the created node
        """
        # Only create the node on the first execute
        if self.node is None:
            self.node = Node(blueprint_type_id=self.blueprint_type_id, name=self.name)
        if self.graph:
            self.graph.add_node(self.node)
        return self.node.id
    
    def undo(self) -> None:
        """Undo the command by removing the node."""
        if self.node and self.graph:
            self.graph.remove_node(self.node.id)


class DeleteNodeCommand(Command):
    """Command to delete a node from the graph."""
    
    def __init__(self, node_id: UUID, graph=None):
        """
        Initialize the command.
        
        Args:
            node_id: The UUID of the node to delete
            graph: The ProjectGraph to delete the node from
        """
        self.node_id = node_id
        self.graph = graph
        self.deleted_node: Optional[Node] = None
    
    def execute(self) -> None:
        """Execute the command by removing the node."""
        if self.graph:
            self.deleted_node = self.graph.get_node(self.node_id)
            self.graph.remove_node(self.node_id)
    
    def undo(self) -> None:
        """Undo the command by restoring the node."""
        if self.deleted_node and self.graph:
            self.graph.add_node(self.deleted_node)


class LinkNodeCommand(Command):
    """Command to link a child node to a parent node."""
    
    def __init__(self, parent_id: UUID, child_id: UUID, graph=None):
        """
        Initialize the command.
        
        Args:
            parent_id: The UUID of the parent node
            child_id: The UUID of the child node
            graph: The ProjectGraph containing the nodes
        """
        self.parent_id = parent_id
        self.child_id = child_id
        self.graph = graph
    
    def execute(self) -> None:
        """Execute the command by linking the nodes."""
        if self.graph:
            parent = self.graph.get_node(self.parent_id)
            child = self.graph.get_node(self.child_id)
            if parent and child:
                parent.children.append(child.id)
                child.parent_id = parent.id
    
    def undo(self) -> None:
        """Undo the command by unlinking the nodes."""
        if self.graph:
            parent = self.graph.get_node(self.parent_id)
            child = self.graph.get_node(self.child_id)
            if parent and child:
                if child.id in parent.children:
                    parent.children.remove(child.id)
                child.parent_id = None
