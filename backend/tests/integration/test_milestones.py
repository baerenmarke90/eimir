"""PostgreSQL and HTTP acceptance for the M2 Milestone slice.

The focus is M2-D25: shared readability does not grant write permission.
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

SECRET = "Ein Text, der nicht in Ereignisse gehoert."


def path(space_id: object) -> str:
    return f"/api/v1/spaces/{space_id}/milestones"


def body(
    *,
    title: str = "Zusammengezogen",
    body_text: str | None = "Erste gemeinsame Wohnung.",
    happened_on: str = "2025-06-13",
) -> dict[str, Any]:
    return {"title": title, "body": body_text, "happenedOn": happened_on}


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
    # Ben deliberately belongs to both Spaces so TEN-05 can exercise cursor
    # binding itself rather than fail earlier at the membership boundary.
    relationship_service.add_member(session, outsider_space.id, ben)
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


def create_milestone(
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


class TestCrud:
    def test_author_can_create_read_update_delete(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        created = create_milestone(client, couple)
        assert created.status_code == 201
        milestone = created.json()
        assert UUID(milestone["id"]).version == 7
        assert milestone["title"] == "Zusammengezogen"
        assert milestone["body"] == "Erste gemeinsame Wohnung."
        assert milestone["happenedOn"] == "2025-06-13"
        assert milestone["authorId"] == str(couple["anna"].id)
        assert milestone["capabilities"] == {
            "canEdit": True,
            "canDelete": True,
            "canComment": True,
        }
        assert "privacyClass" not in milestone
        assert created.headers["ETag"] == '"1"'

        updated = client.patch(
            f"{path(couple['space'].id)}/{milestone['id']}",
            json={"title": "  In die erste Wohnung gezogen  ", "body": None},
            headers=if_match(couple["token_a"], 1),
        )
        assert updated.status_code == 200
        assert updated.json()["title"] == "In die erste Wohnung gezogen"
        assert updated.json()["body"] is None
        assert updated.json()["version"] == 2

        deleted = client.delete(
            f"{path(couple['space'].id)}/{milestone['id']}",
            headers=if_match(couple["token_a"], 2),
        )
        assert deleted.status_code == 204

    def test_body_is_optional(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        created = client.post(
            path(couple["space"].id),
            json={"title": "Verlobt", "happenedOn": "2024-12-24"},
            headers=auth(couple["token_a"]),
        )
        assert created.status_code == 201
        assert created.json()["body"] is None

    def test_null_body_on_create_is_rejected(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        response = client.post(
            path(couple["space"].id),
            json={"title": "Verlobt", "body": None, "happenedOn": "2024-12-24"},
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 422

    def test_happened_on_is_required(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        response = client.post(
            path(couple["space"].id),
            json={"title": "Ohne Datum"},
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 422

    def test_blank_title_is_rejected(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        assert create_milestone(client, couple, title="   ").status_code == 422

    def test_patch_cannot_clear_happened_on(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        milestone = create_milestone(client, couple).json()
        response = client.patch(
            f"{path(couple['space'].id)}/{milestone['id']}",
            json={"happenedOn": None},
            headers=if_match(couple["token_a"], 1),
        )
        assert response.status_code == 422


class TestAuthorRule:
    def test_partner_reads_but_does_not_write(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        """M2-D25: shared readability does not grant write permission."""
        milestone = create_milestone(client, couple).json()

        read = client.get(
            f"{path(couple['space'].id)}/{milestone['id']}",
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
                f"{path(couple['space'].id)}/{milestone['id']}",
                json={"title": "Von Ben geaendert."},
                headers=if_match(couple["token_b"], 1),
            ),
            client.delete(
                f"{path(couple['space'].id)}/{milestone['id']}",
                headers=if_match(couple["token_b"], 1),
            ),
        ):
            assert response.status_code == 403

    def test_partner_sees_other_authors_milestones_in_list(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        from_anna = create_milestone(client, couple, title="Von Anna").json()
        from_ben = create_milestone(
            client,
            couple,
            token_key="token_b",
            title="Von Ben",
        ).json()

        listing = client.get(path(couple["space"].id), headers=auth(couple["token_b"]))
        assert {item["id"] for item in listing.json()["items"]} == {
            from_anna["id"],
            from_ben["id"],
        }

    def test_author_id_is_not_client_settable(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        response = client.post(
            path(couple["space"].id),
            json={**body(), "authorId": str(couple["ben"].id)},
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 422


class TestIsolation:
    def test_anonymous_and_outsider_reach_nothing(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        milestone = create_milestone(client, couple).json()
        assert client.get(f"{path(couple['space'].id)}/{milestone['id']}").status_code == 401
        assert (
            client.get(
                f"{path(couple['space'].id)}/{milestone['id']}",
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


class TestConcurrency:
    def test_stale_update_and_delete_return_409(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        milestone = create_milestone(client, couple).json()
        client.patch(
            f"{path(couple['space'].id)}/{milestone['id']}",
            json={"title": "Erste Aenderung"},
            headers=if_match(couple["token_a"], 1),
        )
        for response in (
            client.patch(
                f"{path(couple['space'].id)}/{milestone['id']}",
                json={"title": "Zweite Aenderung"},
                headers=if_match(couple["token_a"], 1),
            ),
            client.delete(
                f"{path(couple['space'].id)}/{milestone['id']}",
                headers=if_match(couple["token_a"], 1),
            ),
        ):
            assert response.status_code == 409
            assert response.json()["code"] == "RESOURCE_VERSION_CONFLICT"


class TestPaginationAndFilter:
    def test_cursor_pages_completely(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        expected = [
            create_milestone(client, couple, title=f"M {index}").json()["id"] for index in range(5)
        ]

        seen: list[str] = []
        query = "?limit=2"
        while True:
            page = client.get(
                f"{path(couple['space'].id)}{query}",
                headers=auth(couple["token_a"]),
            )
            seen.extend(item["id"] for item in page.json()["items"])
            cursor = page.json()["nextCursor"]
            if cursor is None:
                break
            query = f"?limit=2&cursor={cursor}"

        assert seen == list(reversed(expected))
        assert len(set(seen)) == len(seen)

    def test_year_filter_uses_happened_on(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        old = create_milestone(
            client,
            couple,
            title="2024",
            happened_on="2024-03-01",
        ).json()
        new = create_milestone(
            client,
            couple,
            title="2025",
            happened_on="2025-03-01",
        ).json()

        page = client.get(
            f"{path(couple['space'].id)}?year=2024",
            headers=auth(couple["token_a"]),
        )
        assert [item["id"] for item in page.json()["items"]] == [old["id"]]
        assert new["id"] not in page.text

    def test_cursor_is_bound_to_filter(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        for index in range(3):
            create_milestone(
                client,
                couple,
                title=f"M {index}",
                happened_on="2025-03-01",
            )
        page = client.get(
            f"{path(couple['space'].id)}?limit=1",
            headers=auth(couple["token_a"]),
        )
        cursor = page.json()["nextCursor"]

        response = client.get(
            f"{path(couple['space'].id)}?limit=1&year=2025&cursor={cursor}",
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 400
        assert response.json()["code"] == "INVALID_CURSOR"

    def test_cursor_is_bound_to_space(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        for index in range(2):
            create_milestone(client, couple, title=f"M {index}")
        page = client.get(
            f"{path(couple['space'].id)}?limit=1",
            headers=auth(couple["token_b"]),
        )
        cursor = page.json()["nextCursor"]
        assert cursor is not None

        response = client.get(
            f"{path(couple['outsider_space'].id)}?limit=1&cursor={cursor}",
            headers=auth(couple["token_b"]),
        )
        assert response.status_code == 400
        assert response.json()["code"] == "INVALID_CURSOR"

    def test_tampered_cursor_is_rejected(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        for index in range(3):
            create_milestone(client, couple, title=f"M {index}")
        page = client.get(
            f"{path(couple['space'].id)}?limit=1",
            headers=auth(couple["token_a"]),
        )
        cursor = page.json()["nextCursor"]
        payload, signature = cursor.split(".", 1)
        tampered = f"{payload[:-1]}{'A' if payload[-1] != 'A' else 'B'}.{signature}"

        response = client.get(
            f"{path(couple['space'].id)}?limit=1&cursor={tampered}",
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 400


class TestEvents:
    def test_events_contain_no_content(
        self,
        client,
        couple,
        session,
    ) -> None:  # type: ignore[no-untyped-def]
        milestone = create_milestone(client, couple, body_text=SECRET).json()
        client.patch(
            f"{path(couple['space'].id)}/{milestone['id']}",
            json={"title": "Neu"},
            headers=if_match(couple["token_a"], 1),
        )
        client.delete(
            f"{path(couple['space'].id)}/{milestone['id']}",
            headers=if_match(couple["token_a"], 2),
        )

        rows = list(
            session.execute(
                select(OutboxEvent).where(OutboxEvent.subject_type == "milestone")
            ).scalars()
        )
        assert [row.event_type for row in rows] == [
            "MILESTONE_CREATED",
            "MILESTONE_UPDATED",
            "MILESTONE_DELETED",
        ]
        for row in rows:
            raw = repr(row.payload.model_dump())
            assert SECRET not in raw
            assert "Zusammengezogen" not in raw
            assert row.resource_version is not None
