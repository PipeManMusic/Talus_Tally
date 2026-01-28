import pytest
from unittest.mock import MagicMock, patch

try:
    from PySide6.QtGui import QAction
    from backend.ui.qt.main import TalusQtMainWindow
except ImportError:
    pytest.skip("PySide6 not installed", allow_module_level=True)

def test_new_project_flow(qtbot):
    """Phase 6.4: Verify File > New launches wizard and updates graph."""
    # 1. Setup Window
    window = TalusQtMainWindow()
    qtbot.addWidget(window)
    
    # 2. Mock the Wizard Dialog
    # We don't want to actually show a modal dialog during tests
    with patch('backend.ui.qt.main.ProjectWizardDialog') as MockWizard:
        instance = MockWizard.return_value
        
        # Configure the Mock to return a "Accepted" result
        instance.exec.return_value = 1  # QDialog.Accepted
        
        # Configure the Mock to return a dummy Graph
        mock_graph = MagicMock()
        mock_graph.nodes = {"id": "new_root"}
        instance.get_result_graph.return_value = mock_graph
        
        # 3. Trigger "New Project" Action
        # (We need to find the action or call the slot directly)
        # For TDD, we assume the method 'new_project' exists on the window
        window.new_project()
        
        # 4. Assertions
        # Verify Wizard was shown
        instance.exec.assert_called_once()
        
        # Verify Window updated its graph
        assert window.graph == mock_graph
        # Verify Model was refreshed (this assumes we add a method for it)
        assert window.model.graph == mock_graph