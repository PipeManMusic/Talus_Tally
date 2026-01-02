from pathlib import Path

from backend.dropbox_paths import (
    get_dropbox_data_path,
    get_dropbox_data_dir,
    get_dropbox_app_dir,
)


def test_env_overrides_app_dir(monkeypatch, tmp_path):
    root = tmp_path / "custom_root"
    monkeypatch.setenv("TALUS_TALLY_DATA_DIR", str(root))

    data_path = get_dropbox_data_path()

    expected = root / "data" / "talus_master.json"
    assert data_path == expected
    assert data_path.parent.exists()
    assert root.exists()


def test_default_app_dir_under_home(monkeypatch, tmp_path):
    monkeypatch.delenv("TALUS_TALLY_DATA_DIR", raising=False)
    monkeypatch.setattr("backend.dropbox_paths.Path.home", lambda: tmp_path)

    data_dir = get_dropbox_data_dir()

    expected_dir = tmp_path / ".talus_tally" / "data"
    assert data_dir == expected_dir
    assert data_dir.exists()


def test_app_dir_consistent(monkeypatch, tmp_path):
    root = tmp_path / "persistent"
    monkeypatch.setenv("TALUS_TALLY_DATA_DIR", str(root))

    first = get_dropbox_app_dir()
    second = get_dropbox_app_dir()

    assert first == second
    assert first.exists()