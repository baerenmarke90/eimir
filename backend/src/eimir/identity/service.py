"""Accounts and their addresses."""

from __future__ import annotations

import unicodedata

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from eimir.core.clock import now
from eimir.core.errors import ConflictError, ValidationError
from eimir.identity.models import (
    Account,
    AccountEmail,
    AuthIdentity,
    AuthProvider,
    WebAuthnCredential,
)

MAX_DISPLAY_NAME = 120

FALLBACK_DISPLAY_NAME = "Partner"
"""Neutral presentation name for an onboarding path that has no usable name yet."""


class AccountErrorCode:
    EMAIL_INVALID = "EMAIL_INVALID"
    EMAIL_TAKEN = "EMAIL_ALREADY_REGISTERED"
    DISPLAY_NAME_REQUIRED = "DISPLAY_NAME_REQUIRED"
    DISPLAY_NAME_TOO_LONG = "DISPLAY_NAME_TOO_LONG"
    OIDC_IDENTITY_INVALID = "OIDC_IDENTITY_INVALID"
    PASSKEY_INVALID = "PASSKEY_INVALID"


def _has_visible_display_character(value: str) -> bool:
    """Return whether a name contains something other than whitespace/control data.

    Unicode format characters such as a zero-width joiner may legitimately
    occur inside emoji/name sequences, so they are not rejected wholesale.
    They simply cannot be the only content of a display name.
    """
    return any(
        not character.isspace() and not unicodedata.category(character).startswith("C")
        for character in value
    )


def normalize_display_name(display_name: str) -> str:
    """Normalize and validate the account's presentation identity.

    Display names are presentation data only: this function does not touch an
    email address, authentication subject, account ID, credential, or session.
    Trimming happens once here so registration and later profile edits cannot
    gradually acquire different rules.
    """
    name = (display_name or "").strip()
    if not name or not _has_visible_display_character(name):
        raise ValidationError("A display name is required.", AccountErrorCode.DISPLAY_NAME_REQUIRED)
    if len(name) > MAX_DISPLAY_NAME:
        raise ValidationError(
            f"A display name may contain at most {MAX_DISPLAY_NAME} characters.",
            AccountErrorCode.DISPLAY_NAME_TOO_LONG,
        )
    return name


def normalize_email(email: str) -> str:
    """Return an address lowercased and stripped of surrounding whitespace.

    Otherwise "A@b.de" and "a@b.de " would be two different addresses and
    uniqueness would have a gap. A database check constraint provides an
    additional guard.
    """
    return (email or "").strip().lower()


def validate_email(email: str) -> str:
    """Apply deliberately coarse email validation.

    Only delivery can establish whether an address really exists. In
    practice, strict pattern matching mostly rejects valid edge cases.
    """
    normalized = normalize_email(email)
    local_part, at, domain = normalized.partition("@")
    if not at or not local_part or "." not in domain or domain.startswith("."):
        raise ValidationError("Enter a valid email address.", AccountErrorCode.EMAIL_INVALID)
    if len(normalized) > 320:
        raise ValidationError("Enter a valid email address.", AccountErrorCode.EMAIL_INVALID)
    return normalized


def find_by_email(session: Session, email: str) -> Account | None:
    return session.execute(
        select(Account)
        .join(AccountEmail, AccountEmail.account_id == Account.id)
        .where(AccountEmail.email == normalize_email(email))
    ).scalar_one_or_none()


def account_count(session: Session) -> int:
    return session.execute(select(func.count()).select_from(Account)).scalar_one()


def create_account(
    session: Session, *, display_name: str, email: str, password_hash: str
) -> Account:
    """Create an account with local authentication."""
    name = normalize_display_name(display_name)

    email_address = validate_email(email)
    if find_by_email(session, email_address) is not None:
        raise ConflictError(
            "This email address is already registered.", AccountErrorCode.EMAIL_TAKEN
        )

    # The check above only rules out an address already committed at read
    # time. A concurrent registration for the same address can still commit
    # between that check and this flush; the savepoint turns the resulting
    # unique violation (`uq_account_emails_email` or the non-OIDC identity
    # index) back into the documented conflict instead of an unhandled 500,
    # mirroring `auth.cloud._signup_account`'s handling of the same race.
    try:
        with session.begin_nested():
            account = Account(display_name=name)
            session.add(account)
            session.flush()

            session.add(AccountEmail(account_id=account.id, email=email_address, is_primary=True))
            session.add(
                AuthIdentity(
                    account_id=account.id,
                    provider=AuthProvider.LOCAL_PASSWORD.value,
                    subject=email_address,
                    secret_hash=password_hash,
                )
            )
            session.flush()
    except IntegrityError as error:
        raise ConflictError(
            "This email address is already registered.", AccountErrorCode.EMAIL_TAKEN
        ) from error

    return account


def create_oidc_account(
    session: Session,
    *,
    display_name: str,
    verified_email: str | None = None,
) -> Account:
    """Create an account for an already verified OIDC onboarding flow.

    OIDC needs neither a local password nor a local AuthIdentity. An email
    address is only additional, optional profile data. It is discarded if the
    claim is unusable or the address is already assigned. In particular, it
    is never used to find and take over an existing account.
    """
    try:
        name = normalize_display_name(display_name)
    except ValidationError:
        # An external presentation claim must not make a verified OIDC identity
        # unusable. Invalid provider display data receives the existing neutral
        # fallback and can later be edited through the profile contract.
        name = FALLBACK_DISPLAY_NAME
    account = Account(display_name=name)
    session.add(account)
    session.flush()

    if verified_email:
        try:
            email_address = validate_email(verified_email)
        except ValidationError:
            email_address = ""
        if email_address and find_by_email(session, email_address) is None:
            # As above: the read-time check cannot see an address committed by
            # a concurrent registration or a different OIDC onboarding claiming
            # the same verified address between the check and this flush. Per
            # the docstring, a taken address is discarded here rather than
            # failing account creation, so the conflict is swallowed instead
            # of re-raised.
            try:
                with session.begin_nested():
                    session.add(
                        AccountEmail(
                            account_id=account.id,
                            email=email_address,
                            verified_at=now(),
                            is_primary=True,
                        )
                    )
                    session.flush()
            except IntegrityError:
                pass

    return account


def create_verified_email_account(
    session: Session,
    *,
    email: str,
    display_name: str | None = None,
) -> Account:
    """Create an Account whose only identity is an already verified address.

    The caller must already have proven control of ``email`` and must have
    serialized its own decision that no Account owns the address. The unique
    address constraint stays the final guard: a creation that committed through
    a different path makes this flush fail instead of producing a second owner.

    A name the person typed is validated like any other display name. When none
    is supplied, the neutral fallback is used and the person can change it later
    through the profile contract; the address is never turned into a name,
    because the name is visible to a future partner.
    """
    if display_name is None or not display_name.strip():
        name = FALLBACK_DISPLAY_NAME
    else:
        name = normalize_display_name(display_name)
    address = validate_email(email)

    account = Account(display_name=name)
    session.add(account)
    session.flush()

    session.add(
        AccountEmail(
            account_id=account.id,
            email=address,
            verified_at=now(),
            is_primary=True,
        )
    )
    session.flush()
    return account


def update_display_name(session: Session, account: Account, display_name: str) -> Account:
    """Change only the account's presentation name.

    Authentication identities, addresses, credentials, and sessions are
    deliberately not consulted or mutated here.
    """
    account.display_name = normalize_display_name(display_name)
    session.flush()
    return account


def local_identity(session: Session, account: Account) -> AuthIdentity | None:
    return session.execute(
        select(AuthIdentity).where(
            AuthIdentity.account_id == account.id,
            AuthIdentity.provider == AuthProvider.LOCAL_PASSWORD.value,
        )
    ).scalar_one_or_none()


def oidc_identity(session: Session, *, issuer: str, subject: str) -> AuthIdentity | None:
    """Find an OIDC identity by the issuer/subject pair defined by the standard."""
    return session.execute(
        select(AuthIdentity).where(
            AuthIdentity.provider == AuthProvider.OIDC.value,
            AuthIdentity.issuer == issuer.strip(),
            AuthIdentity.subject == subject,
        )
    ).scalar_one_or_none()


def add_oidc_identity(
    session: Session,
    account: Account,
    *,
    issuer: str,
    subject: str,
    connection_id: str,
) -> AuthIdentity:
    """Persist a verified external identity together with its connection.

    This function does not verify an OIDC token. The calling adapter may use
    it only after discovery, signature verification, and claim validation.
    """
    issuer_value = issuer.strip()
    connection_value = connection_id.strip()
    if not issuer_value or not subject.strip() or not connection_value:
        raise ValidationError(
            "Issuer, subject and connection ID are required.",
            AccountErrorCode.OIDC_IDENTITY_INVALID,
        )
    if len(issuer_value) > 512 or len(subject) > 512 or len(connection_value) > 128:
        raise ValidationError(
            "OIDC identity metadata is too long.", AccountErrorCode.OIDC_IDENTITY_INVALID
        )

    identity = AuthIdentity(
        account_id=account.id,
        provider=AuthProvider.OIDC.value,
        issuer=issuer_value,
        subject=subject,
        connection_id=connection_value,
    )
    session.add(identity)
    session.flush()
    return identity


def store_webauthn_credential(
    session: Session,
    account: Account,
    *,
    credential_id: bytes,
    public_key: bytes,
    sign_count: int = 0,
    transports: list[str] | None = None,
    name: str = "",
    is_discoverable: bool = True,
    backup_eligible: bool = False,
    backup_state: bool = False,
) -> WebAuthnCredential:
    """Persist the result of an already verified registration ceremony."""
    if not credential_id or not public_key or sign_count < 0:
        raise ValidationError(
            "Credential ID, public key and a valid sign count are required.",
            AccountErrorCode.PASSKEY_INVALID,
        )
    credential = WebAuthnCredential(
        account_id=account.id,
        credential_id=credential_id,
        public_key=public_key,
        sign_count=sign_count,
        transports=list(transports or []),
        name=name.strip()[:120],
        is_discoverable=is_discoverable,
        backup_eligible=backup_eligible,
        backup_state=backup_state,
    )
    session.add(credential)
    session.flush()
    return credential


def webauthn_credential(session: Session, credential_id: bytes) -> WebAuthnCredential | None:
    return session.execute(
        select(WebAuthnCredential).where(WebAuthnCredential.credential_id == credential_id)
    ).scalar_one_or_none()
