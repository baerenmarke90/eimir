"""Integration evidence for privacy-safe unexpected-failure diagnostics."""

from __future__ import annotations

from datetime import timedelta
from uuid import uuid4

import pytest
from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

from eimir.core.clock import now
from eimir.domain.events import DomainEvent, EventType
from eimir.engagement import service as engagement_service
from eimir.jobs import queue
from eimir.jobs.errors import RetryableJobError
from eimir.jobs.models import Job, JobStatus
from eimir.jobs.worker import registry, run_once
from eimir.outbox import service as outbox_service
from eimir.outbox.models import OutboxEvent
from tests.conftest import requires_database

pytestmark = [pytest.mark.integration, requires_database]


def test_unexpected_job_failure_persists_only_class_summary(engine: Engine) -> None:
    marker = "DIAGNOSTIC-CANARY-UNEXPECTED-JOB-7F42"

    def failing_handler(session: object, payload: dict) -> None:
        raise RuntimeError(marker)

    job_kind = "test_worker_unexpected_failure_diagnostic"
    if registry.get(job_kind) is None:
        registry.register(job_kind, failing_handler)

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    setup = factory()
    try:
        job = queue.enqueue(setup, job_kind, {})
        setup.commit()
        job_id = job.id

        assert run_once("test-worker-diag", limit=10) >= 1

        check = factory()
        try:
            reloaded = check.get(Job, job_id)
            assert reloaded is not None
            assert reloaded.last_error == "RuntimeError"
            assert marker not in reloaded.last_error
            assert reloaded.status == JobStatus.PENDING.value
            assert reloaded.attempts == 1
        finally:
            check.close()
    finally:
        setup.query(Job).delete()
        setup.commit()
        setup.close()


def test_retryable_job_error_keeps_controlled_code(engine: Engine) -> None:
    stable_code = "TEST_RETRYABLE_DIAGNOSTIC_CODE"

    def retrying_handler(session: object, payload: dict) -> None:
        raise RetryableJobError(stable_code)

    job_kind = "test_worker_retryable_diagnostic"
    if registry.get(job_kind) is None:
        registry.register(job_kind, retrying_handler)

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    setup = factory()
    try:
        job = queue.enqueue(setup, job_kind, {})
        setup.commit()
        job_id = job.id

        assert run_once("test-worker-retry-diag", limit=10) >= 1

        check = factory()
        try:
            reloaded = check.get(Job, job_id)
            assert reloaded is not None
            assert reloaded.last_error == stable_code
        finally:
            check.close()
    finally:
        setup.query(Job).delete()
        setup.commit()
        setup.close()


def test_successful_job_retry_clears_failure_diagnostic(engine: Engine) -> None:
    attempts = {"count": 0}

    def flaky_handler(session: object, payload: dict) -> None:
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise RuntimeError("DIAGNOSTIC-CANARY-TRANSIENT-JOB-8A11")

    job_kind = "test_worker_flaky_then_succeeds"
    if registry.get(job_kind) is None:
        registry.register(job_kind, flaky_handler)

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    setup = factory()
    try:
        job = queue.enqueue(setup, job_kind, {})
        setup.commit()
        job_id = job.id

        assert run_once("test-worker-flaky", limit=10) >= 1

        check = factory()
        try:
            reloaded = check.get(Job, job_id)
            assert reloaded is not None
            assert reloaded.last_error == "RuntimeError"
            reloaded.run_after = now()
            check.commit()
        finally:
            check.close()

        assert run_once("test-worker-flaky", limit=10) >= 1

        final = factory()
        try:
            reloaded = final.get(Job, job_id)
            assert reloaded is not None
            assert reloaded.status == JobStatus.SUCCEEDED.value
            assert reloaded.last_error is None
        finally:
            final.close()
    finally:
        cleanup = factory()
        cleanup.query(Job).delete()
        cleanup.commit()
        cleanup.close()
        setup.close()


def _projection_event() -> DomainEvent:
    return DomainEvent(
        type=EventType.MEMORY_CREATED,
        space_id=uuid4(),
        actor_id=uuid4(),
        subject_type="memory",
        subject_id=uuid4(),
        payload={"has_attachment": True},
    )


def test_unexpected_projection_failure_persists_only_class_summary(
    session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    marker = "DIAGNOSTIC-CANARY-UNEXPECTED-PROJECTION-2C19"

    def failing_projection(_session: Session, _event: OutboxEvent) -> None:
        raise RuntimeError(marker)

    monkeypatch.setattr(engagement_service, "project_event", failing_projection)

    row = outbox_service.record(session, _projection_event())
    session.flush()

    assert engagement_service.project_pending(session) == 1
    assert row.processed_at is None
    assert row.attempts == 1
    assert row.last_error == "RuntimeError"
    assert marker not in row.last_error


def test_successful_projection_retry_clears_failure_diagnostic(
    session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(engagement_service, "project_event", lambda _session, _event: None)

    row = outbox_service.record(session, _projection_event())
    session.flush()
    outbox_service.mark_failed(row, "RuntimeError")
    assert row.last_error == "RuntimeError"
    assert row.next_attempt_at is not None

    row.next_attempt_at = now() - timedelta(seconds=1)
    session.flush()

    assert engagement_service.project_pending(session) == 1
    assert row.processed_at is not None
    assert row.last_error is None
    assert row.next_attempt_at is None


def test_a_poison_projection_becomes_terminal_and_logs_distinctly(
    session: Session, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """A permanently-broken projector must not retry this event forever; the
    worker would otherwise reclaim it every poll indefinitely (mirrors
    jobs/worker.py's "unknown job kind" terminal path)."""
    marker = "DIAGNOSTIC-CANARY-POISON-PROJECTION-4F10"

    def always_failing_projection(_session: Session, _event: OutboxEvent) -> None:
        raise RuntimeError(marker)

    monkeypatch.setattr(engagement_service, "project_event", always_failing_projection)

    row = outbox_service.record(session, _projection_event())
    session.flush()
    row.attempts = outbox_service.MAX_ATTEMPTS - 1
    session.flush()

    with caplog.at_level("ERROR", logger="eimir.engagement.service"):
        assert engagement_service.project_pending(session) == 1

    assert row.attempts == outbox_service.MAX_ATTEMPTS
    assert row.failed_at is not None
    assert row.processed_at is None
    assert marker not in (row.last_error or "")
    assert any("permanently failed" in record.message for record in caplog.records), (
        "a terminally failed event must log distinctly from an ordinary retry"
    )

    # Never reclaimed again, even though nothing else changed about eligibility.
    assert engagement_service.project_pending(session) == 0


def test_unexpected_projection_failure_never_persists_private_content(
    session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """#695: private product content embedded in exception prose (e.g. a memory
    body echoed by a provider error) must not reach `last_error` either."""
    private_content = "DIAGNOSTIC-CANARY-PRIVATE-NOTE-9B71 never told anyone about this"

    def failing_projection(_session: Session, _event: OutboxEvent) -> None:
        raise RuntimeError(f"failed to render payload: {private_content!r}")

    monkeypatch.setattr(engagement_service, "project_event", failing_projection)

    row = outbox_service.record(session, _projection_event())
    session.flush()

    assert engagement_service.project_pending(session) == 1
    assert row.last_error == "RuntimeError"
    assert private_content not in row.last_error
    assert "DIAGNOSTIC-CANARY-PRIVATE-NOTE-9B71" not in row.last_error


def test_unexpected_projection_failure_never_persists_presigned_url_secret(
    session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """#695: a signed/presigned URL's query secret must not reach `last_error`
    even when it only ever appears inside exception text."""
    presigned_url = (
        "https://storage.example.com/bucket/object"
        "?X-Amz-Signature=DIAGNOSTIC-CANARY-SIG-4E20&X-Amz-Credential=abcd1234"
    )

    def failing_projection(_session: Session, _event: OutboxEvent) -> None:
        raise RuntimeError(f"upload failed for {presigned_url}")

    monkeypatch.setattr(engagement_service, "project_event", failing_projection)

    row = outbox_service.record(session, _projection_event())
    session.flush()

    assert engagement_service.project_pending(session) == 1
    assert row.last_error == "RuntimeError"
    assert presigned_url not in row.last_error
    assert "DIAGNOSTIC-CANARY-SIG-4E20" not in row.last_error
    assert "abcd1234" not in row.last_error
