"""Storage for ServerAdmin monitoring (redesign part 2, #2317)."""

from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy.orm import Session

from eimir.administration import service as administration
from eimir.administration.models import AdministrationSetting
from eimir.core.clock import now
from eimir.monitoring.models import (
    MonitoringAlertState,
    OperationalMetricHour,
    RequestMetricMinute,
    WorkerHeartbeat,
)
from tests.conftest import make_account, requires_database

pytestmark = [pytest.mark.integration, requires_database]


def test_monitoring_tables_round_trip(session: Session) -> None:
    at = now().replace(second=0, microsecond=0)
    session.add(
        WorkerHeartbeat(
            worker_name="worker-a",
            role="worker",
            build_revision="abc",
            last_seen_at=at,
            last_progress_at=at,
        )
    )
    session.add(
        RequestMetricMinute(
            minute=at, requests=3, server_errors=1, latency_buckets=[1, 0, 1, 0, 0, 0, 0, 1]
        )
    )
    session.add(
        OperationalMetricHour(
            hour=at.replace(minute=0),
            requests=3,
            server_errors=1,
            p95_ms=5000,
            new_accounts=1,
            active_spaces=2,
            stored_bytes=10,
            disk_used_bytes=None,
            disk_total_bytes=None,
            failed_jobs=0,
            failed_emails=0,
            failed_pushes=0,
        )
    )
    session.add(MonitoringAlertState(code="failed_jobs", active_since=at - timedelta(hours=1)))
    session.flush()
    session.expire_all()

    assert session.get(WorkerHeartbeat, "worker-a").role == "worker"
    assert session.get(RequestMetricMinute, at).latency_buckets == [1, 0, 1, 0, 0, 0, 0, 1]
    assert session.get(OperationalMetricHour, at.replace(minute=0)).p95_ms == 5000
    assert session.get(MonitoringAlertState, "failed_jobs").last_sent_at is None


def test_monitoring_alerts_setting_defaults_on_and_is_audited(session: Session) -> None:
    assert administration.get_settings(session).monitoring_alerts_enabled is True
    actor = make_account(session, "Operator")

    administration.update_setting(
        session,
        actor_id=actor.id,
        setting=AdministrationSetting.MONITORING_ALERTS_ENABLED,
        enabled=False,
    )

    assert administration.get_settings(session).monitoring_alerts_enabled is False
