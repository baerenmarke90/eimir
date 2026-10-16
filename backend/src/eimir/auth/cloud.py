"""Passwordless sign-in, self-service signup, address verification, and recovery.

Four flows that look similar but deliberately remain separate: each has its
own table, lifetime, and endpoint. A token from one cannot be accepted by
another because that other flow never looks it up.

Externally the request paths remain terse. A caller who submits an address must
not learn whether it exists; otherwise the request endpoint would be a simple
account-enumeration oracle.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import timedelta
from urllib.parse import quote

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from eimir.administration import service as administration
from eimir.auth import action_tokens, passkey_abuse, passwords, rate_limit, sessions
from eimir.auth.policy import ensure_self_service_signup_supported, resolve_auth_capabilities
from eimir.auth.sessions import IssuedTokens
from eimir.config import get_settings
from eimir.core.clock import now
from eimir.core.errors import ValidationError
from eimir.identity import service as accounts
from eimir.identity.models import (
    Account,
    AccountEmail,
)
from eimir.mail import MailMessage, MailSender, MailTransportError

log = logging.getLogger(__name__)

ACTION_MAGIC_LINK = "magic_link"
ACTION_EMAIL_VERIFICATION = "email_verification"
ACTION_RECOVERY = "account_recovery"
ACTION_SIGNUP_REQUEST = "signup_request"
ACTION_SIGNUP_NETWORK = "signup_network"

SIGNUP_NETWORK = rate_limit.Limit(attempts=30, window=timedelta(minutes=15))
"""Per-network budget for anonymous signup requests and redemptions.

The per-address limit alone cannot stop one client from spraying proofs at many
different addresses, because every address has its own budget. The network key
is resolved exactly like the passkey start limit, so it inherits the same
trusted-proxy configuration instead of parsing forwarded headers here.
"""


@dataclass(frozen=True)
class SignedIn:
    account: Account
    tokens: IssuedTokens


@dataclass(frozen=True)
class SignupCompleted:
    account: Account
    tokens: IssuedTokens
    account_created: bool
    """Whether this redemption created the Account.

    Only the holder of the mailed proof learns it, and that person controls the
    address anyway, so it discloses nothing an enumeration attempt could use.
    """


def _link(path: str, token: str) -> str:
    """Build the address placed into authentication mail.

    The base comes from configuration rather than a request header. Otherwise a
    forged Host header could redirect the link to an attacker-controlled server
    and cause the recipient to hand over the token there.
    """
    base = get_settings().public_base_url.rstrip("/")
    return f"{base}/{path.lstrip('/')}?token={quote(token)}"


def _deliver(mail: MailSender, message: MailMessage) -> None:
    """Deliver mail without turning transport failure into an oracle.

    A mail-server failure must not change the response, because that could make
    known and unknown addresses distinguishable. Log the transport failure
    without message content or tokens.
    """
    try:
        mail.send(message)
    except MailTransportError:
        log.warning("could not deliver auth mail")


def _primary_email(session: Session, address: str) -> AccountEmail | None:
    return session.execute(
        select(AccountEmail).where(AccountEmail.email == address)
    ).scalar_one_or_none()


def request_magic_link(session: Session, *, email: str, mail: MailSender) -> None:
    """Request a passwordless sign-in link.

    The response never reveals whether mail was created.
    """
    address = accounts.normalize_email(email)
    rate_limit.check(session, ACTION_MAGIC_LINK, address, rate_limit.MAGIC_LINK)
    rate_limit.record_attempt(session, ACTION_MAGIC_LINK, address)

    email_record = _primary_email(session, address)
    if email_record is None:
        return
    account = session.get(Account, email_record.account_id)
    if account is None or not account.is_active:
        return

    # Supersession of older open links happens inside the issuing function,
    # under the subject lock that also covers reading them. Revoking here would
    # be the unserialized version of the same step.
    _, issued = action_tokens.issue_magic_link(session, email_record.id)
    _deliver(
        mail,
        MailMessage(
            to=address,
            subject="Dein Anmeldelink fuer eimir.",
            body=(
                "Hier ist dein Anmeldelink:\n\n"
                f"{_link('auth/magic-link', issued.token)}\n\n"
                "Er gilt 15 Minuten und genau einmal.\n\n"
                "Wenn du ihn nicht angefordert hast, kannst du diese "
                "Nachricht ignorieren."
            ),
        ),
    )


def consume_magic_link(
    session: Session, *, token: str, device_name: str = "", platform: str = ""
) -> SignedIn:
    """Consume a sign-in link.

    A consumed link also proves that the recipient controls the address, so it
    becomes verified. A separate verification step would create another place
    where that fact could be forgotten.
    """
    model = action_tokens.consume_magic_link(session, token)
    email_record = session.get(AccountEmail, model.account_email_id)
    account = session.get(Account, email_record.account_id) if email_record is not None else None
    if email_record is None or account is None or not account.is_active:
        raise ValidationError(
            "This authentication token is no longer valid.",
            action_tokens.ActionTokenErrorCode.INVALID,
        )

    if email_record.verified_at is None:
        email_record.verified_at = now()

    rate_limit.clear(session, ACTION_MAGIC_LINK, email_record.email)
    _, issued = sessions.start_session(session, account, device_name=device_name, platform=platform)
    session.flush()
    return SignedIn(account=account, tokens=issued)


def request_signup(
    session: Session, *, email: str, mail: MailSender, client_host: str | None
) -> None:
    """Start Cloud self-service onboarding by mailing a one-time proof.

    The request never looks at Account state. A known and an unknown address
    take the same path, reserve the same rate-limit slots, issue one proof, and
    hand one message to the transport, so neither the response nor the work
    done differs. Whether the proof signs into an existing Account or creates
    one is decided only when the mailbox owner redeems it.

    The administrative registration state is deliberately not consulted here
    either: rejecting unknown addresses while registration is disabled would
    reintroduce exactly the difference this request must not have. Clients read
    the public instance status instead of offering a dead entry point.
    """
    ensure_self_service_signup_supported()
    address = accounts.validate_email(email)

    network = passkey_abuse.network_key(client_host)
    rate_limit.check(session, ACTION_SIGNUP_NETWORK, network, SIGNUP_NETWORK)
    rate_limit.record_attempt(session, ACTION_SIGNUP_NETWORK, network)
    rate_limit.check(session, ACTION_SIGNUP_REQUEST, address, rate_limit.MAGIC_LINK)
    rate_limit.record_attempt(session, ACTION_SIGNUP_REQUEST, address)

    _, issued = action_tokens.issue_signup_proof(session, address)
    _deliver(
        mail,
        MailMessage(
            to=address,
            subject="Dein Link fuer eimir.",
            body=(
                "Mit diesem Link geht es bei eimir. weiter:\n\n"
                f"{_link('auth/signup', issued.token)}\n\n"
                "Er gilt 15 Minuten und genau einmal.\n\n"
                "Wenn du ihn nicht angefordert hast, kannst du diese "
                "Nachricht ignorieren. Ohne den Link passiert nichts."
            ),
        ),
    )


def _invalid_proof() -> ValidationError:
    return ValidationError(
        "This authentication token is no longer valid.",
        action_tokens.ActionTokenErrorCode.INVALID,
    )


def _owner_signing_in(session: Session, email_record: AccountEmail) -> Account:
    """Resolve the Account a verified address belongs to, like a magic link would."""
    account = session.get(Account, email_record.account_id)
    if account is None or not account.is_active:
        raise _invalid_proof()
    if email_record.verified_at is None:
        email_record.verified_at = now()
    return account


def _signup_account(
    session: Session, address: str, display_name: str | None
) -> tuple[Account, bool]:
    """Decide between signing in and creating, for an address just proven.

    Every redemption for the address already holds the signup generation lock,
    so two redemptions cannot both observe "no Account". The remaining window is
    a different creation path, such as OIDC onboarding with a verified email
    claim, committing the same address after the lookup. The savepoint turns the
    resulting unique violation back into a decision: the address now has an
    owner, and the proof signs into it rather than failing or creating a second
    Account.
    """
    existing = _primary_email(session, address)
    if existing is not None:
        return _owner_signing_in(session, existing), False

    # Existing Accounts are not blocked by this check above; only creation is.
    administration.ensure_new_account_registration_allowed(session)
    try:
        with session.begin_nested():
            account = accounts.create_verified_email_account(
                session, email=address, display_name=display_name
            )
    except IntegrityError:
        converged = _primary_email(session, address)
        if converged is None:
            raise
        return _owner_signing_in(session, converged), False
    return account, True


def consume_signup(
    session: Session,
    *,
    token: str,
    client_host: str | None,
    display_name: str | None = None,
    device_name: str = "",
    platform: str = "",
) -> SignupCompleted:
    """Redeem a signup proof into a normal session.

    - The address has an active Account: sign into it and mark the address
      verified, exactly as a magic link does. Registration state is irrelevant.
    - No Account and new Accounts are admitted: create one bound to the verified
      address, then sign in.
    - No Account and registration disabled or maintenance active: fail with the
      authoritative administration error and create nothing. The transaction
      rolls back, so the proof stays redeemable once onboarding reopens within
      its lifetime.

    A consumed, superseded, expired, or unknown proof fails with the ordinary
    invalid-token response. Membership is not touched: a new Account has none,
    and Space creation or invitation acceptance are separate authorized steps.
    """
    ensure_self_service_signup_supported()
    network = passkey_abuse.network_key(client_host)
    rate_limit.check(session, ACTION_SIGNUP_NETWORK, network, SIGNUP_NETWORK)
    rate_limit.record_attempt(session, ACTION_SIGNUP_NETWORK, network)

    proof = action_tokens.consume_signup_proof(session, token)
    account, created = _signup_account(session, proof.email, display_name)

    rate_limit.clear(session, ACTION_SIGNUP_REQUEST, proof.email)
    _, issued = sessions.start_session(session, account, device_name=device_name, platform=platform)
    session.flush()
    return SignupCompleted(account=account, tokens=issued, account_created=created)


def request_email_verification(session: Session, account: Account, *, mail: MailSender) -> None:
    """Request verification of the account's own address.

    Unlike the other two flows, this requires an existing authenticated account
    and therefore reveals nothing the caller does not already know.
    """
    email_record = session.execute(
        select(AccountEmail).where(
            AccountEmail.account_id == account.id,
            AccountEmail.is_primary.is_(True),
        )
    ).scalar_one_or_none()
    if email_record is None or email_record.verified_at is not None:
        return

    rate_limit.check(session, ACTION_EMAIL_VERIFICATION, email_record.email, rate_limit.MAGIC_LINK)
    rate_limit.record_attempt(session, ACTION_EMAIL_VERIFICATION, email_record.email)

    _, issued = action_tokens.issue_email_verification(session, email_record.id)
    _deliver(
        mail,
        MailMessage(
            to=email_record.email,
            subject="Bestaetige deine E-Mail-Adresse",
            body=(
                "Bitte bestaetige deine Adresse:\n\n"
                f"{_link('auth/verify-email', issued.token)}\n\n"
                "Der Link gilt 24 Stunden und genau einmal."
            ),
        ),
    )


def confirm_email(session: Session, *, token: str) -> AccountEmail:
    """Mark the address as verified.

    This deliberately requires no session because the link is often opened in a
    different program from the one holding the sign-in session.
    """
    model = action_tokens.consume_email_verification(session, token)
    email_record = session.get(AccountEmail, model.account_email_id)
    if email_record is None:
        raise ValidationError(
            "This authentication token is no longer valid.",
            action_tokens.ActionTokenErrorCode.INVALID,
        )
    if email_record.verified_at is None:
        email_record.verified_at = now()
    session.flush()
    return email_record


def request_recovery(session: Session, *, email: str, mail: MailSender) -> None:
    """Request password recovery.

    Only accounts that already have a local password are eligible. An account
    that signs in exclusively through an external provider must not silently
    gain an additional authentication method here.
    """
    resolve_auth_capabilities().ensure_local_password_allowed()
    address = accounts.normalize_email(email)
    rate_limit.check(session, ACTION_RECOVERY, address, rate_limit.MAGIC_LINK)
    rate_limit.record_attempt(session, ACTION_RECOVERY, address)

    email_record = _primary_email(session, address)
    account = session.get(Account, email_record.account_id) if email_record is not None else None
    if account is None or not account.is_active:
        return
    if accounts.local_identity(session, account) is None:
        return

    _, issued = action_tokens.issue_account_recovery(session, account.id)
    _deliver(
        mail,
        MailMessage(
            to=address,
            subject="Passwort zuruecksetzen",
            body=(
                "Mit diesem Link kannst du ein neues Passwort setzen:\n\n"
                f"{_link('auth/recovery', issued.token)}\n\n"
                "Er gilt 30 Minuten und genau einmal. Danach sind alle "
                "angemeldeten Geraete abgemeldet.\n\n"
                "Wenn du ihn nicht angefordert hast, aendert sich nichts."
            ),
        ),
    )


def consume_recovery(
    session: Session,
    *,
    token: str,
    new_password: str,
    device_name: str = "",
    platform: str = "",
) -> SignedIn:
    """Set a new password and revoke all sessions.

    Password recovery commonly follows suspected unauthorized access. Every old
    session is therefore revoked and exactly one new session begins on the
    current device.
    """
    resolve_auth_capabilities().ensure_local_password_allowed()
    passwords.validate(new_password)

    model = action_tokens.consume_account_recovery(session, token)
    account = session.get(Account, model.account_id)
    identity = accounts.local_identity(session, account) if account is not None else None
    if account is None or not account.is_active or identity is None:
        raise ValidationError(
            "This authentication token is no longer valid.",
            action_tokens.ActionTokenErrorCode.INVALID,
        )

    identity.secret_hash = passwords.hash_password(new_password)
    sessions.revoke_all(session, account)

    _, issued = sessions.start_session(session, account, device_name=device_name, platform=platform)
    session.flush()
    return SignedIn(account=account, tokens=issued)
