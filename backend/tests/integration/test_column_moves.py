"""Legacy plain columns move into protected payloads (issue #797).

A preference topic and a Place's coordinates used to live in ordinary columns.
New writes keep them in the payload; rows written earlier are moved by the
worker job or the operator command. These tests build such earlier rows the way
they exist in a database: value in the column, payload without it.
"""

from __future__ import annotations

import json
from datetime import date
from decimal import Decimal
from typing import Any
from uuid import UUID

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from eimir.authorization import PrivacyClass
from eimir.daily_checkins.models import DailyCheckIn
from eimir.domain.payload import CRYPTO_VERSION_PLAINTEXT, CRYPTO_VERSION_SERVER_AEAD
from eimir.identity.models import Account
from eimir.jobs.models import Job
from eimir.people.models import PersonRelationship, RelatedPerson, RelatedPersonPayload
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
    assert column_moves.pending(session) == {
        "accounts": 0,
        "daily_check_ins": 0,
        "places": 1,
        "profile_preferences": 1,
        "related_persons": 0,
    }


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
    assert column_moves.pending(session) == {
        "accounts": 0,
        "daily_check_ins": 0,
        "places": 0,
        "profile_preferences": 0,
        "related_persons": 0,
    }

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

    assert column_moves.pending(session) == {
        "accounts": 0,
        "daily_check_ins": 0,
        "places": 0,
        "profile_preferences": 0,
        "related_persons": 0,
    }
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


def _legacy_check_in(session: Session, space) -> DailyCheckIn:  # type: ignore[no-untyped-def]
    space_row, account = space
    check_in = DailyCheckIn(
        space_id=space_row.id,
        account_id=account.id,
        checked_on=date(2026, 11, 16),
        legacy_vibe="NEEDS_CONNECTION",
        legacy_energy_level=30,
    )
    session.add(check_in)
    session.flush()
    return check_in


@pytest.mark.parametrize("mode", ["disabled", "required"])
def test_check_in_values_move_into_a_payload_the_table_did_not_have(
    session: Session, space, encryption, mode: str
) -> None:  # type: ignore[no-untyped-def]
    encryption.apply(mode)
    check_in = _legacy_check_in(session, space)
    session.expire_all()
    # Before the move: no payload yet, the values still read from the columns.
    assert check_in.payload is None
    assert (check_in.vibe, check_in.energy_level) == ("NEEDS_CONNECTION", 30)
    before = _raw(session, "daily_check_ins", check_in.id, "version, updated_at")

    results = column_moves.move_columns(session, get_payload_protector())

    assert results["daily_check_ins"].converted == 1
    vibe, energy, stored, version = _raw(
        session, "daily_check_ins", check_in.id, "vibe, energy_level, payload::text, crypto_version"
    )
    assert (vibe, energy) == (None, None)
    if mode == "required":
        assert json.loads(stored)["_enc"] == CRYPTO_VERSION_SERVER_AEAD
        assert version == CRYPTO_VERSION_SERVER_AEAD
        assert "NEEDS_CONNECTION" not in stored
    assert _raw(session, "daily_check_ins", check_in.id, "version, updated_at") == before

    session.expire_all()
    assert (check_in.vibe, check_in.energy_level) == ("NEEDS_CONNECTION", 30)
    assert column_moves.pending(session)["daily_check_ins"] == 0


def test_new_check_in_keeps_its_values_out_of_the_plain_columns(
    session: Session, space, encryption
) -> None:  # type: ignore[no-untyped-def]
    encryption.apply("required")
    space_row, account = space
    check_in = DailyCheckIn(
        space_id=space_row.id,
        account_id=account.id,
        checked_on=date(2026, 11, 15),
        vibe="SAD",
        energy_level=20,
    )
    session.add(check_in)
    session.flush()

    vibe, energy, stored = _raw(
        session, "daily_check_ins", check_in.id, "vibe, energy_level, payload::text"
    )
    assert (vibe, energy) == (None, None)
    assert "SAD" not in stored
    session.expire_all()
    assert (check_in.vibe, check_in.energy_level) == ("SAD", 20)

    check_in.set_values(vibe=None, energy_level=60)
    session.flush()
    session.expire_all()
    assert (check_in.vibe, check_in.energy_level) == (None, 60)


@pytest.mark.parametrize("mode", ["disabled", "required"])
def test_account_name_moves_into_a_payload_the_table_did_not_have(
    session: Session, encryption, mode: str
) -> None:  # type: ignore[no-untyped-def]
    encryption.apply(mode)
    account = Account(legacy_display_name="Marlene Before The Move")
    session.add(account)
    session.flush()
    session.expire_all()
    # Before the move: no payload yet, the name still reads from the column.
    assert account.payload is None
    assert account.display_name == "Marlene Before The Move"
    before = _raw(session, "accounts", account.id, "version, updated_at")

    results = column_moves.move_columns(session, get_payload_protector())

    assert results["accounts"].converted == 1
    name, stored, version = _raw(
        session, "accounts", account.id, "display_name, payload::text, crypto_version"
    )
    assert name is None
    if mode == "required":
        assert json.loads(stored)["_enc"] == CRYPTO_VERSION_SERVER_AEAD
        assert version == CRYPTO_VERSION_SERVER_AEAD
        assert "Marlene" not in stored
    assert _raw(session, "accounts", account.id, "version, updated_at") == before
    session.expire_all()
    assert account.display_name == "Marlene Before The Move"


def test_new_and_renamed_accounts_keep_the_name_out_of_the_plain_column(
    session: Session, encryption
) -> None:  # type: ignore[no-untyped-def]
    encryption.apply("required")
    account = Account(display_name="Jonah New")
    session.add(account)
    session.flush()

    name, stored = _raw(session, "accounts", account.id, "display_name, payload::text")
    assert name is None
    assert "Jonah" not in stored

    account.display_name = "Jonah Renamed"
    session.flush()
    name, stored = _raw(session, "accounts", account.id, "display_name, payload::text")
    assert name is None
    assert "Renamed" not in stored
    session.expire_all()
    assert account.display_name == "Jonah Renamed"


BIRTHDAY = date(1988, 3, 14)


def _legacy_person(session: Session, space, *, flagged: bool) -> RelatedPerson:  # type: ignore[no-untyped-def]
    """A person whose birthday is still in its column.

    ``flagged`` is a row the migration visited; unflagged is one that arrived
    later with the old shape, such as from an older Transfer Bundle.
    """
    space_row, account = space
    person = RelatedPerson(
        space_id=space_row.id,
        owner_id=account.id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        relationship=PersonRelationship.FRIEND.value,
        legacy_birthday=BIRTHDAY,
        has_birthday=flagged,
        birthday_year_known=True,
        show_birthday_on_dashboard=True,
        payload=RelatedPersonPayload(display_name="Column Lisa"),
    )
    session.add(person)
    session.flush()
    return person


@pytest.mark.parametrize("mode", ["disabled", "required"])
@pytest.mark.parametrize("flagged", [True, False])
def test_person_birthday_moves_into_the_payload(
    session: Session, space, encryption, mode: str, flagged: bool
) -> None:  # type: ignore[no-untyped-def]
    encryption.apply(mode)
    person = _legacy_person(session, space, flagged=flagged)
    session.expire_all()
    # Before the move: the date still reads from the column and SQL still finds it.
    assert person.birthday == BIRTHDAY
    found = session.execute(select(RelatedPerson.id).where(RelatedPerson.with_birthday())).scalars()
    assert person.id in set(found)
    assert column_moves.pending(session)["related_persons"] == 1
    before = _raw(session, "related_persons", person.id, "version, updated_at")

    results = column_moves.move_columns(session, get_payload_protector())

    assert results["related_persons"].converted == 1
    column, has_birthday, stored, version = _raw(
        session,
        "related_persons",
        person.id,
        "birthday, has_birthday, payload::text, crypto_version",
    )
    assert column is None
    assert has_birthday is True
    if mode == "required":
        assert json.loads(stored)["_enc"] == CRYPTO_VERSION_SERVER_AEAD
        assert version == CRYPTO_VERSION_SERVER_AEAD
        assert "1988" not in stored
        assert "Lisa" not in stored
    assert _raw(session, "related_persons", person.id, "version, updated_at") == before
    session.expire_all()
    assert person.birthday == BIRTHDAY
    assert person.payload.display_name == "Column Lisa"
    found = session.execute(select(RelatedPerson.id).where(RelatedPerson.with_birthday())).scalars()
    assert person.id in set(found)
    assert column_moves.pending(session)["related_persons"] == 0


def test_new_and_changed_person_birthdays_stay_out_of_the_plain_column(
    session: Session, space, encryption
) -> None:  # type: ignore[no-untyped-def]
    encryption.apply("required")
    space_row, account = space
    person = RelatedPerson(
        space_id=space_row.id,
        owner_id=account.id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        relationship=PersonRelationship.FRIEND.value,
        birthday=BIRTHDAY,
        birthday_year_known=True,
        payload=RelatedPersonPayload(display_name="Column Jonah"),
    )
    session.add(person)
    session.flush()

    column, has_birthday, stored = _raw(
        session, "related_persons", person.id, "birthday, has_birthday, payload::text"
    )
    assert (column, has_birthday) == (None, True)
    assert "1988" not in stored

    person.birthday = None
    person.birthday_year_known = False
    session.flush()
    assert _raw(session, "related_persons", person.id, "birthday, has_birthday") == (None, False)
    session.expire_all()
    assert person.birthday is None


def test_the_database_still_refuses_a_known_year_without_a_birthday(
    session: Session, space
) -> None:  # type: ignore[no-untyped-def]
    space_row, account = space
    person = RelatedPerson(
        space_id=space_row.id,
        owner_id=account.id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        relationship=PersonRelationship.FRIEND.value,
        birthday_year_known=True,
        payload=RelatedPersonPayload(display_name="Column Mara"),
    )
    with pytest.raises(IntegrityError), session.begin_nested():
        session.add(person)
        session.flush()


@pytest.mark.parametrize("mode", ["disabled", "required"])
def test_account_birthday_joins_the_name_in_the_payload(
    session: Session, encryption, mode: str
) -> None:  # type: ignore[no-untyped-def]
    encryption.apply(mode)
    # A name that already moved (the release before this one) and a birthday
    # that has not; and a row that has neither moved yet.
    named = Account(display_name="Marlene Already Named")
    named.legacy_birthday = BIRTHDAY
    untouched = Account(legacy_display_name="Jonah Untouched")
    untouched.legacy_birthday = BIRTHDAY
    without = Account(legacy_display_name="Mara Without A Birthday")
    session.add_all([named, untouched, without])
    session.flush()
    session.expire_all()
    assert named.birthday == BIRTHDAY
    assert untouched.birthday == BIRTHDAY
    assert (untouched.display_name, without.birthday) == ("Jonah Untouched", None)
    before = _raw(session, "accounts", named.id, "version, updated_at")

    results = column_moves.move_columns(session, get_payload_protector())

    assert results["accounts"].converted == 3
    for account, name in ((named, "Marlene Already Named"), (untouched, "Jonah Untouched")):
        row = _raw(
            session, "accounts", account.id, "display_name, birthday, has_birthday, payload::text"
        )
        assert row[:3] == (None, None, True)
        if mode == "required":
            assert "1988" not in row[3]
            assert name.split()[0] not in row[3]
    # The flag follows the birthday, not the move.
    assert _raw(session, "accounts", without.id, "birthday, has_birthday") == (None, False)
    assert _raw(session, "accounts", named.id, "version, updated_at") == before
    session.expire_all()
    assert (named.display_name, named.birthday) == ("Marlene Already Named", BIRTHDAY)
    assert (untouched.display_name, untouched.birthday) == ("Jonah Untouched", BIRTHDAY)
    assert (without.display_name, without.birthday) == ("Mara Without A Birthday", None)
    found = set(session.execute(select(Account.id).where(Account.with_birthday())).scalars())
    assert {named.id, untouched.id} <= found
    assert without.id not in found


def test_account_name_and_birthday_writes_never_lose_each_other(
    session: Session, encryption
) -> None:  # type: ignore[no-untyped-def]
    encryption.apply("required")
    account = Account(display_name="Jonah New", birthday=BIRTHDAY)
    session.add(account)
    session.flush()
    row = _raw(
        session, "accounts", account.id, "display_name, birthday, has_birthday, payload::text"
    )
    assert row[:3] == (None, None, True)
    assert "1988" not in row[3]

    account.display_name = "Jonah Renamed"
    session.flush()
    session.expire_all()
    assert (account.display_name, account.birthday) == ("Jonah Renamed", BIRTHDAY)

    account.birthday = None
    session.flush()
    session.expire_all()
    assert (account.display_name, account.birthday) == ("Jonah Renamed", None)
    assert _raw(session, "accounts", account.id, "birthday, has_birthday") == (None, False)

    # A legacy row that is renamed takes its birthday along instead of leaving it
    # behind in the column.
    legacy = Account(legacy_display_name="Mara Legacy")
    legacy.legacy_birthday = BIRTHDAY
    session.add(legacy)
    session.flush()
    legacy.display_name = "Mara Renamed"
    session.flush()
    session.expire_all()
    assert (legacy.display_name, legacy.birthday) == ("Mara Renamed", BIRTHDAY)
    assert _raw(session, "accounts", legacy.id, "display_name, birthday, has_birthday") == (
        None,
        None,
        True,
    )
