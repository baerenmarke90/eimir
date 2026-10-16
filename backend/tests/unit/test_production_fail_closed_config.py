"""Boot-time fail-closed coverage for production/Cloud configuration.

compose.yaml (#746) deliberately defaults EIMIR_DATABASE_URL, EIMIR_ALLOWED_HOSTS,
EIMIR_PUBLIC_BASE_URL, and EIMIR_CURSOR_SIGNING_KEY to blank/empty for every
profile, including ``cloud``, rather than a Compose-level ``${VAR:?...}``: a
hard interpolation failure there would break every profile's ability to
render independently, since Compose interpolates the whole file regardless of
which ``--profile`` is active. The fail-closed guarantee for these values
therefore lives here, in ``Settings`` validation, instead. These tests prove
that an operator who leaves one of them unset in a real ``cloud`` deployment
(which is exactly what compose.yaml then passes to the container: an empty
string, or an empty list) still cannot boot the application.
"""

import pytest
from pydantic import SecretStr, ValidationError

from eimir.config import DatabaseSettings, Deployment, Environment, MailTransport, Settings
from eimir.security.keyring import EncryptionMode
from tests.support.encryption import encoded_key


def _cloud_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "environment": Environment.PRODUCTION,
        "deployment": Deployment.CLOUD,
        "database_url": "postgresql+psycopg://user:pass@db.private:5432/eimir",
        "cursor_signing_key": SecretStr("x" * 48),
        "allowed_hosts": ["cloud.example.test"],
        "public_base_url": "https://cloud.example.test",
        "mail_transport": MailTransport.NONE,
        "encryption_at_rest": EncryptionMode.REQUIRED,
        "encryption_keys": {"cloud-2026-09": SecretStr(encoded_key())},
        "encryption_active_key_id": "cloud-2026-09",
    }
    values.update(overrides)
    return Settings.model_validate(values)


def test_cloud_settings_are_otherwise_valid() -> None:
    settings = _cloud_settings()
    assert settings.is_production is True


def test_empty_database_url_is_rejected() -> None:
    # What compose.yaml's `${EIMIR_DATABASE_URL:-}` actually sets when unset.
    with pytest.raises(ValidationError, match="EIMIR_DATABASE_URL is empty"):
        _cloud_settings(database_url="")


def test_database_settings_also_rejects_an_empty_url() -> None:
    with pytest.raises(ValidationError, match="EIMIR_DATABASE_URL is empty"):
        DatabaseSettings.model_validate({"database_url": ""})


def test_production_rejects_an_empty_allowed_hosts_list() -> None:
    # What compose.yaml's cloud profile sets by default: `${EIMIR_ALLOWED_HOSTS:-[]}`.
    with pytest.raises(ValidationError, match="explicit EIMIR_ALLOWED_HOSTS"):
        _cloud_settings(allowed_hosts=[])


def test_production_rejects_a_wildcard_allowed_host() -> None:
    with pytest.raises(ValidationError, match="explicit EIMIR_ALLOWED_HOSTS"):
        _cloud_settings(allowed_hosts=["*"])


def test_production_requires_a_cursor_signing_key() -> None:
    with pytest.raises(ValidationError, match="requires EIMIR_CURSOR_SIGNING_KEY"):
        _cloud_settings(cursor_signing_key=None)


def test_production_rejects_a_blank_public_base_url() -> None:
    # What compose.yaml's cloud profile sets by default: `${EIMIR_PUBLIC_BASE_URL:-}`.
    with pytest.raises(ValidationError, match="https EIMIR_PUBLIC_BASE_URL"):
        _cloud_settings(public_base_url="")


def test_production_rejects_a_non_https_public_base_url() -> None:
    with pytest.raises(ValidationError, match="https EIMIR_PUBLIC_BASE_URL"):
        _cloud_settings(public_base_url="http://cloud.example.test")


# --- application-controlled encryption at rest (issue #797) -----------------


def test_cloud_production_requires_an_explicit_encryption_mode() -> None:
    # What compose.yaml's cloud profile sets when the operator supplies nothing.
    with pytest.raises(ValidationError, match="explicit EIMIR_ENCRYPTION_AT_REST"):
        _cloud_settings(encryption_at_rest=None, encryption_keys={}, encryption_active_key_id=None)


@pytest.mark.parametrize("mode", [EncryptionMode.MIGRATING, EncryptionMode.DISABLED])
def test_cloud_production_cannot_run_anything_but_required(mode: EncryptionMode) -> None:
    keys = {} if mode is EncryptionMode.DISABLED else None
    overrides: dict[str, object] = {"encryption_at_rest": mode}
    if keys is not None:
        overrides.update(encryption_keys={}, encryption_active_key_id=None)
    with pytest.raises(ValidationError, match="Cloud Production requires"):
        _cloud_settings(**overrides)


def test_required_without_key_material_refuses_startup() -> None:
    with pytest.raises(ValidationError, match="requires EIMIR_ENCRYPTION_KEYS"):
        _cloud_settings(encryption_keys={})
    with pytest.raises(ValidationError, match="requires EIMIR_ENCRYPTION_KEYS"):
        _cloud_settings(encryption_active_key_id=None)


def test_active_key_must_be_present_in_the_ring() -> None:
    with pytest.raises(ValidationError, match="active encryption key id"):
        _cloud_settings(encryption_active_key_id="not-configured")


def test_malformed_or_placeholder_key_refuses_startup_without_echoing_it() -> None:
    with pytest.raises(ValidationError) as raised:
        _cloud_settings(encryption_keys={"cloud-2026-09": SecretStr("replace-with-a-real-key")})
    assert "replace-with-a-real-key" not in str(raised.value)
    with pytest.raises(ValidationError, match="placeholder"):
        _cloud_settings(encryption_keys={"cloud-2026-09": SecretStr("A" * 43 + "=")})


def test_key_material_is_never_part_of_the_settings_repr() -> None:
    key = encoded_key()
    settings = _cloud_settings(encryption_keys={"cloud-2026-09": SecretStr(key)})
    assert key not in repr(settings)
    assert key not in str(settings.model_dump())


def test_self_hosted_production_must_choose_and_may_choose_migrating_or_disabled() -> None:
    def self_hosted(**overrides: object) -> Settings:
        return _cloud_settings(deployment=Deployment.SELF_HOSTED, **overrides)

    with pytest.raises(ValidationError, match="explicit EIMIR_ENCRYPTION_AT_REST"):
        self_hosted(encryption_at_rest=None, encryption_keys={}, encryption_active_key_id=None)
    assert self_hosted().encryption_mode is EncryptionMode.REQUIRED
    assert self_hosted(encryption_at_rest=EncryptionMode.MIGRATING).encryption_mode.value == (
        "migrating"
    )
    disabled = self_hosted(
        encryption_at_rest=EncryptionMode.DISABLED,
        encryption_keys={},
        encryption_active_key_id=None,
    )
    assert disabled.encryption_mode is EncryptionMode.DISABLED


def test_keys_next_to_a_disabled_mode_are_refused_instead_of_running_plaintext() -> None:
    with pytest.raises(ValidationError, match="disabled"):
        _cloud_settings(
            deployment=Deployment.SELF_HOSTED, encryption_at_rest=EncryptionMode.DISABLED
        )


def test_keys_without_any_mode_are_refused_outside_production_too(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("EIMIR_ENCRYPTION_AT_REST", raising=False)
    monkeypatch.delenv("EIMIR_ENCRYPTION_KEYS", raising=False)
    monkeypatch.delenv("EIMIR_ENCRYPTION_ACTIVE_KEY_ID", raising=False)
    with pytest.raises(ValidationError, match="state the mode explicitly"):
        Settings.model_validate(
            {
                "environment": Environment.DEVELOPMENT,
                "encryption_keys": {"dev": SecretStr(encoded_key())},
                "encryption_active_key_id": "dev",
            }
        )


def test_development_without_any_configuration_is_plaintext_and_explicit_about_it(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("EIMIR_ENCRYPTION_AT_REST", raising=False)
    monkeypatch.delenv("EIMIR_ENCRYPTION_KEYS", raising=False)
    monkeypatch.delenv("EIMIR_ENCRYPTION_ACTIVE_KEY_ID", raising=False)
    settings = Settings.model_validate({"environment": Environment.DEVELOPMENT})
    assert settings.encryption_mode is EncryptionMode.DISABLED


def test_no_built_in_key_exists(monkeypatch: pytest.MonkeyPatch) -> None:
    """A default key in code could reach production. None may exist."""
    monkeypatch.delenv("EIMIR_ENCRYPTION_AT_REST", raising=False)
    monkeypatch.delenv("EIMIR_ENCRYPTION_KEYS", raising=False)
    monkeypatch.delenv("EIMIR_ENCRYPTION_ACTIVE_KEY_ID", raising=False)
    settings = Settings.model_validate({"environment": Environment.TEST})
    assert settings.encryption_keys == {}
    assert settings.encryption_active_key_id is None
