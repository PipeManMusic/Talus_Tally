"""
Tests for Indicator Handler (Python API Layer)

Verifies the high-level API with error handling, validation, and convenience methods.
"""

import pytest
import os
import tempfile
import shutil
from backend.handlers.indicator_handler import (
    IndicatorHandler,
    IndicatorHandlerError,
    IndicatorNotFoundError,
    IndicatorSetNotFoundError,
    IndicatorAlreadyExistsError,
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
    temp_dir = tempfile.mkdtemp()
    temp_catalog_path = os.path.join(temp_dir, "catalog.yaml")

    shutil.copy2(indicator_catalog_path, temp_catalog_path)

    yield temp_catalog_path

    shutil.rmtree(temp_dir, ignore_errors=True)


class TestIndicatorHandlerInitialization:
    """Tests for handler initialization."""

    def test_initialize_with_valid_catalog(self, indicator_catalog_path):
        """Verify handler initializes with valid catalog."""
        handler = IndicatorHandler(indicator_catalog_path)
        assert handler is not None

    def test_initialize_with_nonexistent_catalog_raises_error(self):
        """Verify initialization with nonexistent catalog raises error."""
        with pytest.raises(FileNotFoundError):
            IndicatorHandler("/nonexistent/path/catalog.yaml")


class TestIndicatorHandlerRead:
    """Tests for read operations."""

    def test_get_all_sets(self, indicator_catalog_path):
        """Verify we can get all indicator sets."""
        handler = IndicatorHandler(indicator_catalog_path)
        sets = handler.get_all_sets()

        assert "status" in sets
        assert sets["status"]["id"] == "status"
        assert len(sets["status"]["indicators"]) > 0

    def test_get_specific_set(self, indicator_catalog_path):
        """Verify we can get a specific set."""
        handler = IndicatorHandler(indicator_catalog_path)
        status_set = handler.get_set("status")

        assert status_set["id"] == "status"
        assert "description" in status_set
        assert "indicators" in status_set

    def test_get_nonexistent_set_raises_error(self, indicator_catalog_path):
        """Verify getting nonexistent set raises proper error."""
        handler = IndicatorHandler(indicator_catalog_path)

        with pytest.raises(IndicatorSetNotFoundError):
            handler.get_set("nonexistent")

    def test_list_indicators(self, indicator_catalog_path):
        """Verify we can list indicators in a set."""
        handler = IndicatorHandler(indicator_catalog_path)
        indicators = handler.list_indicators("status")

        assert isinstance(indicators, list)
        assert len(indicators) > 0

        # Should contain expected indicators
        indicator_ids = {ind["id"] for ind in indicators}
        assert "empty" in indicator_ids

    def test_list_indicators_from_nonexistent_set_raises_error(self, indicator_catalog_path):
        """Verify listing indicators from nonexistent set raises error."""
        handler = IndicatorHandler(indicator_catalog_path)

        with pytest.raises(IndicatorSetNotFoundError):
            handler.list_indicators("nonexistent")

    def test_get_indicator(self, indicator_catalog_path):
        """Verify we can get a specific indicator."""
        handler = IndicatorHandler(indicator_catalog_path)
        indicator = handler.get_indicator("status", "empty")

        assert indicator["id"] == "empty"
        assert "description" in indicator
        assert "file" in indicator

    def test_get_nonexistent_indicator_raises_error(self, indicator_catalog_path):
        """Verify getting nonexistent indicator raises error."""
        handler = IndicatorHandler(indicator_catalog_path)

        with pytest.raises(IndicatorNotFoundError):
            handler.get_indicator("status", "nonexistent")

    def test_get_indicator_from_nonexistent_set_raises_error(self, indicator_catalog_path):
        """Verify getting indicator from nonexistent set raises error."""
        handler = IndicatorHandler(indicator_catalog_path)

        with pytest.raises(IndicatorSetNotFoundError):
            handler.get_indicator("nonexistent", "empty")


class TestIndicatorHandlerCreate:
    """Tests for create operations."""

    def test_create_indicator(self, temp_catalog_copy):
        """Verify we can create an indicator."""
        handler = IndicatorHandler(temp_catalog_copy)

        indicator = handler.create_indicator(
            set_id="status",
            indicator_id="custom",
            file="status_custom.svg",
            description="Custom indicator",
            url="https://example.com/custom",
        )

        assert indicator["id"] == "custom"
        assert indicator["description"] == "Custom indicator"
        assert indicator["url"] == "https://example.com/custom"

    def test_create_indicator_without_url(self, temp_catalog_copy):
        """Verify we can create indicator without URL."""
        handler = IndicatorHandler(temp_catalog_copy)

        indicator = handler.create_indicator(
            set_id="status",
            indicator_id="custom",
            file="status_custom.svg",
            description="Custom indicator",
        )

        assert "url" not in indicator or indicator.get("url") is None

    def test_create_in_nonexistent_set_raises_error(self, temp_catalog_copy):
        """Verify creating in nonexistent set raises proper error."""
        handler = IndicatorHandler(temp_catalog_copy)

        with pytest.raises(IndicatorSetNotFoundError):
            handler.create_indicator(
                set_id="nonexistent",
                indicator_id="test",
                file="test.svg",
                description="Test",
            )

    def test_create_duplicate_indicator_raises_error(self, temp_catalog_copy):
        """Verify creating duplicate indicator raises proper error."""
        handler = IndicatorHandler(temp_catalog_copy)

        handler.create_indicator(
            set_id="status",
            indicator_id="duplicate",
            file="status_dup.svg",
            description="First",
        )

        with pytest.raises(IndicatorAlreadyExistsError):
            handler.create_indicator(
                set_id="status",
                indicator_id="duplicate",
                file="status_dup2.svg",
                description="Second",
            )


class TestIndicatorHandlerUpdate:
    """Tests for update operations."""

    def test_update_indicator(self, temp_catalog_copy):
        """Verify we can update an indicator."""
        handler = IndicatorHandler(temp_catalog_copy)

        indicator = handler.update_indicator(
            set_id="status",
            indicator_id="empty",
            description="Updated description",
        )

        assert indicator["description"] == "Updated description"

    def test_update_multiple_fields(self, temp_catalog_copy):
        """Verify we can update multiple fields."""
        handler = IndicatorHandler(temp_catalog_copy)

        indicator = handler.update_indicator(
            set_id="status",
            indicator_id="empty",
            file="status_empty_v2.svg",
            description="Updated",
            url="https://example.com/updated",
        )

        assert indicator["file"] == "status_empty_v2.svg"
        assert indicator["description"] == "Updated"
        assert indicator["url"] == "https://example.com/updated"

    def test_update_nonexistent_indicator_raises_error(self, temp_catalog_copy):
        """Verify updating nonexistent indicator raises error."""
        handler = IndicatorHandler(temp_catalog_copy)

        with pytest.raises(IndicatorNotFoundError):
            handler.update_indicator(
                set_id="status",
                indicator_id="nonexistent",
                description="New",
            )

    def test_update_in_nonexistent_set_raises_error(self, temp_catalog_copy):
        """Verify updating in nonexistent set raises error."""
        handler = IndicatorHandler(temp_catalog_copy)

        with pytest.raises(IndicatorSetNotFoundError):
            handler.update_indicator(
                set_id="nonexistent",
                indicator_id="empty",
                description="New",
            )


class TestIndicatorHandlerDelete:
    """Tests for delete operations."""

    def test_delete_indicator(self, temp_catalog_copy):
        """Verify we can delete an indicator."""
        handler = IndicatorHandler(temp_catalog_copy)

        # Verify it exists
        handler.get_indicator("status", "empty")

        # Delete it
        handler.delete_indicator("status", "empty")

        # Verify it's gone
        with pytest.raises(IndicatorNotFoundError):
            handler.get_indicator("status", "empty")

    def test_delete_nonexistent_indicator_raises_error(self, temp_catalog_copy):
        """Verify deleting nonexistent indicator raises error."""
        handler = IndicatorHandler(temp_catalog_copy)

        with pytest.raises(IndicatorNotFoundError):
            handler.delete_indicator("status", "nonexistent")

    def test_delete_from_nonexistent_set_raises_error(self, temp_catalog_copy):
        """Verify deleting from nonexistent set raises error."""
        handler = IndicatorHandler(temp_catalog_copy)

        with pytest.raises(IndicatorSetNotFoundError):
            handler.delete_indicator("nonexistent", "empty")


class TestIndicatorHandlerTheme:
    """Tests for theme operations."""

    def test_get_existing_theme(self, indicator_catalog_path):
        """Verify we can get theme for indicator."""
        handler = IndicatorHandler(indicator_catalog_path)

        theme = handler.get_indicator_theme("status", "empty")
        assert theme is not None
        assert "indicator_color" in theme

    def test_get_theme_from_nonexistent_set_raises_error(self, indicator_catalog_path):
        """Verify getting theme from nonexistent set raises error."""
        handler = IndicatorHandler(indicator_catalog_path)

        with pytest.raises(IndicatorSetNotFoundError):
            handler.get_indicator_theme("nonexistent", "empty")

    def test_set_theme(self, temp_catalog_copy):
        """Verify we can set theme for indicator."""
        handler = IndicatorHandler(temp_catalog_copy)

        theme_data = {"indicator_color": "#FF0000", "text_color": "#FF0000"}
        handler.set_indicator_theme("status", "custom_theme", theme_data)

        theme = handler.get_indicator_theme("status", "custom_theme")
        assert theme == theme_data

    def test_set_theme_in_nonexistent_set_raises_error(self, temp_catalog_copy):
        """Verify setting theme in nonexistent set raises error."""
        handler = IndicatorHandler(temp_catalog_copy)

        with pytest.raises(IndicatorSetNotFoundError):
            handler.set_indicator_theme(
                "nonexistent",
                "test",
                {"indicator_color": "#FF0000"},
            )


class TestIndicatorHandlerPersistence:
    """Tests for save/load operations."""

    def test_save_persists_changes(self, temp_catalog_copy):
        """Verify save persists changes to file."""
        handler = IndicatorHandler(temp_catalog_copy)

        handler.create_indicator(
            set_id="status",
            indicator_id="persisted",
            file="status_persisted.svg",
            description="Should persist",
        )
        handler.save()

        # Verify in new handler instance
        handler2 = IndicatorHandler(temp_catalog_copy)
        indicator = handler2.get_indicator("status", "persisted")
        assert indicator is not None
        assert indicator["description"] == "Should persist"

    def test_reload_discards_unsaved_changes(self, temp_catalog_copy):
        """Verify reload discards unsaved changes."""
        handler = IndicatorHandler(temp_catalog_copy)

        # Create but don't save
        handler.create_indicator(
            set_id="status",
            indicator_id="unsaved",
            file="status_unsaved.svg",
            description="Unsaved",
        )

        handler.reload()

        # Should be gone after reload
        with pytest.raises(IndicatorNotFoundError):
            handler.get_indicator("status", "unsaved")


class TestIndicatorHandlerSerialization:
    """Tests for data serialization."""

    def test_indicator_serialization(self, indicator_catalog_path):
        """Verify indicator data is properly serialized."""
        handler = IndicatorHandler(indicator_catalog_path)
        indicator = handler.get_indicator("status", "empty")

        # Should have proper dict structure
        assert isinstance(indicator, dict)
        assert "id" in indicator
        assert "file" in indicator
        assert "description" in indicator

    def test_set_serialization(self, indicator_catalog_path):
        """Verify set data is properly serialized."""
        handler = IndicatorHandler(indicator_catalog_path)
        set_data = handler.get_set("status")

        # Should have proper dict structure
        assert isinstance(set_data, dict)
        assert "id" in set_data
        assert "description" in set_data
        assert "indicators" in set_data
        assert isinstance(set_data["indicators"], list)

    def test_all_sets_serialization(self, indicator_catalog_path):
        """Verify all sets data is properly serialized."""
        handler = IndicatorHandler(indicator_catalog_path)
        all_sets = handler.get_all_sets()

        assert isinstance(all_sets, dict)
        for set_id, set_data in all_sets.items():
            assert "id" in set_data
            assert "indicators" in set_data
            assert isinstance(set_data["indicators"], list)


class TestIndicatorHandlerWorkflow:
    """Tests for complete workflows."""

    def test_complete_crud_workflow(self, temp_catalog_copy):
        """Test complete CRUD workflow at handler level."""
        handler = IndicatorHandler(temp_catalog_copy)

        # CREATE
        created = handler.create_indicator(
            set_id="status",
            indicator_id="workflow_test",
            file="status_workflow.svg",
            description="Test indicator",
            url="https://example.com/test",
        )
        assert created["id"] == "workflow_test"

        # READ
        retrieved = handler.get_indicator("status", "workflow_test")
        assert retrieved["description"] == "Test indicator"

        # UPDATE
        updated = handler.update_indicator(
            set_id="status",
            indicator_id="workflow_test",
            description="Updated test indicator",
        )
        assert updated["description"] == "Updated test indicator"

        # PERSIST AND RELOAD
        handler.save()
        handler.reload()

        # VERIFY PERSISTED
        retrieved_again = handler.get_indicator("status", "workflow_test")
        assert retrieved_again["description"] == "Updated test indicator"

        # DELETE
        handler.delete_indicator("status", "workflow_test")
        handler.save()

        # VERIFY DELETED
        with pytest.raises(IndicatorNotFoundError):
            handler.get_indicator("status", "workflow_test")

    def test_batch_operations(self, temp_catalog_copy):
        """Test multiple operations in sequence."""
        handler = IndicatorHandler(temp_catalog_copy)

        # Create multiple
        for i in range(3):
            handler.create_indicator(
                set_id="status",
                indicator_id=f"batch_{i}",
                file=f"status_batch_{i}.svg",
                description=f"Batch indicator {i}",
            )

        # Update one
        handler.update_indicator(
            set_id="status",
            indicator_id="batch_1",
            description="Updated batch 1",
        )

        # Save
        handler.save()

        # Reload and verify
        handler.reload()

        assert handler.get_indicator("status", "batch_0") is not None
        assert handler.get_indicator("status", "batch_1")["description"] == "Updated batch 1"
        assert handler.get_indicator("status", "batch_2") is not None

        # Delete one
        handler.delete_indicator("status", "batch_1")
        handler.save()

        with pytest.raises(IndicatorNotFoundError):
            handler.get_indicator("status", "batch_1")
