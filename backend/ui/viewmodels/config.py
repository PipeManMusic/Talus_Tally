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

# Theme Colors (Bronco II Restomod: Matte Black & Ford Molten Orange)
THEME_COLORS = {
    "background_dark": "#121212",      # Deep Matte Black
    "background_light": "#1e1e1e",     # Dark Gunmetal (Panels)
    "foreground": "#e0e0e0",           # Off-White Text
    "accent": "#D94E1F",               # Ford Molten Orange (Paint Code UY)
    "accent_hover": "#FF6B3B",         # Lighter Magma
    "border": "#333333",               # Dark Grey Borders
    "selection": "#2d2d2d",            # Selection Background
    "success": "#28a745",              # Green
    "warning": "#ffc107",              # Yellow
    "danger": "#dc3545"                # Red
}
