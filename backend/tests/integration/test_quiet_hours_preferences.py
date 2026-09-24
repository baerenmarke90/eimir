"""Account-owned Quiet Hours persistence and delivery-class eligibility."""

from __future__ import annotations

from datetime import UTC, datetime, time

import pytest
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from eimir.engagement import quiet_hours_preferences
from eimir.engagement.quiet_hours import QuietHoursWindow
from eimir.identity.models import Account
from tests.conftest import make_account, requires_database

pytestmark = [pytest.mark.integration, requires_database]


def test_window_is_personal_persistent_and_can_be_disabled(session: Session) -> None:
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    assert quiet_hours_preferences.own_window(anna) is None
    assert quiet_hours_preferences.own_window(ben) is None

    window = QuietHoursWindow(time(22), time(7))
    quiet_hours_preferences.set_own_window(session, account_id=anna.id, window=window)
    session.flush()
    session.expire(anna)
    assert quiet_hours_preferences.own_window(anna) == window
    assert quiet_hours_preferences.own_window(ben) is None

    quiet_hours_preferences.set_own_window(session, account_id=anna.id, window=None)
    session.flush()
    session.expire(anna)
    assert quiet_hours_preferences.own_window(anna) is None
    assert anna.quiet_hours_start is None
    assert anna.quiet_hours_end is None
    assert quiet_hours_preferences.own_window(ben) is None


def test_release_is_recipient_local_and_preserves_reminder_priority(session: Session) -> None:
    account = make_account(session)
    quiet_hours_preferences.set_own_window(
        session, account_id=account.id, window=QuietHoursWindow(time(22), time(7))
    )
    at = datetime(2026, 1, 4, 21, 15, tzinfo=UTC)
    expected = datetime(2026, 1, 5, 6, tzinfo=UTC)
    for kind in ("THINKING_OF_YOU", "PARTNER_KISS", "PARTNER_CHECK_IN"):
        assert quiet_hours_preferences.release_at(account, kind=kind, at=at) == expected
    for kind in ("REMINDER_DUE", "COMMENT_CREATED", "UNKNOWN"):
        assert quiet_hours_preferences.release_at(account, kind=kind, at=at) is None

    account.timezone = "America/New_York"
    assert quiet_hours_preferences.release_at(account, kind="THINKING_OF_YOU", at=at) is None


def test_disabled_account_cannot_change_its_window(session: Session) -> None:
    account = make_account(session)
    account.disabled_at = datetime(2026, 1, 4, tzinfo=UTC)
    session.flush()
    with pytest.raises(ValueError, match="Account is unavailable"):
        quiet_hours_preferences.set_own_window(
            session, account_id=account.id, window=QuietHoursWindow(time(22), time(7))
        )
    assert quiet_hours_preferences.own_window(account) is None


@pytest.mark.parametrize(
    ("start", "end"),
    [(time(22), None), (time(22), time(22)), (time(22, 0, 1), time(7))],
)
def test_database_rejects_partial_equal_or_second_precise_boundaries(
    session: Session, start: time, end: time | None
) -> None:
    account = make_account(session)
    with pytest.raises(IntegrityError), session.begin_nested():
        session.execute(
            update(Account)
            .where(Account.id == account.id)
            .values(quiet_hours_start=start, quiet_hours_end=end)
        )
    session.refresh(account)
    assert quiet_hours_preferences.own_window(account) is None
