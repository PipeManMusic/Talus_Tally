#!/usr/bin/env python
"""Quick test script to launch Qt GUI and verify layout."""
import sys
import logging
import os
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.DEBUG, format='%(name)s - %(levelname)s - %(message)s')

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

# Now import Qt app
try:
    from backend.ui.qt.main import run_qt_app
    sys.exit(run_qt_app("Talus Tally", (1200, 800)))
except Exception as e:
    logging.error(f"Failed to run Qt app: {e}", exc_info=True)
    sys.exit(1)
