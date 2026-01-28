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
        QDockWidget, QTreeView, QFileDialog
    )
    from PySide6.QtCore import Qt
    from backend.ui.qt.tree_model import GraphModel
    from backend.ui.qt.wizard import ProjectWizardDialog
    from backend.infra.persistence import PersistenceManager
    PYSIDE6_AVAILABLE = True
except ImportError:
    PYSIDE6_AVAILABLE = False
    QApplication = None
    QMainWindow = None
    GraphModel = None
    ProjectWizardDialog = None
    QFileDialog = None
    PersistenceManager = None

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
    
    def new_project(self):
        """Launch the new project wizard and create a new project."""
        if ProjectWizardDialog is None:
            logger.error("ProjectWizardDialog not available")
            return
        
        # Show wizard dialog
        wizard = ProjectWizardDialog(self)
        result = wizard.exec()
        
        # If user accepted, get the new graph
        if result == 1:  # QDialog.Accepted
            new_graph = wizard.get_result_graph()
            if new_graph:
                # Replace the current graph
                self.graph = new_graph
                self.dispatcher.graph = new_graph
                self.service.graph = new_graph
                
                # Update the model
                self.model = GraphModel(self.graph)
                self.tree_view.setModel(self.model)
                self.tree_view.expandAll()
                
                logger.info(f"Created new project with {len(self.graph.nodes)} nodes")
    
    def save_project(self):
        """Save the current project to a file."""
        if QFileDialog is None or PersistenceManager is None:
            logger.error("QFileDialog or PersistenceManager not available")
            return
        
        # Show save file dialog
        file_path, _ = QFileDialog.getSaveFileName(
            self,
            "Save Project",
            "",
            "JSON Files (*.json)"
        )
        
        if file_path:
            # Save using PersistenceManager
            manager = PersistenceManager(file_path)
            manager.save(self.graph)
            logger.info(f"Saved project to {file_path}")
    
    def open_project(self):
        """Open a project from a file."""
        if QFileDialog is None or PersistenceManager is None:
            logger.error("QFileDialog or PersistenceManager not available")
            return
        
        # Show open file dialog
        file_path, _ = QFileDialog.getOpenFileName(
            self,
            "Open Project",
            "",
            "JSON Files (*.json)"
        )
        
        if file_path:
            # Load using PersistenceManager
            manager = PersistenceManager(file_path)
            loaded_graph = manager.load()
            
            if loaded_graph:
                # Replace the current graph
                self.graph = loaded_graph
                self.dispatcher.graph = loaded_graph
                self.service.graph = loaded_graph
                
                # Update the model
                self.model = GraphModel(self.graph)
                self.tree_view.setModel(self.model)
                self.tree_view.expandAll()
                
                logger.info(f"Loaded project from {file_path} with {len(self.graph.nodes)} nodes")


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
