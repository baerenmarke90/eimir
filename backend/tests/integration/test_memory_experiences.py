"""Real PostgreSQL acceptance for periods, ordered places, covers and private galleries."""

from datetime import date
from uuid import UUID

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.attachments import binding
from eimir.attachments.models import Attachment, AttachmentPayload, AttachmentStatus, MediaType
from eimir.authorization import AuthorizationContext, PrivacyClass
from eimir.core.clock import now
from eimir.outbox.models import OutboxEvent
from eimir.recaps import service as recaps
from eimir.recaps.models import RecapSourceKind
from eimir.relationship import service as relationship
from eimir.story.photo_service import read_shared_photos
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


def ready(session: Session, space_id: UUID, owner_id: UUID) -> Attachment:
    attachment = Attachment(
        space_id=space_id,
        owner_id=owner_id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        status=AttachmentStatus.READY.value,
        media_type=MediaType.IMAGE.value,
        declared_mime_type="image/jpeg",
        declared_size=100,
        mime_type="image/jpeg",
        size=100,
        ready_at=now(),
        payload=AttachmentPayload(original_name="weekend.jpg"),
    )
    session.add(attachment)
    session.flush()
    return attachment


def test_weekend_survives_new_year_multiple_places_and_membership_conflicts(
    client, session: Session
) -> None:  # type: ignore[no-untyped-def]
    owner = make_account(session, "Weekend owner")
    space = make_space(session, owner)
    token = sign_in(session, owner)
    context = AuthorizationContext(account_id=owner.id, space_id=space.id)
    base = f"/api/v1/spaces/{space.id}"
    locations = []
    for index, latitude in enumerate((0, 54.312346)):
        created = client.post(
            f"{base}/places",
            headers=auth(token),
            json={
                "name": f"Weekend stop {index}",
                "latitude": latitude,
                "longitude": 0,
            },
        )
        assert created.status_code == 201, created.text
        place = created.json()
        reread = client.get(f"{base}/places/{place['id']}", headers=auth(token)).json()
        assert reread["latitude"] == latitude and reread["longitude"] == 0
        locations.append(place["id"])
    response = client.post(
        f"{base}/memories",
        headers=auth(token),
        json={
            "title": "New year weekend",
            "happenedOn": "2026-12-31",
            "happenedUntil": "2027-01-03",
            "placeIds": locations,
        },
    )
    assert response.status_code == 201, response.text
    memory = response.json()
    assert (
        session.scalar(
            select(OutboxEvent.resource_version).where(
                OutboxEvent.subject_id == UUID(memory["id"]),
                OutboxEvent.event_type == "MEMORY_CREATED",
            )
        )
        == memory["version"]
    )
    assert memory["placeIds"] == locations
    assert memory["happenedUntil"] == "2027-01-03"
    for year in (2026, 2027):
        page = client.get(f"{base}/timeline", headers=auth(token), params={"year": year}).json()
        assert [item["memory"]["id"] for item in page["items"]] == [memory["id"]]
        assert set(page["availableYears"]) == {2026, 2027}
    selected = recaps.candidates(session, context, date(2027, 1, 1), date(2027, 1, 31))
    assert [item.id for item in selected if item.kind == RecapSourceKind.MEMORY] == [
        UUID(memory["id"])
    ]
    changed = client.patch(
        f"{base}/memories/{memory['id']}",
        headers={**auth(token), "If-Match": str(memory["version"])},
        json={
            "placeIds": list(reversed(locations)),
            "expectedPlaceIds": locations,
        },
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["placeIds"] == list(reversed(locations))
    # Relation endpoints predate Memory versioning. A stale membership snapshot
    # must still fail even when the Memory If-Match itself remains current.
    from eimir.relations import service as relations

    relations.unlink(
        session, context, UUID(locations[0]), UUID(memory["id"]), relations.PLACE_MEMORIES
    )
    conflict = client.patch(
        f"{base}/memories/{memory['id']}",
        headers={**auth(token), "If-Match": str(changed.json()["version"])},
        json={
            "placeIds": locations,
            "expectedPlaceIds": locations,
        },
    )
    assert conflict.status_code == 409
    assert client.get(f"{base}/places/{locations[0]}", headers=auth(token)).status_code == 200


def test_memory_cover_is_independent_of_order_and_returns_to_auto_after_removal(
    client, session: Session
) -> None:  # type: ignore[no-untyped-def]
    owner = make_account(session, "Gallery owner")
    space = make_space(session, owner)
    token = sign_in(session, owner)
    first, second = (ready(session, space.id, owner.id) for _ in range(2))
    base = f"/api/v1/spaces/{space.id}/memories"
    memory = client.post(base, headers=auth(token), json={"title": "Weekend"}).json()
    endpoint = f"{base}/{memory['id']}/attachments"

    def save(ids, version, **extra):  # type: ignore[no-untyped-def]
        response = client.put(
            endpoint,
            headers={**auth(token), "If-Match": str(version)},
            json={
                "attachments": [
                    {"attachmentId": str(identifier), "position": position}
                    for position, identifier in enumerate(ids)
                ],
                **extra,
            },
        )
        assert response.status_code == 200, response.text
        return response.json()

    value = save([first.id, second.id], memory["version"], selectedCoverAttachmentId=str(second.id))
    value = save([second.id, first.id], value["version"])
    assert value["selectedCoverAttachmentId"] == str(second.id)
    assert [item["id"] for item in value["attachments"]] == [str(second.id), str(first.id)]
    value = save([first.id], value["version"])
    assert value["selectedCoverAttachmentId"] is None
    third, fourth = (ready(session, space.id, owner.id) for _ in range(2))
    created_plan = client.post(
        f"/api/v1/spaces/{space.id}/plans",
        headers=auth(token),
        json={
            "title": "Next weekend",
            "attachments": [
                {"attachmentId": str(third.id), "position": 0},
                {"attachmentId": str(fourth.id), "position": 1},
            ],
            "selectedCoverAttachmentId": str(fourth.id),
        },
    )
    assert created_plan.status_code == 201, created_plan.text
    plan = created_plan.json()
    assert plan["coverAttachment"]["id"] == str(fourth.id)
    assert [item["id"] for item in plan["attachments"]] == [str(third.id), str(fourth.id)]
    assert (
        session.scalar(
            select(OutboxEvent.resource_version).where(
                OutboxEvent.subject_id == UUID(plan["id"]), OutboxEvent.event_type == "PLAN_CREATED"
            )
        )
        == plan["version"]
    )


def test_heart_gallery_keeps_all_media_private_and_legacy_updates_preserve_the_tail(
    client, session: Session
) -> None:  # type: ignore[no-untyped-def]
    owner, partner = make_account(session, "Heart owner"), make_account(session, "Partner")
    space = make_space(session, owner)
    relationship.add_member(session, space.id, partner)
    owner_token, partner_token = sign_in(session, owner), sign_in(session, partner)
    first, second = (ready(session, space.id, owner.id) for _ in range(2))
    base = f"/api/v1/spaces/{space.id}/heart-moments"
    response = client.post(
        base,
        headers=auth(owner_token),
        json={
            "text": "A private weekend",
            "emotion": "LOVED",
            "visibility": "PRIVATE",
            "happenedOn": "2026-11-01",
            "attachments": [
                {"attachmentId": str(item.id), "position": position}
                for position, item in enumerate((first, second))
            ],
            "selectedCoverAttachmentId": str(second.id),
        },
    )
    assert response.status_code == 201, response.text
    heart = response.json()
    assert (
        session.scalar(
            select(OutboxEvent.resource_version).where(
                OutboxEvent.subject_id == UUID(heart["id"]),
                OutboxEvent.event_type == "HEART_MOMENT_CREATED",
            )
        )
        == heart["version"]
    )
    assert len(heart["attachments"]) == 2
    assert binding.parent_of(session, second.id) == ("HEART_MOMENT", UUID(heart["id"]))
    assert client.get(f"{base}/{heart['id']}", headers=auth(partner_token)).status_code == 404
    assert not read_shared_photos(
        session, AuthorizationContext(account_id=partner.id, space_id=space.id)
    ).items
    updated = client.patch(
        f"{base}/{heart['id']}",
        headers={**auth(owner_token), "If-Match": str(heart["version"])},
        json={"attachmentId": None},
    )
    assert updated.status_code == 200, updated.text
    assert [item["id"] for item in updated.json()["attachments"]] == [str(second.id)]
    assert updated.json()["selectedCoverAttachmentId"] == str(second.id)
