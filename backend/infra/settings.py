"""
Application settings persistence.

Stores user-configurable settings (e.g. custom template directory) in a JSON
file inside the XDG user data directory.
"""

import json
import logging
from pathlib import Path
from typing import Any, Dict, Optional

from backend.infra.user_data_dir import get_user_data_dir

logger = logging.getLogger(__name__)

_SETTINGS_FILE = "settings.json"

# In-memory cache so we don't hit disk on every request
_cache: Optional[Dict[str, Any]] = None


def _settings_path() -> Path:
    return get_user_data_dir() / _SETTINGS_FILE


def load_settings() -> Dict[str, Any]:
    """Load settings from disk, returning defaults if missing/corrupt."""
    global _cache
    if _cache is not None:
        return _cache

    path = _settings_path()
    if path.exists():
        try:
            with open(path, "r") as f:
                _cache = json.load(f)
                return _cache
        except Exception as exc:
            logger.warning(f"Failed to read settings file {path}: {exc}")

    _cache = {}
    return _cache


def save_settings(data: Dict[str, Any]) -> None:
    """Persist settings to disk and update cache."""
    global _cache
    path = _settings_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    _cache = data
    logger.info(f"Settings saved to {path}")


def get_setting(key: str, default: Any = None) -> Any:
    """Read a single setting."""
    return load_settings().get(key, default)


def set_setting(key: str, value: Any) -> None:
    """Write a single setting."""
    settings = load_settings()
    settings[key] = value
    save_settings(settings)
