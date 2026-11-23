"""The ServerAdmin "reports are not being read" rule (#2189)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from eimir.support_reports.service import UNREAD_WARNING_AGE, support_reports_unread_warning

NOW = datetime(2026, 11, 23, 12, 0, tzinfo=UTC)


def test_threshold_is_fourteen_days() -> None:
    assert timedelta(days=14) == UNREAD_WARNING_AGE


def test_warns_when_enabled_and_oldest_new_report_is_older_than_14_days() -> None:
    oldest = NOW - UNREAD_WARNING_AGE - timedelta(seconds=1)
    assert support_reports_unread_warning(enabled=True, oldest_new_at=oldest, now=NOW) is True


def test_exactly_14_days_old_does_not_warn() -> None:
    oldest = NOW - UNREAD_WARNING_AGE
    assert support_reports_unread_warning(enabled=True, oldest_new_at=oldest, now=NOW) is False


def test_recent_report_does_not_warn() -> None:
    oldest = NOW - timedelta(days=1)
    assert support_reports_unread_warning(enabled=True, oldest_new_at=oldest, now=NOW) is False


def test_disabled_feature_never_warns() -> None:
    oldest = NOW - timedelta(days=400)
    assert support_reports_unread_warning(enabled=False, oldest_new_at=oldest, now=NOW) is False


def test_no_new_report_does_not_warn() -> None:
    assert support_reports_unread_warning(enabled=True, oldest_new_at=None, now=NOW) is False


def test_naive_timestamp_is_treated_as_utc() -> None:
    oldest = (NOW - timedelta(days=15)).replace(tzinfo=None)
    assert support_reports_unread_warning(enabled=True, oldest_new_at=oldest, now=NOW) is True
