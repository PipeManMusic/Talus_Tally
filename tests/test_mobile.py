import sys
import pytest
from unittest.mock import MagicMock, AsyncMock, patch, mock_open
import json
import asyncio
from backend.models import Project, SubProject, WorkPackage, Task, Status


class DummyButton:
    def __init__(self, text=""):
        self.text = text
        self.enabled = True


class DummyList:
    def __init__(self):
        self.enabled = True
        self.data = []


class DummySwitch:
    def __init__(self, value=True):
        self.enabled = True
        self.value = value

# --- MOCK TOGA BEFORE IMPORT ---
# We need a dummy App class that TalusMobile can inherit from
class DummyApp:
    def __init__(self, formal_name=None, app_id=None, **kwargs):
        self.formal_name = formal_name
        self.app_id = app_id
        self.main_window = MagicMock()
        self.commands = MagicMock() # Mock commands set
        
    def main_loop(self):
        pass

# Create a mock module for toga
mock_toga = MagicMock()
mock_toga.App = DummyApp
mock_toga.MainWindow = MagicMock
mock_toga.Box = MagicMock
mock_toga.Label = MagicMock
mock_toga.DetailedList = MagicMock
mock_toga.Button = MagicMock
mock_toga.Switch = MagicMock

# Create mock module for toga.style
mock_style = MagicMock()
mock_style.Pack = MagicMock()

# Patch sys.modules
with patch.dict('sys.modules', {
    'toga': mock_toga,
    'toga.style': mock_style,
    'toga.style.pack': MagicMock()
}):
    # Now we can safely import the app
    from frontend.mobile.app import TalusMobile

@pytest.fixture
def mock_project_data():
    return {
        "name": "Test Project",
        "sub_projects": [
            {
                "id": "SP-1", "name": "Sub1", "priority": 10,
                "work_packages": [
                    {
                        "id": "WP-1", "name": "WP1", "importance": 5,
                        "tasks": [
                            {
                                "id": "T-1", "text": "Task 1", "status": "pending", 
                                "estimated_cost": 100.0, "importance": 5
                            }
                        ]
                    }
                ]
            }
        ]
    }

@pytest.fixture
def app_instance():
    # Instantiate the app
    # Since we patched toga.App with DummyApp, this will work and use the real TalusMobile methods
    app = TalusMobile("Test App", "com.test.app")
    app.task_list = DummyList()
    app.save_btn = DummyButton("Save")
    app._default_save_text = "Save"
    app.add_btn = DummyButton("+")
    app.show_completed_switch = DummySwitch(True)
    app.data_path = "dummy_path.json"
    app.main_window.dialog = None
    app.main_window.info_dialog = MagicMock()
    app.main_window.error_dialog = MagicMock()
    app.main_window.question_dialog = AsyncMock(return_value=True)
    # Initialize attributes normally set in startup()
    app.project = None
    app.active_tasks = []
    app.is_dirty = False
    app.is_busy = False
    app.persistence = MagicMock()
    app.sync = None
    
    # Initialize engine manually since startup() isn't called in fixture
    from backend.engine import PriorityEngine
    app.engine = PriorityEngine()
    
    return app

def test_load_data_success(app_instance, mock_project_data):
    """Test that data is correctly loaded and flattened for the list."""
    
    # Mock file existence and content
    with patch("os.path.exists", return_value=True):
        with patch("builtins.open", mock_open(read_data=json.dumps(mock_project_data))):
            app_instance.load_from_disk(None)
            
    # Verify project was loaded
    assert app_instance.project is not None
    assert app_instance.project.name == "Test Project"
    
    # Verify list data population
    # We expect 1 task. 
    assert len(app_instance.task_list.data) == 1
    row = app_instance.task_list.data[0]
    assert row["title"] == "Task 1"
    assert "PENDING" in row["subtitle"]
    assert row["task"].id == "T-1"
    
    # Verify active_tasks list
    assert len(app_instance.active_tasks) == 1
    assert app_instance.active_tasks[0].id == "T-1"

def test_load_data_file_not_found(app_instance):
    """Test handling of missing data file."""
    with patch("os.path.exists", return_value=False):
        # Mock SyncManager to avoid network calls
        with patch("frontend.mobile.app.SyncManager") as MockSync:
            instance = MockSync.return_value
            instance.download_db.return_value = False
            
            app_instance.load_from_disk(None)
    
    # Should NOT show error dialog anymore, but start a new project
    app_instance.main_window.info_dialog.assert_not_called()
    assert app_instance.project is not None
    assert app_instance.project.name == "New Project"
    assert app_instance.is_dirty is True

def test_save_data(app_instance, mock_project_data):
    """Test that data is saved correctly."""
    app_instance.project = Project.model_validate(mock_project_data)

    # Mock load_from_disk to prevent it from running during save
    app_instance.load_from_disk = MagicMock()
    app_instance.sync_to_cloud = MagicMock(return_value=True)

    app_instance.save_data(None)

    # Verify persistence save was called
    app_instance.persistence.save.assert_called_with(app_instance.project)

    # Verify success dialog
    app_instance.main_window.info_dialog.assert_called_with("Saved", "Project updated successfully!")

    # Verify mark_clean was called (Save button disabled afterwards)
    assert app_instance.is_dirty is False
    assert app_instance.save_btn.enabled is False

    # Verify load_from_disk was called to refresh data
    app_instance.load_from_disk.assert_called_once_with(None)


def test_save_data_disables_interaction(app_instance, mock_project_data):
    app_instance.project = Project.model_validate(mock_project_data)
    app_instance.load_from_disk = MagicMock()
    app_instance.sync_to_cloud = MagicMock(return_value=True)

    observed = {"checked": False}

    def save_side_effect(*_):
        observed["checked"] = True
        assert app_instance.is_busy
        assert app_instance.save_btn.text == "Saving..."
        assert not app_instance.task_list.enabled
        assert not app_instance.add_btn.enabled

    app_instance.persistence.save.side_effect = save_side_effect

    app_instance.save_data(None)

    assert observed["checked"]
    assert not app_instance.is_busy
    assert app_instance.task_list.enabled
    assert app_instance.add_btn.enabled
    assert app_instance.save_btn.text == "Save"

def test_save_data_error(app_instance, mock_project_data):
    """Test error handling during save."""
    app_instance.project = Project.model_validate(mock_project_data)
    
    # Mock persistence to raise exception
    app_instance.persistence.save.side_effect = Exception("Disk full")
    
    app_instance.save_data(None)
    
    # Verify error dialog
    app_instance.main_window.error_dialog.assert_called_with("Save Error", "Disk full")

def test_filter_completed(app_instance, mock_project_data):
    """Test that completed tasks are hidden when switch is off."""
    # Add a completed task to the mock data
    mock_project_data["sub_projects"][0]["work_packages"][0]["tasks"].append({
        "id": "T-2", "text": "Task 2", "status": "complete", 
        "estimated_cost": 50.0, "importance": 5
    })
    
    app_instance.project = Project.model_validate(mock_project_data)
    
    # 1. Test with Switch ON (Show All)
    app_instance.show_completed_switch.value = True
    app_instance.refresh_table(None)
    assert len(app_instance.task_list.data) == 2
    
    # 2. Test with Switch OFF (Hide Completed)
    app_instance.show_completed_switch.value = False
    app_instance.refresh_table(None)
    assert len(app_instance.task_list.data) == 1
    assert app_instance.task_list.data[0]["title"] == "Task 1" # Only pending task remains
    assert app_instance.task_list.data[0]["title"] == "Task 1" # Only pending task remains

def test_on_task_select_complete(app_instance, mock_project_data):
    """Test clicking a row to complete a task."""
    # Setup state
    app_instance.project = Project.model_validate(mock_project_data)
    task = app_instance.project.sub_projects[0].work_packages[0].tasks[0]
    app_instance.active_tasks = [task]
    
    # Mock row object
    mock_row = MagicMock()
    mock_row.task = task
    
    # Mock the confirmation dialog to return True (Yes)
    # Since the method awaits it, we need an async mock
    async def async_return_true(*args, **kwargs):
        return True

    app_instance.main_window.dialog = None
    app_instance.main_window.question_dialog = async_return_true
    
    # Mock save_data
    app_instance.save_data = MagicMock()

    # Mock widget with selection
    mock_widget = MagicMock()
    mock_widget.selection = mock_row
    
    # Mock edit view elements
    app_instance.edit_task_input = MagicMock()
    app_instance.edit_est_cost_input = MagicMock()
    app_instance.edit_act_cost_input = MagicMock()
    app_instance.edit_status_select = MagicMock()
    app_instance.edit_view = MagicMock()
    
    # Run (no longer async)
    app_instance.on_task_select(mock_widget)
    
    # Verify it switched to edit view
    assert app_instance.main_window.content == app_instance.edit_view
    
    # Verify fields populated
    app_instance.edit_task_input.value = "Task 1"
    app_instance.edit_est_cost_input.value = 100.0
    app_instance.edit_status_select.value = "Pending"

def test_confirm_edit(app_instance, mock_project_data):
    """Test saving changes from the edit view."""
    app_instance.project = Project.model_validate(mock_project_data)
    task = app_instance.project.sub_projects[0].work_packages[0].tasks[0]
    
    # Setup Edit State
    app_instance.current_editing_task = task
    app_instance.edit_task_input = MagicMock()
    app_instance.edit_est_cost_input = MagicMock()
    app_instance.edit_act_cost_input = MagicMock()
    app_instance.edit_status_select = MagicMock()
    app_instance.list_view = MagicMock()
    
    # Simulate User Input
    app_instance.edit_task_input.value = "Updated Task"
    app_instance.edit_est_cost_input.value = 150.0
    app_instance.edit_act_cost_input.value = 50.0
    app_instance.edit_status_select.value = "Complete"
    
    # Confirm
    app_instance.confirm_edit(None)
    
    # Verify Task Updated
    assert task.text == "Updated Task"
    assert task.estimated_cost == 150.0
    assert task.actual_cost == 50.0
    assert task.status == Status.COMPLETE
    
    # Verify View Switch Back
    assert app_instance.main_window.content == app_instance.list_view
    assert app_instance.is_dirty is True


