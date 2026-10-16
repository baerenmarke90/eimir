"""Unit tests for observability, structured logging, request correlation, and redaction."""

from __future__ import annotations

import asyncio
import json
import logging

import pytest
from starlette.responses import PlainTextResponse

from eimir.config import Environment, LogFormat, Settings
from eimir.core.ids import new_id
from eimir.observability import (
    REDACTED,
    ConsoleLogFormatter,
    JsonLogFormatter,
    RedactingFilter,
    RequestIdMiddleware,
    bind_actor_context,
    get_account_id,
    get_correlation_id,
    get_request_id,
    get_space_id,
    reset_context,
    scrub_data,
    scrub_headers,
    scrub_message,
    scrub_url,
    set_account_id,
    set_correlation_id,
    set_request_id,
    set_space_id,
)


class TestContextVariables:
    def setup_method(self) -> None:
        reset_context()

    def teardown_method(self) -> None:
        reset_context()

    def test_request_and_correlation_id_lifecycle(self) -> None:
        assert get_request_id() is None
        assert get_correlation_id() is None

        set_request_id("req-123")
        set_correlation_id("corr-456")

        assert get_request_id() == "req-123"
        assert get_correlation_id() == "corr-456"

        reset_context()
        assert get_request_id() is None
        assert get_correlation_id() is None

    def test_actor_and_space_binding(self) -> None:
        account_uuid = new_id()
        space_uuid = new_id()

        bind_actor_context(account_id=account_uuid, space_id=space_uuid)
        assert get_account_id() == str(account_uuid)
        assert get_space_id() == str(space_uuid)

        reset_context()
        assert get_account_id() is None
        assert get_space_id() is None

    @pytest.mark.asyncio
    async def test_context_isolation_across_tasks(self) -> None:
        async def task_worker(task_id: str) -> tuple[str | None, str | None]:
            set_request_id(f"req-{task_id}")
            set_correlation_id(f"corr-{task_id}")
            await asyncio.sleep(0.01)
            return get_request_id(), get_correlation_id()

        result_a, result_b = await asyncio.gather(task_worker("A"), task_worker("B"))

        assert result_a == ("req-A", "corr-A")
        assert result_b == ("req-B", "corr-B")


class TestRedaction:
    def test_scrub_url_query_params(self) -> None:
        url_with_tokens = (
            "https://example.com/api/v1/auth/callback?code=secret123&state=xyz&other=safe"
        )
        scrubbed = scrub_url(url_with_tokens)

        assert "secret123" not in scrubbed
        assert f"code={REDACTED}" in scrubbed
        assert "other=safe" in scrubbed

    def test_scrub_s3_presigned_url(self) -> None:
        s3_url = (
            "https://bucket.s3.amazonaws.com/media/photo.jpg?"
            "X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE&"
            "X-Amz-Signature=d2c6e8f4a1b2c3d4e5f6"
        )
        scrubbed = scrub_url(s3_url)

        assert "d2c6e8f4a1b2c3d4e5f6" not in scrubbed
        assert "AKIAIOSFODNN7EXAMPLE" not in scrubbed
        assert f"X-Amz-Signature={REDACTED}" in scrubbed
        assert f"X-Amz-Credential={REDACTED}" in scrubbed

    def test_scrub_headers(self) -> None:
        headers = {
            "Authorization": "Bearer secret_bearer_token",
            "Cookie": "session=secret_cookie_value",
            "X-Bootstrap-Token": "secret_bootstrap",
            "X-Cursor-Key": "secret_cursor",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        scrubbed = scrub_headers(headers)

        assert scrubbed["Authorization"] == REDACTED
        assert scrubbed["Cookie"] == REDACTED
        assert scrubbed["X-Bootstrap-Token"] == REDACTED
        assert scrubbed["X-Cursor-Key"] == REDACTED
        assert scrubbed["Content-Type"] == "application/json"
        assert scrubbed["Accept"] == "application/json"

    def test_scrub_message_patterns(self) -> None:
        msg = (
            "Caller authenticated via Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz "
            "and password: 'myPassword123'"
        )
        scrubbed = scrub_message(msg)

        assert "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz" not in scrubbed
        assert "myPassword123" not in scrubbed
        assert f"Bearer {REDACTED}" in scrubbed
        assert f"password={REDACTED}" in scrubbed

    def test_scrub_nested_data_and_domain_content(self) -> None:
        sensitive_payload = {
            "password": "super-secret-password",
            "bootstrap_token": "bootstrap-32-chars-long-secret",
            "body": "Private journal entry with very intimate memories",
            "text": "Heart moment text that should never be logged",
            "location": "Paris, 5th arrondissement",
            "latitude": 48.8566,
            "longitude": 2.3522,
            "metadata": {
                "client_secret": "oidc-secret-value",
                "safe_field": 42,
                "nested_list": [
                    {"token": "token-in-list", "status": "active"},
                ],
            },
        }
        scrubbed = scrub_data(sensitive_payload)

        assert scrubbed["password"] == REDACTED
        assert scrubbed["bootstrap_token"] == REDACTED
        assert scrubbed["body"] == REDACTED
        assert scrubbed["text"] == REDACTED
        assert scrubbed["location"] == REDACTED
        assert scrubbed["latitude"] == REDACTED
        assert scrubbed["longitude"] == REDACTED
        assert scrubbed["metadata"]["client_secret"] == REDACTED
        assert scrubbed["metadata"]["safe_field"] == 42
        assert scrubbed["metadata"]["nested_list"][0]["token"] == REDACTED
        assert scrubbed["metadata"]["nested_list"][0]["status"] == "active"

    def test_redacting_filter_on_log_record(self) -> None:
        redacting_filter = RedactingFilter()
        record = logging.LogRecord(
            name="test_logger",
            level=logging.INFO,
            pathname="test.py",
            lineno=10,
            msg="User failed auth with Bearer mySecretToken123",
            args=("Bearer tokenInArg456",),
            exc_info=None,
        )

        redacting_filter.filter(record)
        assert record.msg == "User failed auth with Bearer [REDACTED]"
        assert record.args == ("Bearer [REDACTED]",)


class TestFormatters:
    def setup_method(self) -> None:
        reset_context()

    def teardown_method(self) -> None:
        reset_context()

    def test_json_formatter_structure(self) -> None:
        formatter = JsonLogFormatter()
        set_request_id("req-test-json")
        set_correlation_id("corr-test-json")
        set_account_id("acc-test-json")
        set_space_id("space-test-json")

        record = logging.LogRecord(
            name="eimir.test",
            level=logging.INFO,
            pathname="test.py",
            lineno=20,
            msg="Operation succeeded for item %d",
            args=(123,),
            exc_info=None,
        )
        record.__dict__["extra_key"] = "extra_value"

        formatted = formatter.format(record)
        data = json.loads(formatted)

        assert data["level"] == "INFO"
        assert data["logger"] == "eimir.test"
        assert data["message"] == "Operation succeeded for item 123"
        assert data["request_id"] == "req-test-json"
        assert data["correlation_id"] == "corr-test-json"
        assert data["account_id"] == "acc-test-json"
        assert data["space_id"] == "space-test-json"
        assert data["extra"]["extra_key"] == "extra_value"
        assert "timestamp" in data

    def test_console_formatter_output(self) -> None:
        formatter = ConsoleLogFormatter()
        set_request_id("req-console")

        record = logging.LogRecord(
            name="eimir.test",
            level=logging.INFO,
            pathname="test.py",
            lineno=20,
            msg="Hello console",
            args=(),
            exc_info=None,
        )

        formatted = formatter.format(record)
        assert "INFO eimir.test [req=req-console] Hello console" in formatted

    def test_effective_log_format_in_settings(self) -> None:
        dev_settings = Settings(environment=Environment.DEVELOPMENT)
        assert dev_settings.effective_log_format == LogFormat.TEXT

        prod_settings = Settings(
            environment=Environment.PRODUCTION,
            allowed_hosts=["app.example"],
            cursor_signing_key="a" * 32,
            public_base_url="https://app.example",
            mail_transport="smtp",
        )
        assert prod_settings.effective_log_format == LogFormat.JSON

        explicit_settings = Settings(
            environment=Environment.DEVELOPMENT,
            log_format=LogFormat.JSON,
        )
        assert explicit_settings.effective_log_format == LogFormat.JSON


class TestMiddlewares:
    @pytest.mark.asyncio
    async def test_request_id_middleware_generates_and_propagates_id(self) -> None:
        captured_request_id: str | None = None
        captured_correlation_id: str | None = None

        async def inner_app(scope: dict, receive: object, send: object) -> None:
            nonlocal captured_request_id, captured_correlation_id
            captured_request_id = get_request_id()
            captured_correlation_id = get_correlation_id()
            response = PlainTextResponse("OK")
            await response(scope, receive, send)

        middleware = RequestIdMiddleware(inner_app)

        sent_messages: list[dict] = []

        async def fake_send(message: dict) -> None:
            sent_messages.append(message)

        scope = {
            "type": "http",
            "method": "GET",
            "path": "/api/v1/health",
            "headers": [],
        }

        await middleware(scope, lambda: None, fake_send)

        assert captured_request_id is not None
        assert captured_correlation_id == captured_request_id
        # Response headers contain X-Request-ID
        start_message = next(msg for msg in sent_messages if msg["type"] == "http.response.start")
        header_dict = {
            k.decode("latin1").lower(): v.decode("latin1") for k, v in start_message["headers"]
        }
        assert header_dict.get("x-request-id") == captured_request_id

        # Context is cleaned up after request
        assert get_request_id() is None
        assert get_correlation_id() is None

    @pytest.mark.asyncio
    async def test_request_id_middleware_preserves_valid_incoming_id(self) -> None:
        captured_request_id: str | None = None

        async def inner_app(scope: dict, receive: object, send: object) -> None:
            nonlocal captured_request_id
            captured_request_id = get_request_id()
            response = PlainTextResponse("OK")
            await response(scope, receive, send)

        middleware = RequestIdMiddleware(inner_app)

        scope = {
            "type": "http",
            "method": "GET",
            "path": "/api/v1/health",
            "headers": [(b"x-request-id", b"custom-client-id-12345")],
        }

        sent_messages: list[dict] = []

        async def fake_send(message: dict) -> None:
            sent_messages.append(message)

        await middleware(scope, lambda: None, fake_send)

        assert captured_request_id == "custom-client-id-12345"
        start_message = next(msg for msg in sent_messages if msg["type"] == "http.response.start")
        header_dict = {
            k.decode("latin1").lower(): v.decode("latin1") for k, v in start_message["headers"]
        }
        assert header_dict.get("x-request-id") == "custom-client-id-12345"

    @pytest.mark.asyncio
    async def test_request_id_middleware_replaces_invalid_incoming_id(self) -> None:
        captured_request_id: str | None = None

        async def inner_app(scope: dict, receive: object, send: object) -> None:
            nonlocal captured_request_id
            captured_request_id = get_request_id()
            response = PlainTextResponse("OK")
            await response(scope, receive, send)

        middleware = RequestIdMiddleware(inner_app)

        # Invalid characters (spaces, special chars)
        scope = {
            "type": "http",
            "method": "GET",
            "path": "/api/v1/health",
            "headers": [(b"x-request-id", b"invalid id with spaces and <script>")],
        }

        sent_messages: list[dict] = []

        async def fake_send(message: dict) -> None:
            sent_messages.append(message)

        await middleware(scope, lambda: None, fake_send)

        assert captured_request_id != "invalid id with spaces and <script>"
        assert len(captured_request_id) > 10
