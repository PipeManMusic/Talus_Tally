from datetime import datetime
from .models import Project, Task, Status

class TaskManager:
    def add_task(self, project: Project, sub_project_id: str, work_package_id: str, task: Task) -> Project:
        """Adds a task to a specific Work Package within a SubProject."""
        found_loc = False
        
        for sub in project.sub_projects:
            if sub.id == sub_project_id:
                for wp in sub.work_packages:
                    if wp.id == work_package_id:
                        wp.tasks.append(task)
                        found_loc = True
                        break
            if found_loc:
                break
        
        if not found_loc:
            raise ValueError(f"Could not find WorkPackage {work_package_id} in SubProject {sub_project_id}")
            
        project.last_updated = datetime.now()
        return project

    def set_dependency(self, project: Project, blocker_id: str, blocked_id: str) -> Project:
        """Marks that blocker_id BLOCKS blocked_id."""
        blocker_task = None
        blocked_task = None
        
        for sub in project.sub_projects:
            for wp in sub.work_packages:
                for task in wp.tasks:
                    if task.id == blocker_id:
                        blocker_task = task
                    if task.id == blocked_id:
                        blocked_task = task
        
        if not blocker_task or not blocked_task:
            raise ValueError("One or both Task IDs not found.")
            
        if blocked_id not in blocker_task.blocking:
            blocker_task.blocking.append(blocked_id)
            
        project.last_updated = datetime.now()
        return project

    def complete_task(self, project: Project, task_id: str) -> Project:
        """Finds a task by ID and marks it COMPLETE."""
        found = False
        for sub in project.sub_projects:
            for wp in sub.work_packages:
                for task in wp.tasks:
                    if task.id == task_id:
                        task.status = Status.COMPLETE
                        found = True
                        break
                if found: break
            if found: break
            
        if not found:
            raise ValueError(f"Task {task_id} not found.")
            
        project.last_updated = datetime.now()
        return project
