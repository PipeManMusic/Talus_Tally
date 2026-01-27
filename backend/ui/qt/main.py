"""Qt/PySide6-based GUI application for Talus Tally (Desktop).

This module provides a Qt-based desktop interface for Talus Tally,
complementing the Toga-based mobile interface.
"""
import sys
import logging
from typing import Optional

try:
    from PySide6.QtWidgets import (
        QApplication, QMainWindow, QSplitter, QWidget, QVBoxLayout,
        QDockWidget, QTreeView
    )
    from PySide6.QtCore import Qt
    from backend.ui.qt.tree_model import GraphModel
    PYSIDE6_AVAILABLE = True
except ImportError:
    PYSIDE6_AVAILABLE = False
    QApplication = None
    QMainWindow = None
    GraphModel = None

logger = logging.getLogger(__name__)


class TalusQtMainWindow(QMainWindow if PYSIDE6_AVAILABLE else object):
    """Main window for the Qt-based Talus Tally desktop application."""
    
    def __init__(self, app_title: str = "Talus Tally", window_size: tuple = (1200, 800)):
        """
        Initialize the main window.
        
        Args:
            app_title: Title for the window
            window_size: Tuple of (width, height) for the window
        """
        if not PYSIDE6_AVAILABLE:
            raise RuntimeError("PySide6 is not installed. Install with: pip install PySide6")
        
        super().__init__()
        
        # Import backend components
        from backend.core.graph import ProjectGraph
        from backend.handlers.dispatcher import CommandDispatcher
        from backend.api.graph_service import GraphService
        
        # Initialize backend
        self.graph = ProjectGraph()
        self.dispatcher = CommandDispatcher(self.graph)
        self.service = GraphService(self.graph)
        
        # Initialize the tree model
        self.model = GraphModel(self.graph)
        
        # Configure window
        self.setWindowTitle(app_title)
        self.resize(*window_size)
        
        # Create central widget
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        
        # Setup UI
        self._setup_dock_widgets()
        
        logger.info("Qt main window initialized successfully")
    
    def _setup_dock_widgets(self):
        """Create and configure dock widgets for the UI."""
        # Left dock: Project Browser with tree view
        left_dock = QDockWidget("Project Browser", self)
        left_dock.setAllowedAreas(Qt.LeftDockWidgetArea | Qt.RightDockWidgetArea)
        
        # Create tree view
        self.tree_view = QTreeView()
        self.tree_view.setModel(self.model)
        self.tree_view.setHeaderHidden(True)
        self.tree_view.expandAll()
        
        left_dock.setWidget(self.tree_view)
        self.addDockWidget(Qt.LeftDockWidgetArea, left_dock)
        
        # Right dock: Properties inspector
        right_dock = QDockWidget("Properties", self)
        right_dock.setAllowedAreas(Qt.LeftDockWidgetArea | Qt.RightDockWidgetArea)
        
        # Placeholder widget for properties
        properties_widget = QWidget()
        right_dock.setWidget(properties_widget)
        self.addDockWidget(Qt.RightDockWidgetArea, right_dock)


def create_qt_app(app_title: str = "Talus Tally") -> Optional[QApplication]:
    """
    Create and configure a Qt application.
    
    Args:
        app_title: Title for the application
        
    Returns:
        QApplication instance or None if PySide6 is not available
    """
    if not PYSIDE6_AVAILABLE:
        logger.error("PySide6 is not installed. Cannot create Qt application.")
        return None
    
    # Check if an application instance already exists
    app = QApplication.instance()
    if app is None:
        app = QApplication(sys.argv)
    
    return app


def run_qt_app(app_title: str = "Talus Tally", window_size: tuple = (1200, 800)) -> int:
    """
    Run the Qt-based Talus Tally application.
    
    Args:
        app_title: Title for the window
        window_size: Tuple of (width, height) for the window
        
    Returns:
        Application exit code
    """
    if not PYSIDE6_AVAILABLE:
        logger.error("PySide6 is not installed. Install with: pip install PySide6")
        return 1
    
    try:
        logger.info("Starting Qt application")
        
        # Create Qt application
        qt_app = create_qt_app(app_title)
        if qt_app is None:
            return 1
        
        # Create and show main window
        main_window = TalusQtMainWindow(app_title, window_size)
        main_window.show()
        
        logger.info("Qt application main window shown")
        
        # Run event loop
        return qt_app.exec()
        
    except Exception as e:
        logger.exception(f"Qt application failed with error: {e}")
        return 1


if __name__ == '__main__':
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    sys.exit(run_qt_app())
