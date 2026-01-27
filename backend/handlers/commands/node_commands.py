from uuid import UUID
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
