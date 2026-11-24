"""GitHub issue adapter, against a mocked transport."""

from __future__ import annotations

import json
from collections.abc import Callable

import httpx
import pytest
from eimir_admin.tracker.base import TicketRef, TrackerError
from eimir_admin.tracker.github import GitHubIssueTracker

TOKEN = "ghp_supersecrettoken123"

Handler = Callable[[httpx.Request], httpx.Response]


def tracker(handler: Handler) -> GitHubIssueTracker:
    client = httpx.Client(transport=httpx.MockTransport(handler), follow_redirects=False)
    return GitHubIssueTracker("eimir/eimir", TOKEN, client=client)


def create(t: GitHubIssueTracker) -> TicketRef:
    return t.create_issue(title="Crash", body="details", labels=["support"])


def test_creates_issue_and_returns_ref() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(
            201, json={"html_url": "https://github.com/eimir/eimir/issues/7", "number": 7}
        )

    ref = create(tracker(handler))

    assert ref == TicketRef(url="https://github.com/eimir/eimir/issues/7", number=7)
    request = seen[0]
    assert request.method == "POST"
    assert request.url.path == "/repos/eimir/eimir/issues"
    assert request.headers["authorization"] == f"Bearer {TOKEN}"
    assert request.headers["accept"] == "application/vnd.github+json"
    assert request.headers["x-github-api-version"]
    assert request.headers["user-agent"] == "eimir-admin"
    assert json.loads(request.content) == {
        "title": "Crash",
        "body": "details",
        "labels": ["support"],
    }


@pytest.mark.parametrize("status", [500, 502, 429])
def test_server_error_is_retryable(status: int) -> None:
    with pytest.raises(TrackerError) as info:
        create(tracker(lambda r: httpx.Response(status)))
    assert info.value.retryable is True


def test_secondary_rate_limit_is_retryable() -> None:
    with pytest.raises(TrackerError) as info:
        create(tracker(lambda r: httpx.Response(403, headers={"retry-after": "60"})))
    assert info.value.retryable is True


@pytest.mark.parametrize("status", [401, 403, 404, 422])
def test_validation_error_is_not_retryable(status: int) -> None:
    with pytest.raises(TrackerError) as info:
        create(tracker(lambda r: httpx.Response(status, json={"message": "nope"})))
    assert info.value.retryable is False


def test_redirect_is_not_followed_and_fails() -> None:
    with pytest.raises(TrackerError) as info:
        create(
            tracker(lambda r: httpx.Response(301, headers={"location": "https://evil.example/"}))
        )
    assert info.value.retryable is False


def test_unreadable_success_body_is_not_retryable() -> None:
    with pytest.raises(TrackerError) as info:
        create(tracker(lambda r: httpx.Response(201, json={"unexpected": 1})))
    assert info.value.retryable is False


def test_timeout_raises_tracker_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    with pytest.raises(TrackerError) as info:
        create(tracker(handler))
    assert info.value.retryable is True


def test_transport_error_is_retryable() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down", request=request)

    with pytest.raises(TrackerError) as info:
        create(tracker(handler))
    assert info.value.retryable is True


def test_token_never_in_error_text() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError(f"failed with {request.headers['authorization']}", request=request)

    t = tracker(handler)
    with pytest.raises(TrackerError) as info:
        create(t)
    assert TOKEN not in str(info.value)
    assert TOKEN not in repr(info.value)
    assert TOKEN not in repr(t)
    assert info.value.__cause__ is None


def test_malformed_repository_rejected() -> None:
    with pytest.raises(ValueError, match="owner/name"):
        GitHubIssueTracker("not-a-repository", TOKEN)
    with pytest.raises(ValueError, match="owner/name"):
        GitHubIssueTracker("a/b/../c", TOKEN)
