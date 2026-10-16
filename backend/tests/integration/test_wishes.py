"""PostgreSQL/HTTP acceptance tests for the M3-S1 wish slice.

Two concerns define the domain behavior of this slice.

M3-D01: a wish belongs to the couple. Unlike Memory and Milestone, the partner
may update or delete it without having created it. `createdBy` is attribution,
not an ACL. The proof is therefore not merely that Anna may act, but that Ben
may act while `createdBy` still remains Anna.

M3-D02/D04: wish status follows only the Wish-to-Plan contract. The negative
proof is that no ordinary request path can move the status. Conversion,
completion, and return transitions are covered by `test_wish_to_plan`.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from eimir.outbox.models import OutboxEvent
from eimir.relationship import service as relationship_service
from eimir.wishes.models import Wish, WishStatus
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

SECRET_WISH_TITLE = "Ein Wunsch, der nicht in Ereignisse gehoert."


def path(space_id: object) -> str:
    return f"/api/v1/spaces/{space_id}/wishes"


def body(*, title: str = "Nordlichter sehen") -> dict[str, Any]:
    return {"title": title}


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
    # Ben is intentionally a member of both spaces. This tests cursor binding
    # itself instead of failing earlier at the membership boundary.
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


def create_wish(  # type: ignore[no-untyped-def]
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
        created = create_wish(client, couple)
        assert created.status_code == 201
        wish = created.json()
        assert UUID(wish["id"]).version == 7
        assert wish["title"] == "Nordlichter sehen"
        assert wish["status"] == "OPEN"
        assert wish["createdBy"] == str(couple["anna"].id)
        assert wish["creator"]["displayName"] == "Anna"
        assert wish["capabilities"] == {
            "canEdit": True,
            "canDelete": True,
            "canComment": False,
        }
        assert "privacyClass" not in wish
        assert created.headers["ETag"] == '"1"'

        read_response = client.get(
            f"{path(couple['space'].id)}/{wish['id']}", headers=auth(couple["token_a"])
        )
        assert read_response.status_code == 200
        assert read_response.headers["ETag"] == '"1"'

        updated = client.patch(
            f"{path(couple['space'].id)}/{wish['id']}",
            json={"title": "  Nordlichter in Tromsoe sehen  "},
            headers=if_match(couple["token_a"], 1),
        )
        assert updated.status_code == 200
        assert updated.json()["title"] == "Nordlichter in Tromsoe sehen"
        assert updated.json()["version"] == 2
        assert updated.headers["ETag"] == '"2"'

        deleted = client.delete(
            f"{path(couple['space'].id)}/{wish['id']}",
            headers=if_match(couple["token_a"], 2),
        )
        assert deleted.status_code == 204
        afterwards = client.get(
            f"{path(couple['space'].id)}/{wish['id']}", headers=auth(couple["token_a"])
        )
        assert afterwards.status_code == 404
        assert afterwards.json()["code"] == "WISH_NOT_FOUND"

    def test_empty_title_is_rejected(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        assert create_wish(client, couple, title="   ").status_code == 422

    def test_list_shows_newest_first(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        first = create_wish(client, couple, title="Erster").json()
        second = create_wish(client, couple, title="Zweiter").json()

        page = client.get(path(couple["space"].id), headers=auth(couple["token_a"])).json()
        assert [entry["id"] for entry in page["items"]] == [second["id"], first["id"]]
        assert page["hasMore"] is False
        assert page["nextCursor"] is None

    def test_page_continues_via_cursor(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        first = create_wish(client, couple, title="Erster").json()
        second = create_wish(client, couple, title="Zweiter").json()

        first_page = client.get(
            f"{path(couple['space'].id)}?limit=1", headers=auth(couple["token_a"])
        ).json()
        assert [entry["id"] for entry in first_page["items"]] == [second["id"]]
        assert first_page["hasMore"] is True

        second_page = client.get(
            f"{path(couple['space'].id)}?limit=1&cursor={first_page['nextCursor']}",
            headers=auth(couple["token_a"]),
        ).json()
        assert [entry["id"] for entry in second_page["items"]] == [first["id"]]
        assert second_page["hasMore"] is False

    def test_status_filter_matches_only_existing_states(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        create_wish(client, couple)

        open_response = client.get(
            f"{path(couple['space'].id)}?status=OPEN", headers=auth(couple["token_a"])
        ).json()
        assert len(open_response["items"]) == 1

        # Without conversion there is no planned wish.
        planned = client.get(
            f"{path(couple['space'].id)}?status=PLANNED", headers=auth(couple["token_a"])
        ).json()
        assert planned["items"] == []

    def test_unknown_status_is_error_not_filter(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        "Otherwise a typo would silently produce an unfiltered list."
        response = client.get(
            f"{path(couple['space'].id)}?status=ERFUNDEN", headers=auth(couple["token_a"])
        )
        assert response.status_code == 422


class TestSharedWriting:
    "M3-D01: both partners may write, not only the creator."

    def test_partner_may_change_wish_and_created_by_remains(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        wish = create_wish(client, couple).json()

        updated = client.patch(
            f"{path(couple['space'].id)}/{wish['id']}",
            json={"title": "Nordlichter im Winter sehen"},
            headers=if_match(couple["token_b"], 1),
        )
        assert updated.status_code == 200
        # Attribution, not ACL: Ben wrote the change while Anna remains creator.
        assert updated.json()["createdBy"] == str(couple["anna"].id)
        assert updated.json()["creator"]["displayName"] == "Anna"

    def test_partner_may_delete(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        wish = create_wish(client, couple).json()
        response = client.delete(
            f"{path(couple['space'].id)}/{wish['id']}",
            headers=if_match(couple["token_b"], 1),
        )
        assert response.status_code == 204

    def test_partner_sees_same_capabilities(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        "A `canEdit: false` would incorrectly describe the domain rule to the UI."
        wish = create_wish(client, couple).json()
        read_response = client.get(
            f"{path(couple['space'].id)}/{wish['id']}", headers=auth(couple["token_b"])
        ).json()
        assert read_response["capabilities"] == {
            "canEdit": True,
            "canDelete": True,
            "canComment": False,
        }

    def test_memory_remains_author_only(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        """Countercheck the new write rule.

        Collaborative writing is a property of the M3 planning domains, not a
        new default. Memory author-only behavior must remain unchanged.
        """
        memory = client.post(
            f"/api/v1/spaces/{couple['space'].id}/memories",
            json={"title": "Nur von Anna", "body": "Text", "happenedOn": "2025-06-13"},
            headers=auth(couple["token_a"]),
        ).json()

        response = client.patch(
            f"/api/v1/spaces/{couple['space'].id}/memories/{memory['id']}",
            json={"title": "Von Ben geaendert"},
            headers=if_match(couple["token_b"], 1),
        )
        assert response.status_code == 403


class TestStatus:
    "M3-D02/D04: no path bypasses the Wish-to-Plan contract."

    def test_new_wish_is_open(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
        session,
    ) -> None:
        wish = create_wish(client, couple).json()
        row = session.get(Wish, UUID(wish["id"]))
        assert row.status == WishStatus.OPEN.value

    def test_create_cannot_supply_status(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        response = client.post(
            path(couple["space"].id),
            json={"title": "Direkt geplant", "status": "PLANNED"},
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 422

    def test_patch_cannot_set_status(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
        session,
    ) -> None:
        wish = create_wish(client, couple).json()

        response = client.patch(
            f"{path(couple['space'].id)}/{wish['id']}",
            json={"status": "COMPLETED"},
            headers=if_match(couple["token_a"], 1),
        )
        assert response.status_code == 422

        session.expire_all()
        assert session.get(Wish, UUID(wish["id"])).status == WishStatus.OPEN.value

    def test_title_plus_status_still_fails(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
        session,
    ) -> None:
        "A valid field must not carry a forbidden field through validation."
        wish = create_wish(client, couple).json()

        response = client.patch(
            f"{path(couple['space'].id)}/{wish['id']}",
            json={"title": "Neuer Titel", "status": "COMPLETED"},
            headers=if_match(couple["token_a"], 1),
        )
        assert response.status_code == 422

        session.expire_all()
        row = session.get(Wish, UUID(wish["id"]))
        assert row.status == WishStatus.OPEN.value
        assert row.payload.title == "Nordlichter sehen"

    def test_title_correction_leaves_status_unchanged(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        wish = create_wish(client, couple).json()
        updated = client.patch(
            f"{path(couple['space'].id)}/{wish['id']}",
            json={"title": "Andere Formulierung"},
            headers=if_match(couple["token_a"], 1),
        )
        assert updated.json()["status"] == "OPEN"

    def test_database_rejects_invented_status(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
        session,
    ) -> None:
        """The final boundary is enforced by the schema, not only the service.

        Raw SQL deliberately bypasses ORM enum validation so this test exercises
        the PostgreSQL CHECK that also protects maintenance scripts and future
        migrations.
        """
        wish = create_wish(client, couple).json()
        # The savepoint contains the expected CHECK failure so the surrounding
        # test transaction remains usable.
        with pytest.raises(IntegrityError), session.begin_nested():
            session.execute(
                text("UPDATE wishes SET status = 'ERFUNDEN' WHERE id = :id"),
                {"id": wish["id"]},
            )


class TestDeleteMatrix:
    """The M3-D05 wish rows, exercised with real plans.

    The three reachable states arise through regular paths: conversion creates
    `PLANNED` and plan completion creates `COMPLETED`. Only contradictory states
    are constructed directly because the contract says they must never arise,
    while their defensive response behavior is still specified.

    Full conversion and completion paths are covered in `test_wish_to_plan`;
    this matrix focuses only on what `DELETE Wish` does in each state.
    """

    def _convert(self, client, couple, wish_id: str, version: int = 1) -> dict[str, Any]:
        response = client.post(
            f"{path(couple['space'].id)}/{wish_id}/plan",
            json={},
            headers=if_match(couple["token_a"], version),
        )
        assert response.status_code == 201
        return response.json()["plan"]

    def _complete(self, client, couple, plan_id: str, version: int = 1) -> None:
        response = client.post(
            f"/api/v1/spaces/{couple['space'].id}/plans/{plan_id}/complete",
            json={"experiencedOn": "2026-08-20"},
            headers=if_match(couple["token_a"], version),
        )
        assert response.status_code == 200

    def test_open_without_plan_may_be_deleted(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        wish = create_wish(client, couple).json()
        response = client.delete(
            f"{path(couple['space'].id)}/{wish['id']}",
            headers=if_match(couple["token_a"], 1),
        )
        assert response.status_code == 204

    def test_planned_with_plan_is_blocked(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
        session,
    ) -> None:
        wish = create_wish(client, couple).json()
        self._convert(client, couple, wish["id"])

        response = client.delete(
            f"{path(couple['space'].id)}/{wish['id']}",
            headers=if_match(couple["token_a"], 2),
        )
        assert response.status_code == 409
        assert response.json()["code"] == "WISH_HAS_ACTIVE_PLAN"

        session.expire_all()
        assert session.get(Wish, UUID(wish["id"])) is not None

    def test_completed_with_plan_is_blocked(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        wish = create_wish(client, couple).json()
        plan = self._convert(client, couple, wish["id"])
        self._complete(client, couple, plan["id"])

        response = client.delete(
            f"{path(couple['space'].id)}/{wish['id']}",
            headers=if_match(couple["token_a"], 3),
        )
        assert response.status_code == 409
        assert response.json()["code"] == "WISH_HAS_COMPLETED_PLAN"

    def test_completed_without_plan_may_be_deleted(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        """Clean up a completed lifecycle in two explicit steps.

        Delete the completed plan first, then the remaining completed wish.
        There is intentionally no cascade that performs both at once.
        """
        wish = create_wish(client, couple).json()
        plan = self._convert(client, couple, wish["id"])
        self._complete(client, couple, plan["id"])

        removed = client.delete(
            f"/api/v1/spaces/{couple['space'].id}/plans/{plan['id']}",
            headers=if_match(couple["token_a"], 2),
        )
        assert removed.status_code == 204

        # The wish survives the plan and remains completed.
        remaining = client.get(
            f"{path(couple['space'].id)}/{wish['id']}", headers=auth(couple["token_a"])
        ).json()
        assert remaining["status"] == "COMPLETED"

        response = client.delete(
            f"{path(couple['space'].id)}/{wish['id']}",
            headers=if_match(couple["token_a"], 3),
        )
        assert response.status_code == 204

    def test_planned_without_plan_is_conflict(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
        session,
    ) -> None:
        "A state that must not exist still must not produce a 500 response."
        wish = create_wish(client, couple).json()
        row = session.get(Wish, UUID(wish["id"]))
        row.status = WishStatus.PLANNED.value
        session.flush()

        response = client.delete(
            f"{path(couple['space'].id)}/{wish['id']}",
            headers=if_match(couple["token_a"], row.version),
        )
        assert response.status_code == 409
        assert response.json()["code"] == "WISH_PLAN_STATE_CONFLICT"

    def test_open_with_plan_is_conflict(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
        session,
    ) -> None:
        wish = create_wish(client, couple).json()
        self._convert(client, couple, wish["id"])

        row = session.get(Wish, UUID(wish["id"]))
        row.status = WishStatus.OPEN.value
        session.flush()

        response = client.delete(
            f"{path(couple['space'].id)}/{wish['id']}",
            headers=if_match(couple["token_a"], row.version),
        )
        assert response.status_code == 409
        assert response.json()["code"] == "WISH_PLAN_STATE_CONFLICT"

    def test_planned_state_is_reflected_in_capabilities(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        wish = create_wish(client, couple).json()
        self._convert(client, couple, wish["id"])

        read_response = client.get(
            f"{path(couple['space'].id)}/{wish['id']}", headers=auth(couple["token_a"])
        ).json()
        assert read_response["status"] == "PLANNED"
        assert read_response["capabilities"]["canDelete"] is False
        # The title remains editable because it is a content update, not a
        # status mutation (M3-D02).
        assert read_response["capabilities"]["canEdit"] is True

    def test_version_check_runs_before_status_check(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        "A stale version must not reveal domain state."
        wish = create_wish(client, couple).json()
        self._convert(client, couple, wish["id"])

        response = client.delete(
            f"{path(couple['space'].id)}/{wish['id']}",
            headers=if_match(couple["token_a"], 99),
        )
        assert response.status_code == 409
        assert response.json()["code"] == "RESOURCE_VERSION_CONFLICT"

    def test_database_keeps_wish_under_its_plan(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
        session,
    ) -> None:
        """The final boundary is enforced by the foreign key, not only the service.

        The service rejects this case with 409 first. If service protection is
        ever bypassed by a maintenance script or migration, the composite
        foreign key still prevents a plan from surviving without its wish.
        """
        wish = create_wish(client, couple).json()
        self._convert(client, couple, wish["id"])

        with pytest.raises(IntegrityError), session.begin_nested():
            session.execute(text("DELETE FROM wishes WHERE id = :id"), {"id": wish["id"]})


class TestConcurrency:
    def test_stale_version_is_rejected(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        wish = create_wish(client, couple).json()
        client.patch(
            f"{path(couple['space'].id)}/{wish['id']}",
            json={"title": "Erste Aenderung"},
            headers=if_match(couple["token_a"], 1),
        )

        second = client.patch(
            f"{path(couple['space'].id)}/{wish['id']}",
            json={"title": "Zweite Aenderung"},
            headers=if_match(couple["token_a"], 1),
        )
        assert second.status_code == 409
        assert second.json()["code"] == "RESOURCE_VERSION_CONFLICT"

    def test_both_partners_share_same_version(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        "Shared writes do not create separate version histories."
        wish = create_wish(client, couple).json()
        client.patch(
            f"{path(couple['space'].id)}/{wish['id']}",
            json={"title": "Von Anna"},
            headers=if_match(couple["token_a"], 1),
        )

        bens_attempt = client.patch(
            f"{path(couple['space'].id)}/{wish['id']}",
            json={"title": "Von Ben"},
            headers=if_match(couple["token_b"], 1),
        )
        assert bens_attempt.status_code == 409

    def test_delete_without_if_match_is_not_executed(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        wish = create_wish(client, couple).json()
        response = client.delete(
            f"{path(couple['space'].id)}/{wish['id']}", headers=auth(couple["token_a"])
        )
        assert response.status_code == 422
        assert (
            client.get(
                f"{path(couple['space'].id)}/{wish['id']}", headers=auth(couple["token_a"])
            ).status_code
            == 200
        )


class TestTenantIsolation:
    def test_foreign_actor_does_not_see_space(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        create_wish(client, couple)
        response = client.get(path(couple["space"].id), headers=auth(couple["foreign_token"]))
        assert response.status_code == 404
        assert response.json()["code"] == "SPACE_NOT_FOUND"

    def test_id_from_other_space_remains_invisible(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        "Ben is in both spaces; the ID boundary, not membership, separates them."
        wish = create_wish(client, couple).json()

        read_response = client.get(
            f"{path(couple['foreign_space'].id)}/{wish['id']}",
            headers=auth(couple["token_b"]),
        )
        assert read_response.status_code == 404
        assert read_response.json()["code"] == "WISH_NOT_FOUND"

    def test_foreign_write_attempt_changes_nothing(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
        session,
    ) -> None:
        wish = create_wish(client, couple).json()

        response = client.patch(
            f"{path(couple['foreign_space'].id)}/{wish['id']}",
            json={"title": "Uebernommen"},
            headers=if_match(couple["token_b"], 1),
        )
        assert response.status_code == 404

        session.expire_all()
        assert session.get(Wish, UUID(wish["id"])).payload.title == "Nordlichter sehen"

    def test_list_of_other_space_remains_empty(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        create_wish(client, couple)
        page = client.get(path(couple["foreign_space"].id), headers=auth(couple["token_b"])).json()
        assert page["items"] == []

    def test_cursor_applies_only_in_its_space(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        create_wish(client, couple, title="Erster")
        create_wish(client, couple, title="Zweiter")
        page = client.get(
            f"{path(couple['space'].id)}?limit=1", headers=auth(couple["token_a"])
        ).json()

        response = client.get(
            f"{path(couple['foreign_space'].id)}?limit=1&cursor={page['nextCursor']}",
            headers=auth(couple["token_b"]),
        )
        assert response.status_code == 400
        assert response.json()["code"] == "INVALID_CURSOR"

    def test_cursor_applies_only_for_its_filter(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        create_wish(client, couple, title="Erster")
        create_wish(client, couple, title="Zweiter")
        page = client.get(
            f"{path(couple['space'].id)}?limit=1&status=OPEN", headers=auth(couple["token_a"])
        ).json()

        response = client.get(
            f"{path(couple['space'].id)}?limit=1&cursor={page['nextCursor']}",
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 400

    def test_invented_and_malformed_ids_look_the_same(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
    ) -> None:
        unknown = client.get(
            f"{path(couple['space'].id)}/{uuid4()}", headers=auth(couple["token_a"])
        )
        malformed = client.get(
            f"{path(couple['space'].id)}/nicht-echt", headers=auth(couple["token_a"])
        )
        assert unknown.status_code == malformed.status_code == 404
        assert unknown.json() == malformed.json()


class TestEvents:
    def test_events_contain_no_wish_title(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
        session,
    ) -> None:
        wish = create_wish(client, couple, title=SECRET_WISH_TITLE).json()
        client.patch(
            f"{path(couple['space'].id)}/{wish['id']}",
            json={"title": "Neu formuliert"},
            headers=if_match(couple["token_a"], 1),
        )
        client.delete(
            f"{path(couple['space'].id)}/{wish['id']}",
            headers=if_match(couple["token_a"], 2),
        )

        rows = list(
            session.execute(select(OutboxEvent).where(OutboxEvent.subject_type == "wish")).scalars()
        )
        assert [row.event_type for row in rows] == [
            "WISH_CREATED",
            "WISH_UPDATED",
            "WISH_DELETED",
        ]
        for row in rows:
            raw = repr(row.payload.model_dump())
            assert SECRET_WISH_TITLE not in raw
            assert "Neu formuliert" not in raw
            assert row.resource_version is not None

    def test_event_names_actor_not_creator(self, client, couple, session) -> None:  # type: ignore[no-untyped-def]
        "Audit the actor who changed the wish, not the account to which it is attributed."
        wish = create_wish(client, couple).json()
        client.patch(
            f"{path(couple['space'].id)}/{wish['id']}",
            json={"title": "Von Ben"},
            headers=if_match(couple["token_b"], 1),
        )

        change = session.execute(
            select(OutboxEvent).where(OutboxEvent.event_type == "WISH_UPDATED")
        ).scalar_one()
        assert change.actor_id == couple["ben"].id

    def test_rejected_write_attempt_creates_no_event(self, client, couple, session) -> None:  # type: ignore[no-untyped-def]
        wish = create_wish(client, couple).json()
        client.patch(
            f"{path(couple['space'].id)}/{wish['id']}",
            json={"title": "Kollision"},
            headers=if_match(couple["token_a"], 99),
        )

        rows = list(
            session.execute(select(OutboxEvent).where(OutboxEvent.subject_type == "wish")).scalars()
        )
        assert [row.event_type for row in rows] == ["WISH_CREATED"]
