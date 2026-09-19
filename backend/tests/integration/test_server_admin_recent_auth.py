"""ServerAdmin recent-authentication HTTP and isolation contract."""

from __future__ import annotations

from datetime import timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.auth import passwords, recent_auth, recent_oidc, recent_passkeys, sessions
from eimir.auth.policy import AuthCapabilities
from eimir.auth.recent_auth_models import RecentAuthenticationGrant
from eimir.config import get_settings
from eimir.core.clock import now
from eimir.core.errors import ForbiddenError
from eimir.identity import service as accounts
from eimir.identity.models import AccountEmail, DeviceSession
from tests.conftest import auth, make_account, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

ADMIN_EMAIL = "recent-admin@example.test"
PASSWORD = "server-admin-recent-auth-password"
SERVER_PURPOSE = recent_auth.RecentAuthenticationPurpose.SERVER_ADMIN_ACTION
ACCOUNT_PURPOSE = recent_auth.RecentAuthenticationPurpose.ACCOUNT_DELETION


@pytest.fixture
def server_admin_allowlist(monkeypatch):  # type: ignore[no-untyped-def]
    monkeypatch.setenv("EIMIR_SERVER_ADMIN_EMAILS", f'["{ADMIN_EMAIL}"]')
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _admin(session: Session):  # type: ignore[no-untyped-def]
    account = accounts.create_account(
        session,
        display_name="Recent Admin",
        email=ADMIN_EMAIL,
        password_hash=passwords.hash_password(PASSWORD),
    )
    email = session.execute(
        select(AccountEmail).where(
            AccountEmail.account_id == account.id,
            AccountEmail.is_primary.is_(True),
        )
    ).scalar_one()
    email.verified_at = now()
    token = sign_in(session, account)
    device_session = session.execute(
        select(DeviceSession).where(DeviceSession.account_id == account.id)
    ).scalar_one()
    session.flush()
    return account, token, device_session


def _target_email(session: Session):  # type: ignore[no-untyped-def]
    target = make_account(session, "Target")
    email = AccountEmail(
        account_id=target.id,
        email="recent-target@example.test",
        is_primary=True,
    )
    session.add(email)
    session.flush()
    return target, email


def _issue(session: Session, account, device_session, purpose=SERVER_PURPOSE) -> None:  # type: ignore[no-untyped-def]
    recent_auth.issue_grant(
        session,
        account,
        device_session,
        purpose=purpose,
        method=recent_auth.RecentAuthenticationMethod.LOCAL_PASSWORD,
    )
    session.flush()


def test_server_admin_recent_auth_capabilities_require_server_admin(
    client,
    session: Session,
    server_admin_allowlist,
) -> None:  # type: ignore[no-untyped-def]
    anonymous = client.get("/api/v1/auth/recent-authentication/server-admin")
    assert anonymous.status_code == 401

    normal = make_account(session, "Normal")
    normal_token = sign_in(session, normal)
    forbidden = client.get(
        "/api/v1/auth/recent-authentication/server-admin",
        headers=auth(normal_token),
    )
    assert forbidden.status_code == 403
    assert forbidden.json()["code"] == "SERVER_ADMIN_REQUIRED"

    _, admin_token, _ = _admin(session)
    allowed = client.get(
        "/api/v1/auth/recent-authentication/server-admin",
        headers=auth(admin_token),
    )
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["localPassword"] is True
    assert allowed.json()["expiresInSeconds"] == int(
        recent_auth.RECENT_AUTH_LIFETIME.total_seconds()
    )


def test_privileged_server_admin_actions_fail_closed_without_grant(
    client,
    session: Session,
    server_admin_allowlist,
) -> None:  # type: ignore[no-untyped-def]
    _, admin_token, _ = _admin(session)
    target, email = _target_email(session)

    verification = client.post(
        f"/api/v1/server-admin/accounts/{target.id}/emails/{email.id}/verify",
        headers=auth(admin_token),
        json={"confirmationEmail": email.email},
    )
    recovery = client.post(
        f"/api/v1/server-admin/accounts/{target.id}/recovery/operator",
        headers=auth(admin_token),
    )

    assert verification.status_code == recovery.status_code == 403
    assert verification.json()["code"] == recent_auth.RecentAuthenticationErrorCode.REQUIRED
    assert recovery.json()["code"] == recent_auth.RecentAuthenticationErrorCode.REQUIRED


def test_password_step_up_issues_server_admin_purpose_and_authorizes_action(
    client,
    session: Session,
    server_admin_allowlist,
) -> None:  # type: ignore[no-untyped-def]
    _, admin_token, _ = _admin(session)
    target, email = _target_email(session)

    stepped_up = client.post(
        "/api/v1/auth/recent-authentication/server-admin/password",
        headers=auth(admin_token),
        json={"password": PASSWORD},
    )
    assert stepped_up.status_code == 200, stepped_up.text
    assert stepped_up.json()["purpose"] == SERVER_PURPOSE.value
    assert stepped_up.json()["method"] == recent_auth.RecentAuthenticationMethod.LOCAL_PASSWORD.value

    verified = client.post(
        f"/api/v1/server-admin/accounts/{target.id}/emails/{email.id}/verify",
        headers=auth(admin_token),
        json={"confirmationEmail": email.email},
    )
    assert verified.status_code == 200, verified.text
    assert verified.json()["verifiedAt"] is not None


def test_passkey_finish_uses_server_admin_purpose(
    client,
    session: Session,
    server_admin_allowlist,
    monkeypatch,
) -> None:  # type: ignore[no-untyped-def]
    account, admin_token, device_session = _admin(session)

    def fake_finish(
        db_session,
        current_account,
        current_device_session,
        *,
        purpose,
        credential,
    ):  # type: ignore[no-untyped-def]
        assert purpose is SERVER_PURPOSE
        assert credential == {"id": "test-passkey"}
        return recent_auth.issue_grant(
            db_session,
            current_account,
            current_device_session,
            purpose=purpose,
            method=recent_auth.RecentAuthenticationMethod.PASSKEY,
        )

    monkeypatch.setattr(recent_passkeys, "finish", fake_finish)

    response = client.post(
        "/api/v1/auth/recent-authentication/server-admin/passkeys/finish",
        headers=auth(admin_token),
        json={"credential": {"id": "test-passkey"}},
    )
    assert response.status_code == 200, response.text
    assert response.json()["purpose"] == SERVER_PURPOSE.value
    assert response.json()["method"] == recent_auth.RecentAuthenticationMethod.PASSKEY.value

    grant = recent_auth.require_grant(
        session,
        account,
        device_session,
        purpose=SERVER_PURPOSE,
    )
    assert grant.method == recent_auth.RecentAuthenticationMethod.PASSKEY.value


def test_oidc_callback_uses_server_admin_purpose(
    client,
    session: Session,
    server_admin_allowlist,
    monkeypatch,
) -> None:  # type: ignore[no-untyped-def]
    account, admin_token, device_session = _admin(session)

    monkeypatch.setattr(AuthCapabilities, "ensure_oidc_allowed", lambda self: None)

    def fake_complete(
        db_session,
        connection_id,
        current_account,
        current_device_session,
        *,
        purpose,
        code,
        state,
    ):  # type: ignore[no-untyped-def]
        assert connection_id == "test-oidc"
        assert purpose is SERVER_PURPOSE
        assert code == "authorization-code"
        assert state == "bound-state"
        return recent_auth.issue_grant(
            db_session,
            current_account,
            current_device_session,
            purpose=purpose,
            method=recent_auth.RecentAuthenticationMethod.OIDC,
        )

    monkeypatch.setattr(recent_oidc, "complete", fake_complete)

    response = client.post(
        "/api/v1/auth/recent-authentication/server-admin/oidc/test-oidc/callback",
        headers=auth(admin_token),
        json={"code": "authorization-code", "state": "bound-state"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["purpose"] == SERVER_PURPOSE.value
    assert response.json()["method"] == recent_auth.RecentAuthenticationMethod.OIDC.value

    grant = recent_auth.require_grant(
        session,
        account,
        device_session,
        purpose=SERVER_PURPOSE,
    )
    assert grant.method == recent_auth.RecentAuthenticationMethod.OIDC.value


def test_recent_auth_purposes_are_strictly_isolated(
    client,
    session: Session,
    server_admin_allowlist,
) -> None:  # type: ignore[no-untyped-def]
    admin, admin_token, device_session = _admin(session)
    target, _ = _target_email(session)

    _issue(session, admin, device_session, ACCOUNT_PURPOSE)
    rejected_admin_action = client.post(
        f"/api/v1/server-admin/accounts/{target.id}/recovery/operator",
        headers=auth(admin_token),
    )
    assert rejected_admin_action.status_code == 403
    assert rejected_admin_action.json()["code"] == recent_auth.RecentAuthenticationErrorCode.REQUIRED

    _issue(session, admin, device_session, SERVER_PURPOSE)
    account_grant = session.execute(
        select(RecentAuthenticationGrant).where(
            RecentAuthenticationGrant.account_id == admin.id,
            RecentAuthenticationGrant.device_session_id == device_session.id,
            RecentAuthenticationGrant.purpose == ACCOUNT_PURPOSE.value,
        )
    ).scalar_one()
    session.delete(account_grant)
    session.flush()

    rejected_account_action = client.post(
        "/api/v1/account/deletion",
        headers=auth(admin_token),
        json={"confirmation": "DELETE_ACCOUNT"},
    )
    assert rejected_account_action.status_code == 403
    assert rejected_account_action.json()["code"] == recent_auth.RecentAuthenticationErrorCode.REQUIRED


def test_server_admin_grant_is_bound_to_the_concrete_device_session(
    client,
    session: Session,
    server_admin_allowlist,
) -> None:  # type: ignore[no-untyped-def]
    admin, first_token, first_session = _admin(session)
    second_token = sign_in(session, admin)
    target, _ = _target_email(session)
    _issue(session, admin, first_session)

    first = client.post(
        f"/api/v1/server-admin/accounts/{target.id}/recovery/operator",
        headers=auth(first_token),
    )
    second = client.post(
        f"/api/v1/server-admin/accounts/{target.id}/recovery/operator",
        headers=auth(second_token),
    )

    assert first.status_code == 200, first.text
    assert second.status_code == 403
    assert second.json()["code"] == recent_auth.RecentAuthenticationErrorCode.REQUIRED


def test_expired_server_admin_grant_fails_closed(
    client,
    session: Session,
    server_admin_allowlist,
) -> None:  # type: ignore[no-untyped-def]
    admin, admin_token, device_session = _admin(session)
    target, _ = _target_email(session)
    _issue(session, admin, device_session)

    grant = session.execute(
        select(RecentAuthenticationGrant).where(
            RecentAuthenticationGrant.account_id == admin.id,
            RecentAuthenticationGrant.device_session_id == device_session.id,
            RecentAuthenticationGrant.purpose == SERVER_PURPOSE.value,
        )
    ).scalar_one()
    grant.expires_at = now() - timedelta(seconds=1)
    session.flush()

    rejected = client.post(
        f"/api/v1/server-admin/accounts/{target.id}/recovery/operator",
        headers=auth(admin_token),
    )
    assert rejected.status_code == 403
    assert rejected.json()["code"] == recent_auth.RecentAuthenticationErrorCode.REQUIRED


def test_session_revocation_invalidates_server_admin_grant(
    session: Session,
    server_admin_allowlist,
) -> None:  # type: ignore[no-untyped-def]
    admin, _, device_session = _admin(session)
    _issue(session, admin, device_session)
    sessions.revoke(device_session)
    session.flush()

    with pytest.raises(ForbiddenError) as rejected:
        recent_auth.require_grant(
            session,
            admin,
            device_session,
            purpose=SERVER_PURPOSE,
        )
    assert rejected.value.code == recent_auth.RecentAuthenticationErrorCode.SESSION_INVALID
