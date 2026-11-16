"""CalDAV adapter behaviour across standard response styles (#1895)."""

from __future__ import annotations

import socket
import time
from datetime import UTC, date, datetime
from urllib.parse import unquote

import pytest

from eimir.calendar_sync import ical
from eimir.providers import calendar_transport
from eimir.providers.caldav import CalDavAccount, CalDavClient
from eimir.providers.calendar import (
    CalendarAuthError,
    CalendarEvent,
    CalendarEventLink,
    CalendarEventMissingError,
    CalendarProviderError,
    CalendarVersionConflictError,
)
from eimir.providers.calendar_transport import (
    CalendarTransportError,
    Origin,
    parse_https_url,
)
from tests.support.fake_caldav import Dialect, FakeCalDavServer, unreachable

DIALECTS = {
    # Radicale-style: relative hrefs, ETag on PUT, privilege sets.
    "relative": Dialect(),
    # Sabre/Nextcloud-style: absolute hrefs and a well-known redirect.
    "absolute": Dialect(absolute_hrefs=True, well_known_redirect="/dav/"),
    # SOGo-style: no ETag on PUT, no privilege set, no principal at the root.
    "minimal": Dialect(
        etag_on_put=False,
        privilege_set=False,
        principal_at_root=False,
        well_known_redirect="https://dav.example.org/dav/",
    ),
}


@pytest.fixture(autouse=True)
def _no_network(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(calendar_transport.socket, "socket", None)


def client(
    server: FakeCalDavServer,
    url: str = "https://dav.example.org/",
    password: str | None = None,
    monkeypatch: pytest.MonkeyPatch | None = None,
) -> CalDavClient:
    account = CalDavAccount(url, server.username, password or server.password, None, None)
    return CalDavClient(account, http=_transport(server, account))


def _transport(server: FakeCalDavServer, account: CalDavAccount):  # type: ignore[no-untyped-def]
    from eimir.providers.caldav import _authorization
    from tests.support.fake_caldav import FakeTransport

    return FakeTransport(server, _authorization(account.username, account.password))


def event(uid: str = "plan-1@sync.eimir", **changes: object) -> CalendarEvent:
    values: dict[str, object] = {
        "uid": uid,
        "title": "Gemeinsam frühstücken",
        "description": None,
        "location": None,
        "sequence": 1,
        "start": datetime(2026, 11, 21, 9, tzinfo=UTC),
        "end": datetime(2026, 11, 21, 10, tzinfo=UTC),
    }
    values.update(changes)
    return CalendarEvent(**values)  # type: ignore[arg-type]


@pytest.mark.parametrize("name", DIALECTS)
def test_discovery_lists_writable_calendars_in_every_dialect(name: str) -> None:
    server = FakeCalDavServer(dialect=DIALECTS[name])
    server.add_calendar("work", "Arbeit", writable=False)
    discovered = client(server).discover()
    assert discovered.home_path == "/calendars/anna/"
    calendars = CalDavClient(discovered, http=_transport(server, discovered)).list_calendars()
    by_name = {item.name: item for item in calendars}
    assert by_name["Unser Kalender"].ref == "/calendars/anna/shared/"
    assert by_name["Unser Kalender"].writable is True
    # Without a privilege set the first write proves the right instead.
    assert by_name["Arbeit"].writable is (not DIALECTS[name].privilege_set)


def test_a_full_calendar_url_is_a_fallback_without_discovery() -> None:
    server = FakeCalDavServer()
    discovered = client(server, "https://dav.example.org/calendars/anna/shared/").discover()
    assert discovered.calendar_path == "/calendars/anna/shared/"
    calendars = CalDavClient(discovered, http=_transport(server, discovered)).list_calendars()
    assert [item.name for item in calendars] == ["Unser Kalender"]


def test_wrong_credentials_are_an_auth_error() -> None:
    server = FakeCalDavServer()
    with pytest.raises(CalendarAuthError):
        client(server, password="wrong").discover()


def test_discovery_never_follows_a_redirect_to_another_host() -> None:
    server = FakeCalDavServer(
        dialect=Dialect(principal_at_root=False, well_known_redirect="https://evil.example/dav/")
    )
    with pytest.raises(CalendarProviderError) as error:
        client(server).discover()
    assert error.value.code == "CALENDAR_NOT_FOUND"
    assert all(path != "/dav/" for _, path, _ in server.requests)


@pytest.mark.parametrize("name", DIALECTS)
def test_conditional_writes_never_duplicate_or_overwrite(name: str) -> None:
    server = FakeCalDavServer(dialect=DIALECTS[name])
    caldav = client(server)
    calendar = "/calendars/anna/shared/"
    created = caldav.create_event(calendar, event())
    assert created.version is not None  # fetched via PROPFIND when PUT had no ETag
    assert list(server.events()) == [created.ref]

    # A retried create meets If-None-Match and finds the existing UID.
    with pytest.raises(CalendarVersionConflictError):
        caldav.create_event(calendar, event())
    existing = caldav.get_event(calendar, created.ref)
    assert existing is not None and existing.uid == "plan-1@sync.eimir"

    updated = caldav.update_event(calendar, created.ref, event(sequence=2), created.version)
    server.edit_externally(created.ref)
    with pytest.raises(CalendarVersionConflictError):
        caldav.update_event(calendar, created.ref, event(sequence=3), updated.version or "")
    with pytest.raises(CalendarVersionConflictError):
        caldav.delete_event(calendar, created.ref, updated.version or "")
    server.delete_externally(created.ref)
    with pytest.raises(CalendarEventMissingError):
        caldav.update_event(calendar, created.ref, event(sequence=4), updated.version or "")
    assert caldav.get_event(calendar, created.ref) is None


def test_read_only_calendar_and_outages_map_to_fixed_codes() -> None:
    server = FakeCalDavServer()
    server.add_calendar("work", "Arbeit", writable=False)
    caldav = client(server)
    with pytest.raises(CalendarProviderError) as denied:
        caldav.create_event("/calendars/anna/work/", event())
    assert (denied.value.code, denied.value.retryable) == ("CALENDAR_NOT_WRITABLE", False)
    server.fail_next = [unreachable()]
    with pytest.raises(CalendarProviderError) as outage:
        caldav.create_event("/calendars/anna/shared/", event())
    assert (outage.value.code, outage.value.retryable) == ("CALENDAR_UNREACHABLE", True)
    server.fail_next = [503]
    with pytest.raises(CalendarProviderError) as busy:
        caldav.create_event("/calendars/anna/shared/", event())
    assert busy.value.retryable is True


def test_event_references_are_deterministic_and_path_safe() -> None:
    caldav = client(FakeCalDavServer())
    ref = caldav.event_ref("/calendars/anna/shared/", "a/b@sync.eimir")
    assert ref == "/calendars/anna/shared/a-b-sync-eimir.ics"
    assert ref == caldav.event_ref("/calendars/anna/shared/", "a/b@sync.eimir")


@pytest.mark.parametrize(
    "url",
    [
        "http://dav.example.org/",
        "https://user:secret@dav.example.org/",
        "https://127.0.0.1/",
        "https://[::1]/",
        "https://localhost/",
        "https://dav.example.org/#fragment",
        "ftp://dav.example.org/",
    ],
)
def test_only_https_hostnames_are_accepted(url: str) -> None:
    with pytest.raises(CalendarTransportError):
        parse_https_url(url)


def test_parse_keeps_port_and_path() -> None:
    origin, path = parse_https_url("https://Cloud.Example.org:8443/remote.php/dav/")
    assert origin == Origin("cloud.example.org", 8443)
    assert path == "/remote.php/dav/"


@pytest.mark.parametrize(
    ("address", "allowlisted", "allowed"),
    [
        ("93.184.216.34", False, True),
        ("10.0.0.5", False, False),
        ("192.168.1.20", True, True),
        ("100.101.102.103", True, True),
        ("127.0.0.1", True, False),
        ("169.254.169.254", True, False),
        ("::ffff:10.0.0.1", False, False),
    ],
)
def test_private_targets_need_the_self_hosted_allowlist(
    monkeypatch: pytest.MonkeyPatch, address: str, allowlisted: bool, allowed: bool
) -> None:
    def resolve(host: str, port: int, family: int, kind: int) -> list[tuple[object, ...]]:
        family = socket.AF_INET6 if ":" in address else socket.AF_INET
        return [(family, socket.SOCK_STREAM, 0, "", (address, port))]

    monkeypatch.setattr(calendar_transport.socket, "getaddrinfo", resolve)
    origin = Origin("dav.home.example", 443)
    hosts = frozenset({"dav.home.example"}) if allowlisted else frozenset()
    if allowed:
        assert calendar_transport._resolve(origin, time.monotonic() + 2, hosts) == address
    else:
        with pytest.raises(CalendarTransportError, match="CALENDAR_TARGET_BLOCKED"):
            calendar_transport._resolve(origin, time.monotonic() + 2, hosts)


def test_ical_renders_periods_instants_and_escapes_content() -> None:
    stamp = datetime(2026, 11, 15, 12, tzinfo=UTC)
    all_day = ical.render(
        event(
            start=None,
            end=None,
            start_date=date(2026, 12, 31),
            end_date=date(2027, 1, 3),
            title="Silvester, am See; mit\nFreunden",
            location="Hütte",
        ),
        stamp=stamp,
    ).decode()
    assert "DTSTART;VALUE=DATE:20261231\r\n" in all_day
    assert "DTEND;VALUE=DATE:20270103\r\n" in all_day
    assert "SUMMARY:Silvester\\, am See\\; mit\\nFreunden\r\n" in all_day
    assert all_day.count("BEGIN:VEVENT") == 1
    timed = ical.render(event(), stamp=stamp).decode()
    assert "DTSTART:20261121T090000Z\r\n" in timed and "DTEND:20261121T100000Z\r\n" in timed
    long = ical.render(event(title="Ü🌈" * 60), stamp=stamp)
    assert all(len(line) <= 75 for line in long.split(b"\r\n"))


def test_ical_keeps_the_link_in_both_description_formats_and_event_url() -> None:
    url = "https://eimir.example/p/MzMzMzMzQzODMzMzMzMzMw"
    rendered = ical.render(
        event(
            description="Snacks <fruit> & drinks\r\nBring a blanket",
            backlink=CalendarEventLink(url, "In eimir. öffnen"),
        )
    )
    assert all(len(line) <= 75 for line in rendered.split(b"\r\n"))
    lines = rendered.replace(b"\r\n ", b"").decode().split("\r\n")
    [description] = [line for line in lines if line.startswith("DESCRIPTION;")]
    html, plain = description.removeprefix('DESCRIPTION;ALTREP="data:text/html,').split('":', 1)
    assert unquote(html) == (
        f'<a href="{url}">In eimir. öffnen</a><br><br>'
        "Snacks &lt;fruit&gt; &amp; drinks<br>Bring a blanket"
    )
    assert plain == f"In eimir. öffnen · {url}\\n\\nSnacks <fruit> & drinks\\nBring a blanket"
    assert f"URL:{url}" in lines
