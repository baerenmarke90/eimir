"""ServerAdmin monitoring endpoint and liveness in the overview (#2317)."""

from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy import select

from eimir.administration.models import InstanceAdministrationEvent
from eimir.api.v1 import server_admin as server_admin_api
from eimir.config import Deployment, MediaStoreBackend, get_settings
from eimir.core.clock import now
from eimir.identity.models import AccountEmail
from eimir.monitoring.models import OperationalMetricHour, WorkerHeartbeat
from tests.conftest import auth, make_account, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

ADMIN_EMAIL = "operator@example.test"


@pytest.fixture
def admin_token(session, monkeypatch):  # type: ignore[no-untyped-def]
    monkeypatch.setenv("EIMIR_SERVER_ADMIN_EMAILS", f'["{ADMIN_EMAIL}"]')
    get_settings.cache_clear()
    account = make_account(session, "Operator")
    session.add(
        AccountEmail(account_id=account.id, email=ADMIN_EMAIL, is_primary=True, verified_at=now())
    )
    session.flush()
    yield sign_in(session, account)
    get_settings.cache_clear()


def _use(monkeypatch, **values):  # type: ignore[no-untyped-def]
    settings = get_settings().model_copy(update=values)
    monkeypatch.setattr(server_admin_api, "get_runtime_settings", lambda: settings)
    return settings


def _hour(session, at, **values):  # type: ignore[no-untyped-def]
    row = {
        "requests": 10,
        "server_errors": 1,
        "p95_ms": 250,
        "new_accounts": 1,
        "active_spaces": 2,
        "stored_bytes": 100,
        "disk_used_bytes": None,
        "disk_total_bytes": None,
        "failed_jobs": 0,
        "failed_emails": 0,
        "failed_pushes": 0,
    }
    row.update(values)
    session.add(OperationalMetricHour(hour=at.replace(minute=0, second=0, microsecond=0), **row))


def test_monitoring_requires_server_admin(client, session) -> None:  # type: ignore[no-untyped-def]
    token = sign_in(session, make_account(session, "Someone"))
    response = client.get("/api/v1/server-admin/monitoring", headers=auth(token))
    assert response.status_code == 403


def test_empty_history_is_calm(client, session, admin_token, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    _use(monkeypatch, media_store=MediaStoreBackend.S3)
    payload = client.get(
        "/api/v1/server-admin/monitoring?range=24h", headers=auth(admin_token)
    ).json()

    assert payload["points"] == []
    assert payload["storage"] == {"usedBytes": 0, "totalBytes": None, "fullInDays": None}
    assert payload["alertsEnabled"] is True
    assert {service["key"] for service in payload["services"]} == {
        "worker",
        "video_worker",
        "email",
        "push",
    }
    worker = next(service for service in payload["services"] if service["key"] == "worker")
    assert worker["status"] == "no_heartbeat_signal"


def test_24h_returns_hourly_points(client, session, admin_token, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    _use(monkeypatch, media_store=MediaStoreBackend.S3)
    at = now()
    for hours in (1, 2, 3, 30):
        _hour(session, at - timedelta(hours=hours))
    session.flush()

    points = client.get(
        "/api/v1/server-admin/monitoring?range=24h", headers=auth(admin_token)
    ).json()["points"]
    assert len(points) == 3
    assert points[0]["at"] < points[-1]["at"]


def test_30d_sums_per_day(client, session, admin_token, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    _use(monkeypatch, media_store=MediaStoreBackend.S3)
    day = (now() - timedelta(days=2)).replace(hour=8)
    _hour(session, day, requests=10, p95_ms=100)
    _hour(session, day + timedelta(hours=1), requests=5, p95_ms=500)
    _hour(session, day + timedelta(days=1), requests=7)
    session.flush()

    points = client.get(
        "/api/v1/server-admin/monitoring?range=30d", headers=auth(admin_token)
    ).json()["points"]
    assert [point["requests"] for point in points] == [15, 7]
    assert points[0]["p95Ms"] == 500


def test_forecast_needs_a_total_and_a_rising_trend(
    client, session, admin_token, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    _use(monkeypatch, media_store=MediaStoreBackend.LOCAL)
    start = now() - timedelta(days=10)
    for day in range(10):
        _hour(
            session,
            start + timedelta(days=day),
            disk_used_bytes=1_000 + day * 10,
            disk_total_bytes=2_000,
        )
    session.flush()

    storage = client.get(
        "/api/v1/server-admin/monitoring?range=30d", headers=auth(admin_token)
    ).json()["storage"]
    assert storage["totalBytes"] == 2_000
    assert 80 <= storage["fullInDays"] <= 120


def test_overview_reports_worker_liveness(client, session, admin_token) -> None:  # type: ignore[no-untyped-def]
    at = now()
    session.add(
        WorkerHeartbeat(
            worker_name="w",
            role="worker",
            build_revision="r",
            last_seen_at=at,
            last_progress_at=at,
        )
    )
    session.flush()

    payload = client.get("/api/v1/server-admin/overview", headers=auth(admin_token)).json()
    assert payload["workerStatus"] == "ok"
    assert payload["workerLastSeenAt"] is not None
    assert payload["videoWorkerStatus"] == "no_heartbeat_signal"
    assert payload["emailFailuresLastHour"] == 0
    assert payload["pushFailuresLastHour"] == 0
    assert payload["backupStatus"] == "not_configured"


@pytest.mark.parametrize(("deployment", "expected"), [("cloud", True), ("self_hosted", False)])
def test_backup_warning_only_on_cloud(
    client, session, admin_token, monkeypatch, deployment, expected
) -> None:  # type: ignore[no-untyped-def]
    _use(monkeypatch, deployment=Deployment(deployment))
    codes = client.get("/api/v1/server-admin/overview", headers=auth(admin_token)).json()[
        "warningCodes"
    ]
    assert ("backup_not_configured" in codes) is expected


def test_alert_switch_is_audited(client, session, admin_token) -> None:  # type: ignore[no-untyped-def]
    response = client.put(
        "/api/v1/server-admin/settings/monitoring-alerts",
        headers=auth(admin_token),
        json={"enabled": False},
    )
    assert response.status_code == 200
    assert response.json()["monitoringAlertsEnabled"] is False
    event = session.execute(
        select(InstanceAdministrationEvent).where(
            InstanceAdministrationEvent.setting == "monitoring_alerts_enabled"
        )
    ).scalar_one()
    assert (event.previous_value, event.new_value) == (True, False)
