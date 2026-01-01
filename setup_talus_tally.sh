#!/bin/bash

echo "🚀 Initializing Talus Tally Project Structure..."

# 1. Create Directories
mkdir -p backend tests data
touch backend/__init__.py tests/__init__.py

# 2. Create requirements.txt
echo "📝 Creating requirements.txt..."
cat << 'EOF' > requirements.txt
fastapi
uvicorn[standard]
pydantic
gitpython
pytest
requests
EOF

# 3. Create backend/models.py
# (Includes the 4-level hierarchy + Financial/Budget fields)
echo "📝 Creating backend/models.py..."
cat << 'EOF' > backend/models.py
from typing import List, Optional
from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime

class Status(str, Enum):
    BACKLOG = "Backlog"
    IN_PROGRESS = "In-Progress"
    BLOCKED = "Blocked"
    COMPLETE = "Complete"

class Task(BaseModel):
    id: str
    text: str
    importance: int = Field(ge=1, le=10, default=5, description="1-10 Scale")
    
    # Financial Velocity Fields
    budget_priority: int = Field(ge=1, le=10, default=5, description="How badly do we need to buy this?")
    estimated_cost: float = Field(ge=0.0, default=0.0)
    
    status: Status = Status.BACKLOG
    blocks: List[str] = []  # List of Task IDs this task prevents from starting

class WorkPackage(BaseModel):
    id: str
    name: str
    importance: int = Field(ge=1, le=10, default=5)
    tasks: List[Task] = []

class SubProject(BaseModel):
    id: str
    name: str
    priority: int = Field(ge=1, le=10, default=5)
    work_packages: List[WorkPackage] = []

class Project(BaseModel):
    name: str = "Project Talus"
    last_updated: datetime = Field(default_factory=datetime.now)
    sub_projects: List[SubProject] = []
EOF

# 4. Create backend/engine.py
# (Includes the Financial Velocity sorting logic)
echo "📝 Creating backend/engine.py..."
cat << 'EOF' > backend/engine.py
class PriorityEngine:
    @staticmethod
    def calculate_task_score(sub_p_priority: int, wp_importance: int, task: any) -> float:
        """
        Calculates a global priority score based on Hierarchy and Money.
        Higher Score = Do This First.
        """
        # 1. Hierarchy Weight (The "Base" Score)
        # Keeps high-priority sub-projects (like Brakes) above low ones (like Stereo)
        hierarchy_score = (sub_p_priority * 100) + (wp_importance * 10) + task.importance
        
        # 2. Financial Velocity: (Budget Priority / (Cost + 1)) 
        # Prioritizes high-need items that are cheap (Quick Wins).
        # We add +1 to cost to prevent division by zero on free tasks.
        financial_velocity = task.budget_priority / (task.estimated_cost + 1)
        
        # Weight the financial velocity significantly to bubble up "Quick Wins"
        return hierarchy_score + (financial_velocity * 20)

    def get_sorted_tasks(self, project: any) -> list:
        """
        Flattens the hierarchy into a sorted list for the Android App.
        """
        flattened = []
        for sub_p in project.sub_projects:
            for wp in sub_p.work_packages:
                for task in wp.tasks:
                    # Skip completed tasks in the main view
                    if task.status == "Complete":
                        continue
                        
                    score = self.calculate_task_score(sub_p.priority, wp.importance, task)
                    
                    flattened.append({
                        "id": task.id,
                        "text": task.text,
                        "status": task.status,
                        "cost": task.estimated_cost,
                        "parent_wp": wp.name,
                        "parent_sub": sub_p.name,
                        "global_score": score
                    })
        
        # Sort by score descending (Highest Priority First)
        return sorted(flattened, key=lambda x: x['global_score'], reverse=True)
EOF

# 5. Create backend/main.py
# (The FastAPI Server)
echo "📝 Creating backend/main.py..."
cat << 'EOF' > backend/main.py
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
EOF

# 6. Create tests/test_logic.py
# (The TDD Test Suite)
echo "📝 Creating tests/test_logic.py..."
cat << 'EOF' > tests/test_logic.py
import pytest
from backend.models import Task
from backend.engine import PriorityEngine

def test_financial_velocity_logic():
    """
    TDD: Prove that a cheap, high-need item outranks an expensive high-need item.
    """
    engine = PriorityEngine()
    
    # Task A: Budget Priority 10 (Critical), Cost $1500 (Transfer Case)
    # Velocity = 10 / 1501 = ~0.006
    expensive_task = Task(
        id="A", text="Buy Transfer Case", 
        budget_priority=10, estimated_cost=1500.0, importance=5
    )
    
    # Task B: Budget Priority 10 (Critical), Cost $5 (Relay)
    # Velocity = 10 / 6 = 1.66
    cheap_task = Task(
        id="B", text="Buy Relay", 
        budget_priority=10, estimated_cost=5.0, importance=5
    )
    
    # Calculate scores (assuming they are in the same Work Package/SubProject)
    score_expensive = engine.calculate_task_score(10, 5, expensive_task)
    score_cheap = engine.calculate_task_score(10, 5, cheap_task)
    
    # The cheap task should have a higher score because it keeps project momentum
    assert score_cheap > score_expensive
EOF

echo "✅ Setup Complete! Directories and files created."
echo "👉 Run 'chmod +x setup_talus_tally.sh' if needed."
echo "👉 Run './setup_talus_tally.sh' to execute."
EOF