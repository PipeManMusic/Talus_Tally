import pytest
from unittest.mock import MagicMock, AsyncMock, patch
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
                        "tasks": []
                    }
                ]
            }
        ]
    }

@pytest.fixture
def app_instance():
    app = TalusMobile("Test App", "com.test.app")
    app.task_list = MagicMock()
    app.add_btn = MagicMock()
    app.save_btn = MagicMock()
    app.show_completed_switch = MagicMock()
    app.task_list.enabled = True
    app.add_btn.enabled = True
    app.save_btn.enabled = False
    app.save_btn.text = "Save"
    app.show_completed_switch.value = True
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
    app.sync = None
    app.persistence = MagicMock()
    
    # Initialize engine manually
    from backend.engine import PriorityEngine
    app.engine = PriorityEngine()
    
    return app

def test_create_new_sub_and_wp(app_instance, mock_project_data):
    """Test creating a task with a NEW Sub Project and NEW Work Package."""
    app_instance.project = Project.model_validate(mock_project_data)
    
    # Mock UI
    app_instance.sub_input = MagicMock()
    app_instance.wp_input = MagicMock()
    app_instance.task_input = MagicMock()
    app_instance.cost_input = MagicMock()
    app_instance.list_view = MagicMock()
    
    # Set state to "New" mode
    app_instance.is_new_sub = True
    app_instance.is_new_wp = True
    
    # Input Data
    app_instance.sub_input.value = "New Sub"
    app_instance.wp_input.value = "New WP"
    app_instance.task_input.value = "Task in New Structure"
    app_instance.cost_input.value = 200.0
    
    # Confirm
    app_instance.confirm_create(None)
    
    # Verify Model Updates
    # Should have 2 sub projects now
    assert len(app_instance.project.sub_projects) == 2
    new_sub = app_instance.project.sub_projects[1]
    assert new_sub.name == "New Sub"
    
    # Should have 1 WP in new sub
    assert len(new_sub.work_packages) == 1
    new_wp = new_sub.work_packages[0]
    assert new_wp.name == "New WP"
    
    # Should have 1 task in new WP
    assert len(new_wp.tasks) == 1
    new_task = new_wp.tasks[0]
    assert new_task.text == "Task in New Structure"
    assert new_task.estimated_cost == 200.0
    
    # Verify Success
    app_instance.main_window.info_dialog.assert_called_with("Success", "Task created!")

def test_toggle_logic(app_instance):
    """Test the UI toggle logic for switching between Select and New."""
    # Mock UI containers
    app_instance.sub_container = MagicMock()
    app_instance.sub_select = MagicMock()
    app_instance.sub_input = MagicMock()
    app_instance.sub_toggle_btn = MagicMock()
    app_instance.wp_container = MagicMock()
    app_instance.wp_select = MagicMock()
    app_instance.wp_input = MagicMock()
    app_instance.wp_toggle_btn = MagicMock()
    app_instance.main_window = MagicMock()
    
    # Initial State
    app_instance.is_new_sub = False
    app_instance.is_new_wp = False
    
    # 1. Toggle Sub to New
    app_instance.toggle_sub_mode(None)
    assert app_instance.is_new_sub is True
    app_instance.sub_container.remove.assert_any_call(app_instance.sub_select)
    app_instance.sub_container.add.assert_any_call(app_instance.sub_input)
    
    # 2. Toggle Sub back to Select
    app_instance.toggle_sub_mode(None)
    assert app_instance.is_new_sub is False
    app_instance.sub_container.remove.assert_any_call(app_instance.sub_input)
    app_instance.sub_container.add.assert_any_call(app_instance.sub_select)
