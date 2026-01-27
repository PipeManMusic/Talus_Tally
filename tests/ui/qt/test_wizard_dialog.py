import pytest
from unittest.mock import MagicMock, patch

try:
    from PySide6.QtWidgets import QDialog, QLineEdit, QDialogButtonBox
    from PySide6.QtCore import Qt
    from backend.ui.qt.wizard import ProjectWizardDialog
except ImportError:
    pytest.skip("PySide6 not installed", allow_module_level=True)

@pytest.fixture
def wizard(qtbot):
    """Fixture to create the wizard dialog."""
    # We pass a mock parent to avoid creating a full window
    dialog = ProjectWizardDialog(parent=None)
    qtbot.addWidget(dialog)
    return dialog

def test_wizard_initial_state(wizard):
    """Verify the wizard starts empty."""
    assert wizard.windowTitle() == "New Project"
    
    # Check for Name Input
    name_input = wizard.findChild(QLineEdit, "project_name")
    assert name_input is not None
    assert name_input.text() == ""

def test_wizard_validation_logic(wizard):
    """Verify the OK button is disabled until a name is entered."""
    # Find the OK button
    button_box = wizard.findChild(QDialogButtonBox)
    ok_button = button_box.button(QDialogButtonBox.Ok)
    
    # Initially disabled (Logic: Name is empty)
    assert ok_button.isEnabled() is False
    
    # Enter Name
    name_input = wizard.findChild(QLineEdit, "project_name")
    name_input.setText("My Restoration")
    
    # Should be enabled now
    assert ok_button.isEnabled() is True

def test_wizard_creates_graph(wizard):
    """Verify that accepting the dialog returns a configured Graph."""
    # Setup inputs
    name_input = wizard.findChild(QLineEdit, "project_name")
    name_input.setText("Project Alpha")
    
    # Simulate "Accept" (User clicked OK)
    wizard.accept()
    
    # Verify the result
    graph = wizard.get_result_graph()
    assert graph is not None
    assert len(graph.nodes) >= 1
    
    # Verify Root Node
    root = list(graph.nodes.values())[0]
    assert root.name == "Project Alpha"
    assert root.blueprint_type_id == "project_root"