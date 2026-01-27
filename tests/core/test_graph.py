import pytest
from backend.core.graph import ProjectGraph
from backend.core.node import Node

def test_graph_add_node():
    """Phase 2.2: Verify adding nodes to the global registry."""
    graph = ProjectGraph()
    node = Node(blueprint_type_id="task", name="Test Task")
    
    graph.add_node(node)
    
    assert node.id in graph.nodes
    assert graph.get_node(node.id) == node

def test_graph_orphan_detection():
    """Phase 2.2: Verify we can find nodes with no parents."""
    graph = ProjectGraph()
    root = Node(blueprint_type_id="project_root", name="Bronco")
    child = Node(blueprint_type_id="phase", name="Engine")
    
    graph.add_node(root)
    graph.add_node(child)
    
    # Initially both are orphans
    assert len(graph.get_orphans()) == 2
    
    # Link them
    root.children.append(child.id)
    child.parent_id = root.id
    
    # Now only root is orphan
    assert len(graph.get_orphans()) == 1
    assert graph.get_orphans()[0] == root