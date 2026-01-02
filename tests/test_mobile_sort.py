import pytest
from unittest.mock import MagicMock, patch, mock_open
import json
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
    app.save_btn = MagicMock()
    app.show_completed_switch = MagicMock()
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
    app.data_path = "dummy_path.json"
    app.project = None
    app.active_tasks = []
    app.is_dirty = False
    app.persistence = MagicMock()
    # Initialize engine manually since startup() isn't called in fixture
    from backend.engine import PriorityEngine
    app.engine = PriorityEngine()
    return app

def test_mobile_sort_order(app_instance, mock_project_data):
    """Test that tasks are sorted by velocity score."""
    # Setup Data
    # Task 1: High Cost, Low Importance (Low Score)
    task1 = {
        "id": "T-1", "text": "Expensive Task", "status": "pending", 
        "estimated_cost": 1000.0, "importance": 1, "budget_priority": 1
    }
    # Task 2: Low Cost, High Importance (High Score)
    task2 = {
        "id": "T-2", "text": "Cheap Important Task", "status": "pending", 
        "estimated_cost": 10.0, "importance": 10, "budget_priority": 10
    }
    
    mock_project_data["sub_projects"][0]["work_packages"][0]["tasks"] = [task1, task2]
    
    # Load Data
    with patch("builtins.open", mock_open(read_data=json.dumps(mock_project_data))):
        with patch("os.path.exists", return_value=True):
            app_instance.load_from_disk(None)
            
    # Verify Order
    # Task 2 should be first because it has a higher velocity score
    assert len(app_instance.task_list.data) == 2
    
    first_item = app_instance.task_list.data[0]
    second_item = app_instance.task_list.data[1]
    
    assert first_item["title"] == "Cheap Important Task"
    assert second_item["title"] == "Expensive Task"
    
    # Verify Score is in subtitle
    assert "[" in first_item["subtitle"]
