"""Reset timer uses the existing durable job queue and explicit demo config."""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from sqlalchemy import select

from eimir.auth import action_tokens, sessions
from eimir.config import Environment, Settings
from eimir.core.clock import now
from eimir.core.errors import UnauthenticatedError, ValidationError
from eimir.demo import reset as demo_reset
from eimir.demo.service import LEA_EMAIL, create_demo_space
from eimir.identity import service as identity_service
from eimir.identity.models import (
    AccountEmail,
    DeviceSession,
    MagicLinkToken,
    OidcAuthRequest,
)
from eimir.jobs.models import JobStatus
from tests.conftest import requires_database

pytestmark = [pytest.mark.integration, requires_database]

REFERENCE_DATE = date(2026, 8, 24)
DEMO_PASSWORD = "canonical-demo-reset-schedule-password"


def _demo_settings() -> Settings:
    return Settings.model_validate(
        {
            "demo_mode": True,
            "demo_mode_reset_timer": True,
            "demo_mode_reset_interval": timedelta(minutes=30),
        }
    )


def test_reset_timer_is_disabled_by_default(session) -> None:  # type: ignore[no-untyped-def]
    assert demo_reset.ensure_scheduled(session) is None


def test_reset_timer_schedules_exactly_one_pending_job(
    session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:  # type: ignore[no-untyped-def]
    settings = _demo_settings()
    monkeypatch.setattr(demo_reset, "get_settings", lambda: settings)

    first = demo_reset.ensure_scheduled(session)
    second = demo_reset.ensure_scheduled(session)

    assert first is not None
    assert first.kind == demo_reset.DEMO_RESET_JOB
    assert first.status == JobStatus.PENDING.value
    assert second is None


def test_reset_job_replaces_space_and_expires_public_demo_auth_state(
    session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:  # type: ignore[no-untyped-def]
    settings = _demo_settings()
    monkeypatch.setattr(demo_reset, "get_settings", lambda: settings)
    seeded = create_demo_space(
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
    device_session, tokens = sessions.start_session(
        session,
        lea,
        device_name="Public demo visitor",
        platform="web",
    )
    magic_link, _ = action_tokens.issue_magic_link(session, email.id)
    oidc_request = OidcAuthRequest(
        connection_id="demo-test",
        state_hash="d" * 64,
        nonce="demo-reset-nonce",
        code_verifier="demo-reset-verifier",
        redirect_uri="https://demo.example.invalid/auth/callback",
        account_id=lea.id,
        invitation_token_hash=None,
        expires_at=now() + timedelta(minutes=10),
    )
    session.add(oidc_request)
    session.flush()
    device_session_id = device_session.id
    magic_link_id = magic_link.id
    oidc_request_id = oidc_request.id

    demo_reset.run_demo_reset(session, {})

    assert session.get(DeviceSession, device_session_id) is None
    assert session.get(MagicLinkToken, magic_link_id) is None
    assert session.get(OidcAuthRequest, oidc_request_id) is None
    with pytest.raises(UnauthenticatedError):
        sessions.authenticate(session, tokens.access_token)

    current = create_demo_space(
        session,
        environment=Environment.TEST,
        lea_password=DEMO_PASSWORD,
        alex_password=DEMO_PASSWORD,
        reference_date=REFERENCE_DATE,
    )
    assert current.created is False
    assert current.space_id != seeded.space_id


def test_reset_job_also_invalidates_an_outstanding_demo_entry_proof(
    session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:  # type: ignore[no-untyped-def]
    """#730: a demo entry proof never supersedes another one, but the
    canonical reset must still be able to invalidate every outstanding proof
    for the personas it is about to rebuild.
    """
    settings = _demo_settings()
    monkeypatch.setattr(demo_reset, "get_settings", lambda: settings)
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
    demo_proof, issued = action_tokens.issue_demo_entry_proof(session, email.id)
    demo_proof_id = demo_proof.id

    demo_reset.run_demo_reset(session, {})

    assert session.get(MagicLinkToken, demo_proof_id) is None
    with pytest.raises(ValidationError) as excinfo:
        action_tokens.consume_magic_link(session, issued.token)
    assert excinfo.value.code == action_tokens.ActionTokenErrorCode.INVALID
