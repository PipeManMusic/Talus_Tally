import pytest
import json
from datetime import date

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


def test_get_manpower_session_not_found(client):
    response = client.get('/api/v1/sessions/nonexistent-session/manpower')

    assert response.status_code == 404
    data = response.get_json()
    assert data['error'] == 'Session not found'


def test_get_manpower_payload(client, monkeypatch):
    import backend.core.resource_engine as resource_engine
    monkeypatch.setattr(resource_engine, "_today_date", lambda: date(2026, 1, 2))

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
    api_routes._sessions[session_id] = {
        'graph': graph,
        'dispatcher': CommandDispatcher(graph=graph, session_id=session_id),
    }

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
        assert resource['capacity'] == 24.0  # 8h/day × 3 days
        assert resource['load']['2026-01-01'] == {'total': 0.0, 'tasks': []}
        assert resource['load']['2026-01-02'] == {'total': 0.0, 'tasks': []}
        assert resource['load']['2026-01-03'] == {'total': 0.0, 'tasks': []}
        assert data['task_allocations'][0]['status'] == 'under'
    finally:
        api_routes._sessions.pop(session_id, None)


def test_recalculate_manpower_endpoint_populates_manual_allocations(client, monkeypatch):
    import backend.core.resource_engine as resource_engine
    monkeypatch.setattr(resource_engine, "_today_date", lambda: date(2026, 1, 2))

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
    api_routes._sessions[session_id] = {
        'graph': graph,
        'dispatcher': CommandDispatcher(graph=graph, session_id=session_id),
    }

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


def test_load_graph_with_string_ids_remaps_assigned_to_for_manpower(client):
    create_session_response = client.post('/api/v1/sessions')
    assert create_session_response.status_code == 201
    session_id = create_session_response.get_json()['session_id']

    graph_payload = {
        'template_id': 'project_talus',
        'template_version': '0.2.1',
        'graph': {
            'nodes': [
                {
                    'id': 'proj-root-001',
                    'type': 'project_root',
                    'name': 'Project',
                    'properties': {
                        'name': 'Project',
                    },
                },
                {
                    'id': 'person-001',
                    'type': 'person',
                    'name': 'Alex',
                    'properties': {
                        'name': 'Alex',
                        'email': 'alex@example.com',
                        'capacity_monday': 8,
                        'capacity_tuesday': 8,
                        'capacity_wednesday': 8,
                        'capacity_thursday': 8,
                        'capacity_friday': 8,
                        'capacity_saturday': 0,
                        'capacity_sunday': 0,
                        'overtime_capacity_monday': 0,
                        'overtime_capacity_tuesday': 0,
                        'overtime_capacity_wednesday': 0,
                        'overtime_capacity_thursday': 0,
                        'overtime_capacity_friday': 0,
                        'overtime_capacity_saturday': 0,
                        'overtime_capacity_sunday': 0,
                    },
                },
                {
                    'id': 'episode-001',
                    'type': 'episode',
                    'name': 'Engine Teardown',
                    'properties': {
                        'name': 'Engine Teardown',
                        'start_date': '2026-01-05',
                        'end_date': '2026-01-09',
                        'assigned_to': 'person-001',
                        'estimated_hours': 10,
                        'manual_allocations': {},
                    },
                },
            ],
            'edges': [],
        },
    }

    try:
        load_response = client.post(
            f'/api/v1/sessions/{session_id}/load-graph',
            data=json.dumps(graph_payload),
            content_type='application/json',
        )
        assert load_response.status_code == 200

        recalc_response = client.post(f'/api/v1/sessions/{session_id}/manpower/recalculate')
        assert recalc_response.status_code == 200

        data = recalc_response.get_json()
        assert data['updated_tasks'] == 1
        assert data['total_tasks'] == 1
        assert len(data['resources']) == 1

        resource = next(iter(data['resources'].values()))
        assert resource['load']['2026-01-05']['total'] == pytest.approx(2.0)
        assert resource['load']['2026-01-09']['total'] == pytest.approx(2.0)
        assert data['task_allocations'][0]['status'] == 'full'
    finally:
        api_routes._sessions.pop(session_id, None)
        api_routes._session_metadata.pop(session_id, None)
