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
