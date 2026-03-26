import pytest
import os
import sys
from datetime import date

# Ensure backend is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../')))

# Resolve workspace data/templates so tests are independent of user settings.
_WORKSPACE_TEMPLATES_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), '..', 'data', 'templates')
)


@pytest.fixture(autouse=True, scope="session")
def _override_templates_dir():
    """Force template resolution to workspace data/templates/ regardless of user settings.

    The user may have a custom_blueprint_templates_dir configured (e.g. pointing
    to data/examples/).  Tests must always use the canonical data/templates/
    directory so they find restomod.yaml, project_talus.yaml, etc.

    This sets the TALUS_BLUEPRINT_TEMPLATES_DIR env-var (highest precedence in
    _get_workspace_templates_dir) **and** clears the in-memory settings cache so
    any already-cached custom path is discarded.
    """
    import backend.infra.settings as settings_mod

    old_env = os.environ.get('TALUS_BLUEPRINT_TEMPLATES_DIR')
    os.environ['TALUS_BLUEPRINT_TEMPLATES_DIR'] = _WORKSPACE_TEMPLATES_DIR
    # Replace the in-memory settings cache with defaults so get_setting()
    # returns None for custom_blueprint_templates_dir instead of the user's
    # configured data/examples/ path.  The env var then takes effect in
    # _get_workspace_templates_dir().
    old_cache = settings_mod._cache
    settings_mod._cache = dict(settings_mod._DEFAULT_SETTINGS)

    yield

    # Restore original state
    if old_env is None:
        os.environ.pop('TALUS_BLUEPRINT_TEMPLATES_DIR', None)
    else:
        os.environ['TALUS_BLUEPRINT_TEMPLATES_DIR'] = old_env
    settings_mod._cache = old_cache

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