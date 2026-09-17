"""ServerAdmin authorization, Account operations, and safe projections."""

from __future__ import annotations

from urllib.parse import parse_qs, urlsplit

import pytest
from sqlalchemy import select

from eimir.administration.models import InstanceAdministrationActionEvent
from eimir.auth import passwords
from eimir.config import get_settings
from eimir.core.clock import now
from eimir.identity import service as accounts
from eimir.identity.models import AccountEmail, DeviceSession
from eimir.jobs.models import Job, JobStatus
from eimir.relationship import service as relationship
from eimir.relationship.models import Space
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

ADMIN_EMAIL = "operator@example.test"


@pytest.fixture
def server_admin_allowlist(monkeypatch):  # type: ignore[no-untyped-def]
    monkeypatch.setenv("EIMIR_SERVER_ADMIN_EMAILS", f'["{ADMIN_EMAIL}"]')
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _add_email(
    session,
    account,
    *,
    email: str = ADMIN_EMAIL,
    verified: bool,
) -> AccountEmail:  # type: ignore[no-untyped-def]
    address = AccountEmail(
        account_id=account.id,
        email=email,
        is_primary=True,
        verified_at=now() if verified else None,
    )
    session.add(address)
    session.flush()
    return address


def _admin(session):  # type: ignore[no-untyped-def]
    account = make_account(session, "Operator")
    _add_email(session, account, verified=True)
    return account, sign_in(session, account)


def test_server_admin_endpoints_require_authentication(client) -> None:  # type: ignore[no-untyped-def]
    response = client.get("/api/v1/server-admin/overview")
    spaces = client.get("/api/v1/server-admin/spaces")

    assert response.status_code == 401
    assert spaces.status_code == 401


def test_allowlisted_but_unverified_email_does_not_grant_server_admin(
    client,
    session,
    server_admin_allowlist,
) -> None:  # type: ignore[no-untyped-def]
    account = make_account(session, "Operator")
    _add_email(session, account, verified=False)
    token = sign_in(session, account)

    capability = client.get("/api/v1/auth/capabilities", headers=auth(token))
    overview = client.get("/api/v1/server-admin/overview", headers=auth(token))
    spaces = client.get("/api/v1/server-admin/spaces", headers=auth(token))

    assert capability.status_code == 200
    assert capability.json() == {
        "serverAdmin": False,
        "auth": {
            "localPassword": True,
            "passkey": True,
            "magicLink": True,
            "oidc": False,
        },
    }
    assert overview.status_code == 403
    assert overview.json()["code"] == "SERVER_ADMIN_REQUIRED"
    assert spaces.status_code == 403
    assert spaces.json()["code"] == "SERVER_ADMIN_REQUIRED"


def test_verified_allowlisted_account_gets_server_admin_capability_and_extended_overview(
    client,
    session,
    server_admin_allowlist,
) -> None:  # type: ignore[no-untyped-def]
    account = make_account(session, "Operator")
    _add_email(session, account, verified=True)
    make_space(session, account)
    token = sign_in(session, account)

    other = make_account(session, "Unverified")
    _add_email(session, other, email="unverified@example.test", verified=False)

    capability = client.get("/api/v1/auth/capabilities", headers=auth(token))
    overview = client.get("/api/v1/server-admin/overview", headers=auth(token))

    assert capability.status_code == 200
    assert capability.json() == {
        "serverAdmin": True,
        "auth": {
            "localPassword": True,
            "passkey": True,
            "magicLink": True,
            "oidc": False,
        },
    }
    assert overview.status_code == 200
    payload = overview.json()
    assert payload["applicationStatus"] == "ok"
    assert payload["databaseStatus"] == "ok"
    assert payload["deployment"] == "self_hosted"
    assert payload["accountCount"] == 2
    assert payload["enabledAccountCount"] == 2
    assert payload["suspendedAccountCount"] == 0
    assert payload["verifiedPrimaryEmailCount"] == 1
    assert payload["unverifiedPrimaryEmailCount"] == 1
    assert payload["activeSessionCount"] == 1
    assert payload["serverAdminAllowlistCount"] == 1
    assert payload["serverAdminVerifiedMatchCount"] == 1
    assert payload["activeSpaceCount"] == 1


def test_server_admin_overview_never_exposes_job_payload_or_raw_error(
    client,
    session,
    server_admin_allowlist,
) -> None:  # type: ignore[no-untyped-def]
    account, token = _admin(session)
    del account

    secret_payload = "owner-only-payload-must-not-leak"
    secret_error = "postgresql://secret-user:secret-password@private-host/db"
    session.add(
        Job(
            kind="safe-kind",
            payload={"private": secret_payload},
            status=JobStatus.FAILED.value,
            attempts=3,
            max_attempts=3,
            last_error=secret_error,
            finished_at=now(),
        )
    )
    session.flush()

    response = client.get("/api/v1/server-admin/overview", headers=auth(token))

    assert response.status_code == 200
    payload = response.json()
    assert payload["jobsFailed"] == 1
    assert payload["recentFailedJobs"][0]["kind"] == "safe-kind"
    assert "payload" not in payload["recentFailedJobs"][0]
    assert "lastError" not in payload["recentFailedJobs"][0]
    assert secret_payload not in response.text
    assert secret_error not in response.text


def test_account_directory_exposes_identity_metadata_only(
    client,
    session,
    server_admin_allowlist,
) -> None:  # type: ignore[no-untyped-def]
    _, token = _admin(session)
    target = make_account(session, "Target Person")
    _add_email(session, target, email="target@example.test", verified=False)
    make_space(session, target)
    sign_in(session, target)

    response = client.get(
        "/api/v1/server-admin/accounts?query=target",
        headers=auth(token),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["items"][0]["id"] == str(target.id)
    assert payload["items"][0]["primaryEmail"] == "target@example.test"
    assert payload["items"][0]["emailVerified"] is False
    assert payload["items"][0]["activeSessionCount"] == 1
    assert payload["items"][0]["activeMembershipCount"] == 1
    assert set(payload["items"][0]) == {
        "id",
        "displayName",
        "primaryEmail",
        "emailVerified",
        "createdAt",
        "disabledAt",
        "authMethods",
        "activeSessionCount",
        "activeMembershipCount",
    }

    by_id = client.get(
        f"/api/v1/server-admin/accounts?query={target.id}",
        headers=auth(token),
    )
    assert by_id.status_code == 200
    assert by_id.json()["total"] == 1
    assert by_id.json()["items"][0]["id"] == str(target.id)


def test_space_directory_exposes_only_lifecycle_metadata(
    client,
    session,
    server_admin_allowlist,
) -> None:  # type: ignore[no-untyped-def]
    _, token = _admin(session)

    active_owner = make_account(session, "Active owner")
    active_space = make_space(session, active_owner)

    inactive_owner = make_account(session, "Inactive owner")
    inactive_space = make_space(session, inactive_owner)
    membership = relationship.require_membership(session, inactive_owner, inactive_space.id)
    relationship.end_membership(session, membership)

    empty_space = Space()
    session.add(empty_space)
    session.flush()

    response = client.get(
        "/api/v1/server-admin/spaces?status=all&limit=50",
        headers=auth(token),
    )

    assert response.status_code == 200
    payload = response.json()
    by_id = {item["id"]: item for item in payload["items"]}
    assert str(active_space.id) in by_id
    assert str(inactive_space.id) in by_id
    assert str(empty_space.id) in by_id

    expected_fields = {
        "id",
        "createdAt",
        "lifecycleStatus",
        "membershipCount",
        "activeMembershipCount",
        "historicalMembershipCount",
        "leftMembershipCount",
        "removedMembershipCount",
        "firstMembershipAt",
        "lastMembershipChangeAt",
        "anomalyCodes",
    }
    assert set(by_id[str(active_space.id)]) == expected_fields
    assert by_id[str(active_space.id)]["lifecycleStatus"] == "active"
    assert by_id[str(active_space.id)]["activeMembershipCount"] == 1
    assert by_id[str(active_space.id)]["historicalMembershipCount"] == 0

    inactive = by_id[str(inactive_space.id)]
    assert inactive["lifecycleStatus"] == "inactive"
    assert inactive["activeMembershipCount"] == 0
    assert inactive["historicalMembershipCount"] == 1
    assert inactive["leftMembershipCount"] == 1
    assert inactive["removedMembershipCount"] == 0

    empty = by_id[str(empty_space.id)]
    assert empty["lifecycleStatus"] == "empty"
    assert empty["membershipCount"] == 0
    assert empty["anomalyCodes"] == ["no_memberships"]

    inactive_filter = client.get(
        "/api/v1/server-admin/spaces?status=inactive",
        headers=auth(token),
    )
    assert inactive_filter.status_code == 200
    assert {item["id"] for item in inactive_filter.json()["items"]} == {str(inactive_space.id)}

    anomaly_filter = client.get(
        "/api/v1/server-admin/spaces?status=anomaly",
        headers=auth(token),
    )
    assert anomaly_filter.status_code == 200
    assert {item["id"] for item in anomaly_filter.json()["items"]} == {str(empty_space.id)}

    by_exact_id = client.get(
        f"/api/v1/server-admin/spaces?query={inactive_space.id}",
        headers=auth(token),
    )
    assert by_exact_id.status_code == 200
    assert by_exact_id.json()["total"] == 1
    assert by_exact_id.json()["items"][0]["id"] == str(inactive_space.id)

    invalid_id = client.get(
        "/api/v1/server-admin/spaces?query=not-a-space-id",
        headers=auth(token),
    )
    assert invalid_id.status_code == 200
    assert invalid_id.json()["total"] == 0
    assert invalid_id.json()["items"] == []

    detail = client.get(
        f"/api/v1/server-admin/spaces/{inactive_space.id}",
        headers=auth(token),
    )
    assert detail.status_code == 200
    detail_payload = detail.json()
    assert set(detail_payload) == expected_fields | {"latestMembershipEndedAt"}
    assert detail_payload["latestMembershipEndedAt"] is not None
    serialized = detail.text.lower()
    for forbidden in (
        "displayname",
        "email",
        "relationshipstartedon",
        "memory",
        "owner_only",
        "media",
    ):
        assert forbidden not in serialized


def test_server_admin_can_suspend_account_and_sessions_are_revoked(
    client,
    session,
    server_admin_allowlist,
) -> None:  # type: ignore[no-untyped-def]
    admin, admin_token = _admin(session)
    target = make_account(session, "Target")
    _add_email(session, target, email="target@example.test", verified=True)
    target_token = sign_in(session, target)

    response = client.put(
        f"/api/v1/server-admin/accounts/{target.id}/suspension",
        headers=auth(admin_token),
        json={"suspended": True},
    )

    assert response.status_code == 200
    assert response.json()["disabledAt"] is not None
    session.refresh(target)
    assert target.disabled_at is not None
    active_sessions = (
        session.execute(
            select(DeviceSession).where(
                DeviceSession.account_id == target.id,
                DeviceSession.revoked_at.is_(None),
            )
        )
        .scalars()
        .all()
    )
    assert active_sessions == []
    assert client.get("/api/v1/auth/me", headers=auth(target_token)).status_code == 401

    actions = client.get(
        "/api/v1/server-admin/activity/actions",
        headers=auth(admin_token),
    )
    assert actions.status_code == 200
    assert actions.json()[0]["action"] == "account_suspended"
    assert actions.json()[0]["targetAccountId"] == str(target.id)
    assert actions.json()[0]["actorId"] == str(admin.id)


def test_server_admin_cannot_suspend_current_operator(
    client,
    session,
    server_admin_allowlist,
) -> None:  # type: ignore[no-untyped-def]
    admin, token = _admin(session)

    response = client.put(
        f"/api/v1/server-admin/accounts/{admin.id}/suspension",
        headers=auth(token),
        json={"suspended": True},
    )

    assert response.status_code == 403
    assert response.json()["code"] == "SERVER_ADMIN_SELF_LOCKOUT_BLOCKED"


def test_server_admin_can_unsuspend_account(
    client,
    session,
    server_admin_allowlist,
) -> None:  # type: ignore[no-untyped-def]
    _, token = _admin(session)
    target = make_account(session, "Target")
    _add_email(session, target, email="target@example.test", verified=True)
    target.disabled_at = now()
    session.flush()

    response = client.put(
        f"/api/v1/server-admin/accounts/{target.id}/suspension",
        headers=auth(token),
        json={"suspended": False},
    )

    assert response.status_code == 200
    assert response.json()["disabledAt"] is None
    session.refresh(target)
    assert target.disabled_at is None


def test_server_admin_can_revoke_all_account_sessions(
    client,
    session,
    server_admin_allowlist,
) -> None:  # type: ignore[no-untyped-def]
    _, admin_token = _admin(session)
    target = make_account(session, "Target")
    _add_email(session, target, email="target@example.test", verified=True)
    sign_in(session, target)
    sign_in(session, target)

    response = client.post(
        f"/api/v1/server-admin/accounts/{target.id}/sessions/revoke",
        headers=auth(admin_token),
    )

    assert response.status_code == 200
    assert response.json() == {"revokedSessions": 2}


def test_operator_email_verification_requires_exact_typed_confirmation(
    client,
    session,
    server_admin_allowlist,
) -> None:  # type: ignore[no-untyped-def]
    _, token = _admin(session)
    target = make_account(session, "Target")
    email = _add_email(session, target, email="target@example.test", verified=False)

    wrong = client.post(
        f"/api/v1/server-admin/accounts/{target.id}/emails/{email.id}/verify",
        headers=auth(token),
        json={"confirmationEmail": "other@example.test"},
    )
    assert wrong.status_code == 422
    assert wrong.json()["code"] == "SERVER_ADMIN_CONFIRMATION_MISMATCH"

    response = client.post(
        f"/api/v1/server-admin/accounts/{target.id}/emails/{email.id}/verify",
        headers=auth(token),
        json={"confirmationEmail": " TARGET@example.test "},
    )

    assert response.status_code == 200
    assert response.json()["email"] == "target@example.test"
    assert response.json()["verifiedAt"] is not None
    session.refresh(email)
    assert email.verified_at is not None


def test_operator_assisted_recovery_reuses_normal_one_time_recovery_flow(
    client,
    session,
    server_admin_allowlist,
) -> None:  # type: ignore[no-untyped-def]
    _, admin_token = _admin(session)
    target = accounts.create_account(
        session,
        display_name="Target",
        email="target@example.test",
        password_hash=passwords.hash_password("old-password-value"),
    )

    response = client.post(
        f"/api/v1/server-admin/accounts/{target.id}/recovery/operator",
        headers=auth(admin_token),
    )

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    recovery_url = response.json()["recoveryUrl"]
    token = parse_qs(urlsplit(recovery_url).query)["token"][0]
    assert token

    consumed = client.post(
        "/api/v1/auth/recovery/consume",
        json={
            "token": token,
            "newPassword": "new-password-value",
            "deviceName": "recovered",
            "platform": "test",
        },
    )
    assert consumed.status_code == 201

    replay = client.post(
        "/api/v1/auth/recovery/consume",
        json={
            "token": token,
            "newPassword": "another-password-value",
            "deviceName": "replay",
            "platform": "test",
        },
    )
    assert replay.status_code == 422

    events = (
        session.execute(
            select(InstanceAdministrationActionEvent).where(
                InstanceAdministrationActionEvent.target_account_id == target.id
            )
        )
        .scalars()
        .all()
    )
    assert [event.action for event in events] == ["account_recovery_issued"]
    assert token not in " ".join(event.action for event in events)


def test_account_recovery_email_reports_mail_unavailable_without_issuing_operator_proof(
    client,
    session,
    server_admin_allowlist,
    monkeypatch,
) -> None:  # type: ignore[no-untyped-def]
    _, admin_token = _admin(session)
    target = accounts.create_account(
        session,
        display_name="Target",
        email="target@example.test",
        password_hash=passwords.hash_password("old-password-value"),
    )
    monkeypatch.setenv("EIMIR_MAIL_TRANSPORT", "none")
    get_settings.cache_clear()

    response = client.post(
        f"/api/v1/server-admin/accounts/{target.id}/recovery/email",
        headers=auth(admin_token),
    )

    assert response.status_code == 503
    assert response.json()["code"] == "MAIL_TRANSPORT_UNAVAILABLE"
    get_settings.cache_clear()
