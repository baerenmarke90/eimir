"""HTTP/PostgreSQL acceptance for the Pro date-idea catalog and ordinary adoption."""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.core.clock import now
from eimir.date_ideas.catalog import get_catalog
from eimir.date_ideas.images import get_images
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


def test_free_space_cannot_read_the_catalog(client, couple) -> None:  # type: ignore[no-untyped-def]
    first_title = get_catalog().ideas("de")[0].title
    for token in (couple["token_a"], couple["token_b"]):
        response = _ideas(client, couple["space"].id, token)
        assert response.status_code == 403
        assert response.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"
        assert "planning.date_inspiration" in response.json()["detail"]
        assert first_title not in response.text


def test_one_grant_serves_both_partners_but_not_other_spaces(
    client, session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    _grant(session, couple["space"].id, couple["anna"].id)
    for token in (couple["token_a"], couple["token_b"]):
        response = _ideas(client, couple["space"].id, token)
        assert response.status_code == 200
        body = response.json()
        assert body["totalCount"] == len(body["ideas"]) == 200
        assert body["catalogVersion"] == get_catalog().version
        assert body["currency"] == "EUR"
        assert response.headers["Cache-Control"] == "private, no-store"
    assert _ideas(client, couple["foreign_space"].id, couple["token_outsider"]).status_code == 403
    assert _ideas(client, couple["space"].id, couple["token_outsider"]).status_code == 404


def test_listing_is_localized_and_filters_use_inclusive_bounds(
    client, session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    _grant(session, couple["space"].id, couple["anna"].id)
    space_id, token = couple["space"].id, couple["token_b"]
    catalog = get_catalog()

    english = _ideas(client, space_id, token, locale="en-GB").json()
    assert english["locale"] == "en"
    first = catalog.ideas("en")[0]
    assert english["ideas"][0] == {
        "id": first.id,
        "category": first.category.value,
        "placeType": first.place_type.value,
        "minutes": first.minutes,
        "budgetEurForTwo": first.budget_eur_for_two,
        "title": first.title,
        "description": first.description,
        "wishTitle": first.wish_title,
        "planTitle": first.plan_title,
        "prerequisites": list(first.prerequisites),
        "contentLocale": "en",
        "image": {
            "id": first.id,
            "width": 1200,
            "height": 800,
            "alt": get_images().manifest.images_by_idea_id[first.id].alt.en,
        },
    }
    assert [label["id"] for label in english["placeTypes"]] == ["home", "out"]
    assert len(english["categories"]) == 10
    assert _ideas(client, space_id, token, locale="fr").json()["locale"] == "de"

    def ideas(**params) -> list[dict]:  # type: ignore[no-untyped-def,type-arg]
        response = _ideas(client, space_id, token, **params)
        assert response.status_code == 200
        return response.json()["ideas"]  # type: ignore[no-any-return]

    thirty = ideas(maxMinutes=30)
    assert thirty and all(idea["minutes"] <= 30 for idea in thirty)
    assert any(idea["minutes"] == 30 for idea in thirty)
    free = ideas(maxBudget=0)
    assert free and all(idea["budgetEurForTwo"] == 0 for idea in free)
    combined = ideas(category="nature", maxMinutes=45, maxBudget=5, place="out")
    expected = [
        idea.id
        for idea in catalog.ideas("de")
        if idea.category.value == "nature"
        and idea.minutes <= 45
        and idea.budget_eur_for_two <= 5
        and idea.place_type.value == "out"
    ]
    assert [idea["id"] for idea in combined] == expected
    home, out = ideas(place="home"), ideas(place="out")
    assert len(home) + len(out) == 200
    for invalid in ({"maxMinutes": 0}, {"maxBudget": 21}, {"place": "anywhere"}, {"category": "x"}):
        assert _ideas(client, space_id, token, **invalid).status_code == 422


def test_adopted_ideas_are_ordinary_free_wishes_and_plans_after_downgrade(
    client, session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    grant = _grant(session, couple["space"].id, couple["anna"].id)
    space_id = couple["space"].id
    idea = _ideas(client, space_id, couple["token_a"]).json()["ideas"][0]

    # "Save as wish": the client prefills the existing composer, the couple
    # confirms, and the ordinary idempotent createWish runs.
    key = str(uuid4())
    headers = {**auth(couple["token_a"]), "Idempotency-Key": key}
    body = {"title": idea["wishTitle"], "description": idea["description"]}
    created = client.post(f"/api/v1/spaces/{space_id}/wishes", json=body, headers=headers)
    assert created.status_code == 201
    replay = client.post(f"/api/v1/spaces/{space_id}/wishes", json=body, headers=headers)
    assert replay.status_code == 200
    assert replay.json()["id"] == created.json()["id"]
    assert len(session.scalars(select(Wish).where(Wish.space_id == space_id)).all()) == 1
    # Catalog metadata is not part of the write DTO.
    rejected = client.post(
        f"/api/v1/spaces/{space_id}/wishes",
        json={**body, "dateIdeaId": idea["id"]},
        headers=auth(couple["token_a"]),
    )
    assert rejected.status_code == 422

    entitlement_service.revoke_grant(session, grant.id)
    session.flush()
    token = couple["token_b"]
    assert _ideas(client, space_id, token).status_code == 403

    wish = client.get(
        f"/api/v1/spaces/{space_id}/wishes/{created.json()['id']}", headers=auth(token)
    )
    assert wish.status_code == 200
    edited = client.patch(
        f"/api/v1/spaces/{space_id}/wishes/{wish.json()['id']}",
        json={"title": "Our picnic"},
        headers={**auth(token), "If-Match": f'"{wish.json()["version"]}"'},
    )
    assert edited.status_code == 200, edited.text
    # "Plan now" from a known Wish uses the canonical conversion with If-Match.
    plan = client.post(
        f"/api/v1/spaces/{space_id}/wishes/{wish.json()['id']}/plan",
        json={"title": idea["planTitle"]},
        headers={**auth(token), "If-Match": f'"{edited.json()["version"]}"'},
    )
    assert plan.status_code in {200, 201}, plan.text
    assert plan.json()["plan"]["title"] == idea["planTitle"]
    direct = client.post(
        f"/api/v1/spaces/{space_id}/plans",
        json={"title": idea["planTitle"], "description": idea["description"]},
        headers={**auth(token), "Idempotency-Key": str(uuid4())},
    )
    assert direct.status_code == 201


def _image(client, space_id, token, image_id):  # type: ignore[no-untyped-def]
    return client.get(
        f"/api/v1/spaces/{space_id}/date-ideas/images/{image_id}", headers=auth(token)
    )


def test_idea_images_are_protected_like_the_catalog(client, session: Session, couple) -> None:  # type: ignore[no-untyped-def]
    space_id = couple["space"].id
    free = _image(client, space_id, couple["token_a"], "eimir-date-001")
    assert free.status_code == 403
    assert free.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"
    assert free.headers["content-type"].startswith("application/")

    _grant(session, space_id, couple["anna"].id)
    listing = _ideas(client, space_id, couple["token_b"], locale="en").json()
    by_id = {idea["id"]: idea for idea in listing["ideas"]}
    assert by_id["eimir-date-001"]["image"]["id"] == "eimir-date-001"
    assert by_id["eimir-date-004"]["image"]["id"] == "category-food_drink"
    assert by_id["eimir-date-001"]["image"]["width"] == 1200
    assert by_id["eimir-date-001"]["image"]["alt"].startswith("Three snacks")

    for token in (couple["token_a"], couple["token_b"]):
        image = _image(client, space_id, token, "category-nature")
        assert image.status_code == 200
        assert image.headers["content-type"] == "image/webp"
        assert image.headers["cache-control"] == "private, no-store"
        assert image.content[:4] == b"RIFF" and image.content[8:12] == b"WEBP"

    missing = _image(client, space_id, couple["token_a"], "category-unknown")
    assert missing.status_code == 404
    assert missing.json()["code"] == "DATE_IDEA_IMAGE_NOT_FOUND"
    for malformed in ("..%2Fcatalog", "EIMIR-DATE-001", "eimir-date-1"):
        assert _image(client, space_id, couple["token_a"], malformed).status_code in {404, 422}
    assert _image(client, space_id, couple["token_outsider"], "category-nature").status_code == 404
