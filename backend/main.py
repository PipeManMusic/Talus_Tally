from fastapi import FastAPI, HTTPException
from .models import Project, Task, Status
from .engine import PriorityEngine
import json
import os

app = FastAPI(title="Talus Tally API")
DATA_FILE = "data/talus_master.json"

def load_project() -> Project:
    if not os.path.exists(DATA_FILE):
        # Return an empty shell if no data exists yet
        return Project(sub_projects=[])
    with open(DATA_FILE, "r") as f:
        return Project.parse_obj(json.load(f))

def save_project(project: Project):
    with open(DATA_FILE, "w") as f:
        f.write(project.json(indent=4))

@app.get("/")
def read_root():
    return {"message": "Talus Tally API is Online"}

@app.get("/tasks")
def get_prioritized_tasks():
    """Returns the flattened, sorted list of tasks based on Financial Velocity."""
    project = load_project()
    engine = PriorityEngine()
    return engine.get_sorted_tasks(project)

@app.post("/tasks/{task_id}/complete")
def complete_task(task_id: str):
    """Marks a task as complete and saves the JSON."""
    project = load_project()
    found = False
    
    # Deep search for the task ID
    for sub_p in project.sub_projects:
        for wp in sub_p.work_packages:
            for task in wp.tasks:
                if task.id == task_id:
                    task.status = Status.COMPLETE
                    found = True
                    # In a real app, you might want to break here, 
                    # but we continue in case of duplicate IDs (bad data)
    
    if not found:
        raise HTTPException(status_code=404, detail="Task not found")
    
    save_project(project)
    return {"status": "success", "message": f"Task {task_id} marked complete"}
