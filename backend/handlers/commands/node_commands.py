from uuid import UUID
from typing import Optional
from backend.handlers.command import Command
from backend.core.node import Node
from backend.infra.orphan_manager import OrphanManager
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
            
        Raises:
            ValueError: If the parent node is orphaned and cannot have children
        """
        # Only create the node on the first execute
        if self.node is None:
            self.node = Node(blueprint_type_id=self.blueprint_type_id, name=self.name)
            self._initialize_default_status()
        if self.graph:
            self.graph.add_node(self.node)

            # Link to parent if specified
            if self.parent_id:
                parent = self.graph.get_node(self.parent_id)
                if parent:
                    # Check if parent is orphaned (cannot have children)
                    parent_dict = {
                        'metadata': parent.metadata if hasattr(parent, 'metadata') else {}
                    }
                    if not OrphanManager.can_add_child(parent_dict):
                        raise ValueError(
                            f"Cannot add child to orphaned node {self.parent_id}. "
                            f"Orphaned nodes exist outside the template and cannot have children added."
                        )
                    
                    if self.node.id not in parent.children:
                        parent.children.append(self.node.id)
                    self.node.parent_id = parent.id
        
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
            # Unlink from parent if present
            if self.parent_id:
                parent = self.graph.get_node(self.parent_id)
                if parent and self.node.id in parent.children:
                    parent.children.remove(self.node.id)
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

class MoveNodeCommand(Command):
    """Command to move a node to a different parent with validation."""
    
    def __init__(self, node_id: UUID, new_parent_id: UUID, graph=None, blueprint=None, session_id=None):
        """
        Initialize the command.
        
        Args:
            node_id: The UUID of the node to move
            new_parent_id: The UUID of the new parent node
            graph: The ProjectGraph containing the nodes
            blueprint: The Blueprint for validation rules
            session_id: Optional session ID for event broadcasting
            
        Raises:
            ValueError: If the move is invalid (type mismatch, cycle, orphaned parent, etc.)
        """
        self.node_id = node_id
        self.new_parent_id = new_parent_id
        self.graph = graph
        self.blueprint = blueprint
        self.session_id = session_id
        self.old_parent_id: Optional[UUID] = None
        
        # Validate the move before executing
        self._validate_move()
    
    def _validate_move(self) -> None:
        """Validate that the move is allowed."""
        if not self.graph:
            return
        
        # Get the nodes
        node = self.graph.get_node(self.node_id)
        new_parent = self.graph.get_node(self.new_parent_id)
        
        if not node:
            raise ValueError(f"Node {self.node_id} not found")
        
        if not new_parent:
            raise ValueError(f"Parent node {self.new_parent_id} not found")
        
        # Check if new parent is orphaned (cannot have children)
        parent_dict = {
            'metadata': new_parent.metadata if hasattr(new_parent, 'metadata') else {}
        }
        if not OrphanManager.can_add_child(parent_dict):
            raise ValueError(
                f"Cannot move node to orphaned parent {self.new_parent_id}. "
                f"Orphaned nodes exist outside the template and cannot have children added."
            )
        
        # Check if the node type is allowed as a child of the new parent
        if self.blueprint:
            node_type = node.blueprint_type_id
            parent_type = new_parent.blueprint_type_id
            
            if not self.blueprint.is_allowed_child(parent_type, node_type):
                raise ValueError(
                    f"Node type '{node_type}' is not allowed as a child of '{parent_type}'. "
                    f"Allowed types: {self.blueprint._node_type_map.get(parent_type).allowed_children if parent_type in self.blueprint._node_type_map else 'unknown'}"
                )
        
        # Check if move would create a cycle
        if self._would_create_cycle(node, new_parent):
            raise ValueError(
                f"Moving node {self.node_id} to parent {self.new_parent_id} would create a cycle"
            )
        
        # Store old parent for undo
        self.old_parent_id = node.parent_id
    
    def _would_create_cycle(self, node: Node, new_parent: Node) -> bool:
        """Check if moving node under new_parent would create a cycle."""
        if not self.graph:
            return False
        
        # If new parent is the node itself, that's a cycle
        if node.id == new_parent.id:
            return True
        
        # Check if new_parent is already a descendant of node
        # (which would create a cycle if we make node a child of new_parent)
        visited = set()
        
        def is_descendant(potential_ancestor: Node, potential_descendant: Node) -> bool:
            """Check if potential_descendant is a descendant of potential_ancestor."""
            if potential_ancestor.id in visited:
                return False
            visited.add(potential_ancestor.id)
            
            if potential_ancestor.id == potential_descendant.id:
                return True
            
            for child_id in potential_ancestor.children:
                child = self.graph.get_node(child_id)
                if child and is_descendant(child, potential_descendant):
                    return True
            
            return False
        
        # new_parent would become a descendant of node if we move node as a child of new_parent
        # This would create a cycle
        return is_descendant(node, new_parent)
    
    def execute(self) -> None:
        """Execute the command by moving the node."""
        if not self.graph:
            return
        
        node = self.graph.get_node(self.node_id)
        new_parent = self.graph.get_node(self.new_parent_id)
        
        if not node or not new_parent:
            return
        
        # Remove from old parent if present
        if self.old_parent_id:
            old_parent = self.graph.get_node(self.old_parent_id)
            if old_parent and node.id in old_parent.children:
                old_parent.children.remove(node.id)
        
        # Add to new parent
        if node.id not in new_parent.children:
            new_parent.children.append(node.id)
        
        # Update node's parent reference
        node.parent_id = self.new_parent_id
        
        # Emit node-moved event (using node-linked/unlinked for now)
        if self.session_id:
            if self.old_parent_id:
                emit_node_unlinked(self.session_id, str(self.old_parent_id), str(self.node_id))
            emit_node_linked(self.session_id, str(self.new_parent_id), str(self.node_id))
    
    def undo(self) -> None:
        """Undo the command by moving the node back to its old parent."""
        if not self.graph:
            return
        
        node = self.graph.get_node(self.node_id)
        new_parent = self.graph.get_node(self.new_parent_id)
        
        if not node or not new_parent:
            return
        
        # Remove from new parent
        if node.id in new_parent.children:
            new_parent.children.remove(node.id)
        
        # Add back to old parent if it existed
        if self.old_parent_id:
            old_parent = self.graph.get_node(self.old_parent_id)
            if old_parent:
                if node.id not in old_parent.children:
                    old_parent.children.append(node.id)
                node.parent_id = self.old_parent_id
        else:
            # Node had no parent before, restore that state
            node.parent_id = None


class ReorderNodeCommand(Command):
    """Command to reorder a node within its parent's children array."""
    def __init__(self, node_id: UUID, new_index: int, graph=None, session_id=None):
        self.node_id = node_id
        self.new_index = new_index
        self.graph = graph
        self.session_id = session_id
        self.old_index: Optional[int] = None
        self.parent_id: Optional[UUID] = None

    def execute(self) -> None:
        if not self.graph:
            return
        node = self.graph.get_node(self.node_id)
        if not node or node.parent_id is None:
            return
        parent = self.graph.get_node(node.parent_id)
        if not parent or not hasattr(parent, 'children'):
            return
        try:
            self.old_index = parent.children.index(self.node_id)
        except ValueError:
            return
        self.parent_id = parent.id
        # Remove and re-insert at new index
        parent.children.pop(self.old_index)
        insert_at = self.new_index
        if insert_at > len(parent.children):
            insert_at = len(parent.children)
        parent.children.insert(insert_at, self.node_id)
        # Optionally emit event here

    def undo(self) -> None:
        if not self.graph or self.parent_id is None or self.old_index is None:
            return
        parent = self.graph.get_node(self.parent_id)
        if not parent or not hasattr(parent, 'children'):
            return
        try:
            idx = parent.children.index(self.node_id)
            parent.children.pop(idx)
            parent.children.insert(self.old_index, self.node_id)
        except ValueError:
            return