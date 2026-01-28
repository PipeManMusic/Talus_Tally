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

def test_option_uuids_generated(sample_blueprint_path):
    """Verify UUIDs are generated for select options on blueprint load."""
    loader = SchemaLoader()
    blueprint = loader.load(sample_blueprint_path)
    
    # Get task definition with status property
    task_def = next(nt for nt in blueprint.node_types if nt.id == "task")
    properties = task_def._extra_props.get('properties', [])
    status_prop = next((p for p in properties if p.get('id') == 'status'), None)
    
    assert status_prop is not None, "Task should have status property"
    assert 'options' in status_prop, "Status property should have options"
    
    options = status_prop['options']
    assert len(options) > 0, "Should have at least one status option"
    
    # Check that each option has a UUID
    for option in options:
        assert 'id' in option, f"Option {option} should have 'id' (UUID)"
        assert 'name' in option, f"Option {option} should have 'name'"
        assert isinstance(option['id'], str), "Option UUID should be a string"
        assert len(option['id']) == 36, "Option UUID should be 36 chars (standard UUID format)"

def test_option_uuids_stable(sample_blueprint_path):
    """Verify UUIDs remain stable across reloads (deterministic generation)."""
    loader = SchemaLoader()
    
    # First load
    blueprint1 = loader.load(sample_blueprint_path)
    task_def1 = next(nt for nt in blueprint1.node_types if nt.id == "task")
    props1 = task_def1._extra_props.get('properties', [])
    status_prop1 = next((p for p in props1 if p.get('id') == 'status'), None)
    options1 = status_prop1['options']
    
    # Second load
    blueprint2 = loader.load(sample_blueprint_path)
    task_def2 = next(nt for nt in blueprint2.node_types if nt.id == "task")
    props2 = task_def2._extra_props.get('properties', [])
    status_prop2 = next((p for p in props2 if p.get('id') == 'status'), None)
    options2 = status_prop2['options']
    
    # Compare UUIDs across reloads
    assert len(options1) == len(options2), "Should have same number of options"
    for opt1, opt2 in zip(options1, options2):
        assert opt1['id'] == opt2['id'], f"UUID for '{opt1['name']}' should be stable"
        assert opt1['name'] == opt2['name'], "Option names should match"
