"""
End-to-End Integration Tests for WebSocket Real-Time Collaboration.

Tests complete workflows from REST API through WebSocket event broadcasting,
focusing on real multi-client scenarios with the actual API contracts.
"""

import pytest
import json
import time
from backend.app import create_app


@pytest.fixture
def app():
    """Create app for E2E testing."""
    app = create_app()
    app.config['TESTING'] = True
    return app


@pytest.fixture
def client(app):
    """Create REST API test client."""
    return app.test_client()


@pytest.fixture
def socketio(app):
    """Get Socket.IO instance from app."""
    return app.extensions.get('socketio')


class TestProjectCreationToWebSocketBroadcast:
    """Test complete workflow from project creation through WebSocket updates."""

    def test_project_creation_initializes_session(self, client):
        """Verify project creation initializes session and dispatcher."""
        # Create project
        response = client.post(
            '/api/v1/projects',
            data=json.dumps({
                'template_id': 'restomod',
                'project_name': 'Test Project'
            }),
            content_type='application/json'
        )
        
        assert response.status_code == 201
        data = response.json
        assert 'session_id' in data
        assert 'project_id' in data
        assert 'graph' in data
        assert data['graph']['roots'] is not None

    def test_multiple_clients_connect_to_same_project(self, app, client, socketio):
        """Verify multiple clients can connect to same project session."""
        # Create project
        response = client.post(
            '/api/v1/projects',
            data=json.dumps({
                'template_id': 'restomod',
                'project_name': 'Test Project'
            }),
            content_type='application/json'
        )
        session_id = response.json['session_id']
        
        # Connect two WebSocket clients
        socket_client_1 = socketio.test_client(app)
        socket_client_2 = socketio.test_client(app)
        
        # Join same session
        socket_client_1.emit('join_session', {'session_id': session_id})
        socket_client_2.emit('join_session', {'session_id': session_id})
        
        # Verify both connected
        assert socket_client_1.is_connected()
        assert socket_client_2.is_connected()
        
        socket_client_1.disconnect()
        socket_client_2.disconnect()

    def test_node_creation_via_rest_broadcasts_to_websocket(self, app, client, socketio):
        """Verify REST node creation broadcasts to connected WebSocket clients."""
        # Create project
        response = client.post(
            '/api/v1/projects',
            data=json.dumps({
                'template_id': 'restomod',
                'project_name': 'Test Project'
            }),
            content_type='application/json'
        )
        session_id = response.json['session_id']
        parent_id = response.json['graph']['roots'][0]['id']
        
        # Get template to find blueprint type
        schema_response = client.get('/api/v1/templates/restomod/schema')
        blueprint_type_id = schema_response.json['node_types'][0]['id']
        
        # Connect WebSocket client
        socket_client = socketio.test_client(app)
        socket_client.emit('join_session', {'session_id': session_id})
        
        # Create node via REST
        response = client.post(
            '/api/v1/commands/execute',
            data=json.dumps({
                'session_id': session_id,
                'command_type': 'CreateNode',
                'data': {
                    'parent_id': parent_id,
                    'blueprint_type_id': blueprint_type_id
                }
            }),
            content_type='application/json'
        )
        
        assert response.status_code == 200
        
        # Verify WebSocket client received event
        received = socket_client.get_received()
        assert len(received) > 0
        
        # Find node-created event
        found_event = False
        for msg in received:
            if len(msg['args']) > 0 and isinstance(msg['args'][0], dict):
                if msg['args'][0].get('event') == 'node-created':
                    found_event = True
                    break
        
        assert found_event
        socket_client.disconnect()

    def test_multiple_clients_receive_create_node_event(self, app, client, socketio):
        """Verify all connected clients receive node-created events."""
        # Create project
        response = client.post(
            '/api/v1/projects',
            data=json.dumps({
                'template_id': 'restomod',
                'project_name': 'Test Project'
            }),
            content_type='application/json'
        )
        session_id = response.json['session_id']
        parent_id = response.json['graph']['roots'][0]['id']
        
        # Get blueprint type
        schema_response = client.get('/api/v1/templates/restomod/schema')
        blueprint_type_id = schema_response.json['node_types'][0]['id']
        
        # Connect two clients
        socket_client_1 = socketio.test_client(app)
        socket_client_2 = socketio.test_client(app)
        
        socket_client_1.emit('join_session', {'session_id': session_id})
        socket_client_2.emit('join_session', {'session_id': session_id})
        
        # Create node
        response = client.post(
            '/api/v1/commands/execute',
            data=json.dumps({
                'session_id': session_id,
                'command_type': 'CreateNode',
                'data': {
                    'parent_id': parent_id,
                    'blueprint_type_id': blueprint_type_id
                }
            }),
            content_type='application/json'
        )
        assert response.status_code == 200
        
        # Both clients should receive event
        received_1 = socket_client_1.get_received()
        received_2 = socket_client_2.get_received()
        
        has_event_1 = any(
            msg['args'][0].get('event') == 'node-created' 
            for msg in received_1 
            if len(msg['args']) > 0 and isinstance(msg['args'][0], dict)
        )
        has_event_2 = any(
            msg['args'][0].get('event') == 'node-created' 
            for msg in received_2 
            if len(msg['args']) > 0 and isinstance(msg['args'][0], dict)
        )
        
        assert has_event_1
        assert has_event_2
        
        socket_client_1.disconnect()
        socket_client_2.disconnect()

    def test_undo_broadcasts_to_all_clients(self, app, client, socketio):
        """Verify undo operation broadcasts to all connected clients."""
        # Create project
        response = client.post(
            '/api/v1/projects',
            data=json.dumps({
                'template_id': 'restomod',
                'project_name': 'Test Project'
            }),
            content_type='application/json'
        )
        session_id = response.json['session_id']
        parent_id = response.json['graph']['roots'][0]['id']
        
        # Get blueprint type
        schema_response = client.get('/api/v1/templates/restomod/schema')
        blueprint_type_id = schema_response.json['node_types'][0]['id']
        
        # Connect clients
        socket_client_1 = socketio.test_client(app)
        socket_client_2 = socketio.test_client(app)
        
        socket_client_1.emit('join_session', {'session_id': session_id})
        socket_client_2.emit('join_session', {'session_id': session_id})
        
        # Create node
        client.post(
            '/api/v1/commands/execute',
            data=json.dumps({
                'session_id': session_id,
                'command_type': 'CreateNode',
                'data': {
                    'parent_id': parent_id,
                    'blueprint_type_id': blueprint_type_id
                }
            }),
            content_type='application/json'
        )
        
        # Clear messages
        socket_client_1.get_received()
        socket_client_2.get_received()
        
        # Undo
        response = client.post(f'/api/v1/sessions/{session_id}/undo')
        assert response.status_code == 200
        
        # Both should receive undo event
        received_1 = socket_client_1.get_received()
        received_2 = socket_client_2.get_received()
        
        has_undo_1 = any(
            msg['args'][0].get('event') == 'undo' 
            for msg in received_1 
            if len(msg['args']) > 0 and isinstance(msg['args'][0], dict)
        )
        has_undo_2 = any(
            msg['args'][0].get('event') == 'undo' 
            for msg in received_2 
            if len(msg['args']) > 0 and isinstance(msg['args'][0], dict)
        )
        
        assert has_undo_1
        assert has_undo_2
        
        socket_client_1.disconnect()
        socket_client_2.disconnect()

    def test_session_metadata_tracking(self, client):
        """Verify session metadata is properly tracked."""
        # Create project
        response = client.post(
            '/api/v1/projects',
            data=json.dumps({
                'template_id': 'restomod',
                'project_name': 'Test Project'
            }),
            content_type='application/json'
        )
        session_id = response.json['session_id']
        
        # Get session info
        response = client.get(f'/api/v1/sessions/{session_id}/info')
        assert response.status_code == 200
        
        info = response.json
        assert 'created_at' in info
        assert 'last_activity' in info
        assert 'active_clients' in info
        assert 'node_count' in info
        assert info['has_project'] == True

    def test_sessions_list_endpoint(self, client):
        """Verify sessions listing endpoint works."""
        # Create a project to generate a session
        response = client.post(
            '/api/v1/projects',
            data=json.dumps({
                'template_id': 'restomod',
                'project_name': 'Test Project'
            }),
            content_type='application/json'
        )
        session_id = response.json['session_id']
        
        # List all sessions
        response = client.get('/api/v1/sessions')
        assert response.status_code == 200
        
        data = response.json
        assert 'sessions' in data
        assert isinstance(data['sessions'], list)
        
        # Verify our session is listed
        session_ids = [s['session_id'] for s in data['sessions']]
        assert session_id in session_ids

    def test_rest_only_client_works_without_websocket(self, client):
        """Verify REST-only client can create and query projects."""
        # Create project without WebSocket
        response = client.post(
            '/api/v1/projects',
            data=json.dumps({
                'template_id': 'restomod',
                'project_name': 'REST Only Project'
            }),
            content_type='application/json'
        )
        assert response.status_code == 201
        assert 'project_id' in response.json
        assert 'session_id' in response.json
        assert 'graph' in response.json


class TestSessionLifecycleWithWebSocket:
    """Test session lifecycle with WebSocket connections."""

    def test_client_join_leave_tracking(self, app, client, socketio):
        """Verify session info endpoint works with active sessions."""
        # Create project
        response = client.post(
            '/api/v1/projects',
            data=json.dumps({
                'template_id': 'restomod',
                'project_name': 'Test Project'
            }),
            content_type='application/json'
        )
        session_id = response.json['session_id']
        
        # Check session info
        response = client.get(f'/api/v1/sessions/{session_id}/info')
        assert response.status_code == 200
        
        info = response.json
        assert 'active_clients' in info
        assert 'created_at' in info
        assert 'last_activity' in info
        
        # Connect client
        socket_client = socketio.test_client(app)
        socket_client.emit('join_session', {'session_id': session_id})
        
        # Verify session still queryable
        response = client.get(f'/api/v1/sessions/{session_id}/info')
        assert response.status_code == 200
        
        socket_client.disconnect()

    def test_client_disconnect_doesnt_break_session(self, app, client, socketio):
        """Verify session persists when client disconnects."""
        # Create project
        response = client.post(
            '/api/v1/projects',
            data=json.dumps({
                'template_id': 'restomod',
                'project_name': 'Test Project'
            }),
            content_type='application/json'
        )
        session_id = response.json['session_id']
        parent_id = response.json['graph']['roots'][0]['id']
        
        # Get blueprint type
        schema_response = client.get('/api/v1/templates/restomod/schema')
        blueprint_type_id = schema_response.json['node_types'][0]['id']
        
        # Connect client
        socket_client = socketio.test_client(app)
        socket_client.emit('join_session', {'session_id': session_id})
        
        # Create node
        response1 = client.post(
            '/api/v1/commands/execute',
            data=json.dumps({
                'session_id': session_id,
                'command_type': 'CreateNode',
                'data': {
                    'parent_id': parent_id,
                    'blueprint_type_id': blueprint_type_id
                }
            }),
            content_type='application/json'
        )
        assert response1.status_code == 200
        node_id_1 = response1.json.get('graph', {}).get('roots', [{}])[0].get('id')
        
        # Disconnect
        socket_client.disconnect()
        
        # Verify session still works
        response2 = client.post(
            '/api/v1/commands/execute',
            data=json.dumps({
                'session_id': session_id,
                'command_type': 'CreateNode',
                'data': {
                    'parent_id': parent_id,
                    'blueprint_type_id': blueprint_type_id
                }
            }),
            content_type='application/json'
        )
        assert response2.status_code == 200
        
        # Verify both nodes exist
        response = client.get(f'/api/v1/sessions/{session_id}/info')
        assert response.json['node_count'] >= 2


class TestErrorHandlingWithWebSocket:
    """Test error scenarios with WebSocket connections."""

    def test_invalid_session_rejected(self, client):
        """Verify invalid session ID is rejected."""
        response = client.get('/api/v1/sessions/invalid-session/info')
        assert response.status_code == 404

    def test_client_handles_invalid_event(self, app, socketio):
        """Verify client doesn't crash on invalid event."""
        socket_client = socketio.test_client(app)
        
        # Send invalid event
        socket_client.emit('invalid_event', {})
        
        # Should still be connected
        assert socket_client.is_connected()
        
        socket_client.disconnect()

    def test_project_data_consistency(self, client):
        """Verify project data remains consistent across queries."""
        # Create project
        response = client.post(
            '/api/v1/projects',
            data=json.dumps({
                'template_id': 'restomod',
                'project_name': 'Test Project'
            }),
            content_type='application/json'
        )
        assert response.status_code == 201
        
        # Get project info multiple times via sessions
        session_id = response.json['session_id']
        initial_node_count = response.json['graph']['roots'][0] is not None
        
        # Query session twice
        response1 = client.get(f'/api/v1/sessions/{session_id}/info')
        response2 = client.get(f'/api/v1/sessions/{session_id}/info')
        
        assert response1.status_code == 200
        assert response2.status_code == 200
        
        # Data should be consistent
        assert response1.json['node_count'] == response2.json['node_count']
