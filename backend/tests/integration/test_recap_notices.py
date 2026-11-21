"""Recap readiness notices and late-entry detection on real PostgreSQL (#1744).

The scan, composition and announcement jobs are driven by hand with a frozen
application clock. The database clock (``updated_at`` of sources, the
composition's ``material_at``) is one transaction here, so tests that weigh a
new version move the retained composition time back explicitly.
"""

from __future__ import annotations

import json
from datetime import UTC, date, datetime, time
from uuid import UUID

import pytest
from sqlalchemy import func, select

from eimir.authorization import AuthorizationContext
from eimir.core import clock
from eimir.engagement import push, push_preview
from eimir.engagement import service as engagement
from eimir.engagement.models import Notification, NotificationKind, PushDelivery
from eimir.entitlements.models import EntitlementStatus
from eimir.jobs.errors import DeferredJobError
from eimir.jobs.models import Job, JobStatus
from eimir.memories.models import MemoryPayload
from eimir.outbox.models import OutboxEvent
from eimir.recaps import composer, freshness, jobs, notices
from eimir.recaps.models import RecapEdition, RecapSource
from tests.conftest import requires_database
from tests.integration.test_recap_film import picture, titled
from tests.integration.test_relationship_recaps import context as context
from tests.integration.test_thinking_push import FakePushProvider

pytestmark = [pytest.mark.integration, requires_database]

RECAP_KINDS = (NotificationKind.RECAP_READY.value, NotificationKind.RECAP_GREW.value)


@pytest.fixture
def couple(context):  # type: ignore[no-untyped-def]
    # The grant outlives every simulated date of these tests.
    context["grant"].effective_until = datetime(2027, 6, 1, tzinfo=UTC)
    return context


def at(monkeypatch, value: datetime) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(clock, "now", lambda: value)


def compose_pending(session) -> int:  # type: ignore[no-untyped-def]
    """Run every waiting composition, including ones a composition queues."""
    count = 0
    while True:
        waiting = session.scalars(
            select(Job)
            .where(Job.kind == composer.GENERATE_JOB, Job.status == JobStatus.PENDING.value)
            .order_by(Job.created_at, Job.id)
        ).all()
        if not waiting:
            return count
        for job in waiting:
            job.status = JobStatus.SUCCEEDED.value
            session.flush()
            jobs.generate(session, job.payload)
            session.flush()
            count += 1


def waiting_compositions(session, kind: str, year: int, month: int) -> int:  # type: ignore[no-untyped-def]
    """Waiting compositions of one period; running periods recompose daily anyway."""
    ids = {
        UUID(payload["edition_id"])
        for payload in session.scalars(
            select(Job.payload).where(
                Job.kind == composer.GENERATE_JOB, Job.status == JobStatus.PENDING.value
            )
        )
    }
    return session.scalar(
        select(func.count(RecapEdition.id)).where(
            RecapEdition.id.in_(ids),
            RecapEdition.kind == kind,
            RecapEdition.year == year,
            RecapEdition.month == month,
        )
    )


def scan(session) -> None:  # type: ignore[no-untyped-def]
    jobs.scan(session, {})
    session.flush()


def settle(session) -> None:  # type: ignore[no-untyped-def]
    """A scan followed by every composition it queued."""
    scan(session)
    compose_pending(session)


def announce(session) -> None:  # type: ignore[no-untyped-def]
    for job in session.scalars(
        select(Job).where(Job.kind == notices.ANNOUNCE_JOB, Job.status == JobStatus.PENDING.value)
    ).all():
        job.status = JobStatus.SUCCEEDED.value
        session.flush()
        notices.announce(session, job.payload)
        session.flush()
    for event in session.scalars(select(OutboxEvent).order_by(OutboxEvent.created_at)):
        engagement.project_event(session, event)
    session.flush()


def recap_notices(session):  # type: ignore[no-untyped-def]
    return session.scalars(
        select(Notification)
        .where(Notification.kind.in_(RECAP_KINDS))
        .order_by(Notification.created_at, Notification.recipient_account_id)
    ).all()


def editions(session, kind: str, year: int, month: int):  # type: ignore[no-untyped-def]
    return session.scalars(
        select(RecapEdition)
        .where(RecapEdition.kind == kind, RecapEdition.year == year, RecapEdition.month == month)
        .order_by(RecapEdition.created_at)
        .execution_options(populate_existing=True)
    ).all()


def sources(session, edition: RecapEdition) -> set[str]:  # type: ignore[no-untyped-def]
    return {
        f"{kind}:{source_id}"
        for kind, source_id in session.execute(
            select(RecapSource.kind, RecapSource.source_id).where(
                RecapSource.edition_id == edition.id
            )
        )
    }


def test_a_month_is_announced_once_to_both_partners_only_after_its_grace_week(
    client, session, couple, monkeypatch
):  # type: ignore[no-untyped-def]
    titled(session, couple, "Lake day", date(2026, 10, 3))
    titled(session, couple, "Cinema", date(2026, 10, 21))
    at(monkeypatch, datetime(2026, 10, 30, 12, tzinfo=UTC))
    settle(session)
    settle(session)
    announce(session)
    assert recap_notices(session) == []  # the running month is never announced

    at(monkeypatch, datetime(2026, 11, 5, 10, tzinfo=UTC))
    settle(session)
    settle(session)
    announce(session)
    assert recap_notices(session) == []  # still inside the grace week

    # 06:30 in Berlin: retained, but nothing is sent before nine.
    at(monkeypatch, datetime(2026, 11, 8, 5, 30, tzinfo=UTC))
    settle(session)
    (october,) = editions(session, "MONTH", 2026, 10)
    assert october.saved_at is not None and october.announcement == notices.READY
    announce(session)
    assert recap_notices(session) == []

    at(monkeypatch, datetime(2026, 11, 8, 8, 30, tzinfo=UTC))
    announce(session)
    settle(session)
    announce(session)
    found = recap_notices(session)
    assert {item.recipient_account_id for item in found} == {couple["anna"].id, couple["ben"].id}
    assert {(item.kind, item.target_type, item.target_id) for item in found} == {
        (NotificationKind.RECAP_READY.value, "RECAP", october.id)
    }
    assert all(item.actor_id is None for item in found)
    # The running November never has a notice of its own.
    assert all(item.target_id == october.id for item in found)

    for headers in (couple["headers"], couple["partner"]):
        listed = client.get(f"/api/v1/spaces/{couple['space'].id}/notifications", headers=headers)
        (item,) = [i for i in listed.json()["items"] if i["kind"] == "RECAP_READY"]
        assert item["targetType"] == "RECAP" and item["targetId"] == str(october.id)
        assert item["target"]["title"] == "2026-10"
    preview = json.loads(
        push_preview.for_notification(session, found[0], digest=False, version=2) or "{}"
    )
    assert preview["title"] == "2026-10" and preview["body"] == "" and preview["name"] == ""
    assert "Lake day" not in json.dumps(preview) and "Cinema" not in json.dumps(preview)


def test_a_burst_of_late_entries_in_the_grace_week_recomposes_once_and_stays_silent(
    session, couple, monkeypatch
):  # type: ignore[no-untyped-def]
    titled(session, couple, "Lake day", date(2026, 10, 3))
    at(monkeypatch, datetime(2026, 11, 2, 10, tzinfo=UTC))
    settle(session)
    (october,) = editions(session, "MONTH", 2026, 10)
    assert october.status == "READY" and october.material_digest

    # Three back-filled entries, then one more an hour later.
    at(monkeypatch, datetime(2026, 11, 3, 10, tzinfo=UTC))
    late = [
        titled(session, couple, f"Late {index}", date(2026, 10, 10 + index)) for index in range(3)
    ]
    scan(session)
    assert waiting_compositions(session, "MONTH", 2026, 10) == 0
    refresh = session.scalar(
        select(func.count(Job.id)).where(
            Job.kind == composer.REFRESH_JOB, Job.status == JobStatus.PENDING.value
        )
    )
    assert refresh == 1  # a follow-up scan is queued for when the period is quiet
    at(monkeypatch, datetime(2026, 11, 3, 11, tzinfo=UTC))
    late.append(titled(session, couple, "Late 3", date(2026, 10, 25)))
    scan(session)
    assert waiting_compositions(session, "MONTH", 2026, 10) == 0
    at(monkeypatch, datetime(2026, 11, 3, 12, 30, tzinfo=UTC))
    scan(session)
    assert (
        waiting_compositions(session, "MONTH", 2026, 10) == 0
    )  # the last change is only 90 minutes old

    at(monkeypatch, datetime(2026, 11, 3, 13, 30, tzinfo=UTC))
    scan(session)
    assert waiting_compositions(session, "MONTH", 2026, 10) == 1  # one for the whole burst
    compose_pending(session)
    (october,) = editions(session, "MONTH", 2026, 10)
    # The recomposition accounts for every late entry; the cut picks among them.
    assert october.material_digest == freshness.period_digest(
        session, AuthorizationContext(couple["anna"].id, couple["space"].id), "MONTH", 2026, 10
    )
    assert {f"MEMORY:{item.id}" for item in late} & sources(session, october)
    scan(session)
    assert waiting_compositions(session, "MONTH", 2026, 10) == 0

    at(monkeypatch, datetime(2026, 11, 8, 9, tzinfo=UTC))
    settle(session)
    announce(session)
    found = recap_notices(session)
    assert len(found) == 2 and {item.kind for item in found} == {"RECAP_READY"}


def test_a_proposal_whose_material_is_still_settling_is_not_retained_yet(
    session, couple, monkeypatch
):  # type: ignore[no-untyped-def]
    titled(session, couple, "Lake day", date(2026, 10, 3))
    at(monkeypatch, datetime(2026, 11, 2, 10, tzinfo=UTC))
    settle(session)
    at(monkeypatch, datetime(2026, 11, 8, 9, tzinfo=UTC))
    late = titled(session, couple, "Just in time", date(2026, 10, 30))
    settle(session)
    (october,) = editions(session, "MONTH", 2026, 10)
    assert october.saved_at is None  # the late entry is still settling
    at(monkeypatch, datetime(2026, 11, 8, 11, 30, tzinfo=UTC))
    settle(session)
    (october,) = editions(session, "MONTH", 2026, 10)
    assert october.saved_at is None and f"MEMORY:{late.id}" in sources(session, october)
    settle(session)
    (october,) = editions(session, "MONTH", 2026, 10)
    assert october.saved_at is not None and f"MEMORY:{late.id}" in sources(session, october)


def test_late_entries_for_a_retained_month_make_a_new_version_only_when_significant(
    client, session, couple, monkeypatch
):  # type: ignore[no-untyped-def]
    first = titled(session, couple, "Mountains", date(2026, 8, 5))
    titled(session, couple, "Picnic", date(2026, 8, 10))
    at(monkeypatch, datetime(2026, 10, 30, 12, tzinfo=UTC))
    settle(session)
    settle(session)
    (august,) = editions(session, "MONTH", 2026, 8)
    assert august.saved_at is not None
    announce(session)  # an earlier period appearing now is announced as such
    assert {(item.kind, item.target_id) for item in recap_notices(session)} == {
        ("RECAP_READY", august.id)
    }
    look = august.payload.film.look
    # Composed long ago in database time, so later edits count as late.
    august.material_at = datetime(2026, 9, 1, tzinfo=UTC)
    session.flush()

    # An edit of a moment the film already shows is not late material.
    first.payload = MemoryPayload(title="Mountains at dawn", body="Our own words")
    session.flush()
    at(monkeypatch, datetime(2026, 10, 30, 13, tzinfo=UTC))
    settle(session)
    at(monkeypatch, datetime(2026, 10, 30, 15, 30, tzinfo=UTC))
    scan(session)
    assert compose_pending(session) >= 1  # the candidate version is weighed ...
    assert len(editions(session, "MONTH", 2026, 8)) == 1  # ... and discarded
    settle(session)
    assert (
        waiting_compositions(session, "MONTH", 2026, 8) == 0
    )  # the same material is not weighed again

    # Back-filled moments in two bursts; the late birthday becomes the highlight,
    # so they make one new version.
    couple["ben"].birthday = date(1994, 8, 18)
    party = titled(session, couple, "Ben's birthday", date(2026, 8, 18))
    for position in range(3):
        picture(session, couple, party, position=position)
    late = [party, titled(session, couple, "August 14", date(2026, 8, 14))]
    at(monkeypatch, datetime(2026, 10, 31, 10, tzinfo=UTC))
    scan(session)
    late.append(titled(session, couple, "August 25", date(2026, 8, 25)))
    at(monkeypatch, datetime(2026, 10, 31, 11, tzinfo=UTC))
    scan(session)
    assert waiting_compositions(session, "MONTH", 2026, 8) == 0
    at(monkeypatch, datetime(2026, 10, 31, 13, 30, tzinfo=UTC))
    scan(session)
    compose_pending(session)
    kept = [row for row in editions(session, "MONTH", 2026, 8) if row.saved_at is not None]
    assert len(kept) == 2
    original, newer = sorted(kept, key=lambda row: row.saved_at)
    assert original.id == august.id and newer.supersedes_id == august.id
    assert newer.payload.film.look == look  # the frozen look is kept
    assert newer.payload.film.highlight_key == f"MEMORY:{party.id}"
    assert f"MEMORY:{party.id}" in sources(session, newer)
    assert newer.announcement == notices.GREW

    old = client.get(f"{couple['path']}/{august.id}", headers=couple["partner"]).json()
    assert old["supersededById"] == str(newer.id) and old["status"] == "READY"
    overview = client.get(couple["path"], headers=couple["headers"]).json()
    shown = {item["id"] for item in overview["editions"]}
    assert {str(august.id), str(newer.id)} <= shown

    at(monkeypatch, datetime(2026, 10, 31, 14, tzinfo=UTC))
    announce(session)
    grew = [item for item in recap_notices(session) if item.kind == "RECAP_GREW"]
    assert {item.recipient_account_id for item in grew} == {couple["anna"].id, couple["ben"].id}
    assert {item.target_id for item in grew} == {newer.id}
    settle(session)
    announce(session)
    assert len([item for item in recap_notices(session) if item.kind == "RECAP_GREW"]) == 2


def test_several_earlier_periods_become_one_notice_and_late_news_waits_a_day(
    session, couple, monkeypatch
):  # type: ignore[no-untyped-def]
    for month in (3, 4, 5):
        titled(session, couple, f"Spring {month}", date(2025, month, 12))
    at(monkeypatch, datetime(2026, 10, 30, 10, tzinfo=UTC))
    settle(session)
    settle(session)
    announce(session)
    found = recap_notices(session)
    assert len(found) == 2  # one collected notice per partner
    assert {(item.kind, item.target_type) for item in found} == {("RECAP_READY", None)}

    titled(session, couple, "Summer", date(2025, 6, 12))
    at(monkeypatch, datetime(2026, 10, 30, 13, tzinfo=UTC))
    settle(session)
    settle(session)
    at(monkeypatch, datetime(2026, 10, 30, 16, tzinfo=UTC))
    settle(session)
    announce(session)
    assert len(recap_notices(session)) == 2  # at most one late notice a day

    at(monkeypatch, datetime(2026, 10, 31, 10, 30, tzinfo=UTC))
    announce(session)
    assert len(recap_notices(session)) == 4


def test_the_turn_of_the_year_is_one_notice_for_the_year_film(session, couple, monkeypatch):  # type: ignore[no-untyped-def]
    titled(session, couple, "Advent", date(2026, 12, 5))
    titled(session, couple, "Christmas", date(2026, 12, 24))
    at(monkeypatch, datetime(2026, 12, 30, 12, tzinfo=UTC))
    settle(session)
    at(monkeypatch, datetime(2027, 1, 8, 9, tzinfo=UTC))
    settle(session)
    settle(session)
    announce(session)
    (december,) = editions(session, "MONTH", 2026, 12)
    (year,) = editions(session, "YEAR", 2026, 0)
    assert december.saved_at is not None and year.saved_at is not None
    assert december.announcement is None
    found = recap_notices(session)
    assert len(found) == 2 and {item.target_id for item in found} == {year.id}


def test_quiet_hours_and_the_switch_apply_and_without_pro_nothing_is_sent(
    client, session, couple, monkeypatch
):  # type: ignore[no-untyped-def]
    provider = FakePushProvider()
    push.providers.register("recap-notices", provider)
    try:
        for name in ("anna", "ben"):
            push.register_endpoint(
                session,
                account_id=couple[name].id,
                provider_key="recap-notices",
                endpoint_value=f"secret-recap-{name}",
            )
        ben = couple["ben"]
        ben.quiet_hours_start, ben.quiet_hours_end = time(8), time(12)
        off = client.patch(
            "/api/v1/notification-preferences/RECAP_READY/PUSH",
            headers=couple["headers"],
            json={"enabled": False},
        )
        assert off.status_code == 200, off.text
        titled(session, couple, "Lake day", date(2026, 10, 3))
        at(monkeypatch, datetime(2026, 11, 2, 10, tzinfo=UTC))
        settle(session)
        at(monkeypatch, datetime(2026, 11, 8, 9, tzinfo=UTC))
        monkeypatch.setattr(push.clock, "now", lambda: datetime(2026, 11, 8, 9, tzinfo=UTC))
        settle(session)
        announce(session)
        found = recap_notices(session)
        assert len(found) == 2  # both Centers show it; the switch only stops Push
        deliveries = session.execute(
            select(PushDelivery, Notification.recipient_account_id).join(
                Notification, Notification.id == PushDelivery.notification_id
            )
        ).all()
        by_recipient = {recipient: delivery for delivery, recipient in deliveries}
        # Anna switched recap Push off: her delivery is dropped before the provider.
        push.handle_delivery(session, {"deliveryId": str(by_recipient[couple["anna"].id].id)})
        assert provider.calls == []
        # Ben is in his Quiet Hours (08:00-12:00 in Berlin): his Push waits.
        delivery = by_recipient[ben.id]
        with pytest.raises(DeferredJobError):
            push.handle_delivery(session, {"deliveryId": str(delivery.id)})
        assert provider.calls == []
        released = datetime(2026, 11, 8, 11, tzinfo=UTC)  # 12:00 in Berlin
        monkeypatch.setattr(push.clock, "now", lambda: released)
        push.handle_delivery(session, {"deliveryId": str(delivery.id)})
        assert len(provider.calls) == 1
        assert "Lake day" not in json.dumps(provider.calls)
    finally:
        push.providers.clear()

    # Without the capability, a pending announcement is dropped, never sent later.
    titled(session, couple, "November", date(2026, 11, 3))
    at(monkeypatch, datetime(2026, 12, 8, 9, tzinfo=UTC))
    settle(session)
    settle(session)
    (november,) = editions(session, "MONTH", 2026, 11)
    assert november.announcement == notices.READY and november.announced_at is None
    couple["grant"].status = EntitlementStatus.REVOKED.value
    session.flush()
    announce(session)
    assert november.announced_at is not None
    assert len(recap_notices(session)) == 2
    # A Space without Pro composes nothing, so nothing is ever announced.
    titled(session, couple, "December", date(2026, 12, 3))
    at(monkeypatch, datetime(2027, 1, 9, 9, tzinfo=UTC))
    settle(session)
    announce(session)
    assert len(recap_notices(session)) == 2
