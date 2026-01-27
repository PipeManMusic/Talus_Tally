import json
from pathlib import Path
from uuid import UUID, uuid5, NAMESPACE_DNS
from datetime import datetime
from backend.core.graph import ProjectGraph
from backend.core.node import Node


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
    
    def save(self, graph: ProjectGraph) -> None:
        """
        Save a graph to a JSON file.
        
        Args:
            graph: The ProjectGraph to save
        """
        data = {
            'version': '1.0',
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
        
        # Write to file
        with open(self.file_path, 'w') as f:
            json.dump(data, f, indent=2)
    
    def load(self) -> ProjectGraph:
        """
        Load a graph from a JSON file.
        
        Returns:
            A ProjectGraph loaded from the file
        """
        with open(self.file_path, 'r') as f:
            data = json.load(f)
        
        graph = ProjectGraph()
        
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
            node.properties = node_data.get('properties', {})
            node.children = [string_to_uuid(child_id) for child_id in node_data.get('children', [])]
            if node_data.get('parent_id'):
                node.parent_id = string_to_uuid(node_data['parent_id'])
            
            graph.add_node(node)
        
        return graph
