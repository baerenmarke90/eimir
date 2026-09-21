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

# Never accidentally run against a real instance.
os.environ.setdefault("EIMIR_ENVIRONMENT", "test")

TEST_BOOTSTRAP_TOKEN = "test-bootstrap-token-with-at-least-32-characters"
os.environ.setdefault("EIMIR_BOOTSTRAP_TOKEN", TEST_BOOTSTRAP_TOKEN)

# Media files go into a temporary directory rather than the working tree. The
# configuration default is "./data/media"; without this override, a test run
# would leave files in the repository that nobody should accidentally commit.
MEDIA_ROOT = os.environ.setdefault("EIMIR_MEDIA_ROOT", tempfile.mkdtemp(prefix="eimir-test-media-"))

INTEGRATION_DATABASE_URL = os.environ.get("EIMIR_TEST_DATABASE_URL", "")


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

    # The same list as in alembic/env.py, for the same reason: anything missing
    # here does not exist during create_all. A later import by the app would
    # register the model, but only after the tables have been created, making
    # tests pass or fail accidentally depending on prior imports.
    from eimir.administration import models as _administration  # noqa: F401
    from eimir.attachments import binding as _binding  # noqa: F401
    from eimir.attachments import models as _attachments  # noqa: F401
    from eimir.chapters import models as _chapters  # noqa: F401
    from eimir.collections import models as _collections  # noqa: F401
    from eimir.comments import models as _comments  # noqa: F401
    from eimir.daily_checkins import models as _daily_checkins  # noqa: F401
    from eimir.dashboard import models as _dashboard  # noqa: F401
    from eimir.db.base import Base
    from eimir.engagement import models as _engagement  # noqa: F401
    from eimir.entitlements import models as _entitlements  # noqa: F401
    from eimir.gift_ideas import models as _gift_ideas  # noqa: F401
    from eimir.heart_moments import models as _heart_moments  # noqa: F401
    from eimir.identity import models as _identity  # noqa: F401
    from eimir.jobs import models as _jobs  # noqa: F401
    from eimir.memories import models as _memories  # noqa: F401
    from eimir.milestones import models as _milestones  # noqa: F401
    from eimir.outbox import models as _outbox  # noqa: F401
    from eimir.people import models as _people  # noqa: F401
    from eimir.places import models as _places  # noqa: F401
    from eimir.plans import models as _plans  # noqa: F401
    from eimir.private_collections import models as _private_collections  # noqa: F401
    from eimir.private_notes import models as _private_notes  # noqa: F401
    from eimir.profiles import models as _profiles  # noqa: F401
    from eimir.relations import models as _relations  # noqa: F401
    from eimir.relationship import models as _relationship  # noqa: F401
    from eimir.reminders import models as _reminders  # noqa: F401
    from eimir.reminders import runtime_models as _reminder_runtime  # noqa: F401
    from eimir.story import view_models as _story_views  # noqa: F401
    from eimir.transfer import models as _transfer  # noqa: F401
    from eimir.wishes import models as _wishes  # noqa: F401

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
