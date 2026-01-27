import os
import re
import uuid
from .models import Project, SubProject, WorkPackage, Task, Status
from .manager import TaskManager

class DocIngestor:
    def __init__(self, doc_root="Documentation"):
        self.doc_root = doc_root
        self.manager = TaskManager()

    def ingest(self, project: Project) -> Project:
        """
        Walks the Documentation folder and populates the Project.
        """
        print(f"📂 Scanning {self.doc_root}...")
        
        # 1. Look for Project Overview (Metadata)
        self._scan_overview(project)
        
        # 2. Look for Parts Catalogs (The Meat & Potatoes)
        # We walk the tree to find 'parts.md' files
        for root, dirs, files in os.walk(self.doc_root):
            for file in files:
                if file.endswith("_parts.md") or file == "mechanical_parts.md":
                    self._parse_catalog_file(project, os.path.join(root, file))
                    
        return project

    def _scan_overview(self, project: Project):
        """Finds project_overview.md and updates the Project Name."""
        # Heuristic: verify filename
        target = "project_overview.md"
        found_path = None
        
        for root, dirs, files in os.walk(self.doc_root):
            if target in files:
                found_path = os.path.join(root, target)
                break
        
        if not found_path:
            return

        with open(found_path, "r") as f:
            for line in f:
                # Look for "* **Project Name:** Talus"
                match = re.search(r"\* \*\*Project Name:\*\* (.*)", line)
                if match:
                    project.name = match.group(1).strip()
                    print(f"✅ Found Project Name: {project.name}")
                    return

    def _parse_catalog_file(self, project: Project, filepath):
        """
        Parses a Markdown file into:
        - SubProject (Filename)
        - WorkPackages (H2 ##)
        - Tasks (Bullets *)
        """
        filename = os.path.basename(filepath)
        sub_name = filename.replace("_parts.md", "").replace(".md", "").capitalize()
        
        # Check if SubProject exists, else Create
        sub_proj = next((s for s in project.sub_projects if s.name == sub_name), None)
        if not sub_proj:
            sub_proj = SubProject(id=f"SP-{uuid.uuid4().hex[:4]}", name=sub_name)
            project.sub_projects.append(sub_proj)
            print(f"➕ Created Sub-Project: {sub_name}")

        current_wp = None
        
        with open(filepath, "r") as f:
            lines = f.readlines()
            
        for line in lines:
            line = line.strip()
            
            # 1. Detect Header (Work Package)
            if line.startswith("## "):
                wp_name = line.replace("## ", "").strip()
                # Check if WP exists in this Sub
                current_wp = next((w for w in sub_proj.work_packages if w.name == wp_name), None)
                if not current_wp:
                    current_wp = WorkPackage(id=f"WP-{uuid.uuid4().hex[:4]}", name=wp_name)
                    sub_proj.work_packages.append(current_wp)
                    print(f"  ➕ Created WP: {wp_name}")
            
            # 2. Detect Bullet (Task)
            elif line.startswith("* ") or line.startswith("- "):
                if not current_wp:
                    continue # Task without a WP? Skip or put in 'General'
                
                text = line[2:].strip()
                # Clean up bolding if present "**Engine:** details" -> "Engine: details"
                text = text.replace("**", "")
                
                # Check duplication (simple text match)
                exists = any(t.text == text for t in current_wp.tasks)
                if not exists:
                    new_task = Task(
                        id=f"T-{uuid.uuid4().hex[:4]}", 
                        text=text,
                        status=Status.PENDING
                    )
                    current_wp.tasks.append(new_task)
                    # print(f"    ➕ Added Task: {text[:30]}...")