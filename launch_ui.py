#!/usr/bin/env python
"""Launch the Talus Tally Qt desktop UI."""
import sys
import os
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

# Check for PySide6
try:
    import PySide6
    print("✅ PySide6 found")
except ImportError:
    print("❌ PySide6 not installed. Installing...")
    os.system(f"{sys.executable} -m pip install PySide6")

# Launch the Qt UI
from backend.ui.qt.main import run_qt_app

if __name__ == '__main__':
    print("🚀 Launching Talus Tally Desktop UI...")
    print("📋 This is the Qt-based project management interface")
    print("🎨 Theme: Bronco II Restomod Dark")
    sys.exit(run_qt_app())
