import pytest
from unittest.mock import MagicMock, patch

# Skip if PySide6 isn't present (run in headless CI)
try:
    from PySide6.QtWidgets import QDockWidget, QTreeView
    from PySide6.QtCore import Qt
    from backend.ui.qt.main import TalusQtMainWindow
except ImportError:
    pytest.skip("PySide6 not installed", allow_module_level=True)

from backend.ui.viewmodels.config import WINDOW_TITLE

@pytest.fixture
def app(qtbot):
    """Fixture to handle QApplication lifecycle."""
    # 'qtbot' is a pytest-qt fixture that handles the event loop
    # If you don't have pytest-qt installed, we can mock it or just instantiate
    window = TalusQtMainWindow()
    qtbot.addWidget(window)
    return window

def test_window_initialization(app):
    """Phase 6.2: Verify window title and geometry."""
    assert app.windowTitle() == WINDOW_TITLE
    assert app.width() == 1200
    assert app.height() == 800

def test_core_wiring(app):
    """Phase 6.2: Verify Graph and Model are connected."""
    assert app.graph is not None
    assert app.model is not None
    # Verify the model is wrapping the graph
    assert app.model.graph == app.graph

def test_dock_widgets_exist(app):
    """Phase 6.2: Verify the UI has the required panels."""
    docks = app.findChildren(QDockWidget)
    dock_titles = [d.windowTitle() for d in docks]
    
    assert "Project Browser" in dock_titles
    assert "Properties" in dock_titles

def test_tree_view_setup(app):
    """Phase 6.2: Verify the Tree View is using the GraphModel."""
    tree = app.findChild(QTreeView)
    assert tree is not None
    assert tree.model() == app.model
    assert tree.header().isHidden() is True