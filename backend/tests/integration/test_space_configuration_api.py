"""HTTP contract for typed Space-wide module configuration."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import UUID

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.core.ids import new_id
from eimir.relationship import service as relationship_service
from eimir.relationship.models import SpaceConfiguration
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


def path(space_id: object) -> str:
    return f"/api/v1/spaces/{space_id}/configuration"


def if_match(version: object) -> dict[str, str]:
    return {"If-Match": f'"{version}"'}


@pytest.fixture
def pair(session: Session):  # type: ignore[no-untyped-def]
    manager = make_account(session, "Manager")
    partner = make_account(session, "Partner")
    outsider = make_account(session, "Outsider")

    space = make_space(session, manager)
    relationship_service.add_member(session, space.id, partner)
    outsider_space = make_space(session, outsider)
    session.flush()

    return {
        "space": space,
        "manager": manager,
        "partner": partner,
        "outsider": outsider,
        "token_manager": sign_in(session, manager),
        "token_partner": sign_in(session, partner),
        "token_outsider": sign_in(session, outsider),
        "outsider_space": outsider_space,
    }


def stored(session: Session, space_id: UUID) -> SpaceConfiguration:
    configuration = session.execute(
        select(SpaceConfiguration).where(SpaceConfiguration.space_id == space_id)
    ).scalar_one()
    session.refresh(configuration)
    return configuration


class TestRead:
    def test_both_partners_read_same_configuration_with_authoritative_capability(  # type: ignore[no-untyped-def]
        self,
        client,
        pair,
    ) -> None:
        manager = client.get(
            path(pair["space"].id),
            headers=auth(pair["token_manager"]),
        )
        partner = client.get(
            path(pair["space"].id),
            headers=auth(pair["token_partner"]),
        )

        assert manager.status_code == partner.status_code == 200
        assert manager.headers["ETag"] == partner.headers["ETag"] == '"1"'

        manager_body = manager.json()
        partner_body = partner.json()
        assert manager_body["canManageSpaceConfiguration"] is True
        assert partner_body["canManageSpaceConfiguration"] is False

        manager_body.pop("canManageSpaceConfiguration")
        partner_body.pop("canManageSpaceConfiguration")
        expected = {
            "spaceId": str(pair["space"].id),
            "version": 1,
            "vibeCheckEnabled": False,
            "energyCheckInEnabled": False,
            "loveNotesEnabled": False,
            "supportGesturesEnabled": True,
            "sharedAchievementsEnabled": False,
            "dailyQuestionsEnabled": False,
            "dailyContextTimezone": None,
            "vibeVisibilityMode": "IMMEDIATE",
            "energyVisibilityMode": "IMMEDIATE",
        }
        assert manager_body == expected
        assert partner_body == expected

    def test_foreign_space_is_indistinguishable_from_nonexistent_one(  # type: ignore[no-untyped-def]
        self,
        client,
        pair,
    ) -> None:
        existing = client.get(
            path(pair["space"].id),
            headers=auth(pair["token_outsider"]),
        )
        nonexistent = client.get(
            path(new_id()),
            headers=auth(pair["token_outsider"]),
        )

        assert existing.status_code == nonexistent.status_code == 404
        assert existing.json() == nonexistent.json()


class TestWrite:
    def test_manager_patch_preserves_omitted_fields_and_returns_new_etag(  # type: ignore[no-untyped-def]
        self,
        client,
        session: Session,
        pair,
    ) -> None:
        response = client.patch(
            path(pair["space"].id),
            json={"loveNotesEnabled": True},
            headers={**auth(pair["token_manager"]), **if_match(1)},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["version"] == 2
        assert body["loveNotesEnabled"] is True
        assert body["supportGesturesEnabled"] is True
        assert body["vibeCheckEnabled"] is False
        assert body["canManageSpaceConfiguration"] is True
        assert response.headers["ETag"] == '"2"'

        configuration = stored(session, pair["space"].id)
        assert configuration.love_notes_enabled
        assert configuration.support_gestures_enabled
        assert not configuration.vibe_check_enabled
        assert configuration.version == 2

    def test_partner_write_is_denied_without_mutation(  # type: ignore[no-untyped-def]
        self,
        client,
        session: Session,
        pair,
    ) -> None:
        response = client.patch(
            path(pair["space"].id),
            json={"loveNotesEnabled": True},
            headers={**auth(pair["token_partner"]), **if_match(1)},
        )

        assert response.status_code == 403
        assert response.json()["code"] == "SPACE_CONFIGURATION_MANAGEMENT_REQUIRED"
        configuration = stored(session, pair["space"].id)
        assert not configuration.love_notes_enabled
        assert configuration.version == 1

    def test_stale_version_does_not_overwrite_newer_state(  # type: ignore[no-untyped-def]
        self,
        client,
        pair,
    ) -> None:
        first = client.patch(
            path(pair["space"].id),
            json={"loveNotesEnabled": True},
            headers={**auth(pair["token_manager"]), **if_match(1)},
        )
        assert first.status_code == 200

        stale = client.patch(
            path(pair["space"].id),
            json={"supportGesturesEnabled": False},
            headers={**auth(pair["token_manager"]), **if_match(1)},
        )
        assert stale.status_code == 409
        assert stale.json()["code"] == "VERSION_CONFLICT"

        current = client.get(
            path(pair["space"].id),
            headers=auth(pair["token_manager"]),
        )
        assert current.json()["loveNotesEnabled"] is True
        assert current.json()["supportGesturesEnabled"] is True
        assert current.json()["version"] == 2

    def test_invalid_timezone_is_atomic(  # type: ignore[no-untyped-def]
        self,
        client,
        pair,
    ) -> None:
        invalid = client.patch(
            path(pair["space"].id),
            json={
                "loveNotesEnabled": True,
                "dailyContextTimezone": "Europe/Berlinn",
            },
            headers={**auth(pair["token_manager"]), **if_match(1)},
        )

        assert invalid.status_code == 422
        assert invalid.json()["code"] == "SPACE_DAILY_CONTEXT_TIMEZONE_INVALID"

        current = client.get(
            path(pair["space"].id),
            headers=auth(pair["token_manager"]),
        )
        assert current.json()["loveNotesEnabled"] is False
        assert current.json()["dailyContextTimezone"] is None
        assert current.json()["version"] == 1

    def test_daily_module_and_timezone_can_be_enabled_atomically(  # type: ignore[no-untyped-def]
        self,
        client,
        pair,
    ) -> None:
        response = client.patch(
            path(pair["space"].id),
            json={
                "vibeCheckEnabled": True,
                "dailyContextTimezone": "Europe/Berlin",
                "vibeVisibilityMode": "MUTUAL_REVEAL",
            },
            headers={**auth(pair["token_manager"]), **if_match(1)},
        )

        assert response.status_code == 200
        assert response.json()["vibeCheckEnabled"] is True
        assert response.json()["dailyContextTimezone"] == "Europe/Berlin"
        assert response.json()["vibeVisibilityMode"] == "MUTUAL_REVEAL"

    def test_timezone_is_the_only_configuration_field_that_can_be_cleared(  # type: ignore[no-untyped-def]
        self,
        client,
        pair,
    ) -> None:
        configured = client.patch(
            path(pair["space"].id),
            json={"dailyContextTimezone": "Europe/Berlin"},
            headers={**auth(pair["token_manager"]), **if_match(1)},
        )
        assert configured.status_code == 200

        cleared = client.patch(
            path(pair["space"].id),
            json={"dailyContextTimezone": None},
            headers={**auth(pair["token_manager"]), **if_match(2)},
        )

        assert cleared.status_code == 200
        assert cleared.json()["dailyContextTimezone"] is None
        assert cleared.json()["version"] == 3

    @pytest.mark.parametrize(
        ("payload", "expected_code"),
        [
            ({}, None),
            ({"loveNotesEnabled": None}, None),
            ({"unknownSetting": True}, None),
        ],
    )
    def test_patch_rejects_untyped_or_empty_state(  # type: ignore[no-untyped-def]
        self,
        client,
        pair,
        payload: dict[str, object],
        expected_code: str | None,
    ) -> None:
        response = client.patch(
            path(pair["space"].id),
            json=payload,
            headers={**auth(pair["token_manager"]), **if_match(1)},
        )

        assert response.status_code == 422
        if expected_code is not None:
            assert response.json()["code"] == expected_code

    def test_missing_or_malformed_if_match_is_rejected(  # type: ignore[no-untyped-def]
        self,
        client,
        pair,
    ) -> None:
        missing = client.patch(
            path(pair["space"].id),
            json={"loveNotesEnabled": True},
            headers=auth(pair["token_manager"]),
        )
        malformed = client.patch(
            path(pair["space"].id),
            json={"loveNotesEnabled": True},
            headers={**auth(pair["token_manager"]), "If-Match": "*"},
        )

        assert missing.status_code == 422
        assert malformed.status_code == 422
        assert malformed.json()["code"] == "IF_MATCH_MALFORMED"

    def test_ambiguous_legacy_authority_reads_fail_closed_and_cannot_write(  # type: ignore[no-untyped-def]
        self,
        client,
        session: Session,
        pair,
    ) -> None:
        pair["space"].configuration_manager_account_id = None
        session.flush()

        read = client.get(
            path(pair["space"].id),
            headers=auth(pair["token_manager"]),
        )
        denied = client.patch(
            path(pair["space"].id),
            json={"loveNotesEnabled": True},
            headers={**auth(pair["token_manager"]), **if_match(1)},
        )

        assert read.status_code == 200
        assert read.json()["canManageSpaceConfiguration"] is False
        assert denied.status_code == 403
        assert denied.json()["code"] == "SPACE_CONFIGURATION_MANAGEMENT_REQUIRED"


class TestConcurrency:
    def test_concurrent_manager_updates_do_not_overwrite_each_other(  # type: ignore[no-untyped-def]
        self,
        production_client,
    ) -> None:
        client, maker = production_client
        with maker() as setup:
            manager = make_account(setup, "Concurrent manager")
            space = make_space(setup, manager)
            token = sign_in(setup, manager)
            space_id = space.id
            setup.commit()

        start = Barrier(2)

        def write(payload: dict[str, bool]):  # type: ignore[no-untyped-def]
            start.wait(timeout=5)
            return client.patch(
                path(space_id),
                json=payload,
                headers={**auth(token), **if_match(1)},
            )

        payloads = [
            {"loveNotesEnabled": True},
            {"supportGesturesEnabled": False},
        ]
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(write, payloads))

        assert sorted(response.status_code for response in responses) == [200, 409]

        winner = next(response for response in responses if response.status_code == 200)
        loser = next(response for response in responses if response.status_code == 409)
        assert loser.json()["code"] == "VERSION_CONFLICT"

        with maker() as verifier:
            configuration = verifier.execute(
                select(SpaceConfiguration).where(SpaceConfiguration.space_id == space_id)
            ).scalar_one()
            winner_body = winner.json()
            expected_love_notes = winner_body["loveNotesEnabled"]
            expected_support_gestures = winner_body["supportGesturesEnabled"]
            assert configuration.version == 2
            assert configuration.love_notes_enabled == expected_love_notes
            assert configuration.support_gestures_enabled == expected_support_gestures
