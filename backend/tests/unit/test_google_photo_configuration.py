"""Account-independent operator handover and secret-free setup diagnostics."""

import json
from dataclasses import replace
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit

import pytest
from pydantic import SecretStr, ValidationError

from eimir.config import Settings
from eimir.photo_sources import google_setup
from eimir.providers import google_photos as google
from eimir.providers import google_photos_config as configuration
from eimir.providers.photo_transport import PhotoSourceError
from eimir.security.keyring import EncryptionMode


@pytest.fixture
def settings():
    return SimpleNamespace(
        encryption_mode=EncryptionMode.REQUIRED,
        public_base_url="https://couple.example",
        google_photos_web_client_file="",
        google_photos_client_id="new-project.apps.googleusercontent.com",
        google_photos_client_secret=SecretStr("synthetic-new-project-secret"),
        google_photos_test_account_emails=["tester@eimir.example"],
    )


def web_client(settings):
    return {
        "web": {
            "client_id": settings.google_photos_client_id,
            "project_id": "operator-project",
            "client_secret": settings.google_photos_client_secret.get_secret_value(),
            "auth_uri": configuration.AUTH_URI,
            "token_uri": configuration.TOKEN_URI,
            "redirect_uris": [settings.public_base_url + configuration.CALLBACK_PATH],
        }
    }


def mounted(settings, tmp_path, document=None):
    path = tmp_path / "operator-private.json"
    path.write_text(json.dumps(document if document is not None else web_client(settings)))
    settings.google_photos_web_client_file = str(path)
    settings.google_photos_client_id = ""
    settings.google_photos_client_secret = None
    return path


def test_downloaded_web_client_and_environment_pair_have_the_same_transaction_identity(
    settings, tmp_path
):
    previous = configuration.client_configuration(settings)
    mounted(settings, tmp_path)
    loaded = configuration.client_configuration(settings)
    assert previous == loaded
    assert previous.binding == loaded.binding
    assert "synthetic-new-project-secret" not in repr(loaded)
    assert "new-project.apps" not in repr(loaded)


@pytest.mark.parametrize("project", ["new-project", "other-project"])
def test_sdk_authorization_is_account_independent_and_uses_only_the_picker_scope(settings, project):
    settings.google_photos_client_id = project + ".apps.googleusercontent.com"
    client = configuration.client_configuration(settings)
    url, state, verifier = google.authorization(client=client)
    parsed = urlsplit(url)
    params = parse_qs(parsed.query)
    assert parsed.scheme == "https" and parsed.hostname == "accounts.google.com"
    assert params["client_id"] == [client.client_id]
    assert params["redirect_uri"] == [client.redirect_uri]
    assert params["scope"] == [configuration.SCOPE]
    assert params["access_type"] == ["online"]
    assert params["prompt"] == ["select_account"]
    assert params["code_challenge_method"] == ["S256"]
    assert params["state"] == [state]
    assert len(verifier) >= 43
    assert "login_hint" not in params and "hd" not in params
    assert "client_secret" not in params and "code_verifier" not in params


@pytest.mark.parametrize("field", ["client_id", "client_secret", "redirect_uri"])
def test_changing_any_client_boundary_invalidates_the_transaction_binding(settings, field):
    first = configuration.client_configuration(settings)
    value = SecretStr("synthetic-rotated-secret") if field == "client_secret" else "replacement"
    second = replace(first, **{field: value})
    assert first.binding != second.binding


@pytest.mark.parametrize(
    "origin",
    [
        "http://couple.example",
        "https://user:secret@couple.example",
        "https://couple.example/app",
        "https://couple.example?code=private",
        "https://couple.example#token",
        "https://couple.example\\evil",
        "https://couple.example\n",
        "https://couple.example:bad",
        "https://couple.example:65536",
    ],
)
def test_callback_is_exact_operator_https_not_request_or_credentials(origin):
    with pytest.raises(PhotoSourceError, match=r"^PHOTO_SOURCE_CONFIGURATION_INVALID$"):
        configuration.callback_uri(origin)


@pytest.mark.parametrize(
    "damage",
    [
        "desktop",
        "service-account",
        "missing-callback",
        "foreign-auth",
        "foreign-token",
        "bad-id",
        "bad-secret",
        "duplicate",
        "oversized",
        "not-json",
        "missing",
        "directory",
    ],
)
def test_private_web_client_files_fail_closed_without_echoing_file_or_secret(
    settings, tmp_path, damage
):
    document = web_client(settings)
    if damage == "desktop":
        document = {"installed": document["web"]}
    elif damage == "service-account":
        document = {"type": "service_account", "private_key": "private-material"}
    elif damage == "missing-callback":
        document["web"]["redirect_uris"] = ["https://old.example/oauth/callback"]
    elif damage == "foreign-auth":
        document["web"]["auth_uri"] = "https://untrusted.example/auth"
    elif damage == "foreign-token":
        document["web"]["token_uri"] = "https://untrusted.example/token"
    elif damage == "bad-id":
        document["web"]["client_id"] = "private@example.test"
    elif damage == "bad-secret":
        document["web"]["client_secret"] = "secret\nmaterial"
    path = mounted(settings, tmp_path, document)
    if damage == "duplicate":
        path.write_text('{"web":{},"web":{}}')
    elif damage == "oversized":
        path.write_text("private-material" * 3000)
    elif damage == "not-json":
        path.write_text("private-material")
    elif damage == "missing":
        path.unlink()
    elif damage == "directory":
        path.unlink()
        path.mkdir()
    with pytest.raises(PhotoSourceError) as error:
        configuration.client_configuration(settings)
    assert str(error.value) == "PHOTO_SOURCE_CONFIGURATION_INVALID"
    assert "private" not in str(error.value) and "secret" not in str(error.value)


def test_credential_sources_cannot_be_combined(settings, tmp_path):
    mounted(settings, tmp_path)
    settings.google_photos_client_id = "old-project.apps.googleusercontent.com"
    with pytest.raises(PhotoSourceError):
        configuration.client_configuration(settings)


def test_settings_validate_file_mode_without_reading_or_requiring_a_file(encryption):
    encryption.apply("required")
    loaded = Settings(
        _env_file=None,
        public_base_url="https://couple.example",
        google_photos_client_secret="",
        google_photos_web_client_file="/run/secrets/not-mounted-during-validation.json",
    )
    assert loaded.google_photos_client_secret is None
    with pytest.raises(ValidationError, match="one Google Photos"):
        Settings(
            _env_file=None,
            public_base_url="https://couple.example",
            google_photos_client_id="synthetic.apps.googleusercontent.com",
            google_photos_client_secret="synthetic-secret",
            google_photos_web_client_file="/run/secrets/private.json",
        )


def test_setup_manifest_can_be_prepared_before_google_credentials_exist(monkeypatch, capsys):
    def no_configuration():
        pytest.fail(
            "Preparing Console values must not read credentials or unrelated runtime settings."
        )

    monkeypatch.setattr(google_setup, "get_settings", no_configuration)
    assert google_setup.main(["--public-base-url", "https://couple.example"]) == 0
    result = json.loads(capsys.readouterr().out)
    assert result["authorizedRedirectUri"] == "https://couple.example" + configuration.CALLBACK_PATH
    assert result["scope"] == configuration.SCOPE
    assert result["capability"] == "integration.external_sync"
    assert result["configurationStatus"] == "NOT_CHECKED"
    assert result["applicationImportAvailable"] is False


def test_valid_setup_does_not_claim_the_application_is_enabled(settings, monkeypatch, capsys):
    monkeypatch.setattr(google_setup, "get_settings", lambda: settings)
    assert google_setup.main(["--check-config"]) == 0
    output = capsys.readouterr().out
    result = json.loads(output)
    assert result["configurationStatus"] == "VALID"
    assert result["applicationImportAvailable"] is False
    assert settings.google_photos_client_id not in output
    assert settings.google_photos_client_secret.get_secret_value() not in output
    # Only a count is reported, never the listed addresses.
    assert result["testEligibleAccountCount"] == 1
    assert "tester@eimir.example" not in output


def test_setup_errors_never_echo_validation_input(monkeypatch, capsys):
    def invalid_configuration():
        raise ValueError("private-secret-from-configuration")

    monkeypatch.setattr(google_setup, "get_settings", invalid_configuration)
    assert google_setup.main(["--check-config"]) == 2
    output = capsys.readouterr().out
    assert json.loads(output)["configurationStatus"] == "INVALID"
    assert "private-secret" not in output


def test_login_hint_only_preselects_the_account_and_replaces_the_chooser(settings):
    client = configuration.client_configuration(settings)
    plain = parse_qs(urlsplit(google.authorization(client=client)[0]).query)
    assert plain["prompt"] == ["select_account"]
    assert "login_hint" not in plain
    hinted = parse_qs(
        urlsplit(google.authorization(client=client, login_hint="anna+x@gmail.example")[0]).query
    )
    assert hinted["login_hint"] == ["anna+x@gmail.example"]
    # The chooser would defeat the hint; nothing else about the request changes.
    assert "prompt" not in hinted
    assert hinted["scope"] == plain["scope"] == [configuration.SCOPE]
    assert hinted["access_type"] == plain["access_type"] == ["online"]
    assert hinted["redirect_uri"] == plain["redirect_uri"] == [client.redirect_uri]
    assert hinted["code_challenge_method"] == plain["code_challenge_method"]
