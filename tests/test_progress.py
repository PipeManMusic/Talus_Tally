import pytest
from PySide6.QtWidgets import QProgressBar
from frontend.desktop.app import TalusWindow, TYPE_SUB, ROLE_ID
from backend.models import Project, SubProject, WorkPackage, Task, Status

@pytest.fixture
def progress_project():
    """
    Creates a project with:
    - SP1: 50% Complete (1 Done, 1 Pending)
    - SP2: 0% Complete (No tasks)
    - SP3: 100% Complete (1 Done)
    Total: 3 Tasks, 2 Done => ~66% Global
    """
    p = Project(name="Progress Test")
    
    # SP1: 50%
    sp1 = SubProject(id="SP-1", name="Half Way", priority=5)
    wp1 = WorkPackage(id="WP-1", name="WP1")
    t1 = Task(id="T1", text="Done", status=Status.COMPLETE)
    t2 = Task(id="T2", text="Pending", status=Status.PENDING)
    wp1.tasks = [t1, t2]
    sp1.work_packages.append(wp1)
    
    # SP2: 0% (Empty)
    sp2 = SubProject(id="SP-2", name="Empty", priority=5)
    
    # SP3: 100%
    sp3 = SubProject(id="SP-3", name="Done", priority=5)
    wp3 = WorkPackage(id="WP-3", name="WP3")
    t3 = Task(id="T3", text="Finished", status=Status.COMPLETE)
    wp3.tasks = [t3]
    sp3.work_packages.append(wp3)
    
    p.sub_projects = [sp1, sp2, sp3]
    return p

def test_progress_calculation_and_widget(qtbot, progress_project):
    """Verify that tree progress bars appear and show correct values."""
    window = TalusWindow()
    window.data_path = None # Prevent accidental overwrite of real data
    window.project_data = progress_project
    window.populate_tree()
    qtbot.addWidget(window)
    
    # Helper to find top level items by Sub ID
    def get_item_by_id(uid):
        root = window.tree.invisibleRootItem()
        for i in range(root.childCount()):
            item = root.child(i)
            if item.data(0, ROLE_ID) == uid:
                return item
        return None

    # Check SP1 (50%)
    item1 = get_item_by_id("SP-1")
    widget1 = window.tree.itemWidget(item1, 1)
    assert isinstance(widget1, QProgressBar)
    assert widget1.value() == 50
    
    # TEST: Verify CSS Alignment Logic
    style1 = widget1.styleSheet()
    assert "text-align: center" in style1, "Progress bar text must be centered"
    assert "background-color: #4caf50" in style1, "Progress bar chunk should be green"

    # Check SP2 (0%)
    item2 = get_item_by_id("SP-2")
    widget2 = window.tree.itemWidget(item2, 1)
    assert isinstance(widget2, QProgressBar)
    assert widget2.value() == 0
    
    # Check SP3 (100%)
    item3 = get_item_by_id("SP-3")
    widget3 = window.tree.itemWidget(item3, 1)
    assert isinstance(widget3, QProgressBar)
    assert widget3.value() == 100

def test_global_progress_bar(qtbot, progress_project):
    """Verify the global progress bar in the status bar."""
    window = TalusWindow()
    window.project_data = progress_project
    # We need to call update_tally manually or via populate because that's where the update logic will live
    window.update_tally() 
    qtbot.addWidget(window)

    # 1. Access the global progress bar
    # It should be a member variable of the window for easy access
    assert hasattr(window, "global_pbar"), "Window missing global_pbar attribute"
    pbar = window.global_pbar
    
    # 2. Check Logic
    # Total Tasks: 3, Done: 2.  2/3 = 66%
    assert pbar.value() == 66
    
    # 3. Check Styling matches
    style = pbar.styleSheet()
    assert "text-align: center" in style
    assert "background-color: #4caf50" in style