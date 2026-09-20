"""PostgreSQL/HTTP evidence for the final M4-C Rule and occurrence runtime."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.domain.events import EventType
from eimir.engagement import push
from eimir.engagement import service as engagement_service
from eimir.engagement.models import Notification, NotificationKind, PushDelivery
from eimir.identity import preferences as account_preferences
from eimir.outbox.models import OutboxEvent
from eimir.relationship import profile as relationship_profile
from eimir.relationship import service as relationship_service
from eimir.relationship.models import DurationDisplayMode
from eimir.reminders import rules, runtime
from eimir.reminders.models import Reminder, ReminderSource
from eimir.reminders.runtime_models import OccurrenceState, ReminderOccurrence
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

NOW = datetime(2026, 8, 30, 12, 0, tzinfo=UTC)


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    outsider = make_account(session, "Outsider")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    foreign_space = make_space(session, outsider)
    session.flush()
    return {
        "anna": anna,
        "ben": ben,
        "outsider": outsider,
        "space": space,
        "foreign_space": foreign_space,
        "anna_token": sign_in(session, anna),
        "ben_token": sign_in(session, ben),
        "outsider_token": sign_in(session, outsider),
    }


def _rule_base(couple) -> str:  # type: ignore[no-untyped-def]
    return f"/api/v1/spaces/{couple['space'].id}/rules"


def _reminder_base(couple) -> str:  # type: ignore[no-untyped-def]
    return f"/api/v1/spaces/{couple['space'].id}/reminders"


def _occurrences(session: Session, reminder_id, account_id):  # type: ignore[no-untyped-def]
    return list(
        session.execute(
            select(ReminderOccurrence)
            .where(
                ReminderOccurrence.reminder_id == reminder_id,
                ReminderOccurrence.recipient_account_id == account_id,
            )
            .order_by(ReminderOccurrence.days_before)
        ).scalars()
    )


def test_rule_catalog_defaults_validation_and_account_isolation(
    client, session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    response = client.get(_rule_base(couple), headers=auth(couple["anna_token"]))
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "private, no-store"
    items = {item["ruleKey"]: item for item in response.json()["items"]}
    assert set(items) == {
        rules.IMPORTANT_DATE_RULE,
        rules.RELATED_PERSON_BIRTHDAY_RULE,
        rules.PARTNER_BIRTHDAY_RULE,
        rules.RELATIONSHIP_ANNIVERSARY_RULE,
        rules.PLAN_START_RULE,
    }
    assert items[rules.IMPORTANT_DATE_RULE]["parameters"]["daysBefore"] == [7, 1]
    assert items[rules.RELATED_PERSON_BIRTHDAY_RULE]["parameters"]["daysBefore"] == [14, 7, 1]
    assert items[rules.PARTNER_BIRTHDAY_RULE]["parameters"]["daysBefore"] == [14, 7, 1]
    assert items[rules.RELATIONSHIP_ANNIVERSARY_RULE]["parameters"]["daysBefore"] == [30, 7, 1]
    assert items[rules.PLAN_START_RULE]["parameters"]["daysBefore"] == [1, 0]

    changed = client.put(
        f"{_rule_base(couple)}/{rules.IMPORTANT_DATE_RULE}/preference",
        json={
            "enabled": False,
            "parameters": {"daysBefore": [3, 1], "localTime": "08:30:00"},
        },
        headers=auth(couple["anna_token"]),
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["enabled"] is False
    assert changed.json()["parameters"] == {
        "daysBefore": [1, 3],
        "localTime": "08:30:00",
    }

    partner = client.get(
        f"{_rule_base(couple)}/{rules.IMPORTANT_DATE_RULE}/preference",
        headers=auth(couple["ben_token"]),
    )
    assert partner.status_code == 200
    assert partner.json()["enabled"] is True
    assert partner.json()["parameters"]["daysBefore"] == [7, 1]

    invalid = client.put(
        f"{_rule_base(couple)}/{rules.IMPORTANT_DATE_RULE}/preference",
        json={"enabled": True, "parameters": {"daysBefore": [1, 1]}},
        headers=auth(couple["anna_token"]),
    )
    assert invalid.status_code == 422
    assert invalid.json()["code"] == rules.RULE_PARAMETERS_INVALID


def test_source_hooks_reconcile_idempotently_and_private_dates_never_generate(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(runtime.clock, "now", lambda: NOW)
    base = f"/api/v1/spaces/{couple['space'].id}/important-dates"
    shared = client.post(
        base,
        json={
            "label": "Shared anniversary",
            "type": "ANNIVERSARY",
            "date": "2026-09-10",
            "repeats": "ANNUALLY",
            "visibility": "SHARED",
        },
        headers=auth(couple["anna_token"]),
    )
    assert shared.status_code == 201, shared.text

    generated = session.execute(
        select(Reminder).where(
            Reminder.space_id == couple["space"].id,
            Reminder.source == ReminderSource.GENERATED.value,
            Reminder.rule_key == rules.IMPORTANT_DATE_RULE,
        )
    ).scalar_one()
    assert generated.source_id is not None
    first_count = session.execute(
        select(func.count())
        .select_from(ReminderOccurrence)
        .where(ReminderOccurrence.reminder_id == generated.id)
    ).scalar_one()
    assert first_count == 4

    runtime.reconcile_space(session, couple["space"].id)
    runtime.reconcile_space(session, couple["space"].id)
    assert (
        session.execute(
            select(func.count())
            .select_from(Reminder)
            .where(
                Reminder.space_id == couple["space"].id,
                Reminder.source == ReminderSource.GENERATED.value,
                Reminder.rule_key == rules.IMPORTANT_DATE_RULE,
            )
        ).scalar_one()
        == 1
    )
    assert (
        session.execute(
            select(func.count())
            .select_from(ReminderOccurrence)
            .where(ReminderOccurrence.reminder_id == generated.id)
        ).scalar_one()
        == first_count
    )

    disabled = client.put(
        f"{_rule_base(couple)}/{rules.IMPORTANT_DATE_RULE}/preference",
        json={"enabled": False, "parameters": {"daysBefore": [7, 1]}},
        headers=auth(couple["anna_token"]),
    )
    assert disabled.status_code == 200, disabled.text
    assert (
        session.execute(
            select(func.count())
            .select_from(ReminderOccurrence)
            .where(
                ReminderOccurrence.reminder_id == generated.id,
                ReminderOccurrence.recipient_account_id == couple["anna"].id,
                ReminderOccurrence.state == OccurrenceState.PENDING.value,
            )
        ).scalar_one()
        == 0
    )
    assert (
        session.execute(
            select(func.count())
            .select_from(ReminderOccurrence)
            .where(
                ReminderOccurrence.reminder_id == generated.id,
                ReminderOccurrence.recipient_account_id == couple["ben"].id,
                ReminderOccurrence.state == OccurrenceState.PENDING.value,
            )
        ).scalar_one()
        == 2
    )
    reenabled = client.put(
        f"{_rule_base(couple)}/{rules.IMPORTANT_DATE_RULE}/preference",
        json={"enabled": True, "parameters": {"daysBefore": [7, 1]}},
        headers=auth(couple["anna_token"]),
    )
    assert reenabled.status_code == 200, reenabled.text
    assert (
        session.execute(
            select(func.count())
            .select_from(ReminderOccurrence)
            .where(
                ReminderOccurrence.reminder_id == generated.id,
                ReminderOccurrence.recipient_account_id == couple["anna"].id,
                ReminderOccurrence.state == OccurrenceState.PENDING.value,
            )
        ).scalar_one()
        == 2
    )

    tightened = client.put(
        f"{base}/{shared.json()['id']}",
        json={
            "label": "Private anniversary",
            "type": "ANNIVERSARY",
            "date": "2026-09-10",
            "repeats": "ANNUALLY",
            "visibility": "PRIVATE",
        },
        headers={
            **auth(couple["anna_token"]),
            "If-Match": f'"{shared.json()["version"]}"',
        },
    )
    assert tightened.status_code == 200, tightened.text
    assert (
        session.execute(
            select(func.count())
            .select_from(Reminder)
            .where(
                Reminder.space_id == couple["space"].id,
                Reminder.rule_key == rules.IMPORTANT_DATE_RULE,
            )
        ).scalar_one()
        == 0
    )

    private = client.post(
        base,
        json={
            "label": "Owner only date",
            "type": "ANNIVERSARY",
            "date": "2026-09-12",
            "repeats": "ANNUALLY",
            "visibility": "PRIVATE",
        },
        headers=auth(couple["anna_token"]),
    )
    assert private.status_code == 201
    runtime.reconcile_space(session, couple["space"].id)
    assert (
        session.execute(
            select(func.count())
            .select_from(Reminder)
            .where(
                Reminder.space_id == couple["space"].id,
                Reminder.rule_key == rules.IMPORTANT_DATE_RULE,
            )
        ).scalar_one()
        == 0
    )


def test_partner_birthday_reconciles_without_self_delivery(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(runtime.clock, "now", lambda: NOW)
    profile_url = f"/api/v1/spaces/{couple['space'].id}/profiles/{couple['anna'].id}"
    initial = client.get(profile_url, headers=auth(couple["anna_token"]))
    assert initial.status_code == 200

    birthday_set = client.patch(
        profile_url,
        json={"birthday": "1992-09-30"},
        headers={**auth(couple["anna_token"]), "If-Match": initial.headers["etag"]},
    )
    assert birthday_set.status_code == 200, birthday_set.text

    reminder = session.execute(
        select(Reminder).where(
            Reminder.space_id == couple["space"].id,
            Reminder.rule_key == rules.PARTNER_BIRTHDAY_RULE,
        )
    ).scalar_one()
    assert reminder.source_type == "ACCOUNT"
    assert reminder.source_id == couple["anna"].id
    assert reminder.annual_month == 9
    assert reminder.annual_day == 30
    assert _occurrences(session, reminder.id, couple["anna"].id) == []
    assert len(
        [
            row
            for row in _occurrences(session, reminder.id, couple["ben"].id)
            if row.state == OccurrenceState.PENDING.value
        ]
    ) == 3

    disabled = client.put(
        f"{_rule_base(couple)}/{rules.PARTNER_BIRTHDAY_RULE}/preference",
        json={"enabled": False, "parameters": {"daysBefore": [14, 7, 1]}},
        headers=auth(couple["ben_token"]),
    )
    assert disabled.status_code == 200
    assert not any(
        row.state == OccurrenceState.PENDING.value
        for row in _occurrences(session, reminder.id, couple["ben"].id)
    )

    changed = client.patch(
        profile_url,
        json={"birthday": "1992-10-01"},
        headers={**auth(couple["anna_token"]), "If-Match": birthday_set.headers["etag"]},
    )
    assert changed.status_code == 200, changed.text
    session.refresh(reminder)
    assert reminder.annual_month == 10
    assert reminder.annual_day == 1
    assert (
        session.execute(
            select(func.count())
            .select_from(Reminder)
            .where(
                Reminder.space_id == couple["space"].id,
                Reminder.rule_key == rules.PARTNER_BIRTHDAY_RULE,
            )
        ).scalar_one()
        == 1
    )

    cleared = client.patch(
        profile_url,
        json={"birthday": None},
        headers={**auth(couple["anna_token"]), "If-Match": changed.headers["etag"]},
    )
    assert cleared.status_code == 200, cleared.text
    assert (
        session.execute(
            select(func.count())
            .select_from(Reminder)
            .where(
                Reminder.space_id == couple["space"].id,
                Reminder.rule_key == rules.PARTNER_BIRTHDAY_RULE,
            )
        ).scalar_one()
        == 0
    )
    assert (
        session.execute(
            select(func.count())
            .select_from(Reminder)
            .where(
                Reminder.space_id == couple["foreign_space"].id,
                Reminder.rule_key == rules.PARTNER_BIRTHDAY_RULE,
            )
        ).scalar_one()
        == 0
    )


def test_plan_and_relationship_source_changes_reconcile_immediately(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(runtime.clock, "now", lambda: NOW)
    plan_base = f"/api/v1/spaces/{couple['space'].id}/plans"
    created = client.post(
        plan_base,
        json={"title": "Dinner"},
        headers=auth(couple["anna_token"]),
    )
    assert created.status_code == 201, created.text
    scheduled = client.post(
        f"{plan_base}/{created.json()['id']}/schedule",
        json={"plannedStart": "2026-09-05T18:00:00Z"},
        headers={
            **auth(couple["anna_token"]),
            "If-Match": f'"{created.json()["version"]}"',
        },
    )
    assert scheduled.status_code == 200, scheduled.text
    plan_reminder = session.execute(
        select(Reminder).where(
            Reminder.space_id == couple["space"].id,
            Reminder.rule_key == rules.PLAN_START_RULE,
        )
    ).scalar_one()
    assert plan_reminder.once_at == datetime(2026, 9, 5, 18, 0, tzinfo=UTC)

    unscheduled = client.post(
        f"{plan_base}/{created.json()['id']}/unschedule",
        json={},
        headers={
            **auth(couple["anna_token"]),
            "If-Match": f'"{scheduled.json()["version"]}"',
        },
    )
    assert unscheduled.status_code == 200, unscheduled.text
    assert (
        session.execute(
            select(func.count())
            .select_from(Reminder)
            .where(
                Reminder.space_id == couple["space"].id,
                Reminder.rule_key == rules.PLAN_START_RULE,
            )
        ).scalar_one()
        == 0
    )

    profile = relationship_profile.load(session, couple["space"].id)
    assert profile is not None
    relationship_profile.update(
        session,
        couple["space"].id,
        expected_version=profile.version,
        relationship_started_on=date(2020, 9, 10),
        show_relationship_duration=True,
        duration_display_mode=DurationDisplayMode.YEARS_MONTHS,
        today=NOW.date(),
    )
    relationship_reminder = session.execute(
        select(Reminder).where(
            Reminder.space_id == couple["space"].id,
            Reminder.rule_key == rules.RELATIONSHIP_ANNIVERSARY_RULE,
        )
    ).scalar_one()
    assert relationship_reminder.annual_month == 9
    assert relationship_reminder.annual_day == 10


def test_time_contracts_and_timezone_replanning(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(runtime.clock, "now", lambda: NOW)
    assert runtime._annual_date(2027, 2, 29) == date(2027, 2, 28)
    berlin = ZoneInfo("Europe/Berlin")
    assert runtime._resolve_local(date(2026, 3, 29), time(2, 30), berlin) == datetime(
        2026, 3, 29, 1, 30, tzinfo=UTC
    )
    assert runtime._resolve_local(date(2026, 10, 25), time(2, 30), berlin) == datetime(
        2026, 10, 25, 0, 30, tzinfo=UTC
    )
    new_york = ZoneInfo("America/New_York")
    assert runtime._resolve_local(date(2026, 3, 8), time(2, 30), new_york) == datetime(
        2026, 3, 8, 7, 30, tzinfo=UTC
    )
    assert runtime._resolve_local(date(2026, 11, 1), time(1, 30), new_york) == datetime(
        2026, 11, 1, 5, 30, tzinfo=UTC
    )

    annual = client.post(
        _reminder_base(couple),
        json={
            "title": "Annual",
            "schedule": {
                "type": "ANNUAL",
                "month": 9,
                "day": 15,
                "localTime": "09:00:00",
            },
            "offsets": [0],
        },
        headers=auth(couple["anna_token"]),
    )
    assert annual.status_code == 201, annual.text
    annual_row = _occurrences(session, annual.json()["id"], couple["anna"].id)[0]
    before = annual_row.due_at
    generation = annual_row.generation

    account_preferences.set_preferences(session, couple["anna"], timezone="America/New_York")
    session.refresh(annual_row)
    assert annual_row.due_at != before
    assert annual_row.generation == generation + 1

    once = client.post(
        _reminder_base(couple),
        json={
            "title": "Absolute",
            "schedule": {"type": "ONCE", "at": "2026-09-20T12:00:00Z"},
            "offsets": [0],
        },
        headers=auth(couple["anna_token"]),
    )
    assert once.status_code == 201, once.text
    once_row = _occurrences(session, once.json()["id"], couple["anna"].id)[0]
    once_due = once_row.due_at
    account_preferences.set_preferences(session, couple["anna"], timezone="Asia/Tokyo")
    session.refresh(once_row)
    assert once_row.due_at == once_due


def test_relationship_day_count_replans_for_start_and_timezone(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(runtime.clock, "now", lambda: NOW)
    profile = relationship_profile.load(session, couple["space"].id)
    assert profile is not None
    relationship_profile.update(
        session,
        couple["space"].id,
        expected_version=profile.version,
        relationship_started_on=date(2026, 8, 25),
        show_relationship_duration=True,
        duration_display_mode=DurationDisplayMode.YEARS_MONTHS,
        today=NOW.date(),
    )
    reminder = client.post(
        _reminder_base(couple),
        json={
            "title": "Day ten",
            "schedule": {
                "type": "RELATIONSHIP_DAY_COUNT",
                "dayCount": 10,
                "localTime": "09:00:00",
            },
            "offsets": [0],
        },
        headers=auth(couple["anna_token"]),
    )
    assert reminder.status_code == 201, reminder.text
    first = next(
        row
        for row in _occurrences(session, reminder.json()["id"], couple["anna"].id)
        if row.state == OccurrenceState.PENDING.value
    )
    assert first.due_at == datetime(2026, 9, 3, 7, 0, tzinfo=UTC)

    profile = relationship_profile.load(session, couple["space"].id)
    assert profile is not None
    relationship_profile.update(
        session,
        couple["space"].id,
        expected_version=profile.version,
        relationship_started_on=date(2026, 8, 26),
        show_relationship_duration=True,
        duration_display_mode=DurationDisplayMode.YEARS_MONTHS,
        today=NOW.date(),
    )
    pending = [
        row
        for row in _occurrences(session, reminder.json()["id"], couple["anna"].id)
        if row.state == OccurrenceState.PENDING.value
    ]
    assert len(pending) == 1
    assert pending[0].due_at == datetime(2026, 9, 4, 7, 0, tzinfo=UTC)

    account_preferences.set_preferences(session, couple["anna"], timezone="America/New_York")
    session.refresh(pending[0])
    assert pending[0].due_at == datetime(2026, 9, 4, 13, 0, tzinfo=UTC)


def test_due_handler_catchup_and_m4b_projection_are_idempotent(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(runtime.clock, "now", lambda: NOW)
    created = client.post(
        _reminder_base(couple),
        json={
            "title": "Protected reminder prose",
            "description": "Must never enter the Outbox or PushDelivery",
            "schedule": {"type": "ONCE", "at": "2026-08-30T13:00:00Z"},
            "offsets": [0],
        },
        headers=auth(couple["anna_token"]),
    )
    assert created.status_code == 201, created.text
    occurrence = _occurrences(session, created.json()["id"], couple["anna"].id)[0]
    push.register_endpoint(
        session,
        account_id=couple["anna"].id,
        provider_key="test-provider",
        endpoint_value="endpoint://anna",
    )

    monkeypatch.setattr(runtime.clock, "now", lambda: occurrence.due_at)
    payload = {"occurrenceId": str(occurrence.id), "generation": occurrence.generation}
    runtime.handle_occurrence(session, payload)
    runtime.handle_occurrence(session, payload)
    session.flush()
    session.refresh(occurrence)
    assert occurrence.state == OccurrenceState.DELIVERED.value

    events = [
        event
        for event in session.execute(
            select(OutboxEvent).where(
                OutboxEvent.event_type == EventType.REMINDER_DUE.value,
                OutboxEvent.subject_id == occurrence.reminder_id,
            )
        ).scalars()
        if event.payload.occurrence_id == occurrence.id
    ]
    assert len(events) == 1
    event = events[0]
    safe_payload = event.payload.model_dump(mode="json", exclude_none=True)
    assert set(safe_payload) <= {"recipient_id", "occurrence_id", "due_at", "rule_key"}
    assert "Protected reminder prose" not in str(safe_payload)
    assert "Must never enter" not in str(safe_payload)

    engagement_service.project_event(session, event)
    engagement_service.project_event(session, event)
    session.flush()
    notifications = list(
        session.execute(
            select(Notification).where(
                Notification.source_event_id == event.id,
                Notification.kind == NotificationKind.REMINDER_DUE.value,
            )
        ).scalars()
    )
    assert len(notifications) == 1
    assert (
        session.execute(
            select(func.count())
            .select_from(PushDelivery)
            .where(PushDelivery.notification_id == notifications[0].id)
        ).scalar_one()
        == 1
    )

    stale_now = occurrence.due_at + timedelta(hours=25)
    occurrence.state = OccurrenceState.PENDING.value
    occurrence.generation += 1
    occurrence.due_at = stale_now - timedelta(hours=25)
    monkeypatch.setattr(runtime.clock, "now", lambda: stale_now)
    stale_payload = {
        "occurrenceId": str(occurrence.id),
        "generation": occurrence.generation,
    }
    runtime.handle_occurrence(session, stale_payload)
    assert occurrence.state == OccurrenceState.EXPIRED.value
    assert (
        session.execute(
            select(func.count())
            .select_from(OutboxEvent)
            .where(
                OutboxEvent.event_type == EventType.REMINDER_DUE.value,
                OutboxEvent.subject_id == occurrence.reminder_id,
            )
        ).scalar_one()
        == 1
    )
