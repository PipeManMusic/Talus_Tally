#!/usr/bin/env python3
"""Build the backend bundle with PyInstaller and stage runtime resources for Tauri."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIR = PROJECT_ROOT / "frontend"
RESOURCES_ROOT = FRONTEND_DIR / "src-tauri" / "resources"
BACKEND_DIST = PROJECT_ROOT / "dist" / "talus-tally-backend"
SPEC_FILE = PROJECT_ROOT / "talus-tally.spec"
ASSETS_DIR = PROJECT_ROOT / "assets"
DATA_DIR = PROJECT_ROOT / "data"
REQUIREMENTS = PROJECT_ROOT / "requirements.txt"

PYTHON = sys.executable


def _run(cmd: list[str], cwd: Path | None = None) -> None:
    display_cmd = " ".join(cmd)
    print(f"[prepare-tauri] $ {display_cmd}")
    subprocess.run(cmd, cwd=cwd or PROJECT_ROOT, check=True)


def install_dependencies() -> None:
    if not REQUIREMENTS.exists():
        raise SystemExit("requirements.txt not found; cannot install backend dependencies")

    _run([PYTHON, "-m", "pip", "install", "-r", str(REQUIREMENTS)])
    _run([PYTHON, "-m", "pip", "install", "pyinstaller>=6.0.0"])


def build_backend_bundle() -> None:
    if not SPEC_FILE.exists():
        raise SystemExit("talus-tally.spec not found; cannot build backend bundle")

    if (PROJECT_ROOT / "build").exists():
        shutil.rmtree(PROJECT_ROOT / "build")

    if BACKEND_DIST.exists():
        shutil.rmtree(BACKEND_DIST)

    _run([PYTHON, "-m", "PyInstaller", "--clean", str(SPEC_FILE)])

    binary_path = BACKEND_DIST / ("talus-tally-backend.exe" if sys.platform == "win32" else "talus-tally-backend")
    if not binary_path.exists():
        raise SystemExit(f"Backend binary missing after PyInstaller build: {binary_path}")


def copy_tree(source: Path, destination: Path) -> None:
    if not source.exists():
        raise SystemExit(f"Required directory missing: {source}")

    if destination.exists():
        shutil.rmtree(destination)

    shutil.copytree(source, destination)


def stage_resources() -> None:
    RESOURCES_ROOT.mkdir(parents=True, exist_ok=True)

    backend_dest = RESOURCES_ROOT / "talus-tally-backend"
    assets_dest = RESOURCES_ROOT / "assets"
    data_dest = RESOURCES_ROOT / "data"

    copy_tree(BACKEND_DIST, backend_dest)
    copy_tree(ASSETS_DIR, assets_dest)
    copy_tree(DATA_DIR, data_dest)

    print(f"[prepare-tauri] Resources staged at {RESOURCES_ROOT}")


def main() -> None:
    install_dependencies()
    build_backend_bundle()
    stage_resources()


if __name__ == "__main__":
    main()
