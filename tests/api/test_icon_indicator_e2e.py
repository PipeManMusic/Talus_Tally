"""
End-to-end tests for icon and indicator loading after the UUID migration.

Verifies that the full pipeline (project creation → graph serialization → response)
returns valid icon_id and indicator_id values — never raw UUIDs.
"""
import json
import re
import pytest
from backend.app import create_app
import backend.api.routes as api_routes


UUID_RE = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.IGNORECASE
)


@pytest.fixture
def client():
    app = create_app({"TESTING": True})
    with app.test_client() as c:
        yield c


def _collect_nodes(graph_data: dict) -> list:
    """Flatten a nested graph response into a flat list of node dicts."""
    nodes = []

    def _walk(node):
        nodes.append(node)
        for child in node.get('children', []):
            _walk(child)

    for root in graph_data.get('roots', []):
        _walk(root)
    return nodes


def test_create_project_icon_ids_are_not_uuids(client):
    """After creating a project, every node's icon_id must be a human-readable
    icon name (e.g. 'film', 'cog') — never a raw UUID."""
    payload = {"template_id": "project_talus", "project_name": "Icon Check"}
    resp = client.post("/api/v1/projects", json=payload)
    assert resp.status_code == 201, resp.get_json()
    data = resp.get_json()
    graph = data.get("graph", {})
    nodes = _collect_nodes(graph)

    assert len(nodes) > 0, "Expected at least one node in the graph"
    for node in nodes:
        icon_id = node.get("icon_id")
        if icon_id is not None:
            assert not UUID_RE.match(icon_id), (
                f"Node '{node.get('name')}' (type={node.get('blueprint_type_id')}) "
                f"has a UUID as icon_id: {icon_id}"
            )


def test_load_graph_icon_ids_are_not_uuids(client):
    """After loading a graph with legacy type strings, icon_ids should resolve
    to human-readable names, not UUIDs."""
    # Create session
    session_resp = client.post('/api/v1/sessions')
    assert session_resp.status_code == 201
    session_id = session_resp.get_json()['session_id']

    graph_payload = {
        'template_id': 'project_talus',
        'template_version': '0.2.1',
        'graph': {
            'nodes': [
                {
                    'id': 'root-001',
                    'type': 'project_root',
                    'name': 'Project',
                    'properties': {'name': 'Project'},
                },
                {
                    'id': 'ep-001',
                    'type': 'episode',
                    'name': 'Episode One',
                    'properties': {
                        'name': 'Episode One',
                        'status': 'Not Started',
                    },
                },
                {
                    'id': 'task-001',
                    'type': 'task',
                    'name': 'Task A',
                    'properties': {
                        'name': 'Task A',
                        'status': 'Not Started',
                    },
                },
            ],
            'edges': [
                {'source': 'root-001', 'target': 'ep-001'},
                {'source': 'ep-001', 'target': 'task-001'},
            ],
        },
    }

    try:
        load_resp = client.post(
            f'/api/v1/sessions/{session_id}/load-graph',
            data=json.dumps(graph_payload),
            content_type='application/json',
        )
        assert load_resp.status_code == 200
        data = load_resp.get_json()
        graph = data.get('graph', {})
        nodes = _collect_nodes(graph)

        assert len(nodes) >= 3, f"Expected 3+ nodes, got {len(nodes)}"

        icon_ids_found = 0
        for node in nodes:
            icon_id = node.get('icon_id')
            if icon_id is not None:
                icon_ids_found += 1
                assert not UUID_RE.match(icon_id), (
                    f"Node '{node.get('name')}' has a UUID as icon_id: {icon_id}"
                )

        assert icon_ids_found > 0, "Expected at least one node with a non-null icon_id"
    finally:
        api_routes._sessions.pop(session_id, None)
        api_routes._session_metadata.pop(session_id, None)


def test_load_graph_indicator_ids_are_not_uuids(client):
    """Nodes with status set should have indicator metadata with a human-readable
    indicator_id — never a raw UUID."""
    session_resp = client.post('/api/v1/sessions')
    assert session_resp.status_code == 201
    session_id = session_resp.get_json()['session_id']

    # First create a project to get real status option UUIDs
    proj_resp = client.post("/api/v1/projects", json={
        "template_id": "project_talus", "project_name": "Indicator Check"
    })
    assert proj_resp.status_code == 201
    proj_data = proj_resp.get_json()

    # Extract the first status option UUID from the schema
    schema_resp = client.get("/api/v1/templates/project_talus/schema")
    assert schema_resp.status_code == 200
    schema = schema_resp.get_json()

    # Find a node type with a status property with options
    status_option_uuid = None
    expected_indicator_id = None
    for nt in schema.get('node_types', []):
        for prop in nt.get('properties', []):
            if prop.get('id') == 'status' and prop.get('options'):
                for opt in prop['options']:
                    if opt.get('id') and opt.get('indicator_id'):
                        status_option_uuid = opt['id']
                        expected_indicator_id = opt['indicator_id']
                        break
            if status_option_uuid:
                break
        if status_option_uuid:
            break

    if not status_option_uuid:
        pytest.skip("No status options with indicator_id found in project_talus template")

    graph_payload = {
        'template_id': 'project_talus',
        'template_version': '0.2.1',
        'graph': {
            'nodes': [
                {
                    'id': 'root-001',
                    'type': 'project_root',
                    'name': 'Project',
                    'properties': {'name': 'Project'},
                },
                {
                    'id': 'task-001',
                    'type': 'task',
                    'name': 'Task With Status',
                    'properties': {
                        'name': 'Task With Status',
                        'status': status_option_uuid,
                    },
                },
            ],
            'edges': [
                {'source': 'root-001', 'target': 'task-001'},
            ],
        },
    }

    try:
        load_resp = client.post(
            f'/api/v1/sessions/{session_id}/load-graph',
            data=json.dumps(graph_payload),
            content_type='application/json',
        )
        assert load_resp.status_code == 200
        data = load_resp.get_json()
        graph = data.get('graph', {})
        nodes = _collect_nodes(graph)

        task_node = next((n for n in nodes if n.get('name') == 'Task With Status'), None)
        assert task_node is not None, "Could not find 'Task With Status' in graph"

        indicator_id = task_node.get('indicator_id')
        indicator_set = task_node.get('indicator_set')

        # indicator_id should be a friendly name, not a UUID
        if indicator_id is not None:
            assert not UUID_RE.match(indicator_id), (
                f"indicator_id is a UUID: {indicator_id}"
            )
            assert indicator_set is not None, "indicator_set should be set when indicator_id is"
    finally:
        api_routes._sessions.pop(session_id, None)
        api_routes._session_metadata.pop(session_id, None)


def test_schema_node_types_have_icon_field(client):
    """Schema endpoint should include icon field on node types that define one."""
    resp = client.get("/api/v1/templates/project_talus/schema")
    assert resp.status_code == 200
    data = resp.get_json()

    icon_count = 0
    for nt in data.get('node_types', []):
        icon = nt.get('icon')
        if icon:
            icon_count += 1
            assert not UUID_RE.match(icon), (
                f"Node type '{nt.get('name')}' has a UUID as icon: {icon}"
            )

    assert icon_count > 0, "Expected at least one node type with an icon defined"
