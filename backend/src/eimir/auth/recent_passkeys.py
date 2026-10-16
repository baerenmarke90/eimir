"""WebAuthn adapter for session-bound recent authentication.

Normal passkey sign-in keeps using ``auth.passkeys`` unchanged. Step-up owns a
separate challenge table, while reusing the same WebAuthn verification,
credential locking, relying-party configuration, and signature-counter rules.
"""

from __future__ import annotations

import json
import logging
from datetime import timedelta
from typing import Any, cast

import webauthn
from sqlalchemy import delete, or_, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session
from webauthn.helpers import base64url_to_bytes, options_to_json
from webauthn.helpers.exceptions import InvalidAuthenticationResponse
from webauthn.helpers.structs import (
    PublicKeyCredentialDescriptor,
    UserVerificationRequirement,
)

from eimir.auth import passkeys, recent_auth
from eimir.auth.recent_auth_models import RecentAuthenticationWebAuthnChallenge
from eimir.config import get_settings
from eimir.core.clock import now
from eimir.core.errors import ForbiddenError
from eimir.identity.models import Account, DeviceSession, WebAuthnCredential

log = logging.getLogger(__name__)

CHALLENGE_LIFETIME = timedelta(minutes=5)


def _unavailable() -> ForbiddenError:
    return ForbiddenError(
        "Passkey recent authentication is not available for this Account.",
        recent_auth.RecentAuthenticationErrorCode.METHOD_UNAVAILABLE,
    )


def _consume_row(
    session: Session,
    account: Account,
    device_session: DeviceSession,
    purpose: recent_auth.RecentAuthenticationPurpose,
    challenge: bytes,
) -> bytes:
    current_time = now()
    rows = (
        session.execute(
            select(RecentAuthenticationWebAuthnChallenge)
            .where(
                RecentAuthenticationWebAuthnChallenge.account_id == account.id,
                RecentAuthenticationWebAuthnChallenge.device_session_id == device_session.id,
                RecentAuthenticationWebAuthnChallenge.purpose == purpose.value,
                RecentAuthenticationWebAuthnChallenge.challenge == challenge,
                RecentAuthenticationWebAuthnChallenge.consumed_at.is_(None),
                RecentAuthenticationWebAuthnChallenge.expires_at > current_time,
            )
            .with_for_update()
        )
        .scalars()
        .all()
    )
    if len(rows) != 1:
        raise passkeys._invalid()
    row = rows[0]
    row.consumed_at = current_time
    session.flush()
    return bytes(row.challenge)


def _consume_challenge(
    session: Session,
    account: Account,
    device_session: DeviceSession,
    purpose: recent_auth.RecentAuthenticationPurpose,
    challenge: bytes,
) -> bytes:
    """Consume before cryptographic verification so invalid assertions cannot replay."""
    bind = session.get_bind()
    if isinstance(bind, Engine):
        from eimir.db import session as db_session

        security_session = db_session.get_sessionmaker()()
        try:
            expected = _consume_row(
                security_session,
                account,
                device_session,
                purpose,
                challenge,
            )
            security_session.commit()
            return expected
        except Exception:
            security_session.rollback()
            raise
        finally:
            security_session.close()

    return _consume_row(session, account, device_session, purpose, challenge)


def start(
    session: Session,
    account: Account,
    device_session: DeviceSession,
    *,
    purpose: recent_auth.RecentAuthenticationPurpose,
) -> dict[str, Any]:
    """Start a user-verifying assertion bound to Account, session, and purpose."""
    recent_auth.ensure_context(account, device_session)
    credentials = (
        session.execute(
            select(WebAuthnCredential).where(WebAuthnCredential.account_id == account.id)
        )
        .scalars()
        .all()
    )
    if not credentials:
        raise _unavailable()

    challenge = webauthn.helpers.generate_challenge()
    session.add(
        RecentAuthenticationWebAuthnChallenge(
            account_id=account.id,
            device_session_id=device_session.id,
            purpose=purpose.value,
            challenge=challenge,
            expires_at=now() + CHALLENGE_LIFETIME,
        )
    )
    session.flush()

    options = webauthn.generate_authentication_options(
        rp_id=get_settings().relying_party_id,
        challenge=challenge,
        allow_credentials=[
            PublicKeyCredentialDescriptor(id=credential.credential_id) for credential in credentials
        ],
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    return cast(dict[str, Any], json.loads(options_to_json(options)))


def finish(
    session: Session,
    account: Account,
    device_session: DeviceSession,
    *,
    purpose: recent_auth.RecentAuthenticationPurpose,
    credential: dict[str, Any],
) -> recent_auth.RecentAuthenticationResult:
    """Verify a step-up assertion without creating a new eimir. session."""
    recent_auth.ensure_context(account, device_session)
    challenge = passkeys._challenge_from_client_data(credential)
    expected_challenge = _consume_challenge(
        session,
        account,
        device_session,
        purpose,
        challenge,
    )

    try:
        raw_id = base64url_to_bytes(str(credential["rawId"]))
    except (KeyError, TypeError, ValueError) as error:
        raise passkeys._invalid() from error

    stored, locked_account = passkeys._lock_authentication_credential(session, raw_id)
    if locked_account.id != account.id:
        raise passkeys._invalid()

    settings = get_settings()
    try:
        verified = webauthn.verify_authentication_response(
            credential=credential,
            expected_challenge=expected_challenge,
            expected_rp_id=settings.relying_party_id,
            expected_origin=settings.relying_party_origins,
            credential_public_key=stored.public_key,
            credential_current_sign_count=stored.sign_count,
            require_user_verification=True,
        )
    except (InvalidAuthenticationResponse, KeyError, ValueError) as error:
        log.info("passkey recent authentication rejected")
        raise passkeys._invalid() from error

    stored.sign_count = verified.new_sign_count
    stored.last_used_at = now()
    stored.backup_state = bool(getattr(verified, "credential_backed_up", stored.backup_state))
    session.flush()
    return recent_auth.issue_grant(
        session,
        locked_account,
        device_session,
        purpose=purpose,
        method=recent_auth.RecentAuthenticationMethod.PASSKEY,
    )


def prune_challenges(session: Session) -> int:
    result = session.execute(
        delete(RecentAuthenticationWebAuthnChallenge).where(
            or_(
                RecentAuthenticationWebAuthnChallenge.expires_at <= now(),
                RecentAuthenticationWebAuthnChallenge.consumed_at.is_not(None),
            )
        )
    )
    return int(getattr(result, "rowcount", 0) or 0)
