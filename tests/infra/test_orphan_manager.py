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
