"""
Orphan Node Manager - handles orphaning nodes when template types are removed.

When a template is updated and node types are removed, existing nodes of those
types become "orphaned" - they can no longer have children and exist outside
the template structure, but their data is preserved.

Similarly, when properties are removed from node types, existing property values
become "orphaned properties" - preserved but read-only in the UI.
"""

from typing import List, Dict, Any, Set, Iterable, Tuple, Union
import difflib
import logging

logger = logging.getLogger(__name__)


class OrphanManager:
    """Manages orphaning of nodes and properties when template definitions change."""

    @staticmethod
    def _iter_graph_nodes(graph: Any) -> Iterable[Tuple[str, Any]]:
        """Yield (node_id, node_ref) for dict-graphs, list-graphs, or ProjectGraph objects."""
        if graph is None:
            return []

        # Dict style graph: {'nodes': {'id': node_dict}} or {'nodes': [node_dict, ...]}
        if isinstance(graph, dict):
            nodes = graph.get('nodes', {})
            if isinstance(nodes, dict):
                return list(nodes.items())
            if isinstance(nodes, list):
                result: List[Tuple[str, Any]] = []
                for idx, node in enumerate(nodes):
                    node_id = str(node.get('id', idx)) if isinstance(node, dict) else str(idx)
                    result.append((node_id, node))
                return result
            return []

        # ProjectGraph style: graph.nodes is Dict[UUID, Node]
        graph_nodes = getattr(graph, 'nodes', None)
        if isinstance(graph_nodes, dict):
            return [(str(node_id), node) for node_id, node in graph_nodes.items()]

        return []

    @staticmethod
    def _get_node_type(node: Any) -> str:
        if isinstance(node, dict):
            return node.get('type') or node.get('blueprint_type_id') or 'unknown'
        return getattr(node, 'blueprint_type_id', None) or getattr(node, 'type', None) or 'unknown'

    @staticmethod
    def _get_node_name(node: Any, fallback: str = 'Untitled') -> str:
        if isinstance(node, dict):
            return node.get('label') or node.get('name') or node.get('properties', {}).get('name') or fallback
        return getattr(node, 'name', None) or getattr(node, 'properties', {}).get('name') or fallback

    @staticmethod
    def _get_node_properties(node: Any) -> Dict[str, Any]:
        if isinstance(node, dict):
            props = node.get('properties', {})
            return props if isinstance(props, dict) else {}
        props = getattr(node, 'properties', None)
        return props if isinstance(props, dict) else {}

    @staticmethod
    def _get_node_metadata(node: Any) -> Dict[str, Any]:
        if isinstance(node, dict):
            metadata = node.get('metadata')
            if not isinstance(metadata, dict):
                metadata = {}
                node['metadata'] = metadata
            return metadata

        metadata = getattr(node, 'metadata', None)
        if not isinstance(metadata, dict):
            metadata = {}
            setattr(node, 'metadata', metadata)
        return metadata

    @staticmethod
    def _normalize_property_key(key: str) -> str:
        return ''.join(ch for ch in str(key).lower() if ch.isalnum())

    @staticmethod
    def _score_property_similarity(left: str, right: str) -> float:
        left_norm = OrphanManager._normalize_property_key(left)
        right_norm = OrphanManager._normalize_property_key(right)
        if not left_norm or not right_norm:
            return 0.0
        if left_norm == right_norm:
            return 1.0
        base = difflib.SequenceMatcher(None, left_norm, right_norm).ratio()
        if left_norm in right_norm or right_norm in left_norm:
            base = max(base, 0.85)
        return base

    @staticmethod
    def _find_property_rename_candidate(
        orphaned_key: str,
        allowed_props: Set[str],
        existing_props: Dict[str, Any],
    ) -> Union[None, Dict[str, Union[str, float]]]:
        candidates: List[Tuple[str, float]] = []
        for allowed_key in allowed_props:
            if allowed_key in ('name', orphaned_key):
                continue
            if allowed_key in existing_props:
                continue
            score = OrphanManager._score_property_similarity(orphaned_key, allowed_key)
            if score >= 0.72:
                candidates.append((allowed_key, score))

        if not candidates:
            return None

        candidates.sort(key=lambda item: item[1], reverse=True)
        best_key, best_score = candidates[0]
        second_best_score = candidates[1][1] if len(candidates) > 1 else 0.0

        if len(candidates) > 1 and (best_score - second_best_score) < 0.08:
            return None

        return {
            'suggested_property': best_key,
            'score': round(best_score, 3),
        }
    
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
        for node_id, node_data in OrphanManager._iter_graph_nodes(graph):
            node_type = OrphanManager._get_node_type(node_data)
            
            if node_type in orphaned_types:
                # Mark as orphaned
                metadata = OrphanManager._get_node_metadata(node_data)

                metadata['orphaned'] = True
                metadata['orphaned_reason'] = (
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
        
        for node_id, node_data in OrphanManager._iter_graph_nodes(graph):
            metadata = OrphanManager._get_node_metadata(node_data)
            if metadata.get('orphaned'):
                orphaned.append({
                    'id': node_id,
                    'type': OrphanManager._get_node_type(node_data),
                    'label': OrphanManager._get_node_name(node_data),
                    'metadata': metadata,
                    'properties': OrphanManager._get_node_properties(node_data)
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
        
        for _, node in OrphanManager._iter_graph_nodes(graph):
            node_type = OrphanManager._get_node_type(node)
            if node_type in orphaned_props_by_type:
                orphaned_keys = orphaned_props_by_type[node_type]
                node_props = OrphanManager._get_node_properties(node)
                node_metadata = OrphanManager._get_node_metadata(node)
                
                # Initialize orphaned_properties in metadata if needed
                if 'orphaned_properties' not in node_metadata:
                    node_metadata['orphaned_properties'] = {}
                
                # Move orphaned property values to metadata and remove from properties
                for key in orphaned_keys:
                    if key in node_props:
                        value = node_props[key]
                        node_metadata['orphaned_properties'][key] = value
                        del node_props[key]
                        node_id = node.get('id') if isinstance(node, dict) else str(getattr(node, 'id', 'unknown'))
                        logger.info(f"Orphaned property '{key}' moved from properties to metadata in node {node_id}")
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
        metadata: Dict[str, Any]
        if isinstance(node, dict):
            metadata = node.get('metadata', {}) or {}
        else:
            metadata = getattr(node, 'metadata', {}) or {}
        return metadata.get('orphaned_properties', {})

    @staticmethod
    def reconcile_graph_with_template(graph: Any, template: Dict[str, Any]) -> Dict[str, Union[int, List[str]]]:
        """
        Reconcile existing graph data against a single template definition.

        This is used when loading an existing project to identify already-orphaned
        node types/properties relative to the currently loaded template.
        """
        node_types = template.get('node_types', []) if isinstance(template, dict) else []
        template_type_ids = set()
        for nt in node_types:
            if nt.get('id'):
                template_type_ids.add(nt['id'])
            if nt.get('uuid'):
                template_type_ids.add(nt['uuid'])

        allowed_props_by_type: Dict[str, Set[str]] = {}
        for node_type in node_types:
            type_id = node_type.get('id')
            type_uuid = node_type.get('uuid')
            if not type_id and not type_uuid:
                continue
            # Use UUID property keys as the canonical identifiers,
            # falling back to the semantic key when no UUID is present.
            allowed_props: Set[str] = {'name'}
            for prop in node_type.get('properties', []) or []:
                prop_uuid = prop.get('uuid')
                if prop_uuid:
                    allowed_props.add(prop_uuid)
                else:
                    prop_key = prop.get('key') or prop.get('id')
                    if prop_key:
                        allowed_props.add(prop_key)
            if type_id:
                allowed_props_by_type[type_id] = allowed_props
            if type_uuid:
                allowed_props_by_type[type_uuid] = allowed_props

        orphaned_node_ids: List[str] = []
        orphaned_properties_count = 0
        mismatch_candidates: List[Dict[str, Union[str, float]]] = []

        for node_id, node in OrphanManager._iter_graph_nodes(graph):
            node_type = OrphanManager._get_node_type(node)
            metadata = OrphanManager._get_node_metadata(node)
            properties = OrphanManager._get_node_properties(node)

            if node_type not in template_type_ids:
                metadata['orphaned'] = True
                metadata['orphaned_reason'] = (
                    f"Node type '{node_type}' not found in current template"
                )
                orphaned_node_ids.append(node_id)
                continue

            # Node type exists in template: clear stale orphaned-node marker if previously set
            if metadata.get('orphaned'):
                metadata.pop('orphaned', None)
                metadata.pop('orphaned_reason', None)

            allowed_props = allowed_props_by_type.get(node_type, {'name'})
            existing_orphaned = metadata.get('orphaned_properties')
            orphaned_props = dict(existing_orphaned) if isinstance(existing_orphaned, dict) else {}

            for key in list(properties.keys()):
                if key not in allowed_props:
                    value = properties[key]
                    if key not in orphaned_props:
                        orphaned_properties_count += 1
                    orphaned_props[key] = value
                    del properties[key]

            rename_hints: Dict[str, Dict[str, Union[str, float]]] = {}
            for orphaned_key in orphaned_props.keys():
                candidate = OrphanManager._find_property_rename_candidate(
                    orphaned_key=orphaned_key,
                    allowed_props=allowed_props,
                    existing_props=properties,
                )
                if not candidate:
                    continue
                hint = {
                    'legacy_property': orphaned_key,
                    'suggested_property': candidate['suggested_property'],
                    'score': candidate['score'],
                }
                rename_hints[orphaned_key] = hint
                mismatch_candidates.append({
                    'node_id': node_id,
                    'node_type': node_type,
                    **hint,
                })

            # If template now supports a previously orphaned property, restore it
            for key in list(orphaned_props.keys()):
                if key in allowed_props:
                    value = orphaned_props.pop(key)
                    # Restore to properties if not already present
                    if key not in properties:
                        properties[key] = value

            if orphaned_props:
                metadata['orphaned_properties'] = orphaned_props
            else:
                metadata.pop('orphaned_properties', None)

            if rename_hints:
                metadata['property_mismatch_hints'] = rename_hints
            else:
                metadata.pop('property_mismatch_hints', None)

        return {
            'orphaned_node_ids': orphaned_node_ids,
            'affected_nodes': len(orphaned_node_ids),
            'affected_properties': orphaned_properties_count,
            'mismatch_count': len(mismatch_candidates),
            'mismatch_candidates': mismatch_candidates,
        }
