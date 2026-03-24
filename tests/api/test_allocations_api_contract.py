import pytest

from backend.app import create_app
from backend.core.graph import ProjectGraph
from backend.core.node import Node
from backend.handlers.dispatcher import CommandDispatcher
import backend.api.routes as api_routes


@pytest.fixture
def client():
    app = create_app({"TESTING": True})
    with app.test_client() as client:
        yield client


def test_recalculate_manpower_writes_canonical_allocations_property(client):
    graph = ProjectGraph()

    project = Node(blueprint_type_id="project_root", name="Project")
    project.properties.update({
        "project_start": "2026-03-03",
        "project_end": "2026-03-05",
    })

    person = Node(blueprint_type_id="person", name="Alex")
    person.properties.update({"daily_capacity": 8})

    task = Node(blueprint_type_id="task", name="Task A")
    task.properties.update({
        "assigned_to": str(person.id),
        "estimated_hours": 12,
        "start_date": "2026-03-03",
        "end_date": "2026-03-05",
    })

    graph.add_node(project)
    graph.add_node(person)
    graph.add_node(task)

    session_id = "test-allocations-contract-session"
    dispatcher = CommandDispatcher(graph, session_id=session_id)
    api_routes._sessions[session_id] = {
        "graph": graph,
        "dispatcher": dispatcher,
        "graph_service": None,
    }

    try:
        response = client.post(f"/api/v1/sessions/{session_id}/manpower/recalculate")
        assert response.status_code == 200

        data = response.get_json()
        assert data["updated_tasks"] == 1
        assert data["total_tasks"] == 1
        assert data["allocation_property_id"] == "allocations"

        refreshed_task = graph.get_node(task.id)
        assert "allocations" in refreshed_task.properties
        assert "manual_allocations" not in refreshed_task.properties
        assert refreshed_task.properties["allocations"]["2026-03-03"][str(person.id)] == pytest.approx(4.0)
        assert refreshed_task.properties["allocations"]["2026-03-04"][str(person.id)] == pytest.approx(4.0)
        assert refreshed_task.properties["allocations"]["2026-03-05"][str(person.id)] == pytest.approx(4.0)

        person_id = str(person.id)
        assert data["resources"][person_id]["load"]["2026-03-03"]["total"] == pytest.approx(4.0)
        assert data["resources"][person_id]["load"]["2026-03-04"]["total"] == pytest.approx(4.0)
        assert data["resources"][person_id]["load"]["2026-03-05"]["total"] == pytest.approx(4.0)
    finally:
        api_routes._sessions.pop(session_id, None)
