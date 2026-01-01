from pydantic import BaseModel, Field
from typing import List, Optional
from enum import Enum
from datetime import datetime

class Status(str, Enum):
    BACKLOG = "backlog"
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    BLOCKED = "blocked"      # <--- ADDED THIS (Fixes the crash)
    COMPLETE = "complete"

class Task(BaseModel):
    id: str
    text: str
    status: Status = Status.PENDING
    estimated_cost: float = 0.0
    budget_priority: int = 5
    importance: int = 5
    
    # Timeline Priority: A list of Task IDs that THIS task blocks.
    blocking: List[str] = Field(default_factory=list)

class WorkPackage(BaseModel):
    id: str
    name: str
    importance: int = 5
    tasks: List[Task] = Field(default_factory=list)

class SubProject(BaseModel):
    id: str
    name: str
    priority: int = 5
    work_packages: List[WorkPackage] = Field(default_factory=list)

class Project(BaseModel):
    name: str = "New Project"
    last_updated: datetime = Field(default_factory=datetime.now)
    sub_projects: List[SubProject] = Field(default_factory=list)
