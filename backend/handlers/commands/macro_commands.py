from uuid import UUID
from typing import List, Optional, Tuple
from backend.handlers.command import Command
from backend.core.node import Node
from backend.core.imports import CSVImportPlan, PreparedCSVNode
from backend.handlers.commands.node_commands import CreateNodeCommand
from backend.api.broadcaster import emit_property_changed


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



class ImportNodesCommand(Command):
    """Command to bulk-create nodes from prepared CSV data."""

    def __init__(
        self,
        plan: CSVImportPlan,
        prepared_nodes: List[PreparedCSVNode],
        graph=None,
        blueprint=None,
        session_id: Optional[str] = None,
    ):
        self.plan = plan
        self.prepared_nodes = prepared_nodes
        self.graph = graph
        self.blueprint = blueprint
        self.session_id = session_id
        self._child_commands: List[Tuple[CreateNodeCommand, PreparedCSVNode]] = []
        self.created_node_ids: List[UUID] = []

    def execute(self) -> None:
        if not self.graph:
            raise ValueError("Graph is required for import execution")

        parent_node = None
        if self.plan.parent_id:
            parent_node = self.graph.get_node(self.plan.parent_id)
            if not parent_node:
                raise ValueError(f"Parent node {self.plan.parent_id} not found")
            if self.blueprint and not self.blueprint.is_allowed_child(
                parent_node.blueprint_type_id,
                self.plan.blueprint_type_id,
            ):
                raise ValueError(
                    f"Type '{self.plan.blueprint_type_id}' not allowed under '{parent_node.blueprint_type_id}'"
                )

        if not self._child_commands:
            for prepared in self.prepared_nodes:
                child_command = CreateNodeCommand(
                    blueprint_type_id=self.plan.blueprint_type_id,
                    name=prepared.name,
                    graph=self.graph,
                    blueprint=self.blueprint,
                    session_id=self.session_id,
                    parent_id=self.plan.parent_id,
                )
                self._child_commands.append((child_command, prepared))

        self.created_node_ids = []

        for child_command, prepared in self._child_commands:
            child_command.execute()
            node = child_command.node
            if not node:
                continue

            node.name = prepared.name
            if not hasattr(node, "properties") or node.properties is None:
                node.properties = {}

            previous_name = node.properties.get("name")
            node.properties["name"] = prepared.name
            if self.session_id and previous_name != prepared.name:
                emit_property_changed(
                    self.session_id,
                    str(node.id),
                    "name",
                    previous_name,
                    prepared.name,
                )

            for prop_id, value in prepared.properties.items():
                previous = node.properties.get(prop_id)
                if previous == value:
                    continue
                node.properties[prop_id] = value
                if self.session_id:
                    emit_property_changed(
                        self.session_id,
                        str(node.id),
                        prop_id,
                        previous,
                        value,
                    )

            self.created_node_ids.append(node.id)

    def undo(self) -> None:
        for child_command, _ in reversed(self._child_commands):
            child_command.undo()
        self.created_node_ids.clear()
