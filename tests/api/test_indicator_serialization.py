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
