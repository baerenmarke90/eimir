"""Actual canonical Place, authorization and queue integration on PostgreSQL."""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID

import pytest
from sqlalchemy import delete, select

from eimir.core.clock import now
from eimir.identity.models import Account
from eimir.jobs.errors import DeferredJobError, RetryableJobError
from eimir.jobs.models import Job
from eimir.places import photo_enrichment as enrichment
from eimir.places.models import Place
from eimir.providers.base import GeoPoint, PlaceCandidate
from eimir.providers.photon import GeocodingUnavailableError, PhotonReverseGeocoder
from eimir.relations.models import PlaceMemory
from eimir.relationship.models import Membership
from tests.conftest import requires_database
from tests.integration import test_attachment_binding as binding
from tests.integration.test_attachment_binding import couple as couple
from tests.integration.test_photo_locations import attach, places
from tests.integration.test_photo_locations import gps_photo as gps_photo

pytestmark = [pytest.mark.integration, requires_database]


@pytest.fixture
def pending_place(client, couple, session, gps_photo):  # type: ignore[no-untyped-def]
    photo = binding.ready_attachment(client, couple, session)
    memory = binding.memory(client, couple)
    assert attach(client, couple, memory, [photo]).status_code == 200
    place = places(client, couple, memory["id"]).json()["items"][0]
    job = session.execute(
        select(Job).where(
            Job.kind == enrichment.JOB_KIND,
            Job.payload["place_id"].astext == place["id"],
        )
    ).scalar_one()
    return memory, place, dict(job.payload)


@pytest.fixture
def lookup(monkeypatch):  # type: ignore[no-untyped-def]
    calls = []

    def reverse(self, position, language):  # type: ignore[no-untyped-def]
        calls.append((position, language))
        return PlaceCandidate(
            "", "Riverside cafe", "River Lane 12, Berlin", position, "openstreetmap"
        )

    monkeypatch.setattr(PhotonReverseGeocoder, "reverse", reverse)
    return calls


def test_new_place_is_enriched_in_place_with_version_and_source(
    client,
    couple,
    session,
    pending_place,
    lookup,
):  # type: ignore[no-untyped-def]
    memory, original, payload = pending_place
    assert set(payload) <= {
        "place_id",
        "owner_id",
        "space_id",
        "_correlation_id",
        "preference_version",
    }
    enrichment.enrich(session, payload)
    actual = places(client, couple, memory["id"], token_key="token_b").json()["items"][0]
    assert actual["id"] == original["id"] and actual["version"] == original["version"] + 1
    assert actual["name"] == "Riverside cafe" and actual["address"] == "River Lane 12, Berlin"
    assert actual["geocodingSource"] == "openstreetmap"
    assert (actual["latitude"], actual["longitude"]) == (52.516667, 13.4)
    owner = session.get(Account, UUID(payload["owner_id"]))
    assert lookup == [(GeoPoint(Decimal("52.516667"), Decimal("13.400000")), owner.locale)]
    assert (
        session.execute(
            select(PlaceMemory.photo_generated).where(
                PlaceMemory.place_id == UUID(actual["id"]),
            )
        ).scalar_one()
        is True
    )
    enrichment.enrich(session, payload)
    assert len(lookup) == 1


def test_old_place_repair_is_deduplicated_and_does_not_require_another_upload(
    session,
    pending_place,
    lookup,
):  # type: ignore[no-untyped-def]
    _, original, _payload = pending_place
    session.execute(delete(Job).where(Job.kind == enrichment.JOB_KIND))
    enrichment.ensure_scheduled(session)
    session.flush()
    enrichment.ensure_scheduled(session)
    jobs = session.execute(select(Job).where(Job.kind == enrichment.JOB_KIND)).scalars().all()
    assert len(jobs) == 1 and jobs[0].payload["place_id"] == original["id"]
    enrichment.enrich(session, dict(jobs[0].payload))
    assert len(lookup) == 1


@pytest.mark.parametrize(
    "change", ["manual", "unlink", "disabled", "left", "preference-revision", "space", "owner"]
)
def test_revoked_or_changed_state_prevents_both_egress_and_mutation(
    change,
    client,
    couple,
    session,
    pending_place,
    lookup,
):  # type: ignore[no-untyped-def]
    _, original, payload = pending_place
    if change == "manual":
        response = client.patch(
            f"{binding.base_path(couple['space'].id)}/places/{original['id']}",
            headers=binding.if_match(couple["token_a"], 1),
            json={"name": "Our own name", "address": "Our own address"},
        )
        assert response.status_code == 200
    elif change == "unlink":
        session.execute(delete(PlaceMemory).where(PlaceMemory.place_id == UUID(original["id"])))
    elif change == "disabled":
        account = session.get(Account, UUID(payload["owner_id"]))
        account.disabled_at = now()
    elif change == "left":
        member = session.execute(
            select(Membership).where(
                Membership.account_id == UUID(payload["owner_id"]),
                Membership.space_id == UUID(payload["space_id"]),
            )
        ).scalar_one()
        member.status = "LEFT"
    elif change == "preference-revision":
        account = session.get(Account, UUID(payload["owner_id"]))
        account.photo_locations_version += 1
    elif change == "space":
        payload["space_id"] = "00000000-0000-4000-8000-000000000000"
    else:
        payload["owner_id"] = "00000000-0000-4000-8000-000000000000"
    session.flush()
    enrichment.enrich(session, payload)
    assert lookup == []
    stored = session.get(Place, UUID(original["id"]))
    assert stored.payload.geocoding_source is None


def test_no_result_and_transport_failure_preserve_canonical_place(
    monkeypatch,
    session,
    pending_place,
):  # type: ignore[no-untyped-def]
    _, original, payload = pending_place
    monkeypatch.setattr(PhotonReverseGeocoder, "reverse", lambda *args: None)
    enrichment.enrich(session, payload)
    stored = session.get(Place, UUID(original["id"]))
    assert stored.version == 1 and stored.payload.address is None
    with pytest.raises(DeferredJobError):
        enrichment.enrich(session, payload)
    # Distinct transport error is handled by the normal durable queue backoff.
    monkeypatch.setattr(enrichment.rate_limit, "check", lambda *args: None)

    def fail(*args):  # type: ignore[no-untyped-def]
        raise GeocodingUnavailableError("PHOTO_GEOCODING_UNAVAILABLE")

    monkeypatch.setattr(PhotonReverseGeocoder, "reverse", fail)
    with pytest.raises(RetryableJobError, match=r"^PHOTO_GEOCODING_UNAVAILABLE$"):
        enrichment.enrich(session, payload)
    assert stored.version == 1 and stored.payload.address is None


def test_shared_heart_becoming_private_prevents_lookup(
    client,
    couple,
    session,
    gps_photo,
    lookup,
):  # type: ignore[no-untyped-def]
    from eimir.heart_moments.models import HeartMoment
    from eimir.relations.service import drop_shared_relations_of_heart_moment

    photo = binding.ready_attachment(client, couple, session)
    created = binding.heart_moment(client, couple, visibility="SHARED", attachment_id=photo)
    assert created.status_code == 201
    target = UUID(created.json()["id"])
    original = places(client, couple, str(target), "heart-moments").json()["items"][0]
    job = session.get(Job, UUID(original["id"]))
    assert job is not None
    heart = session.get(HeartMoment, target)
    drop_shared_relations_of_heart_moment(session, heart)
    heart.privacy_class = "OWNER_ONLY"
    session.flush()
    enrichment.enrich(session, dict(job.payload))
    assert lookup == []
    assert session.get(Place, UUID(original["id"])).payload.address is None


def test_existing_place_correction_wins_against_a_waiting_enrichment_job(
    production_client,
    lookup,
):  # type: ignore[no-untyped-def]
    import time
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event

    from eimir.attachments.photo_location_labels import initial_photo_place_name
    from eimir.places import service as place_service
    from eimir.relations import service as relation_service
    from tests.integration.test_place_relation_races import _setup

    world = _setup(production_client)
    maker, context = world["maker"], world["anna"]
    with maker.begin() as session:
        place = place_service.create_place(
            session,
            context,
            name=initial_photo_place_name("de"),
            description=None,
            address=None,
            latitude=52.516667,
            longitude=13.4,
        )
        relation_service.link(
            session,
            context,
            place.id,
            world["memory_id"],
            relation_service.PLACE_MEMORIES,
            automatic=True,
        )
        job = enrichment.schedule_place(session, place)
        payload, place_id = dict(job.payload), place.id
    started = Event()

    def process():  # type: ignore[no-untyped-def]
        with maker.begin() as session:
            started.set()
            enrichment.enrich(session, payload)

    with ThreadPoolExecutor(max_workers=1) as pool:
        with maker.begin() as correcting:
            place_service.update_place(
                correcting,
                context,
                place_id,
                expected_version=1,
                changed_fields=frozenset({"name", "address"}),
                name="Our selected venue",
                address="Our corrected address",
                description=None,
                latitude=None,
                longitude=None,
            )
            pending = pool.submit(process)
            assert started.wait(5)
            time.sleep(0.1)
            assert not pending.done()
        pending.result(timeout=10)
    assert lookup == []
    with maker() as session:
        saved = session.get(Place, place_id)
        assert saved.payload.name == "Our selected venue"
        assert saved.payload.address == "Our corrected address" and saved.version == 2


def _private_heart(client, couple, session, **extra):  # type: ignore[no-untyped-def]
    photo = binding.ready_attachment(client, couple, session)
    created = client.post(
        f"{binding.base_path(couple['space'].id)}/heart-moments",
        json={
            "text": "",
            "emotion": "LOVED",
            "visibility": "PRIVATE",
            "happenedOn": "2025-06-13",
            "attachments": [{"attachmentId": photo, "position": 0}],
            **extra,
        },
        headers=binding.auth(couple["token_a"]),
    )
    assert created.status_code == 201
    return created.json()


def test_private_heart_keeps_its_photo_location_to_itself(
    client, couple, session, gps_photo, lookup
):  # type: ignore[no-untyped-def]
    heart = _private_heart(client, couple, session)
    # The author's own protected location, never a shared Place.
    assert heart["location"]["latitude"] == 52.516667
    assert heart["location"]["longitude"] == 13.4
    assert heart["location"]["name"] in {"Photo location", "Foto-Ort"}
    assert session.execute(select(Place)).scalars().all() == []
    assert places(client, couple, heart["id"], "heart-moments").status_code == 404

    job = session.get(Job, UUID(heart["id"]))
    assert job is not None and job.kind == enrichment.PRIVATE_JOB_KIND
    assert set(job.payload) <= {
        "heart_moment_id",
        "owner_id",
        "space_id",
        "_correlation_id",
        "preference_version",
    }
    enrichment.enrich_private_location(session, dict(job.payload))
    read = client.get(
        f"{binding.base_path(couple['space'].id)}/heart-moments/{heart['id']}",
        headers=binding.auth(couple["token_a"]),
    ).json()
    assert read["location"]["name"] == "Riverside cafe"
    assert read["location"]["address"] == "River Lane 12, Berlin"
    assert (read["location"]["latitude"], read["location"]["longitude"]) == (52.516667, 13.4)
    assert session.execute(select(Place)).scalars().all() == []
    # A named location is no longer a placeholder: a repeated job looks nothing up.
    enrichment.enrich_private_location(session, dict(job.payload))
    assert len(lookup) == 1


def test_private_heart_keeps_a_location_the_author_chose(
    client, couple, session, gps_photo, lookup
):  # type: ignore[no-untyped-def]
    chosen = {"name": "Our bench", "address": None, "latitude": 1.5, "longitude": 2.5}
    heart = _private_heart(client, couple, session, location=chosen)
    assert heart["location"] == chosen
    assert session.get(Job, UUID(heart["id"])) is None
    assert lookup == []


def test_private_location_edited_before_the_job_is_never_overwritten(
    client, couple, session, gps_photo, lookup
):  # type: ignore[no-untyped-def]
    heart = _private_heart(client, couple, session)
    job = session.get(Job, UUID(heart["id"]))
    assert job is not None
    edited = client.patch(
        f"{binding.base_path(couple['space'].id)}/heart-moments/{heart['id']}",
        json={"location": {"name": "Grandma's garden", "latitude": 52.516667, "longitude": 13.4}},
        headers=binding.if_match(couple["token_a"], heart["version"]),
    )
    assert edited.status_code == 200
    enrichment.enrich_private_location(session, dict(job.payload))
    assert lookup == []
    read = client.get(
        f"{binding.base_path(couple['space'].id)}/heart-moments/{heart['id']}",
        headers=binding.auth(couple["token_a"]),
    ).json()
    assert read["location"]["name"] == "Grandma's garden"
