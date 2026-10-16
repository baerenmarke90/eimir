"""Concurrency coverage for the canonical-demo authentication reset boundary (#738).

The periodic demo reset is not only a content reset: it deletes outstanding
authentication proofs and DeviceSession rows for both canonical personas. That
cleanup must be ordered against demo proof publication and redemption across
independent request/worker transactions. A sequential test cannot cover the
uncommitted-insert window that caused #738.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeoutError
from datetime import date, timedelta
from threading import Event

import pytest
from sqlalchemy import select

from eimir.auth import action_tokens, cloud, sessions
from eimir.config import Environment, Settings
from eimir.core.clock import now
from eimir.core.errors import UnauthenticatedError, ValidationError
from eimir.demo import reset as demo_reset
from eimir.demo.service import LEA_EMAIL, create_demo_space
from eimir.identity import service as identity_service
from eimir.identity.models import AccountEmail, DeviceSession, MagicLinkToken
from tests.conftest import requires_database

pytestmark = [pytest.mark.integration, requires_database]

REFERENCE_DATE = date(2026, 8, 24)
DEMO_PASSWORD = "canonical-demo-auth-reset-concurrency-password"


def _demo_settings() -> Settings:
    return Settings.model_validate(
        {
            "demo_mode": True,
            "demo_mode_reset_timer": True,
            "demo_mode_reset_interval": timedelta(minutes=30),
        }
    )


def _seed(maker):  # type: ignore[no-untyped-def]
    with maker() as session:
        create_demo_space(
            session,
            environment=Environment.TEST,
            lea_password=DEMO_PASSWORD,
            alex_password=DEMO_PASSWORD,
            reference_date=REFERENCE_DATE,
        )
        lea = identity_service.find_by_email(session, LEA_EMAIL)
        assert lea is not None
        email = session.execute(
            select(AccountEmail).where(
                AccountEmail.account_id == lea.id,
                AccountEmail.email == LEA_EMAIL,
                AccountEmail.is_primary.is_(True),
            )
        ).scalar_one()
        lea_id = lea.id
        email_id = email.id
        session.commit()
    return lea_id, email_id


def _run_reset(maker) -> None:  # type: ignore[no-untyped-def]
    with maker() as session:
        demo_reset.run_demo_reset(session, {})
        session.commit()


def _assert_waiting(future) -> None:  # type: ignore[no-untyped-def]
    """Prove a contender reached the lock but cannot cross the held boundary."""
    with pytest.raises(FutureTimeoutError):
        future.result(timeout=0.2)


def test_uncommitted_demo_proof_is_swept_when_issuance_wins_before_reset(
    production_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:  # type: ignore[no-untyped-def]
    """Test A: reset cannot miss an uncommitted proof that already owns authority."""
    _client, maker = production_client
    _lea_id, email_id = _seed(maker)
    monkeypatch.setattr(demo_reset, "get_settings", _demo_settings)

    reset_reached_authority = Event()
    original_reset_lock = demo_reset.lock_demo_auth_authority

    def announced_reset_lock(session):  # type: ignore[no-untyped-def]
        reset_reached_authority.set()
        original_reset_lock(session)

    monkeypatch.setattr(demo_reset, "lock_demo_auth_authority", announced_reset_lock)

    issuing = maker()
    try:
        proof, issued = action_tokens.issue_demo_entry_proof(issuing, email_id)
        proof_id = proof.id

        with ThreadPoolExecutor(max_workers=1) as pool:
            reset = pool.submit(_run_reset, maker)
            assert reset_reached_authority.wait(timeout=5)
            _assert_waiting(reset)

            # Releasing the issuance transaction linearizes it before reset.
            issuing.commit()
            reset.result(timeout=30)
    finally:
        issuing.close()

    with maker() as check:
        assert check.get(MagicLinkToken, proof_id) is None
        with pytest.raises(ValidationError) as excinfo:
            action_tokens.consume_magic_link(check, issued.token)
        assert excinfo.value.code == action_tokens.ActionTokenErrorCode.INVALID


def test_issuance_waiting_behind_reset_is_deterministically_post_reset(
    production_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:  # type: ignore[no-untyped-def]
    """Test B: a contender that loses the authority lock becomes post-reset."""
    _client, maker = production_client
    _lea_id, email_id = _seed(maker)
    monkeypatch.setattr(demo_reset, "get_settings", _demo_settings)

    reset_session = maker()
    try:
        # Complete all reset work but deliberately hold the transaction open.
        # Its advisory authority lock remains held until commit.
        demo_reset.run_demo_reset(reset_session, {})

        issuance_reached_authority = Event()
        original_issue_lock = action_tokens.lock_demo_auth_authority

        def announced_issue_lock(session):  # type: ignore[no-untyped-def]
            issuance_reached_authority.set()
            original_issue_lock(session)

        monkeypatch.setattr(action_tokens, "lock_demo_auth_authority", announced_issue_lock)

        def issue_after_boundary():  # type: ignore[no-untyped-def]
            with maker() as session:
                proof, issued = action_tokens.issue_demo_entry_proof(session, email_id)
                proof_id = proof.id
                session.commit()
                return proof_id, issued.token

        with ThreadPoolExecutor(max_workers=1) as pool:
            issuance = pool.submit(issue_after_boundary)
            assert issuance_reached_authority.wait(timeout=5)
            _assert_waiting(issuance)

            reset_session.commit()
            proof_id, token = issuance.result(timeout=15)
    finally:
        reset_session.close()

    with maker() as check:
        proof = check.get(MagicLinkToken, proof_id)
        assert proof is not None
        assert proof.is_demo_entry is True
        assert proof.is_open(now())
        consumed = action_tokens.consume_magic_link(check, token)
        assert consumed.id == proof_id
        check.commit()


def test_demo_consume_and_session_creation_complete_before_later_reset_cleanup(
    production_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:  # type: ignore[no-untyped-def]
    """Test C: a pre-reset redemption cannot resurrect its session afterwards."""
    _client, maker = production_client
    lea_id, email_id = _seed(maker)
    monkeypatch.setattr(demo_reset, "get_settings", _demo_settings)

    with maker() as issue:
        proof, issued = action_tokens.issue_demo_entry_proof(issue, email_id)
        proof_id = proof.id
        issue.commit()

    reset_reached_authority = Event()
    original_reset_lock = demo_reset.lock_demo_auth_authority

    def announced_reset_lock(session):  # type: ignore[no-untyped-def]
        reset_reached_authority.set()
        original_reset_lock(session)

    monkeypatch.setattr(demo_reset, "lock_demo_auth_authority", announced_reset_lock)

    consuming = maker()
    try:
        signed_in = cloud.consume_magic_link(
            consuming,
            token=issued.token,
            device_name="Visitor before reset",
            platform="web",
        )
        device_session_id = consuming.execute(
            select(DeviceSession.id).where(DeviceSession.account_id == lea_id)
        ).scalar_one()

        with ThreadPoolExecutor(max_workers=1) as pool:
            reset = pool.submit(_run_reset, maker)
            assert reset_reached_authority.wait(timeout=5)
            _assert_waiting(reset)

            consuming.commit()
            reset.result(timeout=30)
    finally:
        consuming.close()

    with maker() as check:
        assert check.get(MagicLinkToken, proof_id) is None
        assert check.get(DeviceSession, device_session_id) is None
        with pytest.raises(UnauthenticatedError):
            sessions.authenticate(check, signed_in.tokens.access_token)


def test_demo_consume_waiting_behind_reset_cannot_create_a_session(
    production_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:  # type: ignore[no-untyped-def]
    """Inverse Test C: reset wins, deletes the proof, and redemption fails."""
    _client, maker = production_client
    lea_id, email_id = _seed(maker)
    monkeypatch.setattr(demo_reset, "get_settings", _demo_settings)

    with maker() as issue:
        _proof, issued = action_tokens.issue_demo_entry_proof(issue, email_id)
        issue.commit()

    reset_session = maker()
    try:
        demo_reset.run_demo_reset(reset_session, {})

        consume_reached_authority = Event()
        original_consume_lock = action_tokens.lock_demo_auth_authority

        def announced_consume_lock(session):  # type: ignore[no-untyped-def]
            consume_reached_authority.set()
            original_consume_lock(session)

        monkeypatch.setattr(action_tokens, "lock_demo_auth_authority", announced_consume_lock)

        def consume_after_boundary():  # type: ignore[no-untyped-def]
            with maker() as session:
                try:
                    cloud.consume_magic_link(
                        session,
                        token=issued.token,
                        device_name="Visitor losing reset race",
                        platform="web",
                    )
                    session.commit()
                except Exception:
                    session.rollback()
                    raise

        with ThreadPoolExecutor(max_workers=1) as pool:
            consume = pool.submit(consume_after_boundary)
            assert consume_reached_authority.wait(timeout=5)
            _assert_waiting(consume)

            reset_session.commit()
            with pytest.raises(ValidationError) as excinfo:
                consume.result(timeout=15)
            assert excinfo.value.code == action_tokens.ActionTokenErrorCode.INVALID
    finally:
        reset_session.close()

    with maker() as check:
        assert (
            check.execute(
                select(DeviceSession).where(DeviceSession.account_id == lea_id)
            ).scalar_one_or_none()
            is None
        )
