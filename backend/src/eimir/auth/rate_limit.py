"""Limit repeated attempts.

State lives in the database rather than process memory because the cloud API is
stateless and horizontally replicated. An in-memory counter would exist once
per instance, and enough requests could simply spread across them.

The key is stored as a hash. It is often an email address, and a table full of
addresses revealing who attempted to sign in and when would retain more
information than this function needs.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from functools import partial
from typing import TYPE_CHECKING, Any, cast

from sqlalchemy import delete, func, select

if TYPE_CHECKING:
    from sqlalchemy import CursorResult
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from eimir.auth.tokens import hash_token
from eimir.core.clock import now
from eimir.core.errors import ErrorCode, RateLimitedError
from eimir.db.locks import lock_subject
from eimir.db.session import schedule_after_rollback
from eimir.identity.models import RateLimitEvent


@dataclass(frozen=True)
class Limit:
    attempts: int
    window: timedelta


# Sign-in: strict enough to make guessing unattractive, generous enough not to
# lock out someone making ordinary typing mistakes.
SIGN_IN = Limit(attempts=10, window=timedelta(minutes=15))
MAGIC_LINK = Limit(attempts=5, window=timedelta(minutes=15))
INVITATION_ACCEPT = Limit(attempts=10, window=timedelta(minutes=15))

# Refresh is the only case that limits successful attempts rather than failed
# ones. Every rotation writes one replay-history row; a client with a valid
# token could otherwise generate arbitrarily many in a tight loop.
#
# An access token lives for 15 minutes, so a regular client refreshes roughly
# once per window. The budget is deliberately many times higher so restarts,
# network changes, and retries do not lock users out while loops still do.
REFRESH = Limit(attempts=20, window=timedelta(minutes=15))

_PERSISTED_ATTEMPTS_KEY = "eimir.rate_limit.persisted"


def _record_hashed_attempt(session: Session, *, action: str, key_hash: str) -> None:
    session.add(RateLimitEvent(action=action, key_hash=key_hash, occurred_at=now()))
    session.flush()


def _reserve_hashed_attempt(
    session: Session,
    *,
    action: str,
    key_hash: str,
    limit: Limit,
) -> None:
    """Check and consume a slot under a database-wide per-key lock."""
    # The lock key deliberately uses only the already-hashed rate-limit key;
    # plaintext enters neither the table nor the lock key.
    lock_subject(session, action, key_hash)

    since = now() - limit.window
    attempts = session.execute(
        select(func.count())
        .select_from(RateLimitEvent)
        .where(
            RateLimitEvent.action == action,
            RateLimitEvent.key_hash == key_hash,
            RateLimitEvent.occurred_at >= since,
        )
    ).scalar_one()

    if attempts >= limit.attempts:
        raise RateLimitedError(
            "Too many attempts. Please try again later.",
            ErrorCode.RATE_LIMITED,
        )

    _record_hashed_attempt(session, action=action, key_hash=key_hash)


def _persisted_attempts(session: Session) -> set[tuple[str, str]]:
    return cast(
        set[tuple[str, str]],
        session.info.setdefault(_PERSISTED_ATTEMPTS_KEY, set()),
    )


def check(session: Session, action: str, key: str, limit: Limit) -> None:
    """Atomically check and consume a rate-limit slot.

    Production request sessions are bound to the engine. There the reservation
    lives in a short, separate security transaction that commits before the
    domain request continues. If the request later fails and rolls back, the
    attempt remains counted. A PostgreSQL advisory lock simultaneously
    serializes all API instances for the exact ``(action, key)`` pair.

    Tests that deliberately bind a session to an already-open connection stay
    inside their test transaction so a separate commit cannot break isolation.

    Historical callers immediately follow with ``record_attempt()``. This
    method marks the already-persisted reservation so that call does not create
    a duplicate entry.
    """
    key_hash = hash_token(key.lower())
    bind = session.get_bind()

    if isinstance(bind, Engine):
        # Late import: tests replace get_sessionmaker for the real production
        # unit-of-work lifecycle, and that replacement must apply here too.
        from eimir.db import session as db_session

        security_session = db_session.get_sessionmaker()()
        try:
            _reserve_hashed_attempt(
                security_session,
                action=action,
                key_hash=key_hash,
                limit=limit,
            )
            security_session.commit()
        except Exception:
            security_session.rollback()
            raise
        finally:
            security_session.close()
    else:
        _reserve_hashed_attempt(session, action=action, key_hash=key_hash, limit=limit)

    _persisted_attempts(session).add((action, key_hash))


def record_attempt(session: Session, action: str, key: str) -> None:
    """Record an attempt unless ``check`` already reserved it."""
    key_hash = hash_token(key.lower())
    if (action, key_hash) in _persisted_attempts(session):
        return
    _record_hashed_attempt(session, action=action, key_hash=key_hash)


def preserve_attempt_after_rollback(session: Session, action: str, key: str) -> None:
    """Persist the attempt even when the request is rejected.

    ``check()`` already persists production reservations in a separate security
    transaction. For legacy/direct calls without a prior reservation, keep the
    existing after-rollback path.
    """
    key_hash = hash_token(key.lower())
    if (action, key_hash) in _persisted_attempts(session):
        return

    schedule_after_rollback(
        session,
        partial(
            _record_hashed_attempt,
            action=action,
            key_hash=key_hash,
        ),
    )


def clear(session: Session, action: str, key: str) -> None:
    """Clear attempts after success.

    Otherwise failures before a successful sign-in would keep counting and
    could lock out the legitimate user afterward.
    """
    key_hash = hash_token(key.lower())
    session.execute(
        delete(RateLimitEvent).where(
            RateLimitEvent.action == action,
            RateLimitEvent.key_hash == key_hash,
        )
    )
    _persisted_attempts(session).discard((action, key_hash))


def prune(session: Session, older_than: datetime | None = None) -> int:
    """Remove old entries. Intended for a background job."""
    cutoff = older_than or (now() - timedelta(days=1))
    # session.execute is typed generically; DELETE returns a CursorResult with
    # rowcount.
    result = cast(
        "CursorResult[Any]",
        session.execute(delete(RateLimitEvent).where(RateLimitEvent.occurred_at < cutoff)),
    )
    return int(result.rowcount or 0)
