import pytest
import sys
from unittest.mock import MagicMock, patch, ANY

def test_app_startup_layout():
    """Phase 6: Verify the App creates the correct window and split container."""
    # We mock toga to avoid needing a real GUI display
    # Create mock toga module before importing app
    mock_toga = MagicMock()
    mock_toga.App = MagicMock()
    mock_toga.MainWindow = MagicMock()
    mock_toga.SplitContainer = MagicMock()
    mock_toga.Box = MagicMock()
    mock_toga.Pack = MagicMock()
    mock_toga.constants.ROW = 'row'
    mock_toga.style.Pack = MagicMock()
    
    sys.modules['toga'] = mock_toga
    sys.modules['toga.style'] = mock_toga.style
    sys.modules['toga.constants'] = mock_toga.constants
    
    try:
        # Import inside after mocking toga
        from backend.ui.app import TalusApp
        from backend.ui.viewmodels.config import WINDOW_TITLE
        
        # 1. Instantiate
        app = TalusApp()
        
        # 2. Run Startup (The method that builds the UI)
        app.startup()
        
        # 3. Assertions
        # Verify Window Title
        mock_toga.MainWindow.assert_called_with(title=WINDOW_TITLE, size=ANY)
        
        # Verify Layout: Expecting 3 containers (Tree, Workspace, Inspector)
        # Note: Depending on implementation, there might be more boxes, 
        # but we expect at least 3 distinct containers added to the split view.
        assert mock_toga.Box.call_count >= 3
        
        # Verify SplitContainer connects the boxes
        mock_toga.SplitContainer.assert_called_once()
        
        # Verify the app holds references to the Core
        assert app.graph is not None
        assert app.dispatcher is not None
        assert app.service is not None
    
    finally:
        # Clean up mocked modules
        if 'toga' in sys.modules:
            del sys.modules['toga']
        if 'toga.style' in sys.modules:
            del sys.modules['toga.style']
        if 'toga.constants' in sys.modules:
            del sys.modules['toga.constants']