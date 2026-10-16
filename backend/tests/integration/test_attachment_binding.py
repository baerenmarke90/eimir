"""Binding attachments to Memory and HeartMoment.

The core guarantee is singular: after binding, readability follows exclusively
from the parent. The attachment owner is no longer an alternative read path.
"""

from __future__ import annotations

import io
from datetime import timedelta
from typing import Any
from uuid import UUID, uuid4

import pytest
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.attachments import cleanup, service
from eimir.attachments.models import Attachment, AttachmentStatus
from eimir.core.clock import now
from eimir.media import build_storage_key, get_media_store
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


def base_path(space_id: object) -> str:
    return f"/api/v1/spaces/{space_id}"


def image_bytes() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (32, 24), (10, 20, 30)).save(buffer, "JPEG")
    return buffer.getvalue()


def if_match(token: str, version: int) -> dict[str, str]:
    return {**auth(token), "If-Match": f'"{version}"'}


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
            "originalName": "bild.jpg",
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


def memory(
    client,
    couple,
    *,
    token_key: str = "token_a",
) -> dict[str, Any]:  # type: ignore[no-untyped-def]
    return client.post(
        f"{base_path(couple['space'].id)}/memories",
        json={"title": "Urlaub", "body": "Text", "happenedOn": "2025-06-13"},
        headers=auth(couple[token_key]),
    ).json()


def heart_moment(
    client,
    couple,
    *,
    visibility: str = "SHARED",
    attachment_id: str | None = None,
):  # type: ignore[no-untyped-def]
    body: dict[str, Any] = {
        "text": "Danke fuer heute.",
        "emotion": "LOVED",
        "visibility": visibility,
        "happenedOn": "2025-06-13",
    }
    if attachment_id is not None:
        body["attachmentId"] = attachment_id
    return client.post(
        f"{base_path(couple['space'].id)}/heart-moments",
        json=body,
        headers=auth(couple["token_a"]),
    )


class TestGallery:
    def test_order_remains_stable(self, client, couple, session) -> None:  # type: ignore[no-untyped-def]
        first = ready_attachment(client, couple, session)
        second = ready_attachment(client, couple, session)
        third = ready_attachment(client, couple, session)
        created_memory = memory(client, couple)

        updated = client.put(
            f"{base_path(couple['space'].id)}/memories/{created_memory['id']}/attachments",
            json={
                "attachments": [
                    {"attachmentId": third, "position": 0},
                    {"attachmentId": first, "position": 1},
                    {"attachmentId": second, "position": 2},
                ]
            },
            headers=if_match(couple["token_a"], created_memory["version"]),
        )
        assert updated.status_code == 200
        assert [item["id"] for item in updated.json()["attachments"]] == [
            third,
            first,
            second,
        ]

        fetched = client.get(
            f"{base_path(couple['space'].id)}/memories/{created_memory['id']}",
            headers=auth(couple["token_a"]),
        )
        assert [item["id"] for item in fetched.json()["attachments"]] == [
            third,
            first,
            second,
        ]
        assert [item["position"] for item in fetched.json()["attachments"]] == [0, 1, 2]

    def test_swapping_positions_works(self, client, couple, session) -> None:  # type: ignore[no-untyped-def]
        """Unique positions must not block each other during a swap."""
        first = ready_attachment(client, couple, session)
        second = ready_attachment(client, couple, session)
        created_memory = memory(client, couple)

        initial = client.put(
            f"{base_path(couple['space'].id)}/memories/{created_memory['id']}/attachments",
            json={
                "attachments": [
                    {"attachmentId": first, "position": 0},
                    {"attachmentId": second, "position": 1},
                ]
            },
            headers=if_match(couple["token_a"], created_memory["version"]),
        )
        assert initial.status_code == 200

        swapped = client.put(
            f"{base_path(couple['space'].id)}/memories/{created_memory['id']}/attachments",
            json={
                "attachments": [
                    {"attachmentId": second, "position": 0},
                    {"attachmentId": first, "position": 1},
                ]
            },
            headers=if_match(couple["token_a"], initial.json()["version"]),
        )
        assert swapped.status_code == 200
        assert [item["id"] for item in swapped.json()["attachments"]] == [second, first]

    def test_gaps_in_positions_are_rejected(self, client, couple, session) -> None:  # type: ignore[no-untyped-def]
        attachment_id = ready_attachment(client, couple, session)
        created_memory = memory(client, couple)
        response = client.put(
            f"{base_path(couple['space'].id)}/memories/{created_memory['id']}/attachments",
            json={"attachments": [{"attachmentId": attachment_id, "position": 3}]},
            headers=if_match(couple["token_a"], created_memory["version"]),
        )
        assert response.status_code == 422

    def test_same_attachment_twice_is_rejected(self, client, couple, session) -> None:  # type: ignore[no-untyped-def]
        attachment_id = ready_attachment(client, couple, session)
        created_memory = memory(client, couple)
        response = client.put(
            f"{base_path(couple['space'].id)}/memories/{created_memory['id']}/attachments",
            json={
                "attachments": [
                    {"attachmentId": attachment_id, "position": 0},
                    {"attachmentId": attachment_id, "position": 1},
                ]
            },
            headers=if_match(couple["token_a"], created_memory["version"]),
        )
        assert response.status_code == 422

    def test_removing_attachment_releases_it_for_cleanup(
        self,
        client,
        couple,
        session,
    ) -> None:  # type: ignore[no-untyped-def]
        attachment_id = ready_attachment(client, couple, session)
        created_memory = memory(client, couple)
        updated = client.put(
            f"{base_path(couple['space'].id)}/memories/{created_memory['id']}/attachments",
            json={"attachments": [{"attachmentId": attachment_id, "position": 0}]},
            headers=if_match(couple["token_a"], created_memory["version"]),
        )
        cleared = client.put(
            f"{base_path(couple['space'].id)}/memories/{created_memory['id']}/attachments",
            json={"attachments": []},
            headers=if_match(couple["token_a"], updated.json()["version"]),
        )
        assert cleared.status_code == 200
        assert cleared.json()["attachments"] == []

        row = session.execute(
            select(Attachment).where(Attachment.id == UUID(attachment_id))
        ).scalar_one()
        assert row.status == AttachmentStatus.DELETING.value


class TestExclusiveBinding:
    def test_attachment_belongs_to_at_most_one_parent(
        self,
        client,
        couple,
        session,
    ) -> None:  # type: ignore[no-untyped-def]
        attachment_id = ready_attachment(client, couple, session)
        first = memory(client, couple)
        second = memory(client, couple)

        client.put(
            f"{base_path(couple['space'].id)}/memories/{first['id']}/attachments",
            json={"attachments": [{"attachmentId": attachment_id, "position": 0}]},
            headers=if_match(couple["token_a"], first["version"]),
        )
        response = client.put(
            f"{base_path(couple['space'].id)}/memories/{second['id']}/attachments",
            json={"attachments": [{"attachmentId": attachment_id, "position": 0}]},
            headers=if_match(couple["token_a"], second["version"]),
        )
        assert response.status_code == 409
        assert response.json()["code"] == "ATTACHMENT_ALREADY_LINKED"

    def test_not_bound_to_memory_and_heart_moment_simultaneously(
        self,
        client,
        couple,
        session,
    ) -> None:  # type: ignore[no-untyped-def]
        """No single table can know this, so the service enforces it."""
        attachment_id = ready_attachment(client, couple, session)
        created_memory = memory(client, couple)
        client.put(
            f"{base_path(couple['space'].id)}/memories/{created_memory['id']}/attachments",
            json={"attachments": [{"attachmentId": attachment_id, "position": 0}]},
            headers=if_match(couple["token_a"], created_memory["version"]),
        )
        response = heart_moment(client, couple, attachment_id=attachment_id)
        assert response.status_code == 409
        assert response.json()["code"] == "ATTACHMENT_ALREADY_LINKED"

    def test_reapplying_same_set_is_not_a_conflict(
        self,
        client,
        couple,
        session,
    ) -> None:  # type: ignore[no-untyped-def]
        attachment_id = ready_attachment(client, couple, session)
        created_memory = memory(client, couple)
        first = client.put(
            f"{base_path(couple['space'].id)}/memories/{created_memory['id']}/attachments",
            json={"attachments": [{"attachmentId": attachment_id, "position": 0}]},
            headers=if_match(couple["token_a"], created_memory["version"]),
        )
        repeated = client.put(
            f"{base_path(couple['space'].id)}/memories/{created_memory['id']}/attachments",
            json={"attachments": [{"attachmentId": attachment_id, "position": 0}]},
            headers=if_match(couple["token_a"], first.json()["version"]),
        )
        assert repeated.status_code == 200


class TestBindingEligibility:
    def test_only_ready_attachment_is_bindable(self, client, couple, session) -> None:  # type: ignore[no-untyped-def]
        content = image_bytes()
        created = client.post(
            f"{base_path(couple['space'].id)}/attachments",
            json={
                "mediaType": "IMAGE",
                "originalName": "bild.jpg",
                "expectedMimeType": "image/jpeg",
                "expectedSize": len(content),
            },
            headers=auth(couple["token_a"]),
        ).json()
        created_memory = memory(client, couple)
        response = client.put(
            f"{base_path(couple['space'].id)}/memories/{created_memory['id']}/attachments",
            json={"attachments": [{"attachmentId": created["attachment"]["id"], "position": 0}]},
            headers=if_match(couple["token_a"], created_memory["version"]),
        )
        assert response.status_code == 409
        assert response.json()["code"] == "ATTACHMENT_NOT_READY"

    def test_expired_binding_window_is_not_bindable(
        self,
        client,
        couple,
        session,
    ) -> None:  # type: ignore[no-untyped-def]
        attachment_id = ready_attachment(client, couple, session)
        row = session.execute(
            select(Attachment).where(Attachment.id == UUID(attachment_id))
        ).scalar_one()
        row.ready_at = now() - service.BINDING_WINDOW - timedelta(minutes=1)
        session.flush()

        created_memory = memory(client, couple)
        response = client.put(
            f"{base_path(couple['space'].id)}/memories/{created_memory['id']}/attachments",
            json={"attachments": [{"attachmentId": attachment_id, "position": 0}]},
            headers=if_match(couple["token_a"], created_memory["version"]),
        )
        assert response.status_code == 409

    def test_foreign_attachment_is_not_bindable(self, client, couple, session) -> None:  # type: ignore[no-untyped-def]
        from_ben = ready_attachment(client, couple, session, token_key="token_b")
        created_memory = memory(client, couple)
        response = client.put(
            f"{base_path(couple['space'].id)}/memories/{created_memory['id']}/attachments",
            json={"attachments": [{"attachmentId": from_ben, "position": 0}]},
            headers=if_match(couple["token_a"], created_memory["version"]),
        )
        assert response.status_code == 404

    def test_unknown_attachment_matches_foreign_attachment(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        created_memory = memory(client, couple)
        response = client.put(
            f"{base_path(couple['space'].id)}/memories/{created_memory['id']}/attachments",
            json={"attachments": [{"attachmentId": str(uuid4()), "position": 0}]},
            headers=if_match(couple["token_a"], created_memory["version"]),
        )
        assert response.status_code == 404


class TestReadabilityFollowsParent:
    def test_partner_reads_attachment_of_shared_memory(
        self,
        client,
        couple,
        session,
    ) -> None:  # type: ignore[no-untyped-def]
        attachment_id = ready_attachment(client, couple, session)
        created_memory = memory(client, couple)
        client.put(
            f"{base_path(couple['space'].id)}/memories/{created_memory['id']}/attachments",
            json={"attachments": [{"attachmentId": attachment_id, "position": 0}]},
            headers=if_match(couple["token_a"], created_memory["version"]),
        )

        content = client.get(
            f"{base_path(couple['space'].id)}/attachments/{attachment_id}/content",
            headers=auth(couple["token_b"]),
        )
        assert content.status_code == 200

    def test_private_heart_moment_also_blocks_its_attachment(
        self,
        client,
        couple,
        session,
    ) -> None:  # type: ignore[no-untyped-def]
        attachment_id = ready_attachment(client, couple, session)
        heart = heart_moment(client, couple, attachment_id=attachment_id).json()

        # While SHARED, the partner may read it.
        assert (
            client.get(
                f"{base_path(couple['space'].id)}/attachments/{attachment_id}/content",
                headers=auth(couple["token_b"]),
            ).status_code
            == 200
        )

        client.patch(
            f"{base_path(couple['space'].id)}/heart-moments/{heart['id']}/visibility",
            json={"visibility": "PRIVATE"},
            headers=if_match(couple["token_a"], heart["version"]),
        )

        blocked = client.get(
            f"{base_path(couple['space'].id)}/attachments/{attachment_id}/content",
            headers=auth(couple["token_b"]),
        )
        assert blocked.status_code == 404

    def test_owner_is_not_separate_read_path_after_binding(
        self,
        client,
        couple,
        session,
    ) -> None:  # type: ignore[no-untyped-def]
        """Ben uploads and binds the file to his private HeartMoment.

        Anna must not be able to read it afterwards, even though she belongs to
        the same Space.
        """
        from_ben = ready_attachment(client, couple, session, token_key="token_b")
        created = client.post(
            f"{base_path(couple['space'].id)}/heart-moments",
            json={
                "text": "Nur fuer mich.",
                "emotion": "SEEN",
                "visibility": "PRIVATE",
                "happenedOn": "2025-06-13",
                "attachmentId": from_ben,
            },
            headers=auth(couple["token_b"]),
        )
        assert created.status_code == 201

        assert (
            client.get(
                f"{base_path(couple['space'].id)}/attachments/{from_ben}/content",
                headers=auth(couple["token_a"]),
            ).status_code
            == 404
        )

    def test_wrong_parent_reference_is_rejected(
        self,
        client,
        couple,
        session,
    ) -> None:  # type: ignore[no-untyped-def]
        attachment_id = ready_attachment(client, couple, session)
        created_memory = memory(client, couple)
        client.put(
            f"{base_path(couple['space'].id)}/memories/{created_memory['id']}/attachments",
            json={"attachments": [{"attachmentId": attachment_id, "position": 0}]},
            headers=if_match(couple["token_a"], created_memory["version"]),
        )
        response = client.post(
            f"{base_path(couple['space'].id)}/attachments/{attachment_id}/read-access",
            json={"parentType": "MEMORY", "parentId": str(uuid4())},
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 404

    def test_none_is_not_allowed_after_binding(
        self,
        client,
        couple,
        session,
    ) -> None:  # type: ignore[no-untyped-def]
        """M2-D24 applies only to unbound uploads."""
        attachment_id = ready_attachment(client, couple, session)
        created_memory = memory(client, couple)
        client.put(
            f"{base_path(couple['space'].id)}/memories/{created_memory['id']}/attachments",
            json={"attachments": [{"attachmentId": attachment_id, "position": 0}]},
            headers=if_match(couple["token_a"], created_memory["version"]),
        )
        response = client.post(
            f"{base_path(couple['space'].id)}/attachments/{attachment_id}/read-access",
            json={"parentType": "NONE"},
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 404


class TestCleanupRespectsBinding:
    def test_bound_attachment_does_not_expire(self, client, couple, session) -> None:  # type: ignore[no-untyped-def]
        """After binding, lifetime follows the parent (M2-D20)."""
        attachment_id = ready_attachment(client, couple, session)
        created_memory = memory(client, couple)
        client.put(
            f"{base_path(couple['space'].id)}/memories/{created_memory['id']}/attachments",
            json={"attachments": [{"attachmentId": attachment_id, "position": 0}]},
            headers=if_match(couple["token_a"], created_memory["version"]),
        )

        row = session.execute(
            select(Attachment).where(Attachment.id == UUID(attachment_id))
        ).scalar_one()
        row.ready_at = now() - service.BINDING_WINDOW - timedelta(hours=5)
        session.flush()

        cleanup.run_media_cleanup(session, {})
        session.flush()

        session.refresh(row)
        assert row.status == AttachmentStatus.READY.value
        assert get_media_store().exists(build_storage_key(row.space_id, row.id, "original"))

    def test_unbound_attachment_still_expires(self, client, couple, session) -> None:  # type: ignore[no-untyped-def]
        attachment_id = ready_attachment(client, couple, session)
        row = session.execute(
            select(Attachment).where(Attachment.id == UUID(attachment_id))
        ).scalar_one()
        row.ready_at = now() - service.BINDING_WINDOW - timedelta(minutes=1)
        session.flush()

        cleanup.run_media_cleanup(session, {})
        session.flush()

        assert (
            client.get(
                f"{base_path(couple['space'].id)}/attachments/{attachment_id}",
                headers=auth(couple["token_a"]),
            ).status_code
            == 404
        )
