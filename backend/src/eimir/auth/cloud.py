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
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from eimir.administration import service as administration
from eimir.auth import action_tokens, passkey_abuse, passwords, rate_limit, sessions
from eimir.auth.policy import (
    ensure_self_service_signup_supported,
    resolve_auth_capabilities,
    self_service_signup_supported,
)
from eimir.auth.sessions import IssuedTokens
from eimir.auth.tokens import hash_token
from eimir.config import get_settings
from eimir.core.clock import now
from eimir.core.errors import ValidationError
from eimir.i18n import DEFAULT_LOCALE, account_locale, text
from eimir.identity import service as accounts
from eimir.identity.models import (
    Account,
    AccountEmail,
)
from eimir.legal import terms
from eimir.legal.models import TermsAcceptanceOrigin
from eimir.mail import MailMessage, MailSender, MailTransportError
from eimir.relationship import invitations

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
    space_id: UUID | None = None


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


def request_magic_link(
    session: Session,
    *,
    email: str,
    mail: MailSender,
    client_host: str | None = None,
    requested_locale: str = DEFAULT_LOCALE,
) -> None:
    """Request the deployment's passwordless entry link.

    Older Cloud clients use this endpoint before an Account exists. Delegate
    both known and unknown addresses to the canonical mailbox-proof flow so
    client age cannot turn a valid request into silent non-delivery. Self-Hosted
    retains existing-account-only sign-in. Previously issued magic tokens keep
    their separate consumer and are never interpreted as signup proofs.
    """
    if self_service_signup_supported():
        request_signup(
            session,
            email=email,
            mail=mail,
            client_host=client_host,
            requested_locale=requested_locale,
        )
        return

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
            subject=text("auth.magic.subject", account_locale(account)),
            body=text(
                "auth.magic.body",
                account_locale(account),
                url=_link("auth/magic-link", issued.token),
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
    session: Session,
    *,
    email: str,
    mail: MailSender,
    client_host: str | None,
    invitation_token: str | None = None,
    accepted_terms_version: str | None = None,
    requested_locale: str = DEFAULT_LOCALE,
) -> None:
    """Start Cloud self-service onboarding by mailing a one-time proof.

    Known and unknown addresses reserve the same rate-limit slots, issue one
    proof, resolve recipient language through the same bounded lookup and hand
    one message to the transport. The empty response remains identical. Only
    the mailbox owner sees localized message text; no Account state is returned.
    Whether the proof signs into an existing Account or creates one is decided
    only when the mailbox owner redeems it.

    The administrative registration state is deliberately not consulted here
    either: rejecting unknown addresses while registration is disabled would
    reintroduce exactly the difference this request must not have. Clients read
    the public instance status instead of offering a dead entry point.

    A terms acceptance given in the signup form travels with the proof. It is
    validated against the current version here, independently of Account
    state, and recorded only if redeeming the proof creates an Account.
    """
    ensure_self_service_signup_supported()
    address = accounts.validate_email(email)
    accepted_terms_version = terms.ensure_current_version(accepted_terms_version)

    network = passkey_abuse.network_key(client_host)
    rate_limit.check(session, ACTION_SIGNUP_NETWORK, network, SIGNUP_NETWORK)
    rate_limit.record_attempt(session, ACTION_SIGNUP_NETWORK, network)
    rate_limit.check(session, ACTION_SIGNUP_REQUEST, address, rate_limit.MAGIC_LINK)
    rate_limit.record_attempt(session, ACTION_SIGNUP_REQUEST, address)

    _, issued = action_tokens.issue_signup_proof(
        session,
        address,
        invitation_token_hash=hash_token(invitation_token) if invitation_token else None,
        accepted_terms_version=accepted_terms_version,
    )
    link = _link("auth/signup", issued.token)
    recipient = session.scalar(
        select(Account).join(AccountEmail).where(AccountEmail.email == address)
    )
    locale = account_locale(recipient) if recipient is not None else requested_locale
    _deliver(
        mail,
        MailMessage(
            to=address,
            subject=text("auth.signup.subject", locale),
            body=text("auth.signup.body", locale, url=link),
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


def _signup_acceptance(
    proof_version: str | None, redemption_version: str | None
) -> tuple[str, TermsAcceptanceOrigin]:
    """Resolve the acceptance a new Account is created with, or refuse creation.

    An acceptance given while redeeming takes precedence because it is the
    most recent statement. A proof's acceptance counts only while it still
    names the current version; otherwise the person is asked again.
    """
    required = terms.required_terms_version()
    if required is not None and redemption_version == required:
        return required, TermsAcceptanceOrigin.SIGNUP_REDEMPTION
    if required is not None and proof_version == required:
        return required, TermsAcceptanceOrigin.SIGNUP_REQUEST
    raise terms.acceptance_required_error()


def _signup_account(
    session: Session,
    address: str,
    display_name: str | None,
    *,
    proof_terms_version: str | None = None,
    redemption_terms_version: str | None = None,
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

    # Existing Accounts are not blocked by these checks above; only creation is.
    administration.ensure_new_account_registration_allowed(session)
    accepted_version, origin = _signup_acceptance(proof_terms_version, redemption_terms_version)
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
    terms.record_acceptance(session, account_id=account.id, version=accepted_version, origin=origin)
    return account, True


def consume_signup(
    session: Session,
    *,
    token: str,
    client_host: str | None,
    display_name: str | None = None,
    device_name: str = "",
    platform: str = "",
    accepted_terms_version: str | None = None,
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
    - No Account and no current terms acceptance, either bound to the proof or
      given with this redemption: fail with ``TERMS_ACCEPTANCE_REQUIRED`` and
      create nothing. The proof stays redeemable, so the client can ask for the
      acceptance and redeem it again.

    A consumed, superseded, expired, or unknown proof fails with the ordinary
    invalid-token response. A proof bound to an invitation accepts it in this
    same transaction before session issuance. Failed acceptance rolls back the
    Account, proof consumption, and Membership together. An ordinary signup
    proof still leaves Space creation or acceptance as a separate step.
    """
    ensure_self_service_signup_supported()
    network = passkey_abuse.network_key(client_host)
    rate_limit.check(session, ACTION_SIGNUP_NETWORK, network, SIGNUP_NETWORK)
    rate_limit.record_attempt(session, ACTION_SIGNUP_NETWORK, network)

    accepted_terms_version = terms.ensure_current_version(accepted_terms_version)
    proof = action_tokens.consume_signup_proof(session, token)
    account, created = _signup_account(
        session,
        proof.email,
        display_name,
        proof_terms_version=proof.accepted_terms_version,
        redemption_terms_version=accepted_terms_version,
    )
    space_id = None
    if proof.invitation_token_hash is not None:
        membership = invitations.accept_by_hash(session, proof.invitation_token_hash, account)
        space_id = membership.space_id

    rate_limit.clear(session, ACTION_SIGNUP_REQUEST, proof.email)
    _, issued = sessions.start_session(session, account, device_name=device_name, platform=platform)
    session.flush()
    return SignupCompleted(
        account=account, tokens=issued, account_created=created, space_id=space_id
    )


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
            subject=text("auth.verification.subject", account_locale(account)),
            body=text(
                "auth.verification.body",
                account_locale(account),
                url=_link("auth/verify-email", issued.token),
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
            subject=text("auth.recovery.subject", account_locale(account)),
            body=text(
                "auth.recovery.body",
                account_locale(account),
                url=_link("auth/recovery", issued.token),
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
