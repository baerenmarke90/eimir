"""HTTP/PostgreSQL acceptance for Pro date inspiration and its Wish/Plan integration."""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.core.clock import now
from eimir.entitlements import service as entitlement_service
from eimir.entitlements.models import (
    Capability,
    EntitlementSourceType,
    EntitlementStatus,
    EntitlementTier,
)
from eimir.relationship import service as relationship_service
from eimir.wishes.models import Wish
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

IDEA = "living-room-picnic"


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    outsider = make_account(session, "Outsider")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    foreign_space = make_space(session, outsider)
    session.flush()
    return {
        "anna": anna,
        "ben": ben,
        "outsider": outsider,
        "space": space,
        "foreign_space": foreign_space,
        "token_a": sign_in(session, anna),
        "token_b": sign_in(session, ben),
        "token_outsider": sign_in(session, outsider),
    }


def _grant(session: Session, space_id, account_id):  # type: ignore[no-untyped-def]
    grant = entitlement_service.record_grant(
        session,
        space_id=space_id,
        account_id=account_id,
        source_type=EntitlementSourceType.TEST_FIXTURE,
        status=EntitlementStatus.ACTIVE,
        tier=EntitlementTier.PREMIUM,
        effective_from=now(),
        capabilities=[Capability.PLANNING_DATE_INSPIRATION.value],
    )
    session.flush()
    return grant


def _ideas(client, space_id, token, **params):  # type: ignore[no-untyped-def]
    return client.get(f"/api/v1/spaces/{space_id}/date-ideas", params=params, headers=auth(token))


def _save(client, space_id, token, idea=IDEA, *, key=None, locale="de"):  # type: ignore[no-untyped-def]
    headers = auth(token)
    if key is not None:
        headers["Idempotency-Key"] = str(key)
    return client.post(
        f"/api/v1/spaces/{space_id}/date-ideas/{idea}/wish",
        json={"locale": locale},
        headers=headers,
    )


def test_free_space_cannot_read_or_adopt_the_catalog(client, session: Session, couple) -> None:  # type: ignore[no-untyped-def]
    space_id = couple["space"].id
    for token in (couple["token_a"], couple["token_b"]):
        listing = _ideas(client, space_id, token)
        assert listing.status_code == 403
        assert listing.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"
        assert "planning.date_inspiration" in listing.json()["detail"]
        assert "Picknick" not in listing.text

        saved = _save(client, space_id, token)
        assert saved.status_code == 403
        assert saved.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"
    assert session.scalars(select(Wish).where(Wish.space_id == space_id)).all() == []


def test_one_grant_serves_both_partners_but_not_other_spaces(
    client, session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    _grant(session, couple["space"].id, couple["anna"].id)

    for token in (couple["token_a"], couple["token_b"]):
        response = _ideas(client, couple["space"].id, token)
        assert response.status_code == 200
        body = response.json()
        assert body["edition"] == "development"
        assert body["locale"] == "de"
        assert body["currency"] == "EUR"
        assert body["totalCount"] == len(body["ideas"]) > 0
        assert response.headers["Cache-Control"] == "private, no-store"

    # The outsider's own Space has no grant; a member check precedes the gate elsewhere.
    assert _ideas(client, couple["foreign_space"].id, couple["token_outsider"]).status_code == 403
    assert _ideas(client, couple["space"].id, couple["token_outsider"]).status_code == 404


def test_listing_is_localized_with_deterministic_order_and_combined_filters(
    client, session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    _grant(session, couple["space"].id, couple["anna"].id)
    space_id, token = couple["space"].id, couple["token_a"]

    english = _ideas(client, space_id, token, locale="en-GB").json()
    assert english["locale"] == "en"
    picnic = next(idea for idea in english["ideas"] if idea["id"] == IDEA)
    assert picnic["title"] == "Living room picnic"
    assert picnic["contentLocale"] == "en"
    assert picnic["durationBand"] == "EVENING"
    assert picnic["budgetBand"] == "LOW"
    assert picnic["setting"] == "HOME"
    assert {category["id"]: category["label"] for category in english["categories"]}["food"] == (
        "Food & drink"
    )
    fallback = _ideas(client, space_id, token, locale="fr").json()
    assert fallback["locale"] == "de"

    first = [idea["id"] for idea in _ideas(client, space_id, token).json()["ideas"]]
    assert first == [idea["id"] for idea in _ideas(client, space_id, token).json()["ideas"]]

    home = _ideas(client, space_id, token, setting="HOME").json()["ideas"]
    assert home and all(idea["setting"] in {"HOME", "EITHER"} for idea in home)
    combined = _ideas(
        client, space_id, token, category="romantic", setting="OUT", budget="LOW"
    ).json()
    assert combined["ideas"]
    assert all(
        idea["categoryId"] == "romantic"
        and idea["setting"] in {"OUT", "EITHER"}
        and idea["budgetBand"] == "LOW"
        for idea in combined["ideas"]
    )
    assert combined["totalCount"] > len(combined["ideas"])
    none = _ideas(client, space_id, token, category="cozy", duration="LONG").json()
    assert none["ideas"] == []
    assert _ideas(client, space_id, token, category="unknown_category").json()["ideas"] == []
    assert _ideas(client, space_id, token, duration="FOREVER").status_code == 422


def test_saving_an_idea_creates_one_regular_wish_for_the_whole_space(
    client, session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    _grant(session, couple["space"].id, couple["anna"].id)
    space_id = couple["space"].id

    created = _save(client, space_id, couple["token_a"], key=uuid4())
    assert created.status_code == 201
    wish = created.json()
    assert wish["title"] == "Picknick im Wohnzimmer"
    assert wish["description"].startswith("Decke auf den Boden")
    assert wish["status"] == "OPEN"
    assert created.headers["ETag"]

    # Repeated taps, a retry without a key and the partner all receive the same Wish.
    assert _save(client, space_id, couple["token_a"], key=uuid4()).json()["id"] == wish["id"]
    assert _save(client, space_id, couple["token_a"]).status_code == 200
    partner = _save(client, space_id, couple["token_b"], locale="en")
    assert partner.status_code == 200
    assert partner.json()["id"] == wish["id"]
    assert len(session.scalars(select(Wish).where(Wish.space_id == space_id)).all()) == 1

    listing = _ideas(client, space_id, couple["token_b"]).json()
    saved = {idea["id"]: idea.get("savedWishId") for idea in listing["ideas"]}
    assert saved[IDEA] == wish["id"]
    assert sum(1 for value in saved.values() if value) == 1

    # The Wish is an ordinary shared Wish on the unchanged Free endpoint.
    ordinary = client.get(
        f"/api/v1/spaces/{space_id}/wishes/{wish['id']}", headers=auth(couple["token_b"])
    )
    assert ordinary.status_code == 200
    assert ordinary.json()["title"] == "Picknick im Wohnzimmer"


def test_idempotency_key_replays_and_rejects_reuse_for_another_idea(
    client, session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    _grant(session, couple["space"].id, couple["anna"].id)
    space_id, key = couple["space"].id, uuid4()
    first = _save(client, space_id, couple["token_a"], key=key)
    assert first.status_code == 201
    reused = _save(client, space_id, couple["token_a"], "sunrise-walk", key=key)
    assert reused.status_code == 409
    assert reused.json()["code"] == "IDEMPOTENCY_KEY_REUSED"
    assert len(session.scalars(select(Wish).where(Wish.space_id == space_id)).all()) == 1


def test_unknown_or_malformed_ideas_create_nothing(client, session: Session, couple) -> None:  # type: ignore[no-untyped-def]
    _grant(session, couple["space"].id, couple["anna"].id)
    space_id = couple["space"].id
    missing = _save(client, space_id, couple["token_a"], "no-such-idea")
    assert missing.status_code == 404
    assert missing.json()["code"] == "DATE_IDEA_NOT_FOUND"
    extra = client.post(
        f"/api/v1/spaces/{space_id}/date-ideas/{IDEA}/wish",
        json={"title": "Injected"},
        headers=auth(couple["token_a"]),
    )
    assert extra.status_code == 422
    assert session.scalars(select(Wish).where(Wish.space_id == space_id)).all() == []


def test_completed_wish_frees_the_idea_and_spaces_stay_isolated(
    client, session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    _grant(session, couple["space"].id, couple["anna"].id)
    _grant(session, couple["foreign_space"].id, couple["outsider"].id)
    space_id = couple["space"].id

    first = _save(client, space_id, couple["token_a"]).json()
    completed = client.post(
        f"/api/v1/spaces/{space_id}/wishes/{first['id']}/complete",
        headers={**auth(couple["token_a"]), "If-Match": f'"{first["version"]}"'},
    )
    assert completed.status_code == 200, completed.text
    again = _save(client, space_id, couple["token_a"])
    assert again.status_code == 201
    assert again.json()["id"] != first["id"]

    foreign = _ideas(client, couple["foreign_space"].id, couple["token_outsider"]).json()
    assert all("savedWishId" not in idea for idea in foreign["ideas"])
    outsider_save = _save(client, couple["foreign_space"].id, couple["token_outsider"])
    assert outsider_save.status_code == 201
    assert outsider_save.json()["id"] not in {first["id"], again.json()["id"]}


def test_downgrade_keeps_adopted_wishes_and_plans_fully_usable(
    client, session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    grant = _grant(session, couple["space"].id, couple["anna"].id)
    space_id, token = couple["space"].id, couple["token_b"]
    saved = _save(client, space_id, couple["token_a"]).json()
    other = _save(client, space_id, couple["token_a"], "sunrise-walk").json()

    entitlement_service.revoke_grant(session, grant.id)
    session.flush()

    assert _ideas(client, space_id, token).status_code == 403
    assert _save(client, space_id, token, "tasting-at-home").status_code == 403

    listed = client.get(f"/api/v1/spaces/{space_id}/wishes", headers=auth(token))
    assert listed.status_code == 200
    assert {item["id"] for item in listed.json()["items"]} == {saved["id"], other["id"]}

    edited = client.patch(
        f"/api/v1/spaces/{space_id}/wishes/{saved['id']}",
        json={"title": "Unser Picknick"},
        headers={**auth(token), "If-Match": f'"{saved["version"]}"'},
    )
    assert edited.status_code == 200, edited.text
    plan = client.post(
        f"/api/v1/spaces/{space_id}/wishes/{saved['id']}/plan",
        json={},
        headers={**auth(token), "If-Match": f'"{edited.json()["version"]}"'},
    )
    assert plan.status_code in {200, 201}, plan.text
    assert plan.json()["plan"]["title"] == "Unser Picknick"

    # Ordinary Wish and Plan creation stay Free without any new gate.
    assert (
        client.post(
            f"/api/v1/spaces/{space_id}/wishes", json={"title": "Eigene Idee"}, headers=auth(token)
        ).status_code
        == 201
    )
    assert (
        client.post(
            f"/api/v1/spaces/{space_id}/plans", json={"title": "Eigener Plan"}, headers=auth(token)
        ).status_code
        == 201
    )
    deleted = client.delete(
        f"/api/v1/spaces/{space_id}/wishes/{other['id']}",
        headers={**auth(token), "If-Match": f'"{other["version"]}"'},
    )
    assert deleted.status_code == 204, deleted.text
