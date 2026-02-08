from typing import Dict, Any, List, Callable, Optional
from uuid import UUID
from backend.core.graph import ProjectGraph
from backend.infra.template_persistence import get_templates_directory


class GraphService:
    """Service layer for graph operations, preparing data for the UI."""
    
    def __init__(self, graph: ProjectGraph):
        """
        Initialize the service.
        
        Args:
            graph: The ProjectGraph to work with
        """
        self.graph = graph
        # Subscribers for property changes: (node_id: UUID, property_id: str, new_value: Any) -> None
        self._property_change_subscribers: List[Callable] = []
    
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
    
    def export_report(self, template_string: str, root_id: UUID = None) -> str:
        """
        Export a report using a Jinja2 template.
        
        Args:
            template_string: The Jinja2 template string to render
            root_id: Optional root node ID for the tree to export. If None, uses the graph
            
        Returns:
            The rendered report as a string
        """
        from backend.infra.reporting import ReportEngine
        
        engine = ReportEngine()
        
        # Build context for the template
        context = {
            'graph': self.graph,
            'nodes': list(self.graph.nodes.values()),
        }
        
        # If root_id is provided, include the tree structure
        if root_id:
            context['tree'] = self.get_tree(root_id)
            context['root'] = self.graph.get_node(root_id)
        
        # If graph has a root node, include it
        if len(self.graph.nodes) > 0:
            # Find root node (node with no parent)
            for node in self.graph.nodes.values():
                if node.parent_id is None:
                    context['root'] = node
                    context['tree'] = self._build_tree_dict(node)
                    break
        
        return engine.render_string(template_string, context)
    
    def get_available_templates(self) -> List[str]:
        """
        Get list of available export templates.
        
        Returns:
            List of template names
        """
        import os
        import yaml
        
        templates_dir = get_templates_directory()
        
        template_names = []
        
        if os.path.exists(templates_dir):
            for filename in os.listdir(templates_dir):
                if filename.endswith('.yaml') or filename.endswith('.yml'):
                    template_names.append(filename)
        
        return template_names


    def subscribe_to_property_changes(self, callback: Callable) -> None:
        """
        Subscribe to property change notifications.
        
        Args:
            callback: Function to call on property changes with signature:
                     (node_id: UUID, property_id: str, new_value: Any) -> None
        """
        self._property_change_subscribers.append(callback)
    
    def unsubscribe_from_property_changes(self, callback: Callable) -> None:
        """
        Unsubscribe from property change notifications.
        
        Args:
            callback: The callback function to remove
        """
        if callback in self._property_change_subscribers:
            self._property_change_subscribers.remove(callback)
    
    def notify_property_changed(self, node_id: UUID, property_id: str, new_value: Any) -> None:
        """
        Notify all subscribers of a property change.
        Called by commands when a property is updated.
        
        Args:
            node_id: The UUID of the changed node
            property_id: The ID of the property that changed
            new_value: The new value of the property
        """
        print(f"DEBUG GraphService.notify_property_changed: node_id={node_id}, property_id={property_id}, new_value={new_value}, subscribers={len(self._property_change_subscribers)}")
        for callback in self._property_change_subscribers:
            try:
                print(f"DEBUG: Calling subscriber {callback}")
                callback(node_id, property_id, new_value)
                print(f"DEBUG: Subscriber returned successfully")
            except Exception as e:
                # Log but don't crash if a subscriber fails
                import logging
                logging.error(f"Error in property change subscriber: {e}")
                print(f"DEBUG ERROR: {e}")

