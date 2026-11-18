"""Canonical, bidirectional Plan context with real tenant/privacy boundaries."""

from uuid import uuid4

import pytest
from sqlalchemy import select

from eimir.relations.models import HeartMomentPlan
from eimir.relationship import service as relationship
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


@pytest.fixture
def world(client, session):  # type: ignore[no-untyped-def]
    owner, partner, outsider = (
        make_account(session, name) for name in ("Owner", "Partner", "Outsider")
    )
    space = make_space(session, owner)
    relationship.add_member(session, space.id, partner)
    foreign_space = make_space(session, outsider)
    headers = auth(sign_in(session, owner))
    partner_headers = auth(sign_in(session, partner))
    foreign_headers = auth(sign_in(session, outsider))
    base = f"/api/v1/spaces/{space.id}"

    def create(path, payload, *, context_base=base, context_headers=headers):  # type: ignore[no-untyped-def]
        response = client.post(f"{context_base}/{path}", json=payload, headers=context_headers)
        assert response.status_code == 201, response.text
        return response.json()

    plan = create("plans", {"title": "Day at the lake"})
    other = create("plans", {"title": "Another day"})
    foreign = create(
        "plans",
        {"title": "Foreign Plan"},
        context_base=f"/api/v1/spaces/{foreign_space.id}",
        context_headers=foreign_headers,
    )
    sources = [
        (
            "memories",
            create(
                "memories", {"title": "Picnic", "body": "Our memory", "happenedOn": "2026-01-01"}
            ),
        ),
        (
            "heart-moments",
            create(
                "heart-moments",
                {
                    "text": "A shared feeling",
                    "emotion": "LOVED",
                    "visibility": "SHARED",
                    "happenedOn": "2026-02-01",
                },
            ),
        ),
        ("milestones", create("milestones", {"title": "First outing", "happenedOn": "2026-03-01"})),
    ]
    private = create(
        "heart-moments",
        {
            "text": "Only mine",
            "emotion": "LOVED",
            "visibility": "PRIVATE",
            "happenedOn": "2026-04-01",
        },
    )
    return {
        "base": base,
        "headers": headers,
        "partner": partner_headers,
        "foreign_headers": foreign_headers,
        "plan": plan,
        "other": other,
        "foreign": foreign,
        "sources": sources,
        "private": private,
    }


def link_all(client, world):  # type: ignore[no-untyped-def]
    for slug, source in world["sources"]:
        path = f"{world['base']}/{slug}/{source['id']}/plans/{world['plan']['id']}"
        for _ in range(2):
            response = client.put(path, headers=world["headers"])
            assert response.status_code == 204, response.text


def story_path(world, plan=None):  # type: ignore[no-untyped-def]
    return f"{world['base']}/plans/{(plan or world['plan'])['id']}/story"


def test_all_three_source_types_are_visible_in_both_directions(client, world):  # type: ignore[no-untyped-def]
    link_all(client, world)
    for slug, source in world["sources"]:
        response = client.get(
            f"{world['base']}/{slug}/{source['id']}/plans", headers=world["partner"]
        )
        assert response.status_code == 200, response.text
        assert response.json() == {"items": [world["plan"]["id"]]}
    page = client.get(story_path(world), headers=world["partner"])
    assert page.status_code == 200, page.text
    assert [item["kind"] for item in page.json()["items"]] == [
        "MILESTONE",
        "HEART_MOMENT",
        "MEMORY",
    ]
    assert page.json()["hasMore"] is False
    assert (
        client.get(story_path(world, world["other"]), headers=world["headers"]).json()["items"]
        == []
    )


def test_plan_story_cursor_is_bound_to_plan_and_viewer(client, world):  # type: ignore[no-untyped-def]
    link_all(client, world)
    first = client.get(story_path(world), params={"limit": 1}, headers=world["headers"]).json()
    assert first["hasMore"] is True
    second = client.get(
        story_path(world),
        params={"limit": 1, "cursor": first["nextCursor"]},
        headers=world["headers"],
    )
    assert second.status_code == 200
    assert second.json()["items"][0]["kind"] == "HEART_MOMENT"
    for path, headers in (
        (story_path(world, world["other"]), world["headers"]),
        (story_path(world), world["partner"]),
        (f"{world['base']}/timeline", world["headers"]),
    ):
        response = client.get(path, params={"cursor": first["nextCursor"]}, headers=headers)
        assert response.status_code == 400
        assert response.json()["code"] == "INVALID_CURSOR"


def test_private_foreign_and_unknown_associations_fail_closed(client, world):  # type: ignore[no-untyped-def]
    base = f"{world['base']}/heart-moments/{world['private']['id']}/plans"
    assert client.put(f"{base}/{world['plan']['id']}", headers=world["headers"]).status_code == 404
    assert client.get(base, headers=world["headers"]).json() == {"items": []}
    assert client.get(base, headers=world["partner"]).status_code == 404
    for slug, source in world["sources"]:
        for target in (world["foreign"]["id"], str(uuid4())):
            response = client.put(
                f"{world['base']}/{slug}/{source['id']}/plans/{target}", headers=world["headers"]
            )
            assert response.status_code == 404
            assert response.json()["code"] == "RELATION_TARGET_NOT_FOUND"
    assert client.get(story_path(world), headers=world["foreign_headers"]).status_code == 404


def test_private_transition_removes_shared_context_without_restoring_it(client, session, world):  # type: ignore[no-untyped-def]
    link_all(client, world)
    heart = world["sources"][1][1]
    path = f"{world['base']}/heart-moments/{heart['id']}/visibility"
    private = client.patch(
        path,
        json={"visibility": "PRIVATE"},
        headers={**world["headers"], "If-Match": str(heart["version"])},
    )
    assert private.status_code == 200, private.text
    assert session.scalar(select(HeartMomentPlan)) is None
    for headers in (world["headers"], world["partner"]):
        items = client.get(story_path(world), headers=headers).json()["items"]
        assert [item["kind"] for item in items] == ["MILESTONE", "MEMORY"]
        assert "A shared feeling" not in str(items)
    shared = client.patch(
        path,
        json={"visibility": "SHARED"},
        headers={**world["headers"], "If-Match": str(private.json()["version"])},
    )
    assert shared.status_code == 200, shared.text
    assert client.get(
        f"{world['base']}/heart-moments/{heart['id']}/plans", headers=world["headers"]
    ).json() == {"items": []}


def test_partner_unlink_preserves_the_original_shared_milestone(client, world):  # type: ignore[no-untyped-def]
    link_all(client, world)
    slug, source = world["sources"][2]
    path = f"{world['base']}/{slug}/{source['id']}/plans/{world['plan']['id']}"
    assert client.delete(path, headers=world["partner"]).status_code == 204
    assert (
        client.get(f"{world['base']}/{slug}/{source['id']}", headers=world["headers"]).status_code
        == 200
    )
    assert [
        item["kind"]
        for item in client.get(story_path(world), headers=world["headers"]).json()["items"]
    ] == ["HEART_MOMENT", "MEMORY"]
    response = client.delete(
        f"{world['base']}/plans/{world['plan']['id']}",
        headers={**world["headers"], "If-Match": str(world["plan"]["version"])},
    )
    assert response.status_code == 204, response.text
    for slug, original in world["sources"]:
        source_path = f"{world['base']}/{slug}/{original['id']}"
        assert client.get(source_path, headers=world["headers"]).status_code == 200
        assert client.get(f"{source_path}/plans", headers=world["headers"]).json() == {"items": []}
