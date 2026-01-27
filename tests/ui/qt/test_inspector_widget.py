import pytest
try:
    from PySide6.QtWidgets import QLineEdit, QSpinBox, QDoubleSpinBox, QComboBox, QFormLayout
    from backend.ui.qt.inspector import InspectorWidget
except ImportError:
    pytest.skip("PySide6 not installed", allow_module_level=True)

from backend.core.node import Node
from backend.infra.schema_loader import Blueprint, NodeTypeDef

@pytest.fixture
def inspector(qtbot):
    widget = InspectorWidget(blueprint=None)
    qtbot.addWidget(widget)
    return widget

def test_inspector_clear_form(inspector):
    """Phase 6.3: Verify form clears previous widgets."""
    # Add dummy row
    inspector.form_layout.addRow("Test", QLineEdit())
    assert inspector.form_layout.rowCount() == 1
    
    # Execute Clear
    inspector.clear_form()
    assert inspector.form_layout.rowCount() == 0

def test_inspector_renders_text_field(inspector):
    """Phase 6.3: Verify a Text property creates a QLineEdit."""
    node = Node(blueprint_type_id="task", name="Test Node")
    # Manually inject a field definition via the view model to test rendering
    # (In real app, this comes from Blueprint, but we trust logic tests for that)
    
    # Mocking the view model's return for isolation
    from backend.ui.viewmodels.inspector import FieldDefinition
    inspector.view_model.get_fields_for_node = lambda n: [
        FieldDefinition(id="name", label="Name", ui_type="text", value="Test Node")
    ]
    
    inspector.set_node(node)
    
    # Find the widget
    line_edit = inspector.findChild(QLineEdit)
    assert line_edit is not None
    assert line_edit.text() == "Test Node"

def test_inspector_renders_currency_field(inspector):
    """Phase 6.3: Verify a Currency property creates a QDoubleSpinBox."""
    node = Node(blueprint_type_id="task", name="Budget Node")
    
    from backend.ui.viewmodels.inspector import FieldDefinition
    inspector.view_model.get_fields_for_node = lambda n: [
        FieldDefinition(id="cost", label="Cost", ui_type="currency", value=50.00)
    ]
    
    inspector.set_node(node)
    
    spinner = inspector.findChild(QDoubleSpinBox)
    assert spinner is not None
    assert spinner.prefix() == "$"
    assert spinner.value() == 50.00