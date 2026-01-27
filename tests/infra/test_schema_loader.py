import pytest
from backend.infra.schema_loader import SchemaLoader

def test_load_blueprint(sample_blueprint_path):
    """Phase 3.1: Verify we can load the Restomod YAML."""
    loader = SchemaLoader()
    blueprint = loader.load(sample_blueprint_path)
    
    assert blueprint.id == "restomod_v1"
    assert blueprint.name == "Restomod Creator"
    
    # Verify Node Types
    node_ids = [nt.id for nt in blueprint.node_types]
    assert "job" in node_ids
    assert "task" in node_ids
    
    # Verify Logic
    task_def = next(nt for nt in blueprint.node_types if nt.id == "task")
    assert task_def.has_time_log is True

def test_validate_hierarchy(sample_blueprint_path):
    """Phase 3.1: Verify the engine enforces parent/child rules."""
    loader = SchemaLoader()
    blueprint = loader.load(sample_blueprint_path)
    
    # Phase -> Job (Allowed)
    assert blueprint.is_allowed_child(parent_type="phase", child_type="job") is True
    
    # Phase -> Task (Not Allowed - must go through Job)
    assert blueprint.is_allowed_child(parent_type="phase", child_type="task") is False