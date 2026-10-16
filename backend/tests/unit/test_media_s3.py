"""S3-specific signature, TTL, and privacy properties."""

from __future__ import annotations

import io
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlsplit
from uuid import UUID

import httpx
import pytest

from eimir.media.base import build_storage_key
from eimir.media.s3 import S3MediaStore


@dataclass
class Clock:
    value: datetime

    def __call__(self) -> datetime:
        return self.value

    def advance(self, delta: timedelta) -> None:
        self.value += delta


class PrivateS3:
    def __init__(self, clock: Clock) -> None:
        self.clock = clock
        self.objects: dict[str, bytes] = {}
        self.cache_control: dict[str, str] = {}
        self.requests: list[httpx.Request] = []

    def _presigned_is_expired(self, request: httpx.Request) -> bool:
        issued = request.url.params.get("X-Amz-Date")
        ttl = request.url.params.get("X-Amz-Expires")
        if issued is None or ttl is None:
            return False
        instant = datetime.strptime(issued, "%Y%m%dT%H%M%SZ").replace(tzinfo=UTC)
        return self.clock() > instant + timedelta(seconds=int(ttl))

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        key = request.url.path
        presigned = request.url.params.get("X-Amz-Algorithm") is not None
        if presigned and self._presigned_is_expired(request):
            return httpx.Response(403)

        if request.method == "PUT":
            if presigned:
                if request.headers.get("if-none-match") != "*":
                    return httpx.Response(403)
                if request.headers.get("cache-control") != "private, no-store":
                    return httpx.Response(403)
                if key in self.objects:
                    return httpx.Response(412)
            self.objects[key] = request.content
            self.cache_control[key] = request.headers.get("cache-control", "")
            return httpx.Response(200)

        if request.method == "HEAD":
            return httpx.Response(200 if key in self.objects else 404)

        if request.method == "GET":
            if key not in self.objects:
                return httpx.Response(404)
            return httpx.Response(
                200,
                content=self.objects[key],
                headers={"Cache-Control": self.cache_control.get(key, "")},
            )

        if request.method == "DELETE":
            self.objects.pop(key, None)
            self.cache_control.pop(key, None)
            return httpx.Response(204)

        return httpx.Response(405)


@pytest.fixture
def s3() -> tuple[S3MediaStore, PrivateS3, Clock, httpx.Client]:
    clock = Clock(datetime(2026, 8, 25, 17, 0, tzinfo=UTC))
    provider = PrivateS3(clock)
    client = httpx.Client(transport=httpx.MockTransport(provider.handle))
    store = S3MediaStore(
        endpoint="https://s3.example.test",
        region="eu-central-1",
        bucket="eimir-private",
        access_key_id="AKIATEST",
        secret_access_key="very-secret-value",
        client=client,
        clock=clock,
    )
    return store, provider, clock, client


def key() -> str:
    return build_storage_key(UUID(int=1), UUID(int=2))


def test_upload_url_is_bound_to_one_key_and_exactly_ten_minutes(
    s3: tuple[S3MediaStore, PrivateS3, Clock, httpx.Client],
) -> None:
    store, _, _, _ = s3
    target = store.create_upload_url(key(), "image/jpeg", timedelta(minutes=10))
    parsed = urlsplit(target.url)
    query = parse_qs(parsed.query)

    assert parsed.scheme == "https"
    assert parsed.netloc == "s3.example.test"
    assert parsed.path == f"/eimir-private/{key()}"
    assert query["X-Amz-Expires"] == ["600"]
    assert query["X-Amz-Algorithm"] == ["AWS4-HMAC-SHA256"]
    assert query["X-Amz-SignedHeaders"] == ["cache-control;content-type;host;if-none-match"]
    assert len(query["X-Amz-Signature"][0]) == 64
    assert "very-secret-value" not in target.url
    assert "acl" not in target.url.lower()
    assert target.required_headers == {
        "Cache-Control": "private, no-store",
        "Content-Type": "image/jpeg",
        "If-None-Match": "*",
    }


def test_read_url_is_exactly_five_minutes_and_stops_working_after_expiry(
    s3: tuple[S3MediaStore, PrivateS3, Clock, httpx.Client],
) -> None:
    store, _, clock, client = s3
    store.put(key(), io.BytesIO(b"bild"), "image/jpeg")

    url = store.create_read_url(key(), timedelta(minutes=5))
    query = parse_qs(urlsplit(url).query)
    assert query["X-Amz-Expires"] == ["300"]
    assert client.get(url).status_code == 200
    assert client.get(url).headers["cache-control"] == "private, no-store"

    clock.advance(timedelta(minutes=5, seconds=1))
    assert client.get(url).status_code == 403


def test_expired_upload_url_cannot_create_an_object(
    s3: tuple[S3MediaStore, PrivateS3, Clock, httpx.Client],
) -> None:
    store, _, clock, client = s3
    target = store.create_upload_url(key(), "image/jpeg", timedelta(minutes=10))
    clock.advance(timedelta(minutes=10, seconds=1))

    response = client.put(target.url, content=b"zu spaet", headers=target.required_headers)

    assert response.status_code == 403
    assert not store.exists(key())


def test_upload_capability_is_write_once_while_object_exists(
    s3: tuple[S3MediaStore, PrivateS3, Clock, httpx.Client],
) -> None:
    store, _, _, client = s3
    target = store.create_upload_url(key(), "image/jpeg", timedelta(minutes=10))

    first = client.put(target.url, content=b"eins", headers=target.required_headers)
    second = client.put(target.url, content=b"zwei", headers=target.required_headers)

    assert first.status_code == 200
    assert second.status_code == 412
    with store.open(key()) as source:
        assert source.read() == b"eins"


def test_backend_requests_never_set_public_acl(
    s3: tuple[S3MediaStore, PrivateS3, Clock, httpx.Client],
) -> None:
    store, provider, _, _ = s3
    stored = store.put(key(), io.BytesIO(b"intern"), "image/jpeg")
    assert stored.size == 6
    assert provider.requests
    assert all("x-amz-acl" not in request.headers for request in provider.requests)
    assert all("acl" not in request.url.params for request in provider.requests)


def test_provider_errors_do_not_expose_request_signatures() -> None:
    def fail(_: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    store = S3MediaStore(
        endpoint="https://s3.example.test",
        region="eu-central-1",
        bucket="eimir-private",
        access_key_id="AKIATEST",
        secret_access_key="very-secret-value",
        client=httpx.Client(transport=httpx.MockTransport(fail)),
    )

    with pytest.raises(OSError) as captured:
        store.exists(key())
    text = str(captured.value)
    assert "very-secret-value" not in text
    assert "Signature=" not in text


def test_storage_key_traversal_is_rejected(
    s3: tuple[S3MediaStore, PrivateS3, Clock, httpx.Client],
) -> None:
    store, _, _, _ = s3
    with pytest.raises(ValueError):
        store.create_read_url("../../other-object", timedelta(minutes=5))
