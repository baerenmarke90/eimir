"""HTTP acceptance coverage for the M3-S5 Chapter contract."""

from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID

import pytest
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.places import service as place_service
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


def path(space_id: object) -> str:
    return f"/api/v1/spaces/{space_id}/chapters"


def if_match(token: str, version: int) -> dict[str, str]:
    return {**auth(token), "If-Match": f'"{version}"'}


def body(
    *,
    title: str = "Our first year",
    description: str | None = "The beginning.",
    start_on: date | None = None,
    end_on: date | None = None,
    place_id: UUID | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"title": title}
    if description is not None:
        payload["description"] = description
    if start_on is not None:
        payload["startOn"] = start_on.isoformat()
    if end_on is not None:
        payload["endOn"] = end_on.isoformat()
    if place_id is not None:
        payload["placeId"] = str(place_id)
    return payload


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    foreign = make_account(session, "Foreign")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    foreign_space = make_space(session, foreign)
    relationship_service.add_member(session, foreign_space.id, ben)
    session.flush()
    return {
        "anna": anna,
        "ben": ben,
        "foreign": foreign,
        "space": space,
        "foreign_space": foreign_space,
        "token_a": sign_in(session, anna),
        "token_b": sign_in(session, ben),
        "foreign_token": sign_in(session, foreign),
    }


def create_chapter(client, couple, **overrides):  # type: ignore[no-untyped-def]
    return client.post(
        path(couple["space"].id),
        json=body(**overrides),
        headers=auth(couple["token_a"]),
    )


class TestChapterCrud:
    def test_create_read_update_delete(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        created = create_chapter(
            client,
            couple,
            start_on=date(2026, 1, 1),
            end_on=date(2026, 12, 31),
        )
        assert created.status_code == 201
        chapter = created.json()
        assert UUID(chapter["id"]).version == 7
        assert chapter["title"] == "Our first year"
        assert chapter["description"] == "The beginning."
        assert chapter["startOn"] == "2026-01-01"
        assert chapter["endOn"] == "2026-12-31"
        assert chapter["placeId"] is None
        assert chapter["createdBy"] == str(couple["anna"].id)
        assert chapter["capabilities"] == {
            "canEdit": True,
            "canDelete": True,
            "canComment": False,
        }
        assert created.headers["ETag"] == '"1"'

        read = client.get(
            f"{path(couple['space'].id)}/{chapter['id']}",
            headers=auth(couple["token_b"]),
        )
        assert read.status_code == 200
        assert read.headers["ETag"] == '"1"'

        updated = client.patch(
            f"{path(couple['space'].id)}/{chapter['id']}",
            json={"title": "  Our next chapter  ", "endOn": None},
            headers=if_match(couple["token_b"], 1),
        )
        assert updated.status_code == 200
        assert updated.json()["title"] == "Our next chapter"
        assert updated.json()["startOn"] == "2026-01-01"
        assert updated.json()["endOn"] is None
        assert updated.json()["createdBy"] == str(couple["anna"].id)
        assert updated.headers["ETag"] == '"2"'

        deleted = client.delete(
            f"{path(couple['space'].id)}/{chapter['id']}",
            headers=if_match(couple["token_a"], 2),
        )
        assert deleted.status_code == 204
        afterwards = client.get(
            f"{path(couple['space'].id)}/{chapter['id']}",
            headers=auth(couple["token_a"]),
        )
        assert afterwards.status_code == 404
        assert afterwards.json()["code"] == "CHAPTER_NOT_FOUND"

    @pytest.mark.parametrize(
        ("start_on", "end_on"),
        [
            (None, None),
            (date(2026, 1, 1), None),
            (None, date(2026, 12, 31)),
            (date(2026, 1, 1), date(2026, 12, 31)),
        ],
    )
    def test_all_decided_date_shapes_are_accepted(
        self,
        client,
        couple,
        start_on,
        end_on,
    ) -> None:  # type: ignore[no-untyped-def]
        response = create_chapter(client, couple, start_on=start_on, end_on=end_on)
        assert response.status_code == 201
        assert response.json()["startOn"] == (start_on.isoformat() if start_on else None)
        assert response.json()["endOn"] == (end_on.isoformat() if end_on else None)

    def test_invalid_date_range_has_stable_domain_code(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        response = create_chapter(
            client,
            couple,
            start_on=date(2026, 5, 2),
            end_on=date(2026, 5, 1),
        )
        assert response.status_code == 422
        assert response.json()["code"] == "CHAPTER_DATE_RANGE_INVALID"

    def test_stale_version_is_rejected(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        chapter = create_chapter(client, couple).json()
        first = client.patch(
            f"{path(couple['space'].id)}/{chapter['id']}",
            json={"description": "First change"},
            headers=if_match(couple["token_a"], 1),
        )
        assert first.status_code == 200
        stale = client.patch(
            f"{path(couple['space'].id)}/{chapter['id']}",
            json={"description": "Stale change"},
            headers=if_match(couple["token_b"], 1),
        )
        assert stale.status_code == 409
        assert stale.json()["code"] == "RESOURCE_VERSION_CONFLICT"

    def test_list_is_newest_first_and_cursor_is_space_bound(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        first = create_chapter(client, couple, title="First").json()
        second = create_chapter(client, couple, title="Second").json()
        page = client.get(
            f"{path(couple['space'].id)}?limit=1",
            headers=auth(couple["token_a"]),
        ).json()
        assert [item["id"] for item in page["items"]] == [second["id"]]
        assert page["hasMore"] is True
        assert page["nextCursor"] is not None

        foreign = client.get(
            f"{path(couple['foreign_space'].id)}?limit=1&cursor={page['nextCursor']}",
            headers=auth(couple["token_b"]),
        )
        assert foreign.status_code == 400
        assert foreign.json()["code"] == "INVALID_CURSOR"
        assert first["id"] != second["id"]

    def test_cross_space_read_is_privacy_safe(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        chapter = create_chapter(client, couple).json()
        response = client.get(
            f"{path(couple['space'].id)}/{chapter['id']}",
            headers=auth(couple["foreign_token"]),
        )
        assert response.status_code == 404


class TestChapterPlaceReference:
    def test_same_space_place_can_be_set_and_cleared(
        self,
        client,
        session,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        place = place_service.create_place(
            session,
            AuthorizationContext(couple["anna"].id, couple["space"].id),
            name="Our place",
            description=None,
            address=None,
            latitude=None,
            longitude=None,
        )
        chapter = create_chapter(client, couple, place_id=place.id)
        assert chapter.status_code == 201
        assert chapter.json()["placeId"] == str(place.id)

        cleared = client.patch(
            f"{path(couple['space'].id)}/{chapter.json()['id']}",
            json={"placeId": None},
            headers=if_match(couple["token_b"], 1),
        )
        assert cleared.status_code == 200
        assert cleared.json()["placeId"] is None

    def test_foreign_place_fails_closed(self, client, session, couple) -> None:  # type: ignore[no-untyped-def]
        foreign_context = AuthorizationContext(
            couple["foreign"].id,
            couple["foreign_space"].id,
        )
        foreign_place = place_service.create_place(
            session,
            foreign_context,
            name="Foreign place",
            description=None,
            address=None,
            latitude=None,
            longitude=None,
        )
        response = create_chapter(client, couple, place_id=foreign_place.id)
        assert response.status_code == 404
        assert response.json()["code"] == "PLACE_NOT_FOUND"
