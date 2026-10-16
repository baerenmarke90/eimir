"""Runtime registration policy and maintenance-mode integration tests."""

from __future__ import annotations

import pytest

from eimir.administration import service as administration
from eimir.config import get_settings
from eimir.core.clock import now
from eimir.identity import service as accounts
from eimir.identity.models import AccountEmail
from tests.conftest import (
    TEST_BOOTSTRAP_TOKEN,
    auth,
    make_account,
    make_space,
    requires_database,
    sign_in,
)

pytestmark = [pytest.mark.integration, requires_database]

ADMIN_EMAIL = "operator@example.test"
GOOD_PASSWORD = "ein-ausreichend-langes-passwort"


@pytest.fixture
def server_admin_allowlist(monkeypatch):  # type: ignore[no-untyped-def]
    monkeypatch.setenv("EIMIR_SERVER_ADMIN_EMAILS", f'["{ADMIN_EMAIL}"]')
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _admin_token(session) -> tuple[object, str]:  # type: ignore[no-untyped-def]
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
    session.flush()
    return account, token


def test_public_instance_status_defaults_to_available(client) -> None:  # type: ignore[no-untyped-def]
    response = client.get("/api/v1/instance/status")

    assert response.status_code == 200
    assert response.json() == {
        "maintenanceMode": False,
        "registrationAvailable": True,
        "registrationUnavailableReason": None,
        "auth": {
            "localPassword": True,
            "passkey": True,
            "magicLink": True,
            "oidc": False,
        },
        # The default test deployment is Self-Hosted: new Accounts come from
        # bootstrap/invitation, never from self-service signup.
        "accountCreation": "invitation",
        "selfServiceSignupAvailable": False,
    }


def test_server_admin_settings_require_authorization(client, session) -> None:  # type: ignore[no-untyped-def]
    assert client.get("/api/v1/server-admin/settings").status_code == 401

    account = make_account(session, "Ordinary")
    token = sign_in(session, account)
    response = client.get("/api/v1/server-admin/settings", headers=auth(token))

    assert response.status_code == 403
    assert response.json()["code"] == "SERVER_ADMIN_REQUIRED"


def test_registration_toggle_is_persisted_effective_and_audited(
    client,
    session,
    server_admin_allowlist,
) -> None:  # type: ignore[no-untyped-def]
    account, token = _admin_token(session)

    response = client.put(
        "/api/v1/server-admin/settings/registration",
        headers=auth(token),
        json={"enabled": False},
    )

    assert response.status_code == 200
    assert response.json()["registrationEnabled"] is False
    assert response.json()["maintenanceMode"] is False
    assert response.json()["effectiveRegistrationEnabled"] is False

    public = client.get("/api/v1/instance/status")
    assert public.json()["registrationAvailable"] is False
    assert public.json()["registrationUnavailableReason"] == "administrator"

    activity = client.get("/api/v1/server-admin/activity", headers=auth(token))
    assert activity.status_code == 200
    assert activity.json()[0]["actorId"] == str(account.id)
    assert activity.json()[0]["setting"] == "registration_enabled"
    assert activity.json()[0]["previousValue"] is True
    assert activity.json()[0]["newValue"] is False


def test_maintenance_blocks_product_but_keeps_health_and_admin_recovery(
    client,
    session,
    server_admin_allowlist,
) -> None:  # type: ignore[no-untyped-def]
    _, token = _admin_token(session)
    account = accounts.find_by_email(session, ADMIN_EMAIL)
    assert account is not None
    space = make_space(session, account)

    enabled = client.put(
        "/api/v1/server-admin/settings/maintenance",
        headers=auth(token),
        json={"enabled": True},
    )
    assert enabled.status_code == 200
    assert enabled.json()["registrationEnabled"] is True
    assert enabled.json()["maintenanceMode"] is True
    assert enabled.json()["effectiveRegistrationEnabled"] is False

    blocked = client.get(f"/api/v1/spaces/{space.id}", headers=auth(token))
    assert blocked.status_code == 503
    assert blocked.json()["code"] == "MAINTENANCE_MODE"

    assert client.get("/api/v1/health").status_code == 200
    assert client.get("/api/v1/server-admin/settings", headers=auth(token)).status_code == 200

    public = client.get("/api/v1/instance/status")
    assert public.json()["registrationUnavailableReason"] == "maintenance"

    disabled = client.put(
        "/api/v1/server-admin/settings/maintenance",
        headers=auth(token),
        json={"enabled": False},
    )
    assert disabled.status_code == 200
    assert disabled.json()["registrationEnabled"] is True
    assert disabled.json()["effectiveRegistrationEnabled"] is True
    assert client.get(f"/api/v1/spaces/{space.id}", headers=auth(token)).status_code == 200


def test_disabled_registration_rejects_new_invited_account_but_not_existing_account(
    client,
    session,
) -> None:  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    space = make_space(session, anna)
    anna_token = sign_in(session, anna)
    invitation = client.post(
        f"/api/v1/spaces/{space.id}/invitations", headers=auth(anna_token)
    ).json()

    settings = administration.get_settings(session)
    settings.registration_enabled = False
    session.flush()

    response = client.post(
        "/api/v1/auth/register",
        json={
            "displayName": "Ben",
            "email": "ben@example.org",
            "password": GOOD_PASSWORD,
            "invitationToken": invitation["token"],
        },
    )

    assert response.status_code == 403
    assert response.json()["code"] == "REGISTRATION_DISABLED"
    assert accounts.find_by_email(session, "ben@example.org") is None
    assert client.get(f"/api/v1/spaces/{space.id}", headers=auth(anna_token)).status_code == 200


def test_bootstrap_recovery_remains_available_when_registration_is_disabled(
    client,
    session,
) -> None:  # type: ignore[no-untyped-def]
    settings = administration.get_settings(session)
    settings.registration_enabled = False
    session.flush()

    response = client.post(
        "/api/v1/auth/register",
        json={
            "displayName": "Bootstrap Admin",
            "email": "bootstrap@example.org",
            "password": GOOD_PASSWORD,
            "bootstrapToken": TEST_BOOTSTRAP_TOKEN,
        },
    )

    assert response.status_code == 201
    assert response.json()["tokens"]["accessToken"]
