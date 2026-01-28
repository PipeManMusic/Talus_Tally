#!/usr/bin/env python
"""Quick test script to launch the app and verify fonts and dragging."""

import sys
import logging
from pathlib import Path

# Configure logging to see debug output
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

from PySide6.QtWidgets import QApplication
from backend.ui.qt.main import TalusQtMainWindow

def main():
    print("Starting Talus Tally test...")
    print("=" * 60)
    print("FONT TEST:")
    print("  - Check if title bar shows 'Talus Tally' in Michroma font")
    print("  - Check if dock titles show 'Project Browser' and 'Properties' in Michroma")
    print("  - Check if menu and toolbar use Michroma")
    print()
    print("DRAGGING TEST:")
    print("  - Click and drag from the title bar (avoid the buttons on the right)")
    print("  - Watch the debug output below for mouse events")
    print("  - Window should follow your mouse movement")
    print("=" * 60)
    print()
    
    app = QApplication(sys.argv)
    window = TalusQtMainWindow()
    
    # Enable debug info
    print("\nLaunching window...")
    print("(Check debug output below for mouse events and font info)\n")
    
    window.show()
    sys.exit(app.exec())

if __name__ == "__main__":
    main()
