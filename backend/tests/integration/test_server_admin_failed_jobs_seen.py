"""ServerAdmin marks the current failed jobs as seen (#2342)."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.administration.models import (
    AdministrationAction,
    InstanceAdministrationActionEvent,
)
from eimir.config import get_settings
from eimir.core.clock import now
from eimir.identity.models import AccountEmail
from eimir.jobs.models import Job, JobStatus
from tests.conftest import auth, make_account, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

ADMIN_EMAIL = "jobs-operator@example.test"
OVERVIEW = "/api/v1/server-admin/overview"
SEEN = "/api/v1/server-admin/failed-jobs/seen"


@pytest.fixture(autouse=True)
def server_admin_allowlist(monkeypatch: pytest.MonkeyPatch) -> Any:
    monkeypatch.setenv("EIMIR_SERVER_ADMIN_EMAILS", f'["{ADMIN_EMAIL}"]')
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _admin_token(session: Session) -> str:
    account = make_account(session, "Jobs operator")
    session.add(
        AccountEmail(account_id=account.id, email=ADMIN_EMAIL, is_primary=True, verified_at=now())
    )
    session.flush()
    return sign_in(session, account)


def _failed_job(session: Session, *, age: timedelta = timedelta(0)) -> Job:
    job = Job(
        kind="safe-kind",
        payload={},
        status=JobStatus.FAILED.value,
        attempts=3,
        max_attempts=3,
        finished_at=now() - age,
    )
    session.add(job)
    session.flush()
    return job


def test_seen_hides_the_current_failures_until_a_new_job_fails(client, session) -> None:  # type: ignore[no-untyped-def]
    token = _admin_token(session)
    _failed_job(session, age=timedelta(days=3))
    _failed_job(session, age=timedelta(minutes=5))

    before = client.get(OVERVIEW, headers=auth(token)).json()
    assert before["jobsFailed"] == 2
    assert before["jobsFailedUnseen"] == 2
    assert "failed_jobs_present" in before["warningCodes"]

    seen = client.post(SEEN, headers=auth(token))
    assert seen.status_code == 200, seen.text
    assert seen.json() == {"hidden": 2}

    after = client.get(OVERVIEW, headers=auth(token)).json()
    # System > Jobs still counts every failed job; only Needs-you forgets them.
    assert after["jobsFailed"] == 2
    assert after["jobsFailedUnseen"] == 0
    assert "failed_jobs_present" not in after["warningCodes"]

    _failed_job(session, age=timedelta(seconds=-1))
    again = client.get(OVERVIEW, headers=auth(token)).json()
    assert again["jobsFailedUnseen"] == 1
    assert "failed_jobs_present" in again["warningCodes"]


def test_seen_is_audited_without_content(client, session) -> None:  # type: ignore[no-untyped-def]
    token = _admin_token(session)
    _failed_job(session)

    assert client.post(SEEN, headers=auth(token)).status_code == 200

    event = session.execute(
        select(InstanceAdministrationActionEvent).where(
            InstanceAdministrationActionEvent.action == AdministrationAction.FAILED_JOBS_SEEN.value
        )
    ).scalar_one()
    assert event.effect_count == 1
    assert event.target_account_id is None and event.target_space_id is None


def test_only_a_server_admin_marks_jobs_seen(client, session) -> None:  # type: ignore[no-untyped-def]
    other = sign_in(session, make_account(session, "Couple member"))
    assert client.post(SEEN).status_code == 401
    assert client.post(SEEN, headers=auth(other)).status_code == 403
