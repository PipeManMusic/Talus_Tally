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
LEGACY_CUSTOM_TEMPLATES_DIR_KEY = "custom_templates_dir"
CUSTOM_BLUEPRINT_TEMPLATES_DIR_KEY = "custom_blueprint_templates_dir"
CUSTOM_EXPORT_TEMPLATES_DIR_KEY = "custom_export_templates_dir"
CUSTOM_MARKUP_TEMPLATES_DIR_KEY = "custom_markup_templates_dir"

_DEFAULT_SETTINGS: Dict[str, Any] = {
    CUSTOM_BLUEPRINT_TEMPLATES_DIR_KEY: None,
    CUSTOM_EXPORT_TEMPLATES_DIR_KEY: None,
    CUSTOM_MARKUP_TEMPLATES_DIR_KEY: None,
}

# In-memory cache so we don't hit disk on every request
_cache: Optional[Dict[str, Any]] = None


def _settings_path() -> Path:
    return get_user_data_dir() / _SETTINGS_FILE


def _normalize_directory_value(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _normalize_settings(data: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    normalized = dict(_DEFAULT_SETTINGS)
    if isinstance(data, dict):
        normalized.update(data)

    legacy_templates_dir = None
    if isinstance(data, dict):
        legacy_templates_dir = _normalize_directory_value(data.get(LEGACY_CUSTOM_TEMPLATES_DIR_KEY))

    normalized[CUSTOM_BLUEPRINT_TEMPLATES_DIR_KEY] = _normalize_directory_value(
        normalized.get(CUSTOM_BLUEPRINT_TEMPLATES_DIR_KEY)
    ) or legacy_templates_dir
    normalized[CUSTOM_EXPORT_TEMPLATES_DIR_KEY] = _normalize_directory_value(
        normalized.get(CUSTOM_EXPORT_TEMPLATES_DIR_KEY)
    ) or legacy_templates_dir
    normalized[CUSTOM_MARKUP_TEMPLATES_DIR_KEY] = _normalize_directory_value(
        normalized.get(CUSTOM_MARKUP_TEMPLATES_DIR_KEY)
    ) or legacy_templates_dir

    normalized.pop(LEGACY_CUSTOM_TEMPLATES_DIR_KEY, None)
    return normalized


def load_settings() -> Dict[str, Any]:
    """Load settings from disk, returning defaults if missing/corrupt."""
    global _cache
    if _cache is not None:
        return _cache

    path = _settings_path()
    if path.exists():
        try:
            with open(path, "r") as f:
                _cache = _normalize_settings(json.load(f))
                return _cache
        except Exception as exc:
            logger.warning(f"Failed to read settings file {path}: {exc}")

    _cache = dict(_DEFAULT_SETTINGS)
    return _cache


def save_settings(data: Dict[str, Any]) -> None:
    """Persist settings to disk and update cache."""
    global _cache
    path = _settings_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    normalized = _normalize_settings(data)
    with open(path, "w") as f:
        json.dump(normalized, f, indent=2)
    _cache = normalized
    logger.info(f"Settings saved to {path}")


def get_setting(key: str, default: Any = None) -> Any:
    """Read a single setting."""
    return load_settings().get(key, default)


def set_setting(key: str, value: Any) -> None:
    """Write a single setting."""
    settings = load_settings()
    settings[key] = value
    save_settings(settings)
