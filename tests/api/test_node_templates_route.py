"""Route-level integration tests for the Node Templates feature."""

import pytest

from backend.app import create_app


@pytest.fixture
def client():
    app = create_app({"TESTING": True})
    with app.test_client() as client:
        yield client


def _create_project(client):
    payload = {"template_id": "restomod", "project_name": "Templates Project"}
    response = client.post("/api/v1/projects", json=payload)
    assert response.status_code == 201, response.get_json()
    return response.get_json()


def _root(project_response):
    return project_response["graph"]["roots"][0]


def _execute(client, session_id, command_type, data):
    return client.post(
        "/api/v1/commands/execute",
        json={"session_id": session_id, "command_type": command_type, "data": data},
    )


def _build_template_dict(blueprint_type_id, *, template_id="tpl-test-1", name="Test Kit"):
    return {
        "id": template_id,
        "name": name,
        "description": "",
        "root": {
            "blueprint_type_id": blueprint_type_id,
            "name": "Kit Root",
            "properties": {},
            "children": [],
        },
    }


def test_create_node_template_round_trip(client):
    project = _create_project(client)
    session_id = project["session_id"]
    root_type = _root(project)["blueprint_type_id"]

    template = _build_template_dict(root_type)
    response = _execute(client, session_id, "CreateNodeTemplate", {"template": template})
    assert response.status_code == 200, response.get_json()
    body = response.get_json()
    assert body["success"] is True
    assert body["undo_available"] is True

    list_response = client.get(f"/api/v1/sessions/{session_id}/node-templates")
    assert list_response.status_code == 200
    listed = list_response.get_json()["templates"]
    assert len(listed) == 1
    assert listed[0]["id"] == "tpl-test-1"
    assert listed[0]["name"] == "Test Kit"


def test_create_node_template_requires_template_dict(client):
    project = _create_project(client)
    session_id = project["session_id"]
    response = _execute(client, session_id, "CreateNodeTemplate", {})
    assert response.status_code == 400


def test_update_and_delete_node_template(client):
    project = _create_project(client)
    session_id = project["session_id"]
    root_type = _root(project)["blueprint_type_id"]

    template = _build_template_dict(root_type)
    _execute(client, session_id, "CreateNodeTemplate", {"template": template})

    updated = {**template, "name": "Renamed Kit"}
    update_response = _execute(
        client,
        session_id,
        "UpdateNodeTemplate",
        {"template_id": template["id"], "template": updated},
    )
    assert update_response.status_code == 200, update_response.get_json()

    listed = client.get(f"/api/v1/sessions/{session_id}/node-templates").get_json()["templates"]
    assert listed[0]["name"] == "Renamed Kit"

    delete_response = _execute(
        client, session_id, "DeleteNodeTemplate", {"template_id": template["id"]}
    )
    assert delete_response.status_code == 200, delete_response.get_json()
    listed = client.get(f"/api/v1/sessions/{session_id}/node-templates").get_json()["templates"]
    assert listed == []


def test_instantiate_node_template_creates_subtree_and_undo(client):
    project = _create_project(client)
    session_id = project["session_id"]
    root_node = _root(project)
    parent_id = root_node["id"]
    allowed_children = root_node.get("allowed_children") or []
    if not allowed_children:
        pytest.skip("Root node has no allowed children in this blueprint")
    child_type = allowed_children[0]

    template = _build_template_dict(child_type, template_id="tpl-instantiate-1", name="Sample Kit")
    template["root"]["name"] = "Kit Folder"
    create_resp = _execute(client, session_id, "CreateNodeTemplate", {"template": template})
    assert create_resp.status_code == 200, create_resp.get_json()

    inst_resp = _execute(
        client,
        session_id,
        "InstantiateNodeTemplate",
        {"template_id": template["id"], "parent_id": parent_id},
    )
    assert inst_resp.status_code == 200, inst_resp.get_json()
    graph = inst_resp.get_json()["graph"]
    parent_node = next(n for n in graph["roots"] if n["id"] == parent_id)
    child_names = [c["name"] for c in parent_node.get("children", [])]
    assert "Kit Folder" in child_names

    undo = client.post(f"/api/v1/sessions/{session_id}/undo")
    assert undo.status_code == 200, undo.get_json()
    graph2 = undo.get_json()["graph"]
    parent_node2 = next(n for n in graph2["roots"] if n["id"] == parent_id)
    assert "Kit Folder" not in [c["name"] for c in parent_node2.get("children", [])]


def test_instantiate_unknown_template_returns_400(client):
    project = _create_project(client)
    session_id = project["session_id"]
    parent_id = _root(project)["id"]
    response = _execute(
        client,
        session_id,
        "InstantiateNodeTemplate",
        {"template_id": "does-not-exist", "parent_id": parent_id},
    )
    assert response.status_code == 400


def test_list_node_templates_reports_compatibility(client):
    project = _create_project(client)
    session_id = project["session_id"]
    root_node = _root(project)
    root_type = root_node["blueprint_type_id"]
    allowed_children = root_node.get("allowed_children") or []
    if not allowed_children:
        pytest.skip("Root node has no allowed children")
    child_type = allowed_children[0]

    compatible = _build_template_dict(child_type, template_id="tpl-compat", name="Compatible")
    _execute(client, session_id, "CreateNodeTemplate", {"template": compatible})

    resp = client.get(
        f"/api/v1/sessions/{session_id}/node-templates",
        query_string={"parent_type": root_type},
    )
    assert resp.status_code == 200
    listed = resp.get_json()["templates"]
    by_id = {t["id"]: t for t in listed}
    assert by_id["tpl-compat"]["compatible"] is True
