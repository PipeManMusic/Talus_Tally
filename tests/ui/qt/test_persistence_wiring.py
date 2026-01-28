import pytest
from unittest.mock import MagicMock, patch

try:
    from backend.ui.qt.main import TalusQtMainWindow
except ImportError:
    pytest.skip("PySide6 not installed", allow_module_level=True)

def test_save_action_triggers_persistence(qtbot, tmp_path):
    """Phase 6.5: Verify File > Save writes to disk."""
    window = TalusQtMainWindow()
    qtbot.addWidget(window)
    
    # Mock the PersistenceManager to avoid real file dialogs
    with patch('backend.ui.qt.main.QFileDialog.getSaveFileName') as mock_dialog, \
         patch('backend.ui.qt.main.PersistenceManager') as MockManager:
        
        # 1. Setup Mock User Input (User selects "my_project.json")
        save_path = tmp_path / "my_project.json"
        mock_dialog.return_value = (str(save_path), "JSON Files (*.json)")
        
        # 2. Setup Mock Persistence
        manager_instance = MockManager.return_value
        
        # 3. Trigger Save (Assuming method exists)
        window.save_project()
        
        # 4. Assertions
        MockManager.assert_called_with(str(save_path))
        manager_instance.save.assert_called_once_with(window.graph)

def test_open_action_loads_graph(qtbot, tmp_path):
    """Phase 6.5: Verify File > Open loads a graph."""
    window = TalusQtMainWindow()
    qtbot.addWidget(window)
    
    with patch('backend.ui.qt.main.QFileDialog.getOpenFileName') as mock_dialog, \
         patch('backend.ui.qt.main.PersistenceManager') as MockManager:
        
        # 1. Setup Mock User Input
        open_path = tmp_path / "existing.json"
        mock_dialog.return_value = (str(open_path), "JSON Files (*.json)")
        
        # 2. Setup Mock Graph Return
        mock_graph = MagicMock()
        manager_instance = MockManager.return_value
        manager_instance.load.return_value = mock_graph
        
        # 3. Trigger Open
        window.open_project()
        
        # 4. Assertions
        manager_instance.load.assert_called_once()
        assert window.graph == mock_graph
        # Verify the model was updated to point to the new graph
        assert window.model.graph == mock_graph