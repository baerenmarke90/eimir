"""HTTP/PostgreSQL privacy and pagination acceptance for the media gallery."""

from uuid import UUID

import pytest
from sqlalchemy import update

from eimir.attachments.models import Attachment, AttachmentStatus, MediaType
from eimir.memories.models import Memory
from tests.conftest import auth, requires_database
from tests.integration.test_attachment_binding import heart_moment, ready_attachment
from tests.integration.test_story import base_path, memory
from tests.integration.test_story import couple as couple

pytestmark = [pytest.mark.integration, requires_database]


def gallery(client, couple, *, token=None, collection="photos", **params):  # type: ignore[no-untyped-def]
    return client.get(
        f"{base_path(couple['space'].id)}/{collection}",
        params=params,
        headers=auth(token or couple["token_a"]),
    )


def bind_memory(client, couple, session, *, count=1, happened_on="2026-09-12"):  # type: ignore[no-untyped-def]
    parent = memory(client, couple, happened_on=happened_on)
    attachments = [ready_attachment(client, couple, session) for _ in range(count)]
    response = client.put(
        f"{base_path(couple['space'].id)}/memories/{parent['id']}/attachments",
        json={
            "attachments": [
                {"attachmentId": item, "position": i} for i, item in enumerate(attachments)
            ]
        },
        headers={**auth(couple["token_a"]), "If-Match": f'"{parent["version"]}"'},
    )
    assert response.status_code == 200, response.text
    return parent, attachments


def attachment_ids(response):  # type: ignore[no-untyped-def]
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "private, no-store"
    return [item["attachment"]["id"] for item in response.json()["items"]]


def test_shared_only_for_both_owner_and_partner(client, couple, session):  # type: ignore[no-untyped-def]
    parent, memory_images = bind_memory(client, couple, session, count=3)
    shared = ready_attachment(client, couple, session)
    heart = heart_moment(client, couple, attachment_id=shared).json()
    private = ready_attachment(client, couple, session)
    heart_moment(client, couple, attachment_id=private, visibility="PRIVATE")
    ready_attachment(client, couple, session)  # Unbound upload is not a shared photo.
    for token in (couple["token_a"], couple["token_b"]):
        response = gallery(client, couple, token=token)
        assert attachment_ids(response) == [*memory_images, shared]
        assert response.json()["totalCount"] == 4
        assert private not in response.text
        items = response.json()["items"]
        assert items[0]["parentId"] == parent["id"]
        assert items[-1]["parentType"] == "HEART_MOMENT"
        assert items[-1]["parentId"] == heart["id"]
        assert set(items[0]) == {"parentType", "parentId", "effectiveDate", "attachment"}
        assert "url" not in response.text and "storageKey" not in response.text


def test_keyset_pages_split_multi_photo_parents_and_equal_dates(client, couple, session):  # type: ignore[no-untyped-def]
    older, first = bind_memory(client, couple, session, count=3)
    newer, second = bind_memory(client, couple, session, count=3)
    # Force equal day and timestamp, exercising parent-id and attachment-position keys.
    session.execute(
        update(Memory)
        .where(Memory.id.in_([UUID(older["id"]), UUID(newer["id"])]))
        .values(created_at="2026-09-12T12:00:00Z")
    )
    session.flush()
    expected = second + first if UUID(newer["id"]) > UUID(older["id"]) else first + second
    seen = []
    cursor = None
    while True:
        response = gallery(client, couple, limit=2, **({"cursor": cursor} if cursor else {}))
        seen.extend(attachment_ids(response))
        assert response.json()["totalCount"] == 6
        cursor = response.json()["nextCursor"]
        if not response.json()["hasMore"]:
            assert cursor is None
            break
    assert seen == expected


def test_utc_creation_date_fallback_and_ready_image_filter(client, couple, session):  # type: ignore[no-untyped-def]
    parent, images = bind_memory(client, couple, session, count=3, happened_on=None)
    session.execute(
        update(Memory)
        .where(Memory.id == UUID(parent["id"]))
        .values(created_at="2026-08-01T00:30:00+02:00")
    )
    session.execute(
        update(Attachment)
        .where(Attachment.id == UUID(images[1]))
        .values(status=AttachmentStatus.FAILED)
    )
    session.execute(
        update(Attachment)
        .where(Attachment.id == UUID(images[2]))
        .values(media_type=MediaType.VIDEO)
    )
    session.flush()
    response = gallery(client, couple)
    assert attachment_ids(response) == images[:1]
    assert response.json()["items"][0]["effectiveDate"] == "2026-07-31"
    assert response.json()["totalCount"] == 1


def test_private_transition_removes_photo_and_blocks_partner_bytes(client, couple, session):  # type: ignore[no-untyped-def]
    image = ready_attachment(client, couple, session)
    heart = heart_moment(client, couple, attachment_id=image).json()
    assert attachment_ids(gallery(client, couple)) == [image]
    response = client.patch(
        f"{base_path(couple['space'].id)}/heart-moments/{heart['id']}/visibility",
        json={"visibility": "PRIVATE"},
        headers={**auth(couple["token_a"]), "If-Match": f'"{heart["version"]}"'},
    )
    assert response.status_code == 200, response.text
    for token in (couple["token_a"], couple["token_b"]):
        assert attachment_ids(gallery(client, couple, token=token)) == []
        assert attachment_ids(gallery(client, couple, token=token, collection="media")) == []
    assert attachment_ids(gallery(client, couple, collection="media", visibility="PRIVATE")) == [
        image
    ]
    assert (
        attachment_ids(
            gallery(
                client, couple, token=couple["token_b"], collection="media", visibility="PRIVATE"
            )
        )
        == []
    )
    for variant in ("original", "thumbnail"):
        response = client.get(
            f"{base_path(couple['space'].id)}/attachments/{image}/content",
            params={"variant": variant},
            headers=auth(couple["token_b"]),
        )
        assert response.status_code == 404


def test_media_includes_ready_photos_videos_voice_notes_and_plan_gallery(client, couple, session):  # type: ignore[no-untyped-def]
    _, (photo, video, failed) = bind_memory(client, couple, session, count=3)
    heart_photo, voice, plan_cover, plan_photo = (
        ready_attachment(client, couple, session) for _ in range(4)
    )
    base = base_path(couple["space"].id)
    headers = auth(couple["token_a"])
    heart = client.post(
        f"{base}/heart-moments",
        headers=headers,
        json={
            "text": "A day together",
            "emotion": "LOVED",
            "happenedOn": "2026-08-15",
            "visibility": "SHARED",
            "attachments": [
                {"attachmentId": heart_photo, "position": 0},
                {"attachmentId": voice, "position": 1},
            ],
        },
    )
    assert heart.status_code == 201, heart.text
    plan = client.post(
        f"{base}/plans",
        headers=headers,
        json={
            "title": "A plan for two",
            "attachments": [
                {"attachmentId": plan_cover, "position": 0},
                {"attachmentId": plan_photo, "position": 1},
            ],
        },
    )
    assert plan.status_code == 201, plan.text
    # The projection operates on already processed media and their bindings.
    for item, changes in (
        (video, {"media_type": MediaType.VIDEO, "duration_seconds": 24}),
        (voice, {"media_type": MediaType.AUDIO, "duration_seconds": 5}),
        (failed, {"status": AttachmentStatus.FAILED}),
    ):
        session.execute(update(Attachment).where(Attachment.id == UUID(item)).values(**changes))
    session.flush()

    response = gallery(client, couple, token=couple["token_b"], collection="media")
    assert set(attachment_ids(response)) == {
        photo,
        video,
        heart_photo,
        voice,
        plan_cover,
        plan_photo,
    }
    assert response.json()["totalCount"] == 6
    items = {item["attachment"]["id"]: item for item in response.json()["items"]}
    assert items[video]["attachment"]["mediaType"] == "VIDEO"
    assert items[voice]["attachment"]["mediaType"] == "AUDIO"
    assert items[voice]["attachment"]["durationSeconds"] == 5
    assert items[voice]["parentId"] == heart.json()["id"]
    for item in (plan_cover, plan_photo):
        assert items[item]["parentType"] == "PLAN"
        assert items[item]["parentId"] == plan.json()["id"]
    assert attachment_ids(gallery(client, couple)) == [photo, heart_photo]


def test_private_media_pages_only_include_the_callers_own_bound_media(client, couple, session):  # type: ignore[no-untyped-def]
    private = [ready_attachment(client, couple, session) for _ in range(2)]
    for image in private:
        response = heart_moment(client, couple, attachment_id=image, visibility="PRIVATE")
        assert response.status_code == 201, response.text
    ready_attachment(client, couple, session)
    bind_memory(client, couple, session)

    first = gallery(client, couple, collection="media", visibility="PRIVATE", limit=1)
    first_ids = attachment_ids(first)
    assert first.json()["totalCount"] == 2
    cursor = first.json()["nextCursor"]
    assert cursor
    second = gallery(client, couple, collection="media", visibility="PRIVATE", cursor=cursor)
    assert sorted(first_ids + attachment_ids(second)) == sorted(private)
    assert second.json()["hasMore"] is False
    for visibility, token in (("SHARED", couple["token_a"]), ("PRIVATE", couple["token_b"])):
        response = gallery(
            client, couple, token=token, collection="media", visibility=visibility, cursor=cursor
        )
        assert response.status_code == 400
        assert response.json()["code"] == "INVALID_CURSOR"
    partner = gallery(
        client, couple, token=couple["token_b"], collection="media", visibility="PRIVATE"
    )
    assert attachment_ids(partner) == []
    assert partner.json()["totalCount"] == 0
    assert gallery(client, couple, token=couple["token_f"], collection="media").status_code == 404


def test_cursor_tampering_and_account_binding(client, couple, session):  # type: ignore[no-untyped-def]
    bind_memory(client, couple, session, count=3)
    cursor = gallery(client, couple, limit=1).json()["nextCursor"]
    for supplied, token in ((cursor + "x", couple["token_a"]), (cursor, couple["token_b"])):
        response = gallery(client, couple, cursor=supplied, token=token)
        assert response.status_code == 400
        assert response.json()["code"] == "INVALID_CURSOR"


def test_other_space_and_non_member_are_absent(client, couple, session):  # type: ignore[no-untyped-def]
    bind_memory(client, couple, session)
    response = gallery(client, couple, token=couple["token_f"])
    assert response.status_code == 404
    response = client.get(f"{base_path(couple['beta'].id)}/photos", headers=auth(couple["token_f"]))
    assert attachment_ids(response) == []
    assert response.json()["totalCount"] == 0


@pytest.mark.parametrize("limit", [0, 101])
def test_limits_are_bounded(client, couple, limit):  # type: ignore[no-untyped-def]
    assert gallery(client, couple, limit=limit).status_code == 422
