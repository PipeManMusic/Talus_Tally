import pytest
from PySide6.QtWidgets import QDialogButtonBox
from PySide6.QtCore import Qt
from backend.models import Project, SubProject, WorkPackage, Task, Status
from frontend.app import AddTaskDialog, TalusWindow

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
    UPDATED: Now uses ComboBoxes instead of SpinBoxes.
    """
    # 1. ARRANGE
    dialog = AddTaskDialog(test_project)
    qtbot.addWidget(dialog)
    
    # 2. ACT
    dialog.sub_input.setCurrentIndex(0) 
    assert dialog.wp_input.count() > 0
    dialog.wp_input.setCurrentIndex(0)
    
    qtbot.keyClicks(dialog.name_input, "New Brake Lines")
    dialog.cost_input.setValue(150.0)
    
    # FIX: Select "Smart Investment" (Value 7) for Budget
    # We find the index for text containing "Smart"
    for i in range(dialog.budget_input.count()):
        if "Smart" in dialog.budget_input.itemText(i):
            dialog.budget_input.setCurrentIndex(i)
            break
            
    # FIX: Select "Core Mechanical" (Value 8) for Importance
    for i in range(dialog.imp_input.count()):
        if "Core" in dialog.imp_input.itemText(i):
            dialog.imp_input.setCurrentIndex(i)
            break
    
    # 3. ASSERT
    data = dialog.get_data()
    
    assert data["sub_id"] == "SP-1"
    assert data["wp_id"] == "WP-1"
    assert data["name"] == "New Brake Lines"
    assert data["cost"] == 150.0
    assert data["budget"] == 7   # Updated expectation
    assert data["importance"] == 8 # Updated expectation

def test_add_task_semantic_selectors(qtbot, test_project):
    """
    TDD: Verify that selecting a text description (e.g., Safety) maps to the correct integer (10).
    """
    dialog = AddTaskDialog(test_project)
    qtbot.addWidget(dialog)
    
    # Select "Safety" (Value 10)
    for i in range(dialog.imp_input.count()):
        if "Safety" in dialog.imp_input.itemText(i):
            dialog.imp_input.setCurrentIndex(i)
            break
            
    # Select "High Value" (Value 10)
    for i in range(dialog.budget_input.count()):
        if "High Value" in dialog.budget_input.itemText(i):
            dialog.budget_input.setCurrentIndex(i)
            break
    
    data = dialog.get_data()
    assert data["importance"] == 10
    assert data["budget"] == 10

def test_gui_complete_task_action(qtbot, test_project):
    """
    TDD: Verify that invoking the complete action updates the item color and status.
    """
    window = TalusWindow()
    window.project_data = test_project
    
    task = Task(id="T-TEST", text="Paint Hood", status=Status.PENDING)
    test_project.sub_projects[0].work_packages[0].tasks.append(task)
    
    window.populate_tree(test_project)
    qtbot.addWidget(window)
    
    iterator = window.tree.topLevelItem(0).child(0).child(0)
    window.tree.setCurrentItem(iterator)
    
    window.mark_selected_complete()
    
    assert task.status == Status.COMPLETE
    assert iterator.foreground(0).color() == Qt.green

def test_velocity_sort_button(qtbot, test_project):
    """
    TDD: Verify that the Sort button reorders tasks based on Financial Velocity.
    """
    from frontend.app import TalusWindow
    from backend.models import Task
    from backend.engine import PriorityEngine
    
    # 1. ARRANGE
    window = TalusWindow()
    window.project_data = test_project
    
    # Task A: Money Pit (Cost $1000, Importance 1) -> Low Score
    task_low = Task(id="T-LOW", text="Gold Plated Ash Tray", 
                   estimated_cost=1000.0, importance=1, budget_priority=1)
                   
    # Task B: Quick Win (Cost $5, Importance 10) -> High Score
    task_high = Task(id="T-HIGH", text="Fix Brakes", 
                    estimated_cost=5.0, importance=10, budget_priority=10)
    
    # Add them in the "wrong" order (Low first)
    wp = test_project.sub_projects[0].work_packages[0]
    wp.tasks = [task_low, task_high]
    
    window.populate_tree(test_project)
    qtbot.addWidget(window)
    
    # Check initial order (Index 0 should be T-LOW)
    top_item = window.tree.topLevelItem(0).child(0)
    assert top_item.child(0).text(0) == "Gold Plated Ash Tray"
    
    # 2. ACT: Click "Sort by Velocity"
    # We expect a method sort_by_velocity to exist
    window.sort_by_velocity()
    
    # 3. ASSERT: The order should flip
    # The first task under the WP should now be T-HIGH
    top_item = window.tree.topLevelItem(0).child(0)
    assert top_item.child(0).text(0) == "Fix Brakes"
