import pytest

from backend.app import create_app
from backend.core.graph import ProjectGraph
from backend.core.node import Node
import backend.api.routes as api_routes


@pytest.fixture
def client():
    app = create_app({"TESTING": True})
    with app.test_client() as client:
        yield client


def test_get_manpower_session_not_found(client):
    response = client.get('/api/v1/sessions/nonexistent-session/manpower')

    assert response.status_code == 404
    data = response.get_json()
    assert data['error'] == 'Session not found'


def test_get_manpower_payload(client):
    graph = ProjectGraph()

    project = Node(blueprint_type_id='project_root', name='Project')
    project.properties.update({
        'project_start': '2026-01-01',
        'project_end': '2026-01-03',
    })

    person = Node(blueprint_type_id='person', name='Alex')
    person.properties.update({'daily_capacity': 8})

    task = Node(blueprint_type_id='task', name='Task A')
    task.properties.update({
        'assigned_to': str(person.id),
        'estimated_hours': 12,
        'start_date': '2026-01-01',
        'end_date': '2026-01-03',
    })

    graph.add_node(project)
    graph.add_node(person)
    graph.add_node(task)

    session_id = 'test-manpower-session'
    api_routes._sessions[session_id] = {'graph': graph}

    try:
        response = client.get(f'/api/v1/sessions/{session_id}/manpower')
        assert response.status_code == 200

        data = response.get_json()
        assert data['date_columns'] == ['2026-01-01', '2026-01-02', '2026-01-03']
        assert 'timestamp' in data

        person_id = str(person.id)
        assert person_id in data['resources']

        resource = data['resources'][person_id]
        assert resource['name'] == 'Alex'
        assert resource['capacity'] == 8.0
        assert resource['load']['2026-01-01'] == {'total': 0.0, 'tasks': []}
        assert resource['load']['2026-01-02'] == {'total': 0.0, 'tasks': []}
        assert resource['load']['2026-01-03'] == {'total': 0.0, 'tasks': []}
        assert data['task_allocations'][0]['status'] == 'under'
    finally:
        api_routes._sessions.pop(session_id, None)


def test_recalculate_manpower_endpoint_populates_manual_allocations(client):
    graph = ProjectGraph()

    project = Node(blueprint_type_id='project_root', name='Project')
    project.properties.update({
        'project_start': '2026-01-01',
        'project_end': '2026-01-03',
    })

    person = Node(blueprint_type_id='person', name='Alex')
    person.properties.update({'daily_capacity': 8})

    task = Node(blueprint_type_id='task', name='Task A')
    task.properties.update({
        'assigned_to': str(person.id),
        'estimated_hours': 12,
        'start_date': '2026-01-01',
        'end_date': '2026-01-03',
    })

    graph.add_node(project)
    graph.add_node(person)
    graph.add_node(task)

    session_id = 'test-manpower-recalculate-session'
    api_routes._sessions[session_id] = {'graph': graph}

    try:
        response = client.post(f'/api/v1/sessions/{session_id}/manpower/recalculate')
        assert response.status_code == 200

        data = response.get_json()
        person_id = str(person.id)
        assert data['updated_tasks'] == 1
        assert data['total_tasks'] == 1
        assert data['resources'][person_id]['load']['2026-01-01']['total'] == pytest.approx(6.0)
        assert data['resources'][person_id]['load']['2026-01-02']['total'] == pytest.approx(6.0)
        assert data['resources'][person_id]['load']['2026-01-03']['total'] == pytest.approx(0.0)
        assert data['task_allocations'][0]['status'] == 'full'
    finally:
        api_routes._sessions.pop(session_id, None)
