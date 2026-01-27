import pytest
from unittest.mock import MagicMock
from backend.core.node import Node
# This import will fail until implementation
from backend.ui.tree_adapter import NodeTreeAdapter

def test_adapter_converts_node_to_row():
    """Phase 6.2: Verify a Node is converted to a Toga-compatible row tuple."""
    # 1. Setup
    node = Node(blueprint_type_id="task", name="My Task")
    
    # Mock the Renderer View Model (Logic Layer)
    mock_renderer = MagicMock()
    mock_renderer.get_icon.return_value = "clipboard"
    
    # 2. Execute
    adapter = NodeTreeAdapter(renderer=mock_renderer)
    row_data = adapter.node_to_row(node)
    
    # 3. Assertions
    # Toga expects: (icon, title, node_id) or similar based on column config
    # We expect our adapter to return: icon, name, id
    assert row_data[0] == "clipboard"  # Icon
    assert row_data[1] == "My Task"    # Label
    assert row_data[2] == node.id      # Hidden ID for lookup