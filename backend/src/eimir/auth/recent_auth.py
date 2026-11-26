"""Server-authoritative recent authentication for high-risk actions.

A normal authenticated session proves that a client still possesses its bearer
credentials. It does not prove that the person at the device re-established
identity immediately before an irreversible operation. This module owns that
second boundary.

Grants are deliberately server-side state. Clients receive status only and
never receive a bearer proof that could be copied into LocalStorage, a URL, or
another session. Each grant is bound to one Account, one stable DeviceSession
(refresh-token family), and one narrow purpose.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import StrEnum

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from eimir.auth import passwords, rate_limit
from eimir.auth.policy import AuthCapabilities
from eimir.auth.recent_auth_models import RecentAuthenticationGrant
from eimir.config import get_settings
from eimir.core.clock import now
from eimir.core.errors import ForbiddenError, UnauthenticatedError
from eimir.db.locks import lock_subject
from eimir.identity import service as accounts
from eimir.identity.models import (
    Account,
    AuthIdentity,
    AuthProvider,
    DeviceSession,
    WebAuthnCredential,
)

RECENT_AUTH_LIFETIME = timedelta(minutes=5)
"""Short reuse window for one explicitly named high-risk purpose.

The grant is reusable only inside this window for the same session and purpose.
This preserves the existing retry/idempotency contract of Account deletion: a
transient failure after authorization does not force the user to repeat their
credential ceremony immediately. It is not reusable for a different purpose.
"""

ACTION_LOCAL_CREDENTIAL = "recent_auth_local_credential"
PASSWORD_LIMIT = rate_limit.SIGN_IN
GRANT_LOCK = "recent_auth_grant"


class RecentAuthenticationPurpose(StrEnum):
    ACCOUNT_DELETION = "ACCOUNT_DELETION"


class RecentAuthenticationMethod(StrEnum):
    LOCAL_PASSWORD = "LOCAL_PASSWORD"
    PASSKEY = "PASSKEY"
    OIDC = "OIDC"


class RecentAuthenticationClient(StrEnum):
    WEB = "web"
    ANDROID = "android"


class RecentAuthenticationErrorCode:
    REQUIRED = "RECENT_AUTHENTICATION_REQUIRED"
    SESSION_INVALID = "RECENT_AUTHENTICATION_SESSION_INVALID"
    METHOD_UNAVAILABLE = "RECENT_AUTHENTICATION_METHOD_UNAVAILABLE"
    PASSWORD_INVALID = "RECENT_AUTHENTICATION_PASSWORD_INVALID"


@dataclass(frozen=True, slots=True)
class RecentAuthenticationResult:
    purpose: RecentAuthenticationPurpose
    method: RecentAuthenticationMethod
    achieved_at: datetime
    expires_at: datetime


@dataclass(frozen=True, slots=True)
class RecentAuthenticationCapabilities:
    local_password: bool
    passkey: bool
    oidc_connections: tuple[str, ...]


def _session_is_live(device_session: DeviceSession, *, at: datetime) -> bool:
    return (
        device_session.revoked_at is None
        and device_session.access_token_hash is not None
        and device_session.access_expires_at is not None
        and device_session.access_expires_at > at
        and device_session.expires_at > at
        and device_session.absolute_expires_at > at
    )


def ensure_context(account: Account, device_session: DeviceSession) -> None:
    """Fail closed unless the request belongs to one live concrete session."""
    current_time = now()
    if (
        not account.is_active
        or device_session.account_id != account.id
        or not _session_is_live(device_session, at=current_time)
    ):
        raise ForbiddenError(
            "The current session cannot authorize this high-risk action.",
            RecentAuthenticationErrorCode.SESSION_INVALID,
        )


def _lock_live_session(
    session: Session,
    account: Account,
    device_session: DeviceSession,
) -> None:
    """Order grant issuance against concurrent revocation/replacement."""
    current_time = now()
    live_id = session.execute(
        select(DeviceSession.id)
        .where(
            DeviceSession.id == device_session.id,
            DeviceSession.account_id == account.id,
            DeviceSession.revoked_at.is_(None),
            DeviceSession.access_token_hash.is_not(None),
            DeviceSession.access_expires_at.is_not(None),
            DeviceSession.access_expires_at > current_time,
            DeviceSession.expires_at > current_time,
            DeviceSession.absolute_expires_at > current_time,
        )
        .with_for_update()
    ).scalar_one_or_none()
    if live_id is None or not account.is_active:
        raise ForbiddenError(
            "The current session cannot authorize this high-risk action.",
            RecentAuthenticationErrorCode.SESSION_INVALID,
        )


def capabilities(
    session: Session,
    account: Account,
    device_session: DeviceSession,
    policy: AuthCapabilities,
    *,
    client: RecentAuthenticationClient = RecentAuthenticationClient.WEB,
) -> RecentAuthenticationCapabilities:
    """Return only methods that can actually step up this Account now."""
    ensure_context(account, device_session)

    local_password = False
    if policy.local_password:
        local_password = (
            session.execute(
                select(AuthIdentity.id).where(
                    AuthIdentity.account_id == account.id,
                    AuthIdentity.provider == AuthProvider.LOCAL_PASSWORD.value,
                    AuthIdentity.secret_hash.is_not(None),
                )
            ).scalar_one_or_none()
            is not None
        )

    passkey = False
    if policy.passkey:
        passkey = (
            session.execute(
                select(WebAuthnCredential.id)
                .where(WebAuthnCredential.account_id == account.id)
                .limit(1)
            ).scalar_one_or_none()
            is not None
        )

    configured_ids = {
        connection.id
        for connection in get_settings().oidc_connections
        if client != RecentAuthenticationClient.ANDROID
        or connection.android_redirect_uri is not None
    }
    oidc_connections: tuple[str, ...] = ()
    if policy.oidc and configured_ids:
        linked = session.execute(
            select(AuthIdentity.connection_id).where(
                AuthIdentity.account_id == account.id,
                AuthIdentity.provider == AuthProvider.OIDC.value,
                AuthIdentity.connection_id.is_not(None),
            )
        ).scalars()
        oidc_connections = tuple(
            sorted({value for value in linked if value is not None and value in configured_ids})
        )

    return RecentAuthenticationCapabilities(
        local_password=local_password,
        passkey=passkey,
        oidc_connections=oidc_connections,
    )


def issue_grant(
    session: Session,
    account: Account,
    device_session: DeviceSession,
    *,
    purpose: RecentAuthenticationPurpose,
    method: RecentAuthenticationMethod,
) -> RecentAuthenticationResult:
    """Create or refresh exactly one purpose grant for this session."""
    ensure_context(account, device_session)
    _lock_live_session(session, account, device_session)
    lock_subject(
        session,
        GRANT_LOCK,
        str(account.id),
        str(device_session.id),
        purpose.value,
    )

    current_time = now()
    expires_at = current_time + RECENT_AUTH_LIFETIME
    grant = session.execute(
        select(RecentAuthenticationGrant)
        .where(
            RecentAuthenticationGrant.account_id == account.id,
            RecentAuthenticationGrant.device_session_id == device_session.id,
            RecentAuthenticationGrant.purpose == purpose.value,
        )
        .with_for_update()
    ).scalar_one_or_none()

    if grant is None:
        grant = RecentAuthenticationGrant(
            account_id=account.id,
            device_session_id=device_session.id,
            purpose=purpose.value,
            method=method.value,
            achieved_at=current_time,
            expires_at=expires_at,
        )
        session.add(grant)
    else:
        grant.method = method.value
        grant.achieved_at = current_time
        grant.expires_at = expires_at

    session.flush()
    return RecentAuthenticationResult(
        purpose=purpose,
        method=method,
        achieved_at=current_time,
        expires_at=expires_at,
    )


def require_grant(
    session: Session,
    account: Account,
    device_session: DeviceSession,
    *,
    purpose: RecentAuthenticationPurpose,
) -> RecentAuthenticationGrant:
    """Require a live grant for this exact Account/session/purpose tuple."""
    ensure_context(account, device_session)
    current_time = now()

    grant = session.execute(
        select(RecentAuthenticationGrant)
        .join(DeviceSession, DeviceSession.id == RecentAuthenticationGrant.device_session_id)
        .where(
            RecentAuthenticationGrant.account_id == account.id,
            RecentAuthenticationGrant.device_session_id == device_session.id,
            RecentAuthenticationGrant.purpose == purpose.value,
            RecentAuthenticationGrant.expires_at > current_time,
            DeviceSession.account_id == account.id,
            DeviceSession.revoked_at.is_(None),
            DeviceSession.access_token_hash.is_not(None),
            DeviceSession.access_expires_at.is_not(None),
            DeviceSession.access_expires_at > current_time,
            DeviceSession.expires_at > current_time,
            DeviceSession.absolute_expires_at > current_time,
        )
    ).scalar_one_or_none()
    if grant is None:
        raise ForbiddenError(
            "Recent authentication is required for this high-risk action.",
            RecentAuthenticationErrorCode.REQUIRED,
        )
    return grant


def authenticate_password(
    session: Session,
    account: Account,
    device_session: DeviceSession,
    *,
    password: str,
    purpose: RecentAuthenticationPurpose,
) -> RecentAuthenticationResult:
    """Verify the existing local credential and issue a session-bound grant."""
    ensure_context(account, device_session)
    key = f"{account.id}:{device_session.id}"
    rate_limit.check(session, ACTION_LOCAL_CREDENTIAL, key, PASSWORD_LIMIT)

    identity = accounts.local_identity(session, account)
    if (
        identity is None
        or not identity.secret_hash
        or not passwords.verify_password(identity.secret_hash, password)
    ):
        rate_limit.preserve_attempt_after_rollback(session, ACTION_LOCAL_CREDENTIAL, key)
        raise UnauthenticatedError(
            "Recent authentication failed.",
            RecentAuthenticationErrorCode.PASSWORD_INVALID,
        )

    rate_limit.clear(session, ACTION_LOCAL_CREDENTIAL, key)
    identity.last_used_at = now()
    return issue_grant(
        session,
        account,
        device_session,
        purpose=purpose,
        method=RecentAuthenticationMethod.LOCAL_PASSWORD,
    )


def prune_grants(session: Session) -> int:
    """Remove expired grants; live checks never depend on this maintenance pass."""
    result = session.execute(
        delete(RecentAuthenticationGrant).where(RecentAuthenticationGrant.expires_at <= now())
    )
    return int(getattr(result, "rowcount", 0) or 0)
