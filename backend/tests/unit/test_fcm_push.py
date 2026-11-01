"""FCM transport, activation isolation, official authentication and safe failures."""

from __future__ import annotations

import json
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from uuid import uuid4

import httpx
import pytest
import requests
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from google.auth.credentials import TokenState

from eimir.config import Settings
from eimir.engagement import fcm_push, push

FID = "c" + "a" * 21
ACTIVATION = "c8e50c10-35fb-4ee9-94bf-e313ab128122"
NOW = datetime(2026, 10, 20, 12, tzinfo=UTC)


def configuration(**overrides: str) -> Settings:
    values = {
        "push_fcm_project_id": "eimir-test",
        "push_fcm_android_package": "de.eimir.app",
        "push_fcm_credentials_file": "/unused/fixture-only.json",
    }
    values.update(overrides)
    return Settings(**values)


def endpoint(fid: str = FID, activation: str = ACTIVATION) -> str:
    return json.dumps({"fid": fid, "activationId": activation}, separators=(",", ":"))


class FakeCredentials:
    token: str | None = "fixture-access-token"
    token_state = TokenState.FRESH

    def apply(self, headers: dict[str, str]) -> None:
        headers["authorization"] = "Bearer fixture-access-token"


@pytest.fixture
def fake_credentials(monkeypatch: pytest.MonkeyPatch) -> FakeCredentials:
    credentials = FakeCredentials()
    monkeypatch.setattr(fcm_push, "_load_credentials", lambda _: credentials)
    return credentials


@pytest.fixture
def provider(fake_credentials: FakeCredentials) -> Iterator[fcm_push.FcmPushProvider]:
    instance = fcm_push.FcmPushProvider(configuration())
    yield instance
    instance.close()


def send(provider: fcm_push.FcmPushProvider, **overrides: Any) -> push.PushSendResult:
    values: dict[str, Any] = {
        "idempotency_key": "sensitive-notification:endpoint",
        "endpoint": endpoint(),
        "notification_reference": {"id": "sensitive-reference", "kind": "PARTNER_KISS"},
        "generic_presentation_key": push.GENERIC_PRESENTATION_KEY,
    }
    values.update(overrides)
    return provider.send(**values)


@pytest.mark.parametrize(
    "changes",
    [
        {"push_fcm_project_id": ""},
        {"push_fcm_android_package": ""},
        {"push_fcm_credentials_file": ""},
        {"push_fcm_project_id": "../another-project"},
        {"push_fcm_android_package": "de/eimir/app"},
        {"push_fcm_credentials_file": "relative.json"},
        {"push_fcm_credentials_file": "/private/invalid\npath"},
    ],
)
def test_partial_or_invalid_configuration_fails_closed(changes: dict[str, str]) -> None:
    with pytest.raises(ValueError, match="FCM"):
        configuration(**changes)


def test_settings_do_not_read_credentials_or_call_google() -> None:
    assert Settings().push_fcm_project_id == ""
    assert configuration().push_fcm_project_id == "eimir-test"
    with pytest.raises(ValueError, match="unavailable or invalid"):
        fcm_push.FcmPushProvider(configuration())


def test_identity_includes_activation_and_survives_json_key_order(
    provider: fcm_push.FcmPushProvider,
) -> None:
    assert provider.accepts_endpoint(endpoint())
    reversed_keys = json.dumps({"activationId": ACTIVATION, "fid": FID}, separators=(",", ":"))
    assert provider.registration_identity(endpoint()) == provider.registration_identity(
        reversed_keys
    )
    assert provider.registration_identity(endpoint()) != provider.registration_identity(
        endpoint(activation=str(uuid4()))
    )
    assert provider.registration_identity(endpoint()) != provider.registration_identity(
        endpoint(fid="d" + "b" * 21)
    )


@pytest.mark.parametrize(
    "value",
    [
        "not-json",
        "[]",
        "null",
        endpoint().replace(",", ", "),
        endpoint(activation=ACTIVATION.upper()),
        endpoint(activation="c8e50c10-35fb-7ee9-94bf-e313ab128122"),
        endpoint(activation=""),
        endpoint(fid=""),
        endpoint(fid="https://attacker.example"),
        endpoint(fid="a" * 2048),
        '{"fid":true,"activationId":"' + ACTIVATION + '"}',
        '{"fid":"' + FID + '","fid":"' + FID + '","activationId":"' + ACTIVATION + '"}',
        endpoint()[:-1] + ',"accountId":"foreign"}',
    ],
)
def test_endpoint_validation_rejects_untrusted_variants(
    provider: fcm_push.FcmPushProvider, value: str
) -> None:
    assert not provider.accepts_endpoint(value)
    with pytest.raises(push.PushProviderError) as failure:
        send(provider, endpoint=value)
    assert failure.value.code == "PUSH_SUBSCRIPTION_INVALID"
    assert not failure.value.retryable


def test_send_uses_only_activation_wake_and_fixed_google_destination(
    fake_credentials: FakeCredentials,
) -> None:
    observed: list[httpx.Request] = []

    def capture(request: httpx.Request) -> httpx.Response:
        observed.append(request)
        return httpx.Response(200, json={"name": "projects/eimir-test/messages/accepted-123"})

    client = httpx.Client(transport=httpx.MockTransport(capture))
    provider = fcm_push.FcmPushProvider(configuration(), client=client)
    try:
        receipt = send(provider)
        assert receipt.provider_message_id == "projects/eimir-test/messages/accepted-123"
        assert len(observed) == 1
        request = observed[0]
        assert str(request.url) == "https://fcm.googleapis.com/v1/projects/eimir-test/messages:send"
        assert request.headers["authorization"] == "Bearer fixture-access-token"
        assert request.extensions["timeout"] == {
            "connect": 5.0,
            "read": 5.0,
            "write": 5.0,
            "pool": 5.0,
        }
        assert json.loads(request.content) == {
            "message": {
                "fid": FID,
                "data": {"type": "wake", "activationId": ACTIVATION},
                "android": {
                    "ttl": "300s",
                    "restricted_package_name": "de.eimir.app",
                    "collapse_key": "eimir-wake",
                    "priority": "high",
                },
            }
        }
        assert b"sensitive-reference" not in request.content
        assert b"sensitive-notification" not in request.content
    finally:
        provider.close()


@pytest.mark.parametrize(
    ("status", "remote_code", "expected", "retryable"),
    [
        (404, "UNREGISTERED", "PUSH_SUBSCRIPTION_GONE", False),
        (404, "OTHER", "FCM_REJECTED", False),
        (400, "INVALID_ARGUMENT", "FCM_REJECTED", False),
        (403, "SENDER_ID_MISMATCH", "FCM_SENDER_MISMATCH", False),
        (403, "OTHER", "FCM_PERMISSION_DENIED", False),
        (401, "OTHER", "FCM_AUTH_REJECTED", True),
        (429, "QUOTA_EXCEEDED", "FCM_QUOTA_EXCEEDED", True),
        (500, "INTERNAL", "FCM_UNAVAILABLE", True),
        (503, "UNAVAILABLE", "FCM_UNAVAILABLE", True),
        (302, "OTHER", "FCM_REJECTED", False),
    ],
)
def test_remote_failures_are_sanitized_and_never_retried_inside_sender(
    fake_credentials: FakeCredentials,
    monkeypatch: pytest.MonkeyPatch,
    status: int,
    remote_code: str,
    expected: str,
    retryable: bool,
) -> None:
    monkeypatch.setattr(fcm_push.clock, "now", lambda: NOW)
    calls: list[httpx.Request] = []

    def rejected(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(
            status,
            headers={"Retry-After": "120", "Location": "https://attacker.example"},
            json={
                "error": {
                    "message": "private provider prose",
                    "details": [{"@type": fcm_push._FCM_ERROR_TYPE, "errorCode": remote_code}],
                }
            },
        )

    provider = fcm_push.FcmPushProvider(
        configuration(), client=httpx.Client(transport=httpx.MockTransport(rejected))
    )
    try:
        with pytest.raises(push.PushProviderError) as failure:
            send(provider)
        assert failure.value.code == expected
        assert failure.value.retryable is retryable
        assert "private" not in str(failure.value)
        assert len(calls) == 1
        if status in {429, 503}:
            assert failure.value.retry_not_before == NOW + timedelta(seconds=120)
        if status == 429:
            assert failure.value.retry_base == timedelta(seconds=60)
        if status == 401:
            assert fake_credentials.token is None
    finally:
        provider.close()


@pytest.mark.parametrize("body", [b"not-json", b"x" * 8193, b'{"name":"private prose"}'])
def test_invalid_or_oversized_receipt_is_safe_failure(
    fake_credentials: FakeCredentials, body: bytes
) -> None:
    provider = fcm_push.FcmPushProvider(
        configuration(),
        client=httpx.Client(
            transport=httpx.MockTransport(lambda _: httpx.Response(200, content=body))
        ),
    )
    try:
        with pytest.raises(push.PushProviderError, match=r"^FCM_RESPONSE_INVALID$"):
            send(provider)
    finally:
        provider.close()


def test_retry_after_date_and_invalid_headers(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(fcm_push.clock, "now", lambda: NOW)
    assert fcm_push._retry_not_before("Tue, 20 Oct 2026 12:02:00 GMT") == NOW + timedelta(minutes=2)
    for value in (None, "bad date", "-2", "1.5"):
        assert fcm_push._retry_not_before(value) is None
    with pytest.raises(push.PushProviderError, match="FCM_RETRY_AFTER_INVALID"):
        fcm_push._retry_not_before("9" * 80)


def test_official_auth_uses_scoped_fixture_credentials_and_one_bounded_exchange(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    fixture = {
        "type": "service_account",
        "project_id": "eimir-test",
        "client_email": "fixture@eimir-test.iam.gserviceaccount.com",
        "token_uri": fcm_push._TOKEN_URL,
        "private_key": key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        ).decode(),
    }
    path = tmp_path / "synthetic-key.json"
    path.write_text(json.dumps(fixture))
    credentials = fcm_push._load_credentials(configuration(push_fcm_credentials_file=str(path)))
    assert credentials.scopes == [fcm_push._SCOPE]
    calls: list[dict[str, Any]] = []

    class FixtureSession(requests.Session):
        def request(self, method: str, url: str, **kwargs: Any) -> requests.Response:  # type: ignore[override]
            calls.append({"method": method, "url": url, **kwargs})
            response = requests.Response()
            response.status_code = 200
            response._content = (
                b'{"access_token":"synthetic-access","expires_in":3600,"token_type":"Bearer"}'
            )
            return response

    headers: dict[str, str] = {}
    transport = fcm_push._AuthRequest(FixtureSession())
    assert credentials.token_state is TokenState.INVALID
    credentials.refresh(transport)
    credentials.apply(headers)
    assert headers["authorization"] == "Bearer synthetic-access"
    assert len(calls) == 1
    assert calls[0]["url"] == fcm_push._TOKEN_URL
    assert calls[0]["method"] == "POST"
    assert credentials.token_state is TokenState.FRESH
    with pytest.raises(push.PushProviderError, match=r"^FCM_AUTH_UNAVAILABLE$"):
        transport(url=fcm_push._TOKEN_URL, method="POST")

    for field, bad in (
        ("project_id", "other-project"),
        ("token_uri", "https://attacker.example"),
        ("type", "external_account"),
        ("private_key", "private invalid value"),
    ):
        path.write_text(json.dumps({**fixture, field: bad}))
        with pytest.raises(
            ValueError, match=r"^FCM sender credential file is unavailable or invalid\.$"
        ):
            fcm_push._load_credentials(configuration(push_fcm_credentials_file=str(path)))


def test_auth_transport_rejects_other_targets_and_sdk_retry_responses(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = fcm_push._AuthSession()
    try:
        with pytest.raises(push.PushProviderError, match=r"^FCM_AUTH_TARGET_BLOCKED$"):
            session.request("POST", "https://attacker.example/token")
    finally:
        session.close()

    class BusySession(requests.Session):
        def request(self, method: str, url: str, **kwargs: Any) -> requests.Response:  # type: ignore[override]
            response = requests.Response()
            response.status_code = 503
            response._content = b'{"error":"temporarily_unavailable"}'
            return response

    with pytest.raises(push.PushProviderError, match=r"^FCM_AUTH_UNAVAILABLE$"):
        fcm_push._AuthRequest(BusySession())(url=fcm_push._TOKEN_URL, method="POST")


def test_auth_transport_bounds_timeout_redirects_response_and_elapsed_budget(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    observed: dict[str, Any] = {}
    body = b'{"access_token":"fixture"}'

    def exchange(self: object, method: str, url: str, **kwargs: Any) -> requests.Response:
        observed.update(method=method, url=url, **kwargs)
        response = requests.Response()
        response.status_code = 200
        response._content = body
        response._content_consumed = True
        return response

    monkeypatch.setattr(requests.Session, "request", exchange)
    session = fcm_push._AuthSession()
    try:
        assert not session.trust_env
        result = session.request("POST", fcm_push._TOKEN_URL, timeout=120)
        assert result.content == body
        assert observed["timeout"] == 5
        assert observed["allow_redirects"] is False
        assert observed["stream"] is True
        body = b"x" * 8193
        with pytest.raises(push.PushProviderError, match="FCM_AUTH_RESPONSE_INVALID"):
            session.request("POST", fcm_push._TOKEN_URL)
        body = b"fixture"
        ticks = iter((0.0, 10.1))
        monkeypatch.setattr(fcm_push, "time", SimpleNamespace(monotonic=lambda: next(ticks)))
        with pytest.raises(push.PushProviderError, match="FCM_AUTH_RESPONSE_INVALID"):
            session.request("POST", fcm_push._TOKEN_URL)
    finally:
        session.close()


def test_sender_uses_sdk_token_state_to_refresh_stale_credentials_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class Credentials:
        token_state = TokenState.STALE
        refreshes = 0

        def refresh(self, request: Any) -> None:
            assert isinstance(request, fcm_push._AuthRequest)
            self.refreshes += 1
            self.token_state = TokenState.FRESH

        def apply(self, headers: dict[str, str]) -> None:
            headers["authorization"] = "Bearer synthetic-access"

    credentials = Credentials()
    monkeypatch.setattr(fcm_push, "_load_credentials", lambda _: credentials)
    provider = fcm_push.FcmPushProvider(
        configuration(),
        client=httpx.Client(
            transport=httpx.MockTransport(
                lambda _: httpx.Response(
                    200, json={"name": "projects/eimir-test/messages/accepted"}
                )
            )
        ),
    )
    try:
        send(provider)
        send(provider)
        assert credentials.refreshes == 1
        credentials.token_state = TokenState.INVALID
        send(provider)
        assert credentials.refreshes == 2
    finally:
        provider.close()


@pytest.mark.parametrize("status", [400, 401, 403, 404, 429, 503])
@pytest.mark.parametrize("budget", ["size", "elapsed"])
def test_auth_error_status_and_retry_headers_survive_response_budget(
    monkeypatch: pytest.MonkeyPatch, status: int, budget: str
) -> None:
    monkeypatch.setattr(fcm_push.clock, "now", lambda: NOW)
    body_reads: list[int] = []

    class ErrorResponse(requests.Response):
        def iter_content(self, chunk_size: int = 1, **kwargs: Any) -> Iterator[bytes]:  # type: ignore[override]
            body_reads.append(chunk_size)
            yield from super().iter_content(chunk_size, **kwargs)

    def exchange(self: object, method: str, url: str, **kwargs: Any) -> requests.Response:
        response = ErrorResponse()
        response.status_code = status
        response.headers["Retry-After"] = "120"
        response._content = b"x" * 8193 if budget == "size" else b"trickle"
        response._content_consumed = True
        return response

    monkeypatch.setattr(requests.Session, "request", exchange)
    if budget == "elapsed":
        ticks = iter((0.0, 10.1))
        monkeypatch.setattr(fcm_push, "time", SimpleNamespace(monotonic=lambda: next(ticks)))
    session = fcm_push._AuthSession()
    try:
        with pytest.raises(push.PushProviderError) as failure:
            fcm_push._AuthRequest(session)(url=fcm_push._TOKEN_URL, method="POST")
        transient = status in {429, 503}
        assert failure.value.code == ("FCM_AUTH_UNAVAILABLE" if transient else "FCM_AUTH_REJECTED")
        assert failure.value.retryable is transient
        assert failure.value.retry_not_before == NOW + timedelta(seconds=120)
        assert failure.value.retry_base == (timedelta(seconds=60) if status == 429 else None)
        assert body_reads == []
    finally:
        session.close()


@pytest.mark.parametrize(
    ("status", "code", "retryable"),
    [
        (400, "FCM_REJECTED", False),
        (401, "FCM_AUTH_REJECTED", True),
        (403, "FCM_PERMISSION_DENIED", False),
        (404, "FCM_REJECTED", False),
        (429, "FCM_QUOTA_EXCEEDED", True),
        (503, "FCM_UNAVAILABLE", True),
    ],
)
@pytest.mark.parametrize("budget", ["size", "elapsed"])
def test_message_error_status_and_token_invalidation_survive_response_budget(
    fake_credentials: FakeCredentials,
    monkeypatch: pytest.MonkeyPatch,
    status: int,
    code: str,
    retryable: bool,
    budget: str,
) -> None:
    monkeypatch.setattr(fcm_push.clock, "now", lambda: NOW)
    if budget == "elapsed":
        ticks = iter((0.0, 10.1))
        monkeypatch.setattr(fcm_push, "time", SimpleNamespace(monotonic=lambda: next(ticks)))
    body = b"x" * 8193 if budget == "size" else b"trickle"
    provider = fcm_push.FcmPushProvider(
        configuration(),
        client=httpx.Client(
            transport=httpx.MockTransport(
                lambda _: httpx.Response(status, headers={"Retry-After": "120"}, content=body)
            )
        ),
    )
    try:
        with pytest.raises(push.PushProviderError) as failure:
            send(provider)
        assert failure.value.code == code
        assert failure.value.retryable is retryable
        assert (fake_credentials.token is None) is (status == 401)
        assert failure.value.code != "PUSH_SUBSCRIPTION_GONE"
        if status in {429, 503}:
            assert failure.value.retry_not_before == NOW + timedelta(seconds=120)
        if status == 429:
            assert failure.value.retry_base == timedelta(seconds=60)
    finally:
        provider.close()


@pytest.mark.parametrize(
    ("status", "code", "retryable"),
    [
        (200, "FCM_NETWORK_ERROR", True),
        (400, "FCM_REJECTED", False),
        (401, "FCM_AUTH_REJECTED", True),
        (403, "FCM_PERMISSION_DENIED", False),
        (404, "FCM_REJECTED", False),
        (429, "FCM_QUOTA_EXCEEDED", True),
        (503, "FCM_UNAVAILABLE", True),
    ],
)
def test_truncated_message_error_stream_preserves_headers_without_trusting_partial_body(
    fake_credentials: FakeCredentials,
    monkeypatch: pytest.MonkeyPatch,
    status: int,
    code: str,
    retryable: bool,
) -> None:
    monkeypatch.setattr(fcm_push.clock, "now", lambda: NOW)

    class BrokenStream(httpx.SyncByteStream):
        def __iter__(self) -> Iterator[bytes]:
            yield json.dumps(
                {
                    "error": {
                        "details": [
                            {
                                "@type": fcm_push._FCM_ERROR_TYPE,
                                "errorCode": "UNREGISTERED",
                            }
                        ]
                    }
                }
            ).encode()
            raise httpx.ReadError("private provider prose")

    provider = fcm_push.FcmPushProvider(
        configuration(),
        client=httpx.Client(
            transport=httpx.MockTransport(
                lambda _: httpx.Response(
                    status, headers={"Retry-After": "120"}, stream=BrokenStream()
                )
            )
        ),
    )
    try:
        with pytest.raises(push.PushProviderError) as failure:
            send(provider)
        assert failure.value.code == code
        assert failure.value.retryable is retryable
        assert (fake_credentials.token is None) is (status == 401)
        assert "private" not in str(failure.value)
        if status in {429, 503}:
            assert failure.value.retry_not_before == NOW + timedelta(seconds=120)
    finally:
        provider.close()
