from backend.models import Project, Status

class MarkdownGenerator:
    def render(self, project: Project) -> str:
        """
        Converts the Project object into a Markdown-formatted Roadmap.
        """
        lines = []
        lines.append(f"# {project.name} Roadmap")
        lines.append(f"> Last Updated: {project.last_updated.strftime('%Y-%m-%d %H:%M')}")
        lines.append("")
        
        # Sort Sub-Projects by Priority (Highest First)
        sorted_subs = sorted(project.sub_projects, key=lambda s: s.priority, reverse=True)
        
        for sub in sorted_subs:
            lines.append(f"### {sub.name}")
            
            # Sort Work Packages by Importance
            sorted_wps = sorted(sub.work_packages, key=lambda w: w.importance, reverse=True)
            
            for wp in sorted_wps:
                lines.append(f"#### {wp.name}")
                
                # Sort Tasks: Complete at bottom? Or just by importance?
                # Let's keep your 'Importance' sort for now.
                sorted_tasks = sorted(wp.tasks, key=lambda t: t.importance, reverse=True)
                
                for task in sorted_tasks:
                    check_mark = "x" if task.status == Status.COMPLETE else " "
                    
                    # Optional: Add a (BLOCKED) tag if needed
                    blocked_tag = " **(BLOCKED)**" if task.status == Status.BLOCKED else ""
                    
                    # Optional: Add Cost if strictly > 0 for visibility
                    cost_tag = f" _[${int(task.estimated_cost)}]_" if task.estimated_cost > 0 else ""
                    
                    lines.append(f"- [{check_mark}] {task.text}{cost_tag}{blocked_tag}")
                
                lines.append("") # Spacer after work package
            
            lines.append("---") # Separator between Sub-Projects
            
        return "\n".join(lines)