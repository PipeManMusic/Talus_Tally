from uuid import UUID
from typing import Optional
from backend.handlers.command import Command
from backend.core.node import Node
from backend.api.broadcaster import (
    emit_node_created,
    emit_node_deleted,
    emit_node_linked,
    emit_node_unlinked,
    emit_property_changed
)


class CreateNodeCommand(Command):
    """Command to create a new node in the graph."""
    
    def __init__(self, blueprint_type_id: str, name: str, graph=None, blueprint=None, session_id=None, parent_id=None):
        """
        Initialize the command.
        
        Args:
            blueprint_type_id: The type ID of the blueprint
            name: The name of the node
            graph: The ProjectGraph to add the node to
            blueprint: Optional Blueprint to initialize default properties
            session_id: Optional session ID for event broadcasting
            parent_id: Optional parent ID for event broadcasting
        """
        self.blueprint_type_id = blueprint_type_id
        self.name = name
        self.graph = graph
        self.blueprint = blueprint
        self.node: Node = None
        self.session_id = session_id
        self.parent_id = parent_id
    
    def execute(self) -> UUID:
        """
        Execute the command by creating and adding a node.
        
        Returns:
            The UUID of the created node
        """
        # Only create the node on the first execute
        if self.node is None:
            self.node = Node(blueprint_type_id=self.blueprint_type_id, name=self.name)
            self._initialize_default_status()
        if self.graph:
            self.graph.add_node(self.node)
        
        # Emit node-created event
        if self.session_id:
            emit_node_created(
                self.session_id,
                str(self.node.id),
                str(self.parent_id) if self.parent_id else None,
                self.blueprint_type_id,
                self.name
            )
        
        return self.node.id

    def _initialize_default_status(self) -> None:
        """Initialize default status from blueprint if available."""
        print(f"DEBUG _initialize_default_status: node={self.node.id}, type={self.blueprint_type_id}, has_blueprint={self.blueprint is not None}")
        
        if not self.blueprint:
            print(f"  -> No blueprint")
            return

        node_def = getattr(self.blueprint, "_node_type_map", {}).get(self.blueprint_type_id)
        print(f"  -> node_def found: {node_def is not None}")
        if not node_def:
            return

        properties = node_def._extra_props.get("properties", [])
        status_prop = next((p for p in properties if p.get("id") == "status"), None)
        print(f"  -> status_prop found: {status_prop is not None}")
        if not status_prop:
            return

        options = status_prop.get("options", [])
        print(f"  -> options count: {len(options)}")
        if not options:
            return

        default_id = options[0].get("id")
        print(f"  -> default_id: {default_id}")
        if not default_id:
            return

        # Initialize status property with first option if not already set
        if self.node.properties.get("status") is None:
            self.node.properties["status"] = default_id
            print(f"  -> Status initialized to {default_id}")
        else:
            print(f"  -> Status already set to {self.node.properties.get('status')}")
    
    def undo(self) -> None:
        """Undo the command by removing the node."""
        if self.node and self.graph:
            self.graph.remove_node(self.node.id)


class DeleteNodeCommand(Command):
    """Command to delete a node from the graph."""
    
    def __init__(self, node_id: UUID, graph=None, session_id=None):
        """
        Initialize the command.
        
        Args:
            node_id: The UUID of the node to delete
            graph: The ProjectGraph to delete the node from
            session_id: Optional session ID for event broadcasting
        """
        self.node_id = node_id
        self.graph = graph
        self.deleted_node: Optional[Node] = None
        self.session_id = session_id
    
    def execute(self) -> None:
        """Execute the command by removing the node."""
        if self.graph:
            self.deleted_node = self.graph.get_node(self.node_id)
            self.graph.remove_node(self.node_id)
            
            # Emit node-deleted event
            if self.session_id:
                emit_node_deleted(self.session_id, str(self.node_id))
    
    def undo(self) -> None:
        """Undo the command by restoring the node."""
        if self.deleted_node and self.graph:
            self.graph.add_node(self.deleted_node)


class LinkNodeCommand(Command):
    """Command to link a child node to a parent node."""
    
    def __init__(self, parent_id: UUID, child_id: UUID, graph=None, session_id=None):
        """
        Initialize the command.
        
        Args:
            parent_id: The UUID of the parent node
            child_id: The UUID of the child node
            graph: The ProjectGraph containing the nodes
            session_id: Optional session ID for event broadcasting
        """
        self.parent_id = parent_id
        self.child_id = child_id
        self.graph = graph
        self.session_id = session_id
    
    def execute(self) -> None:
        """Execute the command by linking the nodes."""
        if self.graph:
            parent = self.graph.get_node(self.parent_id)
            child = self.graph.get_node(self.child_id)
            if parent and child:
                parent.children.append(child.id)
                child.parent_id = parent.id
                
                # Emit node-linked event
                if self.session_id:
                    emit_node_linked(self.session_id, str(self.parent_id), str(self.child_id))
    
    def undo(self) -> None:
        """Undo the command by unlinking the nodes."""
        if self.graph:
            parent = self.graph.get_node(self.parent_id)
            child = self.graph.get_node(self.child_id)
            if parent and child:
                if child.id in parent.children:
                    parent.children.remove(child.id)
                child.parent_id = None
                
                # Emit node-unlinked event
                if self.session_id:
                    emit_node_unlinked(self.session_id, str(self.parent_id), str(self.child_id))


class UpdatePropertyCommand(Command):
    """Command to update a node property with undo support."""
    
    def __init__(self, node_id: UUID, property_id: str, old_value, new_value, graph=None, graph_service=None, session_id=None):
        """
        Initialize the command.
        
        Args:
            node_id: The UUID of the node to update
            property_id: The property field to update
            old_value: The old value (for undo)
            new_value: The new value for the property
            graph: The ProjectGraph containing the node
            graph_service: Optional GraphService to notify of changes
            session_id: Optional session ID for event broadcasting
        """
        self.node_id = node_id
        self.property_id = property_id
        self.old_value = old_value
        self.new_value = new_value
        self.graph = graph
        self.graph_service = graph_service
        self.session_id = session_id
    
    def execute(self) -> None:
        """Execute the command by updating the property."""
        print(f"DEBUG UpdatePropertyCommand.execute: node_id={self.node_id}, property_id={self.property_id}, new_value={self.new_value}, has_graph_service={self.graph_service is not None}")
        if self.graph:
            node = self.graph.get_node(self.node_id)
            if node:
                # Update property in node's properties dict
                if not hasattr(node, 'properties'):
                    node.properties = {}
                node.properties[self.property_id] = self.new_value
                print(f"DEBUG: Updated node property, node.properties={node.properties}")
                
                # Emit property-changed event
                if self.session_id:
                    emit_property_changed(
                        self.session_id,
                        str(self.node_id),
                        self.property_id,
                        self.old_value,
                        self.new_value
                    )
                
                # Notify API subscribers of the change
                if self.graph_service:
                    print(f"DEBUG: Calling graph_service.notify_property_changed")
                    self.graph_service.notify_property_changed(
                        self.node_id,
                        self.property_id,
                        self.new_value
                    )
                else:
                    print(f"DEBUG: No graph_service provided")
    
    def undo(self) -> None:
        """Undo the command by restoring the old value."""
        if self.graph:
            node = self.graph.get_node(self.node_id)
            if node:
                if not hasattr(node, 'properties'):
                    node.properties = {}
                node.properties[self.property_id] = self.old_value
