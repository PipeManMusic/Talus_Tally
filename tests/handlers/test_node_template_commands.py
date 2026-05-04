"""Tests for the four NodeTemplate commands."""

import pytest

from backend.core.graph import ProjectGraph
from backend.core.node import Node
from backend.core.node_templates import NodeTemplate, NodeTemplateNode
from backend.handlers.commands.node_template_commands import (
    CreateNodeTemplateCommand,
    DeleteNodeTemplateCommand,
    InstantiateNodeTemplateCommand,
    UpdateNodeTemplateCommand,
)


class DummyNodeType:
    def __init__(self, type_id, allowed_children):
        self.id = type_id
        self.allowed_children = allowed_children


class DummyBlueprint:
    def __init__(self):
        self._types = {
            "project_root": DummyNodeType("project_root", ["folder", "task"]),
            "folder": DummyNodeType("folder", ["task"]),
            "task": DummyNodeType("task", []),
        }

    def is_allowed_child(self, parent_type, child_type):
        nt = self._types.get(parent_type)
        return bool(nt and child_type in nt.allowed_children)

    def get_node_type(self, ref):
        return self._types.get(ref)

    def build_property_uuid_map(self, node_type_ref):
        return {"name": "name"}


@pytest.fixture(autouse=True)
def mute_emit(monkeypatch):
    monkeypatch.setattr(
        "backend.handlers.commands.node_template_commands.__import__",
        lambda name, *a, **k: __import__(name, *a, **k),
        raising=False,
    )
    # Patch emit_node_created within the broadcaster module so the lazy import
    # inside InstantiateNodeTemplateCommand picks up the no-op.
    import backend.api.broadcaster as broadcaster
    monkeypatch.setattr(broadcaster, "emit_node_created", lambda *a, **k: None)


def _camera_kit_template():
    root = NodeTemplateNode(
        blueprint_type_id="folder",
        name="Camera Kit",
        properties={"notes": "Default kit"},
        children=[
            NodeTemplateNode(blueprint_type_id="task", name="Set up camera", properties={"cost": 100}),
            NodeTemplateNode(blueprint_type_id="task", name="Frame shot", properties={"cost": 50}),
        ],
    )
    return NodeTemplate.new(name="Camera Kit", root=root)


def test_create_node_template_command_executes_and_undoes():
    store = {}
    blueprint = DummyBlueprint()
    template = _camera_kit_template()

    cmd = CreateNodeTemplateCommand(template=template, store=store, blueprint=blueprint)
    cmd.execute()
    assert template.id in store

    cmd.undo()
    assert template.id not in store


def test_create_node_template_validates_against_blueprint():
    store = {}
    blueprint = DummyBlueprint()
    bad = NodeTemplate.new(
        name="Bad",
        root=NodeTemplateNode(
            blueprint_type_id="task",
            children=[NodeTemplateNode(blueprint_type_id="folder")],  # not allowed under task
        ),
    )
    cmd = CreateNodeTemplateCommand(template=bad, store=store, blueprint=blueprint)
    with pytest.raises(ValueError):
        cmd.execute()


def test_update_node_template_command_replaces_and_undoes():
    store = {}
    blueprint = DummyBlueprint()
    template = _camera_kit_template()
    store[template.id] = template

    new_root = NodeTemplateNode(blueprint_type_id="folder", name="Updated Kit")
    new_template = NodeTemplate(
        id=template.id, name="Updated Kit", description="Renamed", root=new_root
    )
    cmd = UpdateNodeTemplateCommand(
        template_id=template.id,
        new_template=new_template,
        store=store,
        blueprint=blueprint,
    )
    cmd.execute()
    assert store[template.id].name == "Updated Kit"
    assert len(store[template.id].root.children) == 0

    cmd.undo()
    assert store[template.id].name == "Camera Kit"
    assert len(store[template.id].root.children) == 2


def test_delete_node_template_command_executes_and_undoes():
    store = {}
    template = _camera_kit_template()
    store[template.id] = template

    cmd = DeleteNodeTemplateCommand(template_id=template.id, store=store)
    cmd.execute()
    assert template.id not in store

    cmd.undo()
    assert template.id in store
    assert store[template.id].name == "Camera Kit"


def test_instantiate_node_template_creates_full_subtree():
    blueprint = DummyBlueprint()
    graph = ProjectGraph()
    parent = Node(blueprint_type_id="project_root", name="Root")
    graph.add_node(parent)

    template = _camera_kit_template()
    cmd = InstantiateNodeTemplateCommand(
        template=template,
        parent_id=parent.id,
        graph=graph,
        blueprint=blueprint,
    )
    created_ids = cmd.execute()

    assert len(created_ids) == 3  # folder + 2 tasks
    # Root of template attached to parent
    assert len(parent.children) == 1
    folder_id = parent.children[0]
    folder = graph.get_node(folder_id)
    assert folder.blueprint_type_id == "folder"
    assert folder.name == "Camera Kit"
    assert folder.properties.get("notes") == "Default kit"
    assert len(folder.children) == 2
    task_names = sorted(graph.get_node(c).name for c in folder.children)
    assert task_names == ["Frame shot", "Set up camera"]
    # Property defaults copied
    for child_id in folder.children:
        child = graph.get_node(child_id)
        assert child.blueprint_type_id == "task"
        assert child.properties.get("cost") in (50, 100)


def test_instantiate_node_template_undo_removes_all_created_nodes():
    blueprint = DummyBlueprint()
    graph = ProjectGraph()
    parent = Node(blueprint_type_id="project_root", name="Root")
    graph.add_node(parent)

    template = _camera_kit_template()
    cmd = InstantiateNodeTemplateCommand(
        template=template,
        parent_id=parent.id,
        graph=graph,
        blueprint=blueprint,
    )
    created_ids = cmd.execute()
    assert all(cid in graph.nodes for cid in created_ids)

    cmd.undo()
    assert all(cid not in graph.nodes for cid in created_ids)
    assert len(parent.children) == 0


def test_instantiate_node_template_rejects_incompatible_parent():
    blueprint = DummyBlueprint()
    graph = ProjectGraph()
    parent = Node(blueprint_type_id="task", name="A task")  # tasks accept no children
    graph.add_node(parent)

    template = _camera_kit_template()
    cmd = InstantiateNodeTemplateCommand(
        template=template,
        parent_id=parent.id,
        graph=graph,
        blueprint=blueprint,
    )
    with pytest.raises(ValueError):
        cmd.execute()
    assert len(parent.children) == 0
