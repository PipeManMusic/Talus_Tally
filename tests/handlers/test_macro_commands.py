import pytest
from backend.core.graph import ProjectGraph
from backend.core.node import Node
from backend.handlers.dispatcher import CommandDispatcher
# This import will fail until you write backend/handlers/commands/macro_commands.py
from backend.handlers.commands.macro_commands import ApplyKitCommand

def test_apply_kit_logic():
    """Phase 4.3: Verify cloning a template tree."""
    graph = ProjectGraph()
    
    # Template
    kit = Node(blueprint_type_id="kit", name="Standard Service")
    part = Node(blueprint_type_id="part", name="Oil Filter")
    kit.children.append(part.id)
    graph.add_node(kit)
    graph.add_node(part)
    
    # Target
    target = Node(blueprint_type_id="job", name="My Job")
    graph.add_node(target)
    
    # Execute Macro
    cmd = ApplyKitCommand(target_id=target.id, kit_root_id=kit.id)
    dispatcher = CommandDispatcher(graph)
    dispatcher.execute(cmd)
    
    # Verify Clone
    assert len(target.children) == 1
    cloned_part_id = target.children[0]
    cloned_part = graph.get_node(cloned_part_id)
    
    assert cloned_part.name == "Oil Filter"
    assert cloned_part.id != part.id  # Must be a copy