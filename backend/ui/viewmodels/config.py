from pathlib import Path

# Paths
BASE_DIR = Path(__file__).parent.parent.parent
ASSETS_DIR = BASE_DIR / "assets"

# UI Constants
WINDOW_TITLE = "Talus Tally"
WINDOW_SIZE = (1200, 800)

# Icon Mappings
ICONS = {
    "project_root": "folder",
    "phase": "calendar",
    "job": "briefcase",
    "task": "clipboard",
    "part": "box",
    "app": "icon"
}
