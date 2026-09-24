"""Account-owned Quiet Hours, separate from per-kind channel opt-ins."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy.orm import Session

from eimir.engagement.models import NotificationKind
from eimir.engagement.quiet_hours import QuietHoursWindow
from eimir.identity import effects as account_effects
from eimir.identity.models import Account

# Explicit partner signals can wait for the recipient's next available hour.
# REMINDER_DUE follows its own chosen schedule. DIGESTIBLE comments have no
# external channel before the digest contract has been implemented.
DEFERABLE_KINDS = frozenset(
    {
        NotificationKind.THINKING_OF_YOU,
        NotificationKind.PARTNER_KISS,
        NotificationKind.PARTNER_CHECK_IN,
    }
)


def own_window(account: Account) -> QuietHoursWindow | None:
    """No boundaries means off; the Account timezone is resolved at use time."""
    if account.quiet_hours_start is None or account.quiet_hours_end is None:
        return None
    return QuietHoursWindow(account.quiet_hours_start, account.quiet_hours_end)


def release_at(account: Account, *, kind: str, at: datetime) -> datetime | None:
    """Return a candidate external release instant for eligible kinds only.

    Delivery must also enforce current channel choice, target privacy and
    module availability, and must coalesce queued signals before activation.
    """
    if kind not in DEFERABLE_KINDS:
        return None
    window = own_window(account)
    return window.release_at(at, account.timezone) if window is not None else None


def set_own_window(
    session: Session, *, account_id: UUID, window: QuietHoursWindow | None
) -> None:
    """Write the authenticated Account's optional window under its row lock.

    Callers must supply the current authenticated Account ID; never accept a
    partner's ID from an HTTP request. This does not activate delivery.
    """
    accounts = account_effects.lock_enabled_accounts(session, {account_id})
    if accounts is None:
        raise ValueError("Account is unavailable.")
    account = accounts[account_id]
    account.quiet_hours_start = window.start if window is not None else None
    account.quiet_hours_end = window.end if window is not None else None
