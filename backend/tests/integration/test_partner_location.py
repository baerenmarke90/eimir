"""Consent, Premium, privacy and lifecycle acceptance for partner location (#1792)."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from typing import Any

import pytest
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
from eimir.presence import retention
from eimir.presence import service as presence_service
from eimir.presence.models import PartnerLocationConsent, PresenceSnapshot
from eimir.relationship import service as relationship_service
from eimir.relationship.models import Membership, MembershipStatus
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

HAMBURG = {"latitude": 53.5511, "longitude": 9.9937}
COLOGNE = {"latitude": 50.9375, "longitude": 6.9603}


def _base(space_id: object) -> str:
    return f"/api/v1/spaces/{space_id}/partner-location"


def _grant(session: Session, couple: dict[str, Any]) -> Any:
    return entitlements.record_grant(
        session,
        space_id=couple["space"].id,
        account_id=couple["sharer"].id,
        source_type=EntitlementSourceType.TEST_FIXTURE,
        status=EntitlementStatus.ACTIVE,
        tier=EntitlementTier.PREMIUM,
        effective_from=now() - timedelta(minutes=1),
        capabilities=[Capability.PRESENCE_LOCATION.value],
    )


@pytest.fixture
def couple(session: Session) -> dict[str, Any]:
    sharer = make_account(session, "Sharer")
    viewer = make_account(session, "Viewer")
    outsider = make_account(session, "Outsider")
    space = make_space(session, sharer)
    relationship_service.add_member(session, space.id, viewer)
    make_space(session, outsider)
    session.flush()
    return {
        "space": space,
        "sharer": sharer,
        "viewer": viewer,
        "sharer_token": sign_in(session, sharer),
        "viewer_token": sign_in(session, viewer),
        "outsider_token": sign_in(session, outsider),
    }


def _share(client: Any, couple: dict[str, Any], level: str = "DISTANCE") -> dict[str, Any]:
    response = client.put(
        f"{_base(couple['space'].id)}/settings",
        json={"level": level, "indefinite": True},
        headers=auth(couple["sharer_token"]),
    )
    assert response.status_code == 200, response.text
    return response.json()


def _publish(
    client: Any, couple: dict[str, Any], generation: int, position: dict[str, float] = HAMBURG
) -> Any:
    return client.put(
        f"{_base(couple['space'].id)}/snapshot",
        json={
            **position,
            "accuracyMeters": 35,
            "capturedAt": now().isoformat(),
            "consentGeneration": generation,
        },
        headers=auth(couple["sharer_token"]),
    )


def _distance(client: Any, couple: dict[str, Any]) -> Any:
    return client.post(
        f"{_base(couple['space'].id)}/distance",
        json={**COLOGNE, "capturedAt": now().isoformat()},
        headers=auth(couple["viewer_token"]),
    )


def _map(client: Any, couple: dict[str, Any]) -> Any:
    return client.get(f"{_base(couple['space'].id)}/map", headers=auth(couple["viewer_token"]))


def test_defaults_are_off_and_only_stopping_is_free(client, session: Session, couple) -> None:  # type: ignore[no-untyped-def]
    base = _base(couple["space"].id)
    settings = client.get(f"{base}/settings", headers=auth(couple["sharer_token"]))
    assert settings.status_code == 200
    assert settings.headers["Cache-Control"] == "no-store"
    assert settings.json() | {"generation": 0} == {
        "available": False,
        "level": "OFF",
        "state": "OFF",
        "indefinite": False,
        "expiresAt": None,
        "generation": 0,
        "lastPublishedAt": None,
    }
    denied = client.put(
        f"{base}/settings",
        json={"level": "DISTANCE", "indefinite": True},
        headers=auth(couple["sharer_token"]),
    )
    assert denied.status_code == 403
    stopped = client.put(
        f"{base}/settings", json={"level": "OFF"}, headers=auth(couple["sharer_token"])
    )
    assert stopped.status_code == 200
    assert stopped.json()["state"] == "OFF"
    assert _distance(client, couple).json() == {"available": False, "band": None, "asOf": None}


def test_distance_only_never_exposes_coordinates_and_map_needs_its_own_level(  # type: ignore[no-untyped-def]
    client, session: Session, couple
) -> None:
    _grant(session, couple)
    shared = _share(client, couple, "DISTANCE")
    assert shared["state"] == "ACTIVE"
    published = _publish(client, couple, shared["generation"])
    assert published.status_code == 200, published.text
    assert published.json()["lastPublishedAt"] is not None

    snapshot = session.execute(select(PresenceSnapshot)).scalar_one()
    assert (snapshot.latitude, snapshot.longitude) == (Decimal("53.55"), Decimal("9.99"))
    assert snapshot.accuracy_meters == 1000

    distance = _distance(client, couple)
    assert distance.status_code == 200
    body = distance.json()
    assert body["available"] is True
    assert body["band"] == {
        "kind": "APPROXIMATE",
        "minKm": None,
        "maxKm": None,
        "approximateKm": 350,
    }
    assert "53.55" not in distance.text and "9.99" not in distance.text
    assert _map(client, couple).json()["available"] is False

    # The viewer's transient position is never stored.
    assert session.execute(select(PresenceSnapshot)).scalars().all() == [snapshot]


def test_map_level_change_invalidates_old_generations(client, session: Session, couple) -> None:  # type: ignore[no-untyped-def]
    _grant(session, couple)
    first = _share(client, couple, "DISTANCE")
    assert _publish(client, couple, first["generation"]).status_code == 200
    second = _share(client, couple, "DISTANCE_AND_MAP")
    assert second["generation"] == first["generation"] + 1
    assert _map(client, couple).json()["available"] is False  # old snapshot discarded

    stale = _publish(client, couple, first["generation"])
    assert stale.status_code == 409
    assert stale.json()["code"] == "partner_location_generation_stale"
    assert _publish(client, couple, second["generation"]).status_code == 200

    area = _map(client, couple).json()
    assert area["available"] is True
    assert (area["latitude"], area["longitude"]) == (53.55, 9.99)
    assert area["radiusMeters"] >= 1500


def test_stop_removes_the_snapshot_and_viewer_sees_neutral_absence(  # type: ignore[no-untyped-def]
    client, session: Session, couple
) -> None:
    _grant(session, couple)
    shared = _share(client, couple, "DISTANCE_AND_MAP")
    _publish(client, couple, shared["generation"])
    stop = client.put(
        f"{_base(couple['space'].id)}/settings",
        json={"level": "OFF"},
        headers=auth(couple["sharer_token"]),
    )
    assert stop.status_code == 200
    assert session.execute(select(PresenceSnapshot)).scalars().all() == []
    assert _distance(client, couple).json() == {"available": False, "band": None, "asOf": None}
    assert _map(client, couple).json()["available"] is False


def test_bounded_share_expires_and_publication_is_not_stored(  # type: ignore[no-untyped-def]
    client, session: Session, couple
) -> None:
    _grant(session, couple)
    base = _base(couple["space"].id)
    shared = client.put(
        f"{base}/settings",
        json={"level": "DISTANCE", "expiresAt": (now() + timedelta(hours=1)).isoformat()},
        headers=auth(couple["sharer_token"]),
    ).json()
    assert shared["state"] == "ACTIVE" and shared["indefinite"] is False
    _publish(client, couple, shared["generation"])

    consent = session.execute(select(PartnerLocationConsent)).scalar_one()
    consent.expires_at = now() - timedelta(seconds=1)
    session.flush()

    assert _distance(client, couple).json()["available"] is False
    expired = _publish(client, couple, shared["generation"])
    assert expired.status_code == 200
    assert expired.json()["state"] == "EXPIRED"
    assert retention.purge(session) >= 1
    assert session.execute(select(PresenceSnapshot)).scalars().all() == []


@pytest.mark.parametrize(
    "body",
    [
        {"level": "DISTANCE"},
        {"level": "DISTANCE", "indefinite": True, "expiresAt": "2030-01-01T00:00:00Z"},
        {"level": "DISTANCE", "expiresAt": "2000-01-01T00:00:00Z"},
    ],
)
def test_duration_must_be_explicit_and_bounded(  # type: ignore[no-untyped-def]
    client, session: Session, couple, body: dict[str, Any]
) -> None:
    _grant(session, couple)
    response = client.put(
        f"{_base(couple['space'].id)}/settings", json=body, headers=auth(couple["sharer_token"])
    )
    assert response.status_code == 422
    assert response.json()["code"] == "partner_location_invalid_duration"


def test_capture_time_window_and_coordinate_range_are_enforced(  # type: ignore[no-untyped-def]
    client, session: Session, couple
) -> None:
    _grant(session, couple)
    shared = _share(client, couple)
    base = _base(couple["space"].id)
    old = client.put(
        f"{base}/snapshot",
        json={
            **HAMBURG,
            "accuracyMeters": 50,
            "capturedAt": (now() - timedelta(hours=25)).isoformat(),
            "consentGeneration": shared["generation"],
        },
        headers=auth(couple["sharer_token"]),
    )
    assert old.status_code == 422
    out_of_range = client.post(
        f"{base}/distance",
        json={"latitude": 91, "longitude": 0, "capturedAt": now().isoformat()},
        headers=auth(couple["viewer_token"]),
    )
    assert out_of_range.status_code == 422


def test_entitlement_loss_suspends_and_restore_needs_confirmation(  # type: ignore[no-untyped-def]
    client, session: Session, couple
) -> None:
    grant = _grant(session, couple)
    shared = _share(client, couple, "DISTANCE_AND_MAP")
    _publish(client, couple, shared["generation"])
    entitlements.revoke_grant(session, grant.id)
    session.flush()

    assert _distance(client, couple).json()["available"] is False
    consent = session.execute(select(PartnerLocationConsent)).scalar_one()
    assert consent.suspended_at is not None
    assert session.execute(select(PresenceSnapshot)).scalars().all() == []

    restored = _grant(session, couple)
    assert restored is not None
    settings = client.get(
        f"{_base(couple['space'].id)}/settings", headers=auth(couple["sharer_token"])
    ).json()
    assert settings["state"] == "SUSPENDED"
    suspended_publish = _publish(client, couple, settings["generation"])
    assert suspended_publish.json()["state"] == "SUSPENDED"
    assert session.execute(select(PresenceSnapshot)).scalars().all() == []

    confirmed = _share(client, couple, "DISTANCE_AND_MAP")
    assert confirmed["state"] == "ACTIVE"
    assert _publish(client, couple, confirmed["generation"]).status_code == 200
    assert _map(client, couple).json()["available"] is True


def test_retention_job_suspends_unentitled_spaces(client, session: Session, couple) -> None:  # type: ignore[no-untyped-def]
    grant = _grant(session, couple)
    shared = _share(client, couple)
    _publish(client, couple, shared["generation"])
    entitlements.revoke_grant(session, grant.id)
    session.flush()
    assert retention.purge(session) >= 1
    consent = session.execute(select(PartnerLocationConsent)).scalar_one()
    assert consent.suspended_at is not None
    assert session.execute(select(PresenceSnapshot)).scalars().all() == []


def test_partner_leaving_ends_visibility(client, session: Session, couple) -> None:  # type: ignore[no-untyped-def]
    _grant(session, couple)
    shared = _share(client, couple, "DISTANCE_AND_MAP")
    _publish(client, couple, shared["generation"])
    membership = session.execute(
        select(Membership).where(
            Membership.space_id == couple["space"].id,
            Membership.account_id == couple["viewer"].id,
        )
    ).scalar_one()
    membership.status = MembershipStatus.LEFT.value
    session.flush()

    assert _map(client, couple).status_code in {403, 404}
    settings = client.get(
        f"{_base(couple['space'].id)}/settings", headers=auth(couple["sharer_token"])
    ).json()
    assert settings["state"] == "PARTNER_CHANGED"
    assert settings["available"] is False
    assert retention.purge(session) >= 1
    assert session.execute(select(PresenceSnapshot)).scalars().all() == []


def test_outsider_cannot_reach_another_space(client, session: Session, couple) -> None:  # type: ignore[no-untyped-def]
    _grant(session, couple)
    response = client.get(
        f"{_base(couple['space'].id)}/map", headers=auth(couple["outsider_token"])
    )
    assert response.status_code in {403, 404}


def test_disabled_deployment_accepts_only_stop(  # type: ignore[no-untyped-def]
    client, session: Session, couple, monkeypatch: pytest.MonkeyPatch
) -> None:
    _grant(session, couple)
    monkeypatch.setattr(presence_service, "feature_enabled", lambda: False)
    base = _base(couple["space"].id)
    blocked = client.put(
        f"{base}/settings",
        json={"level": "DISTANCE", "indefinite": True},
        headers=auth(couple["sharer_token"]),
    )
    assert blocked.status_code == 422
    assert blocked.json()["code"] == "partner_location_disabled"
    assert (
        client.put(
            f"{base}/settings", json={"level": "OFF"}, headers=auth(couple["sharer_token"])
        ).status_code
        == 200
    )
    assert _distance(client, couple).json()["available"] is False
