"""Every Pro route is absent without the plugin and paywalled without a grant (Decision 0017).

Acceptance criterion 4 of #2082: Core-only, every Pro path answers ``404`` and
the plugin-owned capabilities are not effective even with an active Premium
grant; with the plugin loaded, a Space without a grant gets ``403`` from every
paywalled Pro route. The non-paywallable exits of the freemium matrix are
listed with their reason and must never answer with the Premium error.
"""

from __future__ import annotations

import re
from datetime import timedelta
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from eimir.core import clock
from eimir.core.errors import ErrorCode
from eimir.entitlements import service as entitlements
from eimir.entitlements.models import (
    EntitlementSourceType,
    EntitlementStatus,
    EntitlementTier,
)
from eimir.main import create_app
from eimir.plugins.manifest import PLUGIN_CAPABILITIES
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in
from tests.integration.test_endpoint_matrix import SPACE_ENDPOINTS
from tests.support.plugins import operation_key, pro_operations, requires_pro, without_plugins

pytestmark = [pytest.mark.integration, requires_database]

PRO_OPERATIONS = sorted(pro_operations())

_S = "/api/v1/spaces/{spaceId}"
_EXIT = "an exit that stays available after a downgrade (freemium matrix)"
_RECEPTION = "once-message reception and deletion are not paywallable (freemium matrix)"
_SOFT = "soft-gated: the neutral unavailable state, no location stored or shown"

NON_PAYWALLABLE: dict[tuple[str, str], str] = {
    ("DELETE", f"{_S}/calendar-sync/connections/{{connectionId}}"): f"Disconnect, {_EXIT}",
    ("DELETE", f"{_S}/calendar-sync/target"): f"Stopping the shared calendar, {_EXIT}",
    ("POST", f"{_S}/calendar-sync/target/pause"): f"Pausing the shared calendar, {_EXIT}",
    ("GET", f"{_S}/calendar-sync"): "State read; shows the Pro state without a grant",
    ("GET", f"{_S}/calendar-sync/plans/{{planId}}"): "Sync state of one Plan, read only",
    ("GET", f"{_S}/calendar-sync/connections/{{connectionId}}/calendars"): (
        "Reads the caller's own connection; creating one is paywalled"
    ),
    ("POST", f"{_S}/calendar-sync/plans/{{planId}}/resolve"): (
        "Detach and dismiss are exits; overwrite is paywalled after the target check"
    ),
    ("GET", "/api/v1/calendar-sync/google/callback"): "OAuth return without a Space",
    ("GET", "/api/v1/photo-sources/google/callback"): "OAuth return without a Space",
    ("GET", f"{_S}/photo-sources"): "State read; shows the Pro state without a grant",
    ("DELETE", f"{_S}/photo-sources/immich"): f"Disconnect, {_EXIT}",
    ("DELETE", f"{_S}/photo-sources/google/account"): f"Account hint removal, {_EXIT}",
    ("DELETE", f"{_S}/photo-selections/{{selectionId}}"): f"Ending a selection, {_EXIT}",
    ("GET", f"{_S}/once-messages"): _RECEPTION,
    ("GET", f"{_S}/once-messages/status"): _RECEPTION,
    ("GET", f"{_S}/once-messages/{{messageId}}"): _RECEPTION,
    ("POST", f"{_S}/once-messages/{{messageId}}/open"): _RECEPTION,
    ("POST", f"{_S}/once-messages/{{messageId}}/acknowledge"): _RECEPTION,
    ("DELETE", f"{_S}/once-messages/{{messageId}}"): _RECEPTION,
    ("PUT", f"{_S}/once-messages/reception"): _RECEPTION,
    ("GET", f"{_S}/partner-location/settings"): "Reading one's own consent is not paywallable",
    ("PUT", f"{_S}/partner-location/settings"): (
        "Stop and lowering are not paywallable; raising the level is paywalled"
    ),
    ("GET", f"{_S}/partner-location/map"): _SOFT,
    ("POST", f"{_S}/partner-location/distance"): _SOFT,
    ("PUT", f"{_S}/partner-location/snapshot"): f"{_SOFT}; sharing is suspended",
    ("PUT", f"{_S}/partner-location/device-credential"): (
        "Needs an active share, which needs the grant"
    ),
    ("DELETE", f"{_S}/partner-location/device-credential/{{deviceId}}"): (
        f"Revoking a device, {_EXIT}"
    ),
    ("PUT", "/api/v1/partner-location/device-snapshot"): (
        "Authenticated by a device credential, which only an active share issues"
    ),
}
"""Pro operations that stay available without a grant, with the matrix reason."""

_BODIES = {
    operation_key(endpoint.method, endpoint.template): endpoint for endpoint in SPACE_ENDPOINTS
}
_PARAMETER = re.compile(r"\{([^}]*)\}")
# Path values that must be valid before a route reaches its capability check.
_PATH_VALUES = {"animal": "SNAIL", "kind": "HAPPINESS", "imageId": "eimir-date-001"}


def _path(template: str, space_id: str) -> str:
    def value(match: re.Match[str]) -> str:
        name = match.group(1)
        if name in {"space_id", "spaceId"}:
            return space_id
        return _PATH_VALUES.get(name, str(uuid4()))

    return _PARAMETER.sub(value, template)


@pytest.fixture
def integrations_on(monkeypatch):  # type: ignore[no-untyped-def]
    """Configured integrations, so a route reaches its capability check."""
    from eimir_pro.presence import service as presence

    from eimir.calendar_sync import google as calendar_google
    from eimir.calendar_sync import service as calendar_sync
    from eimir.photo_sources import service as photo_sources

    monkeypatch.setattr(calendar_sync, "available", lambda: True)
    monkeypatch.setattr(calendar_google, "_require_client", lambda: object())
    monkeypatch.setattr(photo_sources, "enabled", lambda: True)
    monkeypatch.setattr(presence, "feature_enabled", lambda: True)


def _request(client: TestClient, method: str, template: str, space_id: str, token: str) -> Any:
    endpoint = _BODIES.get(operation_key(method, template))
    body = endpoint.body if endpoint is not None else None
    query = endpoint.query if endpoint is not None else None
    headers = {**auth(token), "If-Match": '"0"', "Idempotency-Key": str(uuid4())}
    return client.request(
        method,
        _path(template, space_id),
        json=body if method not in {"GET", "DELETE"} else None,
        params=query or None,
        headers=headers,
    )


def _json(response: Any) -> Any:
    try:
        return response.json()
    except ValueError:
        return None


def _code(response: Any) -> str | None:
    payload = _json(response)
    return payload.get("code") if isinstance(payload, dict) else None


def _has_location(payload: Any) -> bool:
    if isinstance(payload, dict):
        return any(
            (key in {"latitude", "longitude"} and value is not None) or _has_location(value)
            for key, value in payload.items()
        )
    if isinstance(payload, list):
        return any(_has_location(item) for item in payload)
    return False


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna, ben = make_account(session, "Anna"), make_account(session, "Ben")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    session.flush()
    return {"anna": anna, "space": space, "token": sign_in(session, anna)}


def test_the_plugin_mounts_pro_routes() -> None:
    assert len(PRO_OPERATIONS) > 50
    assert set(NON_PAYWALLABLE) <= set(PRO_OPERATIONS)


@pytest.mark.parametrize(("method", "template"), PRO_OPERATIONS, ids=str)
def test_without_the_plugin_every_pro_route_answers_404(  # type: ignore[no-untyped-def]
    session, couple, method: str, template: str
) -> None:
    with without_plugins():
        app = create_app()
    contract = {
        operation_key(path_method, path)
        for path, operations in app.openapi()["paths"].items()
        for path_method in operations
    }
    assert operation_key(method, template) not in contract
    client = TestClient(app)
    response = _request(client, method, template, str(couple["space"].id), couple["token"])
    assert response.status_code in {404, 405}, response.text


@requires_pro
@pytest.mark.parametrize(("method", "template"), PRO_OPERATIONS, ids=str)
def test_without_a_grant_every_paywalled_pro_route_answers_403(  # type: ignore[no-untyped-def]
    client, session, couple, integrations_on, method: str, template: str
) -> None:
    response = _request(client, method, template, str(couple["space"].id), couple["token"])
    code = _code(response)
    if (method, template) in NON_PAYWALLABLE:
        assert code != ErrorCode.PREMIUM_ENTITLEMENT_REQUIRED, response.text
        assert response.status_code < 500, response.text
        assert not _has_location(_json(response)), "no location without the capability"
        return
    assert (response.status_code, code) == (403, ErrorCode.PREMIUM_ENTITLEMENT_REQUIRED)


def _premium(session: Session, couple) -> None:  # type: ignore[no-untyped-def]
    entitlements.record_grant(
        session,
        space_id=couple["space"].id,
        account_id=couple["anna"].id,
        source_type=EntitlementSourceType.TEST_FIXTURE,
        status=EntitlementStatus.ACTIVE,
        tier=EntitlementTier.PREMIUM,
        effective_from=clock.now() - timedelta(days=1),
    )
    session.flush()


def test_without_the_plugin_its_capabilities_are_not_effective(session, couple) -> None:  # type: ignore[no-untyped-def]
    _premium(session, couple)
    with without_plugins():
        effective = entitlements.get_effective_space_entitlement(session, couple["space"].id)
        assert effective.tier is EntitlementTier.PREMIUM
        assert not PLUGIN_CAPABILITIES & set(effective.capabilities)
        # Core capabilities of the same grant stay effective.
        core = set(entitlements.ALL_PREMIUM_CAPABILITIES) - PLUGIN_CAPABILITIES
        assert core - entitlements.CLOUD_ONLY_CAPABILITIES <= set(effective.capabilities)
        for capability in PLUGIN_CAPABILITIES:
            assert not entitlements.has_capability(session, couple["space"].id, capability)


@requires_pro
def test_with_the_plugin_its_capabilities_are_effective(session, couple) -> None:  # type: ignore[no-untyped-def]
    _premium(session, couple)
    effective = entitlements.get_effective_space_entitlement(session, couple["space"].id)
    assert set(effective.capabilities) >= PLUGIN_CAPABILITIES


def test_without_the_plugin_encryption_status_reports_the_pro_payload_tables(session) -> None:  # type: ignore[no-untyped-def]
    from eimir.plugins.manifest import protected_payload_tables
    from eimir.security import lifecycle

    with without_plugins():
        reported = {report.table for report in lifecycle.payload_status(session)}
    assert {row.table for row in protected_payload_tables()} <= reported
