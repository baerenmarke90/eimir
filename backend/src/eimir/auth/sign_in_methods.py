"""The sign-in methods an Account has added, and removing them safely.

A passkey or a linked external identity is an additional way in. A person must
be able to see them and take one away, for instance a lost phone. Removal is
refused when it would leave the Account with no way to sign in, because that
would lock the person out of their shared Space for good.

Removal decisions for one Account are serialized: two simultaneous removals
that each see "the other method remains" would otherwise both succeed.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir import config
from eimir.auth.policy import resolve_auth_capabilities
from eimir.core.errors import ConflictError, NotFoundError
from eimir.db.locks import lock_subject
from eimir.identity.models import (
    Account,
    AccountEmail,
    AuthIdentity,
    AuthProvider,
    WebAuthnCredential,
)

LOCK = "account_sign_in_methods"


class SignInMethodErrorCode:
    LAST_METHOD = "SIGN_IN_METHOD_LAST"
    """Removing this would leave the Account without any way to sign in."""
    NOT_FOUND = "SIGN_IN_METHOD_NOT_FOUND"


@dataclass(frozen=True)
class SignInMethods:
    passkeys: list[WebAuthnCredential]
    oidc: list[AuthIdentity]
    email_link: bool
    """Whether a mailed link can sign this Account in: a verified address and mail."""
    local_password: bool


def _passkeys(session: Session, account: Account) -> list[WebAuthnCredential]:
    return list(
        session.execute(
            select(WebAuthnCredential)
            .where(WebAuthnCredential.account_id == account.id)
            .order_by(WebAuthnCredential.created_at, WebAuthnCredential.id)
        ).scalars()
    )


def _oidc(session: Session, account: Account) -> list[AuthIdentity]:
    return list(
        session.execute(
            select(AuthIdentity)
            .where(
                AuthIdentity.account_id == account.id,
                AuthIdentity.provider == AuthProvider.OIDC.value,
            )
            .order_by(AuthIdentity.created_at, AuthIdentity.id)
        ).scalars()
    )


def _email_link(session: Session, account: Account) -> bool:
    if not resolve_auth_capabilities().magic_link:
        return False
    return (
        session.execute(
            select(AccountEmail.id).where(
                AccountEmail.account_id == account.id,
                AccountEmail.is_primary.is_(True),
                AccountEmail.verified_at.is_not(None),
            )
        ).first()
        is not None
    )


def _local_password(session: Session, account: Account) -> bool:
    if not resolve_auth_capabilities().local_password:
        return False
    return (
        session.execute(
            select(AuthIdentity.id).where(
                AuthIdentity.account_id == account.id,
                AuthIdentity.provider == AuthProvider.LOCAL_PASSWORD.value,
            )
        ).first()
        is not None
    )


def _configured(connection_id: str | None) -> bool:
    """Whether a linked provider can still be used on this instance."""
    return connection_id is not None and any(
        connection.id == connection_id for connection in config.get_settings().oidc_connections
    )


def methods(session: Session, account: Account) -> SignInMethods:
    return SignInMethods(
        passkeys=_passkeys(session, account),
        oidc=_oidc(session, account),
        email_link=_email_link(session, account),
        local_password=_local_password(session, account),
    )


def _another_way_in(
    session: Session,
    account: Account,
    *,
    without_passkey: UUID | None = None,
    without_identity: UUID | None = None,
) -> bool:
    if _email_link(session, account) or _local_password(session, account):
        return True
    if any(passkey.id != without_passkey for passkey in _passkeys(session, account)):
        return True
    return any(
        identity.id != without_identity and _configured(identity.connection_id)
        for identity in _oidc(session, account)
    )


def remove_passkey(session: Session, account: Account, passkey_id: UUID) -> None:
    lock_subject(session, LOCK, str(account.id))
    passkey = session.execute(
        select(WebAuthnCredential).where(
            WebAuthnCredential.id == passkey_id, WebAuthnCredential.account_id == account.id
        )
    ).scalar_one_or_none()
    if passkey is None:
        raise NotFoundError("This passkey does not exist.", SignInMethodErrorCode.NOT_FOUND)
    if not _another_way_in(session, account, without_passkey=passkey.id):
        raise ConflictError(
            "This is the only way to sign in to this account.", SignInMethodErrorCode.LAST_METHOD
        )
    session.delete(passkey)
    session.flush()


def remove_oidc(session: Session, account: Account, connection_id: str) -> None:
    lock_subject(session, LOCK, str(account.id))
    identity = session.execute(
        select(AuthIdentity).where(
            AuthIdentity.account_id == account.id,
            AuthIdentity.provider == AuthProvider.OIDC.value,
            AuthIdentity.connection_id == connection_id,
        )
    ).scalar_one_or_none()
    if identity is None:
        raise NotFoundError("This sign-in method is not linked.", SignInMethodErrorCode.NOT_FOUND)
    if not _another_way_in(session, account, without_identity=identity.id):
        raise ConflictError(
            "This is the only way to sign in to this account.", SignInMethodErrorCode.LAST_METHOD
        )
    session.delete(identity)
    session.flush()
