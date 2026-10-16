"""ServerAdmin authorization, Account operations, and safe projections."""

from __future__ import annotations

from datetime import timedelta
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

import pytest
from sqlalchemy import select

from eimir.administration.models import (
    InstanceAdministrationActionEvent,
    InstanceAdministrationEvent,
)
from eimir.api.v1 import server_admin as server_admin_api
from eimir.auth import passwords, recent_auth
from eimir.config import get_settings
from eimir.core.clock import now
from eimir.core.errors import ForbiddenError
from eimir.identity import deletion_self_service
from eimir.identity import service as accounts
from eimir.identity.deletion_journal import DeletionJournal
from eimir.identity.deletion_models import AccountDeletion
from eimir.identity.models import Account, AccountEmail, DeviceSession
from eimir.jobs.models import Job, JobStatus
from eimir.mail import MailMessage, MailSender
from eimir.relationship import service as relationship
from eimir.relationship.models import Space
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

ADMIN_EMAIL = "operator@example.test"


class RecordingMailbox(MailSender):
    def __init__(self) -> None:
        self.messages: list[MailMessage] = []

    def send(self, message: MailMessage) -> None:
        self.messages.append(message)


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


def _grant_server_admin_action(session, account) -> None:  # type: ignore[no-untyped-def]
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
        "deletionStatus",
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


def test_server_admin_resends_normal_primary_email_verification(
    client,
    session,
    server_admin_allowlist,
    monkeypatch,
) -> None:  # type: ignore[no-untyped-def]
    _, admin_token = _admin(session)
    target = make_account(session, "Target")
    email = _add_email(session, target, email="target@example.test", verified=False)
    mailbox = RecordingMailbox()
    monkeypatch.setattr(server_admin_api, "mail_sender", lambda: mailbox)

    response = client.post(
        f"/api/v1/server-admin/accounts/{target.id}/email-verification/request",
        headers=auth(admin_token),
    )

    assert response.status_code == 202
    assert response.content == b""
    assert len(mailbox.messages) == 1
    assert mailbox.messages[0].to == email.email
    session.refresh(email)
    assert email.verified_at is None

    verification_url = next(
        line for line in mailbox.messages[0].body.splitlines() if line.startswith("http")
    )
    token = parse_qs(urlsplit(verification_url).query)["token"][0]
    confirmed = client.post(
        "/api/v1/auth/email/verification/confirm",
        json={"token": token},
    )
    assert confirmed.status_code == 204
    session.refresh(email)
    assert email.verified_at is not None

    # A verified target is an idempotent no-op and must not resolve mail again.
    monkeypatch.setattr(
        server_admin_api,
        "mail_sender",
        lambda: pytest.fail("mail sender resolved for an already verified address"),
    )
    replay = client.post(
        f"/api/v1/server-admin/accounts/{target.id}/email-verification/request",
        headers=auth(admin_token),
    )
    assert replay.status_code == 202
    assert len(mailbox.messages) == 1


def test_server_admin_verification_resend_reports_mail_unavailable(
    client,
    session,
    server_admin_allowlist,
    monkeypatch,
) -> None:  # type: ignore[no-untyped-def]
    _, admin_token = _admin(session)
    target = make_account(session, "Target")
    _add_email(session, target, email="target@example.test", verified=False)
    monkeypatch.setenv("EIMIR_MAIL_TRANSPORT", "none")
    get_settings.cache_clear()

    response = client.post(
        f"/api/v1/server-admin/accounts/{target.id}/email-verification/request",
        headers=auth(admin_token),
    )

    assert response.status_code == 503
    assert response.json()["code"] == "MAIL_TRANSPORT_UNAVAILABLE"
    get_settings.cache_clear()


def test_server_admin_verification_resend_rejects_suspended_account(
    client,
    session,
    server_admin_allowlist,
) -> None:  # type: ignore[no-untyped-def]
    _, admin_token = _admin(session)
    target = make_account(session, "Target")
    _add_email(session, target, email="target@example.test", verified=False)
    target.disabled_at = now()
    session.flush()

    response = client.post(
        f"/api/v1/server-admin/accounts/{target.id}/email-verification/request",
        headers=auth(admin_token),
    )

    assert response.status_code == 422
    assert response.json()["code"] == "SERVER_ADMIN_ACCOUNT_DISABLED"


def test_operator_email_verification_requires_exact_typed_confirmation(
    client,
    session,
    server_admin_allowlist,
) -> None:  # type: ignore[no-untyped-def]
    admin, token = _admin(session)
    _grant_server_admin_action(session, admin)
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
    admin, admin_token = _admin(session)
    _grant_server_admin_action(session, admin)
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


def test_server_admin_delete_account_success(
    client,
    session,
    server_admin_allowlist,
    tmp_path,
    monkeypatch,
) -> None:  # type: ignore[no-untyped-def]
    admin, admin_token = _admin(session)
    _grant_server_admin_action(session, admin)

    journal_file = tmp_path / "deletions.journal"
    journal = DeletionJournal.initialize(journal_file, instance_id=uuid4())
    monkeypatch.setattr(deletion_self_service, "_configured_journal", lambda: journal)

    target = make_account(session, "Delete Target")
    target_email = _add_email(session, target, email="target-to-delete@example.test", verified=True)
    sign_in(session, target)
    device_session = session.execute(
        select(DeviceSession).where(DeviceSession.account_id == target.id)
    ).scalar_one()

    response = client.post(
        f"/api/v1/server-admin/accounts/{target.id}/deletion",
        headers=auth(admin_token),
        json={"confirmation": f"DELETE {target_email.email}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["accountId"] == str(target.id)
    assert data["status"] == "PENDING"
    assert "acceptedAt" in data

    # Account fail-closed
    session.expire_all()
    refreshed_target = session.get(Account, target.id)
    assert refreshed_target.disabled_at is not None

    # Device session revoked
    refreshed_session = session.get(DeviceSession, device_session.id)
    assert refreshed_session.revoked_at is not None

    # AccountDeletion row exists
    deletion_row = session.get(AccountDeletion, target.id)
    assert deletion_row is not None
    assert deletion_row.status == "PENDING"

    # Background convergence job enqueued
    jobs = (
        session.execute(select(Job).where(Job.kind == "account_deletion_converge")).scalars().all()
    )
    assert len(jobs) == 1

    # Audit event written
    audit_events = (
        session.execute(
            select(InstanceAdministrationActionEvent).where(
                InstanceAdministrationActionEvent.target_account_id == target.id
            )
        )
        .scalars()
        .all()
    )
    assert len(audit_events) == 1
    assert audit_events[0].action == "account_deletion_requested"
    assert audit_events[0].actor_id == admin.id

    # Journal tombstone verified
    tombstones = journal.read_all()
    assert len(tombstones) == 1
    assert tombstones[0].account_id == target.id

    # Account Detail reflection
    detail_res = client.get(
        f"/api/v1/server-admin/accounts/{target.id}",
        headers=auth(admin_token),
    )
    assert detail_res.status_code == 200
    detail_json = detail_res.json()
    assert detail_json["deletionStatus"] == "PENDING"
    assert detail_json["deletionAcceptedAt"] is not None
    assert detail_json["disabledAt"] is not None

    # Account Directory list reflection
    list_res = client.get(
        f"/api/v1/server-admin/accounts?query={target_email.email}",
        headers=auth(admin_token),
    )
    assert list_res.status_code == 200
    items = list_res.json()["items"]
    assert len(items) == 1
    assert items[0]["deletionStatus"] == "PENDING"


def test_server_admin_delete_account_idempotent_retry(
    client,
    session,
    server_admin_allowlist,
    tmp_path,
    monkeypatch,
) -> None:  # type: ignore[no-untyped-def]
    admin, admin_token = _admin(session)
    _grant_server_admin_action(session, admin)

    journal_file = tmp_path / "deletions.journal"
    journal = DeletionJournal.initialize(journal_file, instance_id=uuid4())
    monkeypatch.setattr(deletion_self_service, "_configured_journal", lambda: journal)

    target = make_account(session, "Retry Target")
    target_email = _add_email(session, target, email="retry-target@example.test", verified=True)

    res1 = client.post(
        f"/api/v1/server-admin/accounts/{target.id}/deletion",
        headers=auth(admin_token),
        json={"confirmation": f"DELETE {target_email.email}"},
    )
    assert res1.status_code == 200
    accepted_at_1 = res1.json()["acceptedAt"]

    # Second call (retry)
    res2 = client.post(
        f"/api/v1/server-admin/accounts/{target.id}/deletion",
        headers=auth(admin_token),
        json={"confirmation": f"DELETE {target_email.email}"},
    )
    assert res2.status_code == 200
    assert res2.json()["acceptedAt"] == accepted_at_1
    assert len(journal.read_all()) == 1


def test_server_admin_delete_account_accepts_target_id_or_email(
    client,
    session,
    server_admin_allowlist,
    tmp_path,
    monkeypatch,
) -> None:  # type: ignore[no-untyped-def]
    admin, admin_token = _admin(session)
    _grant_server_admin_action(session, admin)

    journal_file = tmp_path / "deletions.journal"
    journal = DeletionJournal.initialize(journal_file, instance_id=uuid4())
    monkeypatch.setattr(deletion_self_service, "_configured_journal", lambda: journal)

    # Test with exact target ID
    target1 = make_account(session, "Target 1")
    _add_email(session, target1, email="t1@example.test", verified=True)
    res1 = client.post(
        f"/api/v1/server-admin/accounts/{target1.id}/deletion",
        headers=auth(admin_token),
        json={"confirmation": str(target1.id)},
    )
    assert res1.status_code == 200

    # Test with DELETE <id>
    target2 = make_account(session, "Target 2")
    _add_email(session, target2, email="t2@example.test", verified=True)
    res2 = client.post(
        f"/api/v1/server-admin/accounts/{target2.id}/deletion",
        headers=auth(admin_token),
        json={"confirmation": f"DELETE {target2.id}"},
    )
    assert res2.status_code == 200

    # Test with plain email (case-insensitive)
    target3 = make_account(session, "Target 3")
    email3 = _add_email(session, target3, email="t3@example.test", verified=True)
    res3 = client.post(
        f"/api/v1/server-admin/accounts/{target3.id}/deletion",
        headers=auth(admin_token),
        json={"confirmation": f" {email3.email.upper()} "},
    )
    assert res3.status_code == 200


def test_server_admin_delete_account_rejects_confirmation_mismatch(
    client,
    session,
    server_admin_allowlist,
    tmp_path,
    monkeypatch,
) -> None:  # type: ignore[no-untyped-def]
    admin, admin_token = _admin(session)
    _grant_server_admin_action(session, admin)

    target = make_account(session, "Mismatch Target")
    _add_email(session, target, email="mismatch@example.test", verified=True)

    response = client.post(
        f"/api/v1/server-admin/accounts/{target.id}/deletion",
        headers=auth(admin_token),
        json={"confirmation": "DELETE other@example.test"},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "SERVER_ADMIN_CONFIRMATION_MISMATCH"


def test_server_admin_delete_account_requires_recent_auth(
    client,
    session,
    server_admin_allowlist,
) -> None:  # type: ignore[no-untyped-def]
    _, admin_token = _admin(session)
    target = make_account(session, "Target")
    email = _add_email(session, target, email="target@example.test", verified=True)

    response = client.post(
        f"/api/v1/server-admin/accounts/{target.id}/deletion",
        headers=auth(admin_token),
        json={"confirmation": f"DELETE {email.email}"},
    )
    assert response.status_code == 403
    assert response.json()["code"] == recent_auth.RecentAuthenticationErrorCode.REQUIRED


def test_server_admin_cannot_delete_self(
    client,
    session,
    server_admin_allowlist,
) -> None:  # type: ignore[no-untyped-def]
    admin, admin_token = _admin(session)
    _grant_server_admin_action(session, admin)

    response = client.post(
        f"/api/v1/server-admin/accounts/{admin.id}/deletion",
        headers=auth(admin_token),
        json={"confirmation": f"DELETE {ADMIN_EMAIL}"},
    )
    assert response.status_code == 403
    assert response.json()["code"] == "SERVER_ADMIN_SELF_LOCKOUT_BLOCKED"


def test_server_admin_cannot_delete_last_active_verified_admin(
    client,
    session,
    monkeypatch,
) -> None:  # type: ignore[no-untyped-def]
    admin1_email = "admin1@example.test"
    admin2_email = "admin2@example.test"
    monkeypatch.setenv("EIMIR_SERVER_ADMIN_EMAILS", f'["{admin1_email}", "{admin2_email}"]')
    get_settings.cache_clear()

    # Admin 1 (active)
    admin1 = make_account(session, "Admin 1")
    _add_email(session, admin1, email=admin1_email, verified=True)
    sign_in(session, admin1)
    _grant_server_admin_action(session, admin1)

    # Admin 2 (also active and verified)
    admin2 = make_account(session, "Admin 2")
    _add_email(session, admin2, email=admin2_email, verified=True)

    # Now simulate admin1 disabled or already deleted
    admin1.disabled_at = now()
    session.flush()

    # Admin 2 signs in
    sign_in(session, admin2)
    _grant_server_admin_action(session, admin2)

    # Temporarily enable admin1 just to issue the call
    admin1.disabled_at = None
    session.flush()

    email1 = session.execute(
        select(AccountEmail).where(
            AccountEmail.account_id == admin1.id, AccountEmail.is_primary.is_(True)
        )
    ).scalar_one()
    email1.verified_at = None
    session.flush()

    email2 = session.execute(
        select(AccountEmail).where(
            AccountEmail.account_id == admin2.id, AccountEmail.is_primary.is_(True)
        )
    ).scalar_one()
    email2.verified_at = None
    email1.verified_at = now()
    session.flush()

    # Now admin1 is the LAST active verified admin. Create admin3 who is disabled.
    admin3_email = "admin3@example.test"
    monkeypatch.setenv("EIMIR_SERVER_ADMIN_EMAILS", f'["{admin1_email}", "{admin3_email}"]')
    get_settings.cache_clear()
    admin3 = make_account(session, "Admin 3")
    _add_email(session, admin3, email=admin3_email, verified=True)
    sign_in(session, admin3)
    _grant_server_admin_action(session, admin3)

    admin3.disabled_at = now()
    session.flush()

    from eimir.administration import account_operations

    with pytest.raises(ForbiddenError) as exc_info:
        account_operations.delete_account(
            session,
            actor=admin3,
            target_account_id=admin1.id,
            confirmation=f"DELETE {admin1_email}",
        )
    assert exc_info.value.code == "SERVER_ADMIN_LAST_ADMIN_LOCKOUT_BLOCKED"

    get_settings.cache_clear()


def test_server_admin_cannot_delete_demo_account(
    client,
    session,
    server_admin_allowlist,
    monkeypatch,
) -> None:  # type: ignore[no-untyped-def]
    admin, admin_token = _admin(session)
    _grant_server_admin_action(session, admin)

    target = make_account(session, "Demo Target")
    email = _add_email(session, target, email="demo-target@example.test", verified=True)

    monkeypatch.setenv("EIMIR_DEMO_MODE", "true")
    get_settings.cache_clear()

    response = client.post(
        f"/api/v1/server-admin/accounts/{target.id}/deletion",
        headers=auth(admin_token),
        json={"confirmation": f"DELETE {email.email}"},
    )
    assert response.status_code == 403
    assert response.json()["code"] == "ACCOUNT_DELETION_DEMO_FORBIDDEN"
    get_settings.cache_clear()


def test_unified_privileged_audit_filters_sorts_and_paginates(
    client,
    session,
    server_admin_allowlist,
) -> None:  # type: ignore[no-untyped-def]
    admin, admin_token = _admin(session)
    target = make_account(session, "Audit target")
    space = make_space(session, admin)
    current = now()

    session.add(
        InstanceAdministrationEvent(
            actor_id=admin.id,
            setting="maintenance_mode",
            previous_value=False,
            new_value=True,
            created_at=current - timedelta(minutes=4),
        )
    )
    session.add_all(
        [
            InstanceAdministrationActionEvent(
                actor_id=admin.id,
                target_account_id=target.id,
                action="account_suspended",
                effect_count=2,
                created_at=current - timedelta(minutes=3),
            ),
            InstanceAdministrationActionEvent(
                actor_id=admin.id,
                target_space_id=space.id,
                action="space_entitlement_granted",
                created_at=current - timedelta(minutes=2),
            ),
            InstanceAdministrationActionEvent(
                actor_id=admin.id,
                target_account_id=target.id,
                action="account_deletion_requested",
                created_at=current - timedelta(minutes=1),
            ),
        ]
    )
    session.flush()

    first_page = client.get(
        "/api/v1/server-admin/activity/privileged?limit=2",
        headers=auth(admin_token),
    )
    assert first_page.status_code == 200
    payload = first_page.json()
    assert payload["total"] == 4
    assert payload["limit"] == 2
    assert payload["offset"] == 0
    assert [item["category"] for item in payload["items"]] == [
        "destructive",
        "spaces",
    ]

    second_page = client.get(
        "/api/v1/server-admin/activity/privileged?limit=2&offset=2",
        headers=auth(admin_token),
    )
    assert second_page.status_code == 200
    assert [item["category"] for item in second_page.json()["items"]] == [
        "accounts",
        "settings",
    ]

    spaces = client.get(
        "/api/v1/server-admin/activity/privileged?category=spaces",
        headers=auth(admin_token),
    )
    assert spaces.status_code == 200
    assert spaces.json()["total"] == 1
    assert spaces.json()["items"][0]["targetSpaceId"] == str(space.id)

    accounts = client.get(
        "/api/v1/server-admin/activity/privileged?category=accounts",
        headers=auth(admin_token),
    )
    assert accounts.status_code == 200
    assert accounts.json()["total"] == 1
    assert accounts.json()["items"][0]["action"] == "account_suspended"

    destructive = client.get(
        f"/api/v1/server-admin/activity/privileged?category=destructive&targetId={target.id}",
        headers=auth(admin_token),
    )
    assert destructive.status_code == 200
    assert destructive.json()["total"] == 1
    item = destructive.json()["items"][0]
    assert item["action"] == "account_deletion_requested"
    assert set(item) == {
        "id",
        "category",
        "action",
        "actorId",
        "targetAccountId",
        "targetSpaceId",
        "previousValue",
        "newValue",
        "effectCount",
        "createdAt",
    }


def test_unified_privileged_audit_filters_deletion_outcomes(
    client,
    session,
    server_admin_allowlist,
) -> None:  # type: ignore[no-untyped-def]
    admin, admin_token = _admin(session)
    target = make_account(session, "Deletion audit target")
    current = now()
    session.add_all(
        [
            InstanceAdministrationActionEvent(
                actor_id=admin.id,
                target_account_id=target.id,
                action="account_deletion_requested",
                created_at=current - timedelta(minutes=2),
            ),
            InstanceAdministrationActionEvent(
                actor_id=admin.id,
                target_account_id=target.id,
                action="account_deletion_failed",
                created_at=current - timedelta(minutes=1),
            ),
            InstanceAdministrationActionEvent(
                actor_id=admin.id,
                target_account_id=target.id,
                action="account_deletion_completed",
                created_at=current,
            ),
        ]
    )
    session.flush()

    destructive = client.get(
        f"/api/v1/server-admin/activity/privileged?category=destructive&targetId={target.id}",
        headers=auth(admin_token),
    )
    assert destructive.status_code == 200
    assert destructive.json()["total"] == 3
    assert [item["action"] for item in destructive.json()["items"]] == [
        "account_deletion_completed",
        "account_deletion_failed",
        "account_deletion_requested",
    ]

    failed = client.get(
        "/api/v1/server-admin/activity/privileged?action=account_deletion_failed",
        headers=auth(admin_token),
    )
    assert failed.status_code == 200
    assert failed.json()["total"] == 1
    assert failed.json()["items"][0]["targetAccountId"] == str(target.id)
