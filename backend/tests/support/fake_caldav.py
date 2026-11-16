"""In-memory CalDAV server double for adapter and sync tests (#1895).

It speaks the small subset eimir. uses (PROPFIND, GET, PUT, DELETE with
conditional headers) and can imitate the response styles of different
standards-compliant servers: absolute vs. relative hrefs, missing ETags on
PUT, missing privilege sets, a ``/.well-known/caldav`` redirect.
"""

from __future__ import annotations

import base64
import itertools
import re
from collections.abc import Mapping
from dataclasses import dataclass, field

from eimir.providers.calendar_transport import (
    CalendarRateLimitedError,
    CalendarTransportError,
    HttpResponse,
)

_COUNTER = itertools.count(1)


@dataclass
class Dialect:
    """Response-style switches; defaults mirror a Radicale-like server."""

    absolute_hrefs: bool = False
    etag_on_put: bool = True
    privilege_set: bool = True
    well_known_redirect: str | None = None
    principal_at_root: bool = True


@dataclass
class FakeCalendar:
    path: str
    name: str
    writable: bool = True
    events: dict[str, tuple[str, bytes]] = field(default_factory=dict)
    """event path -> (etag, iCalendar body)"""


class FakeCalDavServer:
    def __init__(
        self,
        *,
        host: str = "dav.example.org",
        username: str = "anna",
        password: str = "app-password",
        dialect: Dialect | None = None,
    ) -> None:
        self.host = host
        self.username = username
        self.password = password
        self.dialect = dialect or Dialect()
        self.principal = f"/principals/{username}/"
        self.home = f"/calendars/{username}/"
        self.calendars: dict[str, FakeCalendar] = {}
        self.requests: list[tuple[str, str, Mapping[str, str]]] = []
        self.fail_next: list[Exception | int] = []
        self.add_calendar("shared", "Unser Kalender")

    # Fixtures ------------------------------------------------------------------

    def add_calendar(self, slug: str, name: str, *, writable: bool = True) -> FakeCalendar:
        calendar = FakeCalendar(f"{self.home}{slug}/", name, writable)
        self.calendars[calendar.path] = calendar
        return calendar

    def events(self, calendar_path: str | None = None) -> dict[str, tuple[str, bytes]]:
        calendar = self.calendars[calendar_path or f"{self.home}shared/"]
        return calendar.events

    def edit_externally(
        self, event_path: str, body: bytes = b"BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n"
    ) -> None:
        for calendar in self.calendars.values():
            if event_path in calendar.events:
                calendar.events[event_path] = (f'"ext-{next(_COUNTER)}"', body)
                return
        raise KeyError(event_path)

    def delete_externally(self, event_path: str) -> None:
        for calendar in self.calendars.values():
            calendar.events.pop(event_path, None)

    # Transport -----------------------------------------------------------------

    def request(
        self,
        method: str,
        path: str,
        *,
        deadline: float,
        body: bytes | None = None,
        headers: Mapping[str, str] | None = None,
        limit: int = 0,
    ) -> HttpResponse:
        headers = dict(headers or {})
        self.requests.append((method, path, headers))
        if self.fail_next:
            failure = self.fail_next.pop(0)
            if isinstance(failure, Exception):
                raise failure
            return HttpResponse(failure, {}, b"")
        if headers.get("Authorization") != self._expected_auth():
            return HttpResponse(401, {}, b"")
        if method == "PROPFIND":
            return self._propfind(path, headers.get("Depth", "0"))
        if method == "GET":
            return self._get(path)
        if method == "PUT":
            return self._put(path, headers, body or b"")
        if method == "DELETE":
            return self._delete(path, headers)
        return HttpResponse(405, {}, b"")

    def _expected_auth(self) -> str:
        token = base64.b64encode(f"{self.username}:{self.password}".encode()).decode()
        return f"Basic {token}"

    def _href(self, path: str) -> str:
        return f"https://{self.host}{path}" if self.dialect.absolute_hrefs else path

    def _response(self, path: str, props: str) -> str:
        return (
            f"<d:response><d:href>{self._href(path)}</d:href><d:propstat><d:prop>{props}</d:prop>"
            "<d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>"
        )

    def _calendar_props(self, calendar: FakeCalendar) -> str:
        privileges = ""
        if self.dialect.privilege_set:
            granted = "<d:privilege><d:read/></d:privilege>"
            if calendar.writable:
                granted += "<d:privilege><d:write/></d:privilege>"
            privileges = f"<d:current-user-privilege-set>{granted}</d:current-user-privilege-set>"
        return (
            "<d:resourcetype><d:collection/><c:calendar/></d:resourcetype>"
            f"<d:displayname>{calendar.name}</d:displayname>{privileges}"
            "<c:supported-calendar-component-set>"
            '<c:comp name="VEVENT"/>'
            "</c:supported-calendar-component-set>"
        )

    def _multistatus(self, responses: list[str]) -> HttpResponse:
        body = (
            '<?xml version="1.0" encoding="utf-8"?>'
            '<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">'
            + "".join(responses)
            + "</d:multistatus>"
        ).encode()
        return HttpResponse(207, {"content-type": "application/xml"}, body)

    def _propfind(self, path: str, depth: str) -> HttpResponse:
        if path == "/.well-known/caldav" and self.dialect.well_known_redirect:
            return HttpResponse(301, {"location": self.dialect.well_known_redirect}, b"")
        principal_link = (
            "<d:current-user-principal>"
            f"<d:href>{self._href(self.principal)}</d:href>"
            "</d:current-user-principal>"
        )
        if path in {"/", "/dav/", "/.well-known/caldav"}:
            if not self.dialect.principal_at_root and path == "/":
                return HttpResponse(404, {}, b"")
            return self._multistatus([self._response(path, principal_link)])
        if path == self.principal:
            home = (
                "<c:calendar-home-set>"
                f"<d:href>{self._href(self.home)}</d:href>"
                "</c:calendar-home-set>"
            )
            return self._multistatus([self._response(path, principal_link + home)])
        if path == self.home:
            responses = [self._response(path, "<d:resourcetype><d:collection/></d:resourcetype>")]
            if depth == "1":
                responses += [
                    self._response(calendar.path, self._calendar_props(calendar))
                    for calendar in self.calendars.values()
                ]
            return self._multistatus(responses)
        if path in self.calendars:
            return self._multistatus(
                [self._response(path, self._calendar_props(self.calendars[path]))]
            )
        for calendar in self.calendars.values():
            if path in calendar.events:
                etag = calendar.events[path][0]
                return self._multistatus([self._response(path, f"<d:getetag>{etag}</d:getetag>")])
        return HttpResponse(404, {}, b"")

    def _calendar_of(self, path: str) -> FakeCalendar | None:
        parent = path.rsplit("/", 1)[0] + "/"
        return self.calendars.get(parent)

    def _get(self, path: str) -> HttpResponse:
        calendar = self._calendar_of(path)
        if calendar is None or path not in calendar.events:
            return HttpResponse(404, {}, b"")
        etag, body = calendar.events[path]
        return HttpResponse(200, {"etag": etag, "content-type": "text/calendar"}, body)

    def _put(self, path: str, headers: Mapping[str, str], body: bytes) -> HttpResponse:
        calendar = self._calendar_of(path)
        if calendar is None:
            return HttpResponse(409, {}, b"")
        if not calendar.writable:
            return HttpResponse(403, {}, b"")
        current = calendar.events.get(path)
        if headers.get("If-None-Match") == "*" and current is not None:
            return HttpResponse(412, {}, b"")
        expected = headers.get("If-Match")
        if expected is not None and (current is None or current[0] != expected):
            # RFC 9110 13.1.1: If-Match fails with 412 also when nothing exists.
            return HttpResponse(412, {}, b"")
        uid = re.search(rb"UID:(.+?)\r\n", body)
        for other_path, (_, other) in calendar.events.items():
            if other_path != path and uid and uid.group(0) in other:
                return HttpResponse(409, {}, b"")  # CalDAV no-uid-conflict precondition
        etag = f'"v{next(_COUNTER)}"'
        calendar.events[path] = (etag, body)
        headers_out = {"etag": etag} if self.dialect.etag_on_put else {}
        return HttpResponse(201 if current is None else 204, headers_out, b"")

    def _delete(self, path: str, headers: Mapping[str, str]) -> HttpResponse:
        calendar = self._calendar_of(path)
        if calendar is None or path not in calendar.events:
            return HttpResponse(412 if headers.get("If-Match") else 404, {}, b"")
        if headers.get("If-Match") not in {None, calendar.events[path][0]}:
            return HttpResponse(412, {}, b"")
        del calendar.events[path]
        return HttpResponse(204, {}, b"")


class FakeTransport:
    """What ``CalendarHttp`` sends: the adapter's request plus its Authorization."""

    def __init__(self, server: FakeCalDavServer, authorization: str) -> None:
        self.server = server
        self.authorization = authorization

    def request(
        self,
        method: str,
        path: str,
        *,
        deadline: float,
        body: bytes | None = None,
        headers: Mapping[str, str] | None = None,
        limit: int = 0,
    ) -> HttpResponse:
        return self.server.request(
            method,
            path,
            deadline=deadline,
            body=body,
            headers={**(headers or {}), "Authorization": self.authorization},
        )


def install(monkeypatch: object, server: FakeCalDavServer) -> None:
    """Route every CalDavClient created by the application to ``server``."""
    from eimir.providers import caldav

    def factory(origin: object, authorization: str, **_: object) -> FakeTransport:
        return FakeTransport(server, authorization)

    monkeypatch.setattr(caldav, "CalendarHttp", factory)  # type: ignore[attr-defined]


def unreachable() -> CalendarTransportError:
    return CalendarTransportError("CALENDAR_UNREACHABLE")


def rate_limited(seconds: float = 30.0) -> CalendarRateLimitedError:
    return CalendarRateLimitedError(seconds)
