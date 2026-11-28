"""Real PostgreSQL / HTTP boundaries for selected-photo places."""

from __future__ import annotations

import io
from uuid import UUID, uuid4

import pytest
from PIL import Image
from sqlalchemy import select

from eimir.attachments.models import Attachment, PhotoLocationDraft
from eimir.outbox.models import OutboxEvent
from eimir.places.models import Place
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in
from tests.integration import test_attachment_binding as binding
from tests.integration.test_attachment_binding import couple as couple

pytestmark = [pytest.mark.integration, requires_database]


@pytest.fixture
def required_location_encryption(encryption):  # type: ignore[no-untyped-def]
    """Configure real payload/media protection before client and couple creation."""
    return encryption.apply("required")


def test_selected_photo_location_works_with_required_encryption(
    required_location_encryption, client, couple, session
):  # type: ignore[no-untyped-def]
    import json

    from sqlalchemy import text

    from eimir.domain.payload import CRYPTO_VERSION_SERVER_AEAD

    photo = binding.ready_attachment(client, couple, session)
    raw, crypto_version = session.execute(
        text("SELECT payload::text, crypto_version FROM photo_location_drafts WHERE id = :id"),
        {"id": UUID(photo)},
    ).one()
    assert crypto_version == CRYPTO_VERSION_SERVER_AEAD
    assert json.loads(raw)["_enc"] == CRYPTO_VERSION_SERVER_AEAD
    assert "latitude" not in raw and "longitude" not in raw
    session.expire_all()
    draft = session.get(PhotoLocationDraft, UUID(photo))
    assert draft is not None and draft.payload.latitude == 52.516667

    memory = binding.memory(client, couple)
    saved = attach(client, couple, memory, [photo])
    assert saved.status_code == 200
    assert session.get(PhotoLocationDraft, UUID(photo)) is None
    shared = places(client, couple, memory["id"], token_key="token_b")
    assert shared.status_code == 200
    assert [(item["latitude"], item["longitude"]) for item in shared.json()["items"]] == [
        (52.516667, 13.4)
    ]


def test_cancel_discards_location_before_provider_cleanup(client, couple, session):  # type: ignore[no-untyped-def]
    photo = binding.ready_attachment(client, couple, session)
    assert session.get(PhotoLocationDraft, UUID(photo)) is not None
    attachment = session.get(Attachment, UUID(photo))
    assert attachment is not None
    removed = client.delete(
        f"{binding.base_path(couple['space'].id)}/attachments/{photo}",
        headers=binding.if_match(couple["token_a"], attachment.version),
    )
    assert removed.status_code in (202, 204)
    assert session.get(PhotoLocationDraft, UUID(photo)) is None


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


def test_shared_heart_moment_rejects_legacy_disable(client, couple, session):  # type: ignore[no-untyped-def]
    photo = binding.ready_attachment(client, couple, session)
    result = binding.heart_moment(client, couple, visibility="SHARED", attachment_id=photo)
    assert result.status_code == 201
    target = result.json()["id"]
    assert session.get(PhotoLocationDraft, UUID(photo)) is None
    assert (
        len(places(client, couple, target, "heart-moments", token_key="token_b").json()["items"])
        == 1
    )
    assert set_enabled(client, couple, False, 0).status_code == 409
    assert len(places(client, couple, target, "heart-moments").json()["items"]) == 1
    partner = client.get(
        "/api/v1/account/photo-location-preference", headers=auth(couple["token_b"])
    )
    assert partner.json() == {"enabled": True, "version": 0}
    second = binding.ready_attachment(client, couple, session)
    assert session.get(PhotoLocationDraft, UUID(second)) is not None


@pytest.fixture
def unit_of_work(production_client):  # type: ignore[no-untyped-def]
    """The request session production uses: no autoflush before the photo Place lock.

    The ordinary ``client`` session autoflushes, which hid #2353: a pending
    gallery write was discarded when the photo Place re-read its target.
    """
    client, maker = production_client
    with maker.begin() as session:
        anna = make_account(session, "Anna")
        ben = make_account(session, "Ben")
        space = make_space(session, anna)
        relationship_service.add_member(session, space.id, ben)
        session.flush()
        couple = {
            "anna": anna,
            "ben": ben,
            "space": space,
            "token_a": sign_in(session, anna),
            "token_b": sign_in(session, ben),
        }

    def photo() -> str:
        with maker.begin() as session:
            return binding.ready_attachment(client, couple, session)

    return client, couple, photo


def test_photo_place_keeps_the_shared_heart_moment_gallery_and_cover(unit_of_work):  # type: ignore[no-untyped-def]
    """Creating the photo Place must not drop the gallery it was derived from (#2353)."""
    client, couple, ready_photo = unit_of_work
    photo = ready_photo()
    # The body and the request identity the Web client sends.
    created = client.post(
        f"{binding.base_path(couple['space'].id)}/heart-moments",
        json={
            "text": "",
            "tags": [],
            "emotion": "LOVED",
            "visibility": "SHARED",
            "happenedOn": "2025-06-13",
            "attachments": [{"attachmentId": photo, "isSensitive": False, "position": 0}],
            "selectedCoverAttachmentId": photo,
        },
        headers={**auth(couple["token_a"]), "Idempotency-Key": str(uuid4())},
    )
    assert created.status_code == 201
    heart = created.json()
    assert [item["id"] for item in heart["attachments"]] == [photo]
    assert heart["selectedCoverAttachmentId"] == photo
    assert len(places(client, couple, heart["id"], "heart-moments").json()["items"]) == 1

    read = client.get(
        f"{binding.base_path(couple['space'].id)}/heart-moments/{heart['id']}",
        headers=auth(couple["token_b"]),
    ).json()
    assert [item["id"] for item in read["attachments"]] == [photo]
    assert read["selectedCoverAttachmentId"] == photo


def test_photo_place_keeps_the_memory_cover(unit_of_work):  # type: ignore[no-untyped-def]
    client, couple, ready_photo = unit_of_work
    first = ready_photo()
    second = ready_photo()
    memory = binding.memory(client, couple)
    saved = client.put(
        f"{binding.base_path(couple['space'].id)}/memories/{memory['id']}/attachments",
        json={
            "attachments": [
                {"attachmentId": first, "position": 0},
                {"attachmentId": second, "position": 1},
            ],
            "selectedCoverAttachmentId": second,
        },
        headers=binding.if_match(couple["token_a"], memory["version"]),
    )
    assert saved.status_code == 200
    assert saved.json()["selectedCoverAttachmentId"] == second
    assert len(places(client, couple, memory["id"]).json()["items"]) == 1


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
    assert projected.status_code == 200
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
    unlinked = client.delete(
        f"{binding.base_path(couple['space'].id)}/places/{place['id']}/memories/{memory['id']}",
        headers=auth(couple["token_a"]),
    )
    assert unlinked.status_code == 204
    assert attach(client, couple, retried.json(), [first, second]).status_code == 200
    assert places(client, couple, memory["id"]).json()["items"] == []
    events = session.execute(select(OutboxEvent)).scalars().all()
    assert all("52.516667" not in str(event.payload) for event in events)


def test_photo_places_stay_enabled_and_legacy_writes_preserve_pending_gps(client, couple, session):  # type: ignore[no-untyped-def]
    pref = client.get("/api/v1/account/photo-location-preference", headers=auth(couple["token_a"]))
    assert pref.json() == {"enabled": True, "version": 0}
    staged = binding.ready_attachment(client, couple, session)
    disabled = set_enabled(client, couple, False, 0)
    assert disabled.status_code == 409
    assert disabled.json()["code"] == "PHOTO_LOCATIONS_ALWAYS_ENABLED"
    assert session.get(PhotoLocationDraft, UUID(staged)) is not None
    assert set_enabled(client, couple, True, 0).json() == {"enabled": True, "version": 0}
    assert set_enabled(client, couple, True, 1).status_code == 409
    memory = binding.memory(client, couple)
    assert attach(client, couple, memory, [staged]).status_code == 200
    assert len(places(client, couple, memory["id"]).json()["items"]) == 1


def test_private_binding_discards_gps_before_later_sharing(client, couple, session):  # type: ignore[no-untyped-def]
    staged = binding.ready_attachment(client, couple, session)
    created = binding.heart_moment(client, couple, visibility="PRIVATE", attachment_id=staged)
    assert created.status_code == 201
    heart = created.json()
    assert session.get(PhotoLocationDraft, UUID(staged)) is None
    assert session.execute(select(Place)).scalars().all() == []
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


def test_retired_switch_upgrade_enables_existing_accounts_once(monkeypatch, couple, session):  # type: ignore[no-untyped-def]
    import importlib.util
    from pathlib import Path

    from sqlalchemy import text

    anna, ben = couple["anna"], couple["ben"]
    anna.photo_locations_enabled = False
    anna.photo_locations_version = 4
    ben.photo_locations_version = 7
    session.flush()
    path = Path(__file__).parents[2] / "alembic/versions/0096_photo_places_always_enabled.py"
    spec = importlib.util.spec_from_file_location("photo_places_upgrade", path)
    assert spec is not None and spec.loader is not None
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    monkeypatch.setattr(migration.op, "execute", lambda sql: session.execute(text(sql)))
    migration.upgrade()
    session.expire_all()
    assert anna.photo_locations_enabled is True
    assert anna.photo_locations_version == 5
    assert ben.photo_locations_enabled is True
    assert ben.photo_locations_version == 7
    migration.upgrade()
    session.expire_all()
    assert anna.photo_locations_version == 5
    assert ben.photo_locations_version == 7


def test_an_edited_replacement_adds_no_second_place(client, couple, session):  # type: ignore[no-untyped-def]
    original = binding.ready_attachment(client, couple, session)
    memory = binding.memory(client, couple)
    saved = attach(client, couple, memory, [original])
    assert saved.status_code == 200
    [place] = places(client, couple, memory["id"]).json()["items"]
    unlinked = client.delete(
        f"{binding.base_path(couple['space'].id)}/places/{place['id']}/memories/{memory['id']}",
        headers=auth(couple["token_a"]),
    )
    assert unlinked.status_code == 204
    edited = binding.ready_attachment(client, couple, session)
    assert session.get(PhotoLocationDraft, UUID(edited)) is not None
    replaced = client.put(
        f"{binding.base_path(couple['space'].id)}/memories/{memory['id']}/attachments",
        json={
            "attachments": [
                {"attachmentId": edited, "position": 0, "replacesAttachmentId": original}
            ]
        },
        headers=binding.if_match(couple["token_a"], saved.json()["version"]),
    )
    assert replaced.status_code == 200
    # The edit keeps its metadata, but its location is consumed without a Place.
    assert places(client, couple, memory["id"]).json()["items"] == []
    session.expire_all()
    assert session.get(PhotoLocationDraft, UUID(edited)) is None
    assert session.get(Attachment, UUID(original)).status == "DELETING"


def test_heart_moment_replacement_keeps_a_single_photo_place(client, couple, session):  # type: ignore[no-untyped-def]
    heart = binding.heart_moment(client, couple).json()
    url = f"{binding.base_path(couple['space'].id)}/heart-moments/{heart['id']}"
    original = binding.ready_attachment(client, couple, session)
    saved = client.patch(
        url,
        json={"attachments": [{"attachmentId": original, "position": 0}]},
        headers=binding.if_match(couple["token_a"], heart["version"]),
    )
    assert saved.status_code == 200, saved.text
    assert len(places(client, couple, heart["id"], kind="heart-moments").json()["items"]) == 1
    edited = binding.ready_attachment(client, couple, session)
    replaced = client.patch(
        url,
        json={
            "attachments": [
                {"attachmentId": edited, "position": 0, "replacesAttachmentId": original}
            ]
        },
        headers=binding.if_match(couple["token_a"], saved.json()["version"]),
    )
    assert replaced.status_code == 200, replaced.text
    assert len(places(client, couple, heart["id"], kind="heart-moments").json()["items"]) == 1
    session.expire_all()
    assert session.get(PhotoLocationDraft, UUID(edited)) is None
    assert session.get(Attachment, UUID(original)).status == "DELETING"


def gps_jpeg(latitude_seconds: int, longitude_seconds: int, latitude_minutes: int = 31) -> bytes:
    """A photo taken at 52°<minutes>'<seconds>" N, 13°24'<seconds>" E (1" is about 31 m)."""
    image = Image.new("RGB", (32, 24), (10, 20, 30))
    exif = Image.Exif()
    exif[0x8825] = {
        1: "N",
        2: (52, latitude_minutes, latitude_seconds),
        3: "E",
        4: (13, 24, longitude_seconds),
    }
    data = io.BytesIO()
    image.save(data, "JPEG", exif=exif.tobytes())
    return data.getvalue()


def ready_at(client, couple, session, monkeypatch, *position, **kwargs):  # type: ignore[no-untyped-def]
    monkeypatch.setattr(binding, "image_bytes", lambda: gps_jpeg(*position, **kwargs))
    return binding.ready_attachment(client, couple, session)


def test_a_later_photo_at_the_same_spot_adds_no_second_place(  # type: ignore[no-untyped-def]
    client, couple, session, monkeypatch
):
    first = ready_at(client, couple, session, monkeypatch, 0, 0)
    memory = binding.memory(client, couple)
    saved = attach(client, couple, memory, [first])
    assert saved.status_code == 200
    second = ready_at(client, couple, session, monkeypatch, 0, 0)
    assert attach(client, couple, saved.json(), [first, second]).status_code == 200
    assert len(places(client, couple, memory["id"]).json()["items"]) == 1
    assert len(session.execute(select(Place)).scalars().all()) == 1


def test_photos_a_few_metres_apart_share_one_place(  # type: ignore[no-untyped-def]
    client, couple, session, monkeypatch
):
    first = ready_at(client, couple, session, monkeypatch, 0, 0)
    second = ready_at(client, couple, session, monkeypatch, 1, 1)  # about 30-45 m away
    memory = binding.memory(client, couple)
    assert attach(client, couple, memory, [first, second]).status_code == 200
    assert len(places(client, couple, memory["id"]).json()["items"]) == 1


def test_separate_entries_at_one_spot_reuse_the_same_place(  # type: ignore[no-untyped-def]
    client, couple, session, monkeypatch
):
    one = ready_at(client, couple, session, monkeypatch, 0, 0)
    memory_one = binding.memory(client, couple)
    assert attach(client, couple, memory_one, [one]).status_code == 200
    two = ready_at(client, couple, session, monkeypatch, 1, 0)
    memory_two = binding.memory(client, couple)
    assert attach(client, couple, memory_two, [two]).status_code == 200
    [first_place] = places(client, couple, memory_one["id"]).json()["items"]
    [second_place] = places(client, couple, memory_two["id"]).json()["items"]
    assert first_place["id"] == second_place["id"]
    assert len(session.execute(select(Place)).scalars().all()) == 1
    # Removing the association from one entry leaves the other one untouched.
    unlinked = client.delete(
        f"{binding.base_path(couple['space'].id)}/places/{first_place['id']}"
        f"/memories/{memory_one['id']}",
        headers=auth(couple["token_a"]),
    )
    assert unlinked.status_code == 204
    assert places(client, couple, memory_one["id"]).json()["items"] == []
    assert len(places(client, couple, memory_two["id"]).json()["items"]) == 1


def test_distant_photos_still_get_their_own_places(  # type: ignore[no-untyped-def]
    client, couple, session, monkeypatch
):
    here = ready_at(client, couple, session, monkeypatch, 0, 0)
    there = ready_at(client, couple, session, monkeypatch, 0, 0, latitude_minutes=32)  # ~1.8 km
    memory = binding.memory(client, couple)
    assert attach(client, couple, memory, [here, there]).status_code == 200
    assert len(places(client, couple, memory["id"]).json()["items"]) == 2
