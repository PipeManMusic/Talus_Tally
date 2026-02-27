"""Seed user data directories with default templates, icons, indicators, and markups."""
import shutil
from pathlib import Path
from backend.infra.user_data_dir import (
    get_user_icons_dir,
    get_user_indicators_dir,
    get_user_markups_dir,
    get_user_templates_dir,
)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SYSTEM_ROOT = Path('/opt/talus_tally')


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
    # Map user dirs to candidate source directories (system install first, then repo)
    mappings = [
        (
            get_user_templates_dir(),
            [
                SYSTEM_ROOT / 'data' / 'templates',
                PROJECT_ROOT / 'data' / 'templates',
            ],
        ),
        (
            get_user_icons_dir(),
            [
                SYSTEM_ROOT / 'assets' / 'icons',
                PROJECT_ROOT / 'assets' / 'icons',
            ],
        ),
        (
            get_user_indicators_dir(),
            [
                SYSTEM_ROOT / 'assets' / 'indicators',
                PROJECT_ROOT / 'assets' / 'indicators',
            ],
        ),
        (
            get_user_markups_dir(),
            [
                SYSTEM_ROOT / 'data' / 'markups',
                PROJECT_ROOT / 'data' / 'markups',
            ],
        ),
    ]
    for user_dir, sources in mappings:
        user_dir.mkdir(parents=True, exist_ok=True)
        copy_if_empty(user_dir, sources)
