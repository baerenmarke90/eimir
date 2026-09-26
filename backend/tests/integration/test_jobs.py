"""PostgreSQL-backed job queue integration tests.

The tests focus on concurrency and failure handling; the remaining behavior is
bookkeeping.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy import Engine
from sqlalchemy.orm import sessionmaker

from eimir.core.clock import now
from eimir.jobs import queue
from eimir.jobs.models import Job, JobStatus
from tests.conftest import requires_database

pytestmark = [pytest.mark.integration, requires_database]


class TestEnqueueAndClaim:
    def test_enqueued_job_has_id_before_flush(self, engine: Engine) -> None:
        factory = sessionmaker(bind=engine, expire_on_commit=False)
        session = factory()
        try:
            job = queue.enqueue(session, "referenced_job")
            assert job.id is not None
            session.rollback()
        finally:
            session.close()

    def test_enqueued_job_is_claimed(self, engine: Engine) -> None:
        factory = sessionmaker(bind=engine, expire_on_commit=False)
        session = factory()
        try:
            job = queue.enqueue(session, "send_push", {"notification_id": "x"})
            session.commit()

            claimed = queue.claim(session, "worker-1")
            assert job.id in {item.id for item in claimed}
            assert job.status == JobStatus.RUNNING.value
            assert job.attempts == 1
            session.commit()
        finally:
            session.query(Job).delete()
            session.commit()
            session.close()

    def test_delayed_job_is_not_claimed(self, engine: Engine) -> None:
        factory = sessionmaker(bind=engine, expire_on_commit=False)
        session = factory()
        try:
            job = queue.enqueue(session, "spaeter", delay=timedelta(hours=1))
            session.commit()
            assert job.id not in {item.id for item in queue.claim(session, "worker-1")}
            session.commit()
        finally:
            session.query(Job).delete()
            session.commit()
            session.close()


class TestConcurrency:
    def test_two_workers_never_claim_the_same_job(self, engine: Engine) -> None:
        """This is why the queue uses FOR UPDATE SKIP LOCKED.

        Without it, a job could be delivered twice or the second worker could
        block behind the first one.
        """
        factory = sessionmaker(bind=engine, expire_on_commit=False)

        preparation = factory()
        try:
            for i in range(6):
                queue.enqueue(preparation, "arbeit", {"i": i})
            preparation.commit()
        finally:
            preparation.close()

        first = factory()
        second = factory()
        try:
            a = {job.id for job in queue.claim(first, "worker-a", limit=3)}
            b = {job.id for job in queue.claim(second, "worker-b", limit=3)}

            assert len(a) == 3
            assert len(b) == 3
            assert a.isdisjoint(b)

            first.commit()
            second.commit()
        finally:
            first.close()
            second.close()
            cleanup = factory()
            cleanup.query(Job).delete()
            cleanup.commit()
            cleanup.close()

    def test_expired_lock_is_reassigned(self, engine: Engine) -> None:
        """A job must not remain stuck forever when its worker dies."""
        factory = sessionmaker(bind=engine, expire_on_commit=False)
        session = factory()
        try:
            job = queue.enqueue(session, "verwaist")
            session.commit()

            job.status = JobStatus.RUNNING.value
            job.locked_by = "toter-worker"
            job.locked_until = now() - timedelta(minutes=1)
            session.commit()

            claimed = queue.claim(session, "worker-neu")
            assert job.id in {item.id for item in claimed}
            assert job.locked_by == "worker-neu"
            session.commit()
        finally:
            session.query(Job).delete()
            session.commit()
            session.close()


class TestFailureHandling:
    def test_deferral_reuses_job_without_spending_retry_budget(self, engine: Engine) -> None:
        factory = sessionmaker(bind=engine, expire_on_commit=False)
        session = factory()
        try:
            job = queue.enqueue(session, "deferred-push", max_attempts=1)
            session.commit()
            assert job.id in {item.id for item in queue.claim(session, "worker-1")}
            assert job.attempts == 1

            release_check = now() + timedelta(minutes=15)
            queue.defer(job, until=release_check)
            session.commit()

            assert job.status == JobStatus.PENDING.value
            assert job.attempts == 0
            assert job.run_after >= release_check
            assert job.locked_by is None
            assert job.locked_until is None
            assert job.finished_at is None
            assert session.query(Job).count() == 1
            assert job.id not in {item.id for item in queue.claim(session, "worker-2")}

            job.run_after = now() - timedelta(seconds=1)
            session.commit()
            assert job.id in {item.id for item in queue.claim(session, "worker-2")}
            assert job.attempts == 1
        finally:
            session.query(Job).delete()
            session.commit()
            session.close()

    def test_failure_returns_job_to_pending_with_delay(self, engine: Engine) -> None:
        factory = sessionmaker(bind=engine, expire_on_commit=False)
        session = factory()
        try:
            job = queue.enqueue(session, "wackelig", max_attempts=3)
            session.commit()
            queue.claim(session, "worker-1")

            queue.fail(job, "Empfaenger antwortet nicht")
            session.commit()

            assert job.status == JobStatus.PENDING.value
            assert job.run_after > now()
            assert job.locked_by is None
        finally:
            session.query(Job).delete()
            session.commit()
            session.close()

    def test_exhausted_attempts_end_as_failed(self, engine: Engine) -> None:
        """A permanently failed job must stay visible instead of disappearing."""
        factory = sessionmaker(bind=engine, expire_on_commit=False)
        session = factory()
        try:
            job = queue.enqueue(session, "hoffnungslos", max_attempts=1)
            session.commit()
            queue.claim(session, "worker-1")

            queue.fail(job, "geht nicht")
            session.commit()

            assert job.status == JobStatus.FAILED.value
            assert job.finished_at is not None
        finally:
            session.query(Job).delete()
            session.commit()
            session.close()
