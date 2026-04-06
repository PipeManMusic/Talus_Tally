"""
Tests for Orphan Manager functionality.
"""

import pytest
from backend.infra.orphan_manager import OrphanManager
from backend.core.graph import ProjectGraph
from backend.core.node import Node


def test_find_orphaned_node_types():
    """Test detecting removed node types."""
    old_template = {
        'id': 'test',
        'node_types': [
            {'id': 'scene', 'label': 'Scene'},
            {'id': 'action', 'label': 'Action'},
            {'id': 'speech', 'label': 'Speech'},
        ]
    }
    
    new_template = {
        'id': 'test',
        'node_types': [
            {'id': 'scene', 'label': 'Scene'},
            {'id': 'speech', 'label': 'Speech'},
        ]
    }
    
    removed = OrphanManager.find_orphaned_node_types(old_template, new_template)
    
    assert removed == {'action'}


def test_mark_orphaned_nodes():
    """Test marking nodes as orphaned in a graph."""
    graph = {
        'nodes': {
            'node1': {'type': 'scene', 'label': 'Scene 1'},
            'node2': {'type': 'action', 'label': 'Action 1'},
            'node3': {'type': 'speech', 'label': 'Speech 1'},
            'node4': {'type': 'action', 'label': 'Action 2'},
        }
    }
    
    orphaned_types = {'action'}
    
    result = OrphanManager.mark_orphaned_nodes(graph, orphaned_types)
    
    assert result['affected_count'] == 2
    assert 'node2' in result['orphaned_node_ids']
    assert 'node4' in result['orphaned_node_ids']
    
    # Check that nodes are marked
    assert graph['nodes']['node2']['metadata']['orphaned'] is True
    assert graph['nodes']['node4']['metadata']['orphaned'] is True
    assert 'orphaned' not in graph['nodes'].get('node1', {}).get('metadata', {})
    assert 'orphaned' not in graph['nodes'].get('node3', {}).get('metadata', {})


def test_get_orphaned_nodes():
    """Test retrieving orphaned nodes from graph."""
    graph = {
        'nodes': {
            'node1': {
                'type': 'scene',
                'label': 'Scene 1',
                'metadata': {}
            },
            'node2': {
                'type': 'action',
                'label': 'Action 1',
                'metadata': {
                    'orphaned': True,
                    'orphaned_reason': 'Node type removed'
                },
                'properties': {'description': 'Test'}
            },
            'node3': {
                'type': 'speech',
                'label': 'Speech 1',
                'metadata': {}
            },
        }
    }
    
    orphaned = OrphanManager.get_orphaned_nodes(graph)
    
    assert len(orphaned) == 1
    assert orphaned[0]['id'] == 'node2'
    assert orphaned[0]['label'] == 'Action 1'
    assert orphaned[0]['metadata']['orphaned'] is True


def test_can_add_child():
    """Test checking if node can have children."""
    normal_node = {'metadata': {}}
    orphaned_node = {'metadata': {'orphaned': True}}
    
    assert OrphanManager.can_add_child(normal_node) is True
    assert OrphanManager.can_add_child(orphaned_node) is False


def test_can_change_type():
    """Test checking if node type can be changed."""
    normal_node = {'metadata': {}}
    orphaned_node = {'metadata': {'orphaned': True}}
    
    assert OrphanManager.can_change_type(normal_node) is True
    assert OrphanManager.can_change_type(orphaned_node) is False


def test_no_orphaned_types():
    """Test when no node types are removed."""
    old_template = {
        'id': 'test',
        'node_types': [
            {'id': 'scene', 'label': 'Scene'},
        ]
    }
    
    new_template = {
        'id': 'test',
        'node_types': [
            {'id': 'scene', 'label': 'Scene'},
            {'id': 'action', 'label': 'Action'},  # Added, not removed
        ]
    }
    
    removed = OrphanManager.find_orphaned_node_types(old_template, new_template)
    
    assert len(removed) == 0


def test_empty_graph():
    """Test marking orphaned nodes in empty graph."""
    graph = {'nodes': {}}
    orphaned_types = {'action'}
    
    result = OrphanManager.mark_orphaned_nodes(graph, orphaned_types)
    
    assert result['affected_count'] == 0
    assert len(result['orphaned_node_ids']) == 0


def test_find_orphaned_properties():
    """Test detecting removed properties from node types."""
    old_template = {
        'id': 'test',
        'node_types': [
            {
                'id': 'scene',
                'label': 'Scene',
                'properties': [
                    {'key': 'name', 'label': 'Name', 'type': 'text'},
                    {'key': 'description', 'label': 'Description', 'type': 'textarea'},
                    {'key': 'location', 'label': 'Location', 'type': 'text'},
                ]
            },
            {
                'id': 'action',
                'label': 'Action',
                'properties': [
                    {'key': 'name', 'label': 'Name', 'type': 'text'},
                    {'key': 'urgency', 'label': 'Urgency', 'type': 'select'},
                ]
            }
        ]
    }
    
    new_template = {
        'id': 'test',
        'node_types': [
            {
                'id': 'scene',
                'label': 'Scene',
                'properties': [
                    {'key': 'name', 'label': 'Name', 'type': 'text'},
                    {'key': 'description', 'label': 'Description', 'type': 'textarea'},
                    # location removed
                ]
            },
            {
                'id': 'action',
                'label': 'Action',
                'properties': [
                    {'key': 'name', 'label': 'Name', 'type': 'text'},
                    # urgency removed
                ]
            }
        ]
    }
    
    orphaned_props = OrphanManager.find_orphaned_properties(old_template, new_template)
    
    assert 'scene' in orphaned_props
    assert 'location' in orphaned_props['scene']
    assert 'action' in orphaned_props
    assert 'urgency' in orphaned_props['action']


def test_mark_orphaned_properties():
    """Test marking property values as orphaned in nodes."""
    graph = {
        'nodes': [
            {
                'id': 'node1',
                'type': 'scene',
                'properties': {
                    'name': 'Scene 1',
                    'description': 'Test scene',
                    'location': 'Paris'
                }
            },
            {
                'id': 'node2',
                'type': 'action',
                'properties': {
                    'name': 'Jump',
                    'urgency': 'high'
                }
            },
            {
                'id': 'node3',
                'type': 'scene',
                'properties': {
                    'name': 'Scene 2',
                    'description': 'Another scene'
                    # No location property
                }
            }
        ]
    }
    
    orphaned_props_by_type = {
        'scene': {'location'},
        'action': {'urgency'}
    }
    
    count = OrphanManager.mark_orphaned_properties(graph, orphaned_props_by_type)
    
    # Should mark 2 properties as orphaned (node1.location and node2.urgency)
    assert count == 2
    
    # Check node1 has orphaned location
    assert 'metadata' in graph['nodes'][0]
    assert 'orphaned_properties' in graph['nodes'][0]['metadata']
    assert 'location' in graph['nodes'][0]['metadata']['orphaned_properties']
    assert graph['nodes'][0]['metadata']['orphaned_properties']['location'] == 'Paris'
    
    # Check node2 has orphaned urgency
    assert 'metadata' in graph['nodes'][1]
    assert 'orphaned_properties' in graph['nodes'][1]['metadata']
    assert 'urgency' in graph['nodes'][1]['metadata']['orphaned_properties']
    assert graph['nodes'][1]['metadata']['orphaned_properties']['urgency'] == 'high'
    
    # Check node3 has no orphaned properties (didn't have location property)
    if 'metadata' in graph['nodes'][2]:
        assert 'orphaned_properties' not in graph['nodes'][2]['metadata'] or \
               len(graph['nodes'][2]['metadata'].get('orphaned_properties', {})) == 0


def test_get_orphaned_properties():
    """Test retrieving orphaned properties from a node."""
    node = {
        'id': 'node1',
        'type': 'scene',
        'properties': {
            'name': 'Scene 1',
        },
        'metadata': {
            'orphaned_properties': {
                'location': 'Paris',
                'mood': 'dark'
            }
        }
    }
    
    orphaned = OrphanManager.get_orphaned_properties(node)
    
    assert orphaned == {'location': 'Paris', 'mood': 'dark'}


def test_get_orphaned_properties_empty():
    """Test retrieving orphaned properties from node without any."""
    node = {
        'id': 'node1',
        'type': 'scene',
        'properties': {
            'name': 'Scene 1',
        }
    }
    
    orphaned = OrphanManager.get_orphaned_properties(node)
    
    assert orphaned == {}


def test_reconcile_graph_with_template_marks_orphaned_nodes_and_properties():
    """Existing project data should be reconciled against the current template on load."""
    graph = ProjectGraph(template_id='test_template', template_version='1.0.0')

    scene_node = Node(blueprint_type_id='scene', name='Scene 1')
    scene_node.properties = {
        'name': 'Scene 1',
        'description': 'Kept',
        'legacy_field': 'stale value',
    }
    graph.add_node(scene_node)

    removed_type_node = Node(blueprint_type_id='person', name='Person 1')
    removed_type_node.properties = {'name': 'Person 1'}
    graph.add_node(removed_type_node)

    template = {
        'id': 'test_template',
        'node_types': [
            {
                'id': 'scene',
                'properties': [
                    {'id': 'name'},
                    {'id': 'description'},
                ],
            }
        ],
    }

    result = OrphanManager.reconcile_graph_with_template(graph, template)

    assert result['affected_nodes'] == 1
    assert str(removed_type_node.id) in result['orphaned_node_ids']
    assert result['affected_properties'] == 1
    assert result['mismatch_count'] == 0

    assert removed_type_node.metadata.get('orphaned') is True
    assert 'not found in current template' in removed_type_node.metadata.get('orphaned_reason', '')

    assert scene_node.metadata.get('orphaned') is not True
    assert scene_node.metadata['orphaned_properties']['legacy_field'] == 'stale value'


def test_reconcile_graph_with_template_accepts_property_key_definitions():
    """Template properties may be defined with key instead of id and should not be orphaned."""
    graph = ProjectGraph(template_id='test_template', template_version='1.0.0')

    scene_node = Node(blueprint_type_id='scene', name='Scene 1')
    scene_node.properties = {
        'name': 'Scene 1',
        'description': 'Kept',
    }
    graph.add_node(scene_node)

    template = {
        'id': 'test_template',
        'node_types': [
            {
                'id': 'scene',
                'properties': [
                    {'key': 'name'},
                    {'key': 'description'},
                ],
            }
        ],
    }

    result = OrphanManager.reconcile_graph_with_template(graph, template)

    assert result['affected_nodes'] == 0
    assert result['affected_properties'] == 0
    assert result['mismatch_count'] == 0
    assert 'orphaned_properties' not in scene_node.metadata


def test_reconcile_graph_with_template_surfaces_property_mismatch_candidates():
    """Reconcile should suggest likely renamed properties when data/template drift is detected."""
    graph = ProjectGraph(template_id='test_template', template_version='1.0.0')

    episode_node = Node(blueprint_type_id='episode', name='Episode 1')
    episode_node.properties = {
        'name': 'Episode 1',
        'manual_allocations': {
            '2026-04-13': {'person-1': 8},
        },
    }
    graph.add_node(episode_node)

    template = {
        'id': 'test_template',
        'node_types': [
            {
                'id': 'episode',
                'properties': [
                    {'id': 'name'},
                    {'id': 'allocations'},
                ],
            }
        ],
    }

    result = OrphanManager.reconcile_graph_with_template(graph, template)

    assert result['affected_nodes'] == 0
    assert result['affected_properties'] == 1
    assert result['mismatch_count'] == 1
    assert len(result['mismatch_candidates']) == 1

    candidate = result['mismatch_candidates'][0]
    assert candidate['node_id'] == str(episode_node.id)
    assert candidate['node_type'] == 'episode'
    assert candidate['legacy_property'] == 'manual_allocations'
    assert candidate['suggested_property'] == 'allocations'

    hints = episode_node.metadata.get('property_mismatch_hints', {})
    assert 'manual_allocations' in hints
    assert hints['manual_allocations']['suggested_property'] == 'allocations'


# ---------------------------------------------------------------------------
# Regression tests: UUID-keyed properties must not be orphaned
# ---------------------------------------------------------------------------


def test_uuid_keyed_properties_are_not_orphaned():
    """Properties stored with UUID keys must match template properties with uuid field.

    Regression: after the property UUID migration, node properties are keyed by
    deterministic UUIDs.  The reconciliation must recognise those UUIDs via the
    template's ``uuid`` field and NOT move them to orphaned_properties.
    """
    graph = ProjectGraph(template_id='test_template', template_version='1.0.0')

    name_uuid = 'aaaa1111-0000-0000-0000-000000000001'
    status_uuid = 'aaaa1111-0000-0000-0000-000000000002'
    node_type_uuid = 'bbbb2222-0000-0000-0000-000000000001'

    node = Node(blueprint_type_id=node_type_uuid, name='My Node')
    node.properties = {
        name_uuid: 'My Node',
        status_uuid: 'some-option-uuid',
    }
    graph.add_node(node)

    template = {
        'id': 'test_template',
        'node_types': [
            {
                'id': 'feature',
                'uuid': node_type_uuid,
                'properties': [
                    {'id': 'name', 'uuid': name_uuid},
                    {'id': 'status', 'uuid': status_uuid},
                ],
            }
        ],
    }

    result = OrphanManager.reconcile_graph_with_template(graph, template)

    assert result['affected_properties'] == 0, (
        'UUID-keyed properties were incorrectly orphaned'
    )
    assert node.properties.get(name_uuid) == 'My Node'
    assert node.properties.get(status_uuid) == 'some-option-uuid'
    assert 'orphaned_properties' not in node.metadata


def test_previously_orphaned_properties_are_restored():
    """If a property was previously orphaned but its UUID is now in allowed_props,
    the reconciliation must MOVE it back to properties.

    Regression: the old code removed the key from orphaned_properties but never
    put the value back in ``properties``, causing data loss.
    """
    graph = ProjectGraph(template_id='test_template', template_version='1.0.0')

    name_uuid = 'aaaa1111-0000-0000-0000-000000000001'
    status_uuid = 'aaaa1111-0000-0000-0000-000000000002'
    hours_uuid = 'aaaa1111-0000-0000-0000-000000000003'
    node_type_uuid = 'bbbb2222-0000-0000-0000-000000000001'

    # Simulate a node that was saved with properties in orphaned_properties
    node = Node(blueprint_type_id=node_type_uuid, name='Orphaned Node')
    node.properties = {}  # Empty — all data was moved to orphaned_properties
    node.metadata = {
        'orphaned_properties': {
            name_uuid: 'Orphaned Node',
            status_uuid: 'some-option-uuid',
            hours_uuid: '5',
        }
    }
    graph.add_node(node)

    template = {
        'id': 'test_template',
        'node_types': [
            {
                'id': 'feature',
                'uuid': node_type_uuid,
                'properties': [
                    {'id': 'name', 'uuid': name_uuid},
                    {'id': 'status', 'uuid': status_uuid},
                    {'id': 'estimated_hours', 'uuid': hours_uuid},
                ],
            }
        ],
    }

    result = OrphanManager.reconcile_graph_with_template(graph, template)

    # All three properties should be restored to properties
    assert node.properties[name_uuid] == 'Orphaned Node'
    assert node.properties[status_uuid] == 'some-option-uuid'
    assert node.properties[hours_uuid] == '5'

    # orphaned_properties should be cleared
    assert 'orphaned_properties' not in node.metadata or \
        len(node.metadata.get('orphaned_properties', {})) == 0


def test_partial_orphan_restoration():
    """Only properties whose UUIDs are in the template should be restored;
    genuinely orphaned properties must stay in orphaned_properties."""
    graph = ProjectGraph(template_id='test_template', template_version='1.0.0')

    name_uuid = 'aaaa1111-0000-0000-0000-000000000001'
    status_uuid = 'aaaa1111-0000-0000-0000-000000000002'
    removed_uuid = 'cccc3333-0000-0000-0000-000000000099'
    node_type_uuid = 'bbbb2222-0000-0000-0000-000000000001'

    node = Node(blueprint_type_id=node_type_uuid, name='Mixed Node')
    node.properties = {}
    node.metadata = {
        'orphaned_properties': {
            name_uuid: 'Mixed Node',
            status_uuid: 'option-uuid',
            removed_uuid: 'stale data',
        }
    }
    graph.add_node(node)

    template = {
        'id': 'test_template',
        'node_types': [
            {
                'id': 'feature',
                'uuid': node_type_uuid,
                'properties': [
                    {'id': 'name', 'uuid': name_uuid},
                    {'id': 'status', 'uuid': status_uuid},
                    # removed_uuid is NOT in the template
                ],
            }
        ],
    }

    OrphanManager.reconcile_graph_with_template(graph, template)

    # Valid properties should be restored
    assert node.properties[name_uuid] == 'Mixed Node'
    assert node.properties[status_uuid] == 'option-uuid'

    # Genuinely orphaned property stays orphaned
    assert node.metadata['orphaned_properties'][removed_uuid] == 'stale data'
    # Only the stale one should remain
    assert len(node.metadata['orphaned_properties']) == 1


def test_reconcile_does_not_duplicate_property_in_restore():
    """If a property already exists in properties AND in orphaned_properties,
    the restore should not overwrite the current value with the stale orphan."""
    graph = ProjectGraph(template_id='test_template', template_version='1.0.0')

    name_uuid = 'aaaa1111-0000-0000-0000-000000000001'
    node_type_uuid = 'bbbb2222-0000-0000-0000-000000000001'

    node = Node(blueprint_type_id=node_type_uuid, name='Current Name')
    node.properties = {name_uuid: 'Current Name'}
    node.metadata = {
        'orphaned_properties': {name_uuid: 'Stale Name'}
    }
    graph.add_node(node)

    template = {
        'id': 'test_template',
        'node_types': [
            {
                'id': 'feature',
                'uuid': node_type_uuid,
                'properties': [
                    {'id': 'name', 'uuid': name_uuid},
                ],
            }
        ],
    }

    OrphanManager.reconcile_graph_with_template(graph, template)

    # Current value is preserved, stale orphan discarded
    assert node.properties[name_uuid] == 'Current Name'
    assert 'orphaned_properties' not in node.metadata or \
        name_uuid not in node.metadata.get('orphaned_properties', {})


def test_reconcile_restores_legacy_keyed_orphans_under_uuid():
    """Orphaned properties stored under legacy string IDs (e.g. 'estimated_cost')
    should be restored under their canonical UUID key when the template defines
    a UUID for that property."""
    graph = ProjectGraph(template_id='test_template', template_version='1.0.0')

    node_type_uuid = 'bbbb2222-0000-0000-0000-000000000002'
    name_uuid = 'aaaa1111-0000-0000-0000-000000000001'
    cost_uuid = 'cccc3333-0000-0000-0000-000000000001'
    actual_uuid = 'cccc3333-0000-0000-0000-000000000002'

    node = Node(blueprint_type_id=node_type_uuid, name='Engine Bolts')
    node.properties = {name_uuid: 'Engine Bolts'}
    # Simulate properties that were orphaned under their legacy string IDs
    node.metadata = {
        'orphaned_properties': {
            'estimated_cost': 500,
            'actual_cost': 300,
        }
    }
    graph.add_node(node)

    template = {
        'id': 'test_template',
        'node_types': [
            {
                'id': 'part_asset',
                'uuid': node_type_uuid,
                'properties': [
                    {'id': 'name', 'uuid': name_uuid},
                    {'id': 'estimated_cost', 'uuid': cost_uuid},
                    {'id': 'actual_cost', 'uuid': actual_uuid},
                ],
            }
        ],
    }

    result = OrphanManager.reconcile_graph_with_template(graph, template)

    # Properties should be restored under their UUID keys
    assert node.properties[cost_uuid] == 500
    assert node.properties[actual_uuid] == 300
    # No orphaned properties should remain
    assert not node.metadata.get('orphaned_properties')
    assert result['affected_properties'] == 0


def test_reconcile_rekeys_active_legacy_properties_to_uuid():
    """Active properties stored under legacy IDs should be re-keyed to UUIDs."""
    graph = ProjectGraph(template_id='test_template', template_version='1.0.0')

    node_type_uuid = 'bbbb2222-0000-0000-0000-000000000003'
    name_uuid = 'aaaa1111-0000-0000-0000-000000000001'
    cost_uuid = 'cccc3333-0000-0000-0000-000000000003'

    node = Node(blueprint_type_id=node_type_uuid, name='Brake Pads')
    node.properties = {
        name_uuid: 'Brake Pads',
        'estimated_cost': 150,  # Legacy ID key
    }
    graph.add_node(node)

    template = {
        'id': 'test_template',
        'node_types': [
            {
                'id': 'part',
                'uuid': node_type_uuid,
                'properties': [
                    {'id': 'name', 'uuid': name_uuid},
                    {'id': 'estimated_cost', 'uuid': cost_uuid},
                ],
            }
        ],
    }

    OrphanManager.reconcile_graph_with_template(graph, template)

    # Property re-keyed from legacy ID to UUID
    assert node.properties[cost_uuid] == 150
    assert 'estimated_cost' not in node.properties
    assert not node.metadata.get('orphaned_properties')


# ---------------------------------------------------------------------------
# backfill_select_defaults
# ---------------------------------------------------------------------------

def test_backfill_select_defaults_fills_missing():
    """Nodes missing a select property value get the first option UUID."""
    graph = ProjectGraph()
    node = Node(blueprint_type_id="task", name="Backfill Me")
    node.properties = {}  # explicitly empty
    graph.add_node(node)

    template = {
        'node_types': [{
            'id': 'task',
            'properties': [{
                'id': 'status',
                'uuid': 'prop-status-uuid',
                'type': 'select',
                'options': [
                    {'name': 'To Do', 'id': 'opt-todo-uuid'},
                    {'name': 'Done', 'id': 'opt-done-uuid'},
                ],
            }],
        }],
    }

    count = OrphanManager.backfill_select_defaults(graph, template)
    assert count == 1
    assert node.properties['prop-status-uuid'] == 'opt-todo-uuid'


def test_backfill_select_defaults_preserves_existing():
    """If a node already has a value for a select property, do NOT overwrite."""
    graph = ProjectGraph()
    node = Node(blueprint_type_id="task", name="Already Set")
    node.properties = {'prop-status-uuid': 'opt-done-uuid'}
    graph.add_node(node)

    template = {
        'node_types': [{
            'id': 'task',
            'properties': [{
                'id': 'status',
                'uuid': 'prop-status-uuid',
                'type': 'select',
                'options': [
                    {'name': 'To Do', 'id': 'opt-todo-uuid'},
                    {'name': 'Done', 'id': 'opt-done-uuid'},
                ],
            }],
        }],
    }

    count = OrphanManager.backfill_select_defaults(graph, template)
    assert count == 0
    assert node.properties['prop-status-uuid'] == 'opt-done-uuid'


def test_backfill_select_defaults_skips_orphaned_nodes():
    """Orphaned nodes should NOT receive backfilled defaults."""
    graph = ProjectGraph()
    node = Node(blueprint_type_id="task", name="Orphaned")
    node.properties = {}
    node.metadata = {'orphaned': True}
    graph.add_node(node)

    template = {
        'node_types': [{
            'id': 'task',
            'properties': [{
                'id': 'status',
                'uuid': 'prop-status-uuid',
                'type': 'select',
                'options': [{'name': 'To Do', 'id': 'opt-todo-uuid'}],
            }],
        }],
    }

    count = OrphanManager.backfill_select_defaults(graph, template)
    assert count == 0
    assert 'prop-status-uuid' not in node.properties


def test_backfill_select_defaults_handles_multiple_selects():
    """Multiple select properties on one node type are all backfilled."""
    graph = ProjectGraph()
    node = Node(blueprint_type_id="widget", name="Multi")
    node.properties = {}
    graph.add_node(node)

    template = {
        'node_types': [{
            'id': 'widget',
            'properties': [
                {
                    'id': 'priority',
                    'uuid': 'prop-pri',
                    'type': 'select',
                    'options': [{'name': 'Low', 'id': 'o-low'}, {'name': 'High', 'id': 'o-high'}],
                },
                {
                    'id': 'color',
                    'uuid': 'prop-col',
                    'type': 'select',
                    'options': [{'name': 'Red', 'id': 'o-red'}],
                },
                {'id': 'desc', 'type': 'text'},
            ],
        }],
    }

    count = OrphanManager.backfill_select_defaults(graph, template)
    assert count == 2
    assert node.properties['prop-pri'] == 'o-low'
    assert node.properties['prop-col'] == 'o-red'
