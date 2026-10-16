"""PostgreSQL and HTTP acceptance for the M3-S4 Relations slice.

The mandatory list from section 12 of
`docs/m3/decisions/PLACE-RELATIONS-CHAPTERS.md` is exercised for every
approved relation type.

The primary focus is the guarantee from M3-D09: no relation may ever point to
private or foreign content, and no response may reveal which of those cases
occurred. The second focus is M3-D12: unlinking a relation removes the link and
never an original resource.
"""

from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.heart_moments.models import HeartMoment
from eimir.memories.models import Memory
from eimir.milestones.models import Milestone
from eimir.relations.models import PlaceHeartMoment, PlaceMemory, PlaceMilestone
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

TODAY = date(2026, 8, 27)

# The three relation types are test parameters: slug, join model, and original
# model. Every mandatory case therefore runs against all three instead of being
# copied three times, making an omitted relation type visible.
RELATION_TYPES = [
    pytest.param("memories", PlaceMemory, Memory, id="memories"),
    pytest.param("heart-moments", PlaceHeartMoment, HeartMoment, id="heart-moments"),
    pytest.param("milestones", PlaceMilestone, Milestone, id="milestones"),
]


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


def _create(
    client,
    couple,
    route: str,
    payload: dict[str, Any],
    *,
    token_key="token_a",
    space=None,
):  # type: ignore[no-untyped-def]
    space_id = (space or couple["space"]).id
    response = client.post(
        f"/api/v1/spaces/{space_id}/{route}",
        json=payload,
        headers=auth(couple[token_key]),
    )
    assert response.status_code == 201, response.text
    return response.json()


def place(
    client,
    couple,
    *,
    token_key="token_a",
    space=None,
) -> dict[str, Any]:  # type: ignore[no-untyped-def]
    return _create(
        client,
        couple,
        "places",
        {"name": "Unser Cafe"},
        token_key=token_key,
        space=space,
    )


def target(
    client,
    couple,
    slug: str,
    *,
    token_key="token_a",
    space=None,
    visibility="SHARED",
):  # type: ignore[no-untyped-def]
    """Create a target resource of the requested type."""
    if slug == "memories":
        return _create(
            client,
            couple,
            "memories",
            {"title": "Erster Abend", "body": "Es regnete."},
            token_key=token_key,
            space=space,
        )
    if slug == "milestones":
        return _create(
            client,
            couple,
            "milestones",
            {"title": "Eingezogen", "happenedOn": TODAY.isoformat()},
            token_key=token_key,
            space=space,
        )
    return _create(
        client,
        couple,
        "heart-moments",
        {
            "text": "Danke fuer heute.",
            "emotion": "LOVED",
            "visibility": visibility,
            "happenedOn": TODAY.isoformat(),
        },
        token_key=token_key,
        space=space,
    )


def relation_path(couple, slug: str, place_id, target_id=None) -> str:  # type: ignore[no-untyped-def]
    base = f"/api/v1/spaces/{couple['space'].id}/places/{place_id}/{slug}"
    return base if target_id is None else f"{base}/{target_id}"


def count_rows(session: Session, model) -> int:  # type: ignore[no-untyped-def]
    return session.execute(select(func.count()).select_from(model)).scalar_one()


class TestHappyPath:
    @pytest.mark.parametrize(("slug", "join_model", "original"), RELATION_TYPES)
    def test_link_read_unlink(  # type: ignore[no-untyped-def]
        self,
        client,
        session,
        couple,
        slug,
        join_model,
        original,
    ) -> None:
        created_place = place(client, couple)
        created_target = target(client, couple, slug)

        linked = client.put(
            relation_path(couple, slug, created_place["id"], created_target["id"]),
            headers=auth(couple["token_a"]),
        )
        assert linked.status_code == 204

        read = client.get(
            relation_path(couple, slug, created_place["id"]),
            headers=auth(couple["token_a"]),
        )
        assert read.status_code == 200
        assert read.json()["items"] == [created_target["id"]]

        # The partner sees the same relation: a relation is shared content, not
        # a personal note (M3-D01).
        from_partner = client.get(
            relation_path(couple, slug, created_place["id"]),
            headers=auth(couple["token_b"]),
        )
        assert from_partner.json()["items"] == [created_target["id"]]

        unlinked = client.delete(
            relation_path(couple, slug, created_place["id"], created_target["id"]),
            headers=auth(couple["token_b"]),
        )
        assert unlinked.status_code == 204
        assert (
            client.get(
                relation_path(couple, slug, created_place["id"]),
                headers=auth(couple["token_a"]),
            ).json()["items"]
            == []
        )

    @pytest.mark.parametrize(("slug", "join_model", "original"), RELATION_TYPES)
    def test_duplicate_put_is_idempotent(  # type: ignore[no-untyped-def]
        self,
        client,
        session,
        couple,
        slug,
        join_model,
        original,
    ) -> None:
        """Sending the same `PUT` twice reaches the same final state (M3-D26).

        There is no conflict, no second join row, and deliberately no second
        event either: a consumer must not count how often someone tapped the
        same button.
        """
        created_place = place(client, couple)
        created_target = target(client, couple, slug)
        relation_url = relation_path(
            couple,
            slug,
            created_place["id"],
            created_target["id"],
        )

        assert client.put(relation_url, headers=auth(couple["token_a"])).status_code == 204
        assert client.put(relation_url, headers=auth(couple["token_b"])).status_code == 204

        session.expire_all()
        assert count_rows(session, join_model) == 1

    @pytest.mark.parametrize(("slug", "join_model", "original"), RELATION_TYPES)
    def test_multiple_places_may_reference_the_same_target(  # type: ignore[no-untyped-def]
        self,
        client,
        session,
        couple,
        slug,
        join_model,
        original,
    ) -> None:
        first = place(client, couple)
        second = place(client, couple)
        created_target = target(client, couple, slug)

        for created_place in (first, second):
            assert (
                client.put(
                    relation_path(
                        couple,
                        slug,
                        created_place["id"],
                        created_target["id"],
                    ),
                    headers=auth(couple["token_a"]),
                ).status_code
                == 204
            )

        session.expire_all()
        assert count_rows(session, join_model) == 2


class TestTargetRejection:
    """Four different conditions, one response (M3-D09)."""

    @pytest.mark.parametrize(("slug", "join_model", "original"), RELATION_TYPES)
    def test_unknown_target_is_404(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
        slug,
        join_model,
        original,
    ) -> None:
        created_place = place(client, couple)
        response = client.put(
            relation_path(couple, slug, created_place["id"], uuid4()),
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 404
        assert response.json()["code"] == "RELATION_TARGET_NOT_FOUND"

    @pytest.mark.parametrize(("slug", "join_model", "original"), RELATION_TYPES)
    def test_target_from_foreign_space_is_404(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
        slug,
        join_model,
        original,
    ) -> None:
        """It uses exactly the same code as an unknown target.

        A dedicated cross-Space code is deliberately excluded because it would
        confirm that the ID exists somewhere.
        """
        created_place = place(client, couple)
        foreign_target = target(
            client,
            couple,
            slug,
            token_key="token_outsider",
            space=couple["outsider_space"],
        )

        response = client.put(
            relation_path(couple, slug, created_place["id"], foreign_target["id"]),
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 404
        assert response.json()["code"] == "RELATION_TARGET_NOT_FOUND"

    @pytest.mark.parametrize(("slug", "join_model", "original"), RELATION_TYPES)
    def test_deleted_target_is_404(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
        slug,
        join_model,
        original,
    ) -> None:
        created_place = place(client, couple)
        created_target = target(client, couple, slug)
        deleted = client.delete(
            f"/api/v1/spaces/{couple['space'].id}/{slug}/{created_target['id']}",
            headers={**auth(couple["token_a"]), "If-Match": '"1"'},
        )
        assert deleted.status_code == 204

        response = client.put(
            relation_path(couple, slug, created_place["id"], created_target["id"]),
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 404
        assert response.json()["code"] == "RELATION_TARGET_NOT_FOUND"

    @pytest.mark.parametrize(("slug", "join_model", "original"), RELATION_TYPES)
    def test_unknown_place_is_404(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
        slug,
        join_model,
        original,
    ) -> None:
        created_target = target(client, couple, slug)
        response = client.put(
            relation_path(couple, slug, uuid4(), created_target["id"]),
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 404
        assert response.json()["code"] == "PLACE_NOT_FOUND"

    @pytest.mark.parametrize(("slug", "join_model", "original"), RELATION_TYPES)
    def test_outsider_cannot_link(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
        slug,
        join_model,
        original,
    ) -> None:
        created_place = place(client, couple)
        created_target = target(client, couple, slug)
        response = client.put(
            relation_path(couple, slug, created_place["id"], created_target["id"]),
            headers=auth(couple["token_outsider"]),
        )
        assert response.status_code == 404

    @pytest.mark.parametrize(("slug", "join_model", "original"), RELATION_TYPES)
    def test_unlinking_missing_relation_is_404(  # type: ignore[no-untyped-def]
        self,
        client,
        couple,
        slug,
        join_model,
        original,
    ) -> None:
        created_place = place(client, couple)
        created_target = target(client, couple, slug)
        response = client.delete(
            relation_path(couple, slug, created_place["id"], created_target["id"]),
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 404
        assert response.json()["code"] == "RELATION_NOT_FOUND"


class TestHeartMomentPrivacy:
    """Guarantees that apply specifically to HeartMoments (M3-D09)."""

    def test_private_target_is_404_even_for_owner(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        """Readable does not imply relation-compatible.

        Anna may read her own private HeartMoment. She still may not link it:
        the relation would be shared content and therefore proof to Ben that
        the HeartMoment exists.
        """
        created_place = place(client, couple)
        private = target(client, couple, "heart-moments", visibility="PRIVATE")

        readable = client.get(
            f"/api/v1/spaces/{couple['space'].id}/heart-moments/{private['id']}",
            headers=auth(couple["token_a"]),
        )
        assert readable.status_code == 200

        response = client.put(
            relation_path(couple, "heart-moments", created_place["id"], private["id"]),
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 404
        assert response.json()["code"] == "RELATION_TARGET_NOT_FOUND"

    def test_switch_to_private_removes_relations(
        self,
        client,
        session,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        created_place = place(client, couple)
        heart_moment = target(client, couple, "heart-moments")
        assert (
            client.put(
                relation_path(
                    couple,
                    "heart-moments",
                    created_place["id"],
                    heart_moment["id"],
                ),
                headers=auth(couple["token_a"]),
            ).status_code
            == 204
        )

        changed = client.patch(
            f"/api/v1/spaces/{couple['space'].id}/heart-moments/{heart_moment['id']}/visibility",
            json={"visibility": "PRIVATE"},
            headers={**auth(couple["token_a"]), "If-Match": '"1"'},
        )
        assert changed.status_code == 200

        session.expire_all()
        assert count_rows(session, PlaceHeartMoment) == 0
        # The HeartMoment itself remains; only its shared visibility is gone.
        assert session.get(HeartMoment, UUID(heart_moment["id"])) is not None

    def test_switch_back_does_not_reconstruct_relations(
        self,
        client,
        session,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        created_place = place(client, couple)
        heart_moment = target(client, couple, "heart-moments")
        client.put(
            relation_path(
                couple,
                "heart-moments",
                created_place["id"],
                heart_moment["id"],
            ),
            headers=auth(couple["token_a"]),
        )
        client.patch(
            f"/api/v1/spaces/{couple['space'].id}/heart-moments/{heart_moment['id']}/visibility",
            json={"visibility": "PRIVATE"},
            headers={**auth(couple["token_a"]), "If-Match": '"1"'},
        )
        switched_back = client.patch(
            f"/api/v1/spaces/{couple['space'].id}/heart-moments/{heart_moment['id']}/visibility",
            json={"visibility": "SHARED"},
            headers={**auth(couple["token_a"]), "If-Match": '"2"'},
        )
        assert switched_back.status_code == 200

        session.expire_all()
        assert count_rows(session, PlaceHeartMoment) == 0

    def test_database_enforces_rule_without_domain_logic(
        self,
        client,
        session,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        """The database-level barrier below the service.

        The privacy class is deliberately changed without using domain logic,
        just as a future code path unaware of M3-D09 might do. The foreign key
        propagates the new class into the join row and its CHECK fails. The
        state "private but provable through a shared relation" therefore cannot
        be represented.
        """
        from sqlalchemy import update
        from sqlalchemy.exc import IntegrityError

        created_place = place(client, couple)
        heart_moment = target(client, couple, "heart-moments")
        client.put(
            relation_path(
                couple,
                "heart-moments",
                created_place["id"],
                heart_moment["id"],
            ),
            headers=auth(couple["token_a"]),
        )
        session.expire_all()
        assert count_rows(session, PlaceHeartMoment) == 1

        with pytest.raises(IntegrityError):
            session.execute(
                update(HeartMoment)
                .where(HeartMoment.id == UUID(heart_moment["id"]))
                .values(privacy_class="OWNER_ONLY")
            )
            session.flush()
        session.rollback()


class TestNoOriginalCascade:
    """M3-D12 is source-bound: unlink relations and preserve originals."""

    @pytest.mark.parametrize(("slug", "join_model", "original"), RELATION_TYPES)
    def test_place_delete_removes_only_relation(  # type: ignore[no-untyped-def]
        self,
        client,
        session,
        couple,
        slug,
        join_model,
        original,
    ) -> None:
        created_place = place(client, couple)
        created_target = target(client, couple, slug)
        client.put(
            relation_path(couple, slug, created_place["id"], created_target["id"]),
            headers=auth(couple["token_a"]),
        )

        deleted = client.delete(
            f"/api/v1/spaces/{couple['space'].id}/places/{created_place['id']}",
            headers={**auth(couple["token_a"]), "If-Match": '"1"'},
        )
        assert deleted.status_code == 204

        session.expire_all()
        assert count_rows(session, join_model) == 0
        # The original remains readable without modification.
        remaining = client.get(
            f"/api/v1/spaces/{couple['space'].id}/{slug}/{created_target['id']}",
            headers=auth(couple["token_a"]),
        )
        assert remaining.status_code == 200
        assert session.get(original, UUID(created_target["id"])) is not None

    @pytest.mark.parametrize(("slug", "join_model", "original"), RELATION_TYPES)
    def test_target_delete_removes_only_relation(  # type: ignore[no-untyped-def]
        self,
        client,
        session,
        couple,
        slug,
        join_model,
        original,
    ) -> None:
        created_place = place(client, couple)
        created_target = target(client, couple, slug)
        client.put(
            relation_path(couple, slug, created_place["id"], created_target["id"]),
            headers=auth(couple["token_a"]),
        )

        deleted = client.delete(
            f"/api/v1/spaces/{couple['space'].id}/{slug}/{created_target['id']}",
            headers={**auth(couple["token_a"]), "If-Match": '"1"'},
        )
        assert deleted.status_code == 204

        session.expire_all()
        assert count_rows(session, join_model) == 0
        # The Place remains.
        assert (
            client.get(
                f"/api/v1/spaces/{couple['space'].id}/places/{created_place['id']}",
                headers=auth(couple["token_a"]),
            ).status_code
            == 200
        )
