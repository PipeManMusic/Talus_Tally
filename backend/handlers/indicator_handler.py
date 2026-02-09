"""
Indicator API Handler

Layer 3: Python API / Business Logic layer.
Wraps the infra layer (IndicatorCatalogManager) with error handling, validation, and convenience methods.
Provides a clean interface for REST API endpoints and internal application logic.
"""

import os
from typing import Dict, List, Optional, Any
from pathlib import Path
from backend.infra.indicator_catalog import (
    IndicatorCatalogManager,
    IndicatorDef,
    IndicatorSet,
)


class IndicatorHandlerError(Exception):
    """Base exception for indicator handler operations."""
    pass


class IndicatorNotFoundError(IndicatorHandlerError):
    """Raised when an indicator is not found."""
    pass


class IndicatorSetNotFoundError(IndicatorHandlerError):
    """Raised when an indicator set is not found."""
    pass


class IndicatorAlreadyExistsError(IndicatorHandlerError):
    """Raised when trying to create a duplicate indicator."""
    pass


class IndicatorHandler:
    """
    High-level API for indicator management.
    Wraps IndicatorCatalogManager with validation and error handling.
    """

    def __init__(self, catalog_path: str):
        """
        Initialize indicator handler.

        Args:
            catalog_path: Path to catalog.yaml file

        Raises:
            FileNotFoundError: If catalog file doesn't exist
        """
        catalog_path_obj = Path(catalog_path)
        if not catalog_path_obj.exists():
            raise FileNotFoundError(f"Indicator catalog not found: {catalog_path}")

        self.manager = IndicatorCatalogManager(catalog_path)
        self._ensure_loaded()

    def _ensure_loaded(self) -> None:
        """Ensure catalog is loaded."""
        if self.manager._catalog is None:
            self.manager.load()

    # ==================== READ OPERATIONS ====================

    def get_all_sets(self) -> Dict[str, Dict[str, Any]]:
        """
        Get all indicator sets.

        Returns:
            Dictionary of indicator sets with full details
        """
        self._ensure_loaded()

        result = {}
        for set_id in self.manager.list_sets():
            indicator_set = self.manager.get_set(set_id)
            result[set_id] = self._serialize_set(indicator_set)

        return result

    def get_set(self, set_id: str) -> Dict[str, Any]:
        """
        Get a specific indicator set.

        Args:
            set_id: The set ID

        Returns:
            Dictionary with set details

        Raises:
            IndicatorSetNotFoundError: If set not found
        """
        self._ensure_loaded()

        indicator_set = self.manager.get_set(set_id)
        if indicator_set is None:
            raise IndicatorSetNotFoundError(f"Indicator set '{set_id}' not found")

        return self._serialize_set(indicator_set)

    def get_indicator(self, set_id: str, indicator_id: str) -> Dict[str, Any]:
        """
        Get a specific indicator.

        Args:
            set_id: The set ID
            indicator_id: The indicator ID

        Returns:
            Dictionary with indicator details

        Raises:
            IndicatorSetNotFoundError: If set not found
            IndicatorNotFoundError: If indicator not found
        """
        self._ensure_loaded()

        indicator_set = self.manager.get_set(set_id)
        if indicator_set is None:
            raise IndicatorSetNotFoundError(f"Indicator set '{set_id}' not found")

        indicator = self.manager.get_indicator(set_id, indicator_id)
        if indicator is None:
            raise IndicatorNotFoundError(
                f"Indicator '{indicator_id}' not found in set '{set_id}'"
            )

        return self._serialize_indicator(indicator)

    def list_indicators(self, set_id: str) -> List[Dict[str, Any]]:
        """
        List all indicators in a set.

        Args:
            set_id: The set ID

        Returns:
            List of indicator dictionaries

        Raises:
            IndicatorSetNotFoundError: If set not found
        """
        self._ensure_loaded()

        indicator_set = self.manager.get_set(set_id)
        if indicator_set is None:
            raise IndicatorSetNotFoundError(f"Indicator set '{set_id}' not found")

        return [self._serialize_indicator(ind) for ind in indicator_set.indicators]

    # ==================== CREATE OPERATIONS ====================

    def create_indicator(
        self,
        set_id: str,
        indicator_id: str,
        file: str,
        description: str,
    ) -> Dict[str, Any]:
        """
        Create a new indicator.

        Args:
            set_id: The set ID
            indicator_id: Unique ID for the indicator
            file: Path to SVG file
            description: Human-readable description

        Returns:
            Dictionary with created indicator details

        Raises:
            IndicatorSetNotFoundError: If set not found
            IndicatorAlreadyExistsError: If indicator already exists
        """
        self._ensure_loaded()

        try:
            indicator = self.manager.create_indicator(
                set_id=set_id,
                indicator_id=indicator_id,
                file=file,
                description=description,
            )
        except ValueError as e:
            if "not found" in str(e):
                raise IndicatorSetNotFoundError(str(e))
            elif "already exists" in str(e):
                raise IndicatorAlreadyExistsError(str(e))
            raise

        return self._serialize_indicator(indicator)

    # ==================== UPDATE OPERATIONS ====================

    def update_indicator(
        self,
        set_id: str,
        indicator_id: str,
        file: Optional[str] = None,
        description: Optional[str] = None,
        new_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Update an existing indicator.

        Args:
            set_id: The set ID
            indicator_id: The indicator ID
            file: New file path (optional)
            description: New description (optional)
            new_id: New indicator ID (optional)

        Returns:
            Dictionary with updated indicator details

        Raises:
            IndicatorSetNotFoundError: If set not found
            IndicatorNotFoundError: If indicator not found
        """
        self._ensure_loaded()

        try:
            indicator = self.manager.update_indicator(
                set_id=set_id,
                indicator_id=indicator_id,
                file=file,
                description=description,
                new_id=new_id,
            )
        except ValueError as e:
            error_msg = str(e)
            if error_msg.startswith("Indicator set"):
                raise IndicatorSetNotFoundError(error_msg)
            if "already exists" in error_msg:
                raise IndicatorAlreadyExistsError(error_msg)
            raise IndicatorNotFoundError(error_msg)

        return self._serialize_indicator(indicator)

    # ==================== DELETE OPERATIONS ====================

    def delete_indicator(self, set_id: str, indicator_id: str) -> None:
        """
        Delete an indicator.

        Args:
            set_id: The set ID
            indicator_id: The indicator ID

        Raises:
            IndicatorSetNotFoundError: If set not found
            IndicatorNotFoundError: If indicator not found
        """
        self._ensure_loaded()

        try:
            self.manager.delete_indicator(set_id=set_id, indicator_id=indicator_id)
        except ValueError as e:
            error_msg = str(e)
            if error_msg.startswith("Indicator set"):
                raise IndicatorSetNotFoundError(error_msg)
            raise IndicatorNotFoundError(error_msg)

    # ==================== THEME OPERATIONS ====================

    def set_indicator_theme(
        self,
        set_id: str,
        indicator_id: str,
        theme: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Set theme for an indicator.

        Args:
            set_id: The set ID
            indicator_id: The indicator ID
            theme: Theme dictionary with color and style properties

        Returns:
            Dictionary with theme that was set

        Raises:
            IndicatorSetNotFoundError: If set not found
        """
        self._ensure_loaded()

        try:
            self.manager.set_theme(set_id=set_id, indicator_id=indicator_id, theme=theme)
        except ValueError as e:
            raise IndicatorSetNotFoundError(str(e))

        return {'id': indicator_id, 'theme': theme}

    def get_indicator_theme(
        self, set_id: str, indicator_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get theme for an indicator.

        Args:
            set_id: The set ID
            indicator_id: The indicator ID

        Returns:
            Theme dictionary or None

        Raises:
            IndicatorSetNotFoundError: If set not found
        """
        self._ensure_loaded()

        indicator_set = self.manager.get_set(set_id)
        if indicator_set is None:
            raise IndicatorSetNotFoundError(f"Indicator set '{set_id}' not found")

        return self.manager.get_theme(set_id, indicator_id)

    # ==================== PERSISTENCE ====================

    def save(self) -> None:
        """
        Persist all changes to the YAML file.

        This should typically be called after create/update/delete operations.
        """
        self.manager.save()

    def reload(self) -> None:
        """Reload the catalog from file, discarding any unsaved changes."""
        self.manager.clear_cache()
        self._ensure_loaded()

    # ==================== PRIVATE HELPERS ====================

    @staticmethod
    def _serialize_indicator(indicator: IndicatorDef) -> Dict[str, Any]:
        """Convert IndicatorDef to dictionary."""
        d = {
            'id': indicator.id,
            'file': indicator.file,
            'description': indicator.description,
        }
        if indicator.url:
            d['url'] = indicator.url
        return d

    @staticmethod
    def _serialize_set(indicator_set: IndicatorSet) -> Dict[str, Any]:
        """Convert IndicatorSet to dictionary."""
        return {
            'id': indicator_set.id,
            'description': indicator_set.description,
            'indicators': [
                IndicatorHandler._serialize_indicator(ind)
                for ind in indicator_set.indicators
            ],
            'style_guide': indicator_set.style_guide,
            'default_theme': indicator_set.default_theme,
        }
