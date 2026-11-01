"""PostgreSQL acceptance for canonical experience sharing and its single Push."""

from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import UUID, uuid4
from zipfile import ZipFile

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.core.clock import now
from eimir.engagement import notification_preferences, push
from eimir.engagement import service as engagement
from eimir.engagement.models import Notification, NotificationKind, PushDelivery
from eimir.entitlements import service as entitlements
from eimir.entitlements.models import (
    Capability,
    EntitlementSourceType,
    EntitlementStatus,
    EntitlementTier,
)
from eimir.memories.models import Memory
from eimir.outbox.models import OutboxEvent
from eimir.relationship import service as relationships
from eimir.relationship.models import Membership, MembershipStatus
from eimir.transfer import jobs
from eimir.transfer import service as transfers
from eimir.transfer.models import TransferScope
from tests.conftest import auth, make_account, make_space, requires_database, sign_in
from tests.integration.test_thinking_push import FakePushProvider

pytestmark = [pytest.mark.integration, requires_database]


def grant(session: Session, space_id, account_id):  # type: ignore[no-untyped-def]
    row = entitlements.record_grant(
        session,
        space_id=space_id,
        account_id=account_id,
        source_type=EntitlementSourceType.TEST_FIXTURE,
        status=EntitlementStatus.ACTIVE,
        tier=EntitlementTier.PREMIUM,
        effective_from=now() - timedelta(days=1),
        capabilities=[Capability.GAMES_COUPLE.value],
    )
    session.flush()
    return row


@pytest.fixture
def actors(session: Session):  # type: ignore[no-untyped-def]
    a, b, outsider = [make_account(session, name) for name in ("First", "Second", "Outsider")]
    space = make_space(session, a)
    relationships.add_member(session, space.id, b)
    foreign = make_space(session, outsider)
    return dict(
        a=a,
        b=b,
        outsider=outsider,
        space=space,
        foreign=foreign,
        token_a=sign_in(session, a),
        token_b=sign_in(session, b),
        token_outsider=sign_in(session, outsider),
    )


def path(actors, suffix="memories"):  # type: ignore[no-untyped-def]
    return f"/api/v1/spaces/{actors['space'].id}/{suffix}"


def body(kind="HAPPINESS"):  # type: ignore[no-untyped-def]
    return dict(
        title="Shared experience",
        body="Private authored words stay off the lockscreen.",
        happenedOn="2020-06-12",
        experienceKind=kind,
    )


@pytest.mark.parametrize("kind", ["HAPPINESS", "TIME_TRAVEL"])
def test_share_replay_partner_dashboard_and_single_generic_push(
    client, session: Session, actors, kind
):  # type: ignore[no-untyped-def]
    grant(session, actors["space"].id, actors["a"].id)
    provider = FakePushProvider()
    push.providers.register("experience-test", provider)
    try:
        push.register_endpoint(
            session,
            account_id=actors["b"].id,
            provider_key="experience-test",
            endpoint_value="secret-experience-test",
        )
        headers = {**auth(actors["token_a"]), "Idempotency-Key": str(uuid4())}
        first = client.post(path(actors), json=body(kind), headers=headers)
        assert first.status_code == 201, first.text
        replay = client.post(path(actors), json=body(kind), headers=headers)
        assert replay.status_code == 200 and replay.json()["id"] == first.json()["id"]
        identifier = UUID(first.json()["id"])
        events = list(
            session.scalars(select(OutboxEvent).where(OutboxEvent.subject_id == identifier))
        )
        assert len(events) == 1 and events[0].payload.recipient_id == actors["b"].id
        assert "Private authored words" not in events[0].payload.model_dump_json()
        engagement.project_event(session, events[0])
        engagement.project_event(session, events[0])
        session.flush()
        notifications = list(
            session.scalars(
                select(Notification).where(Notification.source_event_id == events[0].id)
            )
        )
        assert len(notifications) == 1
        assert notifications[0].recipient_account_id == actors["b"].id
        assert notifications[0].kind == NotificationKind.COUPLE_EXPERIENCE_SHARED.value
        deliveries = list(
            session.scalars(
                select(PushDelivery).where(PushDelivery.notification_id == notifications[0].id)
            )
        )
        assert len(deliveries) == 1
        push.handle_delivery(session, {"deliveryId": str(deliveries[0].id)})
        assert len(provider.calls) == 1
        assert provider.calls[0]["notificationReference"] == {
            "id": str(notifications[0].id),
            "kind": "COUPLE_EXPERIENCE_SHARED",
        }
        assert "Private authored words" not in json.dumps(provider.calls)
        partner = client.get(path(actors, "dashboard"), headers=auth(actors["token_b"]))
        assert partner.status_code == 200, partner.text
        assert partner.json()["incomingExperience"]["id"] == str(identifier)
        assert partner.json()["incomingExperience"]["kind"] == kind
        assert partner.json()["incomingExperience"]["text"] == body(kind)["body"]
        assert (
            client.get(path(actors, "dashboard"), headers=auth(actors["token_a"])).json()[
                "incomingExperience"
            ]
            is None
        )
        assert client.get(path(actors), headers=auth(actors["token_outsider"])).status_code == 404
        assert (
            client.delete(
                path(actors) + f"/{identifier}",
                headers={**auth(actors["token_a"]), "If-Match": "1"},
            ).status_code
            == 204
        )
        assert (
            client.get(path(actors, "dashboard"), headers=auth(actors["token_b"])).json()[
                "incomingExperience"
            ]
            is None
        )
        assert (
            client.get(path(actors, "notifications"), headers=auth(actors["token_b"])).json()[
                "items"
            ]
            == []
        )
    finally:
        push.providers.clear()


def test_free_creation_is_rejected_without_affecting_ordinary_core_memories(
    client, session: Session, actors
):  # type: ignore[no-untyped-def]
    rejected = client.post(path(actors), json=body(), headers=auth(actors["token_a"]))
    assert rejected.status_code == 403 and rejected.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"
    assert session.scalar(select(func.count()).select_from(Memory)) == 0
    ordinary = body()
    ordinary.pop("experienceKind")
    assert (
        client.post(path(actors), json=ordinary, headers=auth(actors["token_a"])).status_code == 201
    )
    assert (
        client.post(path(actors), json=body("UNKNOWN"), headers=auth(actors["token_a"])).status_code
        == 422
    )


def test_downgrade_keeps_reads_reconciliation_and_export_but_blocks_new_experiences(
    client, session: Session, actors
):  # type: ignore[no-untyped-def]
    entitlement = grant(session, actors["space"].id, actors["a"].id)
    headers = {**auth(actors["token_a"]), "Idempotency-Key": str(uuid4())}
    first = client.post(path(actors), json=body(), headers=headers)
    assert first.status_code == 201
    entitlement.status = EntitlementStatus.REVOKED.value
    session.flush()
    assert client.post(path(actors), json=body(), headers=headers).status_code == 200
    assert (
        client.post(path(actors), json=body(), headers=auth(actors["token_a"])).status_code == 403
    )
    history = client.get(
        path(actors) + "?experienceKind=HAPPINESS", headers=auth(actors["token_b"])
    )
    assert [row["id"] for row in history.json()["items"]] == [first.json()["id"]]
    context = AuthorizationContext(actors["a"].id, actors["space"].id)
    with (
        transfers.build_export_archive(session, context, TransferScope.SHARED) as archive,
        ZipFile(archive) as bundle,
    ):
        document = json.loads(bundle.read("memories.json"))
        memories = next(
            table["rows"] for table in document["tables"] if table["name"] == "memories"
        )
        assert memories[0]["experienceKind"] == "HAPPINESS"
        assert memories[0]["payload"]["body"] == body()["body"]


def test_partner_exit_before_projection_prevents_notification(client, session: Session, actors):  # type: ignore[no-untyped-def]
    grant(session, actors["space"].id, actors["a"].id)
    first = client.post(path(actors), json=body(), headers=auth(actors["token_a"]))
    assert first.status_code == 201
    membership = session.scalar(
        select(Membership).where(
            Membership.space_id == actors["space"].id, Membership.account_id == actors["b"].id
        )
    )
    assert membership is not None
    membership.status = MembershipStatus.LEFT.value
    session.flush()
    event = session.scalar(
        select(OutboxEvent).where(OutboxEvent.subject_id == UUID(first.json()["id"]))
    )
    assert event is not None
    engagement.project_event(session, event)
    session.flush()
    assert session.scalar(select(func.count()).select_from(Notification)) == 0
    assert (
        client.post(path(actors), json=body(), headers=auth(actors["token_a"])).status_code == 404
    )


def test_filtered_history_cursor_binds_origin_and_reader(client, session: Session, actors):  # type: ignore[no-untyped-def]
    grant(session, actors["space"].id, actors["a"].id)
    for _ in range(2):
        assert (
            client.post(path(actors), json=body(), headers=auth(actors["token_a"])).status_code
            == 201
        )
    response = client.get(
        path(actors) + "?experienceKind=HAPPINESS&limit=1", headers=auth(actors["token_a"])
    )
    cursor = response.json()["nextCursor"]
    assert cursor
    for kind, token in [("TIME_TRAVEL", "token_a"), ("HAPPINESS", "token_b")]:
        assert (
            client.get(
                path(actors),
                params={"experienceKind": kind, "cursor": cursor},
                headers=auth(actors[token]),
            ).status_code
            == 400
        )
    assert (
        client.get(
            path(actors),
            params={"experienceKind": "HAPPINESS", "cursor": cursor},
            headers=auth(actors["token_a"]),
        ).status_code
        == 200
    )


def test_concurrent_identical_shares_create_one_canonical_source(production_client):  # type: ignore[no-untyped-def]
    client, maker = production_client
    with maker.begin() as setup:
        a, b = make_account(setup, "First"), make_account(setup, "Second")
        space = make_space(setup, a)
        relationships.add_member(setup, space.id, b)
        grant(setup, space.id, a.id)
        token = sign_in(setup, a)
        url = f"/api/v1/spaces/{space.id}/memories"
    headers = {**auth(token), "Idempotency-Key": str(uuid4())}

    def submit(_):  # type: ignore[no-untyped-def]
        result = client.post(url, json=body(), headers=headers)
        return result.status_code, result.json().get("id")

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(submit, range(4)))
    assert sorted(status for status, _ in results) == [200, 200, 200, 201]
    assert len({identifier for _, identifier in results}) == 1
    with maker() as verify:
        assert verify.scalar(select(func.count()).select_from(Memory)) == 1
        assert (
            verify.scalar(
                select(func.count())
                .select_from(OutboxEvent)
                .where(OutboxEvent.event_type == "MEMORY_CREATED")
            )
            == 1
        )


@pytest.mark.parametrize("channel", ["push", "in_app"])
def test_prior_partner_opt_out_is_inherited_until_explicitly_changed(
    session: Session, actors, channel
):  # type: ignore[no-untyped-def]
    setter = getattr(notification_preferences, f"set_{channel}_enabled")
    enabled = getattr(notification_preferences, f"{channel}_enabled")
    choices = getattr(notification_preferences, f"own_{channel}_choices")
    recipient = actors["b"].id
    setter(session, account_id=recipient, kind=NotificationKind.THINKING_OF_YOU, enabled=False)
    session.flush()
    assert not enabled(
        session, account_id=recipient, kind=NotificationKind.COUPLE_EXPERIENCE_SHARED.value
    )
    assert not choices(session, account_id=recipient)[NotificationKind.COUPLE_EXPERIENCE_SHARED]
    setter(
        session, account_id=recipient, kind=NotificationKind.COUPLE_EXPERIENCE_SHARED, enabled=True
    )
    session.flush()
    assert enabled(
        session, account_id=recipient, kind=NotificationKind.COUPLE_EXPERIENCE_SHARED.value
    )
    assert choices(session, account_id=recipient)[NotificationKind.COUPLE_EXPERIENCE_SHARED]


@pytest.mark.parametrize(
    "changes", [{"body": "   "}, {"body": "x" * 2001}, {"happenedOn": "2099-01-01"}]
)
def test_invalid_experience_does_not_create_a_memory_or_event(
    client, session: Session, actors, changes
):  # type: ignore[no-untyped-def]
    grant(session, actors["space"].id, actors["a"].id)
    response = client.post(
        path(actors), json={**body(), **changes}, headers=auth(actors["token_a"])
    )
    assert response.status_code == 422, response.text
    assert session.scalar(select(func.count()).select_from(Memory)) == 0


def test_transfer_round_trip_preserves_origin_without_resending(session: Session, actors):  # type: ignore[no-untyped-def]
    from eimir.domain.experiences import ExperienceKind
    from eimir.memories import service as memories
    from eimir.transfer.models import ImportStatus

    grant(session, actors["space"].id, actors["a"].id)
    source = AuthorizationContext(actors["a"].id, actors["space"].id)
    memories.create_memory(
        session,
        source,
        title="Recollection",
        body="Our first walk",
        happened_on=None,
        experience_kind=ExperienceKind.TIME_TRAVEL,
    )
    session.flush()
    target = make_space(session, actors["a"])
    relationships.add_member(session, target.id, actors["b"])
    context = AuthorizationContext(actors["a"].id, target.id)
    with transfers.build_export_archive(session, source, TransferScope.SHARED) as archive:
        archive.seek(0, 2)
        size = archive.tell()
        archive.seek(0)
        imported = transfers.create_import(session, context, archive, size=size)
    session.flush()
    jobs.handle_validate_import(session, {"importId": str(imported.id)})
    session.flush()
    assert imported.status == ImportStatus.READY_TO_APPLY.value, imported.error_code
    transfers.request_apply(session, context, str(imported.id))
    session.flush()
    jobs.handle_apply_import(session, {"importId": str(imported.id)})
    session.flush()
    assert imported.status == ImportStatus.COMPLETED.value
    restored = session.scalar(select(Memory).where(Memory.space_id == target.id))
    assert restored is not None and restored.experience_kind == "TIME_TRAVEL"
    assert restored.payload.body == "Our first walk"
    assert (
        session.scalar(
            select(func.count())
            .select_from(OutboxEvent)
            .where(OutboxEvent.space_id == target.id, OutboxEvent.event_type == "MEMORY_CREATED")
        )
        == 0
    )
