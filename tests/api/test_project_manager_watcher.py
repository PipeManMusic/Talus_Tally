"""
Tests for ProjectManager integration with SharedDriveWatcher.

Tests cover:
- File watching lifecycle (start/stop)
- Integration with save_project
- Callback invocation with session broadcasting

Note: These tests mock SharedDriveWatcher to test integration logic only.
Real file watching functionality is tested in test_file_watcher.py.
"""

import pytest
import tempfile
import time
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock

from backend.api.project_manager import ProjectManager
from backend.core.graph import ProjectGraph


@pytest.fixture
def mock_file_watcher():
    """Mock SharedDriveWatcher for tests that don't need real file watching."""
    with patch('backend.api.project_manager.SharedDriveWatcher') as mock_class:
        mock_instance = MagicMock()
        mock_class.return_value = mock_instance
        yield mock_instance


@pytest.fixture
def temp_project_file():
    """Create a temporary project file for testing."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        f.write('{"graph": {"nodes": []}, "template_id": "test"}')
        temp_path = f.name
    
    yield temp_path
    
    try:
        Path(temp_path).unlink()
    except FileNotFoundError:
        pass


def test_start_file_watching_initializes_watcher():
    """Test that start_file_watching creates and starts the watcher."""
    pm = ProjectManager()
    
    with tempfile.NamedTemporaryFile(delete=False) as f:
        temp_path = f.name
    
    try:
        pm.current_project_path = temp_path
        
        # Mock broadcaster to avoid actual Socket.IO calls
        with patch('backend.api.broadcaster.emit_event'):
            pm.start_file_watching('test-session-123')
        
        assert pm.file_watcher is not None
        assert pm.session_id == 'test-session-123'
        
        pm.stop_file_watching()
    finally:
        try:
            Path(temp_path).unlink()
        except FileNotFoundError:
            pass


def test_stop_file_watching_cleans_up():
    """Test that stop_file_watching properly cleans up the watcher."""
    pm = ProjectManager()
    
    with tempfile.NamedTemporaryFile(delete=False) as f:
        temp_path = f.name
    
    try:
        pm.current_project_path = temp_path
        
        with patch('backend.api.broadcaster.emit_event'):
            pm.start_file_watching('test-session-123')
            assert pm.file_watcher is not None
            
            pm.stop_file_watching()
            assert pm.file_watcher is None
    finally:
        try:
            Path(temp_path).unlink()
        except FileNotFoundError:
            pass


def test_save_project_calls_ignore_next_event(temp_project_file):
    """Test that save_project tells the watcher to ignore the next event."""
    pm = ProjectManager()
    graph = ProjectGraph(template_id='test')
    
    # Mock the file watcher
    pm.file_watcher = MagicMock()
    pm.current_project_path = temp_project_file
    
    # Save the project
    pm.save_project(temp_project_file, graph)
    
    # Verify ignore_next_event was called
    pm.file_watcher.ignore_next_event.assert_called_once_with(temp_project_file)


def test_project_file_change_triggers_reload():
    """Test that external project file changes trigger graph reload."""
    pm = ProjectManager()
    pm.session_id = 'test-session-123'
    mock_emit = Mock()
    
    with patch('backend.api.broadcaster.emit_event', mock_emit):
        with patch.object(pm, 'load_project') as mock_load:
            mock_load.return_value = (ProjectGraph(template_id='test'), [])
            
            # Call the callback directly (simulates file change event)
            pm._on_project_file_changed('/fake/project.json')
            
            # Verify load_project was called
            mock_load.assert_called_once_with('/fake/project.json')
            
            # Verify Socket.IO event was emitted
            assert mock_emit.called
            call_args = mock_emit.call_args
            assert call_args[0][0] == 'external_project_update'
            assert call_args[1]['room'] == 'test-session-123'


def test_template_file_change_triggers_broadcast():
    """Test that external template file changes trigger Socket.IO broadcast."""
    pm = ProjectManager()
    pm.session_id = 'test-session-123'
    mock_emit = Mock()
    
    with patch('backend.api.broadcaster.emit_event', mock_emit):
        # Call the template callback directly (simulates file change event)
        pm._on_template_file_changed('/fake/template.yaml')
        
        # Verify Socket.IO event was emitted
        assert mock_emit.called
        call_args = mock_emit.call_args
        assert call_args[0][0] == 'external_template_update'
        assert call_args[0][1]['template_path'] == '/fake/template.yaml'
        assert call_args[1]['room'] == 'test-session-123'


def test_watcher_not_started_without_session_id():
    """Test that file watching requires a session_id."""
    pm = ProjectManager()
    
    with tempfile.NamedTemporaryFile(delete=False) as f:
        temp_path = f.name
    
    try:
        pm.current_project_path = temp_path
        
        # Should not crash, but watcher should not start properly
        with patch('backend.api.broadcaster.emit_event'):
            pm.start_file_watching(None)
            # Session ID should not be set
            assert pm.session_id is None
        
        pm.stop_file_watching()
    finally:
        try:
            Path(temp_path).unlink()
        except FileNotFoundError:
            pass


def test_load_project_sets_current_path(temp_project_file):
    """Test that load_project sets current_project_path."""
    pm = ProjectManager()
    
    # Write valid project data
    with open(temp_project_file, 'w') as f:
        f.write('''{
            "graph": {
                "id": "test",
                "nodes": [],
                "template_id": "test"
            },
            "template_id": "test"
        }''')
    
    graph, blocking = pm.load_project(temp_project_file)
    
    # Verify path was set
    assert pm.current_project_path == str(Path(temp_project_file).resolve())
    assert graph is not None


def test_multiple_template_watching():
    """Test that file watcher monitors all template files."""
    pm = ProjectManager()
    
    # Create temp files for templates
    temp_templates = []
    for i in range(3):
        with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
            f.write(f'id: template{i}')
            temp_templates.append(f.name)
    
    with tempfile.NamedTemporaryFile(delete=False) as f:
        temp_project = f.name
    
    try:
        pm.template_paths = [str(Path(p).resolve()) for p in temp_templates]
        pm.current_project_path = temp_project
        
        with patch('backend.api.broadcaster.emit_event'):
            pm.start_file_watching('test-session-123')
            
            # Verify watcher exists and has correct callbacks
            assert pm.file_watcher is not None
            assert pm.file_watcher.on_project_changed is not None
            assert pm.file_watcher.on_template_changed is not None
            
            pm.stop_file_watching()
    finally:
        for path in temp_templates:
            try:
                Path(path).unlink()
            except FileNotFoundError:
                pass
        try:
            Path(temp_project).unlink()
        except FileNotFoundError:
            pass


def test_save_without_watcher_does_not_crash(temp_project_file):
    """Test that saving without an active watcher doesn't crash."""
    pm = ProjectManager()
    graph = ProjectGraph(template_id='test')
    
    # Save without starting watcher first
    pm.save_project(temp_project_file, graph)
    
    # Should complete without error
    assert Path(temp_project_file).exists()
