import pytest
from backend.models import Project, SubProject, WorkPackage, Task

# This import will fail initially (This is expected!)
from backend.manager import TaskManager

def test_add_task_to_existing_hierarchy():
    """Test adding a basic task to the project."""
    project = Project()
    sub = SubProject(id="SP-1", name="Mechanic")
    wp = WorkPackage(id="WP-1", name="Engine")
    sub.work_packages.append(wp)
    project.sub_projects.append(sub)
    
    manager = TaskManager()
    
    # ACT: Add a new task
    new_task = Task(id="T-100", text="Buy Oil", estimated_cost=20.0, budget_priority=10)
    updated_project = manager.add_task(project, "SP-1", "WP-1", new_task)
    
    # ASSERT
    target_wp = updated_project.sub_projects[0].work_packages[0]
    assert len(target_wp.tasks) == 1
    assert target_wp.tasks[0].id == "T-100"

def test_timeline_dependency():
    """Test that we can make Task A block Task B (Timeline Priority)."""
    project = Project()
    sub = SubProject(id="SP-1", name="Mechanic")
    wp = WorkPackage(id="WP-1", name="Engine")
    
    # Task B (The thing we want to do eventually)
    task_b = Task(id="T-B", text="Install Pistons")
    # Task A (The thing that must happen FIRST)
    task_a = Task(id="T-A", text="Machine Block")
    
    wp.tasks = [task_a, task_b]
    sub.work_packages = [wp]
    project.sub_projects = [sub]
    
    manager = TaskManager()
    
    # ACT: Tell manager that A blocks B
    manager.set_dependency(project, blocker_id="T-A", blocked_id="T-B")
    
    # ASSERT: Task A should now record that it blocks B
    # Note: We assume the model has a "blocking" field (List[str])
    assert "T-B" in task_a.blocking

def test_complete_task_logic():
    """
    TDD: Verify manager can find a task by ID and mark it COMPLETE.
    """
    from backend.models import Project, SubProject, WorkPackage, Task, Status
    from backend.manager import TaskManager
    import datetime

    # 1. ARRANGE
    project = Project()
    sub = SubProject(id="SP-1", name="Sub")
    wp = WorkPackage(id="WP-1", name="WP")
    
    # Create a task that is PENDING
    task = Task(id="T-500", text="Fix Brakes", status=Status.PENDING)
    
    wp.tasks.append(task)
    sub.work_packages.append(wp)
    project.sub_projects.append(sub)
    
    manager = TaskManager()
    
    # Capture old time
    old_time = project.last_updated
    
    # 2. ACT
    manager.complete_task(project, task_id="T-500")
    
    # 3. ASSERT
    # Status should change
    assert task.status == Status.COMPLETE
    # Timestamp should update
    assert project.last_updated > old_time
