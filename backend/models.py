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
