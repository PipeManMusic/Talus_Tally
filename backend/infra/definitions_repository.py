import logging
import os
import sys
from pathlib import Path
from typing import List

import yaml


logger = logging.getLogger("DefinitionsRepository")

def _user_definitions_dir() -> Path:
    """Return the user data overrides directory without forcing files to exist."""
    xdg_home = os.environ.get('XDG_DATA_HOME')
    if xdg_home:
        base = Path(xdg_home)
    else:
        base = Path.home() / '.local' / 'share'
    return base / 'talus_tally' / 'definitions'

def _collect_meta_schema_candidates() -> List[Path]:
    """Build ordered list of possible meta_schema.yaml locations."""
    candidates: List[Path] = []

    env_override = os.environ.get('TALUS_META_SCHEMA_PATH')
    if env_override:
        candidates.append(Path(env_override))

    env_data_root = os.environ.get('TALUS_DATA_ROOT')
    if env_data_root:
        candidates.append(Path(env_data_root) / 'definitions' / 'meta_schema.yaml')

    user_override = _user_definitions_dir() / 'meta_schema.yaml'
    candidates.append(user_override)

    repo_root = Path(__file__).resolve().parent.parent.parent
    repo_candidate = repo_root / 'data' / 'definitions' / 'meta_schema.yaml'
    production_candidates = [
        Path('/opt/talus_tally/data/definitions/meta_schema.yaml'),
        Path('/opt/talus-tally/data/definitions/meta_schema.yaml'),
    ]
    pyinstaller_candidate = None
    if hasattr(sys, '_MEIPASS'):
        pyinstaller_candidate = Path(sys._MEIPASS) / 'data' / 'definitions' / 'meta_schema.yaml'

    env_mode = os.environ.get('TALUS_ENV', 'auto').lower()
    is_frozen = getattr(sys, 'frozen', False)

    if env_mode == 'development' or (env_mode == 'auto' and not is_frozen):
        ordered_roots = [repo_candidate] + production_candidates
        if pyinstaller_candidate:
            ordered_roots.append(pyinstaller_candidate)
    elif env_mode == 'production' or (env_mode == 'auto' and is_frozen):
        ordered_roots = production_candidates[:]
        if pyinstaller_candidate:
            ordered_roots.append(pyinstaller_candidate)
        ordered_roots.append(repo_candidate)
    else:
        ordered_roots = production_candidates[:]
        if pyinstaller_candidate:
            ordered_roots.append(pyinstaller_candidate)
        ordered_roots.append(repo_candidate)

    candidates.extend(ordered_roots)

    # Remove duplicates while preserving order
    seen = set()
    ordered: List[Path] = []
    for candidate in candidates:
        key = str(candidate)
        if key not in seen:
            seen.add(key)
            ordered.append(candidate)
    return ordered


class DefinitionsRepository:
    """
    Repository for loading schema and definition files from disk.
    """

    def load_meta_schema(self):
        """
        Loads and parses the meta_schema.yaml file from data/definitions/.
        Returns the parsed schema as a Python object.
        Raises FileNotFoundError if the file does not exist.
        """
        schema_path = None
        checked_paths: List[str] = []

        for candidate in _collect_meta_schema_candidates():
            checked_paths.append(str(candidate))
            if candidate.is_file():
                schema_path = candidate
                break

        if not schema_path:
            logger.error(
                "meta_schema.yaml not found. Checked the following locations: %s",
                checked_paths,
            )
            raise FileNotFoundError(
                f"meta_schema.yaml not found. Checked: {', '.join(checked_paths)}"
            )

        logger.info(f"[meta_schema] Using {schema_path}")
        with schema_path.open('r', encoding='utf-8') as meta_schema_file:
            logger.info("[meta_schema] Successfully opened meta_schema.yaml")
            return yaml.safe_load(meta_schema_file)
