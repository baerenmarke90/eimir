"""OIDC adapter for session-bound recent authentication.

Ordinary OIDC login/link state remains untouched. Step-up uses an independent
request table, so a state created here cannot be resolved by the normal OIDC
callback. Protocol verification still reuses the existing discovery, PKCE,
nonce, signature, issuer, and audience primitives.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any, cast
from urllib.parse import urlencode
from uuid import UUID

from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from eimir import config
from eimir.auth import oidc, rate_limit, recent_auth
from eimir.auth.recent_auth_models import RecentAuthenticationOidcRequest
from eimir.auth.tokens import generate_token, hash_token
from eimir.core.clock import now
from eimir.core.errors import ForbiddenError, UnauthenticatedError, ValidationError
from eimir.db.locks import lock_subject
from eimir.db.session import schedule_after_rollback
from eimir.identity import service as accounts
from eimir.identity.models import Account, AuthIdentity, AuthProvider, DeviceSession

AUTH_REQUEST_LIFETIME = timedelta(minutes=10)
AUTH_TIME_SKEW = timedelta(seconds=60)
_OIDC_PROOF_CONTEXT = b"eimir:recent-authentication:oidc:v1"


def _derived_proof(state: str, *, label: bytes) -> str:
    """Derive one ephemeral OIDC proof without persisting its plaintext value."""
    message = _OIDC_PROOF_CONTEXT + b"\x00" + label + b"\x00" + state.encode("utf-8")
    digest = hmac.new(
        config.get_settings().cursor_signing_secret,
        message,
        hashlib.sha256,
    ).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def _nonce(state: str) -> str:
    return _derived_proof(state, label=b"nonce")


def _code_verifier(state: str) -> str:
    return _derived_proof(state, label=b"pkce-verifier")


def _invalid_state() -> ValidationError:
    return ValidationError(
        "This sign-in attempt is no longer valid.",
        oidc.OidcErrorCode.INVALID_STATE,
    )


def _mark_consumed(session: Session, *, request_id: UUID) -> None:
    stored = session.execute(
        select(RecentAuthenticationOidcRequest)
        .where(RecentAuthenticationOidcRequest.id == request_id)
        .with_for_update()
    ).scalar_one_or_none()
    if stored is not None and stored.consumed_at is None:
        stored.consumed_at = now()
        session.flush()


def _open_request(
    session: Session,
    connection_id: str,
    state: str,
) -> RecentAuthenticationOidcRequest:
    if not state:
        raise _invalid_state()

    request = session.execute(
        select(RecentAuthenticationOidcRequest)
        .where(RecentAuthenticationOidcRequest.state_hash == hash_token(state))
        .with_for_update()
    ).scalar_one_or_none()
    current_time = now()
    if (
        request is None
        or request.connection_id != connection_id
        or request.consumed_at is not None
        or request.expires_at <= current_time
    ):
        raise _invalid_state()

    request.consumed_at = current_time
    session.flush()
    schedule_after_rollback(
        session,
        lambda security_session: _mark_consumed(
            security_session,
            request_id=request.id,
        ),
    )
    return request


def _fresh_auth_time(claims: dict[str, Any], *, started_at: datetime) -> bool:
    raw = claims.get("auth_time")
    if isinstance(raw, bool) or not isinstance(raw, (int, float)):
        return False
    try:
        authenticated_at = datetime.fromtimestamp(float(raw), tz=UTC)
    except (OSError, OverflowError, ValueError):
        return False

    current_time = now()
    return (
        authenticated_at >= started_at - AUTH_TIME_SKEW
        and authenticated_at <= current_time + AUTH_TIME_SKEW
    )


def start(
    session: Session,
    connection_id: str,
    account: Account,
    device_session: DeviceSession,
    *,
    purpose: recent_auth.RecentAuthenticationPurpose,
    client: recent_auth.RecentAuthenticationClient = recent_auth.RecentAuthenticationClient.WEB,
) -> oidc.StartedFlow:
    """Request active provider reauthentication for one current session."""
    recent_auth.ensure_context(account, device_session)
    configured = oidc.connection(connection_id)
    redirect_uri = configured.redirect_uri
    if client == recent_auth.RecentAuthenticationClient.ANDROID:
        if configured.android_redirect_uri is None:
            raise ForbiddenError(
                "OIDC recent authentication is not available for this client.",
                recent_auth.RecentAuthenticationErrorCode.METHOD_UNAVAILABLE,
            )
        redirect_uri = configured.android_redirect_uri
    linked = session.execute(
        select(AuthIdentity.id).where(
            AuthIdentity.account_id == account.id,
            AuthIdentity.provider == AuthProvider.OIDC.value,
            AuthIdentity.connection_id == configured.id,
        )
    ).scalar_one_or_none()
    if linked is None:
        raise ForbiddenError(
            "OIDC recent authentication is not available for this Account.",
            recent_auth.RecentAuthenticationErrorCode.METHOD_UNAVAILABLE,
        )

    rate_limit.check(session, oidc.ACTION_OIDC_START, configured.id, oidc.OIDC_START)
    rate_limit.record_attempt(session, oidc.ACTION_OIDC_START, configured.id)
    discovery = oidc.discover(configured)

    state = generate_token()
    nonce = _nonce(state)
    verifier = _code_verifier(state)
    started_at = now()
    session.add(
        RecentAuthenticationOidcRequest(
            connection_id=configured.id,
            state_hash=hash_token(state),
            redirect_uri=redirect_uri,
            account_id=account.id,
            device_session_id=device_session.id,
            purpose=purpose.value,
            expires_at=started_at + AUTH_REQUEST_LIFETIME,
            created_at=started_at,
        )
    )
    session.flush()

    parameters = {
        "response_type": "code",
        "client_id": configured.client_id,
        "redirect_uri": redirect_uri,
        "scope": configured.scopes,
        "state": state,
        "nonce": nonce,
        "code_challenge": oidc._challenge(verifier),
        "code_challenge_method": "S256",
        "prompt": "login",
        "max_age": "0",
    }
    separator = "&" if "?" in discovery.authorization_endpoint else "?"
    return oidc.StartedFlow(
        authorization_url=(f"{discovery.authorization_endpoint}{separator}{urlencode(parameters)}"),
        state=state,
    )


def complete(
    session: Session,
    connection_id: str,
    account: Account,
    device_session: DeviceSession,
    *,
    purpose: recent_auth.RecentAuthenticationPurpose,
    code: str,
    state: str,
) -> recent_auth.RecentAuthenticationResult:
    """Turn fresh provider authentication into a purpose grant, never a session."""
    recent_auth.ensure_context(account, device_session)
    configured = oidc.connection(connection_id)
    request = _open_request(session, configured.id, state)
    if (
        request.account_id != account.id
        or request.device_session_id != device_session.id
        or request.purpose != purpose.value
    ):
        raise _invalid_state()

    discovery = oidc.discover(configured)
    verifier = _code_verifier(state)
    response = oidc._exchange_code(
        configured,
        discovery,
        code=code,
        request=cast(
            Any,
            SimpleNamespace(
                redirect_uri=request.redirect_uri,
                code_verifier=verifier,
            ),
        ),
    )
    claims = oidc._verified_claims(
        configured,
        discovery,
        id_token=str(response.get("id_token", "")),
        nonce=_nonce(state),
    )
    if not _fresh_auth_time(claims, started_at=request.created_at):
        raise ValidationError(
            "This sign-in attempt is no longer valid.",
            oidc.OidcErrorCode.INVALID_TOKEN,
        )

    subject = str(claims["sub"])
    lock_subject(session, oidc.IDENTITY_LOCK, discovery.issuer, subject)
    identity = accounts.oidc_identity(
        session,
        issuer=discovery.issuer,
        subject=subject,
    )
    if (
        identity is None
        or identity.account_id != account.id
        or identity.connection_id != configured.id
    ):
        raise UnauthenticatedError(
            "Recent authentication failed.",
            recent_auth.RecentAuthenticationErrorCode.METHOD_UNAVAILABLE,
        )

    identity.last_used_at = now()
    rate_limit.clear(session, oidc.ACTION_OIDC_START, configured.id)
    return recent_auth.issue_grant(
        session,
        account,
        device_session,
        purpose=purpose,
        method=recent_auth.RecentAuthenticationMethod.OIDC,
    )


def prune_requests(session: Session) -> int:
    result = session.execute(
        delete(RecentAuthenticationOidcRequest).where(
            or_(
                RecentAuthenticationOidcRequest.expires_at <= now(),
                RecentAuthenticationOidcRequest.consumed_at.is_not(None),
            )
        )
    )
    return int(getattr(result, "rowcount", 0) or 0)
