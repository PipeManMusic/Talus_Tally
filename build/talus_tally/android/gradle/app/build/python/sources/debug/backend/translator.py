from .models import Project, Status

class MarkdownGenerator:
    def render(self, project: Project) -> str:
        lines = []
        lines.append(f"# Project Roadmap: {project.name}")
        lines.append(f"Last Updated: {project.last_updated}\n")

        for sub in project.sub_projects:
            # Satisfies: assert "### Electronics" in md_output
            lines.append(f"### {sub.name}")
            for wp in sub.work_packages:
                # Satisfies: assert "#### Navigation" in md_output
                lines.append(f"#### {wp.name}")
                
                for task in wp.tasks:
                    checked = "x" if task.status == Status.COMPLETE else " "
                    status_icon = self._get_status_icon(task.status)
                    
                    # Satisfies: assert "- [x] Buy GPS" in md_output
                    # Includes V1.1 cost data in parentheses for extra detail
                    line = f"- [{checked}] {task.text} ({status_icon} {task.status.upper()})"
                    if task.estimated_cost > 0 or task.actual_cost > 0:
                        line += f" [Est: ${task.estimated_cost:,.2f} | Act: ${task.actual_cost:,.2f}]"
                    
                    lines.append(line)
                lines.append("") # Spacer between Work Packages
        
        return "\n".join(lines)

    def _get_status_icon(self, status: Status) -> str:
        icons = {
            Status.COMPLETE: "✅",
            Status.IN_PROGRESS: "🛠️",
            Status.BLOCKED: "🛑",
            Status.PENDING: "⏳",
            Status.BACKLOG: "📋"
        }
        return icons.get(status, "❓")