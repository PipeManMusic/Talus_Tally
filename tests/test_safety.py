import pytest
from PySide6.QtWidgets import QMessageBox
from unittest.mock import patch, MagicMock
from frontend.desktop.app import TalusWindow
from backend.models import Project

@pytest.fixture
def clean_window(qtbot, tmp_path, monkeypatch):
    """Returns a window in a clean state with dummy data."""
    monkeypatch.setenv("TALUS_TALLY_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("TALUS_TALLY_DISABLE_DROPBOX", "1")

    window = TalusWindow()
    window.project_data = Project(name="Safety Test")
    window.data_path = str(tmp_path / "dummy.json")
    window.mark_clean()
    qtbot.addWidget(window)
    return window

def test_dirty_flag_lifecycle(clean_window):
    """
    Verify the lifecycle: Clean -> Edit -> Dirty -> Save -> Clean.
    This ensures the UI visual indicator (*) works correctly.
    """
    # 1. Start Clean
    assert clean_window.is_dirty is False
    assert "*" not in clean_window.windowTitle()

    # 2. Action: Add a SubProject (should mark dirty)
    # We mock the dialog to just return data without popping up
    with patch("frontend.desktop.app.SubProjectDialog") as MockDialog:
        mock_instance = MockDialog.return_value
        mock_instance.exec.return_value = True
        mock_instance.get_data.return_value = {"name": "Dirty Sub", "priority": 5}
        
        clean_window.add_sub_project_dialog()
    
    # 3. Verify Dirty
    assert clean_window.is_dirty is True
    assert "*" in clean_window.windowTitle()

    # 4. Action: Save (should mark clean)
    # We mock PersistenceManager to avoid real file ops and side effects
    with patch("frontend.desktop.app.PersistenceManager") as MockPM:
        with patch("os.makedirs"):
            with patch("frontend.desktop.app.DocInjector"):
                clean_window.save_project()
    assert "*" not in clean_window.windowTitle()

def test_close_prompt_save(clean_window):
    """Verify that closing a dirty window prompts to SAVE."""
    # 1. Make Dirty
    clean_window.mark_dirty()
    
    # 2. Simulate Close Event
    event = MagicMock()
    
    # 3. Mock user clicking "Save"
    with patch("PySide6.QtWidgets.QMessageBox.question", return_value=QMessageBox.Save) as mock_msg:
        # Mock the actual save method to verify it gets triggered
        with patch.object(clean_window, 'save_project') as mock_save:
            clean_window.closeEvent(event)
            
            # Assertions
            mock_msg.assert_called_once() # Prompt appeared
            mock_save.assert_called_once() # Save happened
            event.accept.assert_called_once() # Window closed

def test_close_prompt_discard(clean_window):
    """Verify that user can DISCARD changes."""
    clean_window.mark_dirty()
    event = MagicMock()
    
    # Mock user clicking "Discard"
    with patch("PySide6.QtWidgets.QMessageBox.question", return_value=QMessageBox.Discard):
        with patch.object(clean_window, 'save_project') as mock_save:
            clean_window.closeEvent(event)
            
            mock_save.assert_not_called()     # Did NOT save
            event.accept.assert_called_once() # Window closed (data lost, as requested)

def test_close_prompt_cancel(clean_window):
    """Verify that user can CANCEL the close."""
    clean_window.mark_dirty()
    event = MagicMock()
    
    # Mock user clicking "Cancel"
    with patch("PySide6.QtWidgets.QMessageBox.question", return_value=QMessageBox.Cancel):
        clean_window.closeEvent(event)
        
        event.ignore.assert_called_once() # Window remained OPEN