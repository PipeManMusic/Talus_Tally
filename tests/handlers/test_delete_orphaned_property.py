"""
Tests for DeleteOrphanedPropertyCommand
"""
import pytest
from uuid import uuid4
from unittest.mock import MagicMock

from backend.handlers.commands.node_commands import DeleteOrphanedPropertyCommand


class FakeNode:
    """Minimal node stub for testing."""
    def __init__(self, node_id, properties=None, metadata=None):
        self.id = node_id
        self.properties = properties or {}
        self.metadata = metadata or {}


class FakeGraph:
    """Minimal graph stub with get_node."""
    def __init__(self, nodes=None):
        self._nodes = {n.id: n for n in (nodes or [])}

    def get_node(self, node_id):
        return self._nodes.get(node_id)


class TestDeleteOrphanedPropertyCommand:
    """Tests for DeleteOrphanedPropertyCommand."""

    def test_removes_orphaned_property_from_metadata(self):
        node_id = uuid4()
        node = FakeNode(node_id, metadata={
            'orphaned_properties': {'old_field': 'stale_value'}
        })
        graph = FakeGraph([node])

        cmd = DeleteOrphanedPropertyCommand(
            node_id=node_id,
            property_key='old_field',
            graph=graph,
        )
        cmd.execute()

        assert 'old_field' not in node.metadata['orphaned_properties']

    def test_removes_from_properties_dict_too(self):
        node_id = uuid4()
        node = FakeNode(
            node_id,
            properties={'old_field': 'stale_value', 'name': 'keep'},
            metadata={'orphaned_properties': {'old_field': 'stale_value'}},
        )
        graph = FakeGraph([node])

        cmd = DeleteOrphanedPropertyCommand(
            node_id=node_id,
            property_key='old_field',
            graph=graph,
        )
        cmd.execute()

        assert 'old_field' not in node.properties
        assert node.properties['name'] == 'keep'

    def test_captures_old_value_for_undo(self):
        node_id = uuid4()
        node = FakeNode(node_id, metadata={
            'orphaned_properties': {'cost': 42}
        })
        graph = FakeGraph([node])

        cmd = DeleteOrphanedPropertyCommand(
            node_id=node_id,
            property_key='cost',
            graph=graph,
        )
        cmd.execute()

        assert cmd.old_value == 42

    def test_undo_restores_orphaned_property(self):
        node_id = uuid4()
        node = FakeNode(node_id, metadata={
            'orphaned_properties': {'cost': 42}
        })
        graph = FakeGraph([node])

        cmd = DeleteOrphanedPropertyCommand(
            node_id=node_id,
            property_key='cost',
            graph=graph,
        )
        cmd.execute()
        assert 'cost' not in node.metadata['orphaned_properties']

        cmd.undo()
        assert node.metadata['orphaned_properties']['cost'] == 42

    def test_noop_when_key_not_found(self):
        node_id = uuid4()
        node = FakeNode(node_id, metadata={
            'orphaned_properties': {'other': 'val'}
        })
        graph = FakeGraph([node])

        cmd = DeleteOrphanedPropertyCommand(
            node_id=node_id,
            property_key='nonexistent',
            graph=graph,
        )
        cmd.execute()

        assert cmd.old_value is None
        assert node.metadata['orphaned_properties'] == {'other': 'val'}

    def test_noop_when_node_not_found(self):
        graph = FakeGraph([])

        cmd = DeleteOrphanedPropertyCommand(
            node_id=uuid4(),
            property_key='anything',
            graph=graph,
        )
        cmd.execute()  # Should not raise

    def test_noop_when_no_graph(self):
        cmd = DeleteOrphanedPropertyCommand(
            node_id=uuid4(),
            property_key='anything',
        )
        cmd.execute()  # Should not raise
