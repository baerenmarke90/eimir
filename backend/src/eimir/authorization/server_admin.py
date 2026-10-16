"""Instance-wide ServerAdmin authorization.

Server administration is deliberately separate from Space membership. An
operator grants the capability through ``EIMIR_SERVER_ADMIN_EMAILS`` and the
runtime matches that allowlist only against verified AccountEmail rows.
"""

from __future__ import annotations

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from eimir.config import get_settings
from eimir.core.errors import ForbiddenError
from eimir.identity.models import Account, AccountEmail


class ServerAdminErrorCode:
    REQUIRED = "SERVER_ADMIN_REQUIRED"


def is_server_admin(session: Session, account: Account) -> bool:
    """Return whether the account matches the operator-managed allowlist."""
    allowed = get_settings().server_admin_emails
    if not allowed:
        return False

    statement = select(
        exists().where(
            AccountEmail.account_id == account.id,
            AccountEmail.verified_at.is_not(None),
            AccountEmail.email.in_(allowed),
        )
    )
    return bool(session.execute(statement).scalar_one())


def require_server_admin(session: Session, account: Account) -> Account:
    """Fail closed unless the authenticated account is a ServerAdmin."""
    if not is_server_admin(session, account):
        raise ForbiddenError(
            "ServerAdmin capability is required.",
            ServerAdminErrorCode.REQUIRED,
        )
    return account
