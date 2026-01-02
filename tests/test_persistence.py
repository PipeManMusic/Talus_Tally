import pytest
import json
import os
from frontend.desktop.app import TalusWindow
from backend.models import Project, SubProject, WorkPackage, Task

def test_sort_persistence(qtbot, tmp_path):
    """
    TDD: Verify that clicking Sort actually saves the new order to the JSON file.
    """
    # 1. ARRANGE: Create a temporary JSON file
    data_file = tmp_path / "test_persistence.json"
    
    # Create Data: Low Score First, High Score Second
    task_low = Task(id="T-LOW", text="Low", estimated_cost=1000, importance=1, budget_priority=1)
    task_high = Task(id="T-HIGH", text="High", estimated_cost=5, importance=10, budget_priority=10)
    
    project = Project(name="Test Persistence")
    sub = SubProject(id="SP-1", name="Sub")
    wp = WorkPackage(id="WP-1", name="WP")
    wp.tasks = [task_low, task_high] # Wrong order
    sub.work_packages.append(wp)
    project.sub_projects.append(sub)
    
    # Write initial state to disk
    with open(data_file, "w") as f:
        f.write(project.model_dump_json(indent=4))
    
    # Initialize Window.
    window = TalusWindow()
    window.data_path = str(data_file)
    window.project_data = project
    window.populate_tree()
    qtbot.addWidget(window)
    
    # 2. ACT: Trigger the Sort
    window.sort_by_velocity()
    
    # FIX: V1.1 is Manual Save. We must explicitly save to persist changes to disk.
    # We mock DocInjector to avoid README errors in test environment
    from unittest.mock import patch
    with patch("frontend.desktop.app.DocInjector"):
        window.save_project()
    
    # 3. ASSERT: Check the File on Disk
    with open(data_file, "r") as f:
        saved_data = json.load(f)
        
    saved_project = Project.model_validate(saved_data)
    first_task = saved_project.sub_projects[0].work_packages[0].tasks[0]
    
    # The "High" importance task should now be first
    assert first_task.id == "T-HIGH"

from backend.persistence import PersistenceManager

def test_rolling_backups(tmp_path):
    """
    Verify that PersistenceManager creates rolling backups.
    """
    data_path = tmp_path / "data.json"
    backup_dir = tmp_path / "backups"
    
    pm = PersistenceManager(str(data_path), str(backup_dir), max_backups=2)
    project = Project(name="Test Project")

    # Save 1 (Creates file)
    pm.save(project)
    assert data_path.exists()
    assert not backup_dir.exists() # No backup yet

    # Save 2 (Creates backup 1)
    project.name = "Test Project 2"
    pm.save(project)
    assert len(list(backup_dir.glob("*.bak"))) == 1

    # Save 3 (Creates backup 2)
    project.name = "Test Project 3"
    pm.save(project)
    assert len(list(backup_dir.glob("*.bak"))) == 2

    # Save 4 (Prunes to 2)
    project.name = "Test Project 4"
    pm.save(project)
    assert len(list(backup_dir.glob("*.bak"))) == 2