"""Provider-neutral calendar contract for automatic Plan sync (#1895).

Adapters translate this small contract to one provider (CalDAV, Google
Calendar). The sync lifecycle in ``eimir.calendar_sync`` never sees provider
protocols: it works with calendar references, event references and opaque
provider versions (ETags) only. Free/busy is deliberately absent because
shared availability is not commissioned; the contract can be extended.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date, datetime
from html import escape


class CalendarProviderError(Exception):
    """A provider failure with a fixed, user-mappable code.

    ``retryable`` failures (timeouts, outages, rate limits) are retried with
    backoff; the others need a person (credentials, permissions, removed
    calendars) and change the visible sync state instead.
    """

    def __init__(
        self, code: str, *, retryable: bool = False, retry_after: float | None = None
    ) -> None:
        super().__init__(code)
        self.code = code
        self.retryable = retryable
        self.retry_after = retry_after


class CalendarAuthError(CalendarProviderError):
    """Credentials are rejected or the grant was revoked."""

    def __init__(self) -> None:
        super().__init__("CALENDAR_AUTH_FAILED")


class CalendarVersionConflictError(CalendarProviderError):
    """The event changed (or appeared) since the version eimir. last wrote."""

    def __init__(self) -> None:
        super().__init__("CALENDAR_EVENT_CHANGED")


class CalendarEventMissingError(CalendarProviderError):
    """The managed event no longer exists in the external calendar."""

    def __init__(self) -> None:
        super().__init__("CALENDAR_EVENT_MISSING")


@dataclass(frozen=True)
class CalendarSummary:
    ref: str
    """Provider calendar reference: a CalDAV collection path or a Google calendar id."""
    name: str
    writable: bool
    primary: bool = False
    """The provider's own main calendar of the account (Google ``primary``)."""


@dataclass(frozen=True)
class CalendarEventLink:
    """A first-party Plan link shown before the event description."""

    url: str
    label: str

    def plain_description(self, notes: str | None) -> str:
        first_line = f"{self.label} · {self.url}"
        return f"{first_line}\n\n{notes}" if notes else first_line

    def html_description(self, notes: str | None) -> str:
        anchor = f'<a href="{escape(self.url)}">{escape(self.label)}</a>'
        if not notes:
            return anchor
        normalized = notes.replace("\r\n", "\n").replace("\r", "\n")
        body = escape(normalized).replace("\n", "<br>")
        return f"{anchor}<br><br>{body}"


@dataclass(frozen=True)
class CalendarEvent:
    """One eimir.-managed event. All-day dates are inclusive start, exclusive end."""

    uid: str
    title: str
    description: str | None
    location: str | None
    sequence: int
    start_date: date | None = None
    end_date: date | None = None
    start: datetime | None = None
    end: datetime | None = None
    backlink: CalendarEventLink | None = None

    @property
    def all_day(self) -> bool:
        return self.start_date is not None


@dataclass(frozen=True)
class RemoteEvent:
    ref: str
    """Provider event reference: a CalDAV resource path or a Google event id."""
    version: str | None
    """Opaque provider version (ETag) used for conditional writes."""
    uid: str | None = None


class CalendarProvider(ABC):
    """Contract shared by every calendar adapter."""

    @abstractmethod
    def check(self) -> None:
        """Verify that the stored credentials still work."""

    @abstractmethod
    def list_calendars(self) -> list[CalendarSummary]:
        """Calendars of this connection that can hold events, with write rights."""

    @abstractmethod
    def event_ref(self, calendar_ref: str, uid: str) -> str:
        """Deterministic event reference for a UID, so a retry finds an earlier create."""

    @abstractmethod
    def get_event(self, calendar_ref: str, event_ref: str) -> RemoteEvent | None:
        """Current provider version of one event, or ``None`` when it is gone."""

    @abstractmethod
    def create_event(self, calendar_ref: str, event: CalendarEvent) -> RemoteEvent:
        """Create only if absent; raise ``CalendarVersionConflictError`` when it exists."""

    @abstractmethod
    def update_event(
        self, calendar_ref: str, event_ref: str, event: CalendarEvent, expected_version: str
    ) -> RemoteEvent:
        """Replace only if unchanged since ``expected_version``."""

    @abstractmethod
    def delete_event(self, calendar_ref: str, event_ref: str, expected_version: str) -> None:
        """Delete only if unchanged since ``expected_version``."""

    def revoke(self) -> None:  # noqa: B027 - optional for providers without grants
        """Revoke a provider grant when the connection is removed."""
