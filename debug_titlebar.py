#!/usr/bin/env python
"""Debug script to test title bar font and dragging."""
import sys
import logging
import os
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(name)s - %(levelname)s - %(message)s'
)

# Add project root to path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

# Set venv if needed
if not os.environ.get('VIRTUAL_ENV'):
    venv_python = project_root / 'venv' / 'bin' / 'python'
    if venv_python.exists():
        env = os.environ.copy()
        env['VIRTUAL_ENV'] = str(project_root / 'venv')
        os.execve(str(venv_python), [str(venv_python), __file__], env)

try:
    from PySide6.QtWidgets import QApplication, QMainWindow, QWidget, QLabel, QVBoxLayout
    from PySide6.QtCore import Qt
    from PySide6.QtGui import QFont
    
    logger = logging.getLogger(__name__)
    
    # Simple test: just the title bar
    app = QApplication.instance()
    if app is None:
        app = QApplication(sys.argv)
    
    # Create main window (frameless)
    main_window = QMainWindow()
    main_window.setWindowTitle("Font and Drag Test")
    main_window.resize(400, 200)
    main_window.setWindowFlags(Qt.FramelessWindowHint | Qt.Window)
    
    # Import our custom title bar
    from backend.ui.qt.main import CustomTitleBar
    
    title_bar = CustomTitleBar(main_window, "Test Window")
    
    # Central widget
    central = QWidget()
    layout = QVBoxLayout(central)
    label = QLabel("Try dragging the title bar. Font should be Michroma.")
    layout.addWidget(label)
    main_window.setCentralWidget(central)
    
    logger.info("Window created. Try dragging the title bar.")
    main_window.show()
    
    sys.exit(app.exec())
    
except Exception as e:
    logging.error(f"Failed: {e}", exc_info=True)
    sys.exit(1)
