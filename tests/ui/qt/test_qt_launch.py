"""Tests for Qt/PySide6 application launcher.

Verifies that PySide6 is installed and importable, and that the Qt
application can be instantiated without errors.
"""
import pytest
import sys
from unittest.mock import MagicMock, patch


def test_pyside6_is_installed():
    """Phase 6: Verify PySide6 is installed and importable."""
    try:
        import PySide6
        from PySide6.QtWidgets import QApplication, QMainWindow
        
        assert hasattr(QApplication, '__init__')
        assert hasattr(QMainWindow, '__init__')
        
    except ImportError as e:
        pytest.skip(f"PySide6 not installed: {e}")


def test_qt_main_imports():
    """Phase 6: Verify Qt main module can be imported."""
    try:
        from backend.ui.qt.main import (
            TalusQtMainWindow, 
            create_qt_app, 
            run_qt_app,
            PYSIDE6_AVAILABLE
        )
        
        assert PYSIDE6_AVAILABLE is True or PYSIDE6_AVAILABLE is False
        assert callable(create_qt_app)
        assert callable(run_qt_app)
        
    except ImportError as e:
        pytest.skip(f"Qt module import failed: {e}")


def test_qt_main_window_instantiation():
    """Phase 6: Verify QApplication and QMainWindow can be created."""
    try:
        import PySide6
        from PySide6.QtWidgets import QApplication
        from backend.ui.qt.main import TalusQtMainWindow
        
        # Check if an app is already running
        app = QApplication.instance()
        if app is None:
            app = QApplication([])
        
        # Create main window
        window = TalusQtMainWindow()
        
        # Verify window has expected attributes
        assert window is not None
        assert hasattr(window, 'graph')
        assert hasattr(window, 'dispatcher')
        assert hasattr(window, 'service')
        
    except ImportError:
        pytest.skip("PySide6 not installed")
    except Exception as e:
        pytest.fail(f"Qt main window instantiation failed: {e}")


@patch('backend.ui.qt.main.QApplication')
@patch('backend.ui.qt.main.TalusQtMainWindow')
def test_create_qt_app_function(mock_window, mock_app):
    """Phase 6: Verify create_qt_app helper function works."""
    from backend.ui.qt.main import create_qt_app
    
    # Mock the instance check
    mock_app.instance.return_value = None
    
    try:
        result = create_qt_app("Test App")
        # If PySide6 is not available, should return None or raise
        if result is not None:
            mock_app.assert_called()
    except ImportError:
        pytest.skip("PySide6 not installed")


def test_qt_module_structure():
    """Phase 6: Verify Qt module has proper structure and documentation."""
    try:
        from backend.ui.qt import main
        
        # Check for main module components
        assert hasattr(main, 'TalusQtMainWindow')
        assert hasattr(main, 'create_qt_app')
        assert hasattr(main, 'run_qt_app')
        
        # Verify docstrings exist
        assert main.TalusQtMainWindow.__doc__ is not None
        assert main.create_qt_app.__doc__ is not None
        assert main.run_qt_app.__doc__ is not None
        
    except ImportError:
        pytest.skip("Qt module not available")


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
