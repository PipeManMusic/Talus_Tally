def test_sort_persistence(qtbot, tmp_path):
    """
    TDD: Verify that clicking Sort actually saves the new order to the JSON file.
    """
    import json
    import os
    from frontend.app import TalusWindow
    from backend.models import Project, SubProject, WorkPackage, Task

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
        
    # Initialize Window. We need to manually set the data_path 
    # so it writes to our temp file, not the real database.
    window = TalusWindow()
    window.data_path = str(data_file)  # Inject the test path
    window.project_data = project      # Inject the project object
    window.populate_tree(project)      # Draw it
    
    # 2. ACT: Sort
    window.sort_by_velocity()
    
    # 3. ASSERT: Reload from Disk to verify it saved
    with open(data_file, "r") as f:
        new_data = json.load(f)
        
    # The first task in the file should now be T-HIGH
    saved_tasks = new_data["sub_projects"][0]["work_packages"][0]["tasks"]
    assert saved_tasks[0]["id"] == "T-HIGH"
    assert saved_tasks[1]["id"] == "T-LOW"