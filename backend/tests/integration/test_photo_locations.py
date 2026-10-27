"""Real PostgreSQL / HTTP boundaries for selected-photo places."""

from __future__ import annotations

import io
from uuid import UUID

import pytest
from PIL import Image
from sqlalchemy import select

from eimir.attachments.models import PhotoLocationDraft
from eimir.outbox.models import OutboxEvent
from eimir.places.models import Place
from tests.conftest import auth, requires_database
from tests.integration import test_attachment_binding as binding
from tests.integration.test_attachment_binding import couple as couple

pytestmark = [pytest.mark.integration, requires_database]


@pytest.mark.parametrize("account_action", ["photo_binding", "preference"])
def test_photo_binding_waits_for_account_deletion_before_membership(
    production_client, account_action
):  # type: ignore[no-untyped-def]
    """A deletion's Account -> Membership order cannot cycle with automatic Place FKs."""
    import time
    from concurrent.futures import ThreadPoolExecutor

    from sqlalchemy import text

    from eimir.core.clock import now
    from eimir.identity.models import Account, DeviceSession
    from eimir.relationship.models import Membership
    from tests.conftest import sign_in
    from tests.integration.test_place_relation_races import _setup

    client, _ = production_client
    world = _setup(production_client)
    maker = world["maker"]
    account_id = world["anna"].account_id
    with maker.begin() as session:
        account = session.get(Account, account_id)
        assert account is not None
        token = sign_in(session, account)

    with ThreadPoolExecutor(max_workers=1) as pool:
        with maker.begin() as deleting:
            account = deleting.execute(
                select(Account).where(Account.id == account_id).with_for_update()
            ).scalar_one()
            if account_action == "photo_binding":
                path = (
                    f"/api/v1/spaces/{world['space_id']}/memories/{world['memory_id']}/attachments"
                )
                payload = {"attachments": []}
                version = 1
                lock_clause = "%FOR KEY SHARE%"
            else:
                path = "/api/v1/account/photo-location-preference"
                payload = {"enabled": False}
                version = 0
                lock_clause = "%FOR NO KEY UPDATE%"
            future = pool.submit(
                client.put, path, json=payload, headers={**auth(token), "If-Match": f'"{version}"'}
            )
            deadline = time.monotonic() + 8
            waiting = False
            while time.monotonic() < deadline and not future.done():
                with maker() as observer:
                    waiting = bool(
                        observer.execute(
                            text(
                                "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() "
                                "AND wait_event_type='Lock' AND query LIKE :clause LIMIT 1"
                            ),
                            {"clause": lock_clause},
                        ).first()
                    )
                if waiting:
                    break
                time.sleep(0.01)
            assert waiting, "Capture must wait at Account before obtaining Membership"
            deleting.execute(
                select(DeviceSession)
                .where(
                    DeviceSession.account_id == account_id,
                )
                .with_for_update(nowait=True)
            ).scalars().all()
            # NOWAIT would fail if the blocked request already held Membership.
            deleting.execute(
                select(Membership)
                .where(
                    Membership.account_id == account_id,
                    Membership.space_id == world["space_id"],
                )
                .with_for_update(nowait=True)
            ).scalars().all()
            account.disabled_at = now()
        response = future.result(timeout=10)
    assert response.status_code in (401, 404)


def test_shared_heart_moment_creates_places_and_off_keeps_existing_history(client, couple, session):  # type: ignore[no-untyped-def]
    photo = binding.ready_attachment(client, couple, session)
    result = binding.heart_moment(client, couple, visibility="SHARED", attachment_id=photo)
    assert result.status_code == 201
    target = result.json()["id"]
    assert session.get(PhotoLocationDraft, UUID(photo)) is None
    assert (
        len(places(client, couple, target, "heart-moments", token_key="token_b").json()["items"])
        == 1
    )
    assert set_enabled(client, couple, False, 0).status_code == 200
    assert len(places(client, couple, target, "heart-moments").json()["items"]) == 1
    partner = client.get(
        "/api/v1/account/photo-location-preference", headers=auth(couple["token_b"])
    )
    assert partner.json() == {"enabled": True, "version": 0}
    second = binding.ready_attachment(client, couple, session)
    assert session.get(PhotoLocationDraft, UUID(second)) is None


def test_manual_correction_blocks_future_automatic_association(client, couple, session):  # type: ignore[no-untyped-def]
    first = binding.ready_attachment(client, couple, session)
    memory = binding.memory(client, couple)
    saved = attach(client, couple, memory, [first]).json()
    place = places(client, couple, memory["id"]).json()["items"][0]
    corrected = client.patch(
        f"{binding.base_path(couple['space'].id)}/places/{place['id']}",
        json={"name": "Our chosen place", "latitude": 0, "longitude": 0},
        headers=binding.if_match(couple["token_a"], place["version"]),
    )
    assert corrected.status_code == 200
    second = binding.ready_attachment(client, couple, session)
    assert attach(client, couple, saved, [first, second]).status_code == 200
    result = places(client, couple, memory["id"]).json()["items"]
    assert len(result) == 1 and result[0]["name"] == "Our chosen place"
    assert (result[0]["latitude"], result[0]["longitude"]) == (0, 0)
    assert session.get(PhotoLocationDraft, UUID(second)) is None


@pytest.fixture(autouse=True)
def gps_photo(monkeypatch):  # type: ignore[no-untyped-def]
    image = Image.new("RGB", (32, 24), (10, 20, 30))
    exif = Image.Exif()
    exif[0x8825] = {1: "N", 2: (52, 31, 0), 3: "E", 4: (13, 24, 0)}
    data = io.BytesIO()
    image.save(data, "JPEG", exif=exif.tobytes())
    monkeypatch.setattr(binding, "image_bytes", lambda: data.getvalue())


def attach(client, couple, memory, ids):  # type: ignore[no-untyped-def]
    return client.put(
        f"{binding.base_path(couple['space'].id)}/memories/{memory['id']}/attachments",
        json={
            "attachments": [
                {"attachmentId": value, "position": index} for index, value in enumerate(ids)
            ]
        },
        headers=binding.if_match(couple["token_a"], memory["version"]),
    )


def places(client, couple, target, kind="memories", token_key="token_a"):  # type: ignore[no-untyped-def]
    return client.get(
        f"{binding.base_path(couple['space'].id)}/moments/{kind}/{target}/places",
        headers=auth(couple[token_key]),
    )


def set_enabled(client, couple, enabled, version):  # type: ignore[no-untyped-def]
    return client.put(
        "/api/v1/account/photo-location-preference",
        json={"enabled": enabled},
        headers=binding.if_match(couple["token_a"], version),
    )


def test_shared_commit_creates_once_and_never_exposes_staged_gps(client, couple, session):  # type: ignore[no-untyped-def]
    first = binding.ready_attachment(client, couple, session)
    second = binding.ready_attachment(client, couple, session)
    assert session.get(PhotoLocationDraft, UUID(first)) is not None
    assert session.execute(select(Place)).scalars().all() == []
    projected = client.get(
        f"{binding.base_path(couple['space'].id)}/attachments/{first}",
        headers=auth(couple["token_a"]),
    )
    assert "latitude" not in projected.text and "longitude" not in projected.text
    memory = binding.memory(client, couple)
    saved = attach(client, couple, memory, [first, second])
    assert saved.status_code == 200
    result = places(client, couple, memory["id"], token_key="token_b")
    assert result.status_code == 200
    assert len(result.json()["items"]) == 1
    place = result.json()["items"][0]
    assert (place["latitude"], place["longitude"]) == (52.516667, 13.4)
    assert session.get(PhotoLocationDraft, UUID(first)) is None
    retried = attach(client, couple, saved.json(), [first, second])
    assert retried.status_code == 200
    assert len(places(client, couple, memory["id"]).json()["items"]) == 1
    events = session.execute(select(OutboxEvent)).scalars().all()
    assert all("52.516667" not in str(event.payload) for event in events)


def test_off_invalidates_pending_gps_and_on_never_resurrects_it(client, couple, session):  # type: ignore[no-untyped-def]
    pref = client.get("/api/v1/account/photo-location-preference", headers=auth(couple["token_a"]))
    assert pref.json() == {"enabled": True, "version": 0}
    staged = binding.ready_attachment(client, couple, session)
    assert set_enabled(client, couple, False, 0).json() == {"enabled": False, "version": 1}
    assert session.get(PhotoLocationDraft, UUID(staged)) is None
    assert set_enabled(client, couple, True, 0).status_code == 409
    assert set_enabled(client, couple, True, 1).status_code == 200
    memory = binding.memory(client, couple)
    assert attach(client, couple, memory, [staged]).status_code == 200
    assert places(client, couple, memory["id"]).json()["items"] == []


def test_private_binding_discards_gps_before_later_sharing(client, couple, session):  # type: ignore[no-untyped-def]
    staged = binding.ready_attachment(client, couple, session)
    created = binding.heart_moment(client, couple, visibility="PRIVATE", attachment_id=staged)
    assert created.status_code == 201
    heart = created.json()
    assert session.get(PhotoLocationDraft, UUID(staged)) is None
    assert places(client, couple, heart["id"], "heart-moments").status_code == 404
    shared = client.patch(
        f"{binding.base_path(couple['space'].id)}/heart-moments/{heart['id']}/visibility",
        json={"visibility": "SHARED"},
        headers=binding.if_match(couple["token_a"], heart["version"]),
    )
    assert shared.status_code == 200
    assert places(client, couple, heart["id"], "heart-moments").json()["items"] == []


def test_manual_place_wins_and_unlinked_photo_place_stays_removed_on_retry(client, couple, session):  # type: ignore[no-untyped-def]
    photo = binding.ready_attachment(client, couple, session)
    memory = binding.memory(client, couple)
    root = binding.base_path(couple["space"].id)
    manual = client.post(
        f"{root}/places", json={"name": "Our place"}, headers=auth(couple["token_a"])
    ).json()
    link = f"{root}/places/{manual['id']}/memories/{memory['id']}"
    assert client.put(link, headers=auth(couple["token_a"])).status_code in (200, 204)
    saved = attach(client, couple, memory, [photo])
    assert saved.status_code == 200
    assert [p["id"] for p in places(client, couple, memory["id"]).json()["items"]] == [manual["id"]]
    assert client.delete(link, headers=auth(couple["token_a"])).status_code == 204
    assert attach(client, couple, saved.json(), [photo]).status_code == 200
    assert places(client, couple, memory["id"]).json()["items"] == []
