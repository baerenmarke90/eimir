"""ServerAdmin manual entitlement grant/revoke (V1 launch entitlement source)."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from eimir.administration.models import InstanceAdministrationActionEvent
from eimir.auth import recent_auth
from eimir.config import get_settings
from eimir.core.clock import now
from eimir.entitlements.models import EntitlementGrant, EntitlementSourceType
from eimir.identity.models import DeviceSession
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

ADMIN_EMAIL = "operator@example.test"


@pytest.fixture
def server_admin_allowlist(monkeypatch):  # type: ignore[no-untyped-def]
    monkeypatch.setenv("EIMIR_SERVER_ADMIN_EMAILS", f'["{ADMIN_EMAIL}"]')
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _admin(session):  # type: ignore[no-untyped-def]
    """A ServerAdmin with a live SERVER_ADMIN_ACTION step-up grant.

    Entitlement grant/revoke are high-risk actions like account deletion and
    email verification and require the same recent re-authentication; the
    grant issued here stands in for a real step-up ceremony.
    """
    from eimir.identity.models import AccountEmail

    account = make_account(session, "Operator")
    session.add(
        AccountEmail(
            account_id=account.id,
            email=ADMIN_EMAIL,
            is_primary=True,
            verified_at=now(),
        )
    )
    token = sign_in(session, account)
    device_session = session.execute(
        select(DeviceSession).where(DeviceSession.account_id == account.id)
    ).scalar_one()
    recent_auth.issue_grant(
        session,
        account,
        device_session,
        purpose=recent_auth.RecentAuthenticationPurpose.SERVER_ADMIN_ACTION,
        method=recent_auth.RecentAuthenticationMethod.LOCAL_PASSWORD,
    )
    session.flush()
    return account, token


def test_entitlement_endpoints_require_authentication(client) -> None:  # type: ignore[no-untyped-def]
    space_id = "00000000-0000-0000-0000-000000000000"
    assert client.get(f"/api/v1/server-admin/spaces/{space_id}/entitlement").status_code == 401
    assert (
        client.post(
            f"/api/v1/server-admin/spaces/{space_id}/entitlement/grants",
            json={"reason": "test"},
        ).status_code
        == 401
    )


def test_ordinary_account_is_forbidden(client, session) -> None:  # type: ignore[no-untyped-def]
    account = make_account(session, "Someone")
    token = sign_in(session, account)
    space = make_space(session, account)

    response = client.get(
        f"/api/v1/server-admin/spaces/{space.id}/entitlement",
        headers=auth(token),
    )
    assert response.status_code == 403


def test_unknown_space_is_privacy_safe_not_found(client, session, server_admin_allowlist) -> None:  # type: ignore[no-untyped-def]
    _, admin_token = _admin(session)
    unknown_space_id = "00000000-0000-0000-0000-000000000000"

    response = client.get(
        f"/api/v1/server-admin/spaces/{unknown_space_id}/entitlement",
        headers=auth(admin_token),
    )
    assert response.status_code == 404


def test_new_space_starts_free_with_no_grant_history(
    client, session, server_admin_allowlist
) -> None:  # type: ignore[no-untyped-def]
    admin, admin_token = _admin(session)
    space = make_space(session, admin)

    response = client.get(
        f"/api/v1/server-admin/spaces/{space.id}/entitlement",
        headers=auth(admin_token),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["tier"] == "FREE"
    assert body["grants"] == []


def test_admin_can_grant_and_the_grant_is_audited(client, session, server_admin_allowlist) -> None:  # type: ignore[no-untyped-def]
    admin, admin_token = _admin(session)
    space = make_space(session, admin)

    response = client.post(
        f"/api/v1/server-admin/spaces/{space.id}/entitlement/grants",
        headers=auth(admin_token),
        json={"reason": "manual launch grant for a beta tester"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["tier"] == "PREMIUM"
    assert body["status"] == "ACTIVE"
    assert len(body["grants"]) == 1
    assert body["grants"][0]["sourceType"] == "ADMIN_GRANT"

    grant = session.execute(
        select(EntitlementGrant).where(EntitlementGrant.space_id == space.id)
    ).scalar_one()
    assert grant.source_type == EntitlementSourceType.ADMIN_GRANT.value
    assert grant.metadata_["reason"] == "manual launch grant for a beta tester"
    assert set(grant.metadata_.keys()) == {"reason"}

    action = session.execute(
        select(InstanceAdministrationActionEvent).where(
            InstanceAdministrationActionEvent.target_space_id == space.id
        )
    ).scalar_one()
    assert action.action == "space_entitlement_granted"
    assert action.actor_id == admin.id


def test_grant_without_a_reason_is_rejected(client, session, server_admin_allowlist) -> None:  # type: ignore[no-untyped-def]
    admin, admin_token = _admin(session)
    space = make_space(session, admin)

    response = client.post(
        f"/api/v1/server-admin/spaces/{space.id}/entitlement/grants",
        headers=auth(admin_token),
        json={"reason": ""},
    )

    assert response.status_code == 422


def test_admin_can_revoke_a_grant_and_capability_becomes_free_again(
    client, session, server_admin_allowlist
) -> None:  # type: ignore[no-untyped-def]
    admin, admin_token = _admin(session)
    space = make_space(session, admin)

    grant_response = client.post(
        f"/api/v1/server-admin/spaces/{space.id}/entitlement/grants",
        headers=auth(admin_token),
        json={"reason": "temporary promo"},
    )
    grant_id = grant_response.json()["grants"][0]["id"]

    revoke_response = client.post(
        f"/api/v1/server-admin/spaces/{space.id}/entitlement/grants/{grant_id}/revoke",
        headers=auth(admin_token),
        json={"reason": "promo period ended"},
    )

    assert revoke_response.status_code == 200
    body = revoke_response.json()
    assert body["tier"] == "FREE"
    assert len(body["grants"]) == 1
    assert body["grants"][0]["status"] == "REVOKED"

    action = session.execute(
        select(InstanceAdministrationActionEvent).where(
            InstanceAdministrationActionEvent.target_space_id == space.id,
            InstanceAdministrationActionEvent.action == "space_entitlement_revoked",
        )
    ).scalar_one()
    assert action.actor_id == admin.id


def test_cannot_revoke_a_grant_belonging_to_another_space(
    client, session, server_admin_allowlist
) -> None:  # type: ignore[no-untyped-def]
    admin, admin_token = _admin(session)
    space_a = make_space(session, admin)
    other_founder = make_account(session, "Other")
    space_b = make_space(session, other_founder)

    grant_response = client.post(
        f"/api/v1/server-admin/spaces/{space_a.id}/entitlement/grants",
        headers=auth(admin_token),
        json={"reason": "grant on space A"},
    )
    grant_id = grant_response.json()["grants"][0]["id"]

    cross_space_response = client.post(
        f"/api/v1/server-admin/spaces/{space_b.id}/entitlement/grants/{grant_id}/revoke",
        headers=auth(admin_token),
        json={"reason": "wrong space"},
    )

    assert cross_space_response.status_code == 404
    grant = session.get(EntitlementGrant, grant_id)
    assert grant.status == "ACTIVE"
