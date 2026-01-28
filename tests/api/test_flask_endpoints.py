"""
Tests for Flask REST API endpoints.

These tests verify that the Flask layer correctly wraps the backend API
and returns proper JSON responses.

TDD Approach: Write failing tests first, implement endpoints to make them pass.
"""

import pytest
from backend.app import create_app
from backend.api.project_manager import ProjectManager
from backend.api.graph_service import GraphService
from backend.handlers.dispatcher import CommandDispatcher
from backend.infra.schema_loader import SchemaLoader
import tempfile
import json


@pytest.fixture
def app():
    """Create Flask app for testing."""
    with tempfile.TemporaryDirectory() as tmpdir:
        app = create_app({
            'TESTING': True,
            'PROJECT_DIR': tmpdir,
        })
        yield app


@pytest.fixture
def client(app):
    """Create Flask test client."""
    return app.test_client()


class TestHealthCheck:
    """Test basic health check endpoint."""
    
    def test_health_check(self, client):
        """Health check should return ok."""
        response = client.get('/api/v1/health')
        assert response.status_code == 200
        assert response.json['status'] == 'ok'


class TestProjectEndpoints:
    """Test project CRUD endpoints."""
    
    def test_create_new_project(self, client, app):
        """POST /api/v1/projects should create new project."""
        # Request body
        request_data = {
            'template_id': 'restomod',
            'project_name': 'My Test Restoration'
        }
        
        # Make request
        response = client.post(
            '/api/v1/projects',
            data=json.dumps(request_data),
            content_type='application/json'
        )
        
        # Assertions
        assert response.status_code == 201
        data = response.json
        assert 'project_id' in data
        assert 'graph' in data
        assert data['graph']['roots'] is not None


class TestTemplateEndpoints:
    """Test template query endpoints."""
    
    def test_list_templates(self, client):
        """GET /api/v1/templates should list available templates."""
        response = client.get('/api/v1/templates')
        
        assert response.status_code == 200
        data = response.json
        assert 'templates' in data
        assert isinstance(data['templates'], list)
        assert len(data['templates']) > 0


class TestCommandEndpoints:
    """Test command execution endpoints."""
    
    def test_execute_create_node_command(self, client):
        """POST /api/v1/commands/execute should execute CreateNode command."""
        # First create a project
        project_response = client.post(
            '/api/v1/projects',
            data=json.dumps({
                'template_id': 'restomod',
                'project_name': 'Test Project'
            }),
            content_type='application/json'
        )
        
        project_id = project_response.json['project_id']
        session_id = project_response.json['session_id']
        parent_id = project_response.json['graph']['roots'][0]['id']
        
        # Get template schema to find a blueprint type
        schema_response = client.get('/api/v1/templates/restomod/schema')
        blueprint_type_id = schema_response.json['node_types'][0]['id']
        
        # Execute CreateNode command
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
        data = response.json
        assert data['success'] is True
        assert 'graph' in data
        # Graph should now have more nodes (or changed structure)
        assert 'roots' in data['graph']


class TestUndoRedoEndpoints:
    """Test undo/redo endpoints."""
    
    def test_undo_command(self, client):
        """POST /api/v1/sessions/<session_id>/undo should undo last command."""
        # First create a project
        project_response = client.post(
            '/api/v1/projects',
            data=json.dumps({
                'template_id': 'restomod',
                'project_name': 'Test Project'
            }),
            content_type='application/json'
        )
        
        session_id = project_response.json['session_id']
        parent_id = project_response.json['graph']['roots'][0]['id']
        
        # Execute a command
        schema_response = client.get('/api/v1/templates/restomod/schema')
        blueprint_type_id = schema_response.json['node_types'][0]['id']
        
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
        
        # Undo
        response = client.post(f'/api/v1/sessions/{session_id}/undo')
        
        assert response.status_code == 200
        data = response.json
        assert data['success'] is True
        assert 'undo_available' in data
        assert 'redo_available' in data


class TestGraphQueryEndpoints:
    """Test graph query endpoints."""
    
    def test_get_tree(self, client):
        """GET /api/v1/sessions/<session_id>/graph/tree should return tree structure."""
        # Create project first
        project_response = client.post(
            '/api/v1/projects',
            data=json.dumps({
                'template_id': 'restomod',
                'project_name': 'Test Project'
            }),
            content_type='application/json'
        )
        
        session_id = project_response.json['session_id']
        
        # Get tree
        response = client.get(f'/api/v1/sessions/{session_id}/graph/tree')
        
        assert response.status_code == 200
        data = response.json
        assert 'roots' in data
        assert isinstance(data['roots'], list)


class TestErrorHandling:
    """Test error handling."""
    
    def test_invalid_template(self, client):
        """Invalid template ID should return error."""
        response = client.post(
            '/api/v1/projects',
            data=json.dumps({
                'template_id': 'invalid_template_xyz',
                'project_name': 'Test'
            }),
            content_type='application/json'
        )
        
        assert response.status_code == 400
        assert 'error' in response.json
