from fastapi import FastAPI, HTTPException
from .models import Project, Task, Status
from .engine import PriorityEngine
from .translator import MarkdownGenerator
from .injector import DocInjector
import json
import os

app = FastAPI(title="Talus Tally API")
DATA_FILE = "data/talus_master.json"
README_FILE = "README.md"

def _project_to_json(project: Project) -> str:
    if hasattr(project, "model_dump_json"):
        return project.model_dump_json(indent=4)
    if hasattr(project, "json"):
        return project.json(indent=4)
    if hasattr(project, "model_dump"):
        return json.dumps(project.model_dump(), indent=4)
    if hasattr(project, "dict"):
        return json.dumps(project.dict(), indent=4)
    return json.dumps(project, indent=4)

def load_project() -> Project:
    if not os.path.exists(DATA_FILE):
        return Project(sub_projects=[])
    with open(DATA_FILE, "r") as f:
        # V2 FIX: model_validate instead of parse_obj
        return Project.model_validate(json.load(f))

def save_project(project: Project):
    with open(DATA_FILE, "w") as f:
        f.write(_project_to_json(project))

def trigger_roadmap_update(project: Project):
    generator = MarkdownGenerator()
    new_roadmap = generator.render(project)
    try:
        injector = DocInjector(README_FILE)
        success = injector.update_roadmap(new_roadmap)
        if success:
            print(f"✅ Roadmap updated in {README_FILE}")
        else:
            print(f"⚠️ Roadmap update skipped (Markers missing)")
    except Exception as e:
        print(f"⚠️ Roadmap update failed: {e}")

@app.get("/")
def read_root():
    return {"message": "Talus Tally API is Online"}

@app.get("/tasks")
def get_prioritized_tasks():
    project = load_project()
    engine = PriorityEngine()
    return engine.get_sorted_tasks(project)

@app.post("/tasks/{task_id}/complete")
def complete_task(task_id: str):
    project = load_project()
    found = False
    for sub_p in project.sub_projects:
        for wp in sub_p.work_packages:
            for task in wp.tasks:
                if task.id == task_id:
                    task.status = Status.COMPLETE
                    found = True
    if not found:
        raise HTTPException(status_code=404, detail="Task not found")
    save_project(project)
    trigger_roadmap_update(project)
    return {"status": "success", "message": f"Task {task_id} marked complete & Roadmap updated"}