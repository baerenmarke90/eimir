"""PostgreSQL/HTTP evidence for the M4-C Reminder definition slice."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.orm import Session

from eimir.authorization import PrivacyClass
from eimir.relationship import service as relationship_service
from eimir.reminders import service
from eimir.reminders.models import (
    Reminder,
    ReminderPayload,
    ReminderScheduleType,
    ReminderSource,
)
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

NOW = datetime(2026, 8, 30, 12, 0, tzinfo=UTC)

ANNUAL = {
    "type": "ANNUAL",
    "month": 2,
    "day": 29,
    "localTime": "09:00:00",
}


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


def _base(couple) -> str:  # type: ignore[no-untyped-def]
    return f"/api/v1/spaces/{couple['space'].id}/reminders"


def _create(client, couple, *, offsets: list[int] | None = None):  # type: ignore[no-untyped-def]
    return client.post(
        _base(couple),
        json={
            "title": "Jahrestag vorbereiten",
            "description": "Gemeinsame Erinnerung",
            "schedule": ANNUAL,
            "offsets": offsets if offsets is not None else [7, 1],
        },
        headers=auth(couple["anna_token"]),
    )


def test_manual_reminder_is_shared_but_preference_is_account_scoped(
    client, session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    created = _create(client, couple, offsets=[7, 1, 30])
    assert created.status_code == 201, created.text
    assert created.headers["cache-control"] == "private, no-store"
    body = created.json()
    assert body["source"] == "MANUAL"
    assert body["createdBy"] == str(couple["anna"].id)
    assert body["offsets"] == [1, 7, 30]
    assert body["schedule"] == ANNUAL
    assert body["muted"] is False
    assert body["capabilities"]["canEdit"] is True
    reminder_id = body["id"]

    partner = client.get(
        f"{_base(couple)}/{reminder_id}",
        headers=auth(couple["ben_token"]),
    )
    assert partner.status_code == 200
    assert partner.json()["id"] == reminder_id
    assert partner.json()["muted"] is False

    muted = client.put(
        f"{_base(couple)}/{reminder_id}/preference",
        json={"muted": True},
        headers=auth(couple["anna_token"]),
    )
    assert muted.status_code == 200
    assert muted.headers["cache-control"] == "private, no-store"
    assert muted.json() == {"reminderId": reminder_id, "muted": True}

    anna_view = client.get(_base(couple), headers=auth(couple["anna_token"]))
    ben_view = client.get(_base(couple), headers=auth(couple["ben_token"]))
    assert anna_view.status_code == ben_view.status_code == 200
    assert anna_view.json()["items"][0]["muted"] is True
    assert ben_view.json()["items"][0]["muted"] is False


def test_partner_can_update_and_offset_only_change_advances_parent_version(
    client, session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    created = _create(client, couple, offsets=[7])
    assert created.status_code == 201
    reminder_id = created.json()["id"]
    initial_version = created.json()["version"]

    updated = client.put(
        f"{_base(couple)}/{reminder_id}",
        json={
            "title": created.json()["title"],
            "description": created.json()["description"],
            "schedule": created.json()["schedule"],
            "offsets": [1, 7],
        },
        headers={**auth(couple["ben_token"]), "If-Match": f'"{initial_version}"'},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["offsets"] == [1, 7]
    assert updated.json()["version"] == initial_version + 1

    stale = client.put(
        f"{_base(couple)}/{reminder_id}",
        json={
            "title": "Stale write",
            "description": None,
            "schedule": created.json()["schedule"],
            "offsets": [0],
        },
        headers={**auth(couple["anna_token"]), "If-Match": f'"{initial_version}"'},
    )
    assert stale.status_code == 409
    assert stale.json()["code"] == "RESOURCE_VERSION_CONFLICT"


def test_once_requires_offset_aware_future_instant(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(service.clock, "now", lambda: NOW)

    naive = client.post(
        _base(couple),
        json={
            "title": "Naive",
            "schedule": {"type": "ONCE", "at": "2026-08-31T12:00:00"},
            "offsets": [0],
        },
        headers=auth(couple["anna_token"]),
    )
    assert naive.status_code == 422
    assert naive.json()["code"] == service.REMINDER_ONCE_TIMEZONE_REQUIRED

    past = client.post(
        _base(couple),
        json={
            "title": "Past",
            "schedule": {"type": "ONCE", "at": "2026-08-30T11:59:59Z"},
            "offsets": [0],
        },
        headers=auth(couple["anna_token"]),
    )
    assert past.status_code == 422
    assert past.json()["code"] == service.REMINDER_ONCE_IN_PAST

    future_at = NOW + timedelta(days=1)
    valid = client.post(
        _base(couple),
        json={
            "title": "Future",
            "schedule": {"type": "ONCE", "at": future_at.isoformat()},
            "offsets": [0],
        },
        headers=auth(couple["anna_token"]),
    )
    assert valid.status_code == 201, valid.text
    assert valid.json()["schedule"]["at"] == "2026-08-31T12:00:00Z"


def test_annual_accepts_february_29_but_rejects_invalid_calendar_date(
    client, session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    leap = _create(client, couple)
    assert leap.status_code == 201
    assert leap.json()["schedule"]["month"] == 2
    assert leap.json()["schedule"]["day"] == 29

    invalid = client.post(
        _base(couple),
        json={
            "title": "Invalid date",
            "schedule": {
                "type": "ANNUAL",
                "month": 2,
                "day": 30,
                "localTime": "09:00:00",
            },
            "offsets": [1],
        },
        headers=auth(couple["anna_token"]),
    )
    assert invalid.status_code == 422
    assert invalid.json()["code"] == service.REMINDER_SCHEDULE_INVALID


def test_relationship_day_count_and_offset_bounds_are_validated(
    client, session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    relationship = client.post(
        _base(couple),
        json={
            "title": "100 Tage",
            "schedule": {
                "type": "RELATIONSHIP_DAY_COUNT",
                "dayCount": 100,
                "localTime": "09:00:00",
            },
            "offsets": [0, 7],
        },
        headers=auth(couple["anna_token"]),
    )
    assert relationship.status_code == 201
    assert relationship.json()["schedule"]["dayCount"] == 100

    bad_day_count = client.post(
        _base(couple),
        json={
            "title": "Invalid day count",
            "schedule": {
                "type": "RELATIONSHIP_DAY_COUNT",
                "dayCount": 0,
                "localTime": "09:00:00",
            },
            "offsets": [0],
        },
        headers=auth(couple["anna_token"]),
    )
    assert bad_day_count.status_code == 422
    assert bad_day_count.json()["code"] == service.REMINDER_SCHEDULE_INVALID

    bad_offset = client.post(
        _base(couple),
        json={
            "title": "Invalid offset",
            "schedule": ANNUAL,
            "offsets": [366],
        },
        headers=auth(couple["anna_token"]),
    )
    assert bad_offset.status_code == 422
    assert bad_offset.json()["code"] == service.REMINDER_OFFSET_INVALID

    duplicate_offset = client.post(
        _base(couple),
        json={
            "title": "Duplicate offset",
            "schedule": ANNUAL,
            "offsets": [7, 7],
        },
        headers=auth(couple["anna_token"]),
    )
    assert duplicate_offset.status_code == 422
    assert duplicate_offset.json()["code"] == service.REMINDER_OFFSET_DUPLICATE


def test_generated_reminder_is_not_manually_mutable(client, session: Session, couple) -> None:  # type: ignore[no-untyped-def]
    generated = Reminder(
        space_id=couple["space"].id,
        owner_id=couple["anna"].id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        source=ReminderSource.GENERATED.value,
        source_type="IMPORTANT_DATE",
        source_id=couple["space"].id,
        rule_key="important_date_reminder",
        schedule_type=ReminderScheduleType.ANNUAL.value,
        annual_month=9,
        annual_day=1,
        local_time=datetime.strptime("09:00:00", "%H:%M:%S").time(),
        payload=ReminderPayload(title="Generated"),
    )
    session.add(generated)
    session.flush()

    response = client.put(
        f"{_base(couple)}/{generated.id}",
        json={
            "title": "Manual overwrite",
            "schedule": {
                "type": "ANNUAL",
                "month": 9,
                "day": 1,
                "localTime": "09:00:00",
            },
            "offsets": [1],
        },
        headers={**auth(couple["ben_token"]), "If-Match": f'"{generated.version}"'},
    )
    assert response.status_code == 409
    assert response.json()["code"] == service.REMINDER_GENERATED_IMMUTABLE


def test_foreign_space_preference_does_not_reveal_reminder(
    client, session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    created = _create(client, couple)
    assert created.status_code == 201
    reminder_id = created.json()["id"]

    foreign = client.put(
        f"/api/v1/spaces/{couple['foreign_space'].id}/reminders/{reminder_id}/preference",
        json={"muted": True},
        headers=auth(couple["outsider_token"]),
    )
    assert foreign.status_code == 404
    assert foreign.json()["code"] == "REMINDER_NOT_FOUND"
