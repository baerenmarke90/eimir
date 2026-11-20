"""Herzversteck (#1907 H3): privacy of the hidden heart, photo access, notices, expiry."""

from __future__ import annotations

from datetime import timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.attachments.models import Attachment, AttachmentPayload, AttachmentStatus, MediaType
from eimir.authorization import AuthorizationContext, PrivacyClass
from eimir.core.clock import now
from eimir.engagement import service as engagement
from eimir.engagement.models import Notification
from eimir.entitlements import service as entitlement_service
from eimir.entitlements.models import (
    Capability,
    EntitlementSourceType,
    EntitlementStatus,
    EntitlementTier,
)
from eimir.heart_hunt import service
from eimir.heart_hunt.models import HeartHuntRound
from eimir.memories import service as memories
from eimir.outbox.models import OutboxEvent
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    outsider = make_account(session, "Outsider")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    make_space(session, outsider)
    session.flush()
    return {
        "anna": anna,
        "ben": ben,
        "space": space,
        "token_a": sign_in(session, anna),
        "token_b": sign_in(session, ben),
        "token_outsider": sign_in(session, outsider),
    }


def grant_games(session: Session, couple) -> None:  # type: ignore[no-untyped-def]
    entitlement_service.record_grant(
        session,
        space_id=couple["space"].id,
        account_id=couple["anna"].id,
        source_type=EntitlementSourceType.TEST_FIXTURE,
        status=EntitlementStatus.ACTIVE,
        tier=EntitlementTier.PREMIUM,
        effective_from=now(),
        capabilities=[Capability.GAMES_COUPLE.value],
    )
    session.flush()


def photo(session: Session, couple, owner="anna") -> UUID:  # type: ignore[no-untyped-def]
    attachment = Attachment(
        space_id=couple["space"].id,
        owner_id=couple[owner].id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        status=AttachmentStatus.READY.value,
        media_type=MediaType.IMAGE.value,
        declared_mime_type="image/jpeg",
        declared_size=100,
        mime_type="image/jpeg",
        size=100,
        width=800,
        height=1000,
        ready_at=now(),
        payload=AttachmentPayload(original_name="versteck.jpg"),
    )
    session.add(attachment)
    session.flush()
    return attachment.id


def base(couple) -> str:  # type: ignore[no-untyped-def]
    return f"/api/v1/spaces/{couple['space'].id}/games/heart-hunt"


def hide(client, session, couple, *, x=300, y=400, token="token_a", attachment=None):  # type: ignore[no-untyped-def]
    owner = "ben" if token == "token_b" else "anna"
    return client.post(
        base(couple) + "/rounds",
        json={
            "requestId": str(uuid4()),
            "attachmentId": str(attachment or photo(session, couple, owner)),
            "heart": {"x": x, "y": y},
        },
        headers=auth(couple[token]),
    )


def project(session: Session) -> None:
    for event in session.scalars(
        select(OutboxEvent).order_by(OutboxEvent.created_at, OutboxEvent.id)
    ):
        engagement.project_event(session, event)
    session.flush()


def notice_kinds(session: Session, account) -> list[str]:  # type: ignore[no-untyped-def]
    return sorted(
        session.scalars(
            select(Notification.kind).where(
                Notification.recipient_account_id == account.id,
                Notification.kind.like("HEART_HUNT%"),
            )
        )
    )


def test_every_gameplay_seam_requires_the_games_capability(client, session, couple) -> None:  # type: ignore[no-untyped-def]
    assert client.get(base(couple), headers=auth(couple["token_a"])).status_code == 403
    created = hide(client, session, couple)
    assert created.status_code == 403
    assert created.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"
    round_id = uuid4()
    for url, body in (
        (f"/rounds/{round_id}/taps", {"x": 1, "y": 1}),
        (f"/rounds/{round_id}/kept", {"memoryId": str(uuid4())}),
    ):
        response = client.post(base(couple) + url, json=body, headers=auth(couple["token_b"]))
        assert response.status_code == 403


def numbers_in(payload: object) -> set[float]:
    """Every number anywhere in a parsed JSON payload (booleans excluded)."""
    if isinstance(payload, dict):
        return set().union(*(numbers_in(value) for value in payload.values()))
    if isinstance(payload, list):
        return set().union(*(numbers_in(value) for value in payload))
    if isinstance(payload, int | float) and not isinstance(payload, bool):
        return {payload}
    return set()


def test_seeker_never_receives_the_heart_before_it_is_found(client, session, couple) -> None:  # type: ignore[no-untyped-def]
    grant_games(session, couple)
    created = hide(client, session, couple, x=321, y=654)
    assert created.status_code == 201, created.text
    assert created.json()["role"] == "HIDER" and created.json()["heart"] == {"x": 321, "y": 654}

    seen = client.get(base(couple), headers=auth(couple["token_b"]))
    assert seen.status_code == 200
    only = seen.json()["rounds"][0]
    assert only["role"] == "SEEKER" and only["state"] == "HIDDEN"
    assert only["heart"] is None
    # Structural, not a text search: random UUIDs may contain "321" or "654".
    assert not numbers_in(seen.json()) & {321, 654}

    cold = client.post(
        base(couple) + f"/rounds/{only['id']}/taps",
        json={"x": 900, "y": 50},
        headers=auth(couple["token_b"]),
    )
    assert cold.status_code == 200
    body = cold.json()
    assert body["found"] is False and body["level"] == 0
    assert body["round"]["heart"] is None
    assert not numbers_in(body) & {321, 654}
    assert body["round"]["taps"] == [{"x": 900, "y": 50}]


def test_finding_reveals_the_heart_and_tells_the_hider(client, session, couple) -> None:  # type: ignore[no-untyped-def]
    grant_games(session, couple)
    round_id = hide(client, session, couple, x=500, y=500).json()["id"]
    warm = client.post(
        base(couple) + f"/rounds/{round_id}/taps",
        json={"x": 560, "y": 500},
        headers=auth(couple["token_b"]),
    ).json()
    assert warm["level"] == 3
    found = client.post(
        base(couple) + f"/rounds/{round_id}/taps",
        json={"x": 505, "y": 498},
        headers=auth(couple["token_b"]),
    ).json()
    assert found["found"] is True
    assert found["round"]["state"] == "FOUND"
    assert found["round"]["heart"] == {"x": 500, "y": 500}
    assert found["round"]["foundAt"] is not None

    project(session)
    assert notice_kinds(session, couple["ben"]) == ["HEART_HUNT_HIDDEN"]
    assert notice_kinds(session, couple["anna"]) == ["HEART_HUNT_FOUND"]

    # A second heart can be hidden once the first is found; roles swap.
    assert hide(client, session, couple, token="token_b").status_code == 201


def test_one_open_heart_per_hider_and_the_hider_cannot_search(client, session, couple) -> None:  # type: ignore[no-untyped-def]
    grant_games(session, couple)
    first = hide(client, session, couple)
    assert first.status_code == 201
    again = hide(client, session, couple)
    assert again.status_code == 409 and again.json()["code"] == "HEART_ROUND_OPEN"
    own_tap = client.post(
        base(couple) + f"/rounds/{first.json()['id']}/taps",
        json={"x": 1, "y": 1},
        headers=auth(couple["token_a"]),
    )
    assert own_tap.status_code == 404


def test_only_the_two_partners_can_read_the_round_photo(client, session, couple) -> None:  # type: ignore[no-untyped-def]
    grant_games(session, couple)
    attachment = photo(session, couple)
    created = hide(client, session, couple, attachment=attachment).json()
    path = f"/api/v1/spaces/{couple['space'].id}/attachments/{attachment}/read-access"
    request = {"parentType": "HEART_HUNT_ROUND", "parentId": created["id"]}
    for token in ("token_a", "token_b"):
        assert client.post(path, json=request, headers=auth(couple[token])).status_code == 200
    outsider = client.post(path, json=request, headers=auth(couple["token_outsider"]))
    assert outsider.status_code in {403, 404}
    wrong_parent = client.post(
        path,
        json={"parentType": "HEART_HUNT_ROUND", "parentId": str(uuid4())},
        headers=auth(couple["token_b"]),
    )
    assert wrong_parent.status_code == 404
    unbound = client.post(path, json={"parentType": "NONE"}, headers=auth(couple["token_b"]))
    assert unbound.status_code == 404


def test_the_photo_must_be_the_hiders_own_ready_image_and_the_heart_inside(  # type: ignore[no-untyped-def]
    client, session, couple
) -> None:
    grant_games(session, couple)
    rejected = hide(client, session, couple, attachment=photo(session, couple, owner="ben"))
    assert rejected.status_code in {403, 404, 409, 422}
    assert session.scalar(select(HeartHuntRound.id)) is None
    out_of_frame = client.post(
        base(couple) + "/rounds",
        json={
            "requestId": str(uuid4()),
            "attachmentId": str(photo(session, couple)),
            "heart": {"x": 10, "y": 1001},
        },
        headers=auth(couple["token_a"]),
    )
    assert out_of_frame.status_code == 422


def test_creating_a_round_is_idempotent_per_request(client, session, couple) -> None:  # type: ignore[no-untyped-def]
    grant_games(session, couple)
    body = {
        "requestId": str(uuid4()),
        "attachmentId": str(photo(session, couple)),
        "heart": {"x": 1, "y": 2},
    }
    first = client.post(base(couple) + "/rounds", json=body, headers=auth(couple["token_a"]))
    second = client.post(base(couple) + "/rounds", json=body, headers=auth(couple["token_a"]))
    assert first.status_code == second.status_code == 201
    assert first.json()["id"] == second.json()["id"]
    project(session)
    assert notice_kinds(session, couple["ben"]) == ["HEART_HUNT_HIDDEN"]


def test_keeping_needs_a_found_heart_and_the_callers_own_memory(client, session, couple) -> None:  # type: ignore[no-untyped-def]
    grant_games(session, couple)
    round_id = hide(client, session, couple, x=500, y=500).json()["id"]
    memory = memories.create_memory(
        session,
        AuthorizationContext(account_id=couple["ben"].id, space_id=couple["space"].id),
        title="Herzversteck",
        body="",
        happened_on=now().date(),
    )
    path = base(couple) + f"/rounds/{round_id}/kept"
    early = client.post(path, json={"memoryId": str(memory.id)}, headers=auth(couple["token_b"]))
    assert early.status_code == 409
    client.post(
        base(couple) + f"/rounds/{round_id}/taps",
        json={"x": 500, "y": 500},
        headers=auth(couple["token_b"]),
    )
    foreign = client.post(path, json={"memoryId": str(memory.id)}, headers=auth(couple["token_a"]))
    assert foreign.status_code == 404
    kept = client.post(path, json={"memoryId": str(memory.id)}, headers=auth(couple["token_b"]))
    assert kept.status_code == 200 and kept.json()["kept"] is True


def test_expired_rounds_are_deleted_with_their_photo(client, session, couple) -> None:  # type: ignore[no-untyped-def]
    grant_games(session, couple)
    attachment = photo(session, couple)
    round_id = hide(client, session, couple, attachment=attachment).json()["id"]
    heart_round = session.get(HeartHuntRound, UUID(round_id))
    assert heart_round is not None
    assert heart_round.purge_after - heart_round.created_at == service.UNFOUND_EXPIRY

    assert service.purge_due(session) == 0
    heart_round.purge_after = now() - timedelta(minutes=1)
    session.flush()
    listed = client.get(base(couple), headers=auth(couple["token_b"])).json()
    assert listed["rounds"] == []

    assert service.purge_due(session) == 1
    session.expire_all()
    assert session.get(HeartHuntRound, UUID(round_id)) is None
    photo_row = session.get(Attachment, attachment)
    assert photo_row is not None and photo_row.status == AttachmentStatus.DELETING.value


def test_found_rounds_keep_the_photo_fourteen_days(client, session, couple) -> None:  # type: ignore[no-untyped-def]
    grant_games(session, couple)
    round_id = hide(client, session, couple, x=500, y=500).json()["id"]
    client.post(
        base(couple) + f"/rounds/{round_id}/taps",
        json={"x": 500, "y": 500},
        headers=auth(couple["token_b"]),
    )
    session.expire_all()
    heart_round = session.get(HeartHuntRound, UUID(round_id))
    assert heart_round is not None and heart_round.found_at is not None
    assert heart_round.purge_after - heart_round.found_at == service.FOUND_RETENTION


def test_leaving_the_space_removes_rounds_and_photos(client, session, couple) -> None:  # type: ignore[no-untyped-def]
    grant_games(session, couple)
    attachment = photo(session, couple)
    hide(client, session, couple, attachment=attachment)
    service.purge_space(session, couple["space"].id)
    session.expire_all()
    assert session.scalar(select(HeartHuntRound.id)) is None
    photo_row = session.get(Attachment, attachment)
    assert photo_row is not None and photo_row.status == AttachmentStatus.DELETING.value


def test_unknown_and_malformed_round_ids_look_the_same(client, session, couple) -> None:  # type: ignore[no-untyped-def]
    grant_games(session, couple)
    answers = []
    for round_id in (str(uuid4()), "nicht-echt"):
        for suffix, body in (("taps", {"x": 1, "y": 1}), ("kept", {"memoryId": str(uuid4())})):
            response = client.post(
                base(couple) + f"/rounds/{round_id}/{suffix}",
                json=body,
                headers=auth(couple["token_b"]),
            )
            assert response.status_code == 404
            answers.append(response.json()["code"])
    assert set(answers) == {"HEART_ROUND_NOT_FOUND"}


def test_without_the_plugin_expired_rounds_go_with_their_photo(client, session, couple) -> None:  # type: ignore[no-untyped-def]
    from eimir.plugins import lifecycle
    from tests.support.plugins import without_plugins

    grant_games(session, couple)
    attachment = photo(session, couple)
    round_id = hide(client, session, couple, attachment=attachment).json()["id"]
    heart_round = session.get(HeartHuntRound, UUID(round_id))
    assert heart_round is not None
    heart_round.purge_after = now() - timedelta(minutes=1)
    session.flush()
    with without_plugins():
        lifecycle.prune_expired(session)
    session.expire_all()
    assert session.get(HeartHuntRound, UUID(round_id)) is None
    photo_row = session.get(Attachment, attachment)
    assert photo_row is not None and photo_row.status == AttachmentStatus.DELETING.value


def test_without_the_plugin_membership_end_removes_rounds_and_photos(
    client, session, couple
) -> None:  # type: ignore[no-untyped-def]
    from tests.support.plugins import without_plugins

    grant_games(session, couple)
    attachment = photo(session, couple)
    hide(client, session, couple, attachment=attachment)
    membership = next(
        member
        for member in relationship_service.active_memberships(session, couple["space"].id)
        if member.account_id == couple["ben"].id
    )
    with without_plugins():
        relationship_service.end_membership(session, membership)
    session.flush()
    session.expire_all()
    assert session.scalar(select(HeartHuntRound.id)) is None
    photo_row = session.get(Attachment, attachment)
    assert photo_row is not None and photo_row.status == AttachmentStatus.DELETING.value


def test_without_the_plugin_a_round_photo_is_neither_readable_nor_rebindable(  # type: ignore[no-untyped-def]
    client, session, couple
) -> None:
    from eimir.attachments import binding
    from tests.support.plugins import without_plugins

    grant_games(session, couple)
    attachment = photo(session, couple)
    round_id = hide(client, session, couple, attachment=attachment).json()["id"]
    path = f"/api/v1/spaces/{couple['space'].id}/attachments/{attachment}/read-access"
    request = {"parentType": "HEART_HUNT_ROUND", "parentId": round_id}
    assert client.post(path, json=request, headers=auth(couple["token_b"])).status_code == 200
    with without_plugins():
        # The manifest still knows the parent, so the photo stays bound to its round.
        assert binding.parent_of(session, attachment) == ("HEART_HUNT_ROUND", UUID(round_id))
        for token in ("token_a", "token_b"):
            denied = client.post(path, json=request, headers=auth(couple[token]))
            assert denied.status_code == 404
