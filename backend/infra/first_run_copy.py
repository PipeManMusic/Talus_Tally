"""Seed user data directories with default templates, icons, indicators, and markups."""
import shutil
from pathlib import Path
from backend.infra.user_data_dir import (
    get_user_icons_dir,
    get_user_indicators_dir,
    get_user_markups_dir,
    get_user_templates_dir,
)

import sys
import logging

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SYSTEM_ROOT = Path('/opt/talus_tally')
SYSTEM_ROOT_DEB = Path('/usr/lib/Talus Tally')


def _get_bundled_resource_root() -> Path | None:
    """Locate the Tauri-bundled resources directory.

    In a Tauri NSIS / deb / dmg install the layout is:
        <install_dir>/resources/talus-tally-backend/<binary>
        <install_dir>/resources/data/{templates,markups,...}
        <install_dir>/resources/assets/{icons,indicators,...}

    So from the running binary we walk up to find a sibling `data/`
    or `assets/` directory.
    """
    if not (getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS')):
        return None  # Not a PyInstaller build

    exe = Path(sys.executable).resolve()
    # exe is inside resources/talus-tally-backend/
    # Try: exe.parent.parent  → resources/
    for ancestor in [exe.parent.parent, exe.parent]:
        if (ancestor / 'data' / 'templates').is_dir():
            logger.info(f"[first_run_copy] Found bundled resources at {ancestor}")
            return ancestor
    return None


def copy_if_empty(user_dir: Path, source_dirs):
    """Seed user_dir with files from the first existing source, preserving user edits."""

    def copy_from_source(source: Path, skip_existing: bool):
        for item in source.iterdir():
            dest = user_dir / item.name
            if skip_existing and dest.exists():
                continue
            if item.is_file():
                shutil.copy2(item, dest)
            elif item.is_dir():
                shutil.copytree(item, dest, dirs_exist_ok=True)

    user_dir.mkdir(parents=True, exist_ok=True)
    has_existing_content = any(user_dir.iterdir())

    for source in source_dirs:
        if source.exists():
            copy_from_source(source, skip_existing=has_existing_content)


def ensure_user_data_populated():
    # Discover the Tauri-bundled resources root (if running as a packaged binary)
    bundled_root = _get_bundled_resource_root()

    # Build candidate source directories: system install → Tauri deb → bundled → repo checkout
    def _sources(*relative_parts):
        candidates = [
            SYSTEM_ROOT.joinpath(*relative_parts),
            SYSTEM_ROOT_DEB.joinpath('resources', *relative_parts),
        ]
        if bundled_root:
            candidates.append(bundled_root.joinpath(*relative_parts))
        candidates.append(PROJECT_ROOT.joinpath(*relative_parts))
        return candidates

    mappings = [
        (get_user_templates_dir(), _sources('data', 'templates')),
        (get_user_icons_dir(),     _sources('assets', 'icons')),
        (get_user_indicators_dir(), _sources('assets', 'indicators')),
        (get_user_markups_dir(),   _sources('data', 'markups')),
    ]
    for user_dir, sources in mappings:
        user_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"[first_run_copy] Seeding {user_dir} from candidates: {[str(s) for s in sources]}")
        copy_if_empty(user_dir, sources)
