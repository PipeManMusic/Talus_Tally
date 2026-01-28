#!/usr/bin/env python
"""Quick test to verify fonts are now displaying correctly."""

import sys
import os
import logging

# Set up logging to see debug output
logging.basicConfig(
    level=logging.DEBUG,
    format='%(levelname)s - %(name)s: %(message)s'
)

os.chdir("/home/dworth/Dropbox/Bronco II/Tallus Tally")
sys.path.insert(0, "/home/dworth/Dropbox/Bronco II/Tallus Tally")

from PySide6.QtWidgets import QApplication
from backend.ui.qt.main import TalusQtMainWindow

print("=" * 70)
print("FONT DISPLAY TEST")
print("=" * 70)
print("\nLaunching Talus Tally with updated stylesheet...")
print("\nThings to check:")
print("  1. Title bar text - Should show 'Talus Tally' in Michroma font")
print("  2. Dock titles - 'Project Browser' and 'Properties' in Michroma")
print("  3. Menu bar - Should use Michroma")
print("  4. Toolbar - Should use Michroma")
print("\n" + "=" * 70)

app = QApplication(sys.argv)
window = TalusQtMainWindow()
window.show()

print("\nWindow is now displayed. Check the fonts!")
print("Press Ctrl+C or close the window to exit.\n")

sys.exit(app.exec())
