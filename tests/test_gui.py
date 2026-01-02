import json
import pytest
from PySide6.QtCore import Qt
from PySide6.QtWidgets import QMessageBox
from unittest.mock import patch, MagicMock
from frontend.desktop.app import TaskDialog, TalusWindow, SubProjectDialog, WorkPackageDialog
from backend.models import Project, SubProject, WorkPackage, Task, Status
from backend.sync import DropboxSyncConflict

@pytest.fixture(autouse=True)
def isolate_app_data_dir(monkeypatch, tmp_path):
    data_root = tmp_path / "talus_appdata"
    monkeypatch.setenv("TALUS_TALLY_DATA_DIR", str(data_root))
    monkeypatch.setenv("TALUS_TALLY_DISABLE_DROPBOX", "1")
    yield data_root

@pytest.fixture
def test_project():
    sp1 = SubProject(id="SP-1", name="Suspension", priority=5)
    wp1 = WorkPackage(id="WP-1", name="Front", importance=5)
    wp2 = WorkPackage(id="WP-2", name="Rear", importance=5)
    sp1.work_packages = [wp1, wp2]
    
    sp2 = SubProject(id="SP-2", name="Engine", priority=5)
    wp3 = WorkPackage(id="WP-3", name="Block", importance=5)
    sp2.work_packages = [wp3]
    
    return Project(name="Test Project", sub_projects=[sp1, sp2])

# --- MEMORY / DEFAULTS TEST (New) ---
def test_task_dialog_defaults(qtbot, test_project):
    """Verify dialog defaults to the specific Sub/WP requested."""
    # Case 1: Default to SP-2 (Engine) / WP-3 (Block)
    dialog = TaskDialog(test_project, default_sub="SP-2", default_wp="WP-3")
    qtbot.addWidget(dialog)
    
    assert dialog.sub_input.currentData() == "SP-2"
    assert dialog.wp_input.currentData() == "WP-3"

def test_window_remembers_last_selection(qtbot, test_project):
    """Verify the window tracks what we just created."""
    window = TalusWindow()
    window.data_path = None # Prevent accidental overwrite of real data
    window.project_data = test_project
    
    # 1. Add a Sub-Project -> Should become default
    with patch.object(SubProjectDialog, 'exec', return_value=True):
        with patch.object(SubProjectDialog, 'get_data', return_value={"name": "New SP", "priority": 5}):
            window.add_sub_project_dialog()
            
    # The new SP ID is random, so we just check it updated
    assert window.last_sub_id is not None
    assert window.last_sub_id != "SP-1" # It's the new one
    
    # 2. Add a Work Package -> Should become default
    target_sp = window.project_data.sub_projects[0].id # SP-1
    with patch.object(WorkPackageDialog, 'exec', return_value=True):
        with patch.object(WorkPackageDialog, 'get_data', return_value={"name": "New WP", "importance": 5}):
            window.add_work_package_dialog(target_sp)
            
    assert window.last_wp_id is not None
    assert window.last_sub_id == target_sp


def test_window_loads_dropbox_data(qtbot, isolate_app_data_dir, monkeypatch):
    data_dir = isolate_app_data_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    data_path = data_dir / "talus_master.json"
    payload = {"name": "Dropbox Project", "sub_projects": []}
    data_path.write_text(json.dumps(payload))

    window = TalusWindow()
    qtbot.addWidget(window)

    assert window.data_path == str(data_path)
    assert window.project_data is not None
    assert window.project_data.name == "Dropbox Project"
    window.close()

# --- EXISTING TESTS (Preserved) ---
def test_sub_project_dialog(qtbot):
    dialog = SubProjectDialog()
    qtbot.addWidget(dialog)
    qtbot.keyClicks(dialog.name_input, "New Sub")
    dialog.priority_input.setValue(8)
    data = dialog.get_data()
    assert data["name"] == "New Sub"
    assert data["priority"] == 8

def test_work_package_dialog(qtbot):
    dialog = WorkPackageDialog()
    qtbot.addWidget(dialog)
    qtbot.keyClicks(dialog.name_input, "New WP")
    dialog.importance_input.setValue(9)
    data = dialog.get_data()
    assert data["name"] == "New WP"
    assert data["importance"] == 9

def test_task_dialog_add(qtbot, test_project):
    dialog = TaskDialog(test_project)
    qtbot.addWidget(dialog)
    dialog.sub_input.setCurrentIndex(0)
    dialog.wp_input.setCurrentIndex(0)
    qtbot.keyClicks(dialog.name_input, "New Task")
    dialog.est_cost_input.setValue(150.0)
    data = dialog.get_data()
    assert data["name"] == "New Task"
    assert data["est_cost"] == 150.0
    assert data["sub_id"] == "SP-1"

def test_add_sub_project_action(qtbot, test_project):
    window = TalusWindow()
    window.data_path = None # Prevent accidental overwrite of real data
    window.project_data = test_project
    with patch.object(SubProjectDialog, 'exec', return_value=True):
        with patch.object(SubProjectDialog, 'get_data', return_value={"name": "Added Sub", "priority": 5}):
            window.add_sub_project_dialog()
    assert len(window.project_data.sub_projects) == 3 # 2 fixture + 1 new

def test_add_work_package_action(qtbot, test_project):
    window = TalusWindow()
    window.data_path = None # Prevent accidental overwrite of real data
    window.project_data = test_project
    with patch.object(WorkPackageDialog, 'exec', return_value=True):
        with patch.object(WorkPackageDialog, 'get_data', return_value={"name": "Added WP", "importance": 5}):
            window.add_work_package_dialog("SP-1")
    assert len(window.project_data.sub_projects[0].work_packages) == 3 # 2 fixture + 1 new

def test_edit_actions(qtbot, test_project):
    window = TalusWindow()
    window.data_path = None # Prevent accidental overwrite of real data
    window.project_data = test_project
    with patch.object(SubProjectDialog, 'exec', return_value=True):
        with patch.object(SubProjectDialog, 'get_data', return_value={"name": "Renamed Sub", "priority": 10}):
            window.edit_sub_project("SP-1")
    assert window.project_data.sub_projects[0].name == "Renamed Sub"

    with patch.object(WorkPackageDialog, 'exec', return_value=True):
        with patch.object(WorkPackageDialog, 'get_data', return_value={"name": "Renamed WP", "importance": 10}):
            window.edit_work_package("WP-1")
    assert window.project_data.sub_projects[0].work_packages[0].name == "Renamed WP"

def test_delete_actions(qtbot, test_project):
    window = TalusWindow()
    window.data_path = None # Prevent accidental overwrite of real data
    window.project_data = test_project
    with patch("PySide6.QtWidgets.QMessageBox.question", return_value=QMessageBox.Yes):
        window.delete_work_package("WP-1")
    assert len(window.project_data.sub_projects[0].work_packages) == 1
    
    with patch("PySide6.QtWidgets.QMessageBox.question", return_value=QMessageBox.Yes):
        window.delete_sub_project("SP-1")
    assert len(window.project_data.sub_projects) == 1

def test_new_project_reset(qtbot):
    window = TalusWindow()
    window.project_data.name = "Old Project"
    window.new_project()
    assert window.project_data.name == "Bronco II Restoration"

def test_save_load_logic(qtbot, tmp_path):
    window = TalusWindow()
    project = Project(name="Save Test")
    window.project_data = project
    p = tmp_path / "test_save.json"
    window.data_path = str(p)
    with patch("frontend.desktop.app.DocInjector"):
        window.save_project()
    assert p.exists()
    window.project_data = None
    window.load_project()
    assert window.project_data.name == "Save Test"


def test_save_conflict_keeps_dirty(qtbot, tmp_path):
    window = TalusWindow()
    qtbot.addWidget(window)
    window.project_data = Project(name="Conflict Test")
    window.is_dirty = True
    target = tmp_path / "conflict.json"
    window.data_path = str(target)

    class ConflictSync:
        def upload_db(self, _):
            raise DropboxSyncConflict()

    window.sync = ConflictSync()

    with patch("frontend.desktop.app.DocInjector"):
        with patch("PySide6.QtWidgets.QMessageBox.warning") as warn:
            window.save_project()

    assert target.exists()
    assert window.is_dirty
    warn.assert_called()
    window.close()

def test_manual_push(qtbot, test_project):
    window = TalusWindow()
    window.data_path = None # Prevent accidental overwrite of real data
    window.project_data = test_project
    window.data_path = "test.json"
    with patch("PySide6.QtWidgets.QInputDialog.getText", return_value=("Manual Sync", True)):
        with patch.object(window.git, 'push_update') as mock_push:
             with patch("frontend.desktop.app.DocInjector"):
                window.manual_push()
                mock_push.assert_called_with("Manual Sync")
    window.close()


def test_manual_sync_without_credentials(qtbot):
    window = TalusWindow()
    qtbot.addWidget(window)
    window.sync = None

    with patch("PySide6.QtWidgets.QMessageBox.information") as info:
        window.manual_sync()

    info.assert_called_once()
    window.close()


def test_manual_sync_aborts_on_dirty_cancel(qtbot):
    window = TalusWindow()
    qtbot.addWidget(window)
    window.sync = MagicMock()
    window.is_dirty = True

    with patch("PySide6.QtWidgets.QMessageBox.question", return_value=QMessageBox.No):
        with patch.object(window, "sync_from_cloud") as sync_mock:
            window.manual_sync()

    sync_mock.assert_not_called()
    window.close()


def test_manual_sync_success_loads_from_disk(qtbot):
    window = TalusWindow()
    qtbot.addWidget(window)
    window.sync = MagicMock()
    window.is_dirty = False

    with patch.object(window, "sync_from_cloud", return_value=True) as sync_mock:
        with patch.object(window, "load_project") as load_mock:
            window.manual_sync()

    sync_mock.assert_called_once()
    load_mock.assert_called_once_with(skip_remote=True)
    assert window.central_widget.isEnabled()
    window.close()


def test_save_disables_ui_during_operation(qtbot, tmp_path):
    window = TalusWindow()
    qtbot.addWidget(window)
    window.project_data = Project(name="Busy")
    window.data_path = str(tmp_path / "busy.json")

    with patch("frontend.desktop.app.PersistenceManager") as MockPM:
        pm_instance = MockPM.return_value

        def save_side_effect(*_):
            assert not window.central_widget.isEnabled()
            assert all(not action.isEnabled() for action in window._interactive_actions)

        pm_instance.save.side_effect = save_side_effect

        with patch("frontend.desktop.app.DocInjector"):
            with patch.object(window, "sync_to_cloud", return_value=True):
                window.save_project()

    assert window.central_widget.isEnabled()
    assert all(action.isEnabled() for action in window._interactive_actions)
    assert window.statusBar().currentMessage() == "Save complete"
    window.close()