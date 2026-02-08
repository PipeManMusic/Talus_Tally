"""
Tests for Orphan Manager functionality.
"""

import pytest
from backend.infra.orphan_manager import OrphanManager


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
