"""Binding attachments to RelatedPerson and privacy invariants."""

from __future__ import annotations

import io
from uuid import UUID

import pytest
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.attachments import service
from eimir.attachments.models import Attachment, AttachmentStatus
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


def base_path(space_id: object) -> str:
    return f"/api/v1/spaces/{space_id}"


def if_match(token: str, version: int) -> dict[str, str]:
    return {**auth(token), "If-Match": f'"{version}"'}


def image_bytes() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (32, 24), (10, 20, 30)).save(buffer, "JPEG")
    return buffer.getvalue()


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    session.flush()
    return {
        "anna": anna,
        "ben": ben,
        "space": space,
        "token_a": sign_in(session, anna),
        "token_b": sign_in(session, ben),
    }


def ready_attachment(
    client,
    couple,
    session,
    *,
    token_key: str = "token_a",
) -> str:  # type: ignore[no-untyped-def]
    content = image_bytes()
    created = client.post(
        f"{base_path(couple['space'].id)}/attachments",
        json={
            "mediaType": "IMAGE",
            "originalName": "avatar.jpg",
            "expectedMimeType": "image/jpeg",
            "expectedSize": len(content),
        },
        headers=auth(couple[token_key]),
    ).json()
    attachment_id = created["attachment"]["id"]
    client.put(
        f"{base_path(couple['space'].id)}/attachments/{attachment_id}/content",
        content=content,
        headers=auth(couple[token_key]),
    )
    client.post(
        f"{base_path(couple['space'].id)}/attachments/{attachment_id}/finalize",
        json={},
        headers=auth(couple[token_key]),
    )
    service.validate(session, UUID(attachment_id))
    session.flush()
    return attachment_id


class TestRelatedPersonAvatar:
    def test_create_person_with_avatar(self, client, couple, session) -> None:  # type: ignore[no-untyped-def]
        attachment_id = ready_attachment(client, couple, session)
        response = client.post(
            f"{base_path(couple['space'].id)}/related-persons",
            json={
                "displayName": "Mara",
                "relationship": "FRIEND",
                "birthday": "1995-05-12",
                "birthdayYearKnown": True,
                "visibility": "SHARED",
                "avatarAttachmentId": attachment_id,
            },
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 201
        data = response.json()
        assert data["displayName"] == "Mara"
        assert data["avatarAttachmentId"] == attachment_id

    def test_shared_person_avatar_is_readable_by_partner(self, client, couple, session) -> None:  # type: ignore[no-untyped-def]
        attachment_id = ready_attachment(client, couple, session)
        created = client.post(
            f"{base_path(couple['space'].id)}/related-persons",
            json={
                "displayName": "Mara",
                "relationship": "FRIEND",
                "visibility": "SHARED",
                "avatarAttachmentId": attachment_id,
            },
            headers=auth(couple["token_a"]),
        ).json()

        # Partner Ben can stream the content
        content_res = client.get(
            f"{base_path(couple['space'].id)}/attachments/{attachment_id}/content",
            headers=auth(couple["token_b"]),
        )
        assert content_res.status_code == 200

        # Partner Ben can create read access
        read_access = client.post(
            f"{base_path(couple['space'].id)}/attachments/{attachment_id}/read-access",
            json={"parentType": "RELATED_PERSON", "parentId": created["id"]},
            headers=auth(couple["token_b"]),
        )
        assert read_access.status_code == 200

    def test_private_person_avatar_is_not_readable_by_partner(
        self, client, couple, session
    ) -> None:  # type: ignore[no-untyped-def]
        attachment_id = ready_attachment(client, couple, session)
        created = client.post(
            f"{base_path(couple['space'].id)}/related-persons",
            json={
                "displayName": "Private Doctor",
                "relationship": "OTHER",
                "visibility": "PRIVATE",
                "avatarAttachmentId": attachment_id,
            },
            headers=auth(couple["token_a"]),
        ).json()

        # Owner Anna can read
        assert (
            client.get(
                f"{base_path(couple['space'].id)}/attachments/{attachment_id}/content",
                headers=auth(couple["token_a"]),
            ).status_code
            == 200
        )

        # Partner Ben is rejected with 404 (privacy absence)
        assert (
            client.get(
                f"{base_path(couple['space'].id)}/attachments/{attachment_id}/content",
                headers=auth(couple["token_b"]),
            ).status_code
            == 404
        )

        # Partner Ben read-access descriptor is rejected with 404
        assert (
            client.post(
                f"{base_path(couple['space'].id)}/attachments/{attachment_id}/read-access",
                json={"parentType": "RELATED_PERSON", "parentId": created["id"]},
                headers=auth(couple["token_b"]),
            ).status_code
            == 404
        )

    def test_replace_avatar_marks_previous_for_deletion(self, client, couple, session) -> None:  # type: ignore[no-untyped-def]
        first_id = ready_attachment(client, couple, session)
        second_id = ready_attachment(client, couple, session)

        created = client.post(
            f"{base_path(couple['space'].id)}/related-persons",
            json={
                "displayName": "Mara",
                "relationship": "FRIEND",
                "visibility": "SHARED",
                "avatarAttachmentId": first_id,
            },
            headers=auth(couple["token_a"]),
        ).json()

        updated = client.put(
            f"{base_path(couple['space'].id)}/related-persons/{created['id']}",
            json={
                "displayName": "Mara",
                "relationship": "FRIEND",
                "visibility": "SHARED",
                "avatarAttachmentId": second_id,
            },
            headers=if_match(couple["token_a"], created["version"]),
        )
        assert updated.status_code == 200
        assert updated.json()["avatarAttachmentId"] == second_id

        # First attachment must now be DELETING
        first_row = session.execute(
            select(Attachment).where(Attachment.id == UUID(first_id))
        ).scalar_one()
        assert first_row.status == AttachmentStatus.DELETING.value

    def test_remove_avatar_marks_detached_for_deletion(self, client, couple, session) -> None:  # type: ignore[no-untyped-def]
        attachment_id = ready_attachment(client, couple, session)
        created = client.post(
            f"{base_path(couple['space'].id)}/related-persons",
            json={
                "displayName": "Mara",
                "relationship": "FRIEND",
                "visibility": "SHARED",
                "avatarAttachmentId": attachment_id,
            },
            headers=auth(couple["token_a"]),
        ).json()

        updated = client.put(
            f"{base_path(couple['space'].id)}/related-persons/{created['id']}",
            json={
                "displayName": "Mara",
                "relationship": "FRIEND",
                "visibility": "SHARED",
                "avatarAttachmentId": None,
            },
            headers=if_match(couple["token_a"], created["version"]),
        )
        assert updated.status_code == 200
        assert updated.json()["avatarAttachmentId"] is None

        row = session.execute(
            select(Attachment).where(Attachment.id == UUID(attachment_id))
        ).scalar_one()
        assert row.status == AttachmentStatus.DELETING.value

    def test_delete_person_marks_avatar_for_deletion(self, client, couple, session) -> None:  # type: ignore[no-untyped-def]
        attachment_id = ready_attachment(client, couple, session)
        created = client.post(
            f"{base_path(couple['space'].id)}/related-persons",
            json={
                "displayName": "Mara",
                "relationship": "FRIEND",
                "visibility": "SHARED",
                "avatarAttachmentId": attachment_id,
            },
            headers=auth(couple["token_a"]),
        ).json()

        deleted = client.delete(
            f"{base_path(couple['space'].id)}/related-persons/{created['id']}?deletePolicy=preserve",
            headers=if_match(couple["token_a"], created["version"]),
        )
        assert deleted.status_code == 204

        row = session.execute(
            select(Attachment).where(Attachment.id == UUID(attachment_id))
        ).scalar_one()
        assert row.status == AttachmentStatus.DELETING.value

    def test_binding_same_attachment_to_two_persons_is_rejected(
        self, client, couple, session
    ) -> None:  # type: ignore[no-untyped-def]
        attachment_id = ready_attachment(client, couple, session)
        client.post(
            f"{base_path(couple['space'].id)}/related-persons",
            json={
                "displayName": "Mara",
                "relationship": "FRIEND",
                "visibility": "SHARED",
                "avatarAttachmentId": attachment_id,
            },
            headers=auth(couple["token_a"]),
        )

        response = client.post(
            f"{base_path(couple['space'].id)}/related-persons",
            json={
                "displayName": "Klaus",
                "relationship": "FRIEND",
                "visibility": "SHARED",
                "avatarAttachmentId": attachment_id,
            },
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 409
        assert response.json()["code"] == "ATTACHMENT_ALREADY_LINKED"
