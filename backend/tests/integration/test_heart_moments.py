"""PostgreSQL and HTTP acceptance for the M2 HeartMoment slice.

The focus is the visibility boundary: a private HeartMoment must never appear
to the partner through any access path, including detail, list, cursor, event,
or a distinguishable response shape.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.outbox.models import OutboxEvent
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

SECRET_TEXT = "Ein Satz, den nur ich lesen darf."


def path(space_id: object) -> str:
    return f"/api/v1/spaces/{space_id}/heart-moments"


def body(
    *,
    text: str = "Danke, dass du heute da warst.",
    emotion: str = "LOVED",
    visibility: str = "SHARED",
    happened_on: str = "2025-06-13",
) -> dict[str, Any]:
    return {
        "text": text,
        "emotion": emotion,
        "visibility": visibility,
        "happenedOn": happened_on,
    }


def if_match(token: str, version: int) -> dict[str, str]:
    return {**auth(token), "If-Match": f'"{version}"'}


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    outsider = make_account(session, "Fremd")

    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    outsider_space = make_space(session, outsider)
    session.flush()

    return {
        "anna": anna,
        "ben": ben,
        "space": space,
        "outsider_space": outsider_space,
        "token_a": sign_in(session, anna),
        "token_b": sign_in(session, ben),
        "token_outsider": sign_in(session, outsider),
    }


def create_heart_moment(
    client,
    couple,
    *,
    token_key: str = "token_a",
    **overrides,
):  # type: ignore[no-untyped-def]
    return client.post(
        path(couple["space"].id),
        json=body(**overrides),
        headers=auth(couple[token_key]),
    )


class TestCrudAndOwnership:
    def test_author_can_create_read_update_delete(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        created = create_heart_moment(client, couple)
        assert created.status_code == 201
        heart_moment = created.json()
        assert UUID(heart_moment["id"]).version == 7
        assert heart_moment["authorId"] == str(couple["anna"].id)
        assert heart_moment["text"] == "Danke, dass du heute da warst."
        assert heart_moment["emotion"] == "LOVED"
        assert heart_moment["visibility"] == "SHARED"
        assert heart_moment["happenedOn"] == "2025-06-13"
        assert heart_moment["capabilities"] == {
            "canEdit": True,
            "canDelete": True,
            "canComment": True,
        }
        assert "privacyClass" not in heart_moment
        assert created.headers["ETag"] == '"1"'

        updated = client.patch(
            f"{path(couple['space'].id)}/{heart_moment['id']}",
            json={"text": "  Danke fuer den ruhigen Abend.  ", "emotion": "GRATEFUL"},
            headers=if_match(couple["token_a"], 1),
        )
        assert updated.status_code == 200
        assert updated.json()["text"] == "Danke fuer den ruhigen Abend."
        assert updated.json()["emotion"] == "GRATEFUL"
        assert updated.json()["version"] == 2

        deleted = client.delete(
            f"{path(couple['space'].id)}/{heart_moment['id']}",
            headers=if_match(couple["token_a"], 2),
        )
        assert deleted.status_code == 204
        assert deleted.content == b""

    def test_textless_tagged_create_replay_edit_and_private_boundary(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        key = str(uuid4())
        payload = {**body(text=""), "tags": ["everyday", "home"], "visibility": "PRIVATE"}
        url = path(couple["space"].id)
        headers = {**auth(couple["token_a"]), "Idempotency-Key": key}
        created = client.post(url, json=payload, headers=headers)
        assert created.status_code == 201
        item = created.json()
        assert item["text"] == ""
        assert item["tags"] == ["everyday", "home"]
        assert client.post(url, json=payload, headers=headers).status_code == 200
        changed = client.post(url, json={**payload, "tags": ["home"]}, headers=headers)
        assert changed.status_code == 409
        assert changed.json()["code"] == "IDEMPOTENCY_KEY_REUSED"

        detail_url = f"{url}/{item['id']}"
        assert client.get(detail_url, headers=auth(couple["token_b"])).status_code == 404
        assert client.get(url, headers=auth(couple["token_b"])).json()["items"] == []
        updated = client.patch(
            detail_url,
            json={"emotion": "GRATEFUL"},
            headers=if_match(couple["token_a"], 1),
        )
        assert updated.status_code == 200
        assert updated.json()["tags"] == ["everyday", "home"]
        empty = client.patch(
            detail_url,
            json={"tags": []},
            headers=if_match(couple["token_a"], 2),
        )
        assert empty.status_code == 422
        assert client.get(detail_url, headers=auth(couple["token_a"])).json()["tags"] == [
            "everyday",
            "home",
        ]

    def test_partner_reads_shared_but_does_not_write(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        heart_moment = create_heart_moment(client, couple).json()

        read = client.get(
            f"{path(couple['space'].id)}/{heart_moment['id']}",
            headers=auth(couple["token_b"]),
        )
        assert read.status_code == 200
        assert read.json()["capabilities"] == {
            "canEdit": False,
            "canDelete": False,
            "canComment": True,
        }

        for response in (
            client.patch(
                f"{path(couple['space'].id)}/{heart_moment['id']}",
                json={"text": "Von Ben geaendert."},
                headers=if_match(couple["token_b"], 1),
            ),
            client.delete(
                f"{path(couple['space'].id)}/{heart_moment['id']}",
                headers=if_match(couple["token_b"], 1),
            ),
            client.patch(
                f"{path(couple['space'].id)}/{heart_moment['id']}/visibility",
                json={"visibility": "PRIVATE"},
                headers=if_match(couple["token_b"], 1),
            ),
        ):
            assert response.status_code == 403

    def test_anonymous_and_outsider_reach_nothing(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        heart_moment = create_heart_moment(client, couple).json()

        assert client.get(f"{path(couple['space'].id)}/{heart_moment['id']}").status_code == 401
        assert (
            client.get(
                f"{path(couple['outsider_space'].id)}/{heart_moment['id']}",
                headers=auth(couple["token_outsider"]),
            ).status_code
            == 404
        )
        assert (
            client.get(
                f"{path(couple['space'].id)}/{heart_moment['id']}",
                headers=auth(couple["token_outsider"]),
            ).status_code
            == 404
        )

    def test_unknown_and_malformed_ids_answer_the_same(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        for identifier in (str(uuid4()), "keine-uuid"):
            response = client.get(
                f"{path(couple['space'].id)}/{identifier}",
                headers=auth(couple["token_a"]),
            )
            assert response.status_code == 404


class TestPrivateRemainsOwnerOnly:
    def test_partner_sees_private_moment_in_no_path(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        private = create_heart_moment(
            client,
            couple,
            visibility="PRIVATE",
            text=SECRET_TEXT,
        ).json()

        detail = client.get(
            f"{path(couple['space'].id)}/{private['id']}",
            headers=auth(couple["token_b"]),
        )
        assert detail.status_code == 404
        assert SECRET_TEXT not in detail.text

        for query in ("", "?visibility=PRIVATE", "?visibility=SHARED", "?limit=100"):
            listing = client.get(
                f"{path(couple['space'].id)}{query}",
                headers=auth(couple["token_b"]),
            )
            assert listing.status_code == 200
            assert listing.json()["items"] == []
            assert listing.json()["hasMore"] is False
            assert SECRET_TEXT not in listing.text

    def test_partner_response_is_indistinguishable_from_nonexistence(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        """No existence signal: 404 in both cases with the same body."""
        private = create_heart_moment(client, couple, visibility="PRIVATE").json()

        existing = client.get(
            f"{path(couple['space'].id)}/{private['id']}",
            headers=auth(couple["token_b"]),
        )
        fabricated = client.get(
            f"{path(couple['space'].id)}/{uuid4()}",
            headers=auth(couple["token_b"]),
        )
        assert existing.status_code == fabricated.status_code == 404
        assert existing.json() == fabricated.json()

    def test_partner_cannot_update_or_delete_private_moment(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        """Return 404 rather than 403 because 403 would confirm existence."""
        private = create_heart_moment(client, couple, visibility="PRIVATE").json()

        for response in (
            client.patch(
                f"{path(couple['space'].id)}/{private['id']}",
                json={"text": "Fremdzugriff."},
                headers=if_match(couple["token_b"], 1),
            ),
            client.delete(
                f"{path(couple['space'].id)}/{private['id']}",
                headers=if_match(couple["token_b"], 1),
            ),
            client.patch(
                f"{path(couple['space'].id)}/{private['id']}/visibility",
                json={"visibility": "SHARED"},
                headers=if_match(couple["token_b"], 1),
            ),
        ):
            assert response.status_code == 404

    def test_owner_sees_own_private_moment(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        private = create_heart_moment(client, couple, visibility="PRIVATE").json()

        detail = client.get(
            f"{path(couple['space'].id)}/{private['id']}",
            headers=auth(couple["token_a"]),
        )
        assert detail.status_code == 200
        assert detail.json()["visibility"] == "PRIVATE"
        assert detail.json()["capabilities"]["canComment"] is False

        listing = client.get(
            f"{path(couple['space'].id)}?visibility=PRIVATE",
            headers=auth(couple["token_a"]),
        )
        assert [item["id"] for item in listing.json()["items"]] == [private["id"]]

    def test_partners_keep_separate_private_collections(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        from_anna = create_heart_moment(
            client,
            couple,
            visibility="PRIVATE",
            text="Annas Satz.",
        ).json()
        from_ben = create_heart_moment(
            client,
            couple,
            token_key="token_b",
            visibility="PRIVATE",
            text="Bens Satz.",
        ).json()

        for_anna = client.get(
            f"{path(couple['space'].id)}?visibility=PRIVATE",
            headers=auth(couple["token_a"]),
        )
        assert [item["id"] for item in for_anna.json()["items"]] == [from_anna["id"]]
        assert "Bens Satz." not in for_anna.text

        for_ben = client.get(
            f"{path(couple['space'].id)}?visibility=PRIVATE",
            headers=auth(couple["token_b"]),
        )
        assert [item["id"] for item in for_ben.json()["items"]] == [from_ben["id"]]
        assert "Annas Satz." not in for_ben.text


class TestVisibilityTransitions:
    def test_shared_to_private_revokes_partner_access(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        shared = create_heart_moment(client, couple, text=SECRET_TEXT).json()
        assert (
            client.get(
                f"{path(couple['space'].id)}/{shared['id']}",
                headers=auth(couple["token_b"]),
            ).status_code
            == 200
        )

        changed = client.patch(
            f"{path(couple['space'].id)}/{shared['id']}/visibility",
            json={"visibility": "PRIVATE"},
            headers=if_match(couple["token_a"], 1),
        )
        assert changed.status_code == 200
        assert changed.json()["visibility"] == "PRIVATE"
        assert changed.json()["version"] == 2
        assert changed.headers["ETag"] == '"2"'

        after = client.get(
            f"{path(couple['space'].id)}/{shared['id']}",
            headers=auth(couple["token_b"]),
        )
        assert after.status_code == 404
        assert SECRET_TEXT not in after.text

        listing = client.get(
            path(couple["space"].id),
            headers=auth(couple["token_b"]),
        )
        assert listing.json()["items"] == []

    def test_private_to_shared_reopens_access(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        private = create_heart_moment(client, couple, visibility="PRIVATE").json()

        changed = client.patch(
            f"{path(couple['space'].id)}/{private['id']}/visibility",
            json={"visibility": "SHARED"},
            headers=if_match(couple["token_a"], 1),
        )
        assert changed.status_code == 200
        assert changed.json()["visibility"] == "SHARED"

        assert (
            client.get(
                f"{path(couple['space'].id)}/{private['id']}",
                headers=auth(couple["token_b"]),
            ).status_code
            == 200
        )

    def test_transition_to_same_value_changes_nothing(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        shared = create_heart_moment(client, couple).json()

        response = client.patch(
            f"{path(couple['space'].id)}/{shared['id']}/visibility",
            json={"visibility": "SHARED"},
            headers=if_match(couple["token_a"], 1),
        )
        assert response.status_code == 200
        assert response.json()["version"] == 1
        assert response.headers["ETag"] == '"1"'

    def test_transition_requires_current_version(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        shared = create_heart_moment(client, couple).json()
        client.patch(
            f"{path(couple['space'].id)}/{shared['id']}",
            json={"text": "Zwischenstand."},
            headers=if_match(couple["token_a"], 1),
        )

        stale = client.patch(
            f"{path(couple['space'].id)}/{shared['id']}/visibility",
            json={"visibility": "PRIVATE"},
            headers=if_match(couple["token_a"], 1),
        )
        assert stale.status_code == 409
        assert stale.json()["code"] == "RESOURCE_VERSION_CONFLICT"

        unchanged = client.get(
            f"{path(couple['space'].id)}/{shared['id']}",
            headers=auth(couple["token_a"]),
        )
        assert unchanged.json()["visibility"] == "SHARED"

    def test_transition_without_if_match_is_rejected(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        shared = create_heart_moment(client, couple).json()
        response = client.patch(
            f"{path(couple['space'].id)}/{shared['id']}/visibility",
            json={"visibility": "PRIVATE"},
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 422

    def test_update_cannot_change_visibility_at_the_same_time(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        shared = create_heart_moment(client, couple).json()
        response = client.patch(
            f"{path(couple['space'].id)}/{shared['id']}",
            json={"text": "Neuer Text.", "visibility": "PRIVATE"},
            headers=if_match(couple["token_a"], 1),
        )
        assert response.status_code == 422

        unchanged = client.get(
            f"{path(couple['space'].id)}/{shared['id']}",
            headers=auth(couple["token_a"]),
        )
        assert unchanged.json()["visibility"] == "SHARED"
        assert unchanged.json()["version"] == 1


class TestConcurrency:
    def test_stale_update_and_delete_return_409(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        heart_moment = create_heart_moment(client, couple).json()
        client.patch(
            f"{path(couple['space'].id)}/{heart_moment['id']}",
            json={"text": "Erste Aenderung."},
            headers=if_match(couple["token_a"], 1),
        )

        for response in (
            client.patch(
                f"{path(couple['space'].id)}/{heart_moment['id']}",
                json={"text": "Zweite Aenderung."},
                headers=if_match(couple["token_a"], 1),
            ),
            client.delete(
                f"{path(couple['space'].id)}/{heart_moment['id']}",
                headers=if_match(couple["token_a"], 1),
            ),
        ):
            assert response.status_code == 409
            assert response.json()["code"] == "RESOURCE_VERSION_CONFLICT"


class TestPagination:
    def test_cursor_pages_without_gaps_or_duplicates(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        expected = [
            create_heart_moment(client, couple, text=f"Moment {index}").json()["id"]
            for index in range(5)
        ]

        seen: list[str] = []
        query = "?limit=2"
        while True:
            page = client.get(
                f"{path(couple['space'].id)}{query}",
                headers=auth(couple["token_a"]),
            )
            assert page.status_code == 200
            seen.extend(item["id"] for item in page.json()["items"])
            cursor = page.json()["nextCursor"]
            if cursor is None:
                break
            query = f"?limit=2&cursor={cursor}"

        assert seen == list(reversed(expected))
        assert len(set(seen)) == len(seen)

    def test_tampered_cursor_is_neutrally_rejected(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        for index in range(3):
            create_heart_moment(client, couple, text=f"Moment {index}")
        page = client.get(
            f"{path(couple['space'].id)}?limit=1",
            headers=auth(couple["token_a"]),
        )
        cursor = page.json()["nextCursor"]
        assert cursor is not None

        payload, signature = cursor.split(".", 1)
        tampered = f"{payload[:-1]}{'A' if payload[-1] != 'A' else 'B'}.{signature}"
        response = client.get(
            f"{path(couple['space'].id)}?limit=1&cursor={tampered}",
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 400
        assert response.json()["code"] == "INVALID_CURSOR"

    def test_cursor_is_bound_to_filter(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        for index in range(3):
            create_heart_moment(client, couple, text=f"Moment {index}")
        page = client.get(
            f"{path(couple['space'].id)}?limit=1",
            headers=auth(couple["token_a"]),
        )
        cursor = page.json()["nextCursor"]

        changed_filter = client.get(
            f"{path(couple['space'].id)}?limit=1&visibility=SHARED&cursor={cursor}",
            headers=auth(couple["token_a"]),
        )
        assert changed_filter.status_code == 400
        assert changed_filter.json()["code"] == "INVALID_CURSOR"

    def test_cursor_from_other_space_is_rejected(
        self,
        client,
        couple,
        session,
    ) -> None:  # type: ignore[no-untyped-def]
        for index in range(3):
            create_heart_moment(client, couple, text=f"Moment {index}")
        page = client.get(
            f"{path(couple['space'].id)}?limit=1",
            headers=auth(couple["token_a"]),
        )
        cursor = page.json()["nextCursor"]

        second_space = make_space(session, couple["anna"])
        session.flush()

        response = client.get(
            f"{path(second_space.id)}?limit=1&cursor={cursor}",
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 400
        assert response.json()["code"] == "INVALID_CURSOR"


class TestEventsLeakNothing:
    def test_outbox_carries_visibility_but_no_content(
        self,
        client,
        couple,
        session,
    ) -> None:  # type: ignore[no-untyped-def]
        private = create_heart_moment(
            client,
            couple,
            visibility="PRIVATE",
            text=SECRET_TEXT,
        ).json()
        client.patch(
            f"{path(couple['space'].id)}/{private['id']}",
            json={"text": SECRET_TEXT + " Nachtrag."},
            headers=if_match(couple["token_a"], 1),
        )
        client.patch(
            f"{path(couple['space'].id)}/{private['id']}/visibility",
            json={"visibility": "SHARED"},
            headers=if_match(couple["token_a"], 2),
        )
        client.delete(
            f"{path(couple['space'].id)}/{private['id']}",
            headers=if_match(couple["token_a"], 3),
        )

        rows = list(
            session.execute(
                select(OutboxEvent).where(OutboxEvent.subject_type == "heart_moment")
            ).scalars()
        )
        event_types = [row.event_type for row in rows]
        assert event_types == [
            "HEART_MOMENT_CREATED",
            "HEART_MOMENT_UPDATED",
            "HEART_MOMENT_VISIBILITY_CHANGED",
            "HEART_MOMENT_DELETED",
        ]

        visibilities = [row.payload.visibility for row in rows]
        assert visibilities == ["PRIVATE", "PRIVATE", "SHARED", "SHARED"]

        for row in rows:
            raw = repr(row.payload.model_dump())
            assert SECRET_TEXT not in raw
            assert "LOVED" not in raw
            assert row.resource_version is not None

    def test_noop_visibility_transition_emits_no_event(
        self,
        client,
        couple,
        session,
    ) -> None:  # type: ignore[no-untyped-def]
        shared = create_heart_moment(client, couple).json()
        client.patch(
            f"{path(couple['space'].id)}/{shared['id']}/visibility",
            json={"visibility": "SHARED"},
            headers=if_match(couple["token_a"], 1),
        )

        event_types = [
            row.event_type
            for row in session.execute(
                select(OutboxEvent).where(OutboxEvent.subject_type == "heart_moment")
            ).scalars()
        ]
        assert event_types == ["HEART_MOMENT_CREATED"]
