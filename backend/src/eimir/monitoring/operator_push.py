"""App push for ServerAdmins: operator notices (#2314 part 2b).

An operator notice is a Notification of kind ``OPERATOR_ALERT`` that belongs to
no Space. It names one alert topic, never names, addresses, ids or report
text. It is invisible in every couple's Notification Center and exists for the
push pipeline and its tap: the open call resolves it to a ServerAdmin page.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, cast
from uuid import UUID

from sqlalchemy import CursorResult, delete, func, select
from sqlalchemy.orm import Session

from eimir.authorization.server_admin import is_server_admin
from eimir.config import Settings
from eimir.core.ids import new_id
from eimir.engagement import push
from eimir.engagement.models import OPERATOR_TOPICS, Notification, NotificationKind
from eimir.identity.models import Account, AccountEmail

LIFETIME = timedelta(hours=24)
# Expired notices are kept a little longer, so a late tap still opens its page.
KEEP_EXPIRED = timedelta(days=1)

_ROUTES = {
    "failed_jobs": "/server-admin?section=jobs",
    "support_reports": "/server-admin?section=reports&state=NEW",
    # The Situation page names the Spaces near their quota.
    "space_quota_pressure": "/server-admin?section=overview",
}
_DEFAULT_ROUTE = "/server-admin?section=monitoring"


@dataclass(frozen=True)
class Recipient:
    account_id: UUID
    email: str
    locale: str


def route(topic: str) -> str:
    """The ServerAdmin page a tapped notice about ``topic`` opens; never an id."""
    return _ROUTES.get(topic, _DEFAULT_ROUTE)


def recipients(session: Session, settings: Settings) -> list[Recipient]:
    """Enabled Accounts with a verified address on the ServerAdmin allow-list.

    One entry per address: an Account with two allow-listed addresses gets both
    mails but, through :func:`notify`, one push.
    """
    allowed = [email.lower() for email in settings.server_admin_emails]
    if not allowed:
        return []
    rows = session.execute(
        select(Account.id, AccountEmail.email, Account.locale)
        .join(Account, Account.id == AccountEmail.account_id)
        .where(
            Account.disabled_at.is_(None),
            AccountEmail.verified_at.is_not(None),
            func.lower(AccountEmail.email).in_(allowed),
        )
        .order_by(AccountEmail.email)
    ).all()
    return [Recipient(account_id, email, locale) for account_id, email, locale in rows]


def is_operator(session: Session, account_id: UUID) -> bool:
    """Whether the Account may still receive and open operator notices."""
    account = session.get(Account, account_id)
    if account is None or account.disabled_at is not None:
        return False
    return is_server_admin(session, account)


def notify(session: Session, *, topic: str, at: datetime, recipients: list[UUID]) -> int:
    """Create one operator notice per recipient Account and queue its push.

    All notices of one alert share a source event, so the push pipeline creates
    their deliveries in one pass. Return the number of notices created.
    """
    if topic not in OPERATOR_TOPICS:
        raise ValueError(f"Unknown operator topic: {topic}")
    accounts = list(dict.fromkeys(recipients))
    if not accounts:
        return 0
    source_event_id = new_id()
    for account_id in accounts:
        session.add(
            Notification(
                space_id=None,
                recipient_account_id=account_id,
                source_event_id=source_event_id,
                kind=NotificationKind.OPERATOR_ALERT.value,
                operator_topic=topic,
                created_at=at,
                expires_at=at + LIFETIME,
                in_app_visible=False,
            )
        )
    session.flush()
    push.ensure_deliveries_for_source_event(session, source_event_id)
    return len(accounts)


def prune(session: Session, *, at: datetime) -> int:
    """Delete operator notices expired for longer than a day; return how many.

    Couple notices go with their Space; operator notices have none, so the
    alert job removes them here.
    """
    result = cast(
        "CursorResult[Any]",
        session.execute(
            delete(Notification).where(
                Notification.kind == NotificationKind.OPERATOR_ALERT.value,
                Notification.expires_at < at - KEEP_EXPIRED,
            )
        ),
    )
    return int(result.rowcount or 0)
