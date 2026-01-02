import pytest
from unittest.mock import patch, MagicMock
from PySide6.QtCore import Qt, QPoint
from PySide6.QtWidgets import QMenu, QTreeWidgetItem
from frontend.desktop.app import TalusWindow, TYPE_WP, ROLE_ID, ROLE_TYPE
from backend.models import Project, SubProject, WorkPackage

@pytest.fixture
def context_project():
    sp = SubProject(id="SP-TARGET", name="Target Sub", priority=5)
    wp = WorkPackage(id="WP-TARGET", name="Target WP", importance=5)
    sp.work_packages.append(wp)
    return Project(name="Context Test", sub_projects=[sp])

def test_wp_context_menu_has_add_task(qtbot, context_project):
    """Verify right-clicking a WP offers 'Add Task'."""
    window = TalusWindow()
    window.data_path = None # Prevent accidental overwrite of real data
    window.project_data = context_project
    window.populate_tree()
    qtbot.addWidget(window)

    # 1. Locate the WP Item in the Tree
    # Root (Sub) -> Child (WP)
    wp_item = window.tree.topLevelItem(0).child(0)
    assert wp_item.data(0, ROLE_ID) == "WP-TARGET"

    # 2. Simulate Context Menu Request
    # We can't easily click a QMenu in a test, so we verify the logic 
    # inside open_context_menu builds the menu correctly.
    
    # Mock the QMenu exec to capture what was added
    with patch("PySide6.QtWidgets.QMenu.exec") as mock_exec:
        with patch("PySide6.QtWidgets.QMenu.addAction") as mock_add:
            # Manually trigger the slot with a fake position
            # We must ensure itemAt returns our wp_item
            with patch.object(window.tree, "itemAt", return_value=wp_item):
                window.open_context_menu(QPoint(0,0))
            
            # 3. Check if "Add Task" was added to the menu
            # call_args_list is a list of calls. Each call is (args, kwargs).
            # We look for the text "Add Task" in the first argument of any call.
            found_add_task = False
            for call in mock_add.call_args_list:
                if "Add Task" in call[0][0]: # Arg 0 is the text
                    found_add_task = True
                    break
            
            assert found_add_task, "Context menu for WP missing 'Add Task' option"

def test_add_task_contextual_prefill(qtbot, context_project):
    """Verify that using the context action prefills the correct IDs."""
    window = TalusWindow()
    window.project_data = context_project
    window.populate_tree()
    qtbot.addWidget(window)
    
    # We verify the logic flow:
    # Trigger add_task_contextual("SP-TARGET", "WP-TARGET") -> TaskDialog
    
    with patch("frontend.desktop.app.TaskDialog") as MockDialog:
        # Mock instance
        mock_instance = MockDialog.return_value
        mock_instance.exec.return_value = False # Don't actually run it
        
        # Call the specific helper we are about to create
        window.open_add_task_dialog(pre_sub="SP-TARGET", pre_wp="WP-TARGET")
        
        # Verify TaskDialog was initialized with our overrides
        # Call args: (project, parent, task_to_edit, default_sub, default_wp)
        call_args = MockDialog.call_args
        assert call_args.kwargs['default_sub'] == "SP-TARGET"
        assert call_args.kwargs['default_wp'] == "WP-TARGET"