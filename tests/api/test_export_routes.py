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
