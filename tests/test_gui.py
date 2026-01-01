import pytest
from PySide6.QtWidgets import QDialogButtonBox
from PySide6.QtCore import Qt
from backend.models import Project, SubProject, WorkPackage
from frontend.app import AddTaskDialog

# Fixture to create a dummy project for the GUI to interact with
@pytest.fixture
def test_project():
    p = Project(name="Test Project")
    sub = SubProject(id="SP-1", name="Sub1")
    wp = WorkPackage(id="WP-1", name="Work1")
    sub.work_packages.append(wp)
    p.sub_projects.append(sub)
    return p

def test_add_task_dialog_logic(qtbot, test_project):
    """
    TDD: Verify that the AddTaskDialog collects data and returns the correct dict.
    We use qtbot to interact with the widget without a human.
    """
    # 1. ARRANGE: Open the dialog
    dialog = AddTaskDialog(test_project)
    qtbot.addWidget(dialog)
    
    # 2. ACT: Fill in the form programmatically
    # Select SubProject (Index 0 is the one we added)
    dialog.sub_input.setCurrentIndex(0) 
    
    # Select WorkPackage (Wait for the combo box to populate)
    assert dialog.wp_input.count() > 0
    dialog.wp_input.setCurrentIndex(0)
    
    # Type in the inputs
    qtbot.keyClicks(dialog.name_input, "New Brake Lines")
    dialog.cost_input.setValue(150.0)
    dialog.budget_input.setValue(8)
    dialog.imp_input.setValue(9)
    
    # 3. ASSERT: Check the data *before* we even click OK (Unit Test the Form)
    data = dialog.get_data()
    
    assert data["sub_id"] == "SP-1"
    assert data["wp_id"] == "WP-1"
    assert data["name"] == "New Brake Lines"
    assert data["cost"] == 150.0
    assert data["budget"] == 8
    assert data["importance"] == 9

def test_gui_complete_task_action(qtbot, test_project):
    """
    TDD: Verify that invoking the complete action updates the item color and status.
    """
    from frontend.app import TalusWindow
    from PySide6.QtCore import Qt
    from backend.models import Status, Task, WorkPackage, SubProject
    
    # 1. ARRANGE: Setup a window with one pending task
    # We need a fresh window that uses our test_project
    window = TalusWindow()
    # Inject our test project manually to bypass file loading
    window.project_data = test_project
    
    # Add a specific task to find
    task = Task(id="T-TEST", text="Paint Hood", status=Status.PENDING)
    test_project.sub_projects[0].work_packages[0].tasks.append(task)
    
    # Refresh tree to show it
    window.populate_tree(test_project)
    qtbot.addWidget(window)
    
    # 2. ACT: Find the item and simulate "Mark Complete"
    # (In the real app, this will be a Context Menu action, here we call the method directly)
    # We expect a method named "mark_selected_complete" to exist
    
    # Select the item (it is deep in the tree)
    # Root -> Sub -> WP -> Task
    iterator = window.tree.topLevelItem(0).child(0).child(0)
    window.tree.setCurrentItem(iterator)
    
    # Call the action (This method does not exist yet -> RED)
    window.mark_selected_complete()
    
    # 3. ASSERT
    assert task.status == Status.COMPLETE
    # Check visual feedback (Green color)
    assert iterator.foreground(0).color() == Qt.green
