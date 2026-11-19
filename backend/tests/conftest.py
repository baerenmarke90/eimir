"""Shared test fixtures.

Two layers are deliberately kept separate:

- Unit tests run without a database and without network access.
- Integration tests require a reachable PostgreSQL instance. If none is
  available, they are SKIPPED rather than silently counted as passed; a green
  run must not promise more than it actually verified.
"""

from __future__ import annotations

import os
import shutil
import tempfile
from collections.abc import Iterator

import pytest
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from tests.support.encryption import EncryptionConfigurator

# Never accidentally run against a real instance.
os.environ.setdefault("EIMIR_ENVIRONMENT", "test")

# Encryption at rest has no default in production. Tests that construct
# production settings for unrelated reasons inherit an explicit "disabled" here;
# tests of the encryption behavior itself use the ``encryption`` fixture, which
# replaces this value.
os.environ.setdefault("EIMIR_ENCRYPTION_AT_REST", "disabled")

TEST_BOOTSTRAP_TOKEN = "test-bootstrap-token-with-at-least-32-characters"
os.environ.setdefault("EIMIR_BOOTSTRAP_TOKEN", TEST_BOOTSTRAP_TOKEN)

# Media files go into a temporary directory rather than the working tree. The
# configuration default is "./data/media"; without this override, a test run
# would leave files in the repository that nobody should accidentally commit.
MEDIA_ROOT = os.environ.setdefault("EIMIR_MEDIA_ROOT", tempfile.mkdtemp(prefix="eimir-test-media-"))

INTEGRATION_DATABASE_URL = os.environ.get("EIMIR_TEST_DATABASE_URL", "")


@pytest.fixture
def encryption(
    monkeypatch: pytest.MonkeyPatch, request: pytest.FixtureRequest
) -> Iterator[EncryptionConfigurator]:
    """Configure application-controlled encryption for one test.

    Restores the settings caches afterwards so no test inherits another test's
    key ring or mode.
    """
    from tests.support.encryption import reset_encryption_caches

    def carry_accounts(previous, current, first_switch: bool) -> None:  # type: ignore[no-untyped-def]
        # Accounts exist before most tests choose a mode; see EncryptionConfigurator
        # for why only the first switch may open them into plaintext.
        if "session" not in request.fixturenames:
            return
        if not first_switch and not current.mode.encrypts_writes:
            return
        import json

        from sqlalchemy import text

        from eimir.identity.models import AccountPayload

        session = request.getfixturevalue("session")
        context = AccountPayload.crypto_context()
        rows = session.execute(
            text("SELECT id, payload FROM accounts WHERE payload IS NOT NULL")
        ).all()
        for account_id, stored in rows:
            carried = current.protect(previous.reveal(stored, context=context), context=context)
            session.execute(
                text(
                    "UPDATE accounts SET payload = CAST(:payload AS jsonb), "
                    "crypto_version = :version WHERE id = :id"
                ),
                {
                    "id": account_id,
                    "payload": json.dumps(carried),
                    "version": current.write_crypto_version,
                },
            )

    reset_encryption_caches()
    yield EncryptionConfigurator(monkeypatch, carry_accounts)
    monkeypatch.undo()
    reset_encryption_caches()


@pytest.fixture(scope="session", autouse=True)
def _media_root() -> Iterator[None]:
    yield
    if MEDIA_ROOT.startswith(tempfile.gettempdir()):
        shutil.rmtree(MEDIA_ROOT, ignore_errors=True)


def _database_reachable(url: str) -> bool:
    if not url:
        return False
    try:
        engine = create_engine(url, pool_pre_ping=True)
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        engine.dispose()
    except Exception:
        return False
    return True


DATABASE_AVAILABLE = _database_reachable(INTEGRATION_DATABASE_URL)

requires_database = pytest.mark.skipif(
    not DATABASE_AVAILABLE,
    reason=(
        "No PostgreSQL instance is reachable. Set EIMIR_TEST_DATABASE_URL to run integration tests."
    ),
)


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    if not DATABASE_AVAILABLE:
        pytest.skip("No database is reachable.")

    from eimir.db.base import Base
    from eimir.db.registry import load_all_models

    load_all_models()

    # Test probe for owner/privacy authorization. It deliberately exists only
    # here: alembic/env.py does not know it, so it appears in no migration and
    # no production database.
    from tests.support import privacy_probe as _privacy_probe  # noqa: F401

    db_engine = create_engine(INTEGRATION_DATABASE_URL, future=True)
    Base.metadata.create_all(db_engine)
    yield db_engine
    Base.metadata.drop_all(db_engine)
    db_engine.dispose()


@pytest.fixture
def session(engine: Engine) -> Iterator[Session]:
    """Provide one session per test and roll it back afterwards.

    No test leaves rows behind for the next one. Order-dependent tests hide
    exactly the defects these tests are meant to find.
    """
    connection = engine.connect()
    transaction = connection.begin()
    test_session = sessionmaker(bind=connection, expire_on_commit=False)()
    try:
        yield test_session
    finally:
        test_session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def client(session: Session):  # type: ignore[no-untyped-def]
    """Provide an HTTP client using the same transaction as the test.

    Without the override, the application would open its own sessions and
    could not see uncommitted test data.
    """
    from fastapi.testclient import TestClient

    from eimir.db.session import get_session
    from eimir.main import create_app

    app = create_app()
    app.dependency_overrides[get_session] = lambda: session
    return TestClient(app, raise_server_exceptions=False)


def _clear_database(engine: Engine) -> None:
    """Remove committed test data in foreign-key-safe order."""
    from eimir.db.base import Base

    with engine.begin() as connection:
        for table in reversed(Base.metadata.sorted_tables):
            connection.execute(table.delete())


@pytest.fixture
def production_client(engine: Engine, monkeypatch):  # type: ignore[no-untyped-def]
    """Provide an HTTP client using the real request unit of work.

    Unlike the normal ``client``, each request gets its own session and
    therefore the exact commit/rollback boundary used in production.
    """
    from fastapi.testclient import TestClient

    from eimir.db import session as db_session
    from eimir.main import create_app

    maker = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)
    monkeypatch.setattr(db_session, "get_sessionmaker", lambda: maker)

    _clear_database(engine)
    try:
        with TestClient(create_app(), raise_server_exceptions=False) as test_client:
            yield test_client, maker
    finally:
        _clear_database(engine)


def make_account(session: Session, name: str = "Testperson"):  # type: ignore[no-untyped-def]
    from eimir.identity.models import Account

    account = Account(display_name=name)
    session.add(account)
    session.flush()
    return account


def make_space(session: Session, founder):  # type: ignore[no-untyped-def]
    from eimir.relationship.service import create_space

    return create_space(session, founder)


def make_space_without_daily_context(session: Session, founder):  # type: ignore[no-untyped-def]
    """Create a Space in the state existing Spaces keep after #1790.

    New Spaces start with both daily check-in dimensions on and the founder's time zone.
    Spaces created before that keep the stored v1 state: daily check-in dimensions off
    and no shared daily time zone. A bulk UPDATE leaves the row version at its
    initial value, exactly like a row read from that earlier state.
    """
    from sqlalchemy import update

    from eimir.relationship.models import SpaceConfiguration

    space = make_space(session, founder)
    session.execute(
        update(SpaceConfiguration)
        .where(SpaceConfiguration.space_id == space.id)
        .values(
            vibe_check_enabled=False,
            energy_check_in_enabled=False,
            daily_context_timezone=None,
        )
        .execution_options(synchronize_session="fetch")
    )
    session.flush()
    return space


def sign_in(session: Session, account) -> str:  # type: ignore[no-untyped-def]
    """Issue a real access token.

    Go through the regular service rather than around it; a forged token would
    skip exactly the path that this helper is meant to exercise.
    """
    from eimir.auth.sessions import start_session

    _, tokens = start_session(session, account)
    session.flush()
    return tokens.access_token


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
