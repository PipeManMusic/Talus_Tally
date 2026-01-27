import pytest
from backend.core.graph import ProjectGraph
from backend.core.node import Node
# This import will fail until you write backend/api/graph_service.py
from backend.api.graph_service import GraphService

def test_get_tree_structure():
    """Phase 5.1: Verify UI-ready tree generation."""
    graph = ProjectGraph()
    root = Node(blueprint_type_id="project", name="Root")
    child = Node(blueprint_type_id="task", name="Leaf")
    root.children.append(child.id)
    graph.add_node(root)
    graph.add_node(child)
    
    service = GraphService(graph)
    tree = service.get_tree(root.id)
    
    assert tree["name"] == "Root"
    assert len(tree["children"]) == 1
    assert tree["children"][0]["name"] == "Leaf"