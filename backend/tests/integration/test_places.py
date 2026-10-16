"""PostgreSQL/HTTP acceptance tests for the M3-S3 place slice.

The focus is on three guarantees from M3-D06 through M3-D08.

Coordinates form a pair, stay within their bounds, and persist at six decimal
places. There is no deduplication: two places with the same name remain two
places. Deleting a place removes exactly that place; plans referencing it lose
the association and continue to exist.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from eimir.outbox.models import OutboxEvent
from eimir.places.models import Place
from eimir.plans.models import Plan
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

# Intentionally real values in test data. Several tests ensure these values do
# not appear on surfaces where they do not belong.
BERLIN_LAT = 52.520008
BERLIN_LON = 13.404954
SECRET_ADDRESS = "Eine Adresse, die nicht in Ereignisse gehoert."


def path(space_id: object) -> str:
    return f"/api/v1/spaces/{space_id}/places"


def body(
    *,
    name: str = "Unser Cafe",
    description: str | None = "Ecktisch am Fenster.",
    address: str | None = "Beispielstrasse 1",
    latitude: float | None = BERLIN_LAT,
    longitude: float | None = BERLIN_LON,
) -> dict[str, Any]:
    """Build a create request body.

    `description` and `address` are omitted instead of being set to `null`.
    During create, the contract rejects explicit `null` for these fields, as it
    does for Memory and Milestone. Coordinates are deliberately different: they
    may explicitly be `null` because clients commonly handle them as a pair.
    """
    payload: dict[str, Any] = {"name": name, "latitude": latitude, "longitude": longitude}
    if description is not None:
        payload["description"] = description
    if address is not None:
        payload["address"] = address
    return payload


def if_match(token: str, version: int) -> dict[str, str]:
    return {**auth(token), "If-Match": f'"{version}"'}


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    foreign = make_account(session, "Fremd")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    foreign_space = make_space(session, foreign)
    relationship_service.add_member(session, foreign_space.id, ben)
    session.flush()
    return {
        "anna": anna,
        "ben": ben,
        "space": space,
        "foreign_space": foreign_space,
        "token_a": sign_in(session, anna),
        "token_b": sign_in(session, ben),
        "foreign_token": sign_in(session, foreign),
    }


def create_place(  # type: ignore[no-untyped-def]
    client,
    couple,
    *,
    token_key: str = "token_a",
    **overrides,
):
    return client.post(
        path(couple["space"].id), json=body(**overrides), headers=auth(couple[token_key])
    )


class TestCrud:
    def test_create_read_update_delete(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        created = create_place(client, couple)
        assert created.status_code == 201
        place = created.json()
        assert UUID(place["id"]).version == 7
        assert place["name"] == "Unser Cafe"
        assert place["description"] == "Ecktisch am Fenster."
        assert place["address"] == "Beispielstrasse 1"
        assert place["latitude"] == BERLIN_LAT
        assert place["longitude"] == BERLIN_LON
        assert place["createdBy"] == str(couple["anna"].id)
        assert place["capabilities"] == {
            "canEdit": True,
            "canDelete": True,
            "canComment": False,
        }
        assert "privacyClass" not in place
        assert created.headers["ETag"] == '"1"'

        updated = client.patch(
            f"{path(couple['space'].id)}/{place['id']}",
            json={"name": "  Unser Stammcafe  ", "description": None},
            headers=if_match(couple["token_a"], 1),
        )
        assert updated.status_code == 200
        assert updated.json()["name"] == "Unser Stammcafe"
        assert updated.json()["description"] is None
        # Untouched fields remain unchanged.
        assert updated.json()["latitude"] == BERLIN_LAT

        deleted = client.delete(
            f"{path(couple['space'].id)}/{place['id']}",
            headers=if_match(couple["token_a"], 2),
        )
        assert deleted.status_code == 204
        afterwards = client.get(
            f"{path(couple['space'].id)}/{place['id']}", headers=auth(couple["token_a"])
        )
        assert afterwards.status_code == 404
        assert afterwards.json()["code"] == "PLACE_NOT_FOUND"

    def test_partner_may_change_place_and_created_by_remains(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        "M3-D01 applies to Place, Wish, and Plan alike."
        place = create_place(client, couple).json()
        updated = client.patch(
            f"{path(couple['space'].id)}/{place['id']}",
            json={"name": "Von Ben umbenannt"},
            headers=if_match(couple["token_b"], 1),
        )
        assert updated.status_code == 200
        assert updated.json()["createdBy"] == str(couple["anna"].id)

    def test_empty_name_is_rejected(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        assert create_place(client, couple, name="   ").status_code == 422

    def test_stale_version_is_rejected(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        place = create_place(client, couple).json()
        client.patch(
            f"{path(couple['space'].id)}/{place['id']}",
            json={"name": "Erste Aenderung"},
            headers=if_match(couple["token_a"], 1),
        )
        second = client.patch(
            f"{path(couple['space'].id)}/{place['id']}",
            json={"name": "Zweite Aenderung"},
            headers=if_match(couple["token_a"], 1),
        )
        assert second.status_code == 409
        assert second.json()["code"] == "RESOURCE_VERSION_CONFLICT"

    def test_list_shows_newest_first(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        first = create_place(client, couple, name="Erster").json()
        second = create_place(client, couple, name="Zweiter").json()
        page = client.get(path(couple["space"].id), headers=auth(couple["token_a"])).json()
        assert [entry["id"] for entry in page["items"]] == [second["id"], first["id"]]

    def test_cursor_applies_only_in_its_space(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        create_place(client, couple, name="Erster")
        create_place(client, couple, name="Zweiter")
        page = client.get(
            f"{path(couple['space'].id)}?limit=1", headers=auth(couple["token_a"])
        ).json()
        response = client.get(
            f"{path(couple['foreign_space'].id)}?limit=1&cursor={page['nextCursor']}",
            headers=auth(couple["token_b"]),
        )
        assert response.status_code == 400
        assert response.json()["code"] == "INVALID_CURSOR"


class TestCoordinates:
    "M3-D06: both coordinates or neither, bounded and stored at six decimal places."

    def test_place_without_coordinates_is_valid(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        "Many places belonging to a couple are only a name and nothing else."
        response = create_place(
            client, couple, latitude=None, longitude=None, address=None, description=None
        )
        assert response.status_code == 201
        assert response.json()["latitude"] is None
        assert response.json()["longitude"] is None
        assert response.json()["address"] is None

    def test_explicit_null_coordinate_pair_is_allowed(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        """A client that treats coordinates as a pair sends both values.

        This does not apply to `description` and `address`: the create contract
        rejects explicit `null` for those fields, as it does for Memory and
        Milestone.
        """
        response = client.post(
            path(couple["space"].id),
            json={"name": "Nur ein Name", "latitude": None, "longitude": None},
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 201

        with_null_text = client.post(
            path(couple["space"].id),
            json={"name": "Nur ein Name", "address": None},
            headers=auth(couple["token_a"]),
        )
        assert with_null_text.status_code == 422

    def test_address_without_coordinates_is_valid(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        response = create_place(client, couple, latitude=None, longitude=None)
        assert response.status_code == 201
        assert response.json()["address"] == "Beispielstrasse 1"

    def test_coordinates_without_address_are_valid(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        response = create_place(client, couple, address=None)
        assert response.status_code == 201
        assert response.json()["latitude"] == BERLIN_LAT

    @pytest.mark.parametrize("missing", ["latitude", "longitude"])
    def test_partial_coordinate_pair_is_rejected(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
        missing: str,
    ) -> None:
        response = create_place(client, couple, **{missing: None})
        assert response.status_code == 422
        assert response.json()["code"] == "PLACE_COORDINATE_PAIR_REQUIRED"

    @pytest.mark.parametrize(
        ("latitude", "longitude", "code"),
        [
            (90.000001, 0.0, "PLACE_LATITUDE_INVALID"),
            (-90.000001, 0.0, "PLACE_LATITUDE_INVALID"),
            (0.0, 180.000001, "PLACE_LONGITUDE_INVALID"),
            (0.0, -180.000001, "PLACE_LONGITUDE_INVALID"),
        ],
    )
    def test_values_outside_bounds(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
        latitude,
        longitude,
        code,
    ) -> None:
        response = create_place(client, couple, latitude=latitude, longitude=longitude)
        assert response.status_code == 422
        assert response.json()["code"] == code

    @pytest.mark.parametrize(
        ("latitude", "longitude"),
        [(90.0, 180.0), (-90.0, -180.0), (0.0, 0.0)],
    )
    def test_boundary_values_are_valid(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
        latitude,
        longitude,
    ) -> None:
        response = create_place(client, couple, latitude=latitude, longitude=longitude)
        assert response.status_code == 201
        assert response.json()["latitude"] == latitude
        assert response.json()["longitude"] == longitude

    def test_extra_decimal_places_are_rounded_to_six(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
        session,
    ) -> None:
        """A sensor may provide greater precision; storage keeps six places.

        Rejecting extra precision would be incorrect because the client did not
        provide invalid coordinates.
        """
        response = create_place(client, couple, latitude=52.5200081234, longitude=13.4049544321)
        assert response.status_code == 201
        assert response.json()["latitude"] == 52.520008
        assert response.json()["longitude"] == 13.404954

        row = session.get(Place, UUID(response.json()["id"]))
        assert row.latitude == Decimal("52.520008")
        assert row.longitude == Decimal("13.404954")

    def test_coordinates_can_be_added_later(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        place = create_place(client, couple, latitude=None, longitude=None).json()
        response = client.patch(
            f"{path(couple['space'].id)}/{place['id']}",
            json={"latitude": BERLIN_LAT, "longitude": BERLIN_LON},
            headers=if_match(couple["token_a"], 1),
        )
        assert response.status_code == 200
        assert response.json()["latitude"] == BERLIN_LAT

    def test_coordinates_can_be_removed_again(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        place = create_place(client, couple).json()
        response = client.patch(
            f"{path(couple['space'].id)}/{place['id']}",
            json={"latitude": None, "longitude": None},
            headers=if_match(couple["token_a"], 1),
        )
        assert response.status_code == 200
        assert response.json()["latitude"] is None
        assert response.json()["longitude"] is None

    def test_patch_of_only_one_coordinate_is_rejected(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        "Otherwise PATCH would provide a path to a partial coordinate pair."
        place = create_place(client, couple).json()
        response = client.patch(
            f"{path(couple['space'].id)}/{place['id']}",
            json={"latitude": None},
            headers=if_match(couple["token_a"], 1),
        )
        assert response.status_code == 422
        assert response.json()["code"] == "PLACE_COORDINATE_PAIR_REQUIRED"

    @pytest.mark.parametrize(
        "sql",
        [
            "UPDATE places SET latitude = 10.0, longitude = NULL WHERE id = :id",
            "UPDATE places SET latitude = 91.0 WHERE id = :id",
            "UPDATE places SET longitude = 181.0 WHERE id = :id",
        ],
    )
    def test_database_keeps_invariants_without_service(
        self, client, couple, session, sql: str
    ) -> None:  # type: ignore[no-untyped-def]
        place = create_place(client, couple).json()
        with pytest.raises(IntegrityError), session.begin_nested():
            session.execute(text(sql), {"id": place["id"]})


class TestNoDeduplication:
    "M3-D07: two identical places are still two places."

    def test_same_name_and_coordinates_create_two_places(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        first = create_place(client, couple).json()
        second = create_place(client, couple).json()
        assert first["id"] != second["id"]

        page = client.get(path(couple["space"].id), headers=auth(couple["token_a"])).json()
        assert len(page["items"]) == 2


class TestPlanAssociation:
    "M3-D08/D31: `Plan.placeId` is the only source of truth for Plan/Place association."

    def _plan(self, client, couple, **fields):  # type: ignore[no-untyped-def]
        return client.post(
            f"/api/v1/spaces/{couple['space'].id}/plans",
            json={"title": "Abendessen", **fields},
            headers=auth(couple["token_a"]),
        )

    def test_plan_can_be_created_with_place(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        place = create_place(client, couple).json()
        plan = self._plan(client, couple, placeId=place["id"])
        assert plan.status_code == 201
        assert plan.json()["placeId"] == place["id"]

    def test_place_can_be_set_later_and_cleared(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        place = create_place(client, couple).json()
        plan = self._plan(client, couple).json()
        assert plan["placeId"] is None

        assigned = client.patch(
            f"/api/v1/spaces/{couple['space'].id}/plans/{plan['id']}",
            json={"placeId": place["id"]},
            headers=if_match(couple["token_a"], 1),
        )
        assert assigned.status_code == 200
        assert assigned.json()["placeId"] == place["id"]

        cleared = client.patch(
            f"/api/v1/spaces/{couple['space'].id}/plans/{plan['id']}",
            json={"placeId": None},
            headers=if_match(couple["token_a"], 2),
        )
        assert cleared.status_code == 200
        assert cleared.json()["placeId"] is None

    def test_place_from_foreign_space_remains_invisible(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
        session,
    ) -> None:
        foreign_place = client.post(
            path(couple["foreign_space"].id), json=body(), headers=auth(couple["token_b"])
        ).json()

        response = self._plan(client, couple, placeId=foreign_place["id"])
        assert response.status_code == 404
        assert response.json()["code"] == "PLACE_NOT_FOUND"
        assert list(session.execute(select(Plan)).scalars()) == []

    def test_unknown_and_foreign_ids_look_the_same(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        foreign_place = client.post(
            path(couple["foreign_space"].id), json=body(), headers=auth(couple["token_b"])
        ).json()
        unknown = self._plan(client, couple, placeId=str(uuid4()))
        foreign = self._plan(client, couple, placeId=foreign_place["id"])
        assert unknown.status_code == foreign.status_code == 404
        assert unknown.json() == foreign.json()

    def test_conversion_may_include_place_immediately(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        place = create_place(client, couple).json()
        wish = client.post(
            f"/api/v1/spaces/{couple['space'].id}/wishes",
            json={"title": "Essen gehen"},
            headers=auth(couple["token_a"]),
        ).json()

        response = client.post(
            f"/api/v1/spaces/{couple['space'].id}/wishes/{wish['id']}/plan",
            json={"placeId": place["id"]},
            headers=if_match(couple["token_a"], 1),
        )
        assert response.status_code == 201
        assert response.json()["plan"]["placeId"] == place["id"]


class TestDelete:
    "M3-D06, section 9: the place is removed while original resources remain."

    def test_plan_survives_its_place_and_gets_new_version(self, client, couple, session) -> None:  # type: ignore[no-untyped-def]
        place = create_place(client, couple).json()
        plan = client.post(
            f"/api/v1/spaces/{couple['space'].id}/plans",
            json={"title": "Abendessen", "placeId": place["id"]},
            headers=auth(couple["token_a"]),
        ).json()
        assert plan["version"] == 1

        removed = client.delete(
            f"{path(couple['space'].id)}/{place['id']}",
            headers=if_match(couple["token_a"], 1),
        )
        assert removed.status_code == 204

        afterwards = client.get(
            f"/api/v1/spaces/{couple['space'].id}/plans/{plan['id']}",
            headers=auth(couple["token_a"]),
        ).json()
        assert afterwards["placeId"] is None
        assert afterwards["title"] == "Abendessen"
        # The plan changed, so its version communicates that change.
        assert afterwards["version"] == 2

    def test_client_with_stale_state_gets_conflict(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        """This is why place deletion increments the plan version.

        A silent `ON DELETE SET NULL` would change the place association without
        allowing the partner's next stale write to detect the change.
        """
        place = create_place(client, couple).json()
        plan = client.post(
            f"/api/v1/spaces/{couple['space'].id}/plans",
            json={"title": "Abendessen", "placeId": place["id"]},
            headers=auth(couple["token_a"]),
        ).json()

        client.delete(
            f"{path(couple['space'].id)}/{place['id']}",
            headers=if_match(couple["token_a"], 1),
        )

        response = client.patch(
            f"/api/v1/spaces/{couple['space'].id}/plans/{plan['id']}",
            json={"title": "Mit altem Stand"},
            headers=if_match(couple["token_b"], 1),
        )
        assert response.status_code == 409
        assert response.json()["code"] == "RESOURCE_VERSION_CONFLICT"

    def test_multiple_plans_are_all_cleared(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
        session,
    ) -> None:
        place = create_place(client, couple).json()
        for title in ("Erster", "Zweiter", "Dritter"):
            client.post(
                f"/api/v1/spaces/{couple['space'].id}/plans",
                json={"title": title, "placeId": place["id"]},
                headers=auth(couple["token_a"]),
            )

        client.delete(
            f"{path(couple['space'].id)}/{place['id']}",
            headers=if_match(couple["token_a"], 1),
        )

        session.expire_all()
        plans = list(session.execute(select(Plan)).scalars())
        assert len(plans) == 3
        assert all(plan.place_id is None for plan in plans)

    def test_plan_without_place_remains_untouched(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        place = create_place(client, couple).json()
        without_place = client.post(
            f"/api/v1/spaces/{couple['space'].id}/plans",
            json={"title": "Ohne Ort"},
            headers=auth(couple["token_a"]),
        ).json()

        client.delete(
            f"{path(couple['space'].id)}/{place['id']}",
            headers=if_match(couple["token_a"], 1),
        )

        afterwards = client.get(
            f"/api/v1/spaces/{couple['space'].id}/plans/{without_place['id']}",
            headers=auth(couple["token_a"]),
        ).json()
        assert afterwards["version"] == 1

    def test_database_allows_no_plan_to_reference_deleted_place(
        self, client, couple, session
    ) -> None:  # type: ignore[no-untyped-def]
        "The foreign key is the boundary if the service ever fails."
        place = create_place(client, couple).json()
        client.post(
            f"/api/v1/spaces/{couple['space'].id}/plans",
            json={"title": "Abendessen", "placeId": place["id"]},
            headers=auth(couple["token_a"]),
        )

        session.execute(text("DELETE FROM places WHERE id = :id"), {"id": place["id"]})
        session.flush()
        session.expire_all()

        plan = session.execute(select(Plan)).scalar_one()
        assert plan.place_id is None
        assert plan.space_id == couple["space"].id


class TestTenantIsolation:
    def test_foreign_actor_does_not_see_space(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        create_place(client, couple)
        response = client.get(path(couple["space"].id), headers=auth(couple["foreign_token"]))
        assert response.status_code == 404
        assert response.json()["code"] == "SPACE_NOT_FOUND"

    def test_id_from_other_space_remains_invisible(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        place = create_place(client, couple).json()
        read_response = client.get(
            f"{path(couple['foreign_space'].id)}/{place['id']}",
            headers=auth(couple["token_b"]),
        )
        assert read_response.status_code == 404
        assert read_response.json()["code"] == "PLACE_NOT_FOUND"

    def test_foreign_write_attempt_changes_nothing(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
        session,
    ) -> None:
        place = create_place(client, couple).json()
        response = client.patch(
            f"{path(couple['foreign_space'].id)}/{place['id']}",
            json={"name": "Uebernommen"},
            headers=if_match(couple["token_b"], 1),
        )
        assert response.status_code == 404

        session.expire_all()
        assert session.get(Place, UUID(place["id"])).payload.name == "Unser Cafe"


class TestPrivacy:
    def test_events_contain_neither_address_nor_coordinates(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
        session,
    ) -> None:
        place = create_place(client, couple, address=SECRET_ADDRESS).json()
        client.patch(
            f"{path(couple['space'].id)}/{place['id']}",
            json={"name": "Neu benannt"},
            headers=if_match(couple["token_a"], 1),
        )
        client.delete(
            f"{path(couple['space'].id)}/{place['id']}",
            headers=if_match(couple["token_a"], 2),
        )

        rows = list(
            session.execute(
                select(OutboxEvent).where(OutboxEvent.subject_type == "place")
            ).scalars()
        )
        assert [row.event_type for row in rows] == [
            "PLACE_CREATED",
            "PLACE_UPDATED",
            "PLACE_DELETED",
        ]
        for row in rows:
            raw = repr(row.payload.model_dump())
            assert SECRET_ADDRESS not in raw
            assert "52.520008" not in raw
            assert "13.404954" not in raw
            assert row.resource_version is not None

    def test_error_response_names_no_coordinate(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        response = create_place(client, couple, latitude=95.123456)
        assert response.status_code == 422
        assert "95.123456" not in response.text
