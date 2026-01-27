#!/usr/bin/env python
"""Entry point for Talus Tally application."""
import sys
import os
import logging
from pathlib import Path

# Configure logging before anything else
log_dir = Path(__file__).parent / 'logs'
log_dir.mkdir(exist_ok=True)

log_file = log_dir / 'talus_tally.log'

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_file),
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)
logger.info("Starting Talus Tally application")

# GTK workarounds for display issues
if 'DISPLAY' in os.environ or 'WAYLAND_DISPLAY' in os.environ:
    # Set GTK debug flags for better error reporting
    os.environ.setdefault('GTK_DEBUG', 'gtkwidget')
    # Increase dbus timeout
    os.environ.setdefault('DBUS_SYSTEM_BUS_ADDRESS', 'unix:path=/var/run/dbus/system_bus_socket')

# Add the project root to Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

# Check if we're running from system Python instead of venv
venv_python = project_root / 'venv' / 'bin' / 'python'
current_venv = os.environ.get('VIRTUAL_ENV')

if not current_venv and venv_python.exists():
    logger.info(f"Re-executing with venv Python: {venv_python}")
    # We're not in a venv, but venv exists - re-exec with it
    env = os.environ.copy()
    env['VIRTUAL_ENV'] = str(project_root / 'venv')
    os.execve(str(venv_python), [str(venv_python), __file__], env)

from backend.ui.app import main

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        logger.exception(f"Application failed with exception: {e}")
        sys.exit(1)

from backend.ui.app import main

if __name__ == '__main__':
    main()
