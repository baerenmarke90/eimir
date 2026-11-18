"""Standards-based CalDAV adapter (RFC 4791, RFC 6764, RFC 4918) for #1895.

No server-specific behaviour is assumed. Discovery follows the standard order
(given URL → ``/.well-known/caldav`` → ``current-user-principal`` →
``calendar-home-set``); a full calendar collection URL works as a fallback.
Writes are conditional (``If-None-Match: *`` to create, ``If-Match`` to
replace or delete), so a retry can never duplicate an event and an external
change is never overwritten blindly. Authentication is HTTP Basic over the
pinned HTTPS transport.
"""

from __future__ import annotations

import base64
import re
import time
from collections.abc import Iterable
from dataclasses import dataclass
from urllib.parse import quote, unquote, urljoin, urlsplit
from xml.etree.ElementTree import Element

from defusedxml import ElementTree as SafeElementTree  # type: ignore[import-untyped]

from eimir.calendar_sync import ical
from eimir.providers.calendar import (
    CalendarAuthError,
    CalendarEvent,
    CalendarEventMissingError,
    CalendarProvider,
    CalendarProviderError,
    CalendarSummary,
    CalendarVersionConflictError,
    RemoteEvent,
)
from eimir.providers.calendar_transport import (
    CalendarHttp,
    CalendarRateLimitedError,
    CalendarTransportError,
    HttpResponse,
    Origin,
    parse_https_url,
)

DAV = "DAV:"
CALDAV = "urn:ietf:params:xml:ns:caldav"
_REQUEST_SECONDS = 20.0
_MAX_REDIRECTS = 3
_MAX_CALENDARS = 200
_RETRYABLE_TRANSPORT = {"CALENDAR_TIMEOUT", "CALENDAR_UNREACHABLE"}
_UID_LINE = re.compile(r"^UID:(.+)$", re.MULTILINE)
_DISCOVERY_PROPS = (
    f'<d:propfind xmlns:d="{DAV}" xmlns:c="{CALDAV}"><d:prop>'
    "<d:current-user-principal/><d:resourcetype/><d:displayname/>"
    "<d:current-user-privilege-set/><c:calendar-home-set/>"
    "<c:supported-calendar-component-set/>"
    "</d:prop></d:propfind>"
).encode()
_ETAG_PROPS = f'<d:propfind xmlns:d="{DAV}"><d:prop><d:getetag/></d:prop></d:propfind>'.encode()
_XML_HEADERS = {"Content-Type": 'application/xml; charset="utf-8"'}


def _tag(namespace: str, name: str) -> str:
    return f"{{{namespace}}}{name}"


@dataclass(frozen=True)
class _Resource:
    path: str
    props: dict[str, Element]


@dataclass(frozen=True)
class CalDavAccount:
    """Persisted, encrypted connection facts; the password never leaves the server."""

    url: str
    username: str
    password: str
    home_path: str | None
    calendar_path: str | None


def _authorization(username: str, password: str) -> str:
    if not username or ":" in username or len(username) > 256 or len(password) > 1024:
        raise CalendarProviderError("CALENDAR_CREDENTIALS_INVALID")
    token = base64.b64encode(f"{username}:{password}".encode()).decode("ascii")
    return f"Basic {token}"


def _transport_error(error: CalendarTransportError) -> CalendarProviderError:
    if isinstance(error, CalendarRateLimitedError):
        return CalendarProviderError(
            "CALENDAR_RATE_LIMITED", retryable=True, retry_after=error.retry_after
        )
    code = str(error)
    return CalendarProviderError(code, retryable=code in _RETRYABLE_TRANSPORT)


def _status_error(response: HttpResponse) -> CalendarProviderError:
    if response.status == 401:
        return CalendarAuthError()
    if response.status == 403:
        return CalendarProviderError("CALENDAR_NOT_WRITABLE")
    if response.status in {404, 405, 410}:
        return CalendarProviderError("CALENDAR_NOT_FOUND")
    if response.status >= 500:
        return CalendarProviderError("CALENDAR_UNAVAILABLE", retryable=True)
    return CalendarProviderError("CALENDAR_PROVIDER_ERROR")


class CalDavClient(CalendarProvider):
    def __init__(
        self,
        account: CalDavAccount,
        *,
        private_hosts: frozenset[str] = frozenset(),
        http: CalendarHttp | None = None,
    ) -> None:
        origin, _ = parse_https_url(account.url)
        self._account = account
        self._origin: Origin = origin
        self._http = http or CalendarHttp(
            origin,
            _authorization(account.username, account.password),
            private_hosts=private_hosts,
        )

    def __repr__(self) -> str:
        return f"CalDavClient({self._origin.hostname})"

    # Transport -----------------------------------------------------------------

    def _send(
        self,
        method: str,
        path: str,
        *,
        body: bytes | None = None,
        headers: dict[str, str] | None = None,
    ) -> HttpResponse:
        try:
            return self._http.request(
                method,
                path,
                deadline=time.monotonic() + _REQUEST_SECONDS,
                body=body,
                headers=headers,
            )
        except CalendarTransportError as error:
            raise _transport_error(error) from None

    def _local_path(self, href: str) -> str:
        """Accept a same-origin absolute URL or an absolute path from the server."""
        href = href.strip()
        if "://" in href:
            origin, path = parse_https_url(href)
            if origin != self._origin:
                raise CalendarProviderError("CALENDAR_RESPONSE_INVALID")
            return path
        if not href.startswith("/"):
            raise CalendarProviderError("CALENDAR_RESPONSE_INVALID")
        return href

    def _propfind(self, path: str, depth: str, body: bytes) -> list[_Resource]:
        response = self._send("PROPFIND", path, body=body, headers={**_XML_HEADERS, "Depth": depth})
        if response.status != 207:
            raise _status_error(response)
        try:
            root = SafeElementTree.fromstring(response.content)
        except Exception:
            raise CalendarProviderError("CALENDAR_RESPONSE_INVALID") from None
        resources: list[_Resource] = []
        for item in root.findall(_tag(DAV, "response")):
            href = item.findtext(_tag(DAV, "href"))
            if not href:
                continue
            props: dict[str, Element] = {}
            for propstat in item.findall(_tag(DAV, "propstat")):
                status = propstat.findtext(_tag(DAV, "status")) or ""
                if " 200 " not in f"{status} ":
                    continue
                prop = propstat.find(_tag(DAV, "prop"))
                if prop is not None:
                    for child in prop:
                        props[child.tag] = child
            resources.append(_Resource(self._local_path(href), props))
        return resources

    def _href_prop(self, resource: _Resource, namespace: str, name: str) -> str | None:
        element = resource.props.get(_tag(namespace, name))
        href = element.findtext(_tag(DAV, "href")) if element is not None else None
        return self._local_path(href) if href else None

    # Discovery -----------------------------------------------------------------

    def _well_known(self) -> str | None:
        path = "/.well-known/caldav"
        for _ in range(_MAX_REDIRECTS):
            response = self._send(
                "PROPFIND", path, body=_DISCOVERY_PROPS, headers={**_XML_HEADERS, "Depth": "0"}
            )
            if response.status in {301, 302, 303, 307, 308}:
                location = response.headers.get("location")
                if not location:
                    return None
                target = urljoin(self._origin.url(path), location)
                try:
                    origin, path = parse_https_url(target)
                except CalendarTransportError:
                    return None
                # Discovery never leaves the address the person entered.
                if origin != self._origin:
                    return None
                continue
            return path if response.status == 207 else None
        return None

    def discover(self) -> CalDavAccount:
        """Resolve the entered address to a calendar home or one calendar collection."""
        _, start = parse_https_url(self._account.url)
        candidates = [start] if start != "/" else []
        candidates.append("/")
        for candidate in candidates:
            try:
                resources = self._propfind(candidate, "0", _DISCOVERY_PROPS)
            except CalendarProviderError as error:
                if isinstance(error, CalendarAuthError) or error.retryable:
                    raise
                continue
            for resource in resources:
                if self._is_calendar(resource):
                    return self._with(calendar_path=resource.path)
                home = self._href_prop(resource, CALDAV, "calendar-home-set")
                if home:
                    return self._with(home_path=home)
                principal = self._href_prop(resource, DAV, "current-user-principal")
                if principal:
                    home = self._home_of(principal)
                    if home:
                        return self._with(home_path=home)
        well_known = self._well_known()
        if well_known:
            for resource in self._propfind(well_known, "0", _DISCOVERY_PROPS):
                home = self._href_prop(resource, CALDAV, "calendar-home-set")
                principal = self._href_prop(resource, DAV, "current-user-principal")
                home = home or (self._home_of(principal) if principal else None)
                if home:
                    return self._with(home_path=home)
        raise CalendarProviderError("CALENDAR_NOT_FOUND")

    def _home_of(self, principal: str) -> str | None:
        for resource in self._propfind(principal, "0", _DISCOVERY_PROPS):
            home = self._href_prop(resource, CALDAV, "calendar-home-set")
            if home:
                return home
        return None

    def _with(
        self, *, home_path: str | None = None, calendar_path: str | None = None
    ) -> CalDavAccount:
        return CalDavAccount(
            url=self._account.url,
            username=self._account.username,
            password=self._account.password,
            home_path=home_path,
            calendar_path=calendar_path,
        )

    @staticmethod
    def _is_calendar(resource: _Resource) -> bool:
        kinds = resource.props.get(_tag(DAV, "resourcetype"))
        if kinds is None or kinds.find(_tag(CALDAV, "calendar")) is None:
            return False
        components = resource.props.get(_tag(CALDAV, "supported-calendar-component-set"))
        if components is None:
            return True
        return any(
            component.get("name", "").upper() == "VEVENT"
            for component in components.findall(_tag(CALDAV, "comp"))
        )

    @staticmethod
    def _writable(resource: _Resource) -> bool:
        privileges = resource.props.get(_tag(DAV, "current-user-privilege-set"))
        if privileges is None:
            # The property is optional (RFC 3744); the first write proves the right.
            return True
        granted = {
            child.tag
            for privilege in privileges.findall(_tag(DAV, "privilege"))
            for child in privilege
        }
        return bool(
            granted & {_tag(DAV, "all"), _tag(DAV, "write"), _tag(DAV, "bind")}
            or {_tag(DAV, "write-content"), _tag(DAV, "bind")} <= granted
        )

    @staticmethod
    def _name(resource: _Resource) -> str:
        element = resource.props.get(_tag(DAV, "displayname"))
        name = (element.text or "").strip() if element is not None else ""
        if name:
            return name[:200]
        segments = [segment for segment in resource.path.split("/") if segment]
        return unquote(segments[-1])[:200] if segments else "CalDAV"

    # Contract ------------------------------------------------------------------

    def check(self) -> None:
        path = self._account.calendar_path or self._account.home_path
        if path is None:
            raise CalendarProviderError("CALENDAR_NOT_FOUND")
        self._propfind(path, "0", _DISCOVERY_PROPS)

    def list_calendars(self) -> list[CalendarSummary]:
        if self._account.calendar_path:
            resources = self._propfind(self._account.calendar_path, "0", _DISCOVERY_PROPS)
        elif self._account.home_path:
            resources = self._propfind(self._account.home_path, "1", _DISCOVERY_PROPS)
        else:
            raise CalendarProviderError("CALENDAR_NOT_FOUND")
        calendars = [
            CalendarSummary(
                ref=resource.path if resource.path.endswith("/") else f"{resource.path}/",
                name=self._name(resource),
                writable=self._writable(resource),
            )
            for resource in resources
            if self._is_calendar(resource)
        ]
        return sorted(calendars, key=lambda item: (item.name.casefold(), item.ref))[:_MAX_CALENDARS]

    def event_ref(self, calendar_ref: str, uid: str) -> str:
        if not calendar_ref.startswith("/") or not calendar_ref.endswith("/"):
            raise CalendarProviderError("CALENDAR_NOT_FOUND")
        name = re.sub(r"[^A-Za-z0-9-]", "-", uid)
        return f"{calendar_ref}{quote(name)}.ics"

    def _etag(self, path: str, response: HttpResponse) -> str | None:
        etag = response.headers.get("etag")
        if etag:
            return etag
        # Servers may omit the ETag when they rewrote the data (RFC 4791 5.3.4).
        for resource in self._propfind(path, "0", _ETAG_PROPS):
            element = resource.props.get(_tag(DAV, "getetag"))
            if element is not None and element.text:
                return element.text.strip()
        return None

    def _raise_precondition(self, event_ref: str, *, conditional_on_existing: bool) -> None:
        """RFC 9110 answers If-Match on a missing resource with 412, like a change."""
        if conditional_on_existing and self.get_event("", event_ref) is None:
            raise CalendarEventMissingError()
        raise CalendarVersionConflictError()

    def get_event(self, calendar_ref: str, event_ref: str) -> RemoteEvent | None:
        response = self._send("GET", event_ref, headers={"Accept": "text/calendar"})
        if response.status in {404, 410}:
            return None
        if response.status != 200:
            raise _status_error(response)
        text = response.content.decode("utf-8", errors="replace").replace("\r\n ", "")
        match = _UID_LINE.search(text)
        return RemoteEvent(
            ref=event_ref,
            version=self._etag(event_ref, response),
            uid=match.group(1).strip() if match else None,
        )

    def _put(self, event_ref: str, event: CalendarEvent, condition: dict[str, str]) -> RemoteEvent:
        response = self._send(
            "PUT",
            event_ref,
            body=ical.render(event),
            headers={"Content-Type": "text/calendar; charset=utf-8", **condition},
        )
        if response.status == 412:
            self._raise_precondition(event_ref, conditional_on_existing="If-Match" in condition)
        if response.status in {404, 410} and "If-Match" in condition:
            raise CalendarEventMissingError()
        if response.status == 409:
            raise CalendarProviderError("CALENDAR_NOT_FOUND")
        if response.status not in {200, 201, 204}:
            raise _status_error(response)
        return RemoteEvent(ref=event_ref, version=self._etag(event_ref, response), uid=event.uid)

    def create_event(self, calendar_ref: str, event: CalendarEvent) -> RemoteEvent:
        return self._put(self.event_ref(calendar_ref, event.uid), event, {"If-None-Match": "*"})

    def update_event(
        self, calendar_ref: str, event_ref: str, event: CalendarEvent, expected_version: str
    ) -> RemoteEvent:
        return self._put(event_ref, event, {"If-Match": expected_version})

    def delete_event(self, calendar_ref: str, event_ref: str, expected_version: str) -> None:
        response = self._send("DELETE", event_ref, headers={"If-Match": expected_version})
        if response.status == 412:
            self._raise_precondition(event_ref, conditional_on_existing=True)
        if response.status in {404, 410}:
            raise CalendarEventMissingError()
        if response.status not in {200, 204}:
            raise _status_error(response)


def calendar_refs(calendars: Iterable[CalendarSummary]) -> set[str]:
    return {calendar.ref for calendar in calendars}


def origin_label(url: str) -> str:
    """Hostname shown to the connecting person; never the full path or credentials."""
    return urlsplit(url).hostname or ""
