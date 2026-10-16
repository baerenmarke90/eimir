"""Upgrade coverage for the temporary ``SBS_*`` configuration aliases."""

from eimir.config import DatabaseSettings, Deployment, Environment, Settings


def test_legacy_environment_aliases_are_accepted(monkeypatch) -> None:
    monkeypatch.delenv("EIMIR_DATABASE_URL", raising=False)
    monkeypatch.delenv("EIMIR_ENVIRONMENT", raising=False)
    monkeypatch.delenv("EIMIR_DEPLOYMENT", raising=False)
    monkeypatch.setenv(
        "SBS_DATABASE_URL",
        "postgresql+psycopg://legacy:secret@postgres:5432/sidebyside",
    )
    monkeypatch.setenv("SBS_ENVIRONMENT", "test")
    monkeypatch.setenv("SBS_DEPLOYMENT", "cloud")

    settings = Settings()

    assert settings.database_url.endswith("/sidebyside")
    assert settings.environment is Environment.TEST
    assert settings.deployment is Deployment.CLOUD
    assert DatabaseSettings().database_url.endswith("/sidebyside")


def test_canonical_environment_wins_over_legacy_alias(monkeypatch) -> None:
    monkeypatch.setenv(
        "SBS_DATABASE_URL",
        "postgresql+psycopg://legacy:secret@postgres:5432/sidebyside",
    )
    monkeypatch.setenv(
        "EIMIR_DATABASE_URL",
        "postgresql+psycopg://canonical:secret@postgres:5432/eimir",
    )

    assert DatabaseSettings().database_url.endswith("/eimir")
