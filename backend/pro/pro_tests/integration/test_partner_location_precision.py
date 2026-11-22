"""Precise sharing choice for partner location (#1792, PO 2026-11-17).

Precise is a person-level choice inside the Premium feature: the partner sees
finer bands and a smaller area only when both positions are precise, and an
approximate-only device grant silently stays approximate.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from typing import Any

import pytest
from eimir_pro.presence.models import PresenceSnapshot
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.core.clock import now
from eimir.entitlements import service as entitlements
from eimir.entitlements.models import (
    Capability,
    EntitlementSourceType,
    EntitlementStatus,
    EntitlementTier,
)
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

SHARER_AT = {"latitude": 53.55117, "longitude": 9.99371}
# About 220 m north of the sharer.
VIEWER_NEAR = {"latitude": 53.55317, "longitude": 9.99371}


def _base(space_id: object) -> str:
    return f"/api/v1/spaces/{space_id}/partner-location"


@pytest.fixture
def couple(session: Session) -> dict[str, Any]:
    sharer = make_account(session, "Sharer")
    viewer = make_account(session, "Viewer")
    space = make_space(session, sharer)
    relationship_service.add_member(session, space.id, viewer)
    session.flush()
    return {
        "space": space,
        "sharer": sharer,
        "sharer_token": sign_in(session, sharer),
        "viewer_token": sign_in(session, viewer),
    }


@pytest.fixture
def premium(session: Session, couple: dict[str, Any]) -> None:
    entitlements.record_grant(
        session,
        space_id=couple["space"].id,
        account_id=couple["sharer"].id,
        source_type=EntitlementSourceType.TEST_FIXTURE,
        status=EntitlementStatus.ACTIVE,
        tier=EntitlementTier.PREMIUM,
        effective_from=now() - timedelta(minutes=1),
        capabilities=[Capability.PRESENCE_LOCATION.value],
    )


def _settings(client: Any, couple: dict[str, Any], who: str, body: dict[str, Any]) -> Any:
    return client.put(
        f"{_base(couple['space'].id)}/settings",
        json=body,
        headers=auth(couple[f"{who}_token"]),
    )


def _share(client: Any, couple: dict[str, Any], precision: str | None) -> dict[str, Any]:
    body: dict[str, Any] = {"level": "DISTANCE_AND_MAP", "indefinite": True}
    if precision is not None:
        body["precision"] = precision
    response = _settings(client, couple, "sharer", body)
    assert response.status_code == 200, response.text
    return response.json()


def _publish(client: Any, couple: dict[str, Any], generation: int, accuracy: float) -> None:
    response = client.put(
        f"{_base(couple['space'].id)}/snapshot",
        json={
            **SHARER_AT,
            "accuracyMeters": accuracy,
            "capturedAt": now().isoformat(),
            "consentGeneration": generation,
        },
        headers=auth(couple["sharer_token"]),
    )
    assert response.status_code == 200, response.text


def _distance(client: Any, couple: dict[str, Any], accuracy: float | None = 20) -> dict[str, Any]:
    body: dict[str, Any] = {**VIEWER_NEAR, "capturedAt": now().isoformat()}
    if accuracy is not None:
        body["accuracyMeters"] = accuracy
    response = client.post(
        f"{_base(couple['space'].id)}/distance", json=body, headers=auth(couple["viewer_token"])
    )
    assert response.status_code == 200, response.text
    return response.json()


def _viewer_chooses_precise(client: Any, couple: dict[str, Any]) -> None:
    response = _settings(client, couple, "viewer", {"level": "OFF", "precision": "PRECISE"})
    assert response.status_code == 200, response.text
    assert response.json()["precision"] == "PRECISE"
    assert response.json()["level"] == "OFF"


def test_precise_is_premium_but_approximate_and_stop_never_are(client, session, couple) -> None:  # type: ignore[no-untyped-def]
    denied = _settings(
        client, couple, "sharer", {"level": "DISTANCE", "indefinite": True, "precision": "PRECISE"}
    )
    assert denied.status_code == 403
    denied_without_sharing = _settings(
        client, couple, "sharer", {"level": "OFF", "precision": "PRECISE"}
    )
    assert denied_without_sharing.status_code == 403
    approximate = _settings(client, couple, "sharer", {"level": "OFF", "precision": "APPROXIMATE"})
    assert approximate.status_code == 200
    assert approximate.json()["precision"] == "APPROXIMATE"


def test_the_choice_is_kept_until_changed_and_defaults_to_approximate(  # type: ignore[no-untyped-def]
    client, session, couple, premium
) -> None:
    assert _share(client, couple, None)["precision"] == "APPROXIMATE"
    assert _share(client, couple, "PRECISE")["precision"] == "PRECISE"
    # Narrowing the level without naming a precision keeps the choice.
    narrowed = _settings(client, couple, "sharer", {"level": "DISTANCE", "indefinite": True}).json()
    assert narrowed["precision"] == "PRECISE"
    # Stopping keeps it too, so it can be chosen before sharing.
    stopped = _settings(client, couple, "sharer", {"level": "OFF"}).json()
    assert (stopped["state"], stopped["precision"]) == ("OFF", "PRECISE")
    lowered = _settings(client, couple, "sharer", {"level": "OFF", "precision": "APPROXIMATE"})
    assert lowered.json()["precision"] == "APPROXIMATE"


def test_choosing_precise_without_sharing_is_stored_and_changes_generation(  # type: ignore[no-untyped-def]
    client, session, couple, premium
) -> None:
    _viewer_chooses_precise(client, couple)
    read = client.get(
        f"{_base(couple['space'].id)}/settings", headers=auth(couple["viewer_token"])
    ).json()
    assert read["precision"] == "PRECISE"
    assert read["generation"] >= 1


def test_two_precise_positions_resolve_the_close_bands_on_a_fine_grid(  # type: ignore[no-untyped-def]
    client, session, couple, premium
) -> None:
    generation = _share(client, couple, "PRECISE")["generation"]
    _viewer_chooses_precise(client, couple)
    _publish(client, couple, generation, accuracy=12)

    stored = session.execute(select(PresenceSnapshot)).scalars().one().payload
    assert (stored.latitude, stored.longitude) == (Decimal("53.551"), Decimal("9.994"))
    assert stored.accuracy_meters == 200

    distance = _distance(client, couple)
    assert distance["band"]["kind"] == "CLOSE"
    assert (distance["band"]["minMeters"], distance["band"]["maxMeters"]) == (0, 300)

    area = client.get(f"{_base(couple['space'].id)}/map", headers=auth(couple["viewer_token"]))
    assert area.json()["radiusMeters"] == 200


def test_the_coarser_side_governs_and_nothing_reveals_which_side_it_was(  # type: ignore[no-untyped-def]
    client, session, couple, premium
) -> None:
    generation = _share(client, couple, "PRECISE")["generation"]
    _publish(client, couple, generation, accuracy=12)
    # The viewer stays approximate (default): the band is the old coarse one.
    assert _distance(client, couple)["band"] == {
        "kind": "NEARBY",
        "minKm": None,
        "maxKm": None,
        "approximateKm": None,
        "minMeters": None,
        "maxMeters": None,
    }
    # A precise viewer whose device only gave an approximate fix is coarse too.
    _viewer_chooses_precise(client, couple)
    assert _distance(client, couple, accuracy=2000)["band"]["kind"] == "NEARBY"
    assert _distance(client, couple, accuracy=None)["band"]["kind"] == "NEARBY"
    assert _distance(client, couple)["band"]["kind"] == "CLOSE"


def test_an_approximate_sharer_keeps_the_old_bands_for_a_precise_viewer(  # type: ignore[no-untyped-def]
    client, session, couple, premium
) -> None:
    generation = _share(client, couple, "APPROXIMATE")["generation"]
    _viewer_chooses_precise(client, couple)
    _publish(client, couple, generation, accuracy=12)
    stored = session.execute(select(PresenceSnapshot)).scalars().one().payload
    assert (stored.latitude, stored.longitude) == (Decimal("53.55"), Decimal("9.99"))
    assert stored.accuracy_meters == 1000
    assert _distance(client, couple)["band"]["kind"] == "NEARBY"


def test_a_precise_choice_with_an_approximate_only_grant_is_stored_approximately(  # type: ignore[no-untyped-def]
    client, session, couple, premium
) -> None:
    generation = _share(client, couple, "PRECISE")["generation"]
    _publish(client, couple, generation, accuracy=1800)
    stored = session.execute(select(PresenceSnapshot)).scalars().one().payload
    assert (stored.latitude, stored.longitude) == (Decimal("53.55"), Decimal("9.99"))
    assert stored.accuracy_meters == 1800
    area = client.get(f"{_base(couple['space'].id)}/map", headers=auth(couple["viewer_token"]))
    assert area.json()["radiusMeters"] == 1800


def test_changing_the_precision_ends_the_old_snapshot(  # type: ignore[no-untyped-def]
    client, session, couple, premium
) -> None:
    generation = _share(client, couple, "PRECISE")["generation"]
    _publish(client, couple, generation, accuracy=12)
    changed = _share(client, couple, "APPROXIMATE")
    assert changed["generation"] == generation + 1
    assert session.execute(select(PresenceSnapshot)).scalars().all() == []
