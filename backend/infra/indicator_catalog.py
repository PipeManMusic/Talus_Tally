"""
Indicator Catalog CRUD Operations

Layer 2: Business Logic for indicator set management.
Handles creation, reading, updating, and deletion of indicators with YAML persistence.
"""


import yaml
import os
from pathlib import Path
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict, field
from datetime import datetime
import tempfile
from backend.infra.schema_validator import SchemaValidator
from backend.infra.user_data_dir import get_user_indicators_dir


@dataclass
class IndicatorDef:
    """Definition of a single indicator."""
    id: str
    file: str
    description: str
    url: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for YAML serialization."""
        d = {
            'id': self.id,
            'file': self.file,
            'description': self.description,
        }
        if self.url:
            d['url'] = self.url
        return d


@dataclass
class IndicatorSet:
    """Definition of an indicator set."""
    id: str
    description: str
    style_guide: Optional[str] = None
    indicators: List[IndicatorDef] = field(default_factory=list)
    default_theme: Dict[str, Dict[str, Any]] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for YAML serialization."""
        d = {
            'description': self.description,
            'indicators': [ind.to_dict() for ind in self.indicators],
        }
        if self.style_guide:
            d['style_guide'] = self.style_guide
        if self.default_theme:
            d['default_theme'] = self.default_theme
        return d


class IndicatorCatalogManager:
    """Manages indicator catalog CRUD operations with file persistence."""

    def __init__(self, catalog_path: str = None):
        """
        Initialize manager for indicator catalog. Defaults to user indicators dir.

        Args:
            catalog_path: Path to catalog.yaml file (optional)
        """
        if catalog_path is None:
            user_dir = get_user_indicators_dir()
            catalog_path = user_dir / "catalog.yaml"
        self.catalog_path = Path(catalog_path)
        self._catalog: Optional[Dict[str, IndicatorSet]] = None

    def load(self) -> Dict[str, IndicatorSet]:
        """
        Load indicator catalog from YAML file.

        Returns:
            Dictionary of indicator sets by ID
        """
        if self._catalog is not None:
            return self._catalog

        if not self.catalog_path.exists():
            raise FileNotFoundError(f"Catalog file not found: {self.catalog_path}")

        with open(self.catalog_path, 'r') as f:
            data = yaml.safe_load(f) or {}

        # Validate against indicator schema
        errors = SchemaValidator.validate_indicator_catalog(data)
        if errors:
            raise ValueError(f"Indicator catalog validation failed:\n" + "\n".join(f"  - {e}" for e in errors))

        self._catalog = {}
        indicator_sets_data = data.get('indicator_sets', {})

        for set_id, set_data in indicator_sets_data.items():
            indicators = []
            for ind_data in set_data.get('indicators', []):
                indicator = IndicatorDef(
                    id=ind_data['id'],
                    file=ind_data['file'],
                    description=ind_data.get('description', ''),
                    url=ind_data.get('url'),
                )
                indicators.append(indicator)

            indicator_set = IndicatorSet(
                id=set_id,
                description=set_data.get('description', ''),
                style_guide=set_data.get('style_guide'),
                indicators=indicators,
                default_theme=set_data.get('default_theme', {}),
            )
            self._catalog[set_id] = indicator_set

        return self._catalog

    def save(self) -> None:
        """Save catalog changes back to YAML file."""
        if self._catalog is None:
            raise RuntimeError("No catalog loaded. Call load() first.")

        # Build the YAML structure
        indicator_sets = {}
        for set_id, indicator_set in self._catalog.items():
            indicator_sets[set_id] = indicator_set.to_dict()

        data = {'indicator_sets': indicator_sets}

        # Write to temp file first, then atomically replace
        temp_fd, temp_path = tempfile.mkstemp(
            prefix=self.catalog_path.name, dir=str(self.catalog_path.parent)
        )
        try:
            with os.fdopen(temp_fd, 'w') as f:
                yaml.dump(data, f, default_flow_style=False, sort_keys=False)
            os.replace(temp_path, self.catalog_path)
        finally:
            if os.path.exists(temp_path):
                os.unlink(temp_path)

    def get_set(self, set_id: str) -> Optional[IndicatorSet]:
        """
        Get an indicator set by ID.

        Args:
            set_id: The set ID

        Returns:
            The IndicatorSet or None if not found
        """
        if self._catalog is None:
            self.load()

        return self._catalog.get(set_id)

    def list_sets(self) -> List[str]:
        """List all indicator set IDs."""
        if self._catalog is None:
            self.load()

        return list(self._catalog.keys())

    def create_indicator(
        self,
        set_id: str,
        indicator_id: str,
        file: str,
        description: str,
    ) -> IndicatorDef:
        """
        Create a new indicator in a set.

        Args:
            set_id: The indicator set ID
            indicator_id: Unique ID for the indicator within the set
            file: Path to SVG file relative to catalog directory
            description: Human-readable description

        Returns:
            The created IndicatorDef

        Raises:
            ValueError: If set not found or indicator already exists
        """
        if self._catalog is None:
            self.load()

        if set_id not in self._catalog:
            raise ValueError(f"Indicator set '{set_id}' not found")

        indicator_set = self._catalog[set_id]

        # Check if indicator already exists
        if any(ind.id == indicator_id for ind in indicator_set.indicators):
            raise ValueError(
                f"Indicator '{indicator_id}' already exists in set '{set_id}'"
            )

        indicator = IndicatorDef(
            id=indicator_id,
            file=file,
            description=description,
        )
        indicator_set.indicators.append(indicator)

        return indicator

    def update_indicator(
        self,
        set_id: str,
        indicator_id: str,
        file: Optional[str] = None,
        description: Optional[str] = None,
        new_id: Optional[str] = None,
    ) -> IndicatorDef:
        """
        Update an existing indicator.

        Args:
            set_id: The indicator set ID
            indicator_id: The indicator ID to update
            file: New file path (optional)
            description: New description (optional)
            new_id: New indicator ID (optional)

        Returns:
            The updated IndicatorDef

        Raises:
            ValueError: If set or indicator not found
        """
        if self._catalog is None:
            self.load()

        if set_id not in self._catalog:
            raise ValueError(f"Indicator set '{set_id}' not found")

        indicator_set = self._catalog[set_id]
        indicator = None

        for ind in indicator_set.indicators:
            if ind.id == indicator_id:
                indicator = ind
                break

        if indicator is None:
            raise ValueError(
                f"Indicator '{indicator_id}' not found in set '{set_id}'"
            )

        if new_id and new_id != indicator_id:
            if any(ind.id == new_id for ind in indicator_set.indicators):
                raise ValueError(
                    f"Indicator '{new_id}' already exists in set '{set_id}'"
                )
            indicator.id = new_id
            if indicator_set.default_theme and indicator_id in indicator_set.default_theme:
                indicator_set.default_theme[new_id] = indicator_set.default_theme.pop(indicator_id)

        # Update only provided fields
        if file is not None:
            indicator.file = file
        if description is not None:
            indicator.description = description

        return indicator

    def delete_indicator(self, set_id: str, indicator_id: str) -> None:
        """
        Delete an indicator from a set.

        Args:
            set_id: The indicator set ID
            indicator_id: The indicator ID to delete

        Raises:
            ValueError: If set or indicator not found
        """
        if self._catalog is None:
            self.load()

        if set_id not in self._catalog:
            raise ValueError(f"Indicator set '{set_id}' not found")

        indicator_set = self._catalog[set_id]
        original_length = len(indicator_set.indicators)

        indicator_set.indicators = [
            ind for ind in indicator_set.indicators if ind.id != indicator_id
        ]

        if len(indicator_set.indicators) == original_length:
            raise ValueError(
                f"Indicator '{indicator_id}' not found in set '{set_id}'"
            )

    def get_indicator(self, set_id: str, indicator_id: str) -> Optional[IndicatorDef]:
        """
        Get a specific indicator.

        Args:
            set_id: The indicator set ID
            indicator_id: The indicator ID

        Returns:
            The IndicatorDef or None if not found
        """
        indicator_set = self.get_set(set_id)
        if indicator_set is None:
            return None

        for ind in indicator_set.indicators:
            if ind.id == indicator_id:
                return ind

        return None

    def set_theme(
        self,
        set_id: str,
        indicator_id: str,
        theme: Dict[str, Any],
    ) -> None:
        """
        Set the theme for an indicator.

        Args:
            set_id: The indicator set ID
            indicator_id: The indicator ID
            theme: Theme dict with color and style properties

        Raises:
            ValueError: If set not found
        """
        if self._catalog is None:
            self.load()

        if set_id not in self._catalog:
            raise ValueError(f"Indicator set '{set_id}' not found")

        indicator_set = self._catalog[set_id]
        if indicator_set.default_theme is None:
            indicator_set.default_theme = {}

        indicator_set.default_theme[indicator_id] = theme

    def get_theme(
        self, set_id: str, indicator_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get the theme for an indicator.

        Args:
            set_id: The indicator set ID
            indicator_id: The indicator ID

        Returns:
            The theme dict or None if not set
        """
        indicator_set = self.get_set(set_id)
        if indicator_set is None:
            return None

        return indicator_set.default_theme.get(indicator_id)

    def clear_cache(self) -> None:
        """Clear the in-memory cache, forcing a reload on next access."""
        self._catalog = None
