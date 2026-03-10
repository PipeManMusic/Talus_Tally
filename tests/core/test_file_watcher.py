"""
Tests for SharedDriveWatcher - file watching for collaborative sync.

Tests cover:
- File watching initialization and cleanup
- Debouncing of rapid file changes
- Self-echo protection (ignoring own saves)
- Callback invocation on file changes
- Thread safety
"""

import pytest
import tempfile
import time
import threading
from pathlib import Path
from unittest.mock import Mock, call

from backend.core.file_watcher import SharedDriveWatcher


@pytest.fixture
def temp_project_file():
    """Create a temporary project file for testing."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        f.write('{"graph": {"nodes": []}}')
        temp_path = f.name
    
    yield temp_path
    
    # Cleanup
    try:
        Path(temp_path).unlink()
    except FileNotFoundError:
        pass


@pytest.fixture
def temp_template_file():
    """Create a temporary template file for testing."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
        f.write('id: test_template\nnode_types: []')
        temp_path = f.name
    
    yield temp_path
    
    # Cleanup
    try:
        Path(temp_path).unlink()
    except FileNotFoundError:
        pass


def test_watcher_initialization():
    """Test that SharedDriveWatcher initializes correctly."""
    on_project_cb = Mock()
    on_template_cb = Mock()
    
    watcher = SharedDriveWatcher(
        on_project_changed=on_project_cb,
        on_template_changed=on_template_cb,
        debounce_ms=100
    )
    
    assert watcher.on_project_changed == on_project_cb
    assert watcher.on_template_changed == on_template_cb
    assert watcher.debounce_seconds == 0.1
    assert watcher.observer is None  # Not started yet


def test_watch_project_file(temp_project_file):
    """Test watching a project file for changes."""
    on_project_cb = Mock()
    on_template_cb = Mock()
    
    watcher = SharedDriveWatcher(
        on_project_changed=on_project_cb,
        on_template_changed=on_template_cb,
        debounce_ms=100
    )
    
    # Start watching
    watcher.watch_project(temp_project_file)
    assert watcher.observer is not None
    observer = watcher.observer  # Save reference before stop()
    assert observer.is_alive()
    
    # Stop watching
    watcher.stop()
    time.sleep(0.2)  # Allow observer to stop
    assert not observer.is_alive()  # Check saved reference
    assert watcher.observer is None  # Watcher cleared the reference


def test_file_change_triggers_callback(temp_project_file):
    """Test that modifying a watched file triggers the callback."""
    on_project_cb = Mock()
    on_template_cb = Mock()
    
    watcher = SharedDriveWatcher(
        on_project_changed=on_project_cb,
        on_template_changed=on_template_cb,
        debounce_ms=100
    )
    
    watcher.watch_project(temp_project_file)
    
    # Modify the file
    with open(temp_project_file, 'w') as f:
        f.write('{"graph": {"nodes": [{"id": "test"}]}}')
    
    # Wait for debounce + processing
    time.sleep(0.3)
    
    # Callback should have been called
    assert on_project_cb.call_count >= 1
    call_args = on_project_cb.call_args[0][0]
    assert temp_project_file in call_args
    
    watcher.stop()


def test_debouncing_batches_rapid_changes(temp_project_file):
    """Test that rapid file changes are debounced into a single callback."""
    on_project_cb = Mock()
    on_template_cb = Mock()
    
    watcher = SharedDriveWatcher(
        on_project_changed=on_project_cb,
        on_template_changed=on_template_cb,
        debounce_ms=200  # 200ms debounce
    )
    
    watcher.watch_project(temp_project_file)
    
    # Make multiple rapid changes
    for i in range(5):
        with open(temp_project_file, 'w') as f:
            f.write(f'{{"graph": {{"iteration": {i}}}}}')
        time.sleep(0.05)  # 50ms between changes (faster than debounce)
    
    # Wait for debounce period + processing
    time.sleep(0.5)
    
    # Should have been called only once or twice (due to debouncing)
    # Not 5 times
    assert on_project_cb.call_count <= 2
    
    watcher.stop()


def test_self_echo_protection(temp_project_file):
    """Test that ignore_next_event prevents callback on self-saves."""
    on_project_cb = Mock()
    on_template_cb = Mock()
    
    watcher = SharedDriveWatcher(
        on_project_changed=on_project_cb,
        on_template_changed=on_template_cb,
        debounce_ms=100
    )
    
    watcher.watch_project(temp_project_file)
    
    # Tell watcher to ignore next event
    watcher.ignore_next_event(temp_project_file)
    
    # Give the ignore flag time to be set
    time.sleep(0.05)
    
    # Modify the file (simulating our own save)
    with open(temp_project_file, 'w') as f:
        f.write('{"graph": {"nodes": []}}')
    
    # Wait for debounce + safety margin
    time.sleep(0.3)
    
    # Callback should NOT have been called
    assert on_project_cb.call_count == 0
    
    watcher.stop()


def test_self_echo_protection_expires(temp_project_file):
    """Test that ignore_next_event expires after timeout."""
    on_project_cb = Mock()
    on_template_cb = Mock()
    
    watcher = SharedDriveWatcher(
        on_project_changed=on_project_cb,
        on_template_changed=on_template_cb,
        debounce_ms=100
    )
    
    watcher.watch_project(temp_project_file)
    
    # Tell watcher to ignore next event
    watcher.ignore_next_event(temp_project_file)
    
    # Wait for the 2-second safety timeout to expire
    time.sleep(2.5)
    
    # Now modify the file - should trigger callback
    with open(temp_project_file, 'w') as f:
        f.write('{"graph": {"nodes": [{"id": "after_timeout"}]}}')
    
    time.sleep(0.3)
    
    # Callback SHOULD have been called (ignore expired)
    assert on_project_cb.call_count >= 1
    
    watcher.stop()


def test_template_file_callback(temp_template_file):
    """Test that template file changes trigger the template callback."""
    on_project_cb = Mock()
    on_template_cb = Mock()
    
    watcher = SharedDriveWatcher(
        on_project_changed=on_project_cb,
        on_template_changed=on_template_cb,
        debounce_ms=100
    )
    
    watcher.watch_template(temp_template_file)
    
    # Modify the template file
    with open(temp_template_file, 'w') as f:
        f.write('id: modified_template\nnode_types: [{id: new_type}]')
    
    time.sleep(0.3)
    
    # Template callback should have been called
    assert on_template_cb.call_count >= 1
    # Project callback should NOT have been called
    assert on_project_cb.call_count == 0
    
    watcher.stop()


def test_multiple_template_watching(temp_template_file):
    """Test watching multiple template files simultaneously."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f2:
        f2.write('id: second_template\nnode_types: []')
        temp_template_2 = f2.name
    
    try:
        on_project_cb = Mock()
        on_template_cb = Mock()
        
        watcher = SharedDriveWatcher(
            on_project_changed=on_project_cb,
            on_template_changed=on_template_cb,
            debounce_ms=100
        )
        
        # Watch both templates
        watcher.watch_template(temp_template_file)
        watcher.watch_template(temp_template_2)
        
        # Modify first template
        with open(temp_template_file, 'w') as f:
            f.write('id: modified_1')
        
        time.sleep(0.3)
        first_call_count = on_template_cb.call_count
        
        # Modify second template
        with open(temp_template_2, 'w') as f:
            f.write('id: modified_2')
        
        time.sleep(0.3)
        
        # Both should have triggered callbacks
        assert on_template_cb.call_count >= first_call_count + 1
        
        watcher.stop()
    
    finally:
        try:
            Path(temp_template_2).unlink()
        except FileNotFoundError:
            pass


def test_stop_cleans_up_resources(temp_project_file):
    """Test that stop() properly cleans up watcher resources."""
    on_project_cb = Mock()
    on_template_cb = Mock()
    
    watcher = SharedDriveWatcher(
        on_project_changed=on_project_cb,
        on_template_changed=on_template_cb
    )
    
    watcher.watch_project(temp_project_file)
    observer = watcher.observer
    assert observer is not None
    
    watcher.stop()
    time.sleep(0.1)
    
    # Observer should be stopped and cleaned up
    assert not observer.is_alive()
    assert watcher.observer is None
    
    # Modifying file should not trigger callback anymore
    on_project_cb.reset_mock()
    with open(temp_project_file, 'w') as f:
        f.write('{"after_stop": true}')
    
    time.sleep(0.3)
    assert on_project_cb.call_count == 0


def test_thread_safety(temp_project_file):
    """Test that watcher handles concurrent file modifications safely."""
    on_project_cb = Mock()
    on_template_cb = Mock()
    
    watcher = SharedDriveWatcher(
        on_project_changed=on_project_cb,
        on_template_changed=on_template_cb,
        debounce_ms=100
    )
    
    watcher.watch_project(temp_project_file)
    
    # Simulate concurrent modifications from multiple threads
    def modify_file(iteration):
        with open(temp_project_file, 'w') as f:
            f.write(f'{{"thread_iteration": {iteration}}}')
    
    threads = []
    for i in range(10):
        t = threading.Thread(target=modify_file, args=(i,))
        threads.append(t)
        t.start()
    
    for t in threads:
        t.join()
    
    time.sleep(0.5)
    
    # Should have handled all modifications without crashing
    # Call count will be less than 10 due to debouncing
    assert on_project_cb.call_count >= 1
    assert on_project_cb.call_count <= 10
    
    watcher.stop()
