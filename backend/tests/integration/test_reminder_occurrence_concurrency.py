"""PostgreSQL concurrency regressions for Reminder occurrence reconciliation."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, time
from threading import Event, Lock, current_thread

import pytest
from sqlalchemy import select

from eimir.identity import preferences as account_preferences
from eimir.identity.models import Account
from eimir.jobs.models import Job
from eimir.plans.models import Plan, PlanPayload, PlanStatus
from eimir.plans.models import shared_privacy as plan_shared_privacy
from eimir.reminders import runtime
from eimir.reminders.models import (
    Reminder,
    ReminderOffset,
    ReminderPayload,
    ReminderScheduleType,
    ReminderSource,
    shared_privacy,
)
from eimir.reminders.rules import PLAN_START_RULE
from eimir.reminders.runtime_models import OccurrenceState, ReminderOccurrence
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]

NOW = datetime(2026, 8, 30, 12, 0, tzinfo=UTC)
PLAN_START = datetime(2026, 9, 5, 18, 0, tzinfo=UTC)
UPDATED_PLAN_START = datetime(2026, 9, 6, 18, 0, tzinfo=UTC)


def _seed_manual_reminder(maker, *, reconcile: bool):  # type: ignore[no-untyped-def]
    with maker.begin() as setup:
        account = make_account(setup, "Anna")
        space = make_space(setup, account)
        reminder = Reminder(
            space_id=space.id,
            owner_id=account.id,
            privacy_class=shared_privacy(),
            source=ReminderSource.MANUAL.value,
            schedule_type=ReminderScheduleType.ANNUAL.value,
            annual_month=9,
            annual_day=15,
            local_time=time(9, 0),
            payload=ReminderPayload(title="Concurrent annual reminder"),
        )
        setup.add(reminder)
        setup.flush()
        setup.add(ReminderOffset(reminder_id=reminder.id, days_before=0))
        setup.flush()
        if reconcile:
            runtime.reconcile_reminder(setup, reminder.id)
            occurrence = setup.execute(
                select(ReminderOccurrence).where(
                    ReminderOccurrence.reminder_id == reminder.id,
                    ReminderOccurrence.recipient_account_id == account.id,
                )
            ).scalar_one()
            occurrence_state = (
                occurrence.id,
                occurrence.due_at,
                occurrence.generation,
            )
        else:
            occurrence_state = None
        return account.id, space.id, reminder.id, occurrence_state


def _seed_generated_plan_reminder(maker):  # type: ignore[no-untyped-def]
    with maker.begin() as setup:
        account = make_account(setup, "Anna")
        space = make_space(setup, account)
        plan = Plan(
            space_id=space.id,
            owner_id=account.id,
            privacy_class=plan_shared_privacy(),
            status=PlanStatus.PLANNED.value,
            planned_start=PLAN_START,
            payload=PlanPayload(title="Concurrent source plan"),
        )
        setup.add(plan)
        setup.flush()
        runtime.reconcile_space(setup, space.id)
        reminder = setup.execute(
            select(Reminder).where(
                Reminder.space_id == space.id,
                Reminder.source == ReminderSource.GENERATED.value,
                Reminder.rule_key == PLAN_START_RULE,
                Reminder.source_id == plan.id,
            )
        ).scalar_one()
        return account.id, space.id, plan.id, reminder.id


def _occurrence_jobs(session, occurrence_id):  # type: ignore[no-untyped-def]
    return [
        job
        for job in session.execute(select(Job).where(Job.kind == runtime.OCCURRENCE_JOB)).scalars()
        if job.payload.get("occurrenceId") == str(occurrence_id)
    ]


def test_periodic_and_request_reconcile_create_one_logical_occurrence(
    production_client,
    monkeypatch,
) -> None:  # type: ignore[no-untyped-def]
    _client, maker = production_client
    monkeypatch.setattr(runtime.clock, "now", lambda: NOW)
    account_id, space_id, reminder_id, _ = _seed_manual_reminder(maker, reconcile=False)

    real_desired = runtime._desired_occurrences
    entrants = 0
    entrant_lock = Lock()
    both_ready = Event()

    def coordinated_desired(*args, **kwargs):  # type: ignore[no-untyped-def]
        nonlocal entrants
        result = real_desired(*args, **kwargs)
        with entrant_lock:
            entrants += 1
            if entrants == 2:
                both_ready.set()
        # The unfixed code lets both planners reach this point together. With
        # the parent Reminder lock the first planner times out here, commits,
        # and only then can the waiter compute its desired set.
        both_ready.wait(timeout=0.75)
        return result

    monkeypatch.setattr(runtime, "_desired_occurrences", coordinated_desired)
    start = Event()

    def periodic_reconcile() -> None:
        start.wait(timeout=5)
        with maker.begin() as session:
            runtime.reconcile_space(session, space_id)

    def request_reconcile() -> None:
        start.wait(timeout=5)
        with maker.begin() as session:
            runtime.reconcile_reminder(session, reminder_id)

    with ThreadPoolExecutor(max_workers=2) as pool:
        periodic = pool.submit(periodic_reconcile)
        request = pool.submit(request_reconcile)
        start.set()
        periodic.result(timeout=10)
        request.result(timeout=10)

    with maker() as query:
        occurrences = list(
            query.execute(
                select(ReminderOccurrence).where(
                    ReminderOccurrence.reminder_id == reminder_id,
                    ReminderOccurrence.recipient_account_id == account_id,
                )
            ).scalars()
        )
        assert len(occurrences) == 1
        occurrence = occurrences[0]
        assert occurrence.state == OccurrenceState.PENDING.value
        assert occurrence.generation == 1
        assert [job.payload["generation"] for job in _occurrence_jobs(query, occurrence.id)] == [1]


def test_timezone_replan_cannot_be_overwritten_by_stale_periodic_plan(
    production_client,
    monkeypatch,
) -> None:  # type: ignore[no-untyped-def]
    _client, maker = production_client
    monkeypatch.setattr(runtime.clock, "now", lambda: NOW)
    account_id, space_id, _reminder_id, occurrence_state = _seed_manual_reminder(
        maker, reconcile=True
    )
    assert occurrence_state is not None
    occurrence_id, initial_due_at, initial_generation = occurrence_state
    assert initial_due_at == datetime(2026, 9, 15, 7, 0, tzinfo=UTC)

    real_desired = runtime._desired_occurrences
    periodic_ready = Event()
    release_periodic = Event()
    request_done = Event()

    def coordinated_desired(*args, **kwargs):  # type: ignore[no-untyped-def]
        result = real_desired(*args, **kwargs)
        if current_thread().name.startswith("periodic"):
            periodic_ready.set()
            assert release_periodic.wait(timeout=5)
        return result

    monkeypatch.setattr(runtime, "_desired_occurrences", coordinated_desired)

    def periodic_reconcile() -> None:
        with maker.begin() as session:
            runtime.reconcile_space(session, space_id)

    def request_timezone_change() -> None:
        with maker.begin() as session:
            account = session.get(Account, account_id)
            assert account is not None
            account_preferences.set_preferences(
                session,
                account,
                timezone="America/New_York",
            )
        request_done.set()

    with (
        ThreadPoolExecutor(max_workers=1, thread_name_prefix="periodic") as periodic_pool,
        ThreadPoolExecutor(max_workers=1, thread_name_prefix="request") as request_pool,
    ):
        periodic = periodic_pool.submit(periodic_reconcile)
        assert periodic_ready.wait(timeout=5)
        request = request_pool.submit(request_timezone_change)
        # Without reconciliation serialization the request commits while the
        # periodic planner is paused and that stale planner writes last. With
        # the fix the request waits on the Reminder until the periodic txn ends.
        request_done.wait(timeout=0.75)
        release_periodic.set()
        periodic.result(timeout=10)
        request.result(timeout=10)

    with maker.begin() as query:
        occurrence = query.get(ReminderOccurrence, occurrence_id)
        assert occurrence is not None
        assert occurrence.due_at == datetime(2026, 9, 15, 13, 0, tzinfo=UTC)
        assert occurrence.generation == initial_generation + 1
        assert sorted(
            job.payload["generation"] for job in _occurrence_jobs(query, occurrence.id)
        ) == [initial_generation, initial_generation + 1]

        runtime.handle_occurrence(
            query,
            {
                "occurrenceId": str(occurrence.id),
                "generation": initial_generation,
            },
        )
        query.flush()
        query.refresh(occurrence)
        assert occurrence.state == OccurrenceState.PENDING.value
        assert occurrence.generation == initial_generation + 1


def test_newer_source_commit_remains_authoritative_after_periodic_overlap(
    production_client,
    monkeypatch,
) -> None:  # type: ignore[no-untyped-def]
    _client, maker = production_client
    monkeypatch.setattr(runtime.clock, "now", lambda: NOW)
    account_id, space_id, plan_id, reminder_id = _seed_generated_plan_reminder(maker)

    real_apply = runtime._apply_generated_schedule
    periodic_ready = Event()
    release_periodic = Event()
    source_changed = Event()
    request_done = Event()

    def coordinated_apply(reminder, values):  # type: ignore[no-untyped-def]
        if reminder.id == reminder_id and current_thread().name.startswith("periodic"):
            periodic_ready.set()
            assert release_periodic.wait(timeout=5)
        return real_apply(reminder, values)

    monkeypatch.setattr(runtime, "_apply_generated_schedule", coordinated_apply)

    def periodic_reconcile() -> None:
        with maker.begin() as session:
            runtime.reconcile_space(session, space_id)

    def request_source_change() -> None:
        with maker.begin() as session:
            plan = session.get(Plan, plan_id)
            assert plan is not None
            plan.planned_start = UPDATED_PLAN_START
            session.flush()
            source_changed.set()
            runtime.reconcile_space(session, space_id)
        request_done.set()

    with (
        ThreadPoolExecutor(max_workers=1, thread_name_prefix="periodic") as periodic_pool,
        ThreadPoolExecutor(max_workers=1, thread_name_prefix="request") as request_pool,
    ):
        periodic = periodic_pool.submit(periodic_reconcile)
        assert periodic_ready.wait(timeout=5)
        request = request_pool.submit(request_source_change)
        assert source_changed.wait(timeout=5)
        request_done.wait(timeout=0.75)
        release_periodic.set()
        periodic.result(timeout=10)
        request.result(timeout=10)

    with maker() as query:
        reminder = query.get(Reminder, reminder_id)
        assert reminder is not None
        assert reminder.once_at == UPDATED_PLAN_START

        occurrences = list(
            query.execute(
                select(ReminderOccurrence).where(
                    ReminderOccurrence.reminder_id == reminder_id,
                    ReminderOccurrence.recipient_account_id == account_id,
                )
            ).scalars()
        )
        current_key = f"once:{UPDATED_PLAN_START.isoformat()}"
        old_key = f"once:{PLAN_START.isoformat()}"
        current = [
            row
            for row in occurrences
            if row.state == OccurrenceState.PENDING.value and row.occurrence_key == current_key
        ]
        assert len(current) == 2
        assert all(
            row.state != OccurrenceState.PENDING.value
            for row in occurrences
            if row.occurrence_key == old_key
        )
