from uuid import UUID
from typing import List
from backend.handlers.command import Command
from backend.core.node import Node


class ApplyKitCommand(Command):
    """Command to clone a kit's children to a target node."""
    
    def __init__(self, target_id: UUID, kit_root_id: UUID, graph=None):
        """
        Initialize the command.
        
        Args:
            target_id: The UUID of the target node to add clones to
            kit_root_id: The UUID of the kit root node to clone from
            graph: The ProjectGraph containing the nodes
        """
        self.target_id = target_id
        self.kit_root_id = kit_root_id
        self.graph = graph
        self.cloned_node_ids: List[UUID] = []
    
    def execute(self) -> None:
        """Execute the command by cloning kit children to the target."""
        if not self.graph:
            return
        
        target_node = self.graph.get_node(self.target_id)
        kit_node = self.graph.get_node(self.kit_root_id)
        
        if not target_node or not kit_node:
            return
        
        # Clone each child of the kit
        for child_id in kit_node.children:
            original_child = self.graph.get_node(child_id)
            if original_child:
                # Create a clone
                clone = Node(
                    blueprint_type_id=original_child.blueprint_type_id,
                    name=original_child.name
                )
                clone.properties = original_child.properties.copy()
                
                # Add clone to graph
                self.graph.add_node(clone)
                self.cloned_node_ids.append(clone.id)
                
                # Link to target
                target_node.children.append(clone.id)
                clone.parent_id = target_node.id
    
    def undo(self) -> None:
        """Undo the command by removing the cloned nodes."""
        if not self.graph:
            return
        
        target_node = self.graph.get_node(self.target_id)
        
        # Remove clones from target's children
        if target_node:
            for clone_id in self.cloned_node_ids:
                if clone_id in target_node.children:
                    target_node.children.remove(clone_id)
        
        # Remove clones from graph
        for clone_id in self.cloned_node_ids:
            self.graph.remove_node(clone_id)
        
        self.cloned_node_ids.clear()
