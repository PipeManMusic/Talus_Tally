#!/usr/bin/env python
"""Test script to verify dock widget fonts are correctly applied."""

import sys
from pathlib import Path
from PySide6.QtWidgets import QApplication
from backend.ui.qt.main import TalusQtMainWindow

def main():
    app = QApplication(sys.argv)
    window = TalusQtMainWindow()
    
    # Check dock widgets and their fonts
    print("Checking dock widget fonts...")
    
    # Get all dock widgets
    dock_widgets = window.findChildren(type(window).__bases__[0].__bases__[0].__subclasses__()[0])
    
    # More direct approach: check the central widget's siblings
    for widget in window.children():
        print(f"Widget: {widget.__class__.__name__}")
        if hasattr(widget, 'titleBarWidget'):
            title_bar = widget.titleBarWidget()
            if title_bar:
                font = title_bar.font()
                print(f"  Title bar font: {font.family()} @ {font.pointSize()}pt")
        
        if hasattr(widget, 'widget'):
            inner = widget.widget()
            if inner:
                font = inner.font()
                print(f"  Widget font: {font.family()} @ {font.pointSize()}pt")
    
    print("\nDetailed dock widget check:")
    for i, dock in enumerate(window.findChildren(type(window.addDockWidget.__self__).__bases__[0])):
        print(f"Dock {i}: {dock}")
        title_bar = dock.titleBarWidget()
        if title_bar:
            font = title_bar.font()
            print(f"  Title font: {font.family()}")
    
    window.show()
    print("\nWindow shown. Check the dock widget titles for Michroma font.")
    print("Pressing Ctrl+Q to exit...")
    
    sys.exit(app.exec())

if __name__ == "__main__":
    main()
