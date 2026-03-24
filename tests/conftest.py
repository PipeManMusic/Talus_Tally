import pytest
import os
import sys
from datetime import date

# Ensure backend is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../')))

@pytest.fixture
def fixed_today():
    """Provide a fixed date for year-2024 tests.
    
    Tests that verify date-range calculations should use this fixture to avoid
    failures when the current system date is far from the test date ranges.
    
    Using 2024-02-10 (Saturday, within the test date ranges that include Feb 9-11
    and Jan 1-3, Feb 10-12, Feb 9-11) ensures "include today" logic stays within
    expected date ranges.
    """
    return date(2024, 2, 10)

@pytest.fixture
def fixture_today():
    """Provide a fixed date for fixture-based tests (tests using _load_fixture()).
    
    The fixture data uses 2026 dates, so this returns a date within that range.
    Using 2026-01-12 ensures the "include today" logic in calculate_manpower_load
    doesn't expand date ranges beyond the fixture's intended scope.
    """
    return date(2026, 1, 12)

@pytest.fixture
def sample_blueprint_path():
    return os.path.abspath("/home/dworth/Dropbox/Bronco II/Talus Tally/data/templates/restomod.yaml")

@pytest.fixture
def meta_schema_path():
    return os.path.abspath("data/definitions/meta_schema.yaml")