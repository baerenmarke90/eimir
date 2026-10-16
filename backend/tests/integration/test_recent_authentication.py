"""Security invariants for session-bound recent authentication."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from uuid import uuid4

import pytest
from sqlalchemy import func, select

from eimir.auth import passwords, recent_auth, sessions
from eimir.auth.recent_auth_models import RecentAuthenticationGrant
from eimir.core.clock import now
from eimir.core.errors import ForbiddenError, UnauthenticatedError
from eimir.identity import service as accounts
from eimir.identity.models import Account, DeviceSession
from tests.conftest import requires_database

PASSWORD = uuid4().hex
WRONG_PASSWORD = uuid4().hex
PURPOSE = recent_auth.RecentAuthenticationPurpose.ACCOUNT_DELETION
METHOD = recent_auth.RecentAuthenticationMethod.LOCAL_PASSWORD


def _create_local_account(maker, *, email: str, session_count: int = 1):  # type: ignore[no-untyped-def]
    with maker() as session:
        account = accounts.create_account(
            session,
            display_name=email.split("@", maxsplit=1)[0],
            email=email,
            password_hash=passwords.hash_password(PASSWORD),
        )
        created = [sessions.start_session(session, account) for _ in range(session_count)]
        account_id = account.id
        session_ids = [device_session.id for device_session, _ in created]
        tokens = [issued for _, issued in created]
        session.commit()
    return account_id, session_ids, tokens


def _grant(maker, account_id, device_session_id):  # type: ignore[no-untyped-def]
    with maker() as session:
        account = session.get(Account, account_id)
        device_session = session.get(DeviceSession, device_session_id)
        assert account is not None and device_session is not None
        result = recent_auth.issue_grant(
            session,
            account,
            device_session,
            purpose=PURPOSE,
            method=METHOD,
        )
        session.commit()
        return result


@requires_database
class TestRecentAuthenticationBinding:
    def test_grant_is_account_bound(self, production_client) -> None:  # type: ignore[no-untyped-def]
        _, maker = production_client
        account_a, sessions_a, _ = _create_local_account(maker, email="a@example.org")
        account_b, sessions_b, _ = _create_local_account(maker, email="b@example.org")
        _grant(maker, account_a, sessions_a[0])

        with maker() as session:
            target = session.get(Account, account_b)
            target_session = session.get(DeviceSession, sessions_b[0])
            assert target is not None and target_session is not None
            with pytest.raises(ForbiddenError) as rejected:
                recent_auth.require_grant(
                    session,
                    target,
                    target_session,
                    purpose=PURPOSE,
                )
        assert rejected.value.code == recent_auth.RecentAuthenticationErrorCode.REQUIRED

    def test_grant_is_concrete_session_bound(self, production_client) -> None:  # type: ignore[no-untyped-def]
        _, maker = production_client
        account_id, session_ids, _ = _create_local_account(
            maker,
            email="sessions@example.org",
            session_count=2,
        )
        _grant(maker, account_id, session_ids[0])

        with maker() as session:
            account = session.get(Account, account_id)
            second = session.get(DeviceSession, session_ids[1])
            assert account is not None and second is not None
            with pytest.raises(ForbiddenError) as rejected:
                recent_auth.require_grant(session, account, second, purpose=PURPOSE)
        assert rejected.value.code == recent_auth.RecentAuthenticationErrorCode.REQUIRED

    def test_grant_survives_token_rotation_inside_same_session_family(
        self,
        production_client,
    ) -> None:
        _, maker = production_client
        account_id, session_ids, issued = _create_local_account(
            maker,
            email="rotation@example.org",
        )
        _grant(maker, account_id, session_ids[0])

        with maker() as session:
            rotated = sessions.refresh_session(session, issued[0].refresh_token)
            session.commit()
        assert rotated.access_token != issued[0].access_token

        with maker() as session:
            account = session.get(Account, account_id)
            device_session = session.get(DeviceSession, session_ids[0])
            assert account is not None and device_session is not None
            grant = recent_auth.require_grant(
                session,
                account,
                device_session,
                purpose=PURPOSE,
            )
            assert grant.device_session_id == device_session.id

    def test_revocation_invalidates_existing_grant(self, production_client) -> None:  # type: ignore[no-untyped-def]
        _, maker = production_client
        account_id, session_ids, _ = _create_local_account(
            maker,
            email="revoked@example.org",
        )
        _grant(maker, account_id, session_ids[0])

        with maker() as session:
            device_session = session.get(DeviceSession, session_ids[0])
            assert device_session is not None
            sessions.revoke(device_session)
            session.commit()

        with maker() as session:
            account = session.get(Account, account_id)
            device_session = session.get(DeviceSession, session_ids[0])
            assert account is not None and device_session is not None
            with pytest.raises(ForbiddenError) as rejected:
                recent_auth.require_grant(
                    session,
                    account,
                    device_session,
                    purpose=PURPOSE,
                )
        assert rejected.value.code == recent_auth.RecentAuthenticationErrorCode.SESSION_INVALID

    def test_expired_grant_is_rejected(self, production_client) -> None:  # type: ignore[no-untyped-def]
        _, maker = production_client
        account_id, session_ids, _ = _create_local_account(
            maker,
            email="expired@example.org",
        )
        _grant(maker, account_id, session_ids[0])

        with maker() as session:
            grant = session.execute(select(RecentAuthenticationGrant)).scalar_one()
            grant.expires_at = now() - timedelta(seconds=1)
            session.commit()

        with maker() as session:
            account = session.get(Account, account_id)
            device_session = session.get(DeviceSession, session_ids[0])
            assert account is not None and device_session is not None
            with pytest.raises(ForbiddenError) as rejected:
                recent_auth.require_grant(
                    session,
                    account,
                    device_session,
                    purpose=PURPOSE,
                )
        assert rejected.value.code == recent_auth.RecentAuthenticationErrorCode.REQUIRED

    def test_grant_reuse_is_limited_to_the_short_purpose_window(
        self,
        production_client,
    ) -> None:
        _, maker = production_client
        account_id, session_ids, _ = _create_local_account(
            maker,
            email="retry@example.org",
        )
        _grant(maker, account_id, session_ids[0])

        with maker() as session:
            account = session.get(Account, account_id)
            device_session = session.get(DeviceSession, session_ids[0])
            assert account is not None and device_session is not None
            first = recent_auth.require_grant(session, account, device_session, purpose=PURPOSE)
            second = recent_auth.require_grant(session, account, device_session, purpose=PURPOSE)
            assert first.id == second.id
            assert first.expires_at == second.expires_at


@requires_database
class TestRecentAuthenticationPassword:
    def test_wrong_password_creates_no_grant(self, production_client) -> None:  # type: ignore[no-untyped-def]
        _, maker = production_client
        account_id, session_ids, _ = _create_local_account(
            maker,
            email="wrong-password@example.org",
        )

        with maker() as session:
            account = session.get(Account, account_id)
            device_session = session.get(DeviceSession, session_ids[0])
            assert account is not None and device_session is not None
            with pytest.raises(UnauthenticatedError) as rejected:
                recent_auth.authenticate_password(
                    session,
                    account,
                    device_session,
                    password=WRONG_PASSWORD,
                    purpose=PURPOSE,
                )
        assert rejected.value.code == recent_auth.RecentAuthenticationErrorCode.PASSWORD_INVALID

        with maker() as session:
            count = session.execute(
                select(func.count()).select_from(RecentAuthenticationGrant)
            ).scalar_one()
            assert count == 0

    def test_correct_password_issues_bound_grant(self, production_client) -> None:  # type: ignore[no-untyped-def]
        _, maker = production_client
        account_id, session_ids, _ = _create_local_account(
            maker,
            email="correct-password@example.org",
        )

        with maker() as session:
            account = session.get(Account, account_id)
            device_session = session.get(DeviceSession, session_ids[0])
            assert account is not None and device_session is not None
            result = recent_auth.authenticate_password(
                session,
                account,
                device_session,
                password=PASSWORD,
                purpose=PURPOSE,
            )
            session.commit()

        assert result.method == recent_auth.RecentAuthenticationMethod.LOCAL_PASSWORD
        assert result.expires_at - result.achieved_at == recent_auth.RECENT_AUTH_LIFETIME
        with maker() as session:
            grant = session.execute(select(RecentAuthenticationGrant)).scalar_one()
            assert grant.account_id == account_id
            assert grant.device_session_id == session_ids[0]
            assert grant.purpose == PURPOSE.value


@requires_database
def test_concurrent_grant_issuance_serializes_to_one_context_row(
    production_client,
) -> None:  # type: ignore[no-untyped-def]
    _, maker = production_client
    account_id, session_ids, _ = _create_local_account(
        maker,
        email="concurrent@example.org",
    )
    device_session_id = session_ids[0]
    start = Barrier(2)

    def issue() -> str:
        with maker() as session:
            account = session.get(Account, account_id)
            device_session = session.get(DeviceSession, device_session_id)
            assert account is not None and device_session is not None
            start.wait()
            result = recent_auth.issue_grant(
                session,
                account,
                device_session,
                purpose=PURPOSE,
                method=METHOD,
            )
            session.commit()
            return result.method.value

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: issue(), range(2)))

    assert results == [METHOD.value, METHOD.value]
    with maker() as session:
        count = session.execute(
            select(func.count()).select_from(RecentAuthenticationGrant)
        ).scalar_one()
        assert count == 1


@requires_database
def test_concurrent_revocation_and_step_up_end_fail_closed(
    production_client,
) -> None:  # type: ignore[no-untyped-def]
    _, maker = production_client
    account_id, session_ids, _ = _create_local_account(
        maker,
        email="revoke-race@example.org",
    )
    device_session_id = session_ids[0]
    start = Barrier(2)

    def issue() -> str:
        with maker() as session:
            account = session.get(Account, account_id)
            device_session = session.get(DeviceSession, device_session_id)
            assert account is not None and device_session is not None
            start.wait()
            try:
                recent_auth.issue_grant(
                    session,
                    account,
                    device_session,
                    purpose=PURPOSE,
                    method=METHOD,
                )
                session.commit()
                return "granted"
            except ForbiddenError:
                session.rollback()
                return "rejected"

    def revoke() -> str:
        with maker() as session:
            device_session = session.get(DeviceSession, device_session_id)
            assert device_session is not None
            start.wait()
            sessions.revoke(device_session)
            session.commit()
            return "revoked"

    with ThreadPoolExecutor(max_workers=2) as pool:
        grant_future = pool.submit(issue)
        revoke_future = pool.submit(revoke)
        grant_outcome = grant_future.result()
        assert revoke_future.result() == "revoked"

    assert grant_outcome in {"granted", "rejected"}
    with maker() as session:
        account = session.get(Account, account_id)
        device_session = session.get(DeviceSession, device_session_id)
        assert account is not None and device_session is not None
        with pytest.raises(ForbiddenError):
            recent_auth.require_grant(session, account, device_session, purpose=PURPOSE)
