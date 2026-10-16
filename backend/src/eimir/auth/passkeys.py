"""WebAuthn passkey registration and authentication.

``py_webauthn`` performs the cryptographic work. This module answers the
questions a library cannot decide: which challenge belongs to which account,
which origin is expected, and how the signature counter is handled.

The private key remains in the authenticator. The server never sees it and
stores only credential ID, public key, and counter.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import timedelta
from typing import TYPE_CHECKING, Any, cast
from uuid import UUID

import webauthn
from sqlalchemy import delete, or_, select
from sqlalchemy.engine import Engine

if TYPE_CHECKING:
    from sqlalchemy import CursorResult
from sqlalchemy.orm import Session
from webauthn.helpers import base64url_to_bytes, options_to_json
from webauthn.helpers.exceptions import (
    InvalidAuthenticationResponse,
    InvalidRegistrationResponse,
)
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    CredentialDeviceType,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from eimir.auth import sessions
from eimir.auth.sessions import IssuedTokens
from eimir.config import get_settings
from eimir.core.clock import now
from eimir.core.errors import UnauthenticatedError, ValidationError
from eimir.identity.models import (
    Account,
    WebAuthnChallenge,
    WebAuthnCredential,
)

log = logging.getLogger(__name__)

CHALLENGE_LIFETIME = timedelta(minutes=5)
"""Maximum time a ceremony may take on the device."""

REGISTRATION = "REGISTRATION"
AUTHENTICATION = "AUTHENTICATION"

MAX_CREDENTIAL_NAME = 120


class PasskeyErrorCode:
    CEREMONY_INVALID = "PASSKEY_CEREMONY_INVALID"
    CREDENTIAL_UNKNOWN = "PASSKEY_UNKNOWN"


@dataclass(frozen=True)
class SignedIn:
    account: Account
    tokens: IssuedTokens


def _invalid() -> ValidationError:
    """Return the same response for every ceremony failure.

    Origin, RP ID, challenge, signature, and user verification are distinct
    failure reasons but intentionally disclose the same information: none.
    """
    return ValidationError(
        "This passkey ceremony is no longer valid.", PasskeyErrorCode.CEREMONY_INVALID
    )


def _issue_challenge(
    session: Session, *, purpose: str, account_id: UUID | None
) -> WebAuthnChallenge:
    entry = WebAuthnChallenge(
        purpose=purpose,
        challenge=webauthn.helpers.generate_challenge(),
        account_id=account_id,
        expires_at=now() + CHALLENGE_LIFETIME,
    )
    session.add(entry)
    session.flush()
    return entry


def _challenge_from_client_data(credential: dict[str, Any]) -> bytes:
    """Extract only the challenge from unverified WebAuthn client data.

    The value is used solely to select the exact server-issued challenge row.
    No account, credential identity, origin, RP ID, or other claim from this
    unverified payload is trusted; ``py_webauthn`` remains authoritative for
    the complete ceremony verification afterward.
    """
    try:
        response = credential["response"]
        if not isinstance(response, dict):
            raise TypeError("WebAuthn response must be an object")

        encoded_client_data = response["clientDataJSON"]
        if not isinstance(encoded_client_data, str):
            raise TypeError("clientDataJSON must be a string")

        client_data = json.loads(base64url_to_bytes(encoded_client_data))
        if not isinstance(client_data, dict):
            raise TypeError("clientDataJSON must contain an object")

        encoded_challenge = client_data["challenge"]
        if not isinstance(encoded_challenge, str):
            raise TypeError("challenge must be a string")
        challenge = base64url_to_bytes(encoded_challenge)
    except (KeyError, TypeError, ValueError) as error:
        raise _invalid() from error

    if not challenge:
        raise _invalid()
    return challenge


def _consume_challenge_row(
    session: Session,
    *,
    purpose: str,
    account_id: UUID | None,
    challenge: bytes,
) -> WebAuthnChallenge:
    """Lock and consume exactly one matching open challenge row."""
    current_time = now()
    conditions = [
        WebAuthnChallenge.purpose == purpose,
        WebAuthnChallenge.challenge == challenge,
        WebAuthnChallenge.consumed_at.is_(None),
        WebAuthnChallenge.expires_at > current_time,
    ]
    if account_id is None:
        conditions.append(WebAuthnChallenge.account_id.is_(None))
    else:
        conditions.append(WebAuthnChallenge.account_id == account_id)

    entries = (
        session.execute(select(WebAuthnChallenge).where(*conditions).with_for_update())
        .scalars()
        .all()
    )
    if len(entries) != 1:
        raise _invalid()

    entry = entries[0]
    entry.consumed_at = current_time
    session.flush()
    return entry


def _consume_challenge(
    session: Session,
    *,
    purpose: str,
    account_id: UUID | None,
    challenge: bytes,
) -> bytes:
    """Atomically consume the exact challenge presented by this ceremony.

    Production request sessions are engine-bound. There, challenge consumption
    is a short security transaction committed before cryptographic verification
    continues. A later invalid signature/origin/RP result therefore cannot roll
    the one-time challenge back into an open state. The row lock and open-row
    predicate ensure concurrent finishes for the same challenge have at most
    one winner.

    Tests that deliberately bind a Session to an already-open connection stay
    inside that test transaction so the helper does not break test isolation.
    """
    bind = session.get_bind()
    if isinstance(bind, Engine):
        # Late import mirrors the rate-limit security transaction. Tests may
        # replace get_sessionmaker, and that replacement must apply here too.
        from eimir.db import session as db_session

        security_session = db_session.get_sessionmaker()()
        try:
            entry = _consume_challenge_row(
                security_session,
                purpose=purpose,
                account_id=account_id,
                challenge=challenge,
            )
            expected_challenge = bytes(entry.challenge)
            security_session.commit()
            return expected_challenge
        except Exception:
            security_session.rollback()
            raise
        finally:
            security_session.close()

    entry = _consume_challenge_row(
        session,
        purpose=purpose,
        account_id=account_id,
        challenge=challenge,
    )
    return bytes(entry.challenge)


def start_registration(session: Session, account: Account) -> dict[str, Any]:
    """Start passkey registration for an authenticated account.

    Registration always begins from an existing session because a passkey is an
    additional authentication method for an account that already exists.
    """
    settings = get_settings()
    entry = _issue_challenge(session, purpose=REGISTRATION, account_id=account.id)

    existing = (
        session.execute(
            select(WebAuthnCredential).where(WebAuthnCredential.account_id == account.id)
        )
        .scalars()
        .all()
    )

    options = webauthn.generate_registration_options(
        rp_id=settings.relying_party_id,
        rp_name=settings.webauthn_rp_name,
        # Use the account ID rather than an address. The handle stored by an
        # authenticator must not contain contact information.
        user_id=account.id.bytes,
        user_name=account.display_name or str(account.id),
        user_display_name=account.display_name,
        challenge=entry.challenge,
        # An already registered authenticator must not create a second
        # credential for the same account.
        exclude_credentials=[
            PublicKeyCredentialDescriptor(id=credential.credential_id) for credential in existing
        ],
        # Authentication is intentionally username-less and sends no
        # allowCredentials list. A successfully registered credential must
        # therefore be discoverable so the authenticator can select it by RP ID.
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
    )
    options_json: dict[str, Any] = json.loads(options_to_json(options))
    return options_json


def finish_registration(
    session: Session, account: Account, *, credential: dict[str, Any], name: str = ""
) -> WebAuthnCredential:
    settings = get_settings()
    challenge = _challenge_from_client_data(credential)
    expected_challenge = _consume_challenge(
        session,
        purpose=REGISTRATION,
        account_id=account.id,
        challenge=challenge,
    )

    try:
        verified = webauthn.verify_registration_response(
            credential=credential,
            expected_challenge=expected_challenge,
            expected_origin=settings.relying_party_origins,
            expected_rp_id=settings.relying_party_id,
            require_user_verification=False,
        )
    except (InvalidRegistrationResponse, ValueError, KeyError) as error:
        log.info("passkey registration rejected")
        raise _invalid() from error

    if _credential_by_id(session, verified.credential_id) is not None:
        # Credential IDs are globally unique and may not exist twice, including
        # across different accounts.
        raise _invalid()

    passkey = WebAuthnCredential(
        account_id=account.id,
        credential_id=verified.credential_id,
        public_key=verified.credential_public_key,
        sign_count=verified.sign_count,
        aaguid=_aaguid(verified.aaguid),
        transports=_transports(credential),
        name=name.strip()[:MAX_CREDENTIAL_NAME],
        # The registration request requires a resident/discoverable credential.
        # WebAuthn creation fails client-side when the authenticator cannot
        # satisfy that requirement, so every successfully verified registration
        # follows the username-less authentication contract.
        is_discoverable=True,
        backup_eligible=verified.credential_device_type == CredentialDeviceType.MULTI_DEVICE,
        backup_state=bool(verified.credential_backed_up),
    )
    session.add(passkey)
    session.flush()
    return passkey


def _transports(credential: dict[str, Any]) -> list[str]:
    """Return usable transport values reported by the client."""
    reported = credential.get("transports")
    if not isinstance(reported, list):
        return []
    return [str(transport)[:32] for transport in reported if isinstance(transport, str)]


def _aaguid(value: str | None) -> UUID | None:
    if not value:
        return None
    try:
        return UUID(value)
    except ValueError:
        return None


def _credential_by_id(session: Session, credential_id: bytes) -> WebAuthnCredential | None:
    return session.execute(
        select(WebAuthnCredential).where(WebAuthnCredential.credential_id == credential_id)
    ).scalar_one_or_none()


def _credential_account_id(session: Session, credential_id: bytes) -> UUID | None:
    """Resolve only the owner ID needed to establish the authentication lock order."""
    return session.execute(
        select(WebAuthnCredential.account_id).where(
            WebAuthnCredential.credential_id == credential_id
        )
    ).scalar_one_or_none()


def _lock_authentication_credential(
    session: Session,
    credential_id: bytes,
) -> tuple[WebAuthnCredential, Account]:
    """Lock Account then credential for one authentication transition.

    Account deletion already locks the Account before removing WebAuthn
    credentials. Authentication follows the same Account -> Credential order so
    a concurrent deletion cannot deadlock with sign-counter serialization and a
    disable that wins the Account lock is observed before a new session is
    issued.
    """
    account_id = _credential_account_id(session, credential_id)
    if account_id is None:
        raise _invalid()

    account = session.execute(
        select(Account).where(Account.id == account_id).with_for_update()
    ).scalar_one_or_none()
    if account is None or not account.is_active:
        raise UnauthenticatedError("Authentication required.", PasskeyErrorCode.CREDENTIAL_UNKNOWN)

    passkey = session.execute(
        select(WebAuthnCredential)
        .where(
            WebAuthnCredential.credential_id == credential_id,
            WebAuthnCredential.account_id == account.id,
        )
        .with_for_update()
    ).scalar_one_or_none()
    if passkey is None:
        # The Account lock makes account deletion/removal serialize with this
        # transition. A missing row therefore remains the same privacy-safe
        # unknown-credential ceremony failure.
        raise _invalid()

    return passkey, account


def start_authentication(session: Session) -> dict[str, Any]:
    """Start passkey authentication without account enumeration.

    No account is selected up front. The authenticator chooses which
    discoverable credential to offer. An endpoint that listed credentials for
    an address would become an account directory.
    """
    settings = get_settings()
    entry = _issue_challenge(session, purpose=AUTHENTICATION, account_id=None)
    options = webauthn.generate_authentication_options(
        rp_id=settings.relying_party_id,
        challenge=entry.challenge,
        user_verification=UserVerificationRequirement.PREFERRED,
    )
    options_json: dict[str, Any] = json.loads(options_to_json(options))
    return options_json


def finish_authentication(
    session: Session,
    *,
    credential: dict[str, Any],
    device_name: str = "",
    platform: str = "",
) -> SignedIn:
    settings = get_settings()
    challenge = _challenge_from_client_data(credential)
    expected_challenge = _consume_challenge(
        session,
        purpose=AUTHENTICATION,
        account_id=None,
        challenge=challenge,
    )

    try:
        raw_id = base64url_to_bytes(str(credential["rawId"]))
    except (KeyError, ValueError, TypeError) as error:
        raise _invalid() from error

    # Locking begins before verification so the sign counter supplied to
    # py_webauthn is authoritative for this transaction. The locks remain held
    # through metadata update and session creation until the request commits.
    passkey, account = _lock_authentication_credential(session, raw_id)

    try:
        verified = webauthn.verify_authentication_response(
            credential=credential,
            expected_challenge=expected_challenge,
            expected_rp_id=settings.relying_party_id,
            expected_origin=settings.relying_party_origins,
            credential_public_key=passkey.public_key,
            credential_current_sign_count=passkey.sign_count,
            require_user_verification=False,
        )
    except (InvalidAuthenticationResponse, ValueError, KeyError) as error:
        log.info("passkey authentication rejected")
        raise _invalid() from error

    # The library verifies the signature counter above. A counter that does not
    # advance is rejected when the authenticator uses counters, which can signal
    # a cloned authenticator. Devices that do not count keep both values at zero
    # and remain valid; many passkeys behave that way.
    passkey.sign_count = verified.new_sign_count
    passkey.last_used_at = now()
    # Authentication has no allow-list, so successful credential selection also
    # confirms the discoverable registration contract at runtime.
    passkey.is_discoverable = True
    passkey.backup_state = bool(getattr(verified, "credential_backed_up", passkey.backup_state))

    _, issued = sessions.start_session(session, account, device_name=device_name, platform=platform)
    session.flush()
    return SignedIn(account=account, tokens=issued)


def prune_challenges(session: Session) -> int:
    """Remove expired and consumed challenges for the maintenance job."""
    result = cast(
        "CursorResult[Any]",
        session.execute(
            delete(WebAuthnChallenge).where(
                or_(
                    WebAuthnChallenge.expires_at < now(),
                    WebAuthnChallenge.consumed_at.is_not(None),
                )
            )
        ),
    )
    return int(result.rowcount or 0)
