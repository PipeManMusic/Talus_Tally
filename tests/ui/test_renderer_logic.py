import pytest
from backend.core.node import Node
from backend.infra.velocity import VelocityEngine
# Note: You will need to implement 'TreeViewModel'
from backend.ui.renderer import TreeViewModel

def test_node_icon_resolution():
    """Phase 6.2: Verify nodes get the correct icon based on type."""
    # 1. Setup
    job_node = Node(blueprint_type_id="job", name="My Job")
    part_node = Node(blueprint_type_id="part", name="My Part")
    
    view_model = TreeViewModel()
    
    # 2. Assert Icons (Hypothetical mapping)
    assert view_model.get_icon(job_node) == "folder"
    assert view_model.get_icon(part_node) == "box"

def test_velocity_color_coding():
    """Phase 6.2: Verify high-velocity nodes get visual emphasis."""
    node = Node(blueprint_type_id="task", name="High Impact")
    # Mock a high score
    score = 100.0
    
    view_model = TreeViewModel()
    color = view_model.get_velocity_color(score)
    
    # Assuming standard RAG (Red/Amber/Green) or heat map
    assert color == "green"  # or hex code equivalent