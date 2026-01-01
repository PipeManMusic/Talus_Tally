import pytest
from backend.models import Project, SubProject, WorkPackage, Task, Status
# We haven't created this module yet, so this import will cause the failure we want
from backend.translator import MarkdownGenerator

def test_generate_roadmap_string():
    """
    Test: Does the generator convert a Project object into a valid Markdown string?
    """
    # 1. ARRANGE: Create a mini project in memory
    project = Project(
        name="Test Project",
        sub_projects=[
            SubProject(
                id="SP1", name="Electronics", priority=10,
                work_packages=[
                    WorkPackage(
                        id="WP1", name="Navigation", importance=10,
                        tasks=[
                            Task(id="T1", text="Buy GPS", status=Status.COMPLETE),
                            Task(id="T2", text="Install MapLibre", status=Status.BACKLOG)
                        ]
                    )
                ]
            )
        ]
    )

    # 2. ACT: Generate the markdown
    generator = MarkdownGenerator()
    md_output = generator.render(project)

    # 3. ASSERT: Verify the string contains the right formatting
    # Check for Hierarchy Headers
    assert "### Electronics" in md_output
    assert "**Navigation**" in md_output or "#### Navigation" in md_output
    
    # Check for Checkboxes
    assert "- [x] Buy GPS" in md_output
    assert "- [ ] Install MapLibre" in md_output