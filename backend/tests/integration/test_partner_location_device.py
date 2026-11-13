"""Background upload credentials for partner location (#1792)."""

from __future__ import annotations

from datetime import timedelta
from typing import Any
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.auth import sessions
from eimir.core.clock import now
from eimir.entitlements import service as entitlements
from eimir.identity.models import DeviceSession
from eimir.presence.models import (
    PartnerLocationConsent,
    PresenceDeviceCredential,
    PresenceSnapshot,
)
from tests.conftest import auth, requires_database
from tests.integration.test_partner_location import (
    HAMBURG,
    _base,
    _distance,
    _grant,
    _share,
    couple,
)

pytestmark = [pytest.mark.integration, requires_database]

__all__ = ["couple"]


def _issue(client: Any, couple: dict[str, Any], device_id: str) -> Any:
    return client.put(
        f"{_base(couple['space'].id)}/device-credential",
        json={"deviceId": device_id},
        headers=auth(couple["sharer_token"]),
    )


def _device_publish(client: Any, credential: str) -> Any:
    return client.put(
        "/api/v1/partner-location/device-snapshot",
        json={**HAMBURG, "accuracyMeters": 40, "capturedAt": now().isoformat()},
        headers={"Authorization": f"Presence {credential}"},
    )


def test_background_credential_publishes_only_for_the_active_share(  # type: ignore[no-untyped-def]
    client, session: Session, couple
) -> None:
    device_id = str(uuid4())
    _grant(session, couple)
    assert _issue(client, couple, device_id).status_code == 409  # nothing shared yet

    shared = _share(client, couple, "DISTANCE")
    issued = _issue(client, couple, device_id)
    assert issued.status_code == 200
    assert issued.headers["Cache-Control"] == "no-store"
    body = issued.json()
    assert body["consentGeneration"] == shared["generation"]
    stored = session.execute(select(PresenceDeviceCredential)).scalar_one()
    assert stored.token_hash != body["credential"]

    published = _device_publish(client, body["credential"])
    assert published.status_code == 200
    assert published.json() == {"active": True}
    assert _distance(client, couple).json()["available"] is True

    # A bearer access token can never publish through the device route.
    bearer = client.put(
        "/api/v1/partner-location/device-snapshot",
        json={**HAMBURG, "accuracyMeters": 40, "capturedAt": now().isoformat()},
        headers=auth(couple["sharer_token"]),
    )
    assert bearer.status_code == 401


def test_any_settings_change_or_stop_ends_the_background_credential(  # type: ignore[no-untyped-def]
    client, session: Session, couple
) -> None:
    _grant(session, couple)
    _share(client, couple, "DISTANCE")
    credential = _issue(client, couple, str(uuid4())).json()["credential"]
    _share(client, couple, "DISTANCE_AND_MAP")
    assert _device_publish(client, credential).status_code == 401

    credential = _issue(client, couple, str(uuid4())).json()["credential"]
    client.put(
        f"{_base(couple['space'].id)}/settings",
        json={"level": "OFF"},
        headers=auth(couple["sharer_token"]),
    )
    assert _device_publish(client, credential).status_code == 401
    assert session.execute(select(PresenceDeviceCredential)).scalars().all() == []


def test_expired_share_and_lost_entitlement_deactivate_the_device(  # type: ignore[no-untyped-def]
    client, session: Session, couple
) -> None:
    grant = _grant(session, couple)
    shared = client.put(
        f"{_base(couple['space'].id)}/settings",
        json={"level": "DISTANCE", "expiresAt": (now() + timedelta(hours=1)).isoformat()},
        headers=auth(couple["sharer_token"]),
    ).json()
    assert shared["state"] == "ACTIVE"
    credential = _issue(client, couple, str(uuid4())).json()["credential"]
    consent = session.execute(select(PartnerLocationConsent)).scalar_one()
    consent.expires_at = now() - timedelta(seconds=1)
    session.flush()
    assert _device_publish(client, credential).json() == {"active": False}
    assert session.execute(select(PresenceDeviceCredential)).scalars().all() == []

    _share(client, couple, "DISTANCE")
    credential = _issue(client, couple, str(uuid4())).json()["credential"]
    entitlements.revoke_grant(session, grant.id)
    session.flush()
    assert _device_publish(client, credential).json() == {"active": False}
    assert session.execute(select(PresenceSnapshot)).scalars().all() == []


def test_signing_out_the_issuing_session_ends_the_credential(  # type: ignore[no-untyped-def]
    client, session: Session, couple
) -> None:
    _grant(session, couple)
    _share(client, couple)
    credential = _issue(client, couple, str(uuid4())).json()["credential"]
    stored = session.execute(select(PresenceDeviceCredential)).scalar_one()
    device_session = session.get(DeviceSession, stored.device_session_id)
    assert device_session is not None
    sessions.revoke(device_session)
    session.flush()
    assert _device_publish(client, credential).status_code == 401


def test_revoke_and_device_limit(client, session: Session, couple) -> None:  # type: ignore[no-untyped-def]
    _grant(session, couple)
    _share(client, couple)
    devices = [str(uuid4()) for _ in range(4)]
    for device_id in devices:
        assert _issue(client, couple, device_id).status_code == 200
    owned = {
        str(credential.device_id)
        for credential in session.execute(select(PresenceDeviceCredential)).scalars()
    }
    assert owned == set(devices[1:])

    revoked = client.delete(
        f"{_base(couple['space'].id)}/device-credential/{devices[3]}",
        headers=auth(couple["sharer_token"]),
    )
    assert revoked.status_code == 204
    owned = {
        str(credential.device_id)
        for credential in session.execute(select(PresenceDeviceCredential)).scalars()
    }
    assert owned == set(devices[1:3])
