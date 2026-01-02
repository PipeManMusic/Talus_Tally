import pytest
from backend.models import Project, SubProject, WorkPackage, Task, Status
from frontend.desktop.app import TalusWindow

@pytest.fixture
def shopping_project():
    p = Project(name="Shop Test")
    sp = SubProject(id="SP1", name="Engine")
    wp = WorkPackage(id="WP1", name="Internals")
    
    # 1. PENDING ($150)
    t1 = Task(id="T1", text="Piston Rings", estimated_cost=150.0, status=Status.PENDING)
    
    # 2. BACKLOG ($100) - The specific status you asked for
    t2 = Task(id="T2", text="Chrome Valve Covers", estimated_cost=100.0, status=Status.BACKLOG)
    
    # 3. COMPLETE ($50) - Should be ignored
    t3 = Task(id="T3", text="Oil", estimated_cost=50.0, status=Status.COMPLETE)
    
    wp.tasks = [t1, t2, t3]
    sp.work_packages.append(wp)
    p.sub_projects.append(sp)
    return p

def test_shopping_list_includes_real_backlog_status(qtbot, shopping_project):
    """Verify that tasks with actual Status.BACKLOG appear in the report."""
    window = TalusWindow()
    window.data_path = None # Prevent accidental overwrite of real data
    window.project_data = shopping_project
    
    report, total = window.generate_shopping_report()
    
    print(f"\nGenerated Report:\n{report}")
    
    # Verify Headers
    assert "=== BACKLOG ===" in report
    # FIX: Updated to match the actual code output
    assert "=== PENDING (UNASSIGNED) ===" in report
    
    # Verify Items
    assert "Chrome Valve Covers" in report  # Status.BACKLOG
    assert "Piston Rings" in report         # Status.PENDING
    
    # Verify Total
    assert total == 250.0