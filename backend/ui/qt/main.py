"""Qt/PySide6-based GUI application for Talus Tally (Desktop).

This module provides a Qt-based desktop interface for Talus Tally,
complementing the Toga-based mobile interface.
"""
import sys
import logging
from typing import Optional

try:
    from PySide6.QtWidgets import (
        QApplication, QMainWindow, QSplitter, QWidget, QVBoxLayout
    )
    from PySide6.QtCore import Qt
    PYSIDE6_AVAILABLE = True
except ImportError:
    PYSIDE6_AVAILABLE = False
    QApplication = None
    QMainWindow = None

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
        
        # Configure window
        self.setWindowTitle(app_title)
        self.resize(*window_size)
        
        # Create central widget and layout
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        
        layout = QVBoxLayout(central_widget)
        
        # Create split container for three panels
        splitter = QSplitter(Qt.Horizontal)
        
        # Left panel: Tree view (placeholder)
        left_widget = QWidget()
        left_widget.setMinimumWidth(200)
        
        # Middle panel: Workspace/editor (placeholder)
        middle_widget = QWidget()
        middle_widget.setMinimumWidth(400)
        
        # Right panel: Inspector (placeholder)
        right_widget = QWidget()
        right_widget.setMinimumWidth(250)
        
        # Add panels to splitter
        splitter.addWidget(left_widget)
        splitter.addWidget(middle_widget)
        splitter.addWidget(right_widget)
        
        # Set equal initial sizing
        splitter.setSizes([200, 800, 200])
        splitter.setCollapsible(0, False)
        splitter.setCollapsible(1, False)
        splitter.setCollapsible(2, False)
        
        # Add splitter to layout
        layout.addWidget(splitter)
        
        logger.info("Qt main window initialized successfully")


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
