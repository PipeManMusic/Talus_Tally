"""Test the end-to-end property update flow through GraphService."""
import pytest
from backend.core.graph import ProjectGraph
from backend.core.node import Node
from backend.handlers.dispatcher import CommandDispatcher
from backend.handlers.commands.node_commands import UpdatePropertyCommand
from backend.api.graph_service import GraphService


def test_property_update_flow():
    """Verify property updates notify GraphService subscribers."""
    # Setup
    graph = ProjectGraph()
    node = Node(blueprint_type_id="task", name="Test Node")
    graph.add_node(node)
    
    graph_service = GraphService(graph)
    
    # Track notifications
    notifications = []
    def track_changes(node_id, property_id, new_value):
        notifications.append((node_id, property_id, new_value))
    
    graph_service.subscribe_to_property_changes(track_changes)
    
    # Execute property update via command (as the UI would)
    cmd = UpdatePropertyCommand(
        node_id=node.id,
        property_id="status",
        old_value=None,
        new_value="in_progress",
        graph=graph,
        graph_service=graph_service
    )
    cmd.execute()
    
    # Verify subscriber was notified
    assert len(notifications) == 1
    notification_node_id, notification_prop_id, notification_value = notifications[0]
    
    assert notification_node_id == node.id
    assert notification_prop_id == "status"
    assert notification_value == "in_progress"
    
    # Verify node was actually updated
    assert node.properties['status'] == 'in_progress'

