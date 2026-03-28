import pytest
from backend.api.routes import get_indicator_metadata
from types import SimpleNamespace

@pytest.fixture
def mock_blueprint():
    # Simulate a blueprint with node_types and status options
    NodeType = SimpleNamespace
    status_options = [
        {'id': 'uuid-filled', 'name': 'Filled', 'indicator_id': 'filled'},
        {'id': 'uuid-alert', 'name': 'Alert', 'indicator_id': 'alert'},
    ]
    node_type = NodeType(
        id='task',
        _extra_props={'properties': [
            {'id': 'status', 'options': status_options, 'indicator_set': 'status'}
        ]}
    )
    return SimpleNamespace(node_types=[node_type])

@pytest.fixture
def mock_node():
    # Simulate a node with a status property set to the UUID for 'alert'
    return SimpleNamespace(
        id='n1',
        blueprint_type_id='task',
        name='Test Node',
        properties={'status': 'uuid-alert'},
        children=[]
    )

def test_indicator_metadata_serialization(mock_node, mock_blueprint):
    meta = get_indicator_metadata(mock_node, mock_blueprint)
    assert meta['indicator_id'] == 'alert', 'Should map status UUID to indicator_id string "alert"'
    assert meta['indicator_set'] == 'status', 'Should set indicator_set to "status"'
    assert meta['bullet'] == '•' or meta['bullet'] is not None


# ---------------------------------------------------------------------------
# Regression tests: indicators with UUID-keyed properties
# ---------------------------------------------------------------------------


def test_indicator_resolves_with_uuid_keyed_property():
    """Indicator must resolve when the status property is stored under a UUID key
    and the blueprint uses ``uuid`` on the property definition.

    Regression: when properties were orphaned (empty ``properties: {}``),
    ``get_indicator_metadata`` returned None because it couldn't find the value.
    """
    status_prop_uuid = 'aaaa-0000-0000-0000-000000000002'
    option_done_uuid = 'dddd-0000-0000-0000-000000000003'

    node_type = SimpleNamespace(
        id='feature',
        _extra_props={
            'properties': [
                {
                    'id': 'status',
                    'uuid': status_prop_uuid,
                    'indicator_set': 'status',
                    'options': [
                        {'id': 'opt-todo', 'name': 'To Do', 'indicator_id': 'empty'},
                        {'id': option_done_uuid, 'name': 'Done', 'indicator_id': 'filled'},
                    ],
                }
            ]
        },
    )
    blueprint = SimpleNamespace(node_types=[node_type])

    node = SimpleNamespace(
        id='n1',
        blueprint_type_id='feature',
        name='Test Feature',
        properties={status_prop_uuid: option_done_uuid},
        children=[],
    )

    meta = get_indicator_metadata(node, blueprint)
    assert meta is not None, 'Indicator should resolve with UUID-keyed property'
    assert meta['indicator_id'] == 'filled'
    assert meta['indicator_set'] == 'status'


def test_indicator_returns_none_when_property_empty():
    """Indicator must return None when properties dict has no status value.

    This documents the expected behaviour when properties are truly empty
    (no orphan restoration has run yet).
    """
    node_type = SimpleNamespace(
        id='feature',
        _extra_props={
            'properties': [
                {
                    'id': 'status',
                    'uuid': 'some-uuid',
                    'indicator_set': 'status',
                    'options': [
                        {'id': 'opt-todo', 'name': 'To Do', 'indicator_id': 'empty'},
                    ],
                }
            ]
        },
    )
    blueprint = SimpleNamespace(node_types=[node_type])

    node = SimpleNamespace(
        id='n1',
        blueprint_type_id='feature',
        name='Empty Node',
        properties={},
        children=[],
    )

    meta = get_indicator_metadata(node, blueprint)
    assert meta is None, 'No indicator when properties are empty'


def test_indicator_resolves_after_orphan_restoration():
    """End-to-end: orphaned status property is restored, then indicator resolves.

    Regression: properties were orphaned (properties: {}, status in
    orphaned_properties). After restoration, indicator_metadata must resolve.
    This is the exact scenario the user sees: "duplicate status property" where
    one is empty (in properties) and one orphaned (with actual data).
    """
    from backend.infra.orphan_manager import OrphanManager
    from backend.core.graph import ProjectGraph
    from backend.core.node import Node

    status_prop_uuid = 'aaaa-0000-0000-0000-000000000002'
    option_done_uuid = 'dddd-0000-0000-0000-000000000003'
    node_type_uuid = 'bbbb-0000-0000-0000-000000000001'

    # Step 1: Node with all properties orphaned (simulates the bug)
    graph = ProjectGraph(template_id='test', template_version='1.0')
    node = Node(blueprint_type_id=node_type_uuid, name='Bug Node')
    node.properties = {}
    node.metadata = {
        'orphaned_properties': {
            status_prop_uuid: option_done_uuid,
        }
    }
    graph.add_node(node)

    template = {
        'id': 'test',
        'node_types': [
            {
                'id': 'bug',
                'uuid': node_type_uuid,
                'properties': [
                    {
                        'id': 'status',
                        'uuid': status_prop_uuid,
                        'indicator_set': 'status',
                        'options': [
                            {'id': 'opt-todo', 'name': 'To Do', 'indicator_id': 'empty'},
                            {'id': option_done_uuid, 'name': 'Done', 'indicator_id': 'filled'},
                        ],
                    }
                ],
            }
        ],
    }

    # Step 2: Reconciliation restores orphaned property
    OrphanManager.reconcile_graph_with_template(graph, template)
    assert node.properties.get(status_prop_uuid) == option_done_uuid, \
        'Status property should be restored from orphaned_properties'

    # Step 3: Indicator now resolves
    blueprint_node_type = SimpleNamespace(
        id=node_type_uuid,
        _extra_props={
            'properties': template['node_types'][0]['properties'],
        },
    )
    blueprint = SimpleNamespace(node_types=[blueprint_node_type])

    sim_node = SimpleNamespace(
        id=str(node.id),
        blueprint_type_id=node_type_uuid,
        name='Bug Node',
        properties=node.properties,
        children=[],
    )
    meta = get_indicator_metadata(sim_node, blueprint)
    assert meta is not None, 'Indicator must resolve after orphan restoration'
    assert meta['indicator_id'] == 'filled'
    assert meta['indicator_set'] == 'status'
