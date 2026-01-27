import pytest
from uuid import UUID
from datetime import datetime
# Note: Importing from backend.core.node will fail until we write it
from backend.core.node import Node

def test_node_initialization():
    """Phase 2.1: Verify a Node can be created with a blueprint ID."""
    node = Node(blueprint_type_id="task", name="Fix Brakes")
    
    assert isinstance(node.id, UUID)
    assert node.name == "Fix Brakes"
    assert node.blueprint_type_id == "task"
    assert isinstance(node.created_at, datetime)
    assert node.properties == {}
    assert node.children == []

def test_node_properties():
    """Phase 2.1: Verify generic property storage."""
    node = Node(blueprint_type_id="task", name="Test")
    node.properties["cost"] = 50.00
    node.properties["difficulty"] = "Hard"
    
    assert node.properties["cost"] == 50.00

def test_node_hierarchy():
    """Phase 2.1: Verify parent/child relationships."""
    parent = Node(blueprint_type_id="job", name="Brakes")
    child = Node(blueprint_type_id="task", name="Bleed Lines")
    
    parent.children.append(child.id)
    child.parent_id = parent.id
    
    assert child.id in parent.children
    assert child.parent_id == parent.id