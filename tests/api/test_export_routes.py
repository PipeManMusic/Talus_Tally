import json
from types import SimpleNamespace

from backend.app import create_app
from backend.core.node import Node


class _FakeExportEngine:
    def __init__(self):
        self.last_filter_args = None
        self.last_context = None

    def filter_nodes(self, nodes, root_node_id=None, included_node_ids=None):
        self.last_filter_args = {
            "root_node_id": root_node_id,
            "included_node_ids": included_node_ids,
            "node_count": len(nodes),
        }
        if included_node_ids is None:
            return nodes
        include_set = set(included_node_ids)
        return [n for n in nodes if n["id"] in include_set]

    def render(self, template_id, context):
        self.last_context = context
        payload = {
            "template_id": template_id,
            "node_ids": [n["id"] for n in context["nodes"]],
        }
        return json.dumps(payload)

    def get_output_filename(self, template_id, project_id=None):
        return "export.json"


def _build_graph():
    root = Node(blueprint_type_id="project_root", name="Root")
    child = Node(blueprint_type_id="task", name="Child")
    other = Node(blueprint_type_id="task", name="Other")

    root.children = [child.id]
    child.parent_id = root.id

    return {
        str(root.id): root,
        str(child.id): child,
        str(other.id): other,
    }


def test_download_export_accepts_scope_fields(monkeypatch):
    app = create_app({"TESTING": True})
    client = app.test_client()

    graph_nodes = _build_graph()
    root_id = next(node_id for node_id, node in graph_nodes.items() if node.name == "Root")

    fake_session = {
        "graph": SimpleNamespace(nodes=graph_nodes, template_id="restomod", template_version="0.0.0"),
        "current_project_id": "p1",
        "blueprint": None,
        "blocking_relationships": [],
    }

    fake_engine = _FakeExportEngine()

    monkeypatch.setattr("backend.api.routes._get_session_data", lambda _sid: fake_session)
    monkeypatch.setattr("backend.api.export_routes.get_export_engine", lambda: fake_engine)

    response = client.post(
        "/api/export/s1/download",
        json={
            "template_id": "foo.json.j2",
            "root_node_id": root_id,
            "included_node_ids": [root_id],
        },
    )

    assert response.status_code == 200
    assert fake_engine.last_filter_args["root_node_id"] == root_id
    assert fake_engine.last_filter_args["included_node_ids"] == [root_id]


def test_download_export_rejects_invalid_included_node_ids(monkeypatch):
    app = create_app({"TESTING": True})
    client = app.test_client()

    fake_session = {
        "graph": SimpleNamespace(nodes={}, template_id="restomod", template_version="0.0.0"),
        "current_project_id": "p1",
        "blueprint": None,
        "blocking_relationships": [],
    }

    monkeypatch.setattr("backend.api.routes._get_session_data", lambda _sid: fake_session)

    response = client.post(
        "/api/export/s1/download",
        json={
            "template_id": "foo.json.j2",
            "included_node_ids": "not-a-list",
        },
    )

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "INVALID_INCLUDED_NODE_IDS"


def test_download_export_resolves_task_context(monkeypatch):
    app = create_app({"TESTING": True})
    client = app.test_client()

    phase = Node(blueprint_type_id="phase-type", name="Phase A")
    person = Node(blueprint_type_id="person-type", name="Alice")
    task = Node(blueprint_type_id="task-type", name="Inspect trim")

    phase.children = [task.id]
    task.parent_id = phase.id
    task.properties = {
        "task-status-uuid": "done-option-uuid",
        "task-assigned-uuid": [str(person.id)],
        "task-estimated-uuid": 2.5,
        "task-notes-uuid": "Check fitment before sign-off.",
    }

    fake_blueprint = SimpleNamespace(
        node_types=[
            SimpleNamespace(
                uuid="phase-type",
                id="phase",
                label="Phase",
                _extra_props={
                    "properties": [
                        {"id": "name", "label": "Name", "uuid": "phase-name-uuid"},
                    ]
                },
            ),
            SimpleNamespace(
                uuid="person-type",
                id="person",
                label="Person",
                _extra_props={
                    "properties": [
                        {"id": "name", "label": "Name", "uuid": "person-name-uuid"},
                    ]
                },
            ),
            SimpleNamespace(
                uuid="task-type",
                id="work_item",
                label="Task",
                _extra_props={
                    "properties": [
                        {"id": "name", "label": "Task Name", "uuid": "task-name-uuid"},
                        {
                            "id": "status",
                            "label": "Status",
                            "uuid": "task-status-uuid",
                            "options": [
                                {"id": "done-option-uuid", "name": "Done"},
                            ],
                        },
                        {"id": "assigned_to", "label": "Assigned To", "uuid": "task-assigned-uuid"},
                        {"id": "estimated_hours", "label": "Estimated Hours", "uuid": "task-estimated-uuid"},
                        {"id": "notes", "label": "Notes", "uuid": "task-notes-uuid"},
                    ]
                },
            ),
        ],
        build_all_property_uuid_maps=lambda: {
            "task-type": {
                "name": "task-name-uuid",
                "status": "task-status-uuid",
                "assigned_to": "task-assigned-uuid",
                "estimated_hours": "task-estimated-uuid",
                "notes": "task-notes-uuid",
            },
            "phase-type": {
                "name": "phase-name-uuid",
            },
            "person-type": {
                "name": "person-name-uuid",
            },
        },
    )

    fake_session = {
        "graph": SimpleNamespace(
            nodes={str(phase.id): phase, str(person.id): person, str(task.id): task},
            template_id="detailing",
            template_version="1.0.0",
        ),
        "current_project_id": "p1",
        "blueprint": fake_blueprint,
        "blocking_relationships": [],
    }

    fake_engine = _FakeExportEngine()

    monkeypatch.setattr("backend.api.routes._get_session_data", lambda _sid: fake_session)
    monkeypatch.setattr("backend.api.export_routes.get_export_engine", lambda: fake_engine)

    response = client.post(
        "/api/export/s1/download",
        json={
            "template_id": "task_tracking.csv.j2",
        },
    )

    assert response.status_code == 200

    exported_task = next(node for node in fake_engine.last_context["nodes"] if node["name"] == "Inspect trim")
    assert exported_task["type_key"] == "work_item"
    assert exported_task["type_label"] == "Task"
    assert exported_task["is_task_like"] is True
    assert exported_task["parent_name"] == "Phase A"
    assert exported_task["path"] == "Phase A / Inspect trim"
    assert exported_task["properties"]["status"] == "Done"
    assert exported_task["properties"]["assigned_to"] == ["Alice"]
    assert exported_task["properties"]["estimated_hours"] == 2.5
    assert exported_task["properties"]["notes"] == "Check fitment before sign-off."


def test_download_export_keeps_export_engine_when_velocity_data_is_present(monkeypatch):
    app = create_app({"TESTING": True})
    client = app.test_client()

    graph_nodes = _build_graph()
    fake_session = {
        "graph": SimpleNamespace(nodes=graph_nodes, template_id="restomod", template_version="0.0.0"),
        "current_project_id": "p1",
        "blueprint": None,
        "blocking_relationships": [],
    }
    fake_engine = _FakeExportEngine()

    class _FakeVelocityEngine:
        def __init__(self, graph_nodes, schema, blocking_graph):
            self.graph_nodes = graph_nodes
            self.schema = schema
            self.blocking_graph = blocking_graph

        def get_ranking(self):
            return []

    monkeypatch.setattr("backend.api.routes._get_session_data", lambda _sid: fake_session)
    monkeypatch.setattr("backend.api.export_routes.get_export_engine", lambda: fake_engine)
    monkeypatch.setattr("backend.core.velocity_engine.VelocityEngine", _FakeVelocityEngine)
    monkeypatch.setattr(
        "backend.api.velocity_routes._get_velocity_context",
        lambda _sid: ({}, object(), []),
    )

    response = client.post(
        "/api/export/s1/download",
        json={
            "template_id": "task_tracking.csv.j2",
        },
    )

    assert response.status_code == 200
    assert fake_engine.last_context is not None
