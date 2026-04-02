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


def test_gantt_engine_resolves_status_option_uuid_to_name():
    """Status select property stores an option UUID; GanttEngine should resolve it to the display name."""
    from backend.core.gantt_engine import GanttEngine

    status_option_uuid = "624a65b3-0dd3-5060-f581-2ebcade3874e"
    status_prop_uuid = "prop-status-uuid"

    blueprint = {
        "node_types": [
            {
                "id": "task",
                "label": "Task",
                "properties": [
                    {"id": "start_date", "type": "date"},
                    {"id": "end_date", "type": "date"},
                    {
                        "id": "status",
                        "type": "select",
                        "options": [
                            {"id": "opt-todo", "name": "To Do", "indicator_id": "empty"},
                            {"id": status_option_uuid, "name": "In Progress", "indicator_id": "partial"},
                            {"id": "opt-done", "name": "Done", "indicator_id": "filled"},
                        ],
                    },
                ],
            }
        ]
    }

    nodes = {
        "n1": {
            "type": "task",
            "children": [],
            "properties": {
                "name": "Alpha",
                "start_date": "2026-03-01",
                "end_date": "2026-03-15",
                "status": status_option_uuid,
            },
        },
        "n2": {
            "type": "task",
            "children": [],
            "properties": {
                "name": "Beta",
                "start_date": "2026-04-01",
                "end_date": "2026-04-10",
                "status": "opt-done",
            },
        },
    }

    engine = GanttEngine(nodes, blueprint=blueprint)
    bars = engine.calculate()

    bar_map = {b.node_name: b for b in bars}
    assert bar_map["Alpha"].status == "In Progress"
    assert bar_map["Beta"].status == "Done"


def test_gantt_engine_resolves_status_with_blueprint_object():
    """Same resolution should work when blueprint is a real Blueprint object (not a dict)."""
    from backend.core.gantt_engine import GanttEngine
    from backend.infra.schema_loader import SchemaLoader

    loader = SchemaLoader()
    blueprint = loader.load("software_development.yaml")

    # Build a property UUID map so we can set node properties with correct UUID keys
    pr_maps = blueprint.build_all_property_uuid_maps()

    # Find the first node type that has a status property with select options
    status_opt_map = {}
    node_type_uuid = None
    for nt in blueprint.node_types:
        if not nt.properties:
            continue
        for prop in nt.properties:
            if prop.get("id") == "status" and prop.get("type") == "select":
                node_type_uuid = nt.uuid
                for opt in prop.get("options", []):
                    status_opt_map[opt["name"]] = opt["id"]
                break
        if node_type_uuid:
            break

    assert node_type_uuid, "Expected a node type with status select property"
    assert "In Progress" in status_opt_map

    type_map = pr_maps.get(node_type_uuid, {})
    nodes = {
        "n1": {
            "type": node_type_uuid,
            "children": [],
            "properties": {
                type_map.get("name", "name"): "Test Task",
                type_map.get("start_date", "start_date"): "2026-03-01",
                type_map.get("end_date", "end_date"): "2026-03-15",
                type_map.get("status", "status"): status_opt_map["In Progress"],
            },
        },
    }

    engine = GanttEngine(nodes, blueprint=blueprint)
    bars = engine.calculate()
    assert len(bars) == 1
    assert bars[0].status == "In Progress"


def test_gantt_engine_resolves_disambiguated_feat_status():
    """When a template has a user-defined 'status' property AND the feature macro
    injects '_feat_scheduling_status' (key='status'), the engine should resolve
    option UUIDs from BOTH properties."""
    from backend.core.gantt_engine import GanttEngine
    from backend.infra.schema_loader import SchemaLoader

    loader = SchemaLoader()
    blueprint = loader.load("project_talus.yaml")

    # project_talus has an 'episode' node type with both:
    #  - id="status" (user-defined: Planning, Shooting, Editing, Uploaded)
    #  - id="_feat_scheduling_status" key="status" (macro: To Do, In Progress, Done)
    pr_maps = blueprint.build_all_property_uuid_maps()

    # Find the episode node type
    episode = None
    for nt in blueprint.node_types:
        if nt.id == "episode":
            episode = nt
            break
    assert episode, "Expected 'episode' node type in project_talus"

    # Find the scheduling status option UUIDs
    sched_opts = {}
    for prop in episode.properties:
        if prop.get("key") == "status" or (prop.get("id") == "_feat_scheduling_status"):
            for opt in prop.get("options", []):
                sched_opts[opt["name"]] = opt["id"]
            break
    assert "In Progress" in sched_opts, f"Expected scheduling options, got {sched_opts}"

    type_map = pr_maps.get(episode.uuid, {})
    nodes = {
        "ep1": {
            "type": episode.uuid,
            "children": [],
            "properties": {
                type_map.get("name", "name"): "Episode 1",
                type_map.get("start_date", "start_date"): "2026-06-01",
                type_map.get("end_date", "end_date"): "2026-06-15",
                type_map.get("status", "status"): sched_opts["In Progress"],
            },
        },
    }

    engine = GanttEngine(nodes, blueprint=blueprint)
    bars = engine.calculate()
    assert len(bars) == 1
    assert bars[0].status == "In Progress"
