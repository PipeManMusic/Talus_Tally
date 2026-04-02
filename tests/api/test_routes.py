import pytest
from backend.app import create_app

@pytest.fixture
def client():
    app = create_app({"TESTING": True})
    with app.test_client() as client:
        yield client

def test_create_project_logs_and_returns_graph(client, caplog):
    # Use a known-good template and project name
    payload = {
        "template_id": "restomod",
        "project_name": "Test Project"
    }
    with caplog.at_level("INFO"):
        response = client.post("/api/v1/projects", json=payload)
        assert response.status_code == 201, response.get_json()
        data = response.get_json()
        # Check response structure
        assert "project_id" in data
        assert "session_id" in data
        assert "graph" in data
        graph = data["graph"]
        assert "roots" in graph
        assert isinstance(graph["roots"], list)
        assert len(graph["roots"]) > 0
        root = graph["roots"][0]
        assert "id" in root
        assert "blueprint_type_id" in root
        assert "name" in root
        assert "properties" in root
        assert "children" in root
        # Check logs for project creation
        log_messages = "\n".join(caplog.messages)
        assert "Creating new project" in log_messages
        assert "Project graph created for session" in log_messages
        assert "Loaded blueprint for template_id" in log_messages


def test_template_schema_includes_markup_profile(client):
    response = client.get("/api/v1/templates/markup_test/schema")
    assert response.status_code == 200, response.get_json()
    data = response.get_json()

    node_types = data.get("node_types", [])
    root_type = next((nt for nt in node_types if nt.get("key") == "root"), None)
    assert root_type is not None

    props = root_type.get("properties", [])
    script_prop = next((p for p in props if p.get("key") == "script"), None)
    assert script_prop is not None
    assert script_prop.get("type") == "editor"
    assert script_prop.get("markup_profile") == "script_default"
    assert isinstance(script_prop.get("markup_tokens"), list)
    assert len(script_prop.get("markup_tokens")) > 0


def test_graph_serialization_includes_property_markup(client):
    payload = {
        "template_id": "markup_test",
        "project_name": "Markup Project"
    }
    response = client.post("/api/v1/projects", json=payload)
    assert response.status_code == 201, response.get_json()
    data = response.get_json()

    graph = data.get("graph", {})
    roots = graph.get("roots", [])
    assert len(roots) == 1
    root = roots[0]

    property_markup = root.get("property_markup")
    assert isinstance(property_markup, dict)
    # Property markup now uses UUID keys; find the script markup by profile
    script_markup = next((v for v in property_markup.values() if v.get('profile_id') == 'script_default'), None)
    assert script_markup is not None
    assert script_markup.get("profile_id") == "script_default"
    assert isinstance(script_markup.get("blocks"), list)


def test_velocity_schema_preserves_disambiguated_key():
    """Ensure _build_velocity_schema_snapshot keeps explicit 'key' on disambiguated properties."""
    from backend.api.routes import _build_velocity_schema_snapshot
    from backend.infra.schema_loader import Blueprint, NodeTypeDef

    node_type = NodeTypeDef(**{
        "id": "phase",
        "label": "Phase",
        "properties": [
            {"id": "status", "uuid": "uuid-user-status", "type": "text"},
            {"id": "_feat_scheduling_status", "key": "status", "uuid": "uuid-macro-status",
             "type": "select", "system_locked": True,
             "options": [{"name": "To Do", "id": "opt-todo"}]},
        ],
    })
    blueprint = Blueprint(id="test", name="Test", version="1.0", node_types=[node_type])

    schema = _build_velocity_schema_snapshot(blueprint)
    props = schema["node_types"][0]["properties"]

    # The user-defined property should have key="status" (from original id)
    user_prop = next(p for p in props if p["id"] == "uuid-user-status")
    assert user_prop["key"] == "status"

    # The macro property should KEEP key="status" (not be overwritten to "_feat_scheduling_status")
    macro_prop = next(p for p in props if p["id"] == "uuid-macro-status")
    assert macro_prop["key"] == "status"
