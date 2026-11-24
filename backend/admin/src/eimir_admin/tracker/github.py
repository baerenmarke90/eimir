"""GitHub Issues adapter (REST ``POST /repos/{repository}/issues``)."""

from __future__ import annotations

import re
from collections.abc import Sequence

import httpx

from eimir_admin.tracker.base import TicketRef, TrackerError

API_BASE = "https://api.github.com"
API_VERSION = "2022-11-28"
USER_AGENT = "eimir-admin"
_TIMEOUT = httpx.Timeout(10.0)
REPOSITORY_PATTERN = re.compile(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+")


def is_valid_repository(value: str) -> bool:
    if REPOSITORY_PATTERN.fullmatch(value) is None:
        return False
    # Every segment needs a letter or digit: this rejects ".", ".." and "-".
    return all(any(char.isalnum() for char in segment) for segment in value.split("/"))


class GitHubIssueTracker:
    """Creates issues in one repository with a fine-grained token.

    Request bodies are never logged and the token appears in no error text or
    representation.
    """

    def __init__(self, repository: str, token: str, client: httpx.Client | None = None) -> None:
        if not is_valid_repository(repository):
            raise ValueError("repository must have the form owner/name")
        self._repository = repository
        self._token = token
        self._client = client or httpx.Client(timeout=_TIMEOUT, follow_redirects=False)

    def __repr__(self) -> str:
        return f"GitHubIssueTracker(repository={self._repository!r})"

    def create_issue(self, *, title: str, body: str, labels: Sequence[str]) -> TicketRef:
        try:
            response = self._client.post(
                f"{API_BASE}/repos/{self._repository}/issues",
                json={"title": title, "body": body, "labels": list(labels)},
                headers={
                    "Authorization": f"Bearer {self._token}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": API_VERSION,
                    "User-Agent": USER_AGENT,
                },
                timeout=_TIMEOUT,
                follow_redirects=False,
            )
        except httpx.TimeoutException:
            raise TrackerError("tracker request timed out", retryable=True) from None
        except httpx.HTTPError as error:
            # Only the exception class: its text can echo the request.
            raise TrackerError(
                f"tracker transport error ({type(error).__name__})", retryable=True
            ) from None
        return self._parse(response)

    @staticmethod
    def _parse(response: httpx.Response) -> TicketRef:
        status = response.status_code
        if status == 201:
            try:
                data = response.json()
                url, number = data["html_url"], data["number"]
            except (ValueError, KeyError, TypeError):
                url, number = None, None
            if (
                isinstance(url, str)
                and url.startswith("https://")
                and isinstance(number, int)
                and not isinstance(number, bool)
            ):
                return TicketRef(url=url, number=number)
            raise TrackerError("tracker returned an unreadable response", retryable=False)
        rate_limited = status == 429 or (
            status == 403
            and (
                response.headers.get("x-ratelimit-remaining") == "0"
                or "retry-after" in response.headers
            )
        )
        retryable = status >= 500 or status == 408 or rate_limited
        raise TrackerError(f"tracker rejected the request (HTTP {status})", retryable=retryable)
