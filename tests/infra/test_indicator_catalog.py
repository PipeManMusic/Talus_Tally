import pytest
import os
from backend.infra.schema_loader import IndicatorCatalog


@pytest.fixture
def indicator_catalog_path():
    """Path to the indicator catalog YAML."""
    return os.path.abspath("assets/indicators/catalog.yaml")


def test_load_indicator_catalog(indicator_catalog_path):
    """Verify we can load the indicator catalog."""
    catalog = IndicatorCatalog.load(indicator_catalog_path)
    
    assert catalog is not None
    assert "status" in catalog.indicator_sets
    
    status_set = catalog.indicator_sets["status"]
    assert status_set is not None
    assert len(status_set["indicators"]) == 4


def test_get_indicator_svg_path(indicator_catalog_path):
    """Verify we can get SVG file paths for indicators."""
    catalog = IndicatorCatalog.load(indicator_catalog_path)
    
    # Get path for "empty" indicator in "status" set
    svg_path = catalog.get_indicator_file("status", "empty")
    assert svg_path is not None
    assert "status_empty.svg" in svg_path
    assert os.path.exists(svg_path), f"SVG file not found: {svg_path}"


def test_get_theme_for_indicator(indicator_catalog_path):
    """Verify we can get theme (color, styling) for indicators."""
    catalog = IndicatorCatalog.load(indicator_catalog_path)
    
    # Get theme for "partial" indicator
    theme = catalog.get_indicator_theme("status", "partial")
    assert theme is not None
    assert theme["indicator_color"] == "#4A90E2"
    assert theme["text_color"] == "#4A90E2"
    assert theme["text_style"] == "bold"


def test_theme_with_override(indicator_catalog_path):
    """Verify theme with option-level overrides."""
    catalog = IndicatorCatalog.load(indicator_catalog_path)
    
    # Get base theme
    base_theme = catalog.get_indicator_theme("status", "alert")
    assert base_theme["text_color"] == "#F5A623"
    
    # Simulate option-level override
    override = {"text_color": "#FF0000"}
    merged = {**base_theme, **override}
    assert merged["text_color"] == "#FF0000"
    assert merged["indicator_color"] == "#F5A623"  # Not overridden
