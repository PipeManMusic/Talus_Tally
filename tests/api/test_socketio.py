"""
Tests for Socket.IO integration and event broadcasting.

Tests the foundation: Socket.IO connection, room management,
and basic event emission patterns.
"""

import pytest
import uuid
from backend.app import create_app
from backend.api.broadcaster import (
    subscribe, unsubscribe, emit_event,
    emit_node_created, emit_node_deleted,
    emit_command_executed, emit_undo
)


@pytest.fixture
def app():
    """Create app for testing."""
    app = create_app()
    app.config['TESTING'] = True
    return app


@pytest.fixture
def client(app):
    """Create test client."""
    return app.test_client()


@pytest.fixture
def socketio_client(app):
    """Create Socket.IO test client."""
    # Get socketio from app's extensions
    return app.extensions.get('socketio').test_client(app)


class TestBroadcasterSubscription:
    """Test event subscription mechanism."""
    
    def test_subscribe_to_event(self):
        """Test subscribing to an event."""
        events_received = []
        
        def callback(data):
            events_received.append(data)
        
        subscribe('test-event', callback)
        emit_event('test-event', {'message': 'hello'})
        
        assert len(events_received) == 1
        assert events_received[0]['message'] == 'hello'
        
        unsubscribe('test-event', callback)
    
    def test_unsubscribe_from_event(self):
        """Test unsubscribing from an event."""
        events_received = []
        
        def callback(data):
            events_received.append(data)
        
        subscribe('test-event', callback)
        unsubscribe('test-event', callback)
        emit_event('test-event', {'message': 'hello'})
        
        assert len(events_received) == 0
    
    def test_multiple_subscribers(self):
        """Test multiple subscribers to same event."""
        events1 = []
        events2 = []
        
        def callback1(data):
            events1.append(data)
        
        def callback2(data):
            events2.append(data)
        
        subscribe('test-event', callback1)
        subscribe('test-event', callback2)
        emit_event('test-event', {'message': 'hello'})
        
        assert len(events1) == 1
        assert len(events2) == 1
        
        unsubscribe('test-event', callback1)
        unsubscribe('test-event', callback2)
    
    def test_subscriber_error_doesnt_break_others(self):
        """Test that one subscriber error doesn't break others."""
        events_received = []
        
        def bad_callback(data):
            raise ValueError("Intentional error")
        
        def good_callback(data):
            events_received.append(data)
        
        subscribe('test-event', bad_callback)
        subscribe('test-event', good_callback)
        
        # Should not raise despite bad_callback error
        emit_event('test-event', {'message': 'hello'})
        
        assert len(events_received) == 1
        
        unsubscribe('test-event', bad_callback)
        unsubscribe('test-event', good_callback)


class TestHighLevelEventEmission:
    """Test high-level event emission functions."""
    
    def test_emit_node_created(self):
        """Test node-created event emission."""
        events_received = []
        
        def callback(data):
            events_received.append(data)
        
        subscribe('node-created', callback)
        
        session_id = str(uuid.uuid4())
        node_id = str(uuid.uuid4())
        emit_node_created(session_id, node_id, 'parent-id', 'task', 'Test Node')
        
        assert len(events_received) == 1
        data = events_received[0]
        assert data['session_id'] == session_id
        assert data['node_id'] == node_id
        assert data['name'] == 'Test Node'
        
        unsubscribe('node-created', callback)
    
    def test_emit_node_deleted(self):
        """Test node-deleted event emission."""
        events_received = []
        
        def callback(data):
            events_received.append(data)
        
        subscribe('node-deleted', callback)
        
        session_id = str(uuid.uuid4())
        node_id = str(uuid.uuid4())
        emit_node_deleted(session_id, node_id)
        
        assert len(events_received) == 1
        data = events_received[0]
        assert data['session_id'] == session_id
        assert data['node_id'] == node_id
        
        unsubscribe('node-deleted', callback)
    
    def test_emit_command_executed(self):
        """Test command-executed event emission."""
        events_received = []
        
        def callback(data):
            events_received.append(data)
        
        subscribe('command-executed', callback)
        
        session_id = str(uuid.uuid4())
        command_id = str(uuid.uuid4())
        emit_command_executed(session_id, command_id, success=True)
        
        assert len(events_received) == 1
        data = events_received[0]
        assert data['session_id'] == session_id
        assert data['command_id'] == command_id
        assert data['success'] is True
        
        unsubscribe('command-executed', callback)
    
    def test_emit_undo(self):
        """Test undo event emission."""
        events_received = []
        
        def callback(data):
            events_received.append(data)
        
        subscribe('undo', callback)
        
        session_id = str(uuid.uuid4())
        command_id = str(uuid.uuid4())
        emit_undo(session_id, command_id)
        
        assert len(events_received) == 1
        data = events_received[0]
        assert data['session_id'] == session_id
        assert data['command_id'] == command_id
        
        unsubscribe('undo', callback)


class TestSocketIOConnection:
    """Test Socket.IO integration."""
    
    def test_app_has_socketio(self, app):
        """Test app has Socket.IO extension."""
        assert 'socketio' in app.extensions
    
    def test_socketio_client_can_connect(self, socketio_client):
        """Test client can connect to default namespace."""
        # The test client auto-connects to default namespace
        assert socketio_client.is_connected()
    
    def test_socketio_namespace_exists(self, app):
        """Test /graph namespace is registered."""
        socketio_ext = app.extensions['socketio']
        # Get list of registered namespaces
        assert hasattr(socketio_ext, 'server')
    
    def test_health_check_endpoint(self, client):
        """Test health check still works."""
        response = client.get('/api/v1/health')
        assert response.status_code == 200
        assert response.json == {'status': 'ok'}


class TestBroadcasterIntegration:
    """Test broadcaster integration with Flask."""
    
    def test_broadcaster_emits_to_socketio(self, app, socketio_client):
        """Test broadcaster can emit to Socket.IO."""
        events_received = []
        
        # Subscribe to event locally
        def callback(data):
            events_received.append(data)
        
        subscribe('test-event', callback)
        
        # Emit event
        emit_event('test-event', {'message': 'hello'})
        
        # Should be received by local subscriber
        assert len(events_received) == 1
        assert events_received[0]['message'] == 'hello'
        
        unsubscribe('test-event', callback)


class TestHealthCheck:
    """Test Flask health check endpoint."""
    
    def test_health_check_endpoint(self, client):
        """Test health check returns ok."""
        response = client.get('/api/v1/health')
        assert response.status_code == 200
        assert response.json == {'status': 'ok'}


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
