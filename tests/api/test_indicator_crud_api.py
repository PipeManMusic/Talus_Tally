"""
Tests for Indicator REST API Endpoints

Verifies all CRUD operations through the REST API layer.
"""

import pytest
import json
import os
import tempfile
import shutil
import io
from pathlib import Path
from flask import Flask
from backend.app import create_app


@pytest.fixture
def app():
    """Create a Flask app for testing."""
    app = create_app({'TESTING': True})
    return app


@pytest.fixture
def client(app):
    """Create a test client."""
    return app.test_client()


@pytest.fixture
def temp_catalog():
    """Create a temporary catalog copy for mutation tests."""
    source_path = Path(
        "/home/dworth/Dropbox/Bronco II/Talus Tally/assets/indicators/catalog.yaml"
    )
    temp_dir = tempfile.mkdtemp()
    temp_catalog_path = Path(temp_dir) / "catalog.yaml"
    
    shutil.copy2(source_path, temp_catalog_path)
    
    yield str(temp_catalog_path)
    
    shutil.rmtree(temp_dir, ignore_errors=True)


class TestIndicatorReadEndpoints:
    """Tests for reading indicator data via REST API."""

    def test_get_indicators_config(self, client):
        """Verify we can get the indicators config."""
        response = client.get('/api/v1/config/indicators')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        
        assert 'indicator_sets' in data
        assert 'status' in data['indicator_sets']

    def test_get_indicator_catalog(self, client):
        """Verify we can get the indicator catalog."""
        response = client.get('/api/v1/indicators/catalog')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        
        assert 'indicator_sets' in data
        assert 'status' in data['indicator_sets']

    def test_get_indicator_svg(self, client):
        """Verify we can get an indicator SVG."""
        response = client.get('/api/v1/indicators/status/empty')
        
        assert response.status_code == 200
        assert response.mimetype == 'image/svg+xml'
        assert b'<svg' in response.data

    def test_get_nonexistent_indicator_svg_returns_404(self, client):
        """Verify getting nonexistent indicator returns 404."""
        response = client.get('/api/v1/indicators/status/nonexistent')
        
        assert response.status_code == 404

    def test_get_indicator_theme(self, client):
        """Verify we can get indicator theme."""
        response = client.get('/api/v1/indicators/status/empty/theme')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        
        assert 'indicator_color' in data


class TestIndicatorCRUDEndpoints:
    """Tests for CRUD operations via REST API."""

    def test_create_indicator(self, client, temp_catalog, monkeypatch):
        """Verify we can create an indicator via REST API."""
        # Mock the catalog path
        monkeypatch.setenv('INDICATOR_CATALOG_PATH', temp_catalog)
        
        response = client.post(
            '/api/v1/indicator-catalog/sets/status/indicators',
            json={
                'indicator_id': 'test_indicator',
                'file': 'status_test.svg',
                'description': 'Test indicator',
                'url': 'https://example.com/test',
            },
        )
        
        assert response.status_code == 201
        data = json.loads(response.data)
        
        assert data['id'] == 'test_indicator'
        assert data['description'] == 'Test indicator'

    def test_create_indicator_without_url(self, client, temp_catalog, monkeypatch):
        """Verify we can create indicator without URL."""
        monkeypatch.setenv('INDICATOR_CATALOG_PATH', temp_catalog)
        
        response = client.post(
            '/api/v1/indicator-catalog/sets/status/indicators',
            json={
                'indicator_id': 'test_indicator',
                'file': 'status_test.svg',
                'description': 'Test indicator',
            },
        )
        
        assert response.status_code == 201

    def test_create_indicator_in_nonexistent_set_returns_404(
        self, client, temp_catalog, monkeypatch
    ):
        """Verify creating in nonexistent set returns 404."""
        monkeypatch.setenv('INDICATOR_CATALOG_PATH', temp_catalog)
        
        response = client.post(
            '/api/v1/indicator-catalog/sets/nonexistent/indicators',
            json={
                'indicator_id': 'test',
                'file': 'test.svg',
                'description': 'Test',
            },
        )
        
        assert response.status_code == 404

    def test_create_duplicate_indicator_returns_409(
        self, client, temp_catalog, monkeypatch
    ):
        """Verify creating duplicate indicator returns 409 Conflict."""
        monkeypatch.setenv('INDICATOR_CATALOG_PATH', temp_catalog)
        
        # Create first
        client.post(
            '/api/v1/indicator-catalog/sets/status/indicators',
            json={
                'indicator_id': 'duplicate',
                'file': 'dup.svg',
                'description': 'First',
            },
        )
        
        # Try to create duplicate
        response = client.post(
            '/api/v1/indicator-catalog/sets/status/indicators',
            json={
                'indicator_id': 'duplicate',
                'file': 'dup2.svg',
                'description': 'Second',
            },
        )
        
        assert response.status_code == 409

    def test_update_indicator(self, client, temp_catalog, monkeypatch):
        """Verify we can update an indicator."""
        monkeypatch.setenv('INDICATOR_CATALOG_PATH', temp_catalog)
        
        response = client.put(
            '/api/v1/indicator-catalog/sets/status/indicators/empty',
            json={
                'description': 'Updated description',
            },
        )
        
        assert response.status_code == 200
        data = json.loads(response.data)
        
        assert data['description'] == 'Updated description'

    def test_update_indicator_multiple_fields(self, client, temp_catalog, monkeypatch):
        """Verify we can update multiple fields."""
        monkeypatch.setenv('INDICATOR_CATALOG_PATH', temp_catalog)
        
        response = client.put(
            '/api/v1/indicator-catalog/sets/status/indicators/empty',
            json={
                'file': 'status_empty_v2.svg',
                'description': 'Updated',
                'url': 'https://example.com/updated',
            },
        )
        
        assert response.status_code == 200
        data = json.loads(response.data)
        
        assert data['file'] == 'status_empty_v2.svg'
        assert data['description'] == 'Updated'

    def test_update_indicator_id(self, client, temp_catalog, monkeypatch):
        """Verify we can update indicator ID."""
        monkeypatch.setenv('INDICATOR_CATALOG_PATH', temp_catalog)

        response = client.put(
            '/api/v1/indicator-catalog/sets/status/indicators/empty',
            json={'indicator_id': 'empty_renamed'},
        )

        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['id'] == 'empty_renamed'

    def test_update_nonexistent_indicator_returns_404(
        self, client, temp_catalog, monkeypatch
    ):
        """Verify updating nonexistent indicator returns 404."""
        monkeypatch.setenv('INDICATOR_CATALOG_PATH', temp_catalog)
        
        response = client.put(
            '/api/v1/indicator-catalog/sets/status/indicators/nonexistent',
            json={'description': 'New'},
        )
        
        assert response.status_code == 404

    def test_delete_indicator(self, client, temp_catalog, monkeypatch):
        """Verify we can delete an indicator."""
        monkeypatch.setenv('INDICATOR_CATALOG_PATH', temp_catalog)
        
        response = client.delete('/api/v1/indicator-catalog/sets/status/indicators/empty')
        
        assert response.status_code == 204

    def test_delete_nonexistent_indicator_returns_404(
        self, client, temp_catalog, monkeypatch
    ):
        """Verify deleting nonexistent indicator returns 404."""
        monkeypatch.setenv('INDICATOR_CATALOG_PATH', temp_catalog)
        
        response = client.delete('/api/v1/indicator-catalog/sets/status/indicators/nonexistent')
        
        assert response.status_code == 404

    def test_get_single_indicator(self, client, temp_catalog, monkeypatch):
        """Verify we can get a single indicator."""
        monkeypatch.setenv('INDICATOR_CATALOG_PATH', temp_catalog)
        
        response = client.get('/api/v1/indicator-catalog/sets/status/indicators/empty')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        
        assert data['id'] == 'empty'
        assert 'description' in data
        assert 'file' in data

    def test_list_indicators_in_set(self, client, temp_catalog, monkeypatch):
        """Verify we can list indicators in a set."""
        monkeypatch.setenv('INDICATOR_CATALOG_PATH', temp_catalog)
        
        response = client.get('/api/v1/indicator-catalog/sets/status/indicators')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        
        assert 'indicators' in data
        assert isinstance(data['indicators'], list)
        assert len(data['indicators']) > 0

    def test_set_indicator_theme(self, client, temp_catalog, monkeypatch):
        """Verify we can set indicator theme."""
        monkeypatch.setenv('INDICATOR_CATALOG_PATH', temp_catalog)
        
        theme = {'indicator_color': '#FF0000', 'text_color': '#FF0000'}
        
        response = client.post(
            '/api/v1/indicator-catalog/sets/status/indicators/test_theme/theme',
            json=theme,
        )
        
        assert response.status_code == 200
        data = json.loads(response.data)
        
        assert data['theme'] == theme

    def test_upload_indicator_file(self, client, temp_catalog, monkeypatch):
        """Verify we can upload an SVG file for an indicator."""
        monkeypatch.setenv('INDICATOR_CATALOG_PATH', temp_catalog)

        svg_bytes = b'<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"></svg>'
        data = {
            'file': (io.BytesIO(svg_bytes), 'uploaded_indicator.svg'),
        }

        response = client.post(
            '/api/v1/indicator-catalog/sets/status/indicators/empty/file',
            data=data,
            content_type='multipart/form-data',
        )

        assert response.status_code == 200
        payload = json.loads(response.data)
        assert payload['file'] == 'uploaded_indicator.svg'


class TestIndicatorErrorHandling:
    """Tests for error handling in indicator REST API."""

    def test_create_indicator_missing_required_field(
        self, client, temp_catalog, monkeypatch
    ):
        """Verify missing required fields are handled."""
        monkeypatch.setenv('INDICATOR_CATALOG_PATH', temp_catalog)
        
        response = client.post(
            '/api/v1/indicator-catalog/sets/status/indicators',
            json={
                'indicator_id': 'test',
                # missing 'file' and 'description'
            },
        )
        
        assert response.status_code == 400

    def test_create_indicator_invalid_json(self, client, temp_catalog, monkeypatch):
        """Verify invalid JSON is handled."""
        monkeypatch.setenv('INDICATOR_CATALOG_PATH', temp_catalog)
        
        response = client.post(
            '/api/v1/indicator-catalog/sets/status/indicators',
            data='not json',
            content_type='application/json',
        )
        
        assert response.status_code == 400

    def test_update_indicator_invalid_json(self, client, temp_catalog, monkeypatch):
        """Verify invalid JSON in update is handled."""
        monkeypatch.setenv('INDICATOR_CATALOG_PATH', temp_catalog)
        
        response = client.put(
            '/api/v1/indicator-catalog/sets/status/indicators/empty',
            data='not json',
            content_type='application/json',
        )
        
        assert response.status_code == 400
