"""Read and write a Space relationship profile without losing updates.

Three properties are proven here over HTTP:

1. A write requires the version that the caller read. If it is stale, the
   server returns 409 instead of silently overwriting newer data.
2. Two concurrent writes cannot overtake each other: exactly one wins and the
   other is informed about the conflict.
3. The visible relationship duration changes at midnight where the reader is,
   not at midnight UTC.

The tests use HTTP with real tokens. Calling the service directly would skip
exactly the path where an authorization or validation check could be forgotten.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime
from threading import Barrier
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.core.ids import new_id
from eimir.relationship import service
from eimir.relationship.models import SpaceProfile
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


def profile_path(space_id: object) -> str:
    return f"/api/v1/spaces/{space_id}/profile"


def body(
    *,
    started_on: str | None = "2022-05-17",
    show: bool = True,
    mode: str = "YEARS_MONTHS",
) -> dict[str, Any]:
    return {
        "relationshipStartedOn": started_on,
        "showRelationshipDuration": show,
        "durationDisplayMode": mode,
    }


def if_match(version: object) -> dict[str, str]:
    return {"If-Match": f'"{version}"'}


@pytest.fixture
def pair(session: Session):  # type: ignore[no-untyped-def]
    """Two partners in one Space and an outsider with a separate Space."""
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    outsider = make_account(session, "Fremde Person")

    space = make_space(session, anna)
    service.add_member(session, space.id, ben)
    outsider_space = make_space(session, outsider)
    session.flush()

    return {
        "space": space,
        "outsider_space": outsider_space,
        "token_a": sign_in(session, anna),
        "token_b": sign_in(session, ben),
        "outsider_token": sign_in(session, outsider),
        "anna": anna,
        "ben": ben,
    }


def stored_profile(session: Session, space_id: object) -> SpaceProfile:
    profile = session.execute(
        select(SpaceProfile).where(SpaceProfile.space_id == space_id)
    ).scalar_one()
    session.refresh(profile)
    return profile


class TestRead:
    def test_new_space_has_profile_with_defaults(self, client, pair) -> None:  # type: ignore[no-untyped-def]
        response = client.get(profile_path(pair["space"].id), headers=auth(pair["token_a"]))
        assert response.status_code == 200
        assert response.json() == {
            "spaceId": str(pair["space"].id),
            "version": 1,
            "relationshipStartedOn": None,
            "showRelationshipDuration": True,
            "durationDisplayMode": "YEARS_MONTHS",
            "relationshipDays": None,
            "relationshipYears": None,
            "relationshipMonths": None,
        }

    def test_version_is_also_exposed_as_etag(self, client, pair) -> None:  # type: ignore[no-untyped-def]
        """The ETag lets a client write without extracting the body version."""
        response = client.get(profile_path(pair["space"].id), headers=auth(pair["token_a"]))
        assert response.headers["ETag"] == '"1"'

    def test_both_partners_see_same_profile(self, client, pair) -> None:  # type: ignore[no-untyped-def]
        from_a = client.get(profile_path(pair["space"].id), headers=auth(pair["token_a"]))
        from_b = client.get(profile_path(pair["space"].id), headers=auth(pair["token_b"]))
        assert from_a.json() == from_b.json()


class TestWrite:
    def test_successful_update(self, client, session, pair) -> None:  # type: ignore[no-untyped-def]
        response = client.put(
            profile_path(pair["space"].id),
            json=body(started_on="2022-05-17", show=True, mode="DAYS"),
            headers={**auth(pair["token_a"]), **if_match(1)},
        )

        assert response.status_code == 200
        response_body = response.json()
        assert response_body["relationshipStartedOn"] == "2022-05-17"
        assert response_body["showRelationshipDuration"] is True
        assert response_body["durationDisplayMode"] == "DAYS"
        assert response_body["version"] == 2
        assert response.headers["ETag"] == '"2"'

        stored = stored_profile(session, pair["space"].id)
        assert stored.relationship_started_on == date(2022, 5, 17)
        assert stored.duration_display_mode == "DAYS"
        assert stored.version == 2

    def test_next_read_shows_new_state(self, client, pair) -> None:  # type: ignore[no-untyped-def]
        client.put(
            profile_path(pair["space"].id),
            json=body(started_on="2022-05-17"),
            headers={**auth(pair["token_a"]), **if_match(1)},
        )
        retrieved = client.get(profile_path(pair["space"].id), headers=auth(pair["token_a"]))
        assert retrieved.json()["relationshipStartedOn"] == "2022-05-17"
        assert retrieved.json()["version"] == 2

    def test_partner_may_write(self, client, pair) -> None:  # type: ignore[no-untyped-def]
        """The profile belongs to the Space, not to the person who created it."""
        response = client.put(
            profile_path(pair["space"].id),
            json=body(started_on="2020-01-01"),
            headers={**auth(pair["token_b"]), **if_match(1)},
        )
        assert response.status_code == 200

    def test_sequential_updates_use_latest_version(self, client, pair) -> None:  # type: ignore[no-untyped-def]
        first = client.put(
            profile_path(pair["space"].id),
            json=body(started_on="2022-05-17"),
            headers={**auth(pair["token_a"]), **if_match(1)},
        )
        second = client.put(
            profile_path(pair["space"].id),
            json=body(started_on="2021-04-16"),
            headers={**auth(pair["token_b"]), **if_match(first.json()["version"])},
        )
        assert second.status_code == 200
        assert second.json()["version"] == 3
        assert second.json()["relationshipStartedOn"] == "2021-04-16"

    def test_null_clears_relationship_start(self, client, session, pair) -> None:  # type: ignore[no-untyped-def]
        client.put(
            profile_path(pair["space"].id),
            json=body(started_on="2022-05-17"),
            headers={**auth(pair["token_a"]), **if_match(1)},
        )
        cleared = client.put(
            profile_path(pair["space"].id),
            json=body(started_on=None),
            headers={**auth(pair["token_a"]), **if_match(2)},
        )
        assert cleared.status_code == 200
        assert cleared.json()["relationshipStartedOn"] is None
        assert stored_profile(session, pair["space"].id).relationship_started_on is None

    def test_disabled_display_omits_duration(self, client, pair) -> None:  # type: ignore[no-untyped-def]
        """Duration values hidden by the client should not be transmitted."""
        response = client.put(
            profile_path(pair["space"].id),
            json=body(started_on="2022-05-17", show=False),
            headers={**auth(pair["token_a"]), **if_match(1)},
        )
        response_body = response.json()
        assert response_body["showRelationshipDuration"] is False
        assert response_body["relationshipDays"] is None
        assert response_body["relationshipYears"] is None
        assert response_body["relationshipMonths"] is None

    def test_unchanged_write_does_not_increment_version(self, client, pair) -> None:  # type: ignore[no-untyped-def]
        """Without a change there is no update and therefore no new version."""
        first = client.put(
            profile_path(pair["space"].id),
            json=body(started_on="2022-05-17"),
            headers={**auth(pair["token_a"]), **if_match(1)},
        )
        second = client.put(
            profile_path(pair["space"].id),
            json=body(started_on="2022-05-17"),
            headers={**auth(pair["token_a"]), **if_match(2)},
        )
        assert first.json()["version"] == second.json()["version"] == 2


class TestVersionConflict:
    def test_stale_version_returns_409(self, client, pair) -> None:  # type: ignore[no-untyped-def]
        client.put(
            profile_path(pair["space"].id),
            json=body(started_on="2022-05-17"),
            headers={**auth(pair["token_a"]), **if_match(1)},
        )

        stale = client.put(
            profile_path(pair["space"].id),
            json=body(started_on="1999-01-01"),
            headers={**auth(pair["token_b"]), **if_match(1)},
        )

        assert stale.status_code == 409
        assert stale.json() == {
            "type": "conflict",
            "title": "Conflict",
            "status": 409,
            "detail": "The space profile was changed by someone else.",
            "code": "VERSION_CONFLICT",
        }

    def test_conflict_changes_nothing(self, client, session, pair) -> None:  # type: ignore[no-untyped-def]
        client.put(
            profile_path(pair["space"].id),
            json=body(started_on="2022-05-17"),
            headers={**auth(pair["token_a"]), **if_match(1)},
        )
        client.put(
            profile_path(pair["space"].id),
            json=body(started_on="1999-01-01", mode="DAYS"),
            headers={**auth(pair["token_b"]), **if_match(1)},
        )

        stored = stored_profile(session, pair["space"].id)
        assert stored.relationship_started_on == date(2022, 5, 17)
        assert stored.duration_display_mode == "YEARS_MONTHS"
        assert stored.version == 2

    def test_too_high_version_also_returns_409(self, client, pair) -> None:  # type: ignore[no-untyped-def]
        response = client.put(
            profile_path(pair["space"].id),
            json=body(),
            headers={**auth(pair["token_a"]), **if_match(99)},
        )
        assert response.status_code == 409

    def test_write_without_if_match_is_rejected(self, client, session, pair) -> None:  # type: ignore[no-untyped-def]
        """The header is mandatory in both the contract and behavior.

        Without it, a client could accidentally disable conflict protection.
        """
        response = client.put(
            profile_path(pair["space"].id),
            json=body(started_on="1999-01-01"),
            headers=auth(pair["token_a"]),
        )
        assert response.status_code == 422
        assert response.json()["code"] == "VALIDATION_FAILED"
        assert "if-match" in response.json()["detail"].lower()
        assert stored_profile(session, pair["space"].id).relationship_started_on is None

    @pytest.mark.parametrize(
        "value",
        ["*", 'W/"1"', "abc", "1.0", "-1", '"1", "2"', '""', " ", "1 2"],
    )
    def test_unusable_if_match_is_rejected(self, client, pair, value: str) -> None:  # type: ignore[no-untyped-def]
        """`*` and weak validators would disable conflict protection."""
        response = client.put(
            profile_path(pair["space"].id),
            json=body(),
            headers={**auth(pair["token_a"]), "If-Match": value},
        )
        assert response.status_code == 422
        assert response.json()["code"] == "IF_MATCH_MALFORMED"

    def test_unquoted_if_match_is_accepted(self, client, pair) -> None:  # type: ignore[no-untyped-def]
        """Both quoted and unquoted forms occur in real clients."""
        response = client.put(
            profile_path(pair["space"].id),
            json=body(),
            headers={**auth(pair["token_a"]), "If-Match": "1"},
        )
        assert response.status_code == 200


class TestRace:
    def test_concurrent_updates_do_not_overwrite_each_other(self, production_client) -> None:  # type: ignore[no-untyped-def]
        """No lost update: exactly one wins and the other receives 409."""
        client, maker = production_client
        with maker() as setup:
            anna = make_account(setup, "Anna Wettlauf")
            space = make_space(setup, anna)
            ben = make_account(setup, "Ben Wettlauf")
            service.add_member(setup, space.id, ben)
            token_a = sign_in(setup, anna)
            token_b = sign_in(setup, ben)
            space_id = space.id
            setup.commit()

        start = Barrier(2)

        def write(data: tuple[str, str]):  # type: ignore[no-untyped-def]
            token, started_on = data
            start.wait(timeout=5)
            return client.put(
                profile_path(space_id),
                json=body(started_on=started_on),
                headers={**auth(token), **if_match(1)},
            )

        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(write, [(token_a, "2022-05-17"), (token_b, "2019-09-08")]))

        assert sorted(response.status_code for response in responses) == [200, 409]

        winner = next(response for response in responses if response.status_code == 200)
        loser = next(response for response in responses if response.status_code == 409)
        assert loser.json()["code"] == "VERSION_CONFLICT"

        with maker() as verifier:
            stored = verifier.execute(
                select(SpaceProfile).where(SpaceProfile.space_id == space_id)
            ).scalar_one()
            # Exactly one change arrived. If the second had silently succeeded,
            # the version would be 3 or the stored value would differ.
            assert stored.version == 2
            assert stored.relationship_started_on is not None
            assert (
                stored.relationship_started_on.isoformat() == winner.json()["relationshipStartedOn"]
            )


class TestValidation:
    def test_future_start_is_rejected(self, client, pair) -> None:  # type: ignore[no-untyped-def]
        response = client.put(
            profile_path(pair["space"].id),
            json=body(started_on="2099-01-01"),
            headers={**auth(pair["token_a"]), **if_match(1)},
        )
        assert response.status_code == 422
        assert response.json()["code"] == "RELATIONSHIP_START_IN_FUTURE"

    def test_mistyped_year_is_rejected(self, client, pair) -> None:  # type: ignore[no-untyped-def]
        response = client.put(
            profile_path(pair["space"].id),
            json=body(started_on="0202-05-17"),
            headers={**auth(pair["token_a"]), **if_match(1)},
        )
        assert response.status_code == 422
        assert response.json()["code"] == "RELATIONSHIP_START_TOO_EARLY"

    @pytest.mark.parametrize(
        "request_body",
        [
            {"relationshipStartedOn": None, "showRelationshipDuration": True},
            {"relationshipStartedOn": None, "durationDisplayMode": "DAYS"},
            {"showRelationshipDuration": True, "durationDisplayMode": "DAYS"},
        ],
    )
    def test_incomplete_body_is_rejected(self, client, pair, request_body) -> None:  # type: ignore[no-untyped-def]
        """PUT replaces fully; an omitted field cannot mean clear the field."""
        response = client.put(
            profile_path(pair["space"].id),
            json=request_body,
            headers={**auth(pair["token_a"]), **if_match(1)},
        )
        assert response.status_code == 422

    @pytest.mark.parametrize("mode", ["MONTHS", "years_months", "", "DAYS "])
    def test_unknown_display_mode_is_rejected(self, client, pair, mode: str) -> None:  # type: ignore[no-untyped-def]
        response = client.put(
            profile_path(pair["space"].id),
            json=body(mode=mode),
            headers={**auth(pair["token_a"]), **if_match(1)},
        )
        assert response.status_code == 422
        assert response.json()["code"] == "VALIDATION_FAILED"

    @pytest.mark.parametrize(
        "started_on", ["2022-13-40", "17.05.2022", "2022-05-17T10:00:00Z", "heute"]
    )
    def test_unusable_date_is_rejected(self, client, pair, started_on: str) -> None:  # type: ignore[no-untyped-def]
        response = client.put(
            profile_path(pair["space"].id),
            json=body(started_on=started_on),
            headers={**auth(pair["token_a"]), **if_match(1)},
        )
        assert response.status_code == 422


class TestForeignAccess:
    def test_outsider_cannot_read_profile(self, client, pair) -> None:  # type: ignore[no-untyped-def]
        response = client.get(profile_path(pair["space"].id), headers=auth(pair["outsider_token"]))
        assert response.status_code == 404
        assert response.json()["code"] == "SPACE_NOT_FOUND"

    def test_outsider_cannot_write_profile(self, client, session, pair) -> None:  # type: ignore[no-untyped-def]
        response = client.put(
            profile_path(pair["space"].id),
            json=body(started_on="1999-01-01"),
            headers={**auth(pair["outsider_token"]), **if_match(1)},
        )
        assert response.status_code == 404
        assert response.json()["code"] == "SPACE_NOT_FOUND"
        assert stored_profile(session, pair["space"].id).relationship_started_on is None

    def test_membership_guard_precedes_every_other_check(self, client, pair) -> None:  # type: ignore[no-untyped-def]
        """A 422 for missing If-Match would reveal that the Space exists."""
        response = client.put(
            profile_path(pair["space"].id),
            json={"unsinn": True},
            headers=auth(pair["outsider_token"]),
        )
        assert response.status_code == 404

    def test_foreign_space_is_indistinguishable_from_nonexistent_one(self, client, pair) -> None:  # type: ignore[no-untyped-def]
        existing = client.get(profile_path(pair["space"].id), headers=auth(pair["outsider_token"]))
        nonexistent = client.get(profile_path(new_id()), headers=auth(pair["outsider_token"]))
        assert existing.status_code == nonexistent.status_code == 404
        assert existing.json() == nonexistent.json()

    def test_departed_member_can_no_longer_write(self, client, session, pair) -> None:  # type: ignore[no-untyped-def]
        membership = service.require_membership(session, pair["ben"], pair["space"].id)
        service.end_membership(session, membership)
        session.flush()

        response = client.put(
            profile_path(pair["space"].id),
            json=body(),
            headers={**auth(pair["token_b"]), **if_match(1)},
        )
        assert response.status_code == 404

    @pytest.mark.parametrize("bad_id", ["nicht-echt", "12345", "' OR 1=1 --", "../../etc/passwd"])
    def test_malformed_id_returns_404(self, client, pair, bad_id: str) -> None:  # type: ignore[no-untyped-def]
        response = client.put(
            profile_path(bad_id),
            json=body(),
            headers={**auth(pair["token_a"]), **if_match(1)},
        )
        assert response.status_code == 404


class TestAnonymousAccess:
    def test_read_without_token(self, client, pair) -> None:  # type: ignore[no-untyped-def]
        assert client.get(profile_path(pair["space"].id)).status_code == 401

    def test_write_without_token(self, client, session, pair) -> None:  # type: ignore[no-untyped-def]
        response = client.put(
            profile_path(pair["space"].id),
            json=body(started_on="1999-01-01"),
            headers=if_match(1),
        )
        assert response.status_code == 401
        assert stored_profile(session, pair["space"].id).relationship_started_on is None

    @pytest.mark.parametrize(
        "headers",
        [{"Authorization": "Bearer nicht-echt"}, {"Authorization": "Basic abc"}, {}],
    )
    def test_unusable_authorization_header(self, client, pair, headers) -> None:  # type: ignore[no-untyped-def]
        response = client.put(
            profile_path(pair["space"].id),
            json=body(),
            headers={**headers, **if_match(1)},
        )
        assert response.status_code == 401


def freeze(monkeypatch, instant: datetime) -> None:
    """Freeze only the calendar day, not session lifetimes.

    `today_in` resolves `now` from the clock module at call time, while
    `auth.sessions` imported the function directly. Advancing the calendar day
    therefore leaves access-token validity untouched; otherwise these tests
    would fail with an unrelated 401.
    """
    from eimir.core import clock

    monkeypatch.setattr(clock, "now", lambda: instant)


def with_start(session: Session, space_id: object, started_on: date) -> None:
    profile = stored_profile(session, space_id)
    profile.relationship_started_on = started_on
    session.flush()


class TestTimezone:
    """The day changes where the reader is located.

    All cases use 25 August 2025 as the relationship start. The first
    anniversary is therefore 25 August 2026, which begins in Auckland hours
    before and in Los Angeles hours after the UTC day boundary.
    """

    def test_west_of_utc_anniversary_has_not_arrived_yet(
        self, client, session, pair, monkeypatch
    ) -> None:  # type: ignore[no-untyped-def]
        """05:00 UTC on 25 August is still 24 August in Los Angeles.

        Using `today_utc()` would incorrectly report one full year here.
        """
        pair["anna"].timezone = "America/Los_Angeles"
        with_start(session, pair["space"].id, date(2025, 8, 25))
        freeze(monkeypatch, datetime(2026, 8, 25, 5, 0, tzinfo=UTC))

        response_body = client.get(
            profile_path(pair["space"].id), headers=auth(pair["token_a"])
        ).json()
        assert (response_body["relationshipYears"], response_body["relationshipMonths"]) == (
            0,
            11,
        )
        assert response_body["relationshipDays"] == 364

    def test_east_of_utc_anniversary_has_already_arrived(
        self, client, session, pair, monkeypatch
    ) -> None:  # type: ignore[no-untyped-def]
        """12:30 UTC on 24 August is already 25 August in Auckland."""
        pair["anna"].timezone = "Pacific/Auckland"
        with_start(session, pair["space"].id, date(2025, 8, 25))
        freeze(monkeypatch, datetime(2026, 8, 24, 12, 30, tzinfo=UTC))

        response_body = client.get(
            profile_path(pair["space"].id), headers=auth(pair["token_a"])
        ).json()
        assert (response_body["relationshipYears"], response_body["relationshipMonths"]) == (
            1,
            0,
        )
        assert response_body["relationshipDays"] == 365

    def test_same_instant_yields_different_days_by_location(
        self, client, session, pair, monkeypatch
    ) -> None:  # type: ignore[no-untyped-def]
        """Two partners in two locations each see their own local day."""
        pair["anna"].timezone = "Pacific/Auckland"
        pair["ben"].timezone = "America/Los_Angeles"
        with_start(session, pair["space"].id, date(2025, 8, 25))
        freeze(monkeypatch, datetime(2026, 8, 24, 12, 30, tzinfo=UTC))

        path = profile_path(pair["space"].id)
        from_anna = client.get(path, headers=auth(pair["token_a"])).json()
        from_ben = client.get(path, headers=auth(pair["token_b"])).json()

        assert from_anna["relationshipDays"] == 365
        assert from_ben["relationshipDays"] == 364

    def test_anniversary_changes_at_local_midnight(
        self, client, session, pair, monkeypatch
    ) -> None:  # type: ignore[no-untyped-def]
        """Berlin is UTC+2 in May; local midnight lies between these instants."""
        pair["anna"].timezone = "Europe/Berlin"
        with_start(session, pair["space"].id, date(2022, 5, 17))
        path = profile_path(pair["space"].id)

        freeze(monkeypatch, datetime(2026, 5, 16, 21, 30, tzinfo=UTC))
        before = client.get(path, headers=auth(pair["token_a"])).json()
        assert (before["relationshipYears"], before["relationshipMonths"]) == (3, 11)

        freeze(monkeypatch, datetime(2026, 5, 16, 22, 30, tzinfo=UTC))
        after = client.get(path, headers=auth(pair["token_a"])).json()
        assert (after["relationshipYears"], after["relationshipMonths"]) == (4, 0)

    def test_space_view_also_uses_local_time(self, client, session, pair, monkeypatch) -> None:  # type: ignore[no-untyped-def]
        """The same value must not depend on which endpoint serves it."""
        pair["anna"].timezone = "Pacific/Auckland"
        with_start(session, pair["space"].id, date(2025, 8, 25))
        freeze(monkeypatch, datetime(2026, 8, 24, 12, 30, tzinfo=UTC))

        space_view = client.get(
            f"/api/v1/spaces/{pair['space'].id}", headers=auth(pair["token_a"])
        ).json()
        assert space_view["relationshipYears"] == 1
        assert space_view["relationshipDays"] == 365

    def test_invalid_timezone_does_not_abort_request(
        self, client, session, pair, monkeypatch
    ) -> None:  # type: ignore[no-untyped-def]
        """`Account.timezone` is free text; invalid values fall back to UTC."""
        pair["anna"].timezone = "Nicht/Echt"
        with_start(session, pair["space"].id, date(2025, 8, 25))
        freeze(monkeypatch, datetime(2026, 8, 24, 12, 30, tzinfo=UTC))

        response = client.get(profile_path(pair["space"].id), headers=auth(pair["token_a"]))
        assert response.status_code == 200
        assert response.json()["relationshipDays"] == 364

    def test_today_at_local_location_is_not_future_date(self, client, pair, monkeypatch) -> None:  # type: ignore[no-untyped-def]
        """In Auckland 25 August has begun while UTC is still on 24 August."""
        pair["anna"].timezone = "Pacific/Auckland"
        freeze(monkeypatch, datetime(2026, 8, 24, 12, 30, tzinfo=UTC))

        response = client.put(
            profile_path(pair["space"].id),
            json=body(started_on="2026-08-25"),
            headers={**auth(pair["token_a"]), **if_match(1)},
        )
        assert response.status_code == 200
        assert response.json()["relationshipStartedOn"] == "2026-08-25"
        assert response.json()["relationshipDays"] == 0

    def test_tomorrow_at_local_location_remains_future(self, client, pair, monkeypatch) -> None:  # type: ignore[no-untyped-def]
        """In Los Angeles it is still 24 August even though UTC is ahead."""
        pair["anna"].timezone = "America/Los_Angeles"
        freeze(monkeypatch, datetime(2026, 8, 25, 5, 0, tzinfo=UTC))

        response = client.put(
            profile_path(pair["space"].id),
            json=body(started_on="2026-08-25"),
            headers={**auth(pair["token_a"]), **if_match(1)},
        )
        assert response.status_code == 422
        assert response.json()["code"] == "RELATIONSHIP_START_IN_FUTURE"
