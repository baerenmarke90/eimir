"""Calendar sync lifecycle across API, Outbox projection and jobs (#1895)."""

from __future__ import annotations

from datetime import date
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.calendar_sync import ical, service
from eimir.calendar_sync.models import CalendarConnection, PlanCalendarLink
from eimir.config import get_settings
from eimir.core.clock import now
from eimir.engagement import service as engagement
from eimir.entitlements import service as entitlements
from eimir.entitlements.models import Capability, EntitlementSourceType, EntitlementStatus
from eimir.jobs.errors import RetryableJobError
from eimir.jobs.models import Job, JobStatus
from eimir.providers.calendar import CalendarEvent
from eimir.relationship.offboarding import leave_space
from eimir.relationship.service import add_member
from tests.conftest import auth, make_account, make_space, requires_database, sign_in
from tests.support.fake_caldav import FakeCalDavServer, install, unreachable

pytestmark = [pytest.mark.integration, requires_database]
SHARED = "/calendars/anna/shared/"


@pytest.fixture(autouse=True)
def configured(encryption, monkeypatch):  # type: ignore[no-untyped-def]
    encryption.apply("required")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def server(monkeypatch: pytest.MonkeyPatch) -> FakeCalDavServer:
    fake = FakeCalDavServer()
    install(monkeypatch, fake)
    return fake


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna, ben, outsider = [make_account(session, name) for name in ("Anna", "Ben", "Outsider")]
    space = make_space(session, anna)
    add_member(session, space.id, ben)
    other = make_space(session, outsider)
    session.flush()
    return {
        "anna": anna,
        "ben": ben,
        "space": space,
        "other": other,
        "a": auth(sign_in(session, anna)),
        "b": auth(sign_in(session, ben)),
        "out": auth(sign_in(session, outsider)),
    }


def grant(session: Session, couple: dict[str, Any]) -> Any:
    return entitlements.record_grant(
        session,
        space_id=couple["space"].id,
        account_id=couple["anna"].id,
        source_type=EntitlementSourceType.TEST_FIXTURE,
        status=EntitlementStatus.ACTIVE,
        effective_from=now(),
        capabilities=[Capability.INTEGRATION_EXTERNAL_SYNC.value],
    )


def base(couple: dict[str, Any]) -> str:
    return f"/api/v1/spaces/{couple['space'].id}"


def drain(session: Session, *, rounds: int = 6) -> None:
    """Run the Outbox projection and calendar jobs like the worker would."""
    handlers = {service.PLAN_JOB: service.sync_plan, service.SPACE_JOB: service.sync_space}
    for _ in range(rounds):
        engagement.project_pending(session, limit=200)
        jobs = list(
            session.execute(
                select(Job)
                .where(Job.kind.in_(handlers), Job.status == JobStatus.PENDING.value)
                .order_by(Job.created_at, Job.id)
            ).scalars()
        )
        if not jobs:
            return
        for job in jobs:
            job.status = JobStatus.SUCCEEDED.value
            try:
                handlers[job.kind](session, dict(job.payload))
            except RetryableJobError:
                job.status = JobStatus.FAILED.value
            session.flush()


def connect(client, couple, headers="a"):  # type: ignore[no-untyped-def]
    return client.post(
        base(couple) + "/calendar-sync/connections/caldav",
        json={
            "url": "https://dav.example.org/",
            "username": "anna",
            "password": "app-password",
            "consent": True,
        },
        headers=couple[headers],
    )


def state(client, couple, headers="a") -> dict[str, Any]:  # type: ignore[no-untyped-def]
    response = client.get(base(couple) + "/calendar-sync", headers=couple[headers])
    assert response.status_code == 200, response.text
    return response.json()


def activate(client, session, couple) -> dict[str, Any]:  # type: ignore[no-untyped-def]
    created = connect(client, couple)
    assert created.status_code == 201, created.text
    view = state(client, couple)
    response = client.put(
        base(couple) + "/calendar-sync/target",
        json={"connectionId": created.json()["connection"]["id"], "calendarRef": SHARED},
        headers={**couple["a"], "If-Match": f'"{view["targetToken"]}"'},
    )
    assert response.status_code == 200, response.text
    drain(session)
    return response.json()


def plan(client, couple, headers="a", **schedule: str) -> dict[str, Any]:  # type: ignore[no-untyped-def]
    response = client.post(
        base(couple) + "/plans",
        json={
            "title": "Gemeinsam frühstücken",
            "schedule": schedule or {"plannedOn": "2031-06-14"},
        },
        headers=couple[headers],
    )
    assert response.status_code == 201, response.text
    return response.json()


def link_of(session: Session, plan_id: str) -> PlanCalendarLink | None:
    return session.execute(
        select(PlanCalendarLink).where(PlanCalendarLink.plan_id == plan_id)
    ).scalar_one_or_none()


def test_free_space_cannot_connect_and_handoff_stays_free(client, session, couple, server) -> None:  # type: ignore[no-untyped-def]
    assert connect(client, couple).status_code == 403
    view = state(client, couple)
    assert (view["available"], view["canSync"], view["target"]) == (True, False, None)
    assert server.requests == []


def test_both_partners_plans_sync_once_into_the_shared_calendar(  # type: ignore[no-untyped-def]
    client, session, couple, server
) -> None:
    grant(session, couple)
    activate(client, session, couple)
    first = plan(
        client,
        couple,
        "a",
        plannedStart="2031-06-14T10:00:00+02:00",
        plannedEnd="2031-06-14T11:00:00+02:00",
    )
    second = plan(client, couple, "b", plannedOn="2031-06-20", plannedUntil="2031-06-22")
    drain(session)
    drain(session)  # a repeated pass must not duplicate anything
    events = server.events(SHARED)
    assert len(events) == 2
    bodies = b"".join(body for _, body in events.values())
    assert b"DTSTART:20310614T080000Z" in bodies
    assert b"DTSTART;VALUE=DATE:20310620" in bodies and b"DTEND;VALUE=DATE:20310623" in bodies
    for created in (first, second):
        assert link_of(session, created["id"]).state == "SYNCED"  # type: ignore[union-attr]

    # Both partners see the same shared status; only the sponsor sees credentials metadata.
    ben = state(client, couple, "b")
    assert ben["target"]["calendarName"] == "Unser Kalender"
    assert ben["target"]["sponsoredByMe"] is False
    assert ben["target"]["connectionId"] is None
    assert ben["connections"] == []
    assert "app-password" not in str(state(client, couple))
    assert ben["target"]["syncedCount"] == 2


@pytest.mark.parametrize("edited_in_calendar", [False, True])
def test_full_sync_backfills_a_link_with_the_stored_provider_version(  # type: ignore[no-untyped-def]
    client, session, couple, server, edited_in_calendar: bool
) -> None:
    grant(session, couple)
    activate(client, session, couple)
    created = plan(client, couple)
    drain(session)
    link = link_of(session, created["id"])
    assert link is not None
    [event_path] = server.events(SHARED)
    legacy = ical.render(
        CalendarEvent(
            uid=link.payload.uid,
            title=created["title"],
            description=None,
            location=None,
            sequence=created["version"],
            start_date=date(2031, 6, 14),
            end_date=date(2031, 6, 15),
        )
    )
    server.edit_externally(event_path, legacy)
    old_etag, _ = server.events(SHARED)[event_path]
    link.payload = link.payload.model_copy(update={"provider_version": old_etag})
    link.backlink_plan_version = None
    session.flush()
    if edited_in_calendar:
        server.edit_externally(event_path, legacy.replace(b"SUMMARY:", b"SUMMARY:Changed "))
    before = server.events(SHARED)[event_path]

    response = client.post(base(couple) + "/calendar-sync/sync", headers=couple["b"])
    assert response.status_code == 202, response.text
    drain(session)
    assert list(server.events(SHARED)) == [event_path]
    refreshed = server.events(SHARED)[event_path]
    if edited_in_calendar:
        assert refreshed == before
        assert (link.state, link.reason) == ("CONFLICT", "EVENT_CHANGED")
        return

    assert refreshed[0] != old_etag
    body = refreshed[1].replace(b"\r\n ", b"").decode()
    assert f"In eimir. öffnen · {get_settings().public_base_url.rstrip('/')}/p/" in body
    assert link.backlink_plan_version == link.synced_plan_version == created["version"]

    response = client.post(base(couple) + "/calendar-sync/sync", headers=couple["b"])
    assert response.status_code == 202, response.text
    drain(session)
    assert server.events(SHARED)[event_path] == refreshed


def test_marking_a_plan_discreet_removes_its_calendar_backlink(  # type: ignore[no-untyped-def]
    client, session, couple, server
) -> None:
    grant(session, couple)
    activate(client, session, couple)
    created = plan(client, couple)
    drain(session)
    [event_path] = server.events(SHARED)
    assert b"\r\nURL:" in server.events(SHARED)[event_path][1]

    response = client.patch(
        base(couple) + f"/plans/{created['id']}",
        json={"discreet": True, "description": "Private notes"},
        headers={**couple["b"], "If-Match": f'"{created["version"]}"'},
    )
    assert response.status_code == 200, response.text
    drain(session)
    [(_, body)] = server.events(SHARED).values()
    assert b"\r\nURL:" not in body
    assert b"\r\nDESCRIPTION" not in body
    link = link_of(session, created["id"])
    assert link is not None and link.backlink_plan_version is None


def test_edits_update_the_same_event_and_external_changes_are_never_overwritten(  # type: ignore[no-untyped-def]
    client, session, couple, server
) -> None:
    grant(session, couple)
    activate(client, session, couple)
    created = plan(client, couple)
    drain(session)
    [event_path] = list(server.events(SHARED))
    renamed = client.patch(
        base(couple) + f"/plans/{created['id']}",
        json={"title": "Brunch am See"},
        headers={**couple["b"], "If-Match": f'"{created["version"]}"'},
    )
    assert renamed.status_code == 200, renamed.text
    drain(session)
    assert list(server.events(SHARED)) == [event_path]
    assert b"SUMMARY:Brunch am See" in server.events(SHARED)[event_path][1]

    server.edit_externally(
        event_path, b"BEGIN:VCALENDAR\r\nSUMMARY:Arzttermin\r\nEND:VCALENDAR\r\n"
    )
    again = client.patch(
        base(couple) + f"/plans/{created['id']}",
        json={"title": "Brunch zu dritt"},
        headers={**couple["a"], "If-Match": f'"{renamed.json()["version"]}"'},
    )
    assert again.status_code == 200
    drain(session)
    assert b"Arzttermin" in server.events(SHARED)[event_path][1]
    view = state(client, couple, "b")
    assert view["target"]["conflicts"] == [{"planId": created["id"], "reason": "EVENT_CHANGED"}]
    status = client.get(base(couple) + f"/calendar-sync/plans/{created['id']}", headers=couple["b"])
    assert status.json()["state"] == "CONFLICT"

    resolved = client.post(
        base(couple) + f"/calendar-sync/plans/{created['id']}/resolve",
        json={"action": "OVERWRITE"},
        headers=couple["b"],
    )
    assert resolved.status_code == 200, resolved.text
    drain(session)
    assert b"SUMMARY:Brunch zu dritt" in server.events(SHARED)[event_path][1]
    assert link_of(session, created["id"]).state == "SYNCED"  # type: ignore[union-attr]


def test_ambiguous_create_and_outages_never_duplicate(  # type: ignore[no-untyped-def]
    client, session, couple, server
) -> None:
    grant(session, couple)
    activate(client, session, couple)
    created = plan(client, couple)
    server.fail_next = [unreachable()]
    drain(session, rounds=1)
    assert link_of(session, created["id"]).state == "PENDING"  # type: ignore[union-attr]
    assert server.events(SHARED) == {}

    # The provider stored the event, but eimir. never saw the answer.
    link = link_of(session, created["id"])
    assert link is not None
    service.provider_for(_connection(session)).create_event(
        SHARED,
        CalendarEvent(
            uid=link.payload.uid,
            title="Gemeinsam frühstücken",
            description=None,
            location=None,
            sequence=1,
            start_date=date(2031, 6, 14),
            end_date=date(2031, 6, 15),
        ),
    )
    service.request_space_sync(session, couple["space"].id)
    drain(session)
    assert len(server.events(SHARED)) == 1
    assert link_of(session, created["id"]).state == "SYNCED"  # type: ignore[union-attr]


def _connection(session: Session) -> CalendarConnection:
    return session.execute(select(CalendarConnection)).scalars().one()


def test_deleting_a_plan_removes_only_an_unchanged_managed_event(  # type: ignore[no-untyped-def]
    client, session, couple, server
) -> None:
    grant(session, couple)
    activate(client, session, couple)
    kept, removed = plan(client, couple), plan(client, couple, "b")
    drain(session)
    paths = {link_of(session, item["id"]).payload.event_ref: item for item in (kept, removed)}  # type: ignore[union-attr]
    kept_path = next(path for path, item in paths.items() if item is kept)
    server.edit_externally(kept_path)
    foreign = "/calendars/anna/shared/someone-else.ics"
    server.events(SHARED)[foreign] = (
        '"foreign"',
        b"BEGIN:VCALENDAR\r\nUID:foreign\r\nEND:VCALENDAR\r\n",
    )
    for item in (kept, removed):
        response = client.delete(
            base(couple) + f"/plans/{item['id']}",
            headers={**couple["a"], "If-Match": f'"{item["version"]}"'},
        )
        assert response.status_code == 204, response.text
    drain(session)
    assert set(server.events(SHARED)) == {kept_path, foreign}
    assert link_of(session, removed["id"]) is None
    assert link_of(session, kept["id"]).state == "KEPT"  # type: ignore[union-attr]
    assert state(client, couple)["target"]["keptCount"] == 1


def test_pro_expiry_pauses_sync_but_keeps_events_and_disconnect(  # type: ignore[no-untyped-def]
    client, session, couple, server
) -> None:
    grant_row = grant(session, couple)
    activate(client, session, couple)
    plan(client, couple)
    drain(session)
    assert len(server.events(SHARED)) == 1
    entitlements.revoke_grant(session, grant_row.id, reason="test")
    session.flush()
    plan(client, couple)
    drain(session)
    assert len(server.events(SHARED)) == 1
    view = state(client, couple)
    assert (view["target"]["status"], view["target"]["statusReason"]) == (
        "SUSPENDED",
        "PRO_REQUIRED",
    )
    connection_id = view["connections"][0]["id"]
    removed = client.delete(
        base(couple) + f"/calendar-sync/connections/{connection_id}", headers=couple["a"]
    )
    assert removed.status_code == 204
    assert state(client, couple)["target"] is None
    assert len(server.events(SHARED)) == 1


def test_either_partner_pauses_but_only_the_sponsor_holds_credentials(  # type: ignore[no-untyped-def]
    client, session, couple, server
) -> None:
    grant(session, couple)
    view = activate(client, session, couple)
    paused = client.post(
        base(couple) + "/calendar-sync/target/pause",
        headers={**couple["b"], "If-Match": f'"{view["targetToken"]}"'},
    )
    assert paused.status_code == 200, paused.text
    plan(client, couple)
    drain(session)
    assert server.events(SHARED) == {}
    connection_id = state(client, couple)["connections"][0]["id"]
    for method in ("get", "delete"):
        suffix = "/calendars" if method == "get" else ""
        response = getattr(client, method)(
            base(couple) + f"/calendar-sync/connections/{connection_id}{suffix}",
            headers=couple["b"],
        )
        assert response.status_code == 404
    resumed = client.post(
        base(couple) + "/calendar-sync/target/resume",
        headers={**couple["b"], "If-Match": f'"{paused.json()["targetToken"]}"'},
    )
    assert resumed.status_code == 200, resumed.text
    drain(session)
    assert len(server.events(SHARED)) == 1


def test_other_spaces_cannot_read_or_use_the_target(client, session, couple, server) -> None:  # type: ignore[no-untyped-def]
    grant(session, couple)
    activate(client, session, couple)
    response = client.get(base(couple) + "/calendar-sync", headers=couple["out"])
    assert response.status_code == 404
    foreign = client.get(
        f"/api/v1/spaces/{couple['other'].id}/calendar-sync", headers=couple["out"]
    ).json()
    assert foreign["target"] is None and foreign["connections"] == []


def test_a_sponsor_leaving_the_space_ends_the_target(client, session, couple, server) -> None:  # type: ignore[no-untyped-def]
    grant(session, couple)
    activate(client, session, couple)
    leave_space(session, couple["anna"], couple["space"].id)
    session.flush()
    assert state(client, couple, "b")["target"] is None


def test_wrong_credentials_and_unwritable_calendars_are_explained(  # type: ignore[no-untyped-def]
    client, session, couple, server
) -> None:
    grant(session, couple)
    server.password = "rotated"
    failed = connect(client, couple)
    assert (failed.status_code, failed.json()["code"]) == (422, "CALENDAR_AUTH_FAILED")
    server.password = "app-password"
    server.add_calendar("work", "Arbeit", writable=False)
    created = connect(client, couple).json()
    view = state(client, couple)
    denied = client.put(
        base(couple) + "/calendar-sync/target",
        json={"connectionId": created["connection"]["id"], "calendarRef": "/calendars/anna/work/"},
        headers={**couple["a"], "If-Match": f'"{view["targetToken"]}"'},
    )
    assert (denied.status_code, denied.json()["code"]) == (422, "CALENDAR_NOT_WRITABLE")
    invented = client.put(
        base(couple) + "/calendar-sync/target",
        json={"connectionId": created["connection"]["id"], "calendarRef": "/elsewhere/"},
        headers={**couple["a"], "If-Match": f'"{view["targetToken"]}"'},
    )
    assert invented.json()["code"] == "CALENDAR_NOT_FOUND"


def test_without_the_plugin_a_leaving_sponsor_takes_the_target_along(  # type: ignore[no-untyped-def]
    client, session, couple, server
) -> None:
    from sqlalchemy import func, select

    from eimir.calendar_sync.models import SpaceCalendarTarget
    from tests.support.plugins import without_plugins

    grant(session, couple)
    activate(client, session, couple)
    targets = select(func.count()).select_from(SpaceCalendarTarget)
    assert session.scalar(targets) == 1
    with without_plugins():
        leave_space(session, couple["anna"], couple["space"].id)
    session.flush()
    assert session.scalar(targets) == 0
