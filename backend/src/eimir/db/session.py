"""Database connection and transaction boundary.

One request is one transaction. It is committed at the end of route processing,
before a successful response is exposed, or rolled back completely, never
piecemeal during processing.

This is required by the transactional outbox: domain mutation and event must
become effective together or not at all.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator
from contextlib import contextmanager
from functools import lru_cache
from typing import cast

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from eimir.config import get_settings

AfterRollbackAction = Callable[[Session], None]
_AFTER_ROLLBACK_KEY = "eimir.after_rollback"


@lru_cache
def get_engine() -> Engine:
    settings = get_settings()
    return create_engine(
        settings.database_url,
        echo=settings.database_echo,
        pool_pre_ping=True,
        future=True,
        # Without this option SQLAlchemy includes bound parameters in every
        # database error message and therefore, through `log.exception`, in
        # application logs. That would expose exactly what belongs behind the
        # ProtectedPayload boundary: titles, text, addresses, and place
        # coordinates. M3-D28 explicitly prohibits location data in logs; the
        # same rule has applied to the remaining content since M2.
        #
        # The tradeoff is debugging: even `echo` then hides values. This is the
        # correct default; a developer who needs them locally must opt out
        # deliberately and temporarily.
        hide_parameters=True,
    )


@lru_cache
def get_sessionmaker() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), autoflush=False, expire_on_commit=False, future=True)


def schedule_after_rollback(session: Session, action: AfterRollbackAction) -> None:
    """Persist a security mutation after the request transaction rolls back.

    The action receives a fresh Session. This allows, for example, recording a
    failed authentication attempt without also committing partial domain
    mutations from the rejected request.
    """
    actions = cast(
        "list[AfterRollbackAction]",
        session.info.setdefault(_AFTER_ROLLBACK_KEY, []),
    )
    actions.append(action)


def _take_after_rollback_actions(session: Session) -> tuple[AfterRollbackAction, ...]:
    actions = cast(
        "list[AfterRollbackAction]",
        session.info.pop(_AFTER_ROLLBACK_KEY, []),
    )
    return tuple(actions)


def _run_after_rollback_actions(actions: tuple[AfterRollbackAction, ...]) -> None:
    if not actions:
        return

    security_session = get_sessionmaker()()
    try:
        for action in actions:
            action(security_session)
        security_session.commit()
    except Exception:
        security_session.rollback()
        raise
    finally:
        security_session.close()


@contextmanager
def unit_of_work() -> Iterator[Session]:
    """Run one transaction.

    Leaving the block without an exception commits. Any exception rolls back,
    including exceptions unrelated to the database. A partially written
    operation is worse than a failed one.
    """
    session = get_sessionmaker()()
    try:
        yield session
        session.commit()
    except Exception:
        actions = _take_after_rollback_actions(session)
        session.rollback()
        _run_after_rollback_actions(actions)
        raise
    finally:
        session.close()


def get_session() -> Iterator[Session]:
    """FastAPI route dependency used with function scope.

    The dependency exit commits through ``unit_of_work``. API declarations must
    therefore use ``Depends(get_session, scope="function")`` so FastAPI runs
    that exit before sending a success response.
    """
    with unit_of_work() as session:
        yield session
