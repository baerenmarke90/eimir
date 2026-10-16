"""Recurring reset chain for the isolated public demo deployment."""

from __future__ import annotations

import logging
from collections.abc import Sequence
from datetime import date, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from eimir.auth.demo_authority import lock_demo_auth_authority
from eimir.config import get_settings
from eimir.demo import reset_demo_space
from eimir.identity.models import (
    AccountEmail,
    AccountRecoveryToken,
    AuthIdentity,
    AuthProvider,
    DeviceSession,
    EmailVerificationToken,
    MagicLinkToken,
    OidcAuthRequest,
    WebAuthnChallenge,
    WebAuthnCredential,
)
from eimir.jobs import queue
from eimir.jobs.models import Job, JobStatus
from eimir.jobs.worker import JobRegistry, registry

log = logging.getLogger(__name__)

DEMO_RESET_JOB = "demo-space-reset"
_LOCK_KEY = 8_150_215


def _enabled() -> bool:
    settings = get_settings()
    return settings.demo_mode and settings.demo_mode_reset_timer


def _open_jobs(session: Session, *statuses: JobStatus) -> int:
    return int(
        session.execute(
            select(func.count())
            .select_from(Job)
            .where(
                Job.kind == DEMO_RESET_JOB,
                Job.status.in_([status.value for status in statuses]),
            )
        ).scalar_one()
    )


def _lock(session: Session) -> None:
    session.execute(select(func.pg_advisory_xact_lock(_LOCK_KEY)))


def _clear_demo_auth_state(session: Session, account_ids: Sequence[UUID]) -> None:
    """Remove public-demo authentication artifacts while preserving local seed passwords."""
    email_ids = select(AccountEmail.id).where(AccountEmail.account_id.in_(account_ids))
    session.execute(
        delete(EmailVerificationToken).where(EmailVerificationToken.account_email_id.in_(email_ids))
    )
    session.execute(delete(MagicLinkToken).where(MagicLinkToken.account_email_id.in_(email_ids)))
    session.execute(
        delete(AccountRecoveryToken).where(AccountRecoveryToken.account_id.in_(account_ids))
    )
    session.execute(delete(WebAuthnChallenge).where(WebAuthnChallenge.account_id.in_(account_ids)))
    session.execute(
        delete(WebAuthnCredential).where(WebAuthnCredential.account_id.in_(account_ids))
    )
    session.execute(delete(OidcAuthRequest).where(OidcAuthRequest.account_id.in_(account_ids)))
    session.execute(
        delete(AuthIdentity).where(
            AuthIdentity.account_id.in_(account_ids),
            AuthIdentity.provider != AuthProvider.LOCAL_PASSWORD.value,
        )
    )
    session.execute(delete(DeviceSession).where(DeviceSession.account_id.in_(account_ids)))
    session.flush()


def ensure_scheduled(session: Session, *, delay: timedelta | None = None) -> Job | None:
    """Ensure one reset chain exists when the deployment opted into the timer."""
    if not _enabled():
        return None
    _lock(session)
    if _open_jobs(session, JobStatus.PENDING, JobStatus.RUNNING):
        return None
    settings = get_settings()
    return queue.enqueue(
        session,
        DEMO_RESET_JOB,
        delay=delay or settings.demo_mode_reset_interval,
    )


def schedule_next(session: Session) -> Job | None:
    """Schedule the next configured interval after a successful reset."""
    if not _enabled():
        return None
    _lock(session)
    if _open_jobs(session, JobStatus.PENDING):
        return None
    return queue.enqueue(
        session,
        DEMO_RESET_JOB,
        delay=get_settings().demo_mode_reset_interval,
    )


def run_demo_reset(session: Session, payload: dict[str, Any]) -> None:
    """Restore canonical demo content, expire sessions, and continue the reset chain."""
    del payload
    settings = get_settings()
    if not settings.demo_mode or not settings.demo_mode_reset_timer:
        return

    # This is the outer authority boundary for the runtime reset transaction.
    # A demo proof issue/consume that acquired it first must commit before this
    # reset can continue and is then swept by _clear_demo_auth_state. A proof
    # operation arriving after this point waits until reset commits and is
    # therefore unambiguously post-reset. Keep this before reset_demo_space so
    # canonical-dataset serialization (#690, reset_demo_space's own
    # _lock_canonical_demo_dataset) follows the documented auth-authority ->
    # dataset -> scheduler ordering rather than creating a reverse edge
    # through token/session cleanup.
    lock_demo_auth_authority(session)

    result = reset_demo_space(
        session,
        environment=settings.environment,
        reference_date=date.today(),
    )
    _clear_demo_auth_state(session, [result.lea_id, result.alex_id])
    log.info(
        "canonical demo Space reset",
        extra={
            "space_id": str(result.space_id),
            "reference_date": result.reference_date.isoformat(),
        },
    )
    schedule_next(session)


def register_handlers(target: JobRegistry | None = None) -> None:
    destination = target if target is not None else registry
    if destination.get(DEMO_RESET_JOB) is None:
        destination.register(DEMO_RESET_JOB, run_demo_reset)
