"""Exercise real scheduling and the shared push delivery handoff."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from eimir.core import clock
from eimir.engagement import push
from eimir.engagement import service as engagement
from eimir.engagement.models import Notification, NotificationKind, PushDelivery, PushDeliveryStatus
from eimir.jobs.models import Job
from eimir.relationship import invitations
from eimir.reminders import runtime
from eimir.reminders.runtime_models import ReminderOccurrence
from eimir.wishes import reminders
from tests.conftest import auth, make_account, make_space, requires_database
from tests.integration.test_shared_experiences import actors as actors
from tests.integration.test_shared_experiences import path
from tests.integration.test_thinking_push import FakePushProvider

pytestmark = [pytest.mark.integration, requires_database]


@pytest.fixture
def fake_push():
    provider = FakePushProvider()
    push.providers.register("planning-test", provider)
    yield provider
    push.providers.unregister("planning-test")


def use_push(session, account):  # type: ignore[no-untyped-def]
    return push.register_endpoint(
        session,
        account_id=account.id,
        provider_key="planning-test",
        endpoint_value=f"secret-{account.id}",
    )


def delivery_for(session, account_id, kind):  # type: ignore[no-untyped-def]
    return session.scalars(
        select(PushDelivery)
        .join(Notification, Notification.id == PushDelivery.notification_id)
        .where(Notification.recipient_account_id == account_id, Notification.kind == kind)
    ).one()


def test_invitation_sends_one_push_to_the_inviter(session, fake_push):  # type: ignore[no-untyped-def]
    inviter = make_account(session, "Inviter")
    partner = make_account(session, "Partner")
    space = make_space(session, inviter)
    expected = use_push(session, inviter)
    use_push(session, partner)
    issued = invitations.create(session, space.id, inviter)
    invitations.accept(session, issued.token, partner)
    engagement.project_pending(session)
    engagement.project_pending(session)
    delivery = session.scalars(select(PushDelivery)).one()
    assert delivery.push_endpoint_id == expected.id
    push.handle_delivery(session, {"deliveryId": str(delivery.id)})
    push.handle_delivery(session, {"deliveryId": str(delivery.id)})
    assert len(fake_push.calls) == 1
    assert fake_push.calls[0]["notificationReference"]["kind"] == "PARTNER_JOINED"
    assert issued.token not in str(fake_push.calls)


@pytest.mark.parametrize("first", ["created", "reminder"])
def test_same_short_term_plan_is_pushed_once_in_either_delivery_order(
    client, session, actors, fake_push, monkeypatch, first
):  # type: ignore[no-untyped-def]
    instant = datetime.now(UTC)
    monkeypatch.setattr(clock, "now", lambda: instant)
    recipient = actors["b"]
    use_push(session, recipient)
    latest = instant + timedelta(hours=3)
    created = client.post(
        path(actors, "plans"),
        headers=auth(actors["token_a"]),
        json={"title": "Together", "schedule": {"plannedStart": latest.isoformat()}},
    )
    assert created.status_code == 201, created.text
    engagement.project_pending(session, limit=100)
    new_plan = delivery_for(session, recipient.id, NotificationKind.PLAN_CREATED)
    occurrences = session.scalars(
        select(ReminderOccurrence).where(
            ReminderOccurrence.recipient_account_id == recipient.id,
        )
    ).all()
    occurrence = next(row for row in occurrences if row.days_before == 1)
    runtime.handle_occurrence(
        session, {"occurrenceId": str(occurrence.id), "generation": occurrence.generation}
    )
    engagement.project_pending(session, limit=100)
    due = delivery_for(session, recipient.id, NotificationKind.REMINDER_DUE)
    winner, duplicate = (new_plan, due) if first == "created" else (due, new_plan)
    push.handle_delivery(session, {"deliveryId": str(winner.id)})
    push.handle_delivery(session, {"deliveryId": str(duplicate.id)})
    assert winner.status == PushDeliveryStatus.SUCCEEDED
    assert duplicate.last_error_code == "PLAN_PUSH_COALESCED"

    opened = client.post(
        path(actors, f"notifications/{winner.notification_id}/open"),
        headers=auth(actors["token_b"]),
    )
    assert opened.status_code == 200, opened.text
    assert opened.json()["targetType"] == "PLAN"
    assert opened.json()["targetId"] == created.json()["id"]

    instant = latest
    at_start = next(row for row in occurrences if row.days_before == 0)
    runtime.handle_occurrence(
        session, {"occurrenceId": str(at_start.id), "generation": at_start.generation}
    )
    engagement.project_pending(session, limit=100)
    later_delivery = session.scalars(
        select(PushDelivery).where(PushDelivery.id.not_in([new_plan.id, due.id]))
    ).one()
    push.handle_delivery(session, {"deliveryId": str(later_delivery.id)})
    assert later_delivery.last_error_code == "PLAN_PUSH_COALESCED"
    assert len(fake_push.calls) == 1


@pytest.mark.parametrize("days, expect_push", [(1, True), (2, False)])
def test_date_only_plans_push_today_or_tomorrow_and_otherwise_stay_in_center(
    client, session, actors, fake_push, days, expect_push
):  # type: ignore[no-untyped-def]
    use_push(session, actors["b"])
    zone = clock.resolve_zone(actors["b"].timezone)
    day = clock.now().astimezone(zone).date() + timedelta(days=days)
    created = client.post(
        path(actors, "plans"),
        headers=auth(actors["token_a"]),
        json={"title": "Our day", "schedule": {"plannedOn": day.isoformat()}},
    )
    assert created.status_code == 201, created.text
    engagement.project_pending(session, limit=100)
    notice = session.scalars(
        select(Notification).where(Notification.kind == NotificationKind.PLAN_CREATED)
    ).one()
    delivery = session.scalar(select(PushDelivery).where(PushDelivery.notification_id == notice.id))
    if expect_push:
        assert delivery is not None
        push.handle_delivery(session, {"deliveryId": str(delivery.id)})
        assert len(fake_push.calls) == 1
    else:
        assert delivery is None


@pytest.mark.parametrize(
    "ending", ["deliver", "replace", "remove", "complete", "plan", "remove_queued"]
)
def test_wish_reminder_is_personal_and_discards_stale_schedules(
    client, session, actors, fake_push, monkeypatch, ending
):  # type: ignore[no-untyped-def]
    instant = datetime.now(UTC)
    monkeypatch.setattr(clock, "now", lambda: instant)
    recipient = actors["a"]
    endpoint = use_push(session, recipient)
    use_push(session, actors["b"])
    owner = auth(actors["token_a"])
    partner = auth(actors["token_b"])
    created = client.post(path(actors, "wishes"), headers=owner, json={"title": "Private timing"})
    assert created.status_code == 201, created.text
    wish = created.json()
    wish_url = path(actors, f"wishes/{wish['id']}")
    url = wish_url + "/reminder"
    due = instant + timedelta(minutes=5)
    assert client.put(url, headers=owner, json={"dueAt": "2026-11-13T18:00"}).status_code == 422
    outsider = auth(actors["token_outsider"])
    assert client.get(url, headers=outsider).status_code == 404
    saved = client.put(url, headers=owner, json={"dueAt": due.isoformat()})
    assert saved.status_code == 200, saved.text
    assert saved.headers["cache-control"] == "private, no-store"
    assert client.get(url, headers=partner).json() == {"dueAt": None}
    assert client.put(url, headers=owner, json={"dueAt": due.isoformat()}).status_code == 200
    job = session.scalars(select(Job).where(Job.kind == reminders.JOB_KIND)).one()
    assert "Private timing" not in str(job.payload)
    if ending == "replace":
        assert (
            client.put(
                url, headers=owner, json={"dueAt": (due + timedelta(days=1)).isoformat()}
            ).status_code
            == 200
        )
    if ending == "remove":
        assert client.delete(url, headers=owner).status_code == 204
    versioned = {**owner, "If-Match": f'"{wish["version"]}"'}
    if ending == "complete":
        result = client.post(wish_url + "/complete", headers=versioned)
        assert result.status_code == 200, result.text
    if ending == "plan":
        result = client.post(wish_url + "/plan", headers=versioned, json={"title": "A plan"})
        assert result.status_code == 201, result.text
    instant = due + timedelta(seconds=1)
    reminders.handle_due(session, job.payload)
    reminders.handle_due(session, job.payload)
    engagement.project_pending(session, limit=100)
    if ending not in {"deliver", "remove_queued"}:
        assert (
            session.scalar(
                select(Notification.id).where(
                    Notification.kind == NotificationKind.WISH_REMINDER_DUE
                )
            )
            is None
        )
        return
    delivery = delivery_for(session, recipient.id, NotificationKind.WISH_REMINDER_DUE)
    assert delivery.push_endpoint_id == endpoint.id
    open_url = path(actors, f"notifications/{delivery.notification_id}/open")
    if ending == "remove_queued":
        assert client.delete(url, headers=owner).status_code == 204
        push.handle_delivery(session, {"deliveryId": str(delivery.id)})
        assert delivery.last_error_code == "PUSH_TARGET_UNAVAILABLE"
        assert fake_push.calls == []
        assert client.post(open_url, headers=owner).status_code == 404
        return
    push.handle_delivery(session, {"deliveryId": str(delivery.id)})
    assert len(fake_push.calls) == 1
    assert "Private timing" not in str(fake_push.calls)
    assert client.post(open_url, headers=partner).status_code == 404
    opened = client.post(open_url, headers=owner)
    assert opened.json()["targetId"] == wish["id"]
    assert opened.json()["targetType"] == "WISH"
    assert client.get(wish_url, headers=owner).json()["status"] == "OPEN"
