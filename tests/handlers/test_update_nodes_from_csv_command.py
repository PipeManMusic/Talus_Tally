import uuid

import pytest

from backend.core.graph import ProjectGraph
from backend.core.imports import (
    CSV_MODE_UPDATE,
    CSVColumnBinding,
    CSVImportPlan,
    PreparedCSVNode,
)
from backend.core.node import Node
from backend.handlers.commands.macro_commands import UpdateNodesFromCsvCommand


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

    def get_node_type(self, ref):
        return self._node_type_map.get(ref)

    def build_property_uuid_map(self, node_type_ref):
        return {"name": "name"}

    def build_all_property_uuid_maps(self):
        return {}


@pytest.fixture(autouse=True)
def mute_emit(monkeypatch):
    monkeypatch.setattr(
        "backend.handlers.commands.node_commands.emit_property_changed",
        lambda *_, **__: None,
    )
    monkeypatch.setattr(
        "backend.handlers.commands.macro_commands.emit_property_changed",
        lambda *_, **__: None,
    )


def _make_graph():
    graph = ProjectGraph()
    parent = Node(blueprint_type_id="project_root", name="Root")
    graph.add_node(parent)

    child_a = Node(blueprint_type_id="task", name="Brake Overhaul")
    child_a.properties = {"name": "Brake Overhaul", "cost": "1000", "status": "todo"}
    graph.add_node(child_a)
    parent.children.append(child_a.id)

    child_b = Node(blueprint_type_id="task", name="Suspension Refresh")
    child_b.properties = {"name": "Suspension Refresh", "cost": "900", "status": "todo"}
    graph.add_node(child_b)
    parent.children.append(child_b.id)

    return graph, parent, child_a, child_b


def test_update_command_updates_matched_children_by_name():
    graph, parent, child_a, child_b = _make_graph()

    plan = CSVImportPlan(
        parent_id=parent.id,
        blueprint_type_id="task",
        column_bindings=[
            CSVColumnBinding(header="Name", property_id="name"),
            CSVColumnBinding(header="Cost", property_id="cost"),
        ],
        mode=CSV_MODE_UPDATE,
        match_property_id="name",
    )
    prepared = [
        PreparedCSVNode(
            name="Brake Overhaul",
            properties={"name": "Brake Overhaul", "cost": "1500"},
            row_number=2,
            match_value="Brake Overhaul",
        ),
        PreparedCSVNode(
            name="Suspension Refresh",
            properties={"name": "Suspension Refresh", "cost": "1100"},
            row_number=3,
            match_value="Suspension Refresh",
        ),
    ]

    cmd = UpdateNodesFromCsvCommand(
        plan=plan,
        prepared_nodes=prepared,
        graph=graph,
        blueprint=DummyBlueprint(),
        session_id="session-1",
    )

    cmd.execute()

    assert child_a.properties["cost"] == "1500"
    assert child_b.properties["cost"] == "1100"
    assert set(cmd.updated_node_ids) == {child_a.id, child_b.id}
    assert cmd.unmatched_rows == []


def test_update_command_skips_unmatched_rows():
    graph, parent, child_a, _ = _make_graph()

    plan = CSVImportPlan(
        parent_id=parent.id,
        blueprint_type_id="task",
        column_bindings=[
            CSVColumnBinding(header="Name", property_id="name"),
            CSVColumnBinding(header="Cost", property_id="cost"),
        ],
        mode=CSV_MODE_UPDATE,
        match_property_id="name",
    )
    prepared = [
        PreparedCSVNode(
            name="Brake Overhaul",
            properties={"name": "Brake Overhaul", "cost": "1500"},
            row_number=2,
            match_value="Brake Overhaul",
        ),
        PreparedCSVNode(
            name="Mystery Task",
            properties={"name": "Mystery Task", "cost": "2000"},
            row_number=3,
            match_value="Mystery Task",
        ),
    ]

    cmd = UpdateNodesFromCsvCommand(
        plan=plan,
        prepared_nodes=prepared,
        graph=graph,
        blueprint=DummyBlueprint(),
    )
    cmd.execute()

    assert child_a.properties["cost"] == "1500"
    assert cmd.updated_node_ids == [child_a.id]
    assert cmd.unmatched_rows == [
        {"row_number": 3, "match_value": "Mystery Task"},
    ]


def test_update_command_undo_restores_previous_values():
    graph, parent, child_a, _ = _make_graph()

    plan = CSVImportPlan(
        parent_id=parent.id,
        blueprint_type_id="task",
        column_bindings=[
            CSVColumnBinding(header="Name", property_id="name"),
            CSVColumnBinding(header="Cost", property_id="cost"),
        ],
        mode=CSV_MODE_UPDATE,
        match_property_id="name",
    )
    prepared = [
        PreparedCSVNode(
            name="Brake Overhaul",
            properties={"name": "Brake Overhaul", "cost": "1500"},
            row_number=2,
            match_value="Brake Overhaul",
        ),
    ]

    cmd = UpdateNodesFromCsvCommand(
        plan=plan,
        prepared_nodes=prepared,
        graph=graph,
        blueprint=DummyBlueprint(),
    )

    original_cost = child_a.properties["cost"]
    cmd.execute()
    assert child_a.properties["cost"] == "1500"

    cmd.undo()
    assert child_a.properties["cost"] == original_cost


def test_update_command_matches_case_insensitively():
    graph, parent, child_a, _ = _make_graph()

    plan = CSVImportPlan(
        parent_id=parent.id,
        blueprint_type_id="task",
        column_bindings=[
            CSVColumnBinding(header="Name", property_id="name"),
            CSVColumnBinding(header="Cost", property_id="cost"),
        ],
        mode=CSV_MODE_UPDATE,
        match_property_id="name",
    )
    prepared = [
        PreparedCSVNode(
            name="brake overhaul",
            properties={"name": "brake overhaul", "cost": "1500"},
            row_number=2,
            match_value="brake overhaul",
        ),
    ]

    cmd = UpdateNodesFromCsvCommand(
        plan=plan,
        prepared_nodes=prepared,
        graph=graph,
        blueprint=DummyBlueprint(),
    )
    cmd.execute()

    assert cmd.updated_node_ids == [child_a.id]
    assert cmd.unmatched_rows == []


def test_update_command_requires_match_property_id():
    with pytest.raises(ValueError):
        CSVImportPlan(
            parent_id=uuid.uuid4(),
            blueprint_type_id="task",
            column_bindings=[CSVColumnBinding(header="Name", property_id="name")],
            mode=CSV_MODE_UPDATE,
            match_property_id=None,
        )


def test_update_command_match_property_must_be_in_bindings():
    with pytest.raises(ValueError):
        CSVImportPlan(
            parent_id=uuid.uuid4(),
            blueprint_type_id="task",
            column_bindings=[CSVColumnBinding(header="Name", property_id="name")],
            mode=CSV_MODE_UPDATE,
            match_property_id="external_id",
        )


def test_upsert_command_creates_unmatched_rows():
    from backend.core.imports import CSV_MODE_UPSERT

    graph, parent, child_a, _ = _make_graph()

    plan = CSVImportPlan(
        parent_id=parent.id,
        blueprint_type_id="task",
        column_bindings=[
            CSVColumnBinding(header="Name", property_id="name"),
            CSVColumnBinding(header="Cost", property_id="cost"),
        ],
        mode=CSV_MODE_UPSERT,
        match_property_id="name",
    )
    prepared = [
        PreparedCSVNode(
            name="Brake Overhaul",
            properties={"name": "Brake Overhaul", "cost": "1500"},
            row_number=2,
            match_value="Brake Overhaul",
        ),
        PreparedCSVNode(
            name="New Task",
            properties={"name": "New Task", "cost": "2000"},
            row_number=3,
            match_value="New Task",
        ),
    ]

    cmd = UpdateNodesFromCsvCommand(
        plan=plan,
        prepared_nodes=prepared,
        graph=graph,
        blueprint=DummyBlueprint(),
        create_unmatched=True,
    )
    cmd.execute()

    assert child_a.properties["cost"] == "1500"
    assert cmd.updated_node_ids == [child_a.id]
    assert len(cmd.created_node_ids) == 1
    new_node = graph.get_node(cmd.created_node_ids[0])
    assert new_node is not None
    assert new_node.name == "New Task"
    assert new_node.properties["cost"] == "2000"
    assert new_node.id in parent.children
    assert len(cmd.unmatched_rows) == 1
    assert cmd.unmatched_rows[0]["match_value"] == "New Task"


def test_upsert_command_undo_reverts_creates_and_updates():
    from backend.core.imports import CSV_MODE_UPSERT

    graph, parent, child_a, _ = _make_graph()
    original_cost = child_a.properties["cost"]

    plan = CSVImportPlan(
        parent_id=parent.id,
        blueprint_type_id="task",
        column_bindings=[
            CSVColumnBinding(header="Name", property_id="name"),
            CSVColumnBinding(header="Cost", property_id="cost"),
        ],
        mode=CSV_MODE_UPSERT,
        match_property_id="name",
    )
    prepared = [
        PreparedCSVNode(
            name="Brake Overhaul",
            properties={"name": "Brake Overhaul", "cost": "1500"},
            row_number=2,
            match_value="Brake Overhaul",
        ),
        PreparedCSVNode(
            name="New Task",
            properties={"name": "New Task", "cost": "2000"},
            row_number=3,
            match_value="New Task",
        ),
    ]

    cmd = UpdateNodesFromCsvCommand(
        plan=plan,
        prepared_nodes=prepared,
        graph=graph,
        blueprint=DummyBlueprint(),
        create_unmatched=True,
    )
    cmd.execute()

    created_id = cmd.created_node_ids[0]
    assert graph.get_node(created_id) is not None

    cmd.undo()

    assert child_a.properties["cost"] == original_cost
    assert graph.get_node(created_id) is None
    assert created_id not in parent.children
