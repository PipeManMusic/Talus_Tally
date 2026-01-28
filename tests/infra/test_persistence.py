import pytest
import os
import json
from backend.core.graph import ProjectGraph
from backend.core.node import Node
# This import will fail until you write backend/infra/persistence.py
from backend.infra.persistence import PersistenceManager

def test_save_graph(tmp_path):
    """Phase 3.2: Verify graph serialization."""
    graph = ProjectGraph()
    node = Node(blueprint_type_id="task", name="Save Me")
    graph.add_node(node)
    
    file_path = tmp_path / "save_test.json"
    manager = PersistenceManager(file_path)
    manager.save(graph)
    
    assert file_path.exists()
    
    with open(file_path) as f:
        data = json.load(f)
        assert data["nodes"][str(node.id)]["name"] == "Save Me"

def test_load_graph(tmp_path):
    """Phase 3.2: Verify graph deserialization."""
    file_path = tmp_path / "load_test.json"
    
    # Create dummy file
    with open(file_path, "w") as f:
        json.dump({
            "version": "1.0",
            "templates": ["data/templates/restomod.yaml"],
            "nodes": {
                "uuid-1": {
                    "id": "uuid-1",
                    "type": "task",
                    "name": "Loaded Node",
                    "properties": {"cost": 10},
                    "children": []
                }
            }
        }, f)
        
    manager = PersistenceManager(file_path)
    graph, template_paths = manager.load()
    
    assert len(graph.nodes) == 1
    node = list(graph.nodes.values())[0]
    assert node.name == "Loaded Node"
    assert node.properties["cost"] == 10
    assert "data/templates/restomod.yaml" in template_paths