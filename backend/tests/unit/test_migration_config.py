"""Migration-path configuration.

A migration needs the database and nothing else. These tests preserve that
separation because it can silently regress: a single `get_settings()` call in
`alembic/env.py` would make `alembic upgrade head` depend on SMTP and cursor-key
validation again.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from eimir.config import DEFAULT_DATABASE_URL, DatabaseSettings, Settings


def test_migration_does_not_require_production_runtime_values(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The #110 case: production without a cursor key, mail, or HTTPS URL."""
    monkeypatch.setenv("EIMIR_ENVIRONMENT", "production")
    monkeypatch.setenv("EIMIR_DEPLOYMENT", "self_hosted")
    monkeypatch.setenv("EIMIR_DATABASE_URL", "postgresql+psycopg://u:p@postgres:5432/eimir")
    monkeypatch.delenv("EIMIR_CURSOR_SIGNING_KEY", raising=False)

    # The application correctly refuses startup in this state.
    with pytest.raises(ValidationError, match="EIMIR_CURSOR_SIGNING_KEY"):
        Settings()

    # The migration does not; it reads only the database connection.
    assert DatabaseSettings().database_url == "postgresql+psycopg://u:p@postgres:5432/eimir"


@pytest.mark.parametrize("empty", ["", "   "])
def test_empty_database_url_is_error_in_both_paths(
    monkeypatch: pytest.MonkeyPatch, empty: str
) -> None:
    """Runtime and migration share the same rule for empty interpolation."""
    monkeypatch.setenv("EIMIR_DATABASE_URL", empty)

    with pytest.raises(ValidationError, match="EIMIR_DATABASE_URL"):
        DatabaseSettings()
    with pytest.raises(ValidationError, match="EIMIR_DATABASE_URL"):
        Settings()


def test_default_remains_equal_to_application_default(monkeypatch: pytest.MonkeyPatch) -> None:
    """Two configurations, one development database.

    If the defaults diverged, a local run could migrate a different database
    from the one the application starts against.
    """
    monkeypatch.delenv("EIMIR_DATABASE_URL", raising=False)

    assert DatabaseSettings().database_url == DEFAULT_DATABASE_URL
    assert Settings().database_url == DEFAULT_DATABASE_URL
