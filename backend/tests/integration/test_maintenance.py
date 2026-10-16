"""Security-retention maintenance job.

The suite verifies both aspects: that the job removes the correct rows and that
it reliably schedules itself again.
"""

from __future__ import annotations

from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier

import pytest
from sqlalchemy import Engine, func, select
from sqlalchemy.orm import Session, sessionmaker

from eimir.auth import rate_limit, sessions
from eimir.core.clock import now
from eimir.identity.models import ConsumedRefreshToken, RateLimitEvent
from eimir.jobs import maintenance
from eimir.jobs.models import Job, JobStatus
from eimir.jobs.worker import JobRegistry
from tests.conftest import make_account, requires_database

pytestmark = [pytest.mark.integration, requires_database]


@pytest.fixture
def jobs(engine: Engine) -> Iterator[sessionmaker[Session]]:
    """Committed jobs; advisory locks require real transactions."""
    maker = sessionmaker(bind=engine, expire_on_commit=False)

    def clear_jobs() -> None:
        with maker() as session:
            session.query(Job).delete()
            session.commit()

    clear_jobs()
    yield maker
    clear_jobs()


def open_jobs(session: Session) -> list[Job]:
    return list(
        session.execute(
            select(Job).where(
                Job.kind == maintenance.SECURITY_RETENTION,
                Job.status == JobStatus.PENDING.value,
            )
        )
        .scalars()
        .all()
    )


class TestCleanup:
    def test_finished_family_is_pruned_after_retention(self, session: Session) -> None:
        account = make_account(session)
        device, tokens = sessions.start_session(session, account)
        session.flush()
        sessions.refresh_session(session, tokens.refresh_token)
        session.flush()

        sessions.revoke(device)
        device.revoked_at = now() - sessions.REPLAY_HISTORY_RETENTION - timedelta(days=1)
        session.flush()

        maintenance.run_security_retention(session, {})
        session.flush()

        assert session.execute(select(ConsumedRefreshToken)).scalars().all() == []

    def test_active_family_keeps_its_history(self, session: Session) -> None:
        """The history of a live session is the replay detection mechanism itself."""
        account = make_account(session)
        _, tokens = sessions.start_session(session, account)
        session.flush()
        sessions.refresh_session(session, tokens.refresh_token)
        session.flush()

        maintenance.run_security_retention(session, {})
        session.flush()

        assert session.execute(select(ConsumedRefreshToken)).scalars().all()

    def test_old_rate_limit_events_leave_and_current_events_remain(
        self,
        session: Session,
    ) -> None:
        rate_limit.record_attempt(session, "sign_in", "alt@example.org")
        rate_limit.record_attempt(session, "sign_in", "neu@example.org")
        session.flush()

        old_event = (
            session.execute(select(RateLimitEvent).where(RateLimitEvent.key_hash != ""))
            .scalars()
            .all()[0]
        )
        old_event.occurred_at = now() - timedelta(days=2)
        session.flush()

        maintenance.run_security_retention(session, {})
        session.flush()

        remaining = session.execute(select(func.count()).select_from(RateLimitEvent)).scalar_one()
        assert remaining == 1

    def test_repeated_run_is_harmless(self, session: Session) -> None:
        maintenance.run_security_retention(session, {})
        maintenance.run_security_retention(session, {})
        session.flush()


class TestScheduling:
    def test_run_schedules_its_successor(self, jobs) -> None:  # type: ignore[no-untyped-def]
        with jobs() as session:
            maintenance.run_security_retention(session, {})
            session.commit()

            pending = open_jobs(session)
            assert len(pending) == 1
            assert pending[0].run_after > now() + maintenance.RETENTION_INTERVAL - timedelta(
                minutes=1
            )

    def test_ensure_scheduled_is_idempotent(self, jobs) -> None:  # type: ignore[no-untyped-def]
        with jobs() as session:
            maintenance.ensure_scheduled(session)
            session.commit()
            maintenance.ensure_scheduled(session)
            session.commit()

            assert len(open_jobs(session)) == 1

    def test_two_starting_workers_schedule_only_one_run(self, jobs) -> None:  # type: ignore[no-untyped-def]
        """Without the advisory lock both workers would see nothing and enqueue a job."""
        barrier = Barrier(2)

        def schedule() -> None:
            with jobs() as session:
                barrier.wait(timeout=5)
                maintenance.ensure_scheduled(session)
                session.commit()

        with ThreadPoolExecutor(max_workers=2) as pool:
            for future in [pool.submit(schedule), pool.submit(schedule)]:
                future.result(timeout=10)

        with jobs() as session:
            assert len(open_jobs(session)) == 1

    def test_abandoned_chain_is_resumed(self, jobs) -> None:  # type: ignore[no-untyped-def]
        """Otherwise cleanup would silently stop after a terminal failure."""
        with jobs() as session:
            job = maintenance.ensure_scheduled(session)
            assert job is not None
            session.commit()

            job.status = JobStatus.FAILED.value
            job.finished_at = now()
            session.commit()

            assert maintenance.ensure_scheduled(session) is not None
            session.commit()
            assert len(open_jobs(session)) == 1

    def test_running_job_is_not_duplicated(self, jobs) -> None:  # type: ignore[no-untyped-def]
        with jobs() as session:
            job = maintenance.ensure_scheduled(session)
            assert job is not None
            job.status = JobStatus.RUNNING.value
            session.commit()

            assert maintenance.ensure_scheduled(session) is None
            session.commit()


class TestThroughWorker:
    def test_worker_runs_maintenance_and_schedules_again(
        self,
        jobs,
        monkeypatch,
    ) -> None:  # type: ignore[no-untyped-def]
        """Complete path: scheduled, claimed, executed, and scheduled again."""
        from eimir.db import session as db_session
        from eimir.jobs import worker

        monkeypatch.setattr(db_session, "get_sessionmaker", lambda: jobs)

        local_registry = JobRegistry()
        maintenance.register_handlers(local_registry)
        monkeypatch.setattr(worker, "registry", local_registry)

        with jobs() as session:
            maintenance.ensure_scheduled(session)
            session.commit()

        assert worker.run_once("test-worker") == 1

        with jobs() as session:
            completed = (
                session.execute(select(Job).where(Job.status == JobStatus.SUCCEEDED.value))
                .scalars()
                .all()
            )
            assert len(completed) == 1
            assert completed[0].kind == maintenance.SECURITY_RETENTION
            assert len(open_jobs(session)) == 1

    def test_duplicate_registration_is_harmless(self) -> None:
        local_registry = JobRegistry()
        maintenance.register_handlers(local_registry)
        maintenance.register_handlers(local_registry)
        assert local_registry.get(maintenance.SECURITY_RETENTION) is not None
