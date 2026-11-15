"""Provider retry boundaries preserve the shared queue attempt budget."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from eimir.jobs import queue
from eimir.jobs.models import Job, JobStatus

NOW = datetime(2026, 10, 20, 12, tzinfo=UTC)


@pytest.mark.parametrize(("attempt", "seconds"), [(1, 60), (2, 120), (3, 240), (4, 480)])
def test_provider_base_grows_exponentially_without_refunding_attempt(
    monkeypatch: pytest.MonkeyPatch, attempt: int, seconds: int
) -> None:
    monkeypatch.setattr(queue, "now", lambda: NOW)
    job = Job(kind="push-delivery", attempts=attempt, max_attempts=5)
    queue.fail(job, "FCM_QUOTA_EXCEEDED", retry_base=timedelta(seconds=60))
    assert job.run_after == NOW + timedelta(seconds=seconds)
    assert job.attempts == attempt
    assert job.status == JobStatus.PENDING.value


def test_retry_after_is_lower_bound_and_cannot_shorten_default_backoff(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(queue, "now", lambda: NOW)
    job = Job(kind="push-delivery", attempts=1, max_attempts=5)
    queue.fail(job, "FCM_UNAVAILABLE", retry_not_before=NOW + timedelta(minutes=4))
    assert job.run_after == NOW + timedelta(minutes=4)
    queue.fail(job, "FCM_UNAVAILABLE", retry_not_before=NOW - timedelta(seconds=1))
    assert job.run_after == NOW + timedelta(seconds=10)
    assert job.attempts == 1


def test_retry_timing_does_not_extend_attempt_budget(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(queue, "now", lambda: NOW)
    job = Job(kind="push-delivery", attempts=5, max_attempts=5)
    queue.fail(job, "FCM_QUOTA_EXCEEDED", retry_base=timedelta(seconds=60))
    assert job.status == JobStatus.FAILED.value
    assert job.finished_at == NOW
    assert job.attempts == 5
