"""The tracker contract: what the support flow needs from an issue tracker."""

from __future__ import annotations

from collections.abc import Sequence
from typing import NamedTuple, Protocol


class TicketRef(NamedTuple):
    """Where a created issue lives."""

    url: str
    number: int


class TrackerError(Exception):
    """A tracker call failed.

    ``retryable`` tells the caller whether trying again can succeed (server
    errors, rate limits, timeouts, transport errors) or not (rejected input,
    missing permission). The text never carries credentials or request content.
    """

    def __init__(self, message: str, *, retryable: bool) -> None:
        super().__init__(message)
        self.retryable = retryable


class IssueTracker(Protocol):
    def create_issue(self, *, title: str, body: str, labels: Sequence[str]) -> TicketRef: ...
