"""
Tests for Indicator Catalog CRUD Operations

Verifies all create, read, update, and delete operations for indicators.
Uses temporary file copies to avoid modifying the real catalog.
"""

import pytest
import os
import tempfile
import shutil
import yaml
from pathlib import Path
from backend.infra.indicator_catalog import (
    IndicatorCatalogManager,
    IndicatorSet,
    IndicatorDef,
)


@pytest.fixture
def indicator_catalog_path():
    """Path to the real indicator catalog."""
    return os.path.abspath(
        "/home/dworth/Dropbox/Bronco II/Talus Tally/assets/indicators/catalog.yaml"
    )


@pytest.fixture
def temp_catalog_copy(indicator_catalog_path):
    """Create a temporary copy of the catalog for mutation tests."""
    # Create a temporary directory
    temp_dir = tempfile.mkdtemp()
    temp_catalog_path = os.path.join(temp_dir, "catalog.yaml")

    # Copy the original catalog
    shutil.copy2(indicator_catalog_path, temp_catalog_path)

    yield temp_catalog_path

    # Cleanup
    shutil.rmtree(temp_dir, ignore_errors=True)


class TestIndicatorCatalogRead:
    """Tests for reading/loading indicator catalog."""

    def test_load_catalog(self, indicator_catalog_path):
        """Verify we can load the indicator catalog."""
        manager = IndicatorCatalogManager(indicator_catalog_path)
        sets = manager.load()

        assert sets is not None
        assert "status" in sets
        assert isinstance(sets["status"], IndicatorSet)

    def test_catalog_loaded_once(self, indicator_catalog_path):
        """Verify catalog is cached after first load."""
        manager = IndicatorCatalogManager(indicator_catalog_path)
        sets1 = manager.load()
        sets2 = manager.load()

        # Should be the same object (cached)
        assert sets1 is sets2

    def test_get_indicator_set(self, indicator_catalog_path):
        """Verify we can retrieve a specific indicator set."""
        manager = IndicatorCatalogManager(indicator_catalog_path)
        status_set = manager.get_set("status")

        assert status_set is not None
        assert status_set.id == "status"
        assert status_set.description is not None
        assert len(status_set.indicators) > 0

    def test_get_nonexistent_set_returns_none(self, indicator_catalog_path):
        """Verify getting nonexistent set returns None."""
        manager = IndicatorCatalogManager(indicator_catalog_path)
        result = manager.get_set("nonexistent")

        assert result is None

    def test_list_sets(self, indicator_catalog_path):
        """Verify we can list all indicator sets."""
        manager = IndicatorCatalogManager(indicator_catalog_path)
        sets = manager.list_sets()

        assert isinstance(sets, list)
        assert "status" in sets
        assert len(sets) > 0

    def test_indicator_set_has_expected_indicators(self, indicator_catalog_path):
        """Verify indicator set contains expected indicators."""
        manager = IndicatorCatalogManager(indicator_catalog_path)
        status_set = manager.get_set("status")

        indicator_ids = {ind.id for ind in status_set.indicators}
        expected_ids = {"empty", "partial", "filled", "alert", "low", "medium", "high"}

        for expected_id in expected_ids:
            assert expected_id in indicator_ids, f"Expected indicator '{expected_id}' not found"

    def test_get_indicator(self, indicator_catalog_path):
        """Verify we can get a specific indicator."""
        manager = IndicatorCatalogManager(indicator_catalog_path)
        indicator = manager.get_indicator("status", "empty")

        assert indicator is not None
        assert indicator.id == "empty"
        assert indicator.description is not None
        assert indicator.file is not None

    def test_get_nonexistent_indicator_returns_none(self, indicator_catalog_path):
        """Verify getting nonexistent indicator returns None."""
        manager = IndicatorCatalogManager(indicator_catalog_path)
        result = manager.get_indicator("status", "nonexistent")

        assert result is None

    def test_get_indicator_from_nonexistent_set_returns_none(self, indicator_catalog_path):
        """Verify getting indicator from nonexistent set returns None."""
        manager = IndicatorCatalogManager(indicator_catalog_path)
        result = manager.get_indicator("nonexistent", "empty")

        assert result is None

    def test_get_theme(self, indicator_catalog_path):
        """Verify we can get theme for an indicator."""
        manager = IndicatorCatalogManager(indicator_catalog_path)
        theme = manager.get_theme("status", "empty")

        assert theme is not None
        assert "indicator_color" in theme
        assert theme["indicator_color"] == "#888888"

    def test_get_theme_nonexistent_indicator_returns_none(self, indicator_catalog_path):
        """Verify getting theme for nonexistent indicator returns None."""
        manager = IndicatorCatalogManager(indicator_catalog_path)
        result = manager.get_theme("status", "nonexistent")

        assert result is None


class TestIndicatorCatalogCreate:
    """Tests for creating new indicators."""

    def test_create_indicator(self, temp_catalog_copy):
        """Verify we can create a new indicator."""
        manager = IndicatorCatalogManager(temp_catalog_copy)
        manager.load()

        indicator = manager.create_indicator(
            set_id="status",
            indicator_id="custom",
            file="status_custom.svg",
            description="Custom indicator state",
            url="https://example.com/custom",
        )

        assert indicator.id == "custom"
        assert indicator.file == "status_custom.svg"
        assert indicator.description == "Custom indicator state"
        assert indicator.url == "https://example.com/custom"

    def test_create_indicator_without_url(self, temp_catalog_copy):
        """Verify we can create a new indicator without URL."""
        manager = IndicatorCatalogManager(temp_catalog_copy)
        manager.load()

        indicator = manager.create_indicator(
            set_id="status",
            indicator_id="custom",
            file="status_custom.svg",
            description="Custom indicator state",
        )

        assert indicator.url is None

    def test_create_indicator_appears_in_set(self, temp_catalog_copy):
        """Verify created indicator appears in set."""
        manager = IndicatorCatalogManager(temp_catalog_copy)
        manager.load()

        manager.create_indicator(
            set_id="status",
            indicator_id="new_indicator",
            file="status_new.svg",
            description="New indicator",
        )

        indicator = manager.get_indicator("status", "new_indicator")
        assert indicator is not None
        assert indicator.id == "new_indicator"

    def test_create_indicator_in_nonexistent_set_raises_error(self, temp_catalog_copy):
        """Verify creating indicator in nonexistent set raises error."""
        manager = IndicatorCatalogManager(temp_catalog_copy)
        manager.load()

        with pytest.raises(ValueError, match="not found"):
            manager.create_indicator(
                set_id="nonexistent",
                indicator_id="test",
                file="test.svg",
                description="Test",
            )

    def test_create_duplicate_indicator_raises_error(self, temp_catalog_copy):
        """Verify creating duplicate indicator raises error."""
        manager = IndicatorCatalogManager(temp_catalog_copy)
        manager.load()

        manager.create_indicator(
            set_id="status",
            indicator_id="duplicate",
            file="status_dup.svg",
            description="First attempt",
        )

        with pytest.raises(ValueError, match="already exists"):
            manager.create_indicator(
                set_id="status",
                indicator_id="duplicate",
                file="status_dup2.svg",
                description="Second attempt",
            )


class TestIndicatorCatalogUpdate:
    """Tests for updating existing indicators."""

    def test_update_indicator_file(self, temp_catalog_copy):
        """Verify we can update indicator file."""
        manager = IndicatorCatalogManager(temp_catalog_copy)
        manager.load()

        indicator = manager.update_indicator(
            set_id="status",
            indicator_id="empty",
            file="status_empty_v2.svg",
        )

        assert indicator.file == "status_empty_v2.svg"

    def test_update_indicator_description(self, temp_catalog_copy):
        """Verify we can update indicator description."""
        manager = IndicatorCatalogManager(temp_catalog_copy)
        manager.load()

        indicator = manager.update_indicator(
            set_id="status",
            indicator_id="empty",
            description="Updated description",
        )

        assert indicator.description == "Updated description"

    def test_update_indicator_url(self, temp_catalog_copy):
        """Verify we can update indicator URL."""
        manager = IndicatorCatalogManager(temp_catalog_copy)
        manager.load()

        indicator = manager.update_indicator(
            set_id="status",
            indicator_id="empty",
            url="https://example.com/new",
        )

        assert indicator.url == "https://example.com/new"

    def test_update_multiple_fields(self, temp_catalog_copy):
        """Verify we can update multiple fields at once."""
        manager = IndicatorCatalogManager(temp_catalog_copy)
        manager.load()

        indicator = manager.update_indicator(
            set_id="status",
            indicator_id="empty",
            file="status_empty_new.svg",
            description="New description",
            url="https://example.com/updated",
        )

        assert indicator.file == "status_empty_new.svg"
        assert indicator.description == "New description"
        assert indicator.url == "https://example.com/updated"

    def test_update_nonexistent_indicator_raises_error(self, temp_catalog_copy):
        """Verify updating nonexistent indicator raises error."""
        manager = IndicatorCatalogManager(temp_catalog_copy)
        manager.load()

        with pytest.raises(ValueError, match="not found"):
            manager.update_indicator(
                set_id="status",
                indicator_id="nonexistent",
                file="status_new.svg",
            )

    def test_update_indicator_in_nonexistent_set_raises_error(self, temp_catalog_copy):
        """Verify updating indicator in nonexistent set raises error."""
        manager = IndicatorCatalogManager(temp_catalog_copy)
        manager.load()

        with pytest.raises(ValueError, match="not found"):
            manager.update_indicator(
                set_id="nonexistent",
                indicator_id="empty",
                file="status_new.svg",
            )


class TestIndicatorCatalogDelete:
    """Tests for deleting indicators."""

    def test_delete_indicator(self, temp_catalog_copy):
        """Verify we can delete an indicator."""
        manager = IndicatorCatalogManager(temp_catalog_copy)
        manager.load()

        # First verify it exists
        assert manager.get_indicator("status", "empty") is not None

        # Delete it
        manager.delete_indicator("status", "empty")

        # Verify it's gone
        assert manager.get_indicator("status", "empty") is None

    def test_delete_nonexistent_indicator_raises_error(self, temp_catalog_copy):
        """Verify deleting nonexistent indicator raises error."""
        manager = IndicatorCatalogManager(temp_catalog_copy)
        manager.load()

        with pytest.raises(ValueError, match="not found"):
            manager.delete_indicator("status", "nonexistent")

    def test_delete_indicator_from_nonexistent_set_raises_error(self, temp_catalog_copy):
        """Verify deleting from nonexistent set raises error."""
        manager = IndicatorCatalogManager(temp_catalog_copy)
        manager.load()

        with pytest.raises(ValueError, match="not found"):
            manager.delete_indicator("nonexistent", "empty")


class TestIndicatorCatalogTheme:
    """Tests for theme management."""

    def test_set_theme(self, temp_catalog_copy):
        """Verify we can set theme for an indicator."""
        manager = IndicatorCatalogManager(temp_catalog_copy)
        manager.load()

        theme = {"indicator_color": "#FF0000", "text_color": "#FF0000"}
        manager.set_theme("status", "custom", theme)

        retrieved_theme = manager.get_theme("status", "custom")
        assert retrieved_theme == theme

    def test_set_theme_in_nonexistent_set_raises_error(self, temp_catalog_copy):
        """Verify setting theme in nonexistent set raises error."""
        manager = IndicatorCatalogManager(temp_catalog_copy)
        manager.load()

        with pytest.raises(ValueError, match="not found"):
            manager.set_theme("nonexistent", "test", {"indicator_color": "#FF0000"})


class TestIndicatorCatalogPersistence:
    """Tests for file persistence."""

    def test_save_creates_new_indicators(self, temp_catalog_copy):
        """Verify created indicators are persisted to file."""
        manager = IndicatorCatalogManager(temp_catalog_copy)
        manager.load()

        manager.create_indicator(
            set_id="status",
            indicator_id="persisted",
            file="status_persisted.svg",
            description="Should be persisted",
        )

        manager.save()

        # Create new manager and reload
        manager2 = IndicatorCatalogManager(temp_catalog_copy)
        manager2.load()

        indicator = manager2.get_indicator("status", "persisted")
        assert indicator is not None
        assert indicator.description == "Should be persisted"

    def test_save_persists_updates(self, temp_catalog_copy):
        """Verify updated indicators are persisted."""
        manager = IndicatorCatalogManager(temp_catalog_copy)
        manager.load()

        manager.update_indicator(
            set_id="status",
            indicator_id="empty",
            description="Updated in test",
        )

        manager.save()

        # Reload and verify
        manager2 = IndicatorCatalogManager(temp_catalog_copy)
        manager2.load()

        indicator = manager2.get_indicator("status", "empty")
        assert indicator.description == "Updated in test"

    def test_save_persists_deletions(self, temp_catalog_copy):
        """Verify deletions are persisted."""
        manager = IndicatorCatalogManager(temp_catalog_copy)
        manager.load()

        # Create first
        manager.create_indicator(
            set_id="status",
            indicator_id="to_delete",
            file="status_delete.svg",
            description="To be deleted",
        )
        manager.save()

        # Delete
        manager.delete_indicator("status", "to_delete")
        manager.save()

        # Reload and verify
        manager2 = IndicatorCatalogManager(temp_catalog_copy)
        manager2.load()

        indicator = manager2.get_indicator("status", "to_delete")
        assert indicator is None

    def test_save_without_load_raises_error(self, temp_catalog_copy):
        """Verify saving without loading raises error."""
        manager = IndicatorCatalogManager(temp_catalog_copy)

        with pytest.raises(RuntimeError, match="No catalog loaded"):
            manager.save()

    def test_yaml_format_is_valid(self, temp_catalog_copy):
        """Verify saved YAML can be parsed."""
        manager = IndicatorCatalogManager(temp_catalog_copy)
        manager.load()

        manager.create_indicator(
            set_id="status",
            indicator_id="test",
            file="test.svg",
            description="Test",
        )

        manager.save()

        # Verify YAML is valid by loading it
        with open(temp_catalog_copy, 'r') as f:
            data = yaml.safe_load(f)

        assert "indicator_sets" in data
        assert "status" in data["indicator_sets"]

        indicators = data["indicator_sets"]["status"]["indicators"]
        indicator_ids = {ind["id"] for ind in indicators}
        assert "test" in indicator_ids

    def test_clear_cache_forces_reload(self, temp_catalog_copy):
        """Verify clear_cache forces reload on next access."""
        manager = IndicatorCatalogManager(temp_catalog_copy)
        sets1 = manager.load()

        manager.clear_cache()

        sets2 = manager.load()

        # Should be different objects now
        assert sets1 is not sets2


class TestIndicatorCatalogMutationWorkflow:
    """Tests for complete workflows involving multiple operations."""

    def test_complete_crud_workflow(self, temp_catalog_copy):
        """Test a complete CRUD workflow."""
        manager = IndicatorCatalogManager(temp_catalog_copy)

        # CREATE
        manager.load()
        manager.create_indicator(
            set_id="status",
            indicator_id="test_indicator",
            file="status_test.svg",
            description="Test indicator",
            url="https://example.com/test",
        )

        # READ
        indicator = manager.get_indicator("status", "test_indicator")
        assert indicator is not None
        assert indicator.description == "Test indicator"

        # UPDATE
        manager.update_indicator(
            set_id="status",
            indicator_id="test_indicator",
            description="Updated test indicator",
        )
        indicator = manager.get_indicator("status", "test_indicator")
        assert indicator.description == "Updated test indicator"

        # PERSIST
        manager.save()

        # Verify persistence
        manager2 = IndicatorCatalogManager(temp_catalog_copy)
        manager2.load()
        indicator = manager2.get_indicator("status", "test_indicator")
        assert indicator.description == "Updated test indicator"

        # DELETE
        manager2.delete_indicator("status", "test_indicator")
        manager2.save()

        # Verify deletion persisted
        manager3 = IndicatorCatalogManager(temp_catalog_copy)
        manager3.load()
        indicator = manager3.get_indicator("status", "test_indicator")
        assert indicator is None

    def test_multiple_operations_before_save(self, temp_catalog_copy):
        """Test multiple operations before saving."""
        manager = IndicatorCatalogManager(temp_catalog_copy)
        manager.load()

        # Create multiple indicators
        manager.create_indicator(
            set_id="status",
            indicator_id="new1",
            file="status_new1.svg",
            description="New 1",
        )
        manager.create_indicator(
            set_id="status",
            indicator_id="new2",
            file="status_new2.svg",
            description="New 2",
        )

        # Update an existing one
        manager.update_indicator(
            set_id="status",
            indicator_id="empty",
            description="Empty - updated",
        )

        # Save all changes
        manager.save()

        # Verify all changes
        manager2 = IndicatorCatalogManager(temp_catalog_copy)
        manager2.load()

        assert manager2.get_indicator("status", "new1") is not None
        assert manager2.get_indicator("status", "new2") is not None
        assert manager2.get_indicator("status", "empty").description == "Empty - updated"
