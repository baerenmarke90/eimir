"""Authorization, pagination and downgrade acceptance for the saved-memory map."""

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from eimir.attachments.binding import MemoryAttachment
from eimir.attachments.models import Attachment, AttachmentPayload, AttachmentStatus, MediaType
from eimir.authorization import PrivacyClass
from eimir.core.clock import now
from eimir.entitlements import service as entitlements
from eimir.entitlements.models import (
    Capability,
    EntitlementSourceType,
    EntitlementStatus,
    EntitlementTier,
)
from eimir.memories.models import Memory, MemoryPayload
from eimir.places.models import Place, PlacePayload
from eimir.relations.models import PlaceMemory
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


def test_memory_map_is_bounded_tenant_scoped_and_non_destructive_on_downgrade(
    client, session: Session
):  # type: ignore[no-untyped-def]
    owner = make_account(session, "Map owner")
    outsider = make_account(session, "Outsider")
    space = make_space(session, owner)
    foreign = make_space(session, outsider)
    token = sign_in(session, owner)
    other_token = sign_in(session, outsider)
    endpoint = f"/api/v1/spaces/{space.id}/memory-map"
    assert client.get(endpoint, headers=auth(token)).status_code == 403
    grant = entitlements.record_grant(
        session,
        space_id=space.id,
        account_id=owner.id,
        source_type=EntitlementSourceType.TEST_FIXTURE,
        status=EntitlementStatus.ACTIVE,
        tier=EntitlementTier.PREMIUM,
        effective_from=now(),
        capabilities=[Capability.MEMORIES_MAP.value],
    )
    memories = []
    places = []
    for index, (target, account, coordinate) in enumerate(
        [
            (space, owner, True),
            (space, owner, True),
            (space, owner, False),
            (foreign, outsider, True),
        ]
    ):
        memory = Memory(
            space_id=target.id,
            owner_id=account.id,
            privacy_class=PrivacyClass.SPACE_SHARED.value,
            happened_on=date(2026, 10, 30),
            payload=MemoryPayload(title=f"Memory {index}", body=""),
        )
        place = Place(
            space_id=target.id,
            owner_id=account.id,
            privacy_class=PrivacyClass.SPACE_SHARED.value,
            latitude=Decimal("49") if coordinate else None,
            longitude=Decimal("7") if coordinate else None,
            payload=PlacePayload(name=f"Place {index}"),
        )
        session.add_all([memory, place])
        session.flush()
        session.add(
            PlaceMemory(
                space_id=target.id, created_by=account.id, memory_id=memory.id, place_id=place.id
            )
        )
        memories.append(memory)
        places.append(place)
    session.flush()
    previews = []
    for index, memory in enumerate(memories):
        attachment = Attachment(
            space_id=memory.space_id,
            owner_id=memory.owner_id,
            privacy_class=PrivacyClass.OWNER_ONLY.value,
            status=(AttachmentStatus.PENDING if index == 0 else AttachmentStatus.READY).value,
            media_type=MediaType.IMAGE.value,
            declared_mime_type="image/jpeg",
            declared_size=100,
            payload=AttachmentPayload(original_name="map.jpg", is_sensitive=True),
        )
        session.add(attachment)
        session.flush()
        session.add(MemoryAttachment(memory_id=memory.id, attachment_id=attachment.id, position=0))
        previews.append(attachment)
    session.flush()
    visible = client.get(endpoint, headers=auth(token)).json()["items"]
    assert {item["memoryId"] for item in visible} == {str(memory.id) for memory in memories[:2]}
    first_memory = next(item for item in visible if item["memoryId"] == str(memories[0].id))
    second_memory = next(item for item in visible if item["memoryId"] == str(memories[1].id))
    assert first_memory["previewAttachmentId"] is None
    assert second_memory["previewAttachmentId"] == str(previews[1].id)
    assert second_memory["previewIsSensitive"] is True
    assert all(item["previewAttachmentId"] != str(previews[3].id) for item in visible)
    first = client.get(endpoint, headers=auth(token), params={"limit": 1})
    assert first.status_code == 200
    assert first.headers["Cache-Control"] == "no-store"
    page = first.json()
    assert len(page["items"]) == 1 and page["nextCursor"]
    second = client.get(
        endpoint, headers=auth(token), params={"limit": 1, "cursor": page["nextCursor"]}
    ).json()
    assert second["nextCursor"] is None
    assert {item["title"] for item in [*page["items"], *second["items"]]} == {
        "Memory 0",
        "Memory 1",
    }
    assert client.get(endpoint, headers=auth(other_token)).status_code == 404
    assert (
        client.get(endpoint, headers=auth(token), params={"cursor": "invalid"}).status_code == 400
    )
    session.delete(places[0])
    session.flush()
    assert len(client.get(endpoint, headers=auth(token)).json()["items"]) == 1
    grant.status = EntitlementStatus.REVOKED.value
    session.flush()
    assert client.get(endpoint, headers=auth(token)).status_code == 403
    assert session.get(Memory, memories[1].id) is not None
