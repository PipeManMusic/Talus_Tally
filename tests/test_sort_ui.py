import pytest
from unittest.mock import patch, MagicMock
from frontend.desktop.app import TalusWindow
from backend.models import Project, SubProject, WorkPackage, Task

@pytest.fixture
def unsorted_project():
    """Creates a project with tasks in the WRONG order."""
    sp = SubProject(id="SP-1", name="Suspension", priority=10)
    wp = WorkPackage(id="WP-1", name="Front", importance=10)
    
    # Task 1: Low Value (Should be last)
    # FIX: Set cost to 1000.0 so it doesn't get an "Infinite/Free" score
    t_low = Task(id="T1", text="Clean Mud", estimated_cost=1000.0, importance=1)
    
    # Task 2: High Value (Should be first)
    # High Importance (10) + High Sub Priority (10) / Low Cost ($5) = Huge Score
    t_high = Task(id="T2", text="Replace Bushings", estimated_cost=5.0, importance=10)
    
    wp.tasks = [t_low, t_high] # Wrong order
    sp.work_packages.append(wp)
    return Project(name="Test Sort", sub_projects=[sp])

def test_sort_button_reorders_tree(qtbot, unsorted_project):
    """Verify that clicking the Sort Action updates the TreeView order."""
    window = TalusWindow()
    window.data_path = None # Prevent accidental overwrite of real data
    window.project_data = unsorted_project
    window.populate_tree()
    qtbot.addWidget(window)
    
    # 1. Verify Initial Order (Wrong)
    wp_item = window.tree.topLevelItem(0).child(0)
    assert wp_item.child(0).text(0) == "Clean Mud"     # Index 0
    assert wp_item.child(1).text(0) == "Replace Bushings" # Index 1
    
    # 2. Trigger Sort (Direct Call)
    window.sort_by_velocity()
    
    # 3. Verify New Order (Correct)
    wp_item = window.tree.topLevelItem(0).child(0)
    assert wp_item.child(0).text(0) == "Replace Bushings" # High score should float to top
    assert wp_item.child(1).text(0) == "Clean Mud"