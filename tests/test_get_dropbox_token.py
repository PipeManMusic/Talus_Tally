import builtins
import io
from types import SimpleNamespace

import get_dropbox_token


def test_get_refresh_token_reuses_existing_credentials(monkeypatch):
    secrets_text = """# Dropbox Credentials
# DO NOT COMMIT THIS FILE TO VERSION CONTROL

DROPBOX_APP_KEY = "existing_key"
DROPBOX_APP_SECRET = "existing_secret"
DROPBOX_REFRESH_TOKEN = "old_token"
"""

    monkeypatch.setattr(get_dropbox_token.os.path, "exists", lambda path: True)

    written = {}

    def fake_open(path, mode="r", *args, **kwargs):
        assert path == "frontend/mobile/secrets.py"
        if "r" in mode:
            return io.StringIO(secrets_text)
        if "w" in mode:
            class WriteBuffer(io.StringIO):
                def close(self_buffer):
                    written["content"] = self_buffer.getvalue()
                    super().close()

            return WriteBuffer()
        raise ValueError(f"Unexpected mode {mode}")

    monkeypatch.setattr(builtins, "open", fake_open)

    inputs = iter(["", "sample_auth_code"])
    monkeypatch.setattr(builtins, "input", lambda prompt="": next(inputs))

    flow_state = {}

    class DummyFlow:
        def __init__(self, app_key, app_secret, token_access_type, scope):
            flow_state["app_key"] = app_key
            flow_state["app_secret"] = app_secret
            flow_state["token_access_type"] = token_access_type
            flow_state["scope"] = scope

        def start(self):
            flow_state["start_called"] = True
            return "http://example.com/authorize"

        def finish(self, code):
            flow_state["finish_code"] = code
            return SimpleNamespace(refresh_token="new_token")

    monkeypatch.setattr(get_dropbox_token, "DropboxOAuth2FlowNoRedirect", DummyFlow)

    get_dropbox_token.get_refresh_token()

    assert flow_state == {
        "app_key": "existing_key",
        "app_secret": "existing_secret",
        "token_access_type": "offline",
        "scope": [
            "files.metadata.read",
            "files.content.read",
            "files.content.write",
        ],
        "start_called": True,
        "finish_code": "sample_auth_code",
    }
    assert "DROPBOX_REFRESH_TOKEN = \"new_token\"" in written["content"]
