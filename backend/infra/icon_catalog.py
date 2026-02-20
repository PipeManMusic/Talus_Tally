
import os
from typing import Any, Dict, List, Optional
import yaml
from backend.infra.schema_validator import SchemaValidator
from backend.infra.user_data_dir import get_user_icons_dir


class IconCatalog:
    """Registry for named SVG icons that templates can reference by id."""

    def __init__(self, icons: Dict[str, Dict[str, Any]], catalog_dir: str):
        self._icons = icons
        self.catalog_dir = catalog_dir

    @classmethod
    def load(cls, filepath: str = None) -> "IconCatalog":
        """Load icon catalog metadata and resolve its directory. Defaults to user icons dir."""
        if filepath is None:
            user_dir = get_user_icons_dir()
            filepath = user_dir / "catalog.yaml"
        with open(filepath, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f)

        # Validate against icon schema
        errors = SchemaValidator.validate_icon_catalog(data)
        if errors:
            raise ValueError(f"Icon catalog validation failed:\n" + "\n".join(f"  - {e}" for e in errors))

        icons_list = data.get('icons', []) or []
        icons_map: Dict[str, Dict[str, Any]] = {}
        for entry in icons_list:
            if not isinstance(entry, dict):
                continue
            icon_id = entry.get('id')
            if not icon_id:
                continue
            icons_map[icon_id] = entry
        catalog_dir = os.path.dirname(os.path.abspath(filepath))
        return cls(icons_map, catalog_dir)

    def list_icons(self) -> List[Dict[str, Any]]:
        """Return a list of icon metadata entries."""
        return list(self._icons.values())

    def get_icon_entry(self, icon_id: Optional[str]) -> Optional[Dict[str, Any]]:
        """Retrieve icon metadata by id (extension‑insensitive)."""
        if not icon_id:
            return None
        normalized = icon_id.lower()
        if normalized.endswith('.svg'):
            normalized = normalized[:-4]
        normalized = normalized.strip()
        return self._icons.get(normalized)

    def get_icon_file(self, icon_id: Optional[str]) -> Optional[str]:
        """Return the absolute path to the SVG file for the given icon."""
        entry = self.get_icon_entry(icon_id)
        if not entry:
            return None
        filename = entry.get('file') or f"{entry['id']}.svg"
        return os.path.join(self.catalog_dir, filename)
