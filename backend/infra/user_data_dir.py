"""
User Data Directory Resolver for Talus Tally

Resolves the XDG-compliant user data directory for storing user-created templates, icons, indicators, and markups.
"""
import os
from pathlib import Path

APP_NAME = "talus_tally"


def get_user_data_dir() -> Path:
    """
    Return the platform-appropriate user data directory.

    Windows:  %LOCALAPPDATA%/talus_tally
    macOS:    ~/Library/Application Support/talus_tally
    Linux:    $XDG_DATA_HOME/talus_tally  (default ~/.local/share/talus_tally)
    """
    import sys

    if sys.platform == 'win32':
        local = os.environ.get('LOCALAPPDATA')
        if local:
            base = Path(local)
        else:
            base = Path.home() / 'AppData' / 'Local'
    elif sys.platform == 'darwin':
        base = Path.home() / 'Library' / 'Application Support'
    else:
        xdg_data_home = os.environ.get('XDG_DATA_HOME')
        base = Path(xdg_data_home) if xdg_data_home else Path.home() / '.local' / 'share'

    user_dir = base / APP_NAME
    user_dir.mkdir(parents=True, exist_ok=True)
    return user_dir


def get_user_templates_dir() -> Path:
    d = get_user_data_dir() / "templates"
    d.mkdir(parents=True, exist_ok=True)
    return d

def get_user_icons_dir() -> Path:
    d = get_user_data_dir() / "icons"
    d.mkdir(parents=True, exist_ok=True)
    return d

def get_user_indicators_dir() -> Path:
    d = get_user_data_dir() / "indicators"
    d.mkdir(parents=True, exist_ok=True)
    return d

def get_user_markups_dir() -> Path:
    d = get_user_data_dir() / "markups"
    d.mkdir(parents=True, exist_ok=True)
    return d
