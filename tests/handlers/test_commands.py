import pytest
from backend.handlers.dispatcher import CommandDispatcher
from backend.handlers.commands.node_commands import CreateNodeCommand
from backend.core.graph import ProjectGraph

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