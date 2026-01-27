import pytest
import os
import sys

# Ensure backend is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../')))

@pytest.fixture
def sample_blueprint_path():
    return os.path.abspath("data/templates/restomod.yaml")

@pytest.fixture
def meta_schema_path():
    return os.path.abspath("data/definitions/meta_schema.yaml")