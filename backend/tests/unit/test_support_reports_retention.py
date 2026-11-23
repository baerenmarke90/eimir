"""Retention rules of support reports, without a database (#2189).

The database-backed behavior lives in
``tests/integration/test_support_reports_retention.py``. These tests pin the
cutoff arithmetic and the shape of the delete statement.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql.dml import Delete

from eimir.core import clock
from eimir.identity.deletion import PERSONAL_ACCOUNT_ROWS
from eimir.support_reports import service
from eimir.support_reports.models import SupportReport, SupportReportReplyRow

NOW = datetime(2026, 11, 23, 12, 0, tzinfo=UTC)


def test_retention_periods_are_90_and_365_days() -> None:
    assert timedelta(days=90) == service.CLOSED_RETENTION
    assert timedelta(days=365) == service.MAX_RETENTION


def test_cutoffs_are_measured_back_from_now() -> None:
    cutoffs = service.retention_cutoffs(NOW)

    assert cutoffs.closed_before == NOW - timedelta(days=90)
    assert cutoffs.created_before == NOW - timedelta(days=365)


def test_naive_now_is_read_as_utc() -> None:
    cutoffs = service.retention_cutoffs(NOW.replace(tzinfo=None))

    assert cutoffs.closed_before.tzinfo is not None
    assert cutoffs.closed_before == NOW - timedelta(days=90)


class _Result:
    rowcount = 3


class _RecordingSession:
    def __init__(self) -> None:
        self.statements: list[Any] = []

    def execute(self, statement: Any) -> _Result:
        self.statements.append(statement)
        return _Result()


def test_prune_issues_one_delete_with_both_cutoffs(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(clock, "now", lambda: NOW)
    session = _RecordingSession()

    removed = service.prune_expired(session)  # type: ignore[arg-type]

    assert removed == 3
    (statement,) = session.statements
    assert isinstance(statement, Delete)
    compiled = statement.compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert sql.startswith("DELETE FROM support_reports WHERE")
    assert "support_reports.state =" in sql
    assert "support_reports.closed_at <" in sql
    assert "support_reports.created_at <" in sql
    # Strictly older is deleted, so a report exactly at a cutoff is kept.
    assert "<=" not in sql
    assert " OR " in sql
    values = set(compiled.params.values())
    assert NOW - timedelta(days=90) in values
    assert NOW - timedelta(days=365) in values
    assert "CLOSED" in values


def test_account_deletion_covers_reports_and_replies() -> None:
    assert SupportReport in PERSONAL_ACCOUNT_ROWS
    # Replies carry no account column; they leave through the report's cascade.
    foreign_key = next(iter(SupportReportReplyRow.__table__.c.report_id.foreign_keys))
    assert foreign_key.ondelete == "CASCADE"
