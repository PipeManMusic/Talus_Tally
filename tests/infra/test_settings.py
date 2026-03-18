from backend.core.export_engine import get_export_templates_directory
from backend.infra.markup import get_markups_directory
from backend.infra.settings import (
    CUSTOM_BLUEPRINT_TEMPLATES_DIR_KEY,
    CUSTOM_EXPORT_TEMPLATES_DIR_KEY,
    CUSTOM_MARKUP_TEMPLATES_DIR_KEY,
    LEGACY_CUSTOM_TEMPLATES_DIR_KEY,
    load_settings,
    save_settings,
)
from backend.infra.template_persistence import get_templates_directory
from backend.infra.user_data_dir import get_user_templates_dir


def test_load_settings_migrates_legacy_template_directory(tmp_path, monkeypatch):
    settings_path = tmp_path / "settings.json"
    settings_path.write_text('{"custom_templates_dir": "/tmp/shared-blueprints"}')

    monkeypatch.setattr("backend.infra.settings._settings_path", lambda: settings_path)
    monkeypatch.setattr("backend.infra.settings._cache", None)

    settings = load_settings()

    assert settings[CUSTOM_BLUEPRINT_TEMPLATES_DIR_KEY] == "/tmp/shared-blueprints"
    assert settings[CUSTOM_EXPORT_TEMPLATES_DIR_KEY] == "/tmp/shared-blueprints"
    assert settings[CUSTOM_MARKUP_TEMPLATES_DIR_KEY] == "/tmp/shared-blueprints"
    assert LEGACY_CUSTOM_TEMPLATES_DIR_KEY not in settings


def test_save_settings_persists_only_normalized_directory_keys(tmp_path, monkeypatch):
    settings_path = tmp_path / "settings.json"

    monkeypatch.setattr("backend.infra.settings._settings_path", lambda: settings_path)
    monkeypatch.setattr("backend.infra.settings._cache", None)

    save_settings({
        LEGACY_CUSTOM_TEMPLATES_DIR_KEY: "/tmp/legacy",
        CUSTOM_EXPORT_TEMPLATES_DIR_KEY: "/tmp/exports",
        CUSTOM_MARKUP_TEMPLATES_DIR_KEY: "",
    })

    saved = settings_path.read_text()
    assert LEGACY_CUSTOM_TEMPLATES_DIR_KEY not in saved
    assert 'custom_blueprint_templates_dir' in saved
    assert 'custom_export_templates_dir' in saved


def test_directory_helpers_use_custom_directories_when_present(tmp_path, monkeypatch):
    blueprints_dir = tmp_path / "blueprints"
    exports_dir = tmp_path / "exports"
    markups_dir = tmp_path / "markups"
    blueprints_dir.mkdir()
    exports_dir.mkdir()
    markups_dir.mkdir()

    def fake_get_setting(key, default=None):
        values = {
            CUSTOM_BLUEPRINT_TEMPLATES_DIR_KEY: str(blueprints_dir),
            CUSTOM_EXPORT_TEMPLATES_DIR_KEY: str(exports_dir),
            CUSTOM_MARKUP_TEMPLATES_DIR_KEY: str(markups_dir),
        }
        return values.get(key, default)

    monkeypatch.setattr("backend.infra.settings.get_setting", fake_get_setting)

    assert get_templates_directory() == str(blueprints_dir)
    assert get_export_templates_directory() == exports_dir
    assert get_markups_directory() == markups_dir


def test_templates_directory_uses_workspace_fallback_when_no_custom_setting(tmp_path, monkeypatch):
    workspace_templates = tmp_path / "data" / "templates"
    workspace_templates.mkdir(parents=True)

    monkeypatch.setattr("backend.infra.settings.get_setting", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        "backend.infra.template_persistence._get_workspace_templates_dir",
        lambda: str(workspace_templates),
    )

    assert get_templates_directory() == str(workspace_templates)


def test_templates_directory_falls_back_to_user_dir_when_no_custom_or_workspace(monkeypatch):
    monkeypatch.setattr("backend.infra.settings.get_setting", lambda *_args, **_kwargs: None)
    monkeypatch.setattr("backend.infra.template_persistence._get_workspace_templates_dir", lambda: None)

    assert get_templates_directory() == str(get_user_templates_dir())