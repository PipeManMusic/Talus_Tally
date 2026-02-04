import os

import pytest

from backend.infra.icon_catalog import IconCatalog


@pytest.fixture
def icon_catalog_path():
    return os.path.abspath(os.path.join(os.getcwd(), 'assets', 'icons', 'catalog.yaml'))


def test_load_icon_catalog(icon_catalog_path):
    catalog = IconCatalog.load(icon_catalog_path)
    assert catalog.get_icon_entry('film') is not None
    assert catalog.get_icon_entry('film')['file'] == 'film.svg'


def test_icon_file_path(icon_catalog_path):
    catalog = IconCatalog.load(icon_catalog_path)
    icon_path = catalog.get_icon_file('calendar-days')
    assert icon_path.endswith('calendar-days.svg')
    assert os.path.isfile(icon_path)


def test_icon_catalog_handles_svg_suffix(icon_catalog_path):
    catalog = IconCatalog.load(icon_catalog_path)
    assert catalog.get_icon_entry('camera.svg') is not None
    assert catalog.get_icon_file('camera.svg').endswith('camera.svg')
