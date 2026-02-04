import pytest
from backend.handlers.dispatcher import CommandDispatcher
from backend.handlers.commands.node_commands import (
    CreateNodeCommand, 
    DeleteNodeCommand, 
    LinkNodeCommand,
    UpdatePropertyCommand
)
from backend.core.graph import ProjectGraph
from backend.core.node import Node
from backend.infra.logging import LogManager
from backend.infra.schema_loader import SchemaLoader
import os

def test_create_node_command_undo():
    """Phase 4.1: Verify we can Create a node and then Undo it."""
    graph = ProjectGraph()
    dispatcher = CommandDispatcher(graph)
    
    # 1. Execute Create
    cmd = CreateNodeCommand(blueprint_type_id="task", name="Test Task")
    node_id = dispatcher.execute(cmd)
    
    assert node_id in graph.nodes
    
    # 2. Execute Undo
    dispatcher.undo()
    
    assert node_id not in graph.nodes
    
    # 3. Execute Redo
    dispatcher.redo()
    
    assert node_id in graph.nodes

def test_delete_node_command_undo():
    """Phase 4.2: Verify Delete removes a node, and Undo brings it back."""
    graph = ProjectGraph()
    node = Node(blueprint_type_id="task", name="To Delete")
    graph.add_node(node)
    
    dispatcher = CommandDispatcher(graph)
    cmd = DeleteNodeCommand(node_id=node.id)
    
    # Execute (Delete)
    dispatcher.execute(cmd)
    assert node.id not in graph.nodes
    
    # Undo (Restore)
    dispatcher.undo()
    assert node.id in graph.nodes
    # Verify it's the exact same node object or equivalent
    assert graph.get_node(node.id).name == "To Delete"

def test_link_node_command():
    """Phase 4.2: Verify Link establishes parent-child relationship."""
    graph = ProjectGraph()
    parent = Node(blueprint_type_id="job", name="Parent")
    child = Node(blueprint_type_id="task", name="Child")
    graph.add_node(parent)
    graph.add_node(child)
    
    dispatcher = CommandDispatcher(graph)
    cmd = LinkNodeCommand(parent_id=parent.id, child_id=child.id)
    
    # Execute
    dispatcher.execute(cmd)
    assert child.id in parent.children
    assert child.parent_id == parent.id
    
    # Undo
    dispatcher.undo()
    assert child.id not in parent.children
    assert child.parent_id is None

def test_create_node_signal_flow():
    """Phase 4.1: Verify the Dispatcher emits the correct signals."""
    # 1. Setup
    graph = ProjectGraph()
    dispatcher = CommandDispatcher(graph)
    logger = LogManager()
    logger.clear() # Clean slate
    
    # 2. Execute
    cmd = CreateNodeCommand(blueprint_type_id="task", name="Signal Test")
    dispatcher.execute(cmd)
    
    # 3. Verify Signal Flow (The "Black Box" check)
    history = logger.get_history(source="Dispatcher")
    
    assert len(history) >= 2
    assert history[0].event_type == "EXECUTE_START"
    assert history[1].event_type == "EXECUTE_COMPLETE"
    assert history[1].payload["command"] == "CreateNodeCommand"


def test_create_node_default_status_initialized():
    """Verify CreateNodeCommand initializes default status from blueprint."""
    loader = SchemaLoader()
    blueprint_path = os.path.join(
        os.path.dirname(__file__),
        "/home/dworth/Dropbox/Bronco II/Talus Tally/data/templates/restomod.yaml"
    )
    blueprint = loader.load(blueprint_path)

    graph = ProjectGraph()
    dispatcher = CommandDispatcher(graph)

    cmd = CreateNodeCommand(
        blueprint_type_id="task",
        name="Default Status Task",
        blueprint=blueprint,
        graph=graph
    )
    node_id = dispatcher.execute(cmd)

    node = graph.get_node(node_id)
    assert node is not None
    assert node.properties.get("status") is not None