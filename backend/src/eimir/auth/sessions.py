"""Device sessions: create, resolve, refresh, and revoke."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from functools import partial
from typing import TYPE_CHECKING, Any, cast
from uuid import UUID

from sqlalchemy import delete, or_, select

if TYPE_CHECKING:
    from sqlalchemy import CursorResult
from sqlalchemy.orm import Session

from eimir.auth import rate_limit
from eimir.auth.tokens import (
    ACCESS_TOKEN_LIFETIME,
    REFRESH_TOKEN_BYTES,
    REFRESH_TOKEN_LIFETIME,
    SESSION_ABSOLUTE_LIFETIME,
    generate_token,
    hash_token,
)
from eimir.core.clock import now
from eimir.core.errors import ErrorCode, UnauthenticatedError
from eimir.db.session import schedule_after_rollback
from eimir.identity.models import Account, ConsumedRefreshToken, DeviceSession

ACTION_REFRESH = "refresh"
"""The rate-limit key belongs to the session rather than the token.

The token value changes on every rotation, so limiting by token would reset the
budget after each attempt. ``DeviceSession`` represents the family and remains
stable across generations.
"""

# How long replay history survives after its family has ended.
#
# While a session is active, every consumed generation remains stored; removing
# one would create exactly the gap the history is intended to close. Once the
# session is revoked or expired, replay cannot trigger any further access
# because refresh already fails on the dead session. Retention after that point
# exists only for traceability.
#
# The history is bounded only together with SESSION_ABSOLUTE_LIFETIME. The
# sliding refresh window alone would let a regularly used session live forever,
# together with history that could never be pruned.
REPLAY_HISTORY_RETENTION = timedelta(days=30)


@dataclass(frozen=True)
class IssuedTokens:
    """Tokens returned to the client. Their plaintext exists only here."""

    access_token: str
    refresh_token: str
    access_expires_at: datetime
    refresh_expires_at: datetime


def _revoke_by_id(session: Session, *, device_session_id: UUID) -> None:
    device_session = session.get(DeviceSession, device_session_id)
    if device_session is not None and device_session.revoked_at is None:
        revoke(device_session)


def start_session(
    session: Session, account: Account, *, device_name: str = "", platform: str = ""
) -> tuple[DeviceSession, IssuedTokens]:
    """Open a new device session.

    Sign-in paths call this after identity has been established. This function
    does not verify identity itself; it assumes that has already happened.
    """
    access = generate_token()
    refresh = generate_token(REFRESH_TOKEN_BYTES)
    current_time = now()

    device_session = DeviceSession(
        account_id=account.id,
        device_name=device_name[:120],
        platform=platform[:32],
        refresh_token_hash=hash_token(refresh),
        access_token_hash=hash_token(access),
        access_expires_at=current_time + ACCESS_TOKEN_LIFETIME,
        expires_at=current_time + REFRESH_TOKEN_LIFETIME,
        # The family clock starts here. No rotation resets it.
        absolute_expires_at=current_time + SESSION_ABSOLUTE_LIFETIME,
        last_used_at=current_time,
    )
    session.add(device_session)

    return device_session, IssuedTokens(
        access_token=access,
        refresh_token=refresh,
        access_expires_at=device_session.access_expires_at or current_time,
        refresh_expires_at=device_session.expires_at,
    )


def authenticate(session: Session, access_token: str) -> Account:
    """Return the account associated with an access token."""
    return resolve(session, access_token)[1]


def resolve(session: Session, access_token: str) -> tuple[DeviceSession, Account]:
    """Resolve a device session and account from an access token.

    Every failure produces the same response. A caller must not be able to
    distinguish whether a token is unknown, expired, or revoked, because that
    would leak information about valid tokens.
    """
    if not access_token:
        raise UnauthenticatedError("Authentication required.", ErrorCode.AUTHENTICATION_REQUIRED)

    device_session = session.execute(
        select(DeviceSession).where(DeviceSession.access_token_hash == hash_token(access_token))
    ).scalar_one_or_none()

    current_time = now()
    if (
        device_session is None
        or device_session.revoked_at is not None
        or device_session.access_expires_at is None
        or device_session.access_expires_at <= current_time
        # Otherwise an access token issued shortly before the family deadline
        # could outlive it, defeating the hard upper bound.
        or device_session.absolute_expires_at <= current_time
    ):
        raise UnauthenticatedError("Authentication required.", ErrorCode.AUTHENTICATION_REQUIRED)

    account = session.get(Account, device_session.account_id)
    if account is None or not account.is_active:
        raise UnauthenticatedError("Authentication required.", ErrorCode.AUTHENTICATION_REQUIRED)

    device_session.last_used_at = current_time
    return device_session, account


def _revoke_family_on_replay(session: Session, *, token_hash: str) -> None:
    """Revoke the family to which a consumed token belongs.

    This is called only with a hash that no longer matches a current session.
    If that hash exists in consumption history, it was a genuine token from
    this family and presenting it again means a copy exists. The legitimate
    client would already hold a newer generation.

    Revocation is repeated after rollback as well: the request ends with 401,
    and without this deferred action the compromise response would disappear
    with the rejected transaction.
    """
    family_id = session.execute(
        select(ConsumedRefreshToken.device_session_id).where(
            ConsumedRefreshToken.token_hash == token_hash
        )
    ).scalar_one_or_none()
    if family_id is None:
        return

    device_session = session.execute(
        select(DeviceSession).where(DeviceSession.id == family_id).with_for_update()
    ).scalar_one_or_none()
    if device_session is None:
        return

    if device_session.revoked_at is None:
        revoke(device_session)
    schedule_after_rollback(session, partial(_revoke_by_id, device_session_id=family_id))


def refresh_session(session: Session, refresh_token: str) -> IssuedTokens:
    """Refresh the session and rotate both tokens.

    Replay detection spans the entire token family: the session is the family,
    and every consumed generation remains linked to it. If any generation is
    presented again, even many rotations later, it has been copied; the
    legitimate client would possess the current generation. The family is then
    revoked instead of allowing attacker and owner to retain parallel access.

    Externally these cases are indistinguishable. Unknown, expired, revoked, and
    replayed tokens all produce the same response so errors cannot reveal which
    values were once genuine.

    Rotation extends only the sliding window, never the absolute family
    lifetime. Once the latter is reached, a new sign-in and token family are
    required.
    """
    hashed = hash_token(refresh_token) if refresh_token else ""
    failed = UnauthenticatedError("Authentication required.", ErrorCode.AUTHENTICATION_REQUIRED)
    if not hashed:
        raise failed

    current_time = now()

    device_session = session.execute(
        select(DeviceSession).where(DeviceSession.refresh_token_hash == hashed).with_for_update()
    ).scalar_one_or_none()

    # No match for the current generation. This is where both an old token and
    # the loser of two concurrent rotations arrive: PostgreSQL re-evaluates the
    # predicate after acquiring the lock against the now-rotated row, so exactly
    # one request proceeds and the other is treated as replay.
    if device_session is None:
        _revoke_family_on_replay(session, token_hash=hashed)
        raise failed

    if (
        device_session.revoked_at is not None
        or device_session.expires_at <= current_time
        or device_session.absolute_expires_at <= current_time
    ):
        raise failed

    account = session.get(Account, device_session.account_id)
    if account is None or not account.is_active:
        raise failed

    # Only the current token for this family reaches this point. Unknown, old,
    # or revoked tokens already returned 401 and therefore cannot use a 429 to
    # infer that a session exists.
    rate_limit.check(session, ACTION_REFRESH, str(device_session.id), rate_limit.REFRESH)
    # Do not clear after success: refresh limits successful rotations rather
    # than failures preceding them.
    rate_limit.record_attempt(session, ACTION_REFRESH, str(device_session.id))

    access = generate_token()
    new_refresh = generate_token(REFRESH_TOKEN_BYTES)

    session.add(
        ConsumedRefreshToken(
            device_session_id=device_session.id,
            token_hash=device_session.refresh_token_hash,
            consumed_at=current_time,
        )
    )
    device_session.refresh_token_hash = hash_token(new_refresh)
    device_session.access_token_hash = hash_token(access)
    # Both windows end no later than the family lifetime. Otherwise the response
    # would advertise expiry times the server does not honor.
    device_session.access_expires_at = min(
        current_time + ACCESS_TOKEN_LIFETIME, device_session.absolute_expires_at
    )
    device_session.expires_at = min(
        current_time + REFRESH_TOKEN_LIFETIME, device_session.absolute_expires_at
    )
    device_session.last_used_at = current_time

    return IssuedTokens(
        access_token=access,
        refresh_token=new_refresh,
        access_expires_at=device_session.access_expires_at,
        refresh_expires_at=device_session.expires_at,
    )


def revoke(device_session: DeviceSession) -> None:
    """End a device session.

    The access token is invalidated together with the refresh token; otherwise
    a stolen device could continue until its access token expires.
    """
    device_session.revoked_at = now()
    device_session.access_token_hash = None
    device_session.access_expires_at = None


def revoke_all(session: Session, account: Account) -> int:
    """End every active session for an account."""
    active_sessions = (
        session.execute(
            select(DeviceSession).where(
                DeviceSession.account_id == account.id,
                DeviceSession.revoked_at.is_(None),
            )
        )
        .scalars()
        .all()
    )

    for device_session in active_sessions:
        revoke(device_session)
    return len(active_sessions)


def prune_replay_history(session: Session, older_than: datetime | None = None) -> int:
    """Remove consumed generations for ended families.

    Intended for a background job. Active sessions remain untouched because
    their history is the replay-detection mechanism itself.
    """
    cutoff = older_than or (now() - REPLAY_HISTORY_RETENTION)

    # NULL comparisons do not match: an active session without ``revoked_at``
    # can qualify only via ``expires_at``, and only once it has truly expired.
    ended = select(DeviceSession.id).where(
        or_(DeviceSession.revoked_at < cutoff, DeviceSession.expires_at < cutoff)
    )

    # session.execute is typed generically; DELETE returns a CursorResult with
    # rowcount.
    result = cast(
        "CursorResult[Any]",
        session.execute(
            delete(ConsumedRefreshToken).where(ConsumedRefreshToken.device_session_id.in_(ended))
        ),
    )
    return int(result.rowcount or 0)
