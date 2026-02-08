import uuid

import pytest

from backend.core.graph import ProjectGraph
from backend.core.imports import CSVColumnBinding, CSVImportPlan, PreparedCSVNode
from backend.core.node import Node
from backend.handlers.commands.macro_commands import ImportNodesCommand


class DummyNodeType:
    def __init__(self, type_id, allowed_children):
        self.id = type_id
        self.allowed_children = allowed_children
        self._extra_props = {"properties": []}


class DummyBlueprint:
    def __init__(self):
        parent = DummyNodeType("project_root", ["task"])
        child = DummyNodeType("task", [])
        self._node_type_map = {parent.id: parent, child.id: child}

    def is_allowed_child(self, parent_type, child_type):
        node_type = self._node_type_map.get(parent_type)
        if not node_type:
            return False
        return child_type in node_type.allowed_children


@pytest.fixture(autouse=True)
def mute_emit(monkeypatch):
    monkeypatch.setattr(
        "backend.handlers.commands.macro_commands.emit_property_changed",
        lambda *_, **__: None,
    )


def test_import_nodes_command_creates_children_and_sets_properties():
    graph = ProjectGraph()
    parent = Node(blueprint_type_id="project_root", name="Root")
    graph.add_node(parent)

    plan = CSVImportPlan(
        parent_id=parent.id,
        blueprint_type_id="task",
        column_bindings=[
            CSVColumnBinding(header="Name", property_id="name"),
            CSVColumnBinding(header="Cost", property_id="cost"),
        ],
    )
    prepared = [
        PreparedCSVNode(name="Brake Overhaul", properties={"cost": "1200"}),
        PreparedCSVNode(name="Suspension Refresh", properties={"cost": "950"}),
    ]

    blueprint = DummyBlueprint()
    command = ImportNodesCommand(
        plan=plan,
        prepared_nodes=prepared,
        graph=graph,
        blueprint=blueprint,
        session_id="session-1",
    )

    command.execute()

    assert len(command.created_node_ids) == 2
    child_ids = set(command.created_node_ids)
    assert child_ids.issubset(set(parent.children))

    first_child = graph.get_node(command.created_node_ids[0])
    assert first_child is not None
    assert first_child.properties.get("cost") in {"1200", "950"}
    assert first_child.properties.get("name") == first_child.name

    command.undo()

    assert graph.get_node(command.created_node_ids[0]) is None
    assert graph.get_node(command.created_node_ids[1]) is None
    assert parent.children == []


def test_import_nodes_command_validates_parent_exists():
    graph = ProjectGraph()
    plan = CSVImportPlan(
        parent_id=uuid.uuid4(),
        blueprint_type_id="task",
        column_bindings=[],
    )

    blueprint = DummyBlueprint()
    command = ImportNodesCommand(
        plan=plan,
        prepared_nodes=[],
        graph=graph,
        blueprint=blueprint,
    )

    with pytest.raises(ValueError):
        command.execute()
