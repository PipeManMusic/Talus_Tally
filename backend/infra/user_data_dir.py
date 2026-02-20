"""
User Data Directory Resolver for Talus Tally

Resolves the XDG-compliant user data directory for storing user-created templates, icons, indicators, and markups.
"""
import os
from pathlib import Path

APP_NAME = "talus_tally"


def get_user_data_dir() -> Path:
    """
    Return the user data directory according to XDG Base Directory Specification.
    Falls back to ~/.local/share/talus_tally if XDG_DATA_HOME is not set.
    """
    xdg_data_home = os.environ.get("XDG_DATA_HOME")
    if xdg_data_home:
        base = Path(xdg_data_home)
    else:
        base = Path.home() / ".local" / "share"
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
