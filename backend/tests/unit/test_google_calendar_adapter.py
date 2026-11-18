"""Google Calendar adapter against an API double (#1895)."""

from __future__ import annotations

from datetime import UTC, date, datetime

import httpx
import pytest
from pydantic import SecretStr

from eimir.providers import google_calendar
from eimir.providers.calendar import (
    CalendarAuthError,
    CalendarEvent,
    CalendarEventLink,
    CalendarEventMissingError,
    CalendarProviderError,
    CalendarVersionConflictError,
)
from eimir.providers.google_calendar import GoogleCalendarApi, GoogleCalendarClient, event_id
from tests.support.fake_google_calendar import FakeGoogleCalendar, rate_limited

CLIENT = GoogleCalendarClient("client-id", SecretStr("client-secret"), "https://eimir.example/cb")
SHARED = "shared-calendar@group.calendar.google.com"


def api(fake: FakeGoogleCalendar, token: str | None = None) -> GoogleCalendarApi:
    return GoogleCalendarApi(CLIENT, token or fake.refresh_token, transport=fake.transport())


def event(**changes: object) -> CalendarEvent:
    values: dict[str, object] = {
        "uid": "plan-1@sync.eimir",
        "title": "Gemeinsam frühstücken",
        "description": None,
        "location": None,
        "sequence": 1,
        "start": datetime(2026, 11, 21, 9, tzinfo=UTC),
        "end": datetime(2026, 11, 21, 10, tzinfo=UTC),
    }
    values.update(changes)
    return CalendarEvent(**values)  # type: ignore[arg-type]


def test_calendar_list_reports_write_rights_and_the_account_label() -> None:
    fake = FakeGoogleCalendar()
    client = api(fake)
    calendars = {item.name: item for item in client.list_calendars()}
    assert calendars["Unser Kalender"].writable is True
    assert calendars["Feiertage"].writable is False
    assert client.account_label() == "anna@example.com"


@pytest.mark.parametrize("notes", [None, "Meet at <the lake> & bring a blanket"])
def test_the_labelled_plan_link_starts_the_shared_event_description(notes: str | None) -> None:
    fake = FakeGoogleCalendar()
    url = "https://eimir.example/p/MzMzMzMzQzODMzMzMzMzMw"
    created = api(fake).create_event(
        SHARED, event(description=notes, backlink=CalendarEventLink(url, "Open in eimir."))
    )
    stored = fake.events[SHARED, created.ref]
    anchor = f'<a href="{url}">Open in eimir.</a>'
    suffix = "<br><br>Meet at &lt;the lake&gt; &amp; bring a blanket" if notes else ""
    assert stored["description"] == anchor + suffix
    assert "source" not in stored


def test_deterministic_ids_make_inserts_idempotent_and_writes_conditional() -> None:
    fake = FakeGoogleCalendar()
    client = api(fake)
    created = client.create_event(SHARED, event())
    assert created.ref == event_id("plan-1@sync.eimir")
    assert set(created.ref) <= set("0123456789abcdefghijklmnopqrstuv")
    with pytest.raises(CalendarVersionConflictError):
        client.create_event(SHARED, event())  # the retried insert meets 409
    found = client.get_event(SHARED, created.ref)
    assert found is not None and found.uid == "plan-1@sync.eimir"

    updated = client.update_event(SHARED, created.ref, event(title="Brunch"), created.version or "")
    fake.edit_externally(SHARED, created.ref)
    with pytest.raises(CalendarVersionConflictError):
        client.update_event(SHARED, created.ref, event(title="x"), updated.version or "")
    with pytest.raises(CalendarVersionConflictError):
        client.delete_event(SHARED, created.ref, updated.version or "")


def test_a_deleted_id_is_restored_only_for_its_own_event() -> None:
    fake = FakeGoogleCalendar()
    client = api(fake)
    created = client.create_event(SHARED, event())
    client.delete_event(SHARED, created.ref, created.version or "")
    assert client.get_event(SHARED, created.ref) is None  # cancelled counts as gone
    restored = client.create_event(SHARED, event(title="Wieder da"))
    assert fake.events[(SHARED, created.ref)]["status"] == "confirmed"
    assert restored.uid == "plan-1@sync.eimir"
    with pytest.raises(CalendarEventMissingError):
        client.update_event(SHARED, "unknown-id", event(), '"v1"')


def test_all_day_periods_and_open_ends_map_to_google_fields() -> None:
    body = GoogleCalendarApi._resource(
        event(start=None, end=None, start_date=date(2026, 12, 31), end_date=date(2027, 1, 3))
    )
    assert body["start"] == {"date": "2026-12-31"} and body["end"] == {"date": "2027-01-03"}
    point = GoogleCalendarApi._resource(event(end=None))
    assert point["start"]["dateTime"] == point["end"]["dateTime"] == "2026-11-21T09:00:00Z"
    assert point["extendedProperties"]["private"]["eimirUid"] == "plan-1@sync.eimir"


def test_revoked_grants_rate_limits_and_outages_map_to_fixed_codes() -> None:
    fake = FakeGoogleCalendar()
    with pytest.raises(CalendarAuthError):
        api(fake, token="revoked").list_calendars()
    client = api(fake)
    client.check()
    fake.fail_next = [rate_limited()]
    with pytest.raises(CalendarProviderError) as limited:
        client.create_event(SHARED, event())
    assert (limited.value.code, limited.value.retryable, limited.value.retry_after) == (
        "CALENDAR_RATE_LIMITED",
        True,
        12.0,
    )
    fake.fail_next = [httpx.Response(503)]
    with pytest.raises(CalendarProviderError) as outage:
        client.create_event(SHARED, event())
    assert outage.value.retryable is True
    with pytest.raises(CalendarProviderError) as denied:
        client.create_event("holidays@group.v.calendar.google.com", event())
    assert denied.value.code == "CALENDAR_NOT_WRITABLE"
    client.revoke()
    assert fake.revoked == [fake.refresh_token]


def test_an_expired_access_token_is_refreshed_once() -> None:
    fake = FakeGoogleCalendar()
    client = api(fake)
    client.check()
    fake.access_tokens.clear()  # the cached token is no longer accepted
    client.check()
    assert len(fake.access_tokens) == 1


def test_authorization_requests_offline_least_privilege_consent() -> None:
    url, state, verifier = google_calendar.authorization(CLIENT)
    assert url.startswith(google_calendar.AUTH_URI)
    assert "access_type=offline" in url and "code_challenge_method=S256" in url
    assert "calendar.events" in url and "calendar.calendarlist.readonly" in url
    assert "calendar.readonly" not in url.replace("calendarlist.readonly", "")
    assert state and len(verifier) >= 43


def test_exchange_rejects_missing_scopes_and_refresh_tokens(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class Flow:
        def __init__(self, token: dict[str, object]) -> None:
            self.token = token
            self.oauth2session = type("S", (), {"hooks": {}, "close": lambda self: None})()

        def fetch_token(self, **_: object) -> dict[str, object]:
            return self.token

    for token, code in [
        ({"refresh_token": "r", "scope": [google_calendar.SCOPES[1]]}, "CALENDAR_SCOPES_MISSING"),
        ({"scope": list(google_calendar.SCOPES)}, "CALENDAR_AUTHORIZATION_FAILED"),
    ]:
        monkeypatch.setattr(google_calendar, "_flow", lambda *a, token=token, **k: Flow(token))
        with pytest.raises(CalendarProviderError, match=code):
            google_calendar.exchange(CLIENT, "code", "state", "verifier")
    monkeypatch.setattr(
        google_calendar,
        "_flow",
        lambda *a, **k: Flow({"refresh_token": "r", "scope": " ".join(google_calendar.SCOPES)}),
    )
    assert google_calendar.exchange(CLIENT, "code", "state", "verifier") == "r"
