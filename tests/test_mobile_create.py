import sys
import pytest
from unittest.mock import MagicMock, AsyncMock, patch, mock_open
from backend.models import Project, Status

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
mock_toga.Selection = MagicMock
mock_toga.TextInput = MagicMock
mock_toga.NumberInput = MagicMock

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
    app.task_list = MagicMock()
    app.add_btn = MagicMock()
    app.save_btn = MagicMock()
    app.show_completed_switch = MagicMock()
    app.show_completed_switch.value = True
    app.save_btn.enabled = False
    app.save_btn.text = "Save"
    app.add_btn.enabled = True
    app.task_list.enabled = True
    app.sync_from_cloud = MagicMock(return_value=False)
    app.sync_to_cloud = MagicMock(return_value=True)
    app._default_save_text = "Save"
    app.save_button = MagicMock()
    app.save_button.text = "Save"
    app.save_button.enabled = True
    app.sync_button = MagicMock()
    app.sync_button.enabled = True
    app.create_view = MagicMock()
    app.create_view.enabled = True
    app.main_window.toolbar = MagicMock()
    app.main_window.toolbar.enabled = True
    app.main_window.dialog = None
    app.main_window.info_dialog = MagicMock()
    app.main_window.error_dialog = MagicMock()
    app.main_window.question_dialog = AsyncMock(return_value=True)
    app.data_path = "dummy_path.json"
    # Initialize attributes normally set in startup()
    app.project = None
    app.active_tasks = []
    app.is_dirty = False
    app.is_busy = False
    app.sync = None
    app.persistence = MagicMock()
    
    # Initialize engine manually
    from backend.engine import PriorityEngine
    app.engine = PriorityEngine()
    
    # Initialize UI state flags
    app.is_new_sub = False
    app.is_new_wp = False
    
    return app

def test_create_task_ui_flow(app_instance, mock_project_data):
    """Test the flow of opening the create screen and adding a task."""
    app_instance.project = Project.model_validate(mock_project_data)
    
    # 1. Open Create Screen
    # Mock UI elements that are created in startup() or build_create_view()
    app_instance.sub_select = MagicMock()
    app_instance.wp_select = MagicMock()
    app_instance.task_input = MagicMock()
    app_instance.cost_input = MagicMock()
    app_instance.create_view = MagicMock()
    app_instance.list_view = MagicMock()
    
    # Mock new toggle elements
    app_instance.sub_container = MagicMock()
    app_instance.wp_container = MagicMock()
    app_instance.sub_toggle_btn = MagicMock()
    app_instance.wp_toggle_btn = MagicMock()
    app_instance.sub_input = MagicMock()
    app_instance.wp_input = MagicMock()
    
    # Initialize state
    app_instance.is_new_sub = False
    app_instance.is_new_wp = False
    
    # Call show_create_task
    app_instance.show_create_task(None)
    
    # Verify view switch
    assert app_instance.main_window.content == app_instance.create_view
    
    # Verify dropdown population
    # The mock data has 1 sub project "Sub1"
    assert app_instance.sub_select.items == ["Sub1"]
    # It should have triggered on_sub_change to populate WPs
    # But since we mocked the widgets, we need to check logic manually or trust the method called it.
    # In show_create_task, we manually call on_sub_change, so let's verify WP population logic there.
    
    # 2. Simulate User Input
    app_instance.sub_select.value = "Sub1"
    app_instance.wp_select.value = "WP1"
    app_instance.task_input.value = "New Mobile Task"
    app_instance.cost_input.value = 50.0
    
    # 3. Confirm Create
    app_instance.confirm_create(None)
    
    # Verify Task Added to Model
    sub = app_instance.project.sub_projects[0]
    wp = sub.work_packages[0]
    assert len(wp.tasks) == 2 # Original 1 + New 1
    new_task = wp.tasks[1]
    assert new_task.text == "New Mobile Task"
    assert new_task.estimated_cost == 50.0
    assert new_task.status == Status.PENDING
    
    # Verify View Switch Back
    assert app_instance.main_window.content == app_instance.list_view
    
    # Verify Dirty State
    assert app_instance.is_dirty is True
    
    # Verify Success Dialog
    app_instance.main_window.info_dialog.assert_called_with("Success", "Task created!")

def test_create_task_validation(app_instance, mock_project_data):
    """Test validation when creating a task."""
    app_instance.project = Project.model_validate(mock_project_data)
    
    # Mock UI
    app_instance.sub_select = MagicMock()
    app_instance.wp_select = MagicMock()
    app_instance.task_input = MagicMock()
    app_instance.cost_input = MagicMock()
    
    # Case 1: Empty Name
    app_instance.task_input.value = ""
    app_instance.confirm_create(None)
    app_instance.main_window.error_dialog.assert_called_with("Error", "Task name is required.")
    
    # Case 2: Missing Selection
    app_instance.task_input.value = "Valid Name"
    app_instance.sub_select.value = None # Simulate no selection
    app_instance.confirm_create(None)
    app_instance.main_window.error_dialog.assert_called_with("Error", "Must select Sub Project.")
