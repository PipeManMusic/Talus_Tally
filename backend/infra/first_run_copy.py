"""
Copy default templates/assets from /opt/talus_tally to user data dir on first run.
"""
import os
import shutil
from pathlib import Path
from backend.infra.user_data_dir import get_user_templates_dir, get_user_icons_dir, get_user_indicators_dir, get_user_markups_dir

def copy_if_empty(user_dir: Path, system_dir: Path):
    if not user_dir.exists() or not any(user_dir.iterdir()):
        if system_dir.exists():
            for item in system_dir.iterdir():
                dest = user_dir / item.name
                if item.is_file():
                    shutil.copy2(item, dest)
                elif item.is_dir():
                    shutil.copytree(item, dest, dirs_exist_ok=True)


def ensure_user_data_populated():
    # Map user/system dirs for all asset types
    mappings = [
        (get_user_templates_dir(), Path('/opt/talus_tally/data/templates')),
        (get_user_icons_dir(), Path('/opt/talus_tally/data/icons')),
        (get_user_indicators_dir(), Path('/opt/talus_tally/data/indicators')),
        (get_user_markups_dir(), Path('/opt/talus_tally/data/markups')),
    ]
    for user_dir, system_dir in mappings:
        user_dir.mkdir(parents=True, exist_ok=True)
        copy_if_empty(user_dir, system_dir)
