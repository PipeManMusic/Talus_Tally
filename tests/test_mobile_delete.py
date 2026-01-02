import pytest
from unittest.mock import MagicMock, AsyncMock, patch
import asyncio
from backend.models import Project, Status

# --- MOCK TOGA BEFORE IMPORT ---
class DummyApp:
    def __init__(self, formal_name=None, app_id=None, **kwargs):
        self.formal_name = formal_name
        self.app_id = app_id
        self.main_window = MagicMock()
        self.commands = MagicMock()
    def main_loop(self): pass

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
mock_style = MagicMock()
mock_style.Pack = MagicMock()

with patch.dict('sys.modules', {'toga': mock_toga, 'toga.style': mock_style, 'toga.style.pack': MagicMock()}):
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
    app = TalusMobile("Test App", "com.test.app")
    app.task_list = MagicMock()
    app.save_btn = MagicMock()
    app.show_completed_switch = MagicMock()
    app.sync_from_cloud = MagicMock(return_value=False)
    app.sync_to_cloud = MagicMock(return_value=True)
    app.is_busy = False
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
    app.project = None
    app.active_tasks = []
    app.is_dirty = False
    app.persistence = MagicMock()
    return app

def test_delete_task(app_instance, mock_project_data):
    """Test deleting a task from the edit view."""
    app_instance.project = Project.model_validate(mock_project_data)
    task = app_instance.project.sub_projects[0].work_packages[0].tasks[0]
    
    # Setup Edit State
    app_instance.current_editing_task = task
    app_instance.list_view = MagicMock()
    
    # Mock confirmation dialog (Yes)
    app_instance.main_window.dialog = None
    app_instance.main_window.question_dialog = AsyncMock(return_value=True)
    
    # Run delete
    asyncio.run(app_instance.delete_task(None))
    
    # Verify Task Removed from Model
    wp = app_instance.project.sub_projects[0].work_packages[0]
    assert len(wp.tasks) == 0
    
    # Verify View Switch Back
    assert app_instance.main_window.content == app_instance.list_view
    assert app_instance.is_dirty is True
    
    # Verify Success Dialog
    app_instance.main_window.info_dialog.assert_called_with("Deleted", "Task removed.")
