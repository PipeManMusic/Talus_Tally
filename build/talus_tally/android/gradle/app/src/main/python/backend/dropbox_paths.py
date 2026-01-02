import os
from pathlib import Path

DATA_FILE_NAME = "talus_master.json"
ENV_DATA_DIR = "TALUS_TALLY_DATA_DIR"
DEFAULT_DIR_NAME = ".talus_tally"


def _resolve_base_dir() -> Path:
    env_dir = os.environ.get(ENV_DATA_DIR)
    if env_dir:
        resolved = Path(env_dir).expanduser().resolve()
        resolved.mkdir(parents=True, exist_ok=True)
        return resolved

    default_dir = Path.home() / DEFAULT_DIR_NAME
    default_dir.mkdir(parents=True, exist_ok=True)
    return default_dir


def get_dropbox_app_dir() -> Path:
    # Maintained for backward compatibility; now returns the local app data directory.
    return _resolve_base_dir()


def get_dropbox_data_dir() -> Path:
    data_dir = get_dropbox_app_dir() / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


def get_dropbox_data_path() -> Path:
    return get_dropbox_data_dir() / DATA_FILE_NAME