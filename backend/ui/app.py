"""Main application entry point for Talus Tally.

Supports both Toga (GUI) and headless modes via environment variables.
"""
import os
import sys
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def main():
    """Main entry point for the application.
    
    - If TALUS_HEADLESS=1, runs in headless mode
    - Otherwise, attempts to run Toga GUI
    """
    headless = os.environ.get('TALUS_HEADLESS', '0') == '1'
    
    logger.info(f"Starting Talus Tally in {'headless' if headless else 'GUI'} mode")
    
    if headless:
        # Run in headless mode
        _run_headless()
    else:
        # Run Toga GUI
        _run_toga()


def _run_headless():
    """Run the application in headless mode without GUI."""
    logger.info("Running in headless mode")
    
    # Import backend components
    from backend.core.graph import ProjectGraph
    from backend.handlers.dispatcher import CommandDispatcher
    from backend.api.graph_service import GraphService
    from backend.handlers.commands.node_commands import CreateNodeCommand
    
    # Initialize core components
    graph = ProjectGraph()
    dispatcher = CommandDispatcher(graph)
    service = GraphService(graph)
    
    # Create a sample project structure for testing
    logger.info("Creating sample project structure")
    
    # Create root
    root_cmd = CreateNodeCommand(blueprint_type_id="project_root", name="Sample Project")
    root_id = dispatcher.execute(root_cmd)
    logger.info(f"Created project root: {root_id}")
    
    logger.info("Headless mode ready")


class TalusApp:
    """Toga-based GUI application for Talus Tally."""
    
    def __init__(self):
        """Initialize the Talus application."""
        import toga
        
        # Import backend components
        from backend.core.graph import ProjectGraph
        from backend.handlers.dispatcher import CommandDispatcher
        from backend.api.graph_service import GraphService
        
        # Initialize core backend
        self.graph = ProjectGraph()
        self.dispatcher = CommandDispatcher(self.graph)
        self.service = GraphService(self.graph)
        
        # Initialize Toga app
        self.app = toga.App(formal_name="Talus Tally")
    
    def startup(self):
        """Build and configure the GUI on startup."""
        import toga
        from toga.style import Pack
        from toga.constants import ROW
        from backend.ui.viewmodels.config import WINDOW_TITLE, WINDOW_SIZE
        
        logger.info("Building Toga UI")
        
        # Create main window
        main_window = toga.MainWindow(title=WINDOW_TITLE, size=WINDOW_SIZE)
        
        # Create three main containers for the dual layout
        # Left panel: Tree view
        left_box = toga.Box(style=Pack(flex=1))
        
        # Middle panel: Workspace/editor
        middle_box = toga.Box(style=Pack(flex=2))
        
        # Right panel: Inspector
        right_box = toga.Box(style=Pack(flex=1))
        
        # Create split container
        split = toga.SplitContainer(
            children=[left_box, middle_box, right_box],
            style=Pack(flex=1, direction=ROW)
        )
        
        # Set main content
        main_window.content = split
        self.app.main_window = main_window
        
        logger.info("Toga UI setup complete")


def _run_toga():
    """Run the Toga-based GUI application."""
    try:
        logger.info("Initializing Toga GUI")
        app = TalusApp()
        app.startup()
        
        # Attempt to run the GUI
        logger.info("Starting Toga app main loop")
        app.app.main_loop()
        
    except Exception as e:
        logger.error(f"Toga GUI failed: {e}")
        logger.info("Falling back to headless mode")
        _run_headless()


if __name__ == '__main__':
    main()
