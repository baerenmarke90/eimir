"""Google Calendar connection lifecycle through the public callback (#1895)."""

from __future__ import annotations

from datetime import timedelta
from typing import Any
from urllib.parse import parse_qs, urlsplit

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.calendar_sync.models import CalendarConnection, CalendarOAuthTransaction
from eimir.config import get_settings
from eimir.core import clock
from eimir.providers import google_calendar
from eimir.relationship.service import add_member
from tests.conftest import auth, make_account, make_space, requires_database, sign_in
from tests.integration.test_calendar_sync import base, drain, grant, plan, state
from tests.support.fake_google_calendar import FakeGoogleCalendar

pytestmark = [pytest.mark.integration, requires_database]
SHARED = "shared-calendar@group.calendar.google.com"
CALLBACK = "/api/v1/calendar-sync/google/callback"


@pytest.fixture(autouse=True)
def configured(encryption, monkeypatch):  # type: ignore[no-untyped-def]
    encryption.apply("required")
    monkeypatch.setenv("EIMIR_PUBLIC_BASE_URL", "https://eimir.example")
    monkeypatch.setenv("EIMIR_GOOGLE_CALENDAR_CLIENT_ID", "client-id")
    monkeypatch.setenv("EIMIR_GOOGLE_CALENDAR_CLIENT_SECRET", "client-secret")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def couple(session: Session) -> dict[str, Any]:
    anna, ben = make_account(session, "Anna"), make_account(session, "Ben")
    space = make_space(session, anna)
    add_member(session, space.id, ben)
    session.flush()
    return {
        "anna": anna,
        "space": space,
        "a": auth(sign_in(session, anna)),
        "b": auth(sign_in(session, ben)),
    }


@pytest.fixture
def fake(monkeypatch: pytest.MonkeyPatch) -> FakeGoogleCalendar:
    double = FakeGoogleCalendar()
    original = google_calendar.GoogleCalendarApi

    def exchange(client: Any, code: str, state: str, verifier: str) -> str:
        assert code == "good-code" and verifier
        return double.refresh_token

    def api(client: Any, token: str, **_: Any) -> google_calendar.GoogleCalendarApi:
        return original(client, token, transport=double.transport())

    monkeypatch.setattr(google_calendar, "exchange", exchange)
    monkeypatch.setattr(google_calendar, "GoogleCalendarApi", api)
    return double


def start(client, couple, headers="a", return_to=None) -> str:  # type: ignore[no-untyped-def]
    response = client.post(
        base(couple) + "/calendar-sync/connections/google",
        headers=couple[headers],
        json={"returnTo": return_to} if return_to else None,
    )
    assert response.status_code == 201, response.text
    url = response.json()["authorizationUrl"]
    return parse_qs(urlsplit(url).query)["state"][0]


def test_google_is_offered_only_when_the_operator_configured_it(  # type: ignore[no-untyped-def]
    client, session, couple, monkeypatch
) -> None:
    grant(session, couple)
    assert state(client, couple)["services"] == ["CALDAV", "GOOGLE"]
    monkeypatch.setenv("EIMIR_GOOGLE_CALENDAR_CLIENT_SECRET", "")
    get_settings.cache_clear()
    assert state(client, couple)["services"] == ["CALDAV"]
    response = client.post(base(couple) + "/calendar-sync/connections/google", headers=couple["a"])
    assert (response.status_code, response.json()["code"]) == (503, "CALENDAR_GOOGLE_UNAVAILABLE")


def test_consent_creates_a_pending_connection_that_only_its_owner_confirms(  # type: ignore[no-untyped-def]
    client, session, couple, fake
) -> None:
    grant(session, couple)
    oauth_state = start(client, couple)
    page = client.get(
        CALLBACK,
        params={"state": oauth_state, "code": "good-code"},
        headers={"Accept-Language": "de"},
    )
    assert page.status_code == 200
    assert "bestätige dort dein Google-Konto" in page.text
    assert "refresh-token" not in page.text and "good-code" not in page.text
    assert "default-src 'none'" in page.headers["content-security-policy"]

    replay = client.get(CALLBACK, params={"state": oauth_state, "code": "good-code"})
    assert "expired" in replay.text or "abgelaufen" in replay.text
    assert session.execute(select(CalendarOAuthTransaction)).first() is None

    view = state(client, couple)
    [connection] = view["connections"]
    assert (connection["service"], connection["status"], connection["label"]) == (
        "GOOGLE",
        "PENDING",
        "anna@example.com",
    )
    # Unconfirmed consent cannot become the shared calendar or list calendars.
    blocked = client.put(
        base(couple) + "/calendar-sync/target",
        json={"connectionId": connection["id"], "calendarRef": SHARED},
        headers={**couple["a"], "If-Match": f'"{view["targetToken"]}"'},
    )
    assert blocked.status_code == 422
    assert (
        client.get(
            base(couple) + f"/calendar-sync/connections/{connection['id']}/calendars",
            headers=couple["a"],
        ).status_code
        == 404
    )
    # The partner can neither see nor confirm it.
    assert state(client, couple, "b")["connections"] == []
    assert (
        client.post(
            base(couple) + f"/calendar-sync/connections/{connection['id']}/confirm",
            headers=couple["b"],
        ).status_code
        == 404
    )

    confirmed = client.post(
        base(couple) + f"/calendar-sync/connections/{connection['id']}/confirm",
        headers=couple["a"],
    )
    assert confirmed.status_code == 200, confirmed.text
    calendars = {item["name"]: item for item in confirmed.json()["calendars"]}
    assert calendars["Feiertage"]["writable"] is False
    target = client.put(
        base(couple) + "/calendar-sync/target",
        json={"connectionId": connection["id"], "calendarRef": SHARED},
        headers={**couple["a"], "If-Match": f'"{view["targetToken"]}"'},
    )
    assert target.status_code == 200, target.text
    drain(session)
    plan(client, couple, "b", plannedOn="2031-06-20", plannedUntil="2031-06-22")
    drain(session)
    [event] = [value for (calendar, _), value in fake.events.items() if calendar == SHARED]
    assert event["start"] == {"date": "2031-06-20"} and event["end"] == {"date": "2031-06-23"}
    assert event["summary"] == "Gemeinsam frühstücken"

    removed = client.delete(
        base(couple) + f"/calendar-sync/connections/{connection['id']}", headers=couple["a"]
    )
    assert removed.status_code == 204
    assert fake.revoked == ["refresh-token"]
    assert session.execute(select(CalendarConnection)).first() is None


def test_denied_or_unknown_consents_store_nothing(client, session, couple, fake) -> None:  # type: ignore[no-untyped-def]
    grant(session, couple)
    oauth_state = start(client, couple)
    denied = client.get(
        CALLBACK,
        params={"state": oauth_state, "error": "access_denied"},
        headers={"Accept-Language": "en"},
    )
    assert "cancelled" in denied.text
    unknown = client.get(CALLBACK, params={"state": "forged", "code": "good-code"})
    assert unknown.status_code == 200
    assert session.execute(select(CalendarConnection)).first() is None


def test_a_revoked_grant_breaks_the_connection_visibly(client, session, couple, fake) -> None:  # type: ignore[no-untyped-def]
    grant(session, couple)
    oauth_state = start(client, couple)
    client.get(CALLBACK, params={"state": oauth_state, "code": "good-code"})
    connection = state(client, couple)["connections"][0]
    client.post(
        base(couple) + f"/calendar-sync/connections/{connection['id']}/confirm", headers=couple["a"]
    )
    view = state(client, couple)
    client.put(
        base(couple) + "/calendar-sync/target",
        json={"connectionId": connection["id"], "calendarRef": SHARED},
        headers={**couple["a"], "If-Match": f'"{view["targetToken"]}"'},
    )
    drain(session)
    fake.refresh_token = "rotated"  # the person revoked eimir. at Google
    plan(client, couple)
    drain(session)
    target = state(client, couple)["target"]
    assert (target["status"], target["statusReason"]) == ("SUSPENDED", "CONNECTION_BROKEN")
    assert state(client, couple)["connections"][0]["status"] == "BROKEN"


def test_web_consent_returns_to_the_settings_in_the_same_tab(  # type: ignore[no-untyped-def]
    client, session, couple, fake
) -> None:
    grant(session, couple)
    oauth_state = start(client, couple, return_to="web")
    back = client.get(
        CALLBACK, params={"state": oauth_state, "code": "good-code"}, follow_redirects=False
    )
    assert back.status_code == 303
    assert back.headers["location"] == (
        "https://eimir.example/more/settings/calendar?calendarGoogle=connected"
    )
    assert "good-code" not in back.headers["location"]
    denied_state = start(client, couple, return_to="web")
    denied = client.get(
        CALLBACK,
        params={"state": denied_state, "error": "access_denied"},
        follow_redirects=False,
    )
    assert denied.headers["location"].endswith("?calendarGoogle=denied")


def test_app_consent_hands_only_the_outcome_back_to_the_app(  # type: ignore[no-untyped-def]
    client, session, couple, fake
) -> None:
    grant(session, couple)
    oauth_state = start(client, couple, return_to="app")
    back = client.get(
        CALLBACK, params={"state": oauth_state, "code": "good-code"}, follow_redirects=False
    )
    assert back.status_code == 303
    assert back.headers["location"] == "de.eimir.app://calendar/google?calendarGoogle=connected"
    # Still only pending: the signed-in person confirms the account inside the app.
    assert state(client, couple)["connections"][0]["status"] == "PENDING"
    replay = client.get(
        CALLBACK, params={"state": oauth_state, "code": "good-code"}, follow_redirects=False
    )
    # A consumed state no longer knows its origin and never redirects anywhere.
    assert replay.status_code == 200


def test_unknown_return_targets_are_rejected(client, couple) -> None:  # type: ignore[no-untyped-def]
    response = client.post(
        base(couple) + "/calendar-sync/connections/google",
        headers=couple["a"],
        json={"returnTo": "https://elsewhere.example"},
    )
    assert response.status_code == 422


def test_opening_the_settings_never_drops_an_unconfirmed_consent(  # type: ignore[no-untyped-def]
    client, session, couple, fake, monkeypatch
) -> None:
    grant(session, couple)
    client.get(CALLBACK, params={"state": start(client, couple), "code": "good-code"})
    later = clock.now() + timedelta(hours=2)
    monkeypatch.setattr(clock, "now", lambda: later)
    assert state(client, couple)["connections"][0]["status"] == "PENDING"


def test_the_primary_calendar_is_marked_for_a_human_name(  # type: ignore[no-untyped-def]
    client, session, couple, fake
) -> None:
    grant(session, couple)
    client.get(CALLBACK, params={"state": start(client, couple), "code": "good-code"})
    connection = state(client, couple)["connections"][0]
    confirmed = client.post(
        base(couple) + f"/calendar-sync/connections/{connection['id']}/confirm",
        headers=couple["a"],
    ).json()
    primary = next(item for item in confirmed["calendars"] if item["primary"])
    assert primary["ref"] == "anna@example.com"
    view = state(client, couple)
    client.put(
        base(couple) + "/calendar-sync/target",
        json={"connectionId": connection["id"], "calendarRef": primary["ref"]},
        headers={**couple["a"], "If-Match": f'"{view["targetToken"]}"'},
    )
    assert state(client, couple)["target"]["calendarPrimary"] is True
