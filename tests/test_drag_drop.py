import pytest
from backend.models import Project, SubProject, WorkPackage, Task, Status
from backend.manager import TaskManager

@pytest.fixture
def move_project():
    p = Project(name="Move Test")
    sp = SubProject(id="SP1", name="Engine")
    
    # Origin WP
    wp1 = WorkPackage(id="WP1", name="Top End")
    t1 = Task(id="T1", text="Spark Plugs", estimated_cost=10.0)
    wp1.tasks.append(t1)
    
    # Destination WP
    wp2 = WorkPackage(id="WP2", name="Ignition System")
    
    sp.work_packages = [wp1, wp2]
    p.sub_projects.append(sp)
    return p

def test_move_task_backend_logic(move_project):
    """Verify manager can move a task from WP1 to WP2."""
    mgr = TaskManager()
    
    # 1. Verify Initial State
    wp1 = move_project.sub_projects[0].work_packages[0]
    wp2 = move_project.sub_projects[0].work_packages[1]
    
    assert len(wp1.tasks) == 1
    assert len(wp2.tasks) == 0
    
    # 2. ACT: Move the Task
    # We need to implement this method
    mgr.move_task(move_project, "T1", "WP2")
    
    # 3. ASSERT: Verify New State
    assert len(wp1.tasks) == 0
    assert len(wp2.tasks) == 1
    assert wp2.tasks[0].id == "T1"
    assert wp2.tasks[0].text == "Spark Plugs"

def test_move_task_invalid_target(move_project):
    """Verify error handling if target WP doesn't exist."""
    mgr = TaskManager()
    with pytest.raises(ValueError):
        mgr.move_task(move_project, "T1", "BAD_ID")