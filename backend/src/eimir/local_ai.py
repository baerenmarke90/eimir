"""Bounded transport for optional operator-local Ollama inference."""

from __future__ import annotations

import json
from ipaddress import ip_address
from threading import BoundedSemaphore
from time import monotonic
from typing import Any
from urllib.parse import urlsplit

import httpx

from eimir.config import get_settings


def validate_local_url(value: str) -> str:
    """Operator-only local network endpoint, without credentials/query/redirects."""
    if not value:
        return ""
    parsed = urlsplit(value)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or parsed.path not in {"", "/"}
    ):
        raise ValueError("Local AI must use a plain operator-configured HTTP origin.")
    # Only internal service names, loopback and private network addresses.
    hostname = parsed.hostname.lower().rstrip(".")
    try:
        address = ip_address(hostname)
        local = address.is_loopback or (address.is_private and not address.is_unspecified)
    except ValueError:
        local = "." not in hostname or hostname.endswith((".internal", ".local", ".localhost"))
    if not local:
        raise ValueError("Local inference must use the local service.")
    return value.rstrip("/")


_INFERENCE_SLOTS = BoundedSemaphore(2)


def query_structured(
    body: dict[str, Any], *, timeout_limit: float | None = None
) -> dict[str, Any] | None:
    """Shared bounded operator-local transport; never logs prompts or response bodies."""
    settings = get_settings()
    if not settings.recap_ai_url or len(json.dumps(body).encode()) > 24_000:
        return None
    if not _INFERENCE_SLOTS.acquire(blocking=False):
        return None
    budget = settings.recap_ai_timeout_seconds
    if timeout_limit is not None:
        budget = min(budget, timeout_limit)
    deadline = monotonic() + budget
    try:
        with (
            httpx.Client(
                timeout=httpx.Timeout(budget, connect=min(3, budget)),
                trust_env=False,
                follow_redirects=False,
            ) as client,
            client.stream("POST", f"{settings.recap_ai_url}/api/chat", json=body) as response,
        ):
            if response.status_code != 200:
                return None
            chunks = bytearray()
            for chunk in response.iter_bytes():
                chunks.extend(chunk)
                if len(chunks) > 16_384 or monotonic() > deadline:
                    return None
        output = json.loads(chunks)
        if (
            not isinstance(output, dict)
            or output.get("done") is not True
            or output.get("done_reason") == "length"
        ):
            return None
        return output
    except (httpx.HTTPError, ValueError, KeyError, TypeError, RecursionError):
        return None
    finally:
        _INFERENCE_SLOTS.release()
