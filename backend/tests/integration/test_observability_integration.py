"""Integration tests for request ID propagation and job correlation."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlalchemy.orm import sessionmaker

from eimir.jobs import queue
from eimir.jobs.models import Job
from eimir.jobs.worker import registry, run_once
from eimir.main import create_app
from eimir.observability import (
    get_correlation_id,
    reset_context,
    set_correlation_id,
)
from tests.conftest import requires_database


class TestHttpHeaderPropagation:
    def setup_method(self) -> None:
        reset_context()

    def teardown_method(self) -> None:
        reset_context()

    def test_health_endpoint_returns_generated_request_id(self) -> None:
        client = TestClient(create_app())
        response = client.get("/api/v1/health")

        assert response.status_code == 200
        assert "x-request-id" in response.headers
        assert len(response.headers["x-request-id"]) > 10

    def test_health_endpoint_echos_custom_request_id(self) -> None:
        client = TestClient(create_app())
        custom_id = "test-correlation-id-998877"
        response = client.get("/api/v1/health", headers={"X-Request-ID": custom_id})

        assert response.status_code == 200
        assert response.headers.get("x-request-id") == custom_id

    def test_error_response_contains_request_id(self) -> None:
        client = TestClient(create_app(), raise_server_exceptions=False)
        custom_id = "error-request-id-443322"
        response = client.get("/api/v1/non-existent-path", headers={"X-Request-ID": custom_id})

        assert response.status_code == 404
        assert response.headers.get("x-request-id") == custom_id


@pytest.mark.integration
@requires_database
class TestJobCorrelationIntegration:
    def setup_method(self) -> None:
        reset_context()

    def teardown_method(self) -> None:
        reset_context()

    def test_job_enqueued_in_context_captures_correlation_id(self, engine: Engine) -> None:
        factory = sessionmaker(bind=engine, expire_on_commit=False)
        session = factory()
        try:
            set_correlation_id("http-request-corr-12345")
            job = queue.enqueue(session, "test_observability_job", {"param": "value"})
            session.commit()

            assert job.payload.get("_correlation_id") == "http-request-corr-12345"

            # Verify in clean query from DB
            loaded = session.get(Job, job.id)
            assert loaded is not None
            assert loaded.payload.get("_correlation_id") == "http-request-corr-12345"
        finally:
            session.close()

    def test_worker_sets_correlation_context_during_execution(self, engine: Engine) -> None:
        factory = sessionmaker(bind=engine, expire_on_commit=False)
        session = factory()

        captured_worker_corr_id: str | None = None

        def test_handler(sess: object, payload: dict) -> None:
            nonlocal captured_worker_corr_id
            captured_worker_corr_id = get_correlation_id()

        job_kind = "test_observability_worker_run"
        if registry.get(job_kind) is None:
            registry.register(job_kind, test_handler)

        try:
            set_correlation_id("origin-req-999")
            queue.enqueue(session, job_kind, {"data": "test"})
            session.commit()
            reset_context()

            assert get_correlation_id() is None

            # Run worker round
            processed = run_once("test-worker-obs", limit=10)
            assert processed >= 1
            assert captured_worker_corr_id == "origin-req-999"
            assert get_correlation_id() is None
        finally:
            session.close()
