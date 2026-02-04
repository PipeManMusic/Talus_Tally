import json
import os
import tempfile
from pathlib import Path
from uuid import UUID, uuid5, NAMESPACE_DNS
from datetime import datetime
from backend.core.graph import ProjectGraph
from backend.core.node import Node
from backend.infra.schema_loader import SchemaLoader


def string_to_uuid(s: str) -> UUID:
    """Convert a string to a UUID, handling both valid UUIDs and arbitrary strings."""
    try:
        return UUID(s)
    except ValueError:
        # If not a valid UUID, generate one from the string using UUID5
        return uuid5(NAMESPACE_DNS, s)


class PersistenceManager:
    """Manages saving and loading graphs to/from JSON files."""
    
    def __init__(self, file_path):
        """
        Initialize the persistence manager.
        
        Args:
            file_path: Path to the JSON file for persistence
        """
        self.file_path = Path(file_path)
    
    def save(self, graph: ProjectGraph, template_paths: list[str] = None) -> None:
        """
        Save a graph to a JSON file.
        
        Args:
            graph: The ProjectGraph to save
            template_paths: Optional list of template file paths used in this project
        """
        data = {
            'version': '1.0',
            'templates': template_paths or [],
            'nodes': {}
        }
        
        # Serialize each node
        for node in graph.nodes.values():
            node_data = {
                'id': str(node.id),
                'type': node.blueprint_type_id,
                'name': node.name,
                'created_at': node.created_at.isoformat(),
                'properties': node.properties,
                'children': [str(child_id) for child_id in node.children],
                'parent_id': str(node.parent_id) if node.parent_id else None
            }
            data['nodes'][str(node.id)] = node_data
        
        # Write to a temp file and atomically replace the target
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        temp_fd, temp_path = tempfile.mkstemp(prefix=self.file_path.name, dir=str(self.file_path.parent))
        try:
            with os.fdopen(temp_fd, 'w') as f:
                json.dump(data, f, indent=2)
            os.replace(temp_path, self.file_path)
        finally:
            if os.path.exists(temp_path):
                os.unlink(temp_path)
    
    def load(self) -> tuple[ProjectGraph, list[str]]:
        """
        Load a graph from a JSON file.
        
        Returns:
            A tuple of (ProjectGraph, list of template paths)
        """
        with open(self.file_path, 'r') as f:
            data = json.load(f)
        
        graph = ProjectGraph()
        template_paths = data.get('templates', [])
        property_uuid_map = self._build_property_uuid_map(template_paths)
        
        # Deserialize each node from dict
        nodes_dict = data.get('nodes', {})
        for node_id, node_data in nodes_dict.items():
            # Handle both 'type' and 'blueprint_type_id' for compatibility
            blueprint_type = node_data.get('type') or node_data.get('blueprint_type_id')
            
            # Convert ID to UUID (handle both valid UUIDs and strings like "uuid-1")
            if 'id' in node_data:
                node_uuid = string_to_uuid(node_data['id'])
            else:
                node_uuid = string_to_uuid(node_id)
            
            node = Node(
                blueprint_type_id=blueprint_type,
                name=node_data['name'],
                id=node_uuid
            )
            if 'created_at' in node_data:
                node.created_at = datetime.fromisoformat(node_data['created_at'])
            
            # Normalize properties: map from stored format (with UUIDs) back to template property names
            raw_properties = node_data.get('properties', {})
            node.properties = self._normalize_properties(raw_properties, node.blueprint_type_id, property_uuid_map)
            
            node.children = [string_to_uuid(child_id) for child_id in node_data.get('children', [])]
            if node_data.get('parent_id'):
                node.parent_id = string_to_uuid(node_data['parent_id'])
            
            graph.add_node(node)
        
        return graph, template_paths

    def _normalize_properties(self, properties: dict, node_type_id: str, property_uuid_map: dict) -> dict:
        """
        Normalize properties from saved format (with UUIDs) to template format.
        
        The saved JSON may have UUID-keyed properties for session restoration.
        This method maps them back to the template's string property names.
        
        Args:
            properties: Raw properties dict from saved JSON
            node_type_id: Node type ID for template property lookup
            property_uuid_map: Mapping of node_type_id -> {uuid_str: property_name}
            
        Returns:
            Normalized properties dict with template property names as keys
        """
        if not isinstance(properties, dict):
            return properties

        node_map = property_uuid_map.get(node_type_id, {})
        if not node_map:
            print(f"[DEBUG][Persistence] No property UUID map for node_type_id={node_type_id}")
            return properties

        normalized = {}
        mapped_keys = 0
        for key, value in properties.items():
            if key in node_map:
                normalized[node_map[key]] = value
                mapped_keys += 1
                continue

            key_str = str(key)
            if key_str in node_map:
                normalized[node_map[key_str]] = value
                mapped_keys += 1
                continue

            normalized[key] = value

        if mapped_keys:
            print(f"[DEBUG][Persistence] Normalized {mapped_keys} UUID property keys for node_type_id={node_type_id}")

        return normalized

    def _build_property_uuid_map(self, template_paths: list[str]) -> dict:
        """
        Build a map of UUID-keyed property references to template property names.
        
        Args:
            template_paths: List of template file paths
            
        Returns:
            Dict[node_type_id, Dict[uuid_str, property_name]]
        """
        if not template_paths:
            return {}

        loader = SchemaLoader()
        mapping: dict = {}
        total_mappings = 0
        for template_path in template_paths:
            try:
                blueprint = loader.load(template_path)
            except Exception as e:
                print(f"[WARN] Failed to load template for property mapping: {template_path} ({type(e).__name__}: {e})")
                continue

            for node_type in blueprint.node_types:
                properties = getattr(node_type, '_extra_props', {}).get('properties', [])
                for prop in properties:
                    prop_id = prop.get('id') or prop.get('name')
                    if not prop_id:
                        continue
                    prop_uuid = str(string_to_uuid(prop_id))
                    mapping.setdefault(node_type.id, {})[prop_uuid] = prop_id
                    total_mappings += 1

        print(f"[DEBUG][Persistence] Built property UUID map entries={total_mappings} templates={len(template_paths)}")
        return mapping
