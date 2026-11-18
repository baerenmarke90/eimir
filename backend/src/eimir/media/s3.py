"""S3-compatible media storage using AWS Signature Version 4."""

from __future__ import annotations

import hashlib
import hmac
import io
from collections.abc import Callable, Iterator, Mapping
from datetime import UTC, datetime, timedelta
from tempfile import TemporaryFile
from typing import BinaryIO
from urllib.parse import quote, urlsplit

import httpx

from eimir.core.clock import now
from eimir.media.base import ByteSource, MediaStore, StoredObject
from eimir.media.presigned import SignedUpload

_SERVICE = "s3"
_ALGORITHM = "AWS4-HMAC-SHA256"
_REQUEST_TYPE = "aws4_request"
_UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD"
_MAX_PRESIGN_SECONDS = 7 * 24 * 60 * 60
_READ_CHUNK = 64 * 1024
_RANGE_WINDOW = 1024 * 1024


class _RangeReader(io.RawIOBase):
    """Seekable object view with one bounded window, including encrypted consumers."""

    def __init__(self, size: int, load: Callable[[int, int], bytes]) -> None:
        super().__init__()
        self._size = size
        self._load = load
        self._position = 0
        self._start = -1
        self._buffer = b""

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def tell(self) -> int:
        return self._position

    def seek(self, offset: int, whence: int = io.SEEK_SET) -> int:
        origin = {io.SEEK_SET: 0, io.SEEK_CUR: self._position, io.SEEK_END: self._size}
        if whence not in origin or origin[whence] + offset < 0:
            raise ValueError("Invalid seek position.")
        self._position = origin[whence] + offset
        return self._position

    def readinto(self, target: bytearray | memoryview) -> int:  # type: ignore[override]
        view = memoryview(target).cast("B")
        if not len(view) or self._position >= self._size:
            return 0
        if not self._start <= self._position < self._start + len(self._buffer):
            self._start = self._position // _RANGE_WINDOW * _RANGE_WINDOW
            self._buffer = self._load(self._start, min(self._start + _RANGE_WINDOW, self._size) - 1)
        within = self._position - self._start
        count = min(len(view), len(self._buffer) - within)
        if count <= 0:
            raise OSError("S3 object returned an incomplete range.")
        view[:count] = self._buffer[within : within + count]
        self._position += count
        return count

    def close(self) -> None:
        self._buffer = b""
        super().close()


def _aws_quote(value: str, *, keep_slash: bool = False) -> str:
    safe = "-_.~/" if keep_slash else "-_.~"
    return quote(value, safe=safe)


def _canonical_query(parameters: Mapping[str, str]) -> str:
    encoded = [(_aws_quote(key), _aws_quote(value)) for key, value in parameters.items()]
    encoded.sort()
    return "&".join(f"{key}={value}" for key, value in encoded)


def _normalize_header(value: str) -> str:
    return " ".join(value.strip().split())


class S3MediaStore(MediaStore):
    """Private S3 bucket behind the MediaStore interface.

    The adapter uses only object-scoped GET/PUT/HEAD/DELETE requests. ACL
    operations are intentionally absent; bucket policy remains an operations
    responsibility and must prohibit public access.
    """

    def __init__(
        self,
        *,
        endpoint: str,
        region: str,
        bucket: str,
        access_key_id: str,
        secret_access_key: str,
        session_token: str | None = None,
        client: httpx.Client | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        parsed = urlsplit(endpoint.rstrip("/"))
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.query
            or parsed.fragment
            or parsed.path not in {"", "/"}
        ):
            raise ValueError("S3 endpoint must be an http(s) origin without credentials or path.")
        if not bucket or "/" in bucket:
            raise ValueError("S3 bucket must be a single non-empty bucket name.")
        if not region or not access_key_id or not secret_access_key:
            raise ValueError("S3 region and credentials are required.")

        self._endpoint = f"{parsed.scheme}://{parsed.netloc}"
        self._host = parsed.netloc.lower()
        self._region = region
        self._bucket = bucket
        self._access_key_id = access_key_id
        self._secret_access_key = secret_access_key
        self._session_token = session_token
        self._client = client or httpx.Client(timeout=30.0, follow_redirects=False)
        self._clock = clock or now

    def _object_path(self, storage_key: str) -> str:
        if (
            not storage_key
            or storage_key.startswith("/")
            or any(part in {"", ".", ".."} for part in storage_key.split("/"))
        ):
            raise ValueError("Invalid storage key.")
        bucket = _aws_quote(self._bucket)
        key = _aws_quote(storage_key, keep_slash=True)
        return f"/{bucket}/{key}"

    def _url(self, storage_key: str) -> str:
        return f"{self._endpoint}{self._object_path(storage_key)}"

    def _now(self) -> datetime:
        value = self._clock()
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    def _scope(self, date_stamp: str) -> str:
        return f"{date_stamp}/{self._region}/{_SERVICE}/{_REQUEST_TYPE}"

    def _signing_key(self, date_stamp: str) -> bytes:
        key_date = hmac.new(
            f"AWS4{self._secret_access_key}".encode(), date_stamp.encode(), hashlib.sha256
        ).digest()
        key_region = hmac.new(key_date, self._region.encode(), hashlib.sha256).digest()
        key_service = hmac.new(key_region, _SERVICE.encode(), hashlib.sha256).digest()
        return hmac.new(key_service, _REQUEST_TYPE.encode(), hashlib.sha256).digest()

    def _signature(self, string_to_sign: str, date_stamp: str) -> str:
        return hmac.new(
            self._signing_key(date_stamp), string_to_sign.encode(), hashlib.sha256
        ).hexdigest()

    def _canonical_headers(self, headers: Mapping[str, str]) -> tuple[str, str]:
        normalized = {name.lower(): _normalize_header(value) for name, value in headers.items()}
        names = sorted(normalized)
        canonical = "".join(f"{name}:{normalized[name]}\n" for name in names)
        return canonical, ";".join(names)

    def _presign(
        self,
        method: str,
        storage_key: str,
        expires_in: timedelta,
        signed_headers: Mapping[str, str],
    ) -> str:
        seconds = int(expires_in.total_seconds())
        if expires_in != timedelta(seconds=seconds) or not 1 <= seconds <= _MAX_PRESIGN_SECONDS:
            raise ValueError("Invalid presigned URL lifetime.")

        moment = self._now()
        amz_date = moment.strftime("%Y%m%dT%H%M%SZ")
        date_stamp = moment.strftime("%Y%m%d")
        scope = self._scope(date_stamp)

        headers = {"host": self._host, **signed_headers}
        canonical_headers, header_names = self._canonical_headers(headers)
        query: dict[str, str] = {
            "X-Amz-Algorithm": _ALGORITHM,
            "X-Amz-Credential": f"{self._access_key_id}/{scope}",
            "X-Amz-Date": amz_date,
            "X-Amz-Expires": str(seconds),
            "X-Amz-SignedHeaders": header_names,
        }
        if self._session_token is not None:
            query["X-Amz-Security-Token"] = self._session_token
        canonical_query = _canonical_query(query)
        canonical_request = "\n".join(
            [
                method,
                self._object_path(storage_key),
                canonical_query,
                canonical_headers,
                header_names,
                _UNSIGNED_PAYLOAD,
            ]
        )
        string_to_sign = "\n".join(
            [
                _ALGORITHM,
                amz_date,
                scope,
                hashlib.sha256(canonical_request.encode()).hexdigest(),
            ]
        )
        signature = self._signature(string_to_sign, date_stamp)
        return f"{self._url(storage_key)}?{canonical_query}&X-Amz-Signature={signature}"

    def _request(
        self,
        method: str,
        storage_key: str,
        *,
        content: bytes | Iterator[bytes] = b"",
        content_type: str | None = None,
        payload_hash: str | None = None,
        extra_headers: Mapping[str, str] | None = None,
        stream: bool = False,
    ) -> httpx.Response:
        moment = self._now()
        amz_date = moment.strftime("%Y%m%dT%H%M%SZ")
        date_stamp = moment.strftime("%Y%m%d")
        if payload_hash is None:
            if not isinstance(content, bytes):
                raise ValueError("Streaming S3 requests require an established payload hash.")
            payload_hash = hashlib.sha256(content).hexdigest()

        headers: dict[str, str] = {
            "host": self._host,
            "x-amz-content-sha256": payload_hash,
            "x-amz-date": amz_date,
        }
        if content_type is not None:
            headers["content-type"] = content_type
            headers["cache-control"] = "private, no-store"
        if self._session_token is not None:
            headers["x-amz-security-token"] = self._session_token
        if extra_headers:
            headers.update(extra_headers)

        canonical_headers, header_names = self._canonical_headers(headers)
        canonical_request = "\n".join(
            [
                method,
                self._object_path(storage_key),
                "",
                canonical_headers,
                header_names,
                payload_hash,
            ]
        )
        scope = self._scope(date_stamp)
        string_to_sign = "\n".join(
            [
                _ALGORITHM,
                amz_date,
                scope,
                hashlib.sha256(canonical_request.encode()).hexdigest(),
            ]
        )
        signature = self._signature(string_to_sign, date_stamp)
        headers["authorization"] = (
            f"{_ALGORITHM} Credential={self._access_key_id}/{scope}, "
            f"SignedHeaders={header_names}, Signature={signature}"
        )

        try:
            return self._client.send(
                self._client.build_request(
                    method, self._url(storage_key), headers=headers, content=content
                ),
                stream=stream,
            )
        except httpx.HTTPError:
            # Do not pass the request object to the caller: authorization
            # headers and signatures must not appear even in error logs.
            raise OSError("S3 request failed.") from None

    @staticmethod
    def _require_success(response: httpx.Response, *, allow_not_found: bool = False) -> bool:
        if 200 <= response.status_code < 300:
            return True
        if allow_not_found and response.status_code == 404:
            return False
        raise OSError(f"S3 request failed with status {response.status_code}.")

    def put(self, storage_key: str, data: ByteSource, content_type: str) -> StoredObject:
        # SigV4 needs the final payload hash. Spool privately instead of holding
        # ciphertext and its bytes copy in RAM; HTTP then sends fixed-size pieces.
        with TemporaryFile(mode="w+b") as body:
            digest = hashlib.sha256()
            size = 0
            while chunk := data.read(_READ_CHUNK):
                digest.update(chunk)
                body.write(chunk)
                size += len(chunk)
            body.seek(0)

            def chunks() -> Iterator[bytes]:
                while chunk := body.read(_READ_CHUNK):
                    yield chunk

            response = self._request(
                "PUT",
                storage_key,
                content=chunks(),
                content_type=content_type,
                payload_hash=digest.hexdigest(),
                extra_headers={"content-length": str(size)},
            )
            self._require_success(response)
        return StoredObject(storage_key=storage_key, size=size, content_type=content_type)

    def open(self, storage_key: str) -> BinaryIO:
        response = self._request("HEAD", storage_key)
        self._require_success(response)
        try:
            size = int(response.headers["content-length"])
            etag = response.headers["etag"]
            if size < 0 or not etag or etag.startswith("W/"):
                raise ValueError
        except (KeyError, ValueError):
            raise OSError("S3 object metadata is invalid.") from None

        def load(start: int, end: int) -> bytes:
            result = self._request(
                "GET",
                storage_key,
                extra_headers={"range": f"bytes={start}-{end}", "if-match": etag},
                stream=True,
            )
            try:
                length = end - start + 1
                if (
                    result.status_code != 206
                    or result.headers.get("content-range") != f"bytes {start}-{end}/{size}"
                    or result.headers.get("content-length") != str(length)
                ):
                    raise OSError("S3 object range is invalid or changed.")
                body = bytearray()
                for chunk in result.iter_bytes(chunk_size=_READ_CHUNK):
                    if len(body) + len(chunk) > length:
                        raise OSError("S3 object range exceeded its declared length.")
                    body.extend(chunk)
                if len(body) != length:
                    raise OSError("S3 object range is truncated.")
                return bytes(body)
            except httpx.HTTPError:
                raise OSError("S3 object range transfer failed.") from None
            finally:
                result.close()

        return io.BufferedReader(_RangeReader(size, load), buffer_size=_READ_CHUNK)

    def delete(self, storage_key: str) -> None:
        response = self._request("DELETE", storage_key)
        self._require_success(response, allow_not_found=True)

    def exists(self, storage_key: str) -> bool:
        response = self._request("HEAD", storage_key)
        return self._require_success(response, allow_not_found=True)

    def create_upload_url(
        self,
        storage_key: str,
        content_type: str,
        expires_in: timedelta,
    ) -> SignedUpload:
        headers = {
            "cache-control": "private, no-store",
            "content-type": content_type,
            "if-none-match": "*",
        }
        return SignedUpload(
            url=self._presign("PUT", storage_key, expires_in, headers),
            required_headers={
                "Cache-Control": "private, no-store",
                "Content-Type": content_type,
                "If-None-Match": "*",
            },
        )

    def create_read_url(self, storage_key: str, expires_in: timedelta) -> str:
        return self._presign("GET", storage_key, expires_in, {})
