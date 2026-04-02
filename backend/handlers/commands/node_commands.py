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
            self._initialize_select_defaults()
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

    def _initialize_select_defaults(self) -> None:
        """Initialize all select properties to their first option value."""
        if not self.blueprint:
            return

        node_def = None
        if hasattr(self.blueprint, 'get_node_type'):
            node_def = self.blueprint.get_node_type(self.blueprint_type_id)
        else:
            node_def = getattr(self.blueprint, "_node_type_map", {}).get(self.blueprint_type_id)
        if not node_def:
            return

        properties = node_def._extra_props.get("properties", [])
        for prop in properties:
            if prop.get("type") != "select":
                continue
            options = prop.get("options", [])
            if not options:
                continue
            default_id = options[0].get("id")
            if not default_id:
                continue
            prop_key = prop.get("uuid") or prop.get("id")
            if self.node.properties.get(prop_key) is None:
                self.node.properties[prop_key] = default_id
    
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
        self.parent_id: Optional[UUID] = None
        self.parent_index: Optional[int] = None
        self.session_id = session_id
    
    def execute(self) -> None:
        """Execute the command by removing the node."""
        if self.graph:
            self.deleted_node = self.graph.get_node(self.node_id)
            if self.deleted_node and self.deleted_node.parent_id:
                self.parent_id = self.deleted_node.parent_id
                parent = self.graph.get_node(self.parent_id)
                if parent and self.node_id in parent.children:
                    self.parent_index = parent.children.index(self.node_id)
            self.graph.remove_node(self.node_id)
            
            # Emit node-deleted event
            if self.session_id:
                emit_node_deleted(self.session_id, str(self.node_id))
    
    def undo(self) -> None:
        """Undo the command by restoring the node."""
        if self.deleted_node and self.graph:
            self.graph.add_node(self.deleted_node)
            if self.parent_id:
                parent = self.graph.get_node(self.parent_id)
                if parent:
                    if self.node_id in parent.children:
                        return
                    if self.parent_index is not None and self.parent_index <= len(parent.children):
                        parent.children.insert(self.parent_index, self.node_id)
                    else:
                        parent.children.append(self.node_id)


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
        if self.graph:
            node = self.graph.get_node(self.node_id)
            if node:
                metadata = getattr(node, 'metadata', {}) or {}
                if metadata.get('orphaned'):
                    raise ValueError(
                        f"Cannot edit orphaned node {self.node_id}. "
                        f"Fix the template or delete the orphaned data."
                    )

                orphaned_props = metadata.get('orphaned_properties', {})
                if self.property_id in orphaned_props:
                    raise ValueError(
                        f"Cannot edit orphaned property '{self.property_id}' on node {self.node_id}. "
                        f"Delete it or restore it in the template."
                    )

                # Update property in node's properties dict
                if not hasattr(node, 'properties'):
                    node.properties = {}
                node.properties[self.property_id] = self.new_value
                
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
                    self.graph_service.notify_property_changed(
                        self.node_id,
                        self.property_id,
                        self.new_value
                    )
    
    def undo(self) -> None:
        """Undo the command by restoring the old value."""
        if self.graph:
            node = self.graph.get_node(self.node_id)
            if node:
                if not hasattr(node, 'properties'):
                    node.properties = {}
                node.properties[self.property_id] = self.old_value
                print(f"DEBUG: Restored node property, node.properties={node.properties}")
                
                # Emit property-changed event for undo
                if self.session_id:
                    print(f"DEBUG: Emitting property-changed event for undo")
                    emit_property_changed(
                        self.session_id,
                        str(self.node_id),
                        self.property_id,
                        self.new_value,  # Old value from frontend perspective
                        self.old_value   # New value from frontend perspective
                    )
                else:
                    print(f"DEBUG: No session_id, skipping emit_property_changed")

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
                
                # Emit events for undo
                if self.session_id:
                    emit_node_unlinked(self.session_id, str(self.new_parent_id), str(self.node_id))
                    emit_node_linked(self.session_id, str(self.old_parent_id), str(self.node_id))
        else:
            # Node had no parent before, restore that state
            node.parent_id = None
            if self.session_id:
                emit_node_unlinked(self.session_id, str(self.new_parent_id), str(self.node_id))


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


class DeleteOrphanedPropertyCommand(Command):
    """Command to delete an orphaned property from a node's metadata."""

    def __init__(self, node_id: UUID, property_key: str, graph=None, graph_service=None, session_id=None):
        self.node_id = node_id
        self.property_key = property_key
        self.graph = graph
        self.graph_service = graph_service
        self.session_id = session_id
        self.old_value = None  # for undo

    def execute(self) -> None:
        if not self.graph:
            return
        node = self.graph.get_node(self.node_id)
        if not node:
            return

        orphaned = getattr(node, 'metadata', {}) or {}
        orphaned_props = orphaned.get('orphaned_properties', {})

        if self.property_key in orphaned_props:
            self.old_value = orphaned_props.pop(self.property_key)

            # Also remove from node.properties if it's still there
            props = getattr(node, 'properties', {}) or {}
            props.pop(self.property_key, None)

            if self.session_id:
                from backend.api.broadcaster import emit_property_changed
                emit_property_changed(
                    self.session_id,
                    str(self.node_id),
                    self.property_key,
                    self.old_value,
                    None,
                )

    def undo(self) -> None:
        if not self.graph or self.old_value is None:
            return
        node = self.graph.get_node(self.node_id)
        if not node:
            return

        metadata = getattr(node, 'metadata', None)
        if metadata is None:
            node.metadata = {}
            metadata = node.metadata
        if 'orphaned_properties' not in metadata:
            metadata['orphaned_properties'] = {}
        metadata['orphaned_properties'][self.property_key] = self.old_value
        
        # Emit property-changed event for undo
        if self.session_id:
            emit_property_changed(
                self.session_id,
                str(self.node_id),
                self.property_key,
                None,
                self.old_value,
            )


class RecalculateOrphanStatusCommand(Command):
    """Command to reload the blueprint and recalculate orphaned node/property status."""

    def __init__(self, graph=None, blueprint=None, session_id=None, template_id=None):
        """
        Initialize the command.

        Args:
            graph: The ProjectGraph to analyze
            blueprint: The current Blueprint (old blueprint for comparison)
            session_id: Optional session ID for event broadcasting
            template_id: The template ID to reload from disk
        """
        self.graph = graph
        self.blueprint = blueprint
        self.session_id = session_id
        self.template_id = template_id
        self.orphan_info = {
            'orphaned_nodes': [],
            'orphaned_properties': {},
            'total_affected': 0,
        }

    def execute(self) -> dict:
        """
        Execute the command by reloading blueprint and recalculating orphaned status.

        Returns:
            Dict with orphan recalculation results
        """
        if not self.graph or not self.template_id:
            return self.orphan_info

        try:
            # Build old template dict for comparison
            old_template_dict = None
            if self.blueprint:
                old_template_dict = {
                    'id': self.blueprint.id,
                    'name': self.blueprint.name,
                    'version': self.blueprint.version,
                    'node_types': []
                }
                for nt in self.blueprint.node_types:
                    nt_dict = {
                        'id': nt.id,
                        'name': nt.name,
                        'allowed_children': nt.allowed_children,
                        'properties': nt.properties or [],
                    }
                    old_template_dict['node_types'].append(nt_dict)

            # Load new template dict from disk
            new_template_dict = None
            try:
                from backend.infra.template_persistence import TemplatePersistence
                persistence = TemplatePersistence()
                new_template_dict = persistence.load_template(self.template_id)
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"Could not load template dict for orphan detection: {e}")
                return self.orphan_info

            # Run orphan detection if we have both templates
            if old_template_dict and new_template_dict:
                orphan_mgr = OrphanManager()
                removed_types = orphan_mgr.find_orphaned_node_types(old_template_dict, new_template_dict)
                orphaned_props_by_type = orphan_mgr.find_orphaned_properties(old_template_dict, new_template_dict)

                if removed_types or orphaned_props_by_type:
                    # Mark nodes as orphaned
                    if removed_types:
                        result = orphan_mgr.mark_orphaned_nodes(self.graph, removed_types)
                        self.orphan_info['orphaned_nodes'] = result.get('orphaned_node_ids', [])
                        self.orphan_info['total_affected'] += result.get('affected_count', 0)

                    # Mark properties as orphaned
                    if orphaned_props_by_type:
                        orphaned_prop_count = orphan_mgr.mark_orphaned_properties(self.graph, orphaned_props_by_type)
                        self.orphan_info['orphaned_properties'] = orphaned_props_by_type
                        self.orphan_info['total_affected'] += orphaned_prop_count

        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"RecalculateOrphanStatusCommand failed: {e}", exc_info=True)

        return self.orphan_info

    def undo(self) -> None:
        """Undo is not supported for this command as it modifies metadata directly."""
        pass