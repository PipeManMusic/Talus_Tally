from pydantic import BaseModel, Field

try:
    from pydantic import field_validator
except ImportError:  # Pydantic v1 fallback
    field_validator = None
    from pydantic import validator
from typing import List, Optional
from enum import Enum

class Status(str, Enum):
    BACKLOG = "backlog"      # Restored to satisfy tests/requirements
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    BLOCKED = "blocked"
    COMPLETE = "complete"

class Task(BaseModel):
    id: str
    text: str
    status: Status = Status.PENDING
    
    # V1.1 Updates
    estimated_cost: float = 0.0
    actual_cost: float = 0.0 
    
    # Optional fields for non-mechanical/software tasks
    budget_priority: Optional[int] = None 
    importance: Optional[int] = None      
    
    blocking: List[str] = Field(default_factory=list)

    if field_validator is not None:

        @field_validator("status", mode="before")
        def _coerce_status(cls, value):
            if isinstance(value, Status):
                return value
            if value is None:
                return Status.PENDING
            try:
                return Status(value)
            except ValueError:
                return Status.PENDING

    else:

        @validator("status", pre=True, always=True)
        def _coerce_status(cls, value):
            if isinstance(value, Status):
                return value
            if value is None:
                return Status.PENDING
            try:
                return Status(value)
            except ValueError:
                return Status.PENDING

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
    name: str
    sub_projects: List[SubProject] = Field(default_factory=list)
    last_updated: str = ""

# --- Pydantic v1 compatibility helpers ---
def _ensure_model_validate(cls):
    if not hasattr(cls, "model_validate"):
        @classmethod
        def _model_validate(class_, data):
            if hasattr(class_, "parse_obj"):
                return class_.parse_obj(data)
            return class_(**data)

        setattr(cls, "model_validate", _model_validate)

for _model in (Task, WorkPackage, SubProject, Project):
    _ensure_model_validate(_model)