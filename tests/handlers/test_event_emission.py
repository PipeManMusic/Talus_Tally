"""
Tests for event emission integration in command handlers and dispatcher.

Verifies that events are properly emitted when commands execute, undo, and redo.
"""

import pytest
import uuid
from backend.core.graph import ProjectGraph
from backend.handlers.dispatcher import CommandDispatcher
from backend.handlers.commands.node_commands import (
    CreateNodeCommand,
    DeleteNodeCommand,
    LinkNodeCommand,
    UpdatePropertyCommand
)
from backend.api.broadcaster import subscribe, unsubscribe


class TestCommandEventEmission:
    """Test that commands emit events when executed."""
    
    def test_create_node_emits_event(self):
        """Test CreateNodeCommand emits node-created event."""
        graph = ProjectGraph()
        session_id = str(uuid.uuid4())
        dispatcher = CommandDispatcher(graph, session_id=session_id)
        
        events_received = []
        
        def callback(data):
            events_received.append(data)
        
        subscribe('node-created', callback)
        
        try:
            # Execute create command
            cmd = CreateNodeCommand(
                blueprint_type_id='task',
                name='Test Task',
                session_id=session_id,
                parent_id=None
            )
            node_id = dispatcher.execute(cmd)
            
            # Verify event was emitted
            assert len(events_received) == 1
            event = events_received[0]
            assert event['session_id'] == session_id
            assert event['node_id'] == str(node_id)
            assert event['blueprint_type_id'] == 'task'
            assert event['name'] == 'Test Task'
            
        finally:
            unsubscribe('node-created', callback)
    
    def test_delete_node_emits_event(self):
        """Test DeleteNodeCommand emits node-deleted event."""
        graph = ProjectGraph()
        session_id = str(uuid.uuid4())
        dispatcher = CommandDispatcher(graph, session_id=session_id)
        
        # Create a node first
        cmd = CreateNodeCommand(
            blueprint_type_id='task',
            name='Task to Delete',
            session_id=session_id
        )
        node_id = dispatcher.execute(cmd)
        
        events_received = []
        
        def callback(data):
            events_received.append(data)
        
        subscribe('node-deleted', callback)
        
        try:
            # Execute delete command
            delete_cmd = DeleteNodeCommand(node_id, session_id=session_id)
            dispatcher.execute(delete_cmd)
            
            # Verify event was emitted
            assert len(events_received) == 1
            event = events_received[0]
            assert event['session_id'] == session_id
            assert event['node_id'] == str(node_id)
            
        finally:
            unsubscribe('node-deleted', callback)
    
    def test_link_node_emits_event(self):
        """Test LinkNodeCommand emits node-linked event."""
        graph = ProjectGraph()
        session_id = str(uuid.uuid4())
        dispatcher = CommandDispatcher(graph, session_id=session_id)
        
        # Create parent and child nodes
        parent_cmd = CreateNodeCommand(
            blueprint_type_id='project',
            name='Parent',
            session_id=session_id
        )
        parent_id = dispatcher.execute(parent_cmd)
        
        child_cmd = CreateNodeCommand(
            blueprint_type_id='task',
            name='Child',
            session_id=session_id
        )
        child_id = dispatcher.execute(child_cmd)
        
        events_received = []
        
        def callback(data):
            events_received.append(data)
        
        subscribe('node-linked', callback)
        
        try:
            # Execute link command
            link_cmd = LinkNodeCommand(parent_id, child_id, session_id=session_id)
            dispatcher.execute(link_cmd)
            
            # Verify event was emitted
            assert len(events_received) == 1
            event = events_received[0]
            assert event['session_id'] == session_id
            assert event['parent_id'] == str(parent_id)
            assert event['child_id'] == str(child_id)
            
        finally:
            unsubscribe('node-linked', callback)
    
    def test_update_property_emits_event(self):
        """Test UpdatePropertyCommand emits property-changed event."""
        graph = ProjectGraph()
        session_id = str(uuid.uuid4())
        dispatcher = CommandDispatcher(graph, session_id=session_id)
        
        # Create a node
        cmd = CreateNodeCommand(
            blueprint_type_id='task',
            name='Test Task',
            session_id=session_id
        )
        node_id = dispatcher.execute(cmd)
        
        events_received = []
        
        def callback(data):
            events_received.append(data)
        
        subscribe('property-changed', callback)
        
        try:
            # Execute update property command
            update_cmd = UpdatePropertyCommand(
                node_id=node_id,
                property_id='status',
                old_value=None,
                new_value='in-progress',
                session_id=session_id
            )
            dispatcher.execute(update_cmd)
            
            # Verify event was emitted
            assert len(events_received) == 1
            event = events_received[0]
            assert event['session_id'] == session_id
            assert event['node_id'] == str(node_id)
            assert event['property_name'] == 'status'
            assert event['old_value'] is None
            assert event['new_value'] == 'in-progress'
            
        finally:
            unsubscribe('property-changed', callback)


class TestDispatcherEventEmission:
    """Test that dispatcher emits command lifecycle events."""
    
    def test_dispatcher_emits_command_executing(self):
        """Test dispatcher emits command-executing event."""
        graph = ProjectGraph()
        session_id = str(uuid.uuid4())
        dispatcher = CommandDispatcher(graph, session_id=session_id)
        
        events_received = []
        
        def callback(data):
            events_received.append(data)
        
        subscribe('command-executing', callback)
        
        try:
            # Execute a command
            cmd = CreateNodeCommand(
                blueprint_type_id='task',
                name='Test',
                session_id=session_id
            )
            dispatcher.execute(cmd)
            
            # Verify command-executing event was emitted
            assert len(events_received) == 1
            event = events_received[0]
            assert event['session_id'] == session_id
            assert event['command_type'] == 'CreateNodeCommand'
            assert 'command_id' in event
            
        finally:
            unsubscribe('command-executing', callback)
    
    def test_dispatcher_emits_command_executed_success(self):
        """Test dispatcher emits command-executed event on success."""
        graph = ProjectGraph()
        session_id = str(uuid.uuid4())
        dispatcher = CommandDispatcher(graph, session_id=session_id)
        
        events_received = []
        
        def callback(data):
            events_received.append(data)
        
        subscribe('command-executed', callback)
        
        try:
            # Execute a command
            cmd = CreateNodeCommand(
                blueprint_type_id='task',
                name='Test',
                session_id=session_id
            )
            dispatcher.execute(cmd)
            
            # Verify command-executed event was emitted
            assert len(events_received) == 1
            event = events_received[0]
            assert event['session_id'] == session_id
            assert event['success'] is True
            assert event['error'] is None
            assert 'command_id' in event
            
        finally:
            unsubscribe('command-executed', callback)
    
    def test_dispatcher_emits_command_executed_failure(self):
        """Test dispatcher emits command-executed event on failure."""
        graph = ProjectGraph()
        session_id = str(uuid.uuid4())
        dispatcher = CommandDispatcher(graph, session_id=session_id)
        
        events_received = []
        
        def callback(data):
            events_received.append(data)
        
        subscribe('command-executed', callback)
        
        try:
            # Create a command that will fail (delete non-existent node)
            cmd = DeleteNodeCommand(uuid.uuid4(), session_id=session_id)
            
            # This should emit failure event
            try:
                dispatcher.execute(cmd)
            except:
                pass
            
            # Verify command-executed event was emitted with error
            # Note: current implementation doesn't fail on missing nodes
            # This is more of a placeholder for future error handling
            
        finally:
            unsubscribe('command-executed', callback)
    
    def test_dispatcher_emits_undo_event(self):
        """Test dispatcher emits undo event."""
        graph = ProjectGraph()
        session_id = str(uuid.uuid4())
        dispatcher = CommandDispatcher(graph, session_id=session_id)
        
        # Execute a command
        cmd = CreateNodeCommand(
            blueprint_type_id='task',
            name='Test',
            session_id=session_id
        )
        dispatcher.execute(cmd)
        
        events_received = []
        
        def callback(data):
            events_received.append(data)
        
        subscribe('undo', callback)
        
        try:
            # Undo the command
            dispatcher.undo()
            
            # Verify undo event was emitted
            assert len(events_received) == 1
            event = events_received[0]
            assert event['session_id'] == session_id
            assert 'command_id' in event
            
        finally:
            unsubscribe('undo', callback)
    
    def test_dispatcher_emits_redo_event(self):
        """Test dispatcher emits redo event."""
        graph = ProjectGraph()
        session_id = str(uuid.uuid4())
        dispatcher = CommandDispatcher(graph, session_id=session_id)
        
        # Execute and undo a command
        cmd = CreateNodeCommand(
            blueprint_type_id='task',
            name='Test',
            session_id=session_id
        )
        dispatcher.execute(cmd)
        dispatcher.undo()
        
        events_received = []
        
        def callback(data):
            events_received.append(data)
        
        subscribe('redo', callback)
        
        try:
            # Redo the command
            dispatcher.redo()
            
            # Verify redo event was emitted
            assert len(events_received) == 1
            event = events_received[0]
            assert event['session_id'] == session_id
            assert 'command_id' in event
            
        finally:
            unsubscribe('redo', callback)


class TestUndoRedoEventEmission:
    """Test that undo/redo emit appropriate events."""
    
    def test_undo_link_emits_node_unlinked(self):
        """Test undoing a link emits node-unlinked event."""
        graph = ProjectGraph()
        session_id = str(uuid.uuid4())
        dispatcher = CommandDispatcher(graph, session_id=session_id)
        
        # Create parent and child
        parent_id = dispatcher.execute(CreateNodeCommand('project', 'Parent', session_id=session_id))
        child_id = dispatcher.execute(CreateNodeCommand('task', 'Child', session_id=session_id))
        
        # Link them
        link_cmd = LinkNodeCommand(parent_id, child_id, session_id=session_id)
        dispatcher.execute(link_cmd)
        
        events_received = []
        
        def callback(data):
            events_received.append(data)
        
        subscribe('node-unlinked', callback)
        
        try:
            # Undo the link
            dispatcher.undo()
            
            # Verify node-unlinked event was emitted
            assert len(events_received) == 1
            event = events_received[0]
            assert event['session_id'] == session_id
            assert event['parent_id'] == str(parent_id)
            assert event['child_id'] == str(child_id)
            
        finally:
            unsubscribe('node-unlinked', callback)


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
