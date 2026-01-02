import pytest
import os
from backend.models import Project
from backend.ingestor import DocIngestor

@pytest.fixture
def mock_docs(tmp_path):
    """Creates a temporary documentation structure."""
    doc_root = tmp_path / "Documentation"
    doc_root.mkdir()
    
    # 1. Create Overview
    overview = doc_root / "project_overview.md"
    overview.write_text("# Overview\n* **Project Name:** Test Bronco\n")
    
    # 2. Create Parts Catalog
    parts = doc_root / "mechanical_parts.md"
    parts.write_text("""
# Mechanical Parts
## Powertrain
* **Engine:** V8
* Transmission: Manual
## Suspension
* Lift Kit
    """)
    
    return doc_root

def test_ingest_project_name(mock_docs):
    """Verify it reads the Project Name."""
    ingestor = DocIngestor(doc_root=str(mock_docs))
    p = Project(name="Old Name")
    
    p = ingestor.ingest(p)
    assert p.name == "Test Bronco"

def test_ingest_structure(mock_docs):
    """Verify it creates SubProjects, WPs, and Tasks."""
    ingestor = DocIngestor(doc_root=str(mock_docs))
    p = Project(name="Blank")
    
    p = ingestor.ingest(p)
    
    # Check Sub-Project
    mech_sub = next((s for s in p.sub_projects if s.name == "Mechanical"), None)
    assert mech_sub is not None
    
    # Check Work Package
    power_wp = next((w for w in mech_sub.work_packages if w.name == "Powertrain"), None)
    assert power_wp is not None
    
    # Check Task
    assert len(power_wp.tasks) == 2
    assert power_wp.tasks[0].text == "Engine: V8"