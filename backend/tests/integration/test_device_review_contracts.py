"""Device-review acceptance at the real authorization, database and HTTP boundaries."""

from datetime import timedelta
from typing import Any
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.context_tags.models import TagSuggestion, TagSuggestionPayload
from eimir.core import clock
from eimir.entitlements import service as entitlement_service
from eimir.entitlements.models import (
    Capability,
    EntitlementSourceType,
    EntitlementStatus,
    EntitlementTier,
)
from eimir.identity.models import Account
from eimir.relations.models import MemoryPlan, MemoryWish
from eimir.relationship import service as relationships
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


@pytest.fixture
def world(session: Session) -> dict[str, Any]:
    owner, partner, outsider = (
        make_account(session, name) for name in ("Owner", "Partner", "Outsider")
    )
    space = make_space(session, owner)
    relationships.add_member(session, space.id, partner)
    other = make_space(session, outsider)
    session.flush()
    return {
        "space": str(space.id),
        "other": str(other.id),
        "owner": owner,
        "a": auth(sign_in(session, owner)),
        "b": auth(sign_in(session, partner)),
        "foreign": auth(sign_in(session, outsider)),
    }


def create(
    client: TestClient,
    world: dict[str, Any],
    collection: str,
    payload: dict[str, Any],
    actor: str = "a",
) -> dict[str, Any]:
    response = client.post(
        f"/api/v1/spaces/{world['space']}/{collection}", headers=world[actor], json=payload
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.parametrize(("kind", "model"), [("plans", MemoryPlan), ("wishes", MemoryWish)])
def test_memory_links_are_collaborative_idempotent_and_keep_originals(
    client: TestClient, session: Session, world: dict[str, Any], kind: str, model: Any
) -> None:
    memory = create(client, world, "memories", {"title": "Weekend"})
    target = create(client, world, kind, {"title": "Shared intention"})
    base = f"/api/v1/spaces/{world['space']}/memories/{memory['id']}/{kind}"
    link = f"{base}/{target['id']}"
    assert client.put(link, headers=world["b"]).status_code == 204
    assert client.put(link, headers=world["b"]).status_code == 204
    assert session.scalar(select(func.count()).select_from(model)) == 1
    assert client.get(base, headers=world["a"]).json()["items"] == [target["id"]]
    assert (
        client.put(
            link.replace(world["space"], world["other"]), headers=world["foreign"]
        ).status_code
        == 404
    )
    assert client.delete(link, headers=world["a"]).status_code == 204
    assert (
        client.get(
            f"/api/v1/spaces/{world['space']}/{kind}/{target['id']}", headers=world["b"]
        ).status_code
        == 200
    )
    assert (
        client.get(
            f"/api/v1/spaces/{world['space']}/memories/{memory['id']}", headers=world["b"]
        ).status_code
        == 200
    )


def test_learned_and_proposed_tags_reauthorize_sources_and_reject_stale_versions(
    client: TestClient, session: Session, world: dict[str, Any]
) -> None:
    memory = create(client, world, "memories", {"title": "Belgium", "tags": ["Concert"]})
    private = create(
        client,
        world,
        "heart-moments",
        {
            "text": "Private words",
            "happenedOn": "2026-11-04",
            "emotion": "HAPPY",
            "visibility": "PRIVATE",
            "tags": ["Owner-only label"],
        },
        "b",
    )
    session.add(
        TagSuggestion(
            space_id=UUID(world["space"]),
            memory_id=UUID(memory["id"]),
            source_version=memory["version"],
            generated_at=clock.now(),
            payload=TagSuggestionPayload(tags=["Belgium"]),
        )
    )
    session.add(
        TagSuggestion(
            space_id=UUID(world["space"]),
            heart_moment_id=UUID(private["id"]),
            source_version=private["version"],
            generated_at=clock.now(),
            payload=TagSuggestionPayload(tags=["Private proposal"]),
        )
    )
    session.flush()
    path = f"/api/v1/spaces/{world['space']}/context-tag-suggestions"
    result = client.get(path, headers=world["a"])
    assert result.status_code == 200, result.text
    assert result.json() == {"learned": ["Concert"], "proposed": ["Belgium"]}
    own = client.get(path, headers=world["b"]).json()
    assert "Owner-only label" in own["learned"]
    assert "Private proposal" in own["proposed"]
    assert client.get(path, headers=world["foreign"]).status_code == 404
    assert (
        client.get(
            path,
            headers=world["a"],
            params={"parentType": "HEART_MOMENT", "parentId": private["id"]},
        ).status_code
        == 404
    )
    updated = client.patch(
        f"/api/v1/spaces/{world['space']}/memories/{memory['id']}",
        headers={**world["a"], "If-Match": str(memory["version"])},
        json={"body": "A different day"},
    )
    assert updated.status_code == 200, updated.text
    assert "Belgium" not in client.get(path, headers=world["a"]).json()["proposed"]


def test_device_zone_updates_personal_scheduling_without_shifting_calendar_dates(
    client: TestClient, session: Session, world: dict[str, Any]
) -> None:
    memory = create(
        client, world, "memories", {"title": "Calendar date", "happenedOn": "2026-10-31"}
    )
    response = client.put(
        "/api/v1/account/device-context",
        headers=world["a"],
        json={"timezone": "Pacific/Auckland", "spaceId": world["space"]},
    )
    assert response.status_code == 200, response.text
    assert response.json()["timezone"] == "Pacific/Auckland"
    session.expire_all()
    assert session.get(Account, world["owner"].id).timezone == "Pacific/Auckland"
    assert (
        client.get(
            f"/api/v1/spaces/{world['space']}/memories/{memory['id']}", headers=world["a"]
        ).json()["happenedOn"]
        == "2026-10-31"
    )
    assert (
        client.put(
            "/api/v1/account/device-context",
            headers=world["a"],
            json={"timezone": "Made/Up", "spaceId": world["space"]},
        ).status_code
        == 422
    )
    assert (
        client.put(
            "/api/v1/account/device-context",
            headers=world["a"],
            json={"timezone": "UTC", "spaceId": world["other"]},
        ).status_code
        == 404
    )


def test_shared_experience_is_consumed_by_canonical_view_and_expires(
    client: TestClient, session: Session, world: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    entitlement_service.record_grant(
        session,
        space_id=UUID(world["space"]),
        account_id=world["owner"].id,
        source_type=EntitlementSourceType.TEST_FIXTURE,
        status=EntitlementStatus.ACTIVE,
        tier=EntitlementTier.PREMIUM,
        effective_from=clock.now() - timedelta(days=1),
        capabilities=[Capability.GAMES_COUPLE.value],
    )
    session.flush()
    entry = create(
        client,
        world,
        "memories",
        {"title": "A shared question", "body": "A partner answer", "experienceKind": "HAPPINESS"},
        "b",
    )
    dashboard = f"/api/v1/spaces/{world['space']}/dashboard"
    assert (
        client.get(dashboard, headers=world["a"]).json()["incomingExperience"]["id"] == entry["id"]
    )
    response = client.post(
        f"/api/v1/spaces/{world['space']}/story-views",
        headers=world["a"],
        json={"kind": "MEMORY", "itemId": entry["id"]},
    )
    assert response.status_code == 204, response.text
    assert client.get(dashboard, headers=world["a"]).json()["incomingExperience"] is None
    create(
        client,
        world,
        "memories",
        {"title": "Another question", "body": "Another answer", "experienceKind": "TIME_TRAVEL"},
        "b",
    )
    later = clock.now() + timedelta(days=4)
    monkeypatch.setattr(clock, "now", lambda: later)
    assert client.get(dashboard, headers=world["a"]).json()["incomingExperience"] is None


def test_unqualified_places_are_alphabetical_across_pages(
    client: TestClient, world: dict[str, Any]
) -> None:
    for name in ("Zebra", "Berlin", "Äpfel"):
        create(client, world, "places", {"name": name})
    cursor = None
    names = []
    for _ in range(3):
        params = {"limit": "1"}
        if cursor:
            params["cursor"] = cursor
        result = client.get(
            f"/api/v1/spaces/{world['space']}/places", headers=world["b"], params=params
        )
        assert result.status_code == 200, result.text
        names.extend(item["name"] for item in result.json()["items"])
        cursor = result.json()["nextCursor"]
    assert names == ["Äpfel", "Berlin", "Zebra"]
    assert cursor is None


def test_local_ai_proposes_without_rewriting_tags_and_rejects_a_changed_source(
    production_client: TestClient, engine: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    from eimir.authorization import AuthorizationContext
    from eimir.context_tags import jobs
    from eimir.memories.models import Memory

    with Session(engine) as setup:
        owner = make_account(setup, "Local inference owner")
        space = make_space(setup, owner)
        owner_id, space_id = owner.id, space.id
        headers = auth(sign_in(setup, owner))
        setup.commit()
    path = f"/api/v1/spaces/{space_id}/memories"
    response = production_client.post(path, headers=headers, json={"title": "Belgien"})
    assert response.status_code == 201, response.text
    entry = response.json()
    context = AuthorizationContext(account_id=owner_id, space_id=space_id)
    calls = []

    def infer(payload: dict[str, Any], **_kwargs: Any) -> dict[str, Any]:
        calls.append(payload)
        return {"message": {"content": '{"tags":["Belgien","Invented diagnosis"]}'}}

    monkeypatch.setattr(jobs, "query_structured", infer)
    with Session(engine) as worker:
        jobs._generate(worker, Memory, UUID(entry["id"]), context)
        worker.commit()
    suggestions = production_client.get(
        f"/api/v1/spaces/{space_id}/context-tag-suggestions", headers=headers
    )
    assert suggestions.json()["proposed"] == ["Belgien"]
    assert production_client.get(f"{path}/{entry['id']}", headers=headers).json()["tags"] == []
    assert len(calls) == 1

    def edited_during_inference(payload: dict[str, Any], **_kwargs: Any) -> dict[str, Any]:
        changed = production_client.patch(
            f"{path}/{entry['id']}",
            headers={**headers, "If-Match": str(entry["version"])},
            json={"title": "Another source"},
        )
        assert changed.status_code == 200, changed.text
        return {"message": {"content": '{"tags":["Belgien"]}'}}

    monkeypatch.setattr(jobs, "query_structured", edited_during_inference)
    with Session(engine) as worker:
        jobs._generate(worker, Memory, UUID(entry["id"]), context)
        worker.commit()
    assert (
        production_client.get(
            f"/api/v1/spaces/{space_id}/context-tag-suggestions", headers=headers
        ).json()["proposed"]
        == []
    )
