"""
Orphan Node Manager - handles orphaning nodes when template types are removed.

When a template is updated and node types are removed, existing nodes of those
types become "orphaned" - they can no longer have children and exist outside
the template structure, but their data is preserved.

Similarly, when properties are removed from node types, existing property values
become "orphaned properties" - preserved but read-only in the UI.
"""

from typing import List, Dict, Any, Set
import logging

logger = logging.getLogger(__name__)


class OrphanManager:
    """Manages orphaning of nodes and properties when template definitions change."""
    
    @staticmethod
    def find_orphaned_node_types(
        old_template: Dict[str, Any],
        new_template: Dict[str, Any]
    ) -> Set[str]:
        """
        Find node type IDs that exist in old template but not in new template.
        
        Args:
            old_template: Previous template definition
            new_template: Updated template definition
            
        Returns:
            Set of node type IDs that have been removed
        """
        old_types = {nt['id'] for nt in old_template.get('node_types', [])}
        new_types = {nt['id'] for nt in new_template.get('node_types', [])}
        removed_types = old_types - new_types
        
        if removed_types:
            logger.info(f"Removed node types: {removed_types}")
        
        return removed_types
    
    @staticmethod
    def mark_orphaned_nodes(
        graph: Dict[str, Any],
        orphaned_types: Set[str]
    ) -> Dict[str, List[str]]:
        """
        Mark nodes in graph as orphaned if their type was removed.
        
        Args:
            graph: Graph data with nodes and edges
            orphaned_types: Set of node type IDs that have been removed
            
        Returns:
            Dict with 'orphaned_node_ids' list and 'affected_count' int
        """
        if not orphaned_types:
            return {'orphaned_node_ids': [], 'affected_count': 0}
        
        orphaned_node_ids = []
        affected_count = 0
        
        # Check all nodes in graph
        for node_id, node_data in graph.get('nodes', {}).items():
            node_type = node_data.get('type')
            
            if node_type in orphaned_types:
                # Mark as orphaned
                if 'metadata' not in node_data:
                    node_data['metadata'] = {}
                
                node_data['metadata']['orphaned'] = True
                node_data['metadata']['orphaned_reason'] = (
                    f"Node type '{node_type}' removed from template"
                )
                
                orphaned_node_ids.append(node_id)
                affected_count += 1
                
                logger.info(
                    f"Marked node {node_id} (type: {node_type}) as orphaned"
                )
        
        return {
            'orphaned_node_ids': orphaned_node_ids,
            'affected_count': affected_count
        }
    
    @staticmethod
    def get_orphaned_nodes(graph: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Get all orphaned nodes from a graph.
        
        Args:
            graph: Graph data
            
        Returns:
            List of orphaned node data with id, type, label, metadata
        """
        orphaned = []
        
        for node_id, node_data in graph.get('nodes', {}).items():
            if node_data.get('metadata', {}).get('orphaned'):
                orphaned.append({
                    'id': node_id,
                    'type': node_data.get('type'),
                    'label': node_data.get('label', 'Untitled'),
                    'metadata': node_data.get('metadata', {}),
                    'properties': node_data.get('properties', {})
                })
        
        return orphaned
    
    @staticmethod
    def can_add_child(node: Dict[str, Any]) -> bool:
        """
        Check if a node can have children added.
        
        Orphaned nodes cannot have children added.
        
        Args:
            node: Node data
            
        Returns:
            True if children can be added, False otherwise
        """
        return not node.get('metadata', {}).get('orphaned', False)
    
    @staticmethod
    def can_change_type(node: Dict[str, Any]) -> bool:
        """
        Check if a node's type can be changed.
        
        Orphaned nodes cannot change type (type doesn't exist in template).
        
        Args:
            node: Node data
            
        Returns:
            True if type can be changed, False otherwise
        """
        return not node.get('metadata', {}).get('orphaned', False)

    @staticmethod
    def find_orphaned_properties(old_template: Dict[str, Any], new_template: Dict[str, Any]) -> Dict[str, Set[str]]:
        """
        Find properties that were removed from node types in the template.
        
        Args:
            old_template: The previous version of the template
            new_template: The new version of the template
            
        Returns:
            Dict mapping node type IDs to sets of removed property keys
        """
        orphaned_props_by_type = {}
        
        old_types = {nt['id']: nt for nt in old_template.get('node_types', [])}
        new_types = {nt['id']: nt for nt in new_template.get('node_types', [])}
        
        # For each node type that still exists, check for removed properties
        for type_id, old_type in old_types.items():
            if type_id in new_types:
                new_type = new_types[type_id]
                
                def _prop_key(prop: Dict[str, Any]) -> Any:
                    return prop.get('key') or prop.get('id')

                old_props = {key for key in (_prop_key(prop) for prop in old_type.get('properties', [])) if key}
                new_props = {key for key in (_prop_key(prop) for prop in new_type.get('properties', [])) if key}
                
                removed_props = old_props - new_props
                if removed_props:
                    orphaned_props_by_type[type_id] = removed_props
        
        return orphaned_props_by_type

    @staticmethod
    def mark_orphaned_properties(graph: Dict[str, Any], orphaned_props_by_type: Dict[str, Set[str]]) -> int:
        """
        Mark properties as orphaned in nodes when their properties are removed from template.
        
        Args:
            graph: The graph containing nodes
            orphaned_props_by_type: Dict mapping node type IDs to sets of orphaned property keys
            
        Returns:
            Count of properties marked as orphaned
        """
        orphaned_count = 0
        
        for node in graph.get('nodes', []):
            node_type = node.get('type')
            if node_type in orphaned_props_by_type:
                orphaned_keys = orphaned_props_by_type[node_type]
                
                # Initialize orphaned_properties in metadata if needed
                if 'metadata' not in node:
                    node['metadata'] = {}
                if 'orphaned_properties' not in node['metadata']:
                    node['metadata']['orphaned_properties'] = {}
                
                # Move orphaned property values to metadata
                for key in orphaned_keys:
                    if key in node.get('properties', {}):
                        value = node['properties'][key]
                        node['metadata']['orphaned_properties'][key] = value
                        # Keep in properties for backward compat, but mark as orphaned
                        logger.info(f"Marked property '{key}' as orphaned in node {node['id']}")
                        orphaned_count += 1
        
        return orphaned_count

    @staticmethod
    def get_orphaned_properties(node: Dict[str, Any]) -> Dict[str, Any]:
        """
        Get all orphaned properties for a node.
        
        Args:
            node: The node to check
            
        Returns:
            Dict of orphaned property key-value pairs
        """
        return node.get('metadata', {}).get('orphaned_properties', {})
