import yaml
from typing import List, Dict, Any, Optional


class NodeTypeDef:
    """Definition of a node type from a blueprint."""
    
    def __init__(self, id: str, name: str, allowed_children: List[str] = None, **kwargs):
        self.id = id
        self.name = name
        self.allowed_children = allowed_children or []
        self.has_time_log = kwargs.get('has_time_log', False)
        self._extra_props = kwargs


class Blueprint:
    """Represents a loaded blueprint definition."""
    
    def __init__(self, id: str, name: str, version: str, node_types: List[NodeTypeDef]):
        self.id = id
        self.name = name
        self.version = version
        self.node_types = node_types
        self._node_type_map = {nt.id: nt for nt in node_types}
    
    def is_allowed_child(self, parent_type: str, child_type: str) -> bool:
        """
        Check if a child type is allowed under a parent type.
        
        Args:
            parent_type: The ID of the parent node type
            child_type: The ID of the child node type
            
        Returns:
            True if the relationship is allowed, False otherwise
        """
        if parent_type not in self._node_type_map:
            return False
        
        parent_def = self._node_type_map[parent_type]
        return child_type in parent_def.allowed_children


class SchemaLoader:
    """Loads and parses blueprint YAML files."""
    
    def load(self, filepath: str) -> Blueprint:
        """
        Load a blueprint from a YAML file.
        
        Args:
            filepath: Path to the blueprint YAML file
            
        Returns:
            A Blueprint object
        """
        with open(filepath, 'r') as f:
            data = yaml.safe_load(f)
        
        blueprint_id = data.get('id')
        name = data.get('name')
        version = data.get('version', '1.0')
        
        # Parse node types
        node_types_data = data.get('node_types', [])
        node_types = []
        for nt_data in node_types_data:
            node_type = NodeTypeDef(**nt_data)
            node_types.append(node_type)
        
        return Blueprint(id=blueprint_id, name=name, version=version, node_types=node_types)
