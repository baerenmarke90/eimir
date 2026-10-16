"""Media configuration and adapter selection."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from eimir.config import (
    Environment,
    MailTransport,
    MediaStoreBackend,
    Settings,
    get_settings,
)
from eimir.media import S3MediaStore, get_media_store


def _public_s3_settings(environment: Environment, endpoint: str) -> Settings:
    values: dict[str, object] = {
        "environment": environment,
        "demo_mode": environment is Environment.DEMO,
        "media_store": MediaStoreBackend.S3,
        "s3_endpoint": endpoint,
        "s3_region": "eu-central-1",
        "s3_bucket": "eimir-private",
        "s3_access_key_id": "AKIATEST",
        "s3_secret_access_key": "very-secret-value",
        "cursor_signing_key": "x" * 48,
        "allowed_hosts": ["app.example.test"],
        "public_base_url": "https://app.example.test",
        "mail_transport": MailTransport.NONE,
    }
    return Settings.model_validate(values)


def test_local_store_is_the_default() -> None:
    settings = Settings()
    assert settings.media_store is MediaStoreBackend.LOCAL


def test_s3_store_requires_complete_configuration() -> None:
    with pytest.raises(ValidationError, match="EIMIR_S3_ENDPOINT"):
        Settings(media_store=MediaStoreBackend.S3)


def test_s3_credentials_are_redacted_from_settings_repr() -> None:
    settings = Settings(
        media_store=MediaStoreBackend.S3,
        s3_endpoint="https://s3.example.test",
        s3_region="eu-central-1",
        s3_bucket="eimir-private",
        s3_access_key_id="AKIATEST",
        s3_secret_access_key="very-secret-value",
    )
    assert "very-secret-value" not in repr(settings)
    assert "AKIATEST" not in repr(settings)


def test_s3_endpoint_rejects_embedded_credentials() -> None:
    with pytest.raises(ValidationError, match="without credentials"):
        Settings(
            media_store="s3",
            s3_endpoint="https://user:password@s3.example.test",
            s3_region="eu-central-1",
            s3_bucket="eimir-private",
            s3_access_key_id="AKIATEST",
            s3_secret_access_key="very-secret-value",
        )


@pytest.mark.parametrize("environment", [Environment.PRODUCTION, Environment.DEMO])
def test_public_runtime_rejects_plaintext_s3_endpoint(environment: Environment) -> None:
    with pytest.raises(ValidationError, match="require an https EIMIR_S3_ENDPOINT"):
        _public_s3_settings(environment, "http://s3.example.test")


@pytest.mark.parametrize("environment", [Environment.PRODUCTION, Environment.DEMO])
def test_public_runtime_accepts_https_s3_endpoint(environment: Environment) -> None:
    settings = _public_s3_settings(environment, "https://s3.example.test")

    assert settings.media_store is MediaStoreBackend.S3
    assert settings.s3_endpoint == "https://s3.example.test"


@pytest.mark.parametrize("environment", [Environment.DEVELOPMENT, Environment.TEST])
def test_non_public_runtime_can_use_http_s3_endpoint(environment: Environment) -> None:
    settings = Settings(
        environment=environment,
        media_store=MediaStoreBackend.S3,
        s3_endpoint="http://127.0.0.1:9000",
        s3_region="eu-central-1",
        s3_bucket="eimir-local-test",
        s3_access_key_id="AKIATEST",
        s3_secret_access_key="very-secret-value",
    )

    assert settings.s3_endpoint == "http://127.0.0.1:9000"


def test_production_can_keep_local_media_store() -> None:
    settings = Settings(
        environment=Environment.PRODUCTION,
        media_store=MediaStoreBackend.LOCAL,
        cursor_signing_key="x" * 48,
        allowed_hosts=["app.example.test"],
        public_base_url="https://app.example.test",
        mail_transport=MailTransport.NONE,
    )

    assert settings.media_store is MediaStoreBackend.LOCAL


def test_factory_selects_s3_without_exposing_it_to_domain_code(
    monkeypatch,  # type: ignore[no-untyped-def]
    encryption,  # type: ignore[no-untyped-def]
) -> None:
    encryption.apply("disabled")
    monkeypatch.setenv("EIMIR_MEDIA_STORE", "s3")
    monkeypatch.setenv("EIMIR_S3_ENDPOINT", "https://s3.example.test")
    monkeypatch.setenv("EIMIR_S3_REGION", "eu-central-1")
    monkeypatch.setenv("EIMIR_S3_BUCKET", "eimir-private")
    monkeypatch.setenv("EIMIR_S3_ACCESS_KEY_ID", "AKIATEST")
    monkeypatch.setenv("EIMIR_S3_SECRET_ACCESS_KEY", "very-secret-value")
    get_settings.cache_clear()
    get_media_store.cache_clear()
    try:
        assert isinstance(get_media_store(), S3MediaStore)
    finally:
        get_media_store.cache_clear()
        get_settings.cache_clear()
