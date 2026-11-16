"""Legacy plain columns move into protected payloads (issue #797).

A preference topic and a Place's coordinates used to live in ordinary columns.
New writes keep them in the payload; rows written earlier are moved by the
worker job or the operator command. These tests build such earlier rows the way
they exist in a database: value in the column, payload without it.
"""

from __future__ import annotations

import json
from decimal import Decimal
from typing import Any
from uuid import UUID

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from eimir.authorization import PrivacyClass
from eimir.domain.payload import CRYPTO_VERSION_PLAINTEXT, CRYPTO_VERSION_SERVER_AEAD
from eimir.jobs.models import Job
from eimir.places.models import Place, PlacePayload
from eimir.profiles import service as profile_service
from eimir.profiles.models import (
    PreferenceCategory,
    PreferenceSentiment,
    ProfilePreference,
    ProfilePreferencePayload,
    ProfileVisibility,
)
from eimir.security import column_moves, lifecycle
from eimir.security.runtime import get_payload_protector
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]

LATITUDE = Decimal("53.550000")
LONGITUDE = Decimal("9.990000")
TOPIC = "Favourite food on rainy days"


@pytest.fixture
def space(session: Session):  # type: ignore[no-untyped-def]
    account = make_account(session, "Column Anna")
    return make_space(session, account), account


def _legacy_place(session: Session, space, **payload: Any) -> Place:  # type: ignore[no-untyped-def]
    space_row, account = space
    place = Place(
        space_id=space_row.id,
        owner_id=account.id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        legacy_latitude=LATITUDE,
        legacy_longitude=LONGITUDE,
        has_coordinates=True,
        payload=PlacePayload(name="Harbour", **payload),
    )
    session.add(place)
    session.flush()
    return place


def _legacy_preference(session: Session, space) -> ProfilePreference:  # type: ignore[no-untyped-def]
    space_row, account = space
    profile = profile_service.ensure_profile(session, space_row.id, account.id)
    preference = ProfilePreference(
        space_id=space_row.id,
        owner_id=account.id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        profile_id=profile.id,
        account_id=account.id,
        category=PreferenceCategory.FOOD.value,
        legacy_topic=TOPIC,
        sentiment=PreferenceSentiment.LOVE.value,
        visibility=ProfileVisibility.SELF_PROFILE.value,
        payload=ProfilePreferencePayload(value="Soup"),
    )
    session.add(preference)
    session.flush()
    return preference


def _raw(session: Session, table: str, row_id: UUID, columns: str) -> Any:
    return session.execute(
        text(f"SELECT {columns} FROM {table} WHERE id = :id"), {"id": row_id}
    ).one()


def test_values_in_legacy_columns_stay_readable_until_they_are_moved(
    session: Session, space
) -> None:  # type: ignore[no-untyped-def]
    place = _legacy_place(session, space)
    preference = _legacy_preference(session, space)
    session.expire_all()

    assert (place.latitude, place.longitude) == (LATITUDE, LONGITUDE)
    assert preference.topic == TOPIC
    assert column_moves.pending(session) == {"places": 1, "profile_preferences": 1}


@pytest.mark.parametrize("mode", ["disabled", "required"])
def test_move_takes_the_values_into_the_payload_and_clears_the_columns(
    session: Session, space, encryption, mode: str
) -> None:  # type: ignore[no-untyped-def]
    encryption.apply(mode)
    place = _legacy_place(session, space)
    preference = _legacy_preference(session, space)
    place_before = _raw(session, "places", place.id, "version, updated_at")
    preference_before = _raw(session, "profile_preferences", preference.id, "version, updated_at")

    results = column_moves.move_columns(session, get_payload_protector())

    assert results["places"].converted == 1
    assert results["profile_preferences"].converted == 1
    assert column_moves.pending(session) == {"places": 0, "profile_preferences": 0}

    latitude, longitude, has_coordinates, stored, version = _raw(
        session,
        "places",
        place.id,
        "latitude, longitude, has_coordinates, payload::text, crypto_version",
    )
    assert (latitude, longitude, has_coordinates) == (None, None, True)
    topic, stored_preference, preference_version = _raw(
        session, "profile_preferences", preference.id, "topic, payload::text, crypto_version"
    )
    assert topic is None
    expected_version = (
        CRYPTO_VERSION_SERVER_AEAD if mode == "required" else CRYPTO_VERSION_PLAINTEXT
    )
    assert (version, preference_version) == (expected_version, expected_version)
    if mode == "required":
        # Nothing a dump could show: an envelope, no coordinate, no topic text.
        assert json.loads(stored)["_enc"] == CRYPTO_VERSION_SERVER_AEAD
        assert "53.55" not in stored
        assert "rainy" not in stored_preference

    # A person changed nothing, so neither the version nor the change time moves.
    assert _raw(session, "places", place.id, "version, updated_at") == place_before
    assert (
        _raw(session, "profile_preferences", preference.id, "version, updated_at")
        == preference_before
    )

    session.expire_all()
    assert (place.latitude, place.longitude) == (LATITUDE, LONGITUDE)
    assert place.payload.name == "Harbour"
    assert preference.topic == TOPIC
    assert preference.payload.value == "Soup"

    again = column_moves.move_columns(session, get_payload_protector())
    assert again["places"].converted == 0
    assert again["profile_preferences"].converted == 0


def test_value_already_in_the_payload_wins_over_a_stale_column(session: Session, space) -> None:  # type: ignore[no-untyped-def]
    newer = (Decimal("48.137000"), Decimal("11.575000"))
    place = _legacy_place(session, space, latitude=newer[0], longitude=newer[1])

    column_moves.move_columns(session, get_payload_protector())

    session.expire_all()
    assert (place.latitude, place.longitude) == newer
    assert (place.legacy_latitude, place.legacy_longitude) == (None, None)


def test_concurrent_application_write_is_not_overwritten(session: Session, space) -> None:  # type: ignore[no-untyped-def]
    place = _legacy_place(session, space)
    protector = get_payload_protector()

    class WritingMeanwhile:
        """Stands in for an application write that lands while a row is converted."""

        mode = protector.mode
        write_crypto_version = protector.write_crypto_version
        reveal = staticmethod(protector.reveal)

        def protect(self, plain: dict[str, Any], *, context: str) -> dict[str, Any]:
            session.execute(
                text(
                    "UPDATE places SET payload = "
                    "jsonb_set(payload, '{name}', to_jsonb(CAST(:name AS text))) WHERE id = :id"
                ),
                {"id": place.id, "name": "Renamed"},
            )
            return protector.protect(plain, context=context)

    results = column_moves.move_columns(session, WritingMeanwhile())  # type: ignore[arg-type]

    assert results["places"].converted == 0
    assert results["places"].skipped_concurrent == 1
    name, latitude = _raw(session, "places", place.id, "payload->>'name', latitude")
    assert (name, latitude) == ("Renamed", LATITUDE)


def test_worker_job_is_queued_only_while_values_remain(session: Session, space) -> None:  # type: ignore[no-untyped-def]
    def queued() -> int:
        return int(
            session.execute(
                select(func.count()).select_from(Job).where(Job.kind == column_moves.JOB_KIND)
            ).scalar_one()
        )

    assert column_moves.ensure_scheduled(session) is None

    place = _legacy_place(session, space)
    column_moves.handle_moves(session, {})

    assert column_moves.pending(session) == {"places": 0, "profile_preferences": 0}
    session.expire_all()
    assert place.latitude == LATITUDE
    # Nothing is left, so the job neither continues nor waits for a retry.
    assert queued() == 0
    assert column_moves.ensure_scheduled(session) is None

    _legacy_place(session, space)
    assert column_moves.ensure_scheduled(session) is not None
    # One queued job is enough; a second check must not add another.
    assert column_moves.ensure_scheduled(session) is None
    assert queued() == 1


def test_raw_audit_fails_while_a_legacy_column_still_holds_a_value() -> None:
    report = lifecycle.RawAuditReport()
    assert report.ok
    report.plaintext_columns["places"] = 1
    assert not report.ok


def test_position_only_in_the_legacy_columns_still_counts_as_located(
    session: Session, space
) -> None:  # type: ignore[no-untyped-def]
    # The shape an older Transfer Bundle imports: columns set, flag at its default.
    place = _legacy_place(session, space)
    session.execute(
        text("UPDATE places SET has_coordinates = FALSE WHERE id = :id"), {"id": place.id}
    )

    located = session.execute(select(Place.id).where(Place.located())).scalars().all()

    assert place.id in located
    column_moves.move_columns(session, get_payload_protector())
    assert _raw(session, "places", place.id, "has_coordinates, latitude") == (True, None)
