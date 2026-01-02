import pytest
from backend.models import Project, SubProject, WorkPackage, Task, Status
from backend.manager import TaskManager

@pytest.fixture
def sample_project():
    p = Project(name="Test Project")
    sub = SubProject(id="SP1", name="Sub")
    wp = WorkPackage(id="WP1", name="WP")
    task = Task(id="T1", text="Original Name", estimated_cost=10.0)
    wp.tasks.append(task)
    sub.work_packages.append(wp)
    p.sub_projects.append(sub)
    return p

def test_add_task(sample_project):
    mgr = TaskManager()
    new_task = Task(id="T2", text="New Task")
    mgr.add_task(sample_project, "SP1", "WP1", new_task)
    assert len(sample_project.sub_projects[0].work_packages[0].tasks) == 2

def test_update_task(sample_project):
    mgr = TaskManager()
    updates = {
        "text": "Updated Name",
        "estimated_cost": 99.0
    }
    mgr.update_task(sample_project, "T1", updates)
    
    updated_task = sample_project.sub_projects[0].work_packages[0].tasks[0]
    assert updated_task.text == "Updated Name"
    assert updated_task.estimated_cost == 99.0

def test_delete_task(sample_project):
    mgr = TaskManager()
    mgr.delete_task(sample_project, "T1")
    
    tasks = sample_project.sub_projects[0].work_packages[0].tasks
    assert len(tasks) == 0

def test_delete_work_package(sample_project):
    """Verify deleting a WP removes it from the SubProject."""
    mgr = TaskManager()
    mgr.delete_work_package(sample_project, "WP1")
    assert len(sample_project.sub_projects[0].work_packages) == 0

def test_add_sub_project(sample_project):
    """Verify adding a new SubProject."""
    mgr = TaskManager()
    new_sub = SubProject(id="SP2", name="Interior")
    mgr.add_sub_project(sample_project, new_sub)
    assert len(sample_project.sub_projects) == 2
    assert sample_project.sub_projects[1].name == "Interior"

def test_update_sub_project(sample_project):
    """Verify editing a SubProject."""
    mgr = TaskManager()
    mgr.update_sub_project(sample_project, "SP1", {"name": "New Name", "priority": 9})
    assert sample_project.sub_projects[0].name == "New Name"
    assert sample_project.sub_projects[0].priority == 9

def test_add_work_package(sample_project):
    """Verify adding a WP to an existing SubProject."""
    mgr = TaskManager()
    new_wp = WorkPackage(id="WP2", name="Seats")
    mgr.add_work_package(sample_project, "SP1", new_wp)
    assert len(sample_project.sub_projects[0].work_packages) == 2
    assert sample_project.sub_projects[0].work_packages[1].name == "Seats"

def test_update_work_package(sample_project):
    """Verify editing a Work Package."""
    mgr = TaskManager()
    mgr.update_work_package(sample_project, "WP1", {"name": "Engine Bay", "importance": 10})
    wp = sample_project.sub_projects[0].work_packages[0]
    assert wp.name == "Engine Bay"
    assert wp.importance == 10

def test_delete_sub_project(sample_project):
    """Verify deleting a SubProject removes it entirely."""
    mgr = TaskManager()
    mgr.delete_sub_project(sample_project, "SP1")
    assert len(sample_project.sub_projects) == 0

def test_delete_nonexistent_task(sample_project):
    mgr = TaskManager()
    with pytest.raises(ValueError):
        mgr.delete_task(sample_project, "GHOST-ID")