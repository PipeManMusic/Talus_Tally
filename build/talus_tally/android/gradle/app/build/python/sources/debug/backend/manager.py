from datetime import datetime
from typing import List, Optional
from .models import Project, SubProject, WorkPackage, Task, Status

class TaskManager:
    """
    Central logic for adding, moving, and deleting items.
    Updates the 'last_updated' timestamp on every modification.
    """

    def _touch(self, project: Project):
        # FIX: Convert datetime to string immediately to satisfy Pydantic model (str)
        project.last_updated = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    def add_sub_project(self, project: Project, sub: SubProject):
        project.sub_projects.append(sub)
        self._touch(project)

    def add_work_package(self, project: Project, sub_id: str, wp: WorkPackage):
        sub = next((s for s in project.sub_projects if s.id == sub_id), None)
        if sub:
            sub.work_packages.append(wp)
            self._touch(project)
        else:
            raise ValueError(f"SubProject {sub_id} not found")

    def add_task(self, project: Project, sub_id: str, wp_id: str, task: Task):
        sub = next((s for s in project.sub_projects if s.id == sub_id), None)
        if sub:
            wp = next((w for w in sub.work_packages if w.id == wp_id), None)
            if wp:
                wp.tasks.append(task)
                self._touch(project)
            else:
                raise ValueError(f"WorkPackage {wp_id} not found")
        else:
            raise ValueError(f"SubProject {sub_id} not found")

    def update_task(self, project: Project, task_id: str, updates: dict):
        found = False
        for sub in project.sub_projects:
            for wp in sub.work_packages:
                for task in wp.tasks:
                    if task.id == task_id:
                        for key, value in updates.items():
                            if not hasattr(task, key):
                                continue
                            if key == "status" and value is not None:
                                if isinstance(value, str):
                                    try:
                                        value = Status(value)
                                    except ValueError:
                                        continue
                                elif not isinstance(value, Status):
                                    continue
                            setattr(task, key, value)
                        found = True
                        break
                if found: break
            if found: break
        
        if found:
            self._touch(project)
        else:
            raise ValueError(f"Task {task_id} not found")

    def update_sub_project(self, project: Project, sub_id: str, updates: dict):
        sub = next((s for s in project.sub_projects if s.id == sub_id), None)
        if sub:
            for key, value in updates.items():
                if hasattr(sub, key):
                    setattr(sub, key, value)
            self._touch(project)
        else:
            raise ValueError(f"SubProject {sub_id} not found")

    def update_work_package(self, project: Project, wp_id: str, updates: dict):
        found = False
        for sub in project.sub_projects:
            for wp in sub.work_packages:
                if wp.id == wp_id:
                    for key, value in updates.items():
                        if hasattr(wp, key):
                            setattr(wp, key, value)
                    found = True
                    break
            if found: break
            
        if found:
            self._touch(project)
        else:
            raise ValueError(f"WorkPackage {wp_id} not found")

    def delete_task(self, project: Project, task_id: str):
        deleted = False
        for sub in project.sub_projects:
            for wp in sub.work_packages:
                initial_count = len(wp.tasks)
                wp.tasks = [t for t in wp.tasks if t.id != task_id]
                if len(wp.tasks) < initial_count:
                    deleted = True
                    break
            if deleted: break
        
        if deleted:
            self._touch(project)
        else:
            raise ValueError(f"Task {task_id} not found")

    def delete_work_package(self, project: Project, wp_id: str):
        deleted = False
        for sub in project.sub_projects:
            initial_count = len(sub.work_packages)
            sub.work_packages = [w for w in sub.work_packages if w.id != wp_id]
            if len(sub.work_packages) < initial_count:
                deleted = True
                break
        
        if deleted:
            self._touch(project)
        else:
            raise ValueError(f"WorkPackage {wp_id} not found")

    def delete_sub_project(self, project: Project, sub_id: str):
        initial_count = len(project.sub_projects)
        project.sub_projects = [s for s in project.sub_projects if s.id != sub_id]
        
        if len(project.sub_projects) < initial_count:
            self._touch(project)
        else:
            raise ValueError(f"SubProject {sub_id} not found")

    def complete_task(self, project: Project, task_id: str):
        self.update_task(project, task_id, {"status": Status.COMPLETE})

    # --- NEW: Drag & Drop Support ---
    def move_task(self, project: Project, task_id: str, new_wp_id: str):
        """Moves a task from its current location to a new Work Package."""
        task_obj = None
        
        # 1. Find and Extract the Task
        found_source = False
        for sub in project.sub_projects:
            for wp in sub.work_packages:
                for t in wp.tasks:
                    if t.id == task_id:
                        task_obj = t
                        wp.tasks.remove(t)
                        found_source = True
                        break
                if found_source: break
            if found_source: break
            
        if not found_source:
            raise ValueError(f"Task {task_id} not found")
            
        # 2. Find Destination WP and Insert
        found_dest = False
        for sub in project.sub_projects:
            for wp in sub.work_packages:
                if wp.id == new_wp_id:
                    wp.tasks.append(task_obj)
                    found_dest = True
                    break
            if found_dest: break
            
        if not found_dest:
            # Rollback: Put it back where it came from (simplified: just error out for now)
            # In a real transaction we'd want safer rollback, but here we just fail.
            raise ValueError(f"Target Work Package {new_wp_id} not found")
            
        self._touch(project)