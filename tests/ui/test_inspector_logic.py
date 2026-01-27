import pytest
from backend.core.node import Node
from backend.infra.schema_loader import SchemaLoader
# These imports will fail until implementation (Red Phase)
from backend.ui.inspector import InspectorViewModel, FieldDefinition

def test_inspector_resolves_fields_from_blueprint(sample_blueprint_path):
    """Phase 6.3: Verify the inspector finds the correct fields for a Node Type."""
    # 1. Setup Engine
    loader = SchemaLoader()
    blueprint = loader.load(sample_blueprint_path)
    
    # 2. Setup Data (A 'Task' node which has 'cost', 'impact', etc.)
    node = Node(blueprint_type_id="task", name="Budget Task")
    
    # 3. Initialize View Model
    inspector = InspectorViewModel(blueprint)
    
    # 4. Execute: Get fields for this specific node
    fields = inspector.get_fields_for_node(node)
    
    # 5. Assertions
    # Check that we got the fields defined in restomod.yaml
    field_ids = [f.id for f in fields]
    assert "cost" in field_ids
    assert "status" in field_ids
    
    # Verify Metadata (The UI needs to know this is a Currency field)
    cost_field = next(f for f in fields if f.id == "cost")
    assert cost_field.label == "Cost"
    assert cost_field.ui_type == "currency"

def test_inspector_reads_values(sample_blueprint_path):
    """Phase 6.3: Verify the inspector pulls current values from the Node properties."""
    loader = SchemaLoader()
    blueprint = loader.load(sample_blueprint_path)
    
    # Setup Node with existing data
    node = Node(blueprint_type_id="task", name="Filled Task")
    node.properties["cost"] = 99.99
    
    inspector = InspectorViewModel(blueprint)
    fields = inspector.get_fields_for_node(node)
    
    # Assert the value is passed to the UI
    cost_field = next(f for f in fields if f.id == "cost")
    assert cost_field.value == 99.99

def test_inspector_updates_node(sample_blueprint_path):
    """Phase 6.3: Verify the inspector can write values back to the Node."""
    loader = SchemaLoader()
    blueprint = loader.load(sample_blueprint_path)
    node = Node(blueprint_type_id="task", name="Edit Me")
    
    inspector = InspectorViewModel(blueprint)
    
    # Simulate UI Input
    inspector.update_node_property(node, field_id="cost", new_value=50.00)
    
    assert node.properties["cost"] == 50.00