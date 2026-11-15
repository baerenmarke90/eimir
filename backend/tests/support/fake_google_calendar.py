"""Google Calendar API v3 double on ``httpx.MockTransport`` (#1895).

Implements the token refresh, revocation, calendar list and event endpoints
eimir. uses, with ETag preconditions, client-supplied ids (409 on reuse) and
Google's behaviour of keeping deleted events as ``cancelled``.
"""

from __future__ import annotations

import itertools
import json
from typing import Any
from urllib.parse import parse_qs, unquote

import httpx

_COUNTER = itertools.count(1)


class FakeGoogleCalendar:
    def __init__(self) -> None:
        self.refresh_token = "refresh-token"
        self.access_tokens: list[str] = []
        self.revoked: list[str] = []
        self.calendars: dict[str, dict[str, Any]] = {
            "anna@example.com": {
                "summary": "anna@example.com",
                "accessRole": "owner",
                "primary": True,
            },
            "shared-calendar@group.calendar.google.com": {
                "summary": "Unser Kalender",
                "accessRole": "writer",
            },
            "holidays@group.v.calendar.google.com": {
                "summary": "Feiertage",
                "accessRole": "reader",
            },
        }
        self.events: dict[tuple[str, str], dict[str, Any]] = {}
        self.fail_next: list[httpx.Response] = []
        self.requests: list[tuple[str, str]] = []

    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self.handle)

    def edit_externally(self, calendar: str, event_id: str) -> None:
        event = self.events[(calendar, event_id)]
        event["summary"] = "Arzttermin"
        event["etag"] = f'"ext-{next(_COUNTER)}"'

    # Handler ---------------------------------------------------------------------

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append((request.method, request.url.path))
        if self.fail_next:
            return self.fail_next.pop(0)
        host = request.url.host
        if host == "oauth2.googleapis.com":
            form = parse_qs(request.content.decode())
            if request.url.path == "/revoke":
                self.revoked.append(form["token"][0])
                return httpx.Response(200)
            if form.get("refresh_token") != [self.refresh_token]:
                return httpx.Response(400, json={"error": "invalid_grant"})
            token = f"access-{next(_COUNTER)}"
            self.access_tokens.append(token)
            return httpx.Response(200, json={"access_token": token, "expires_in": 3599})
        if host != "www.googleapis.com":
            return httpx.Response(599)
        if request.headers.get("authorization") not in {f"Bearer {t}" for t in self.access_tokens}:
            return httpx.Response(401, json={"error": {"code": 401}})
        path = request.url.path.removeprefix("/calendar/v3")
        if path == "/users/me/calendarList":
            items = [{"id": key, **value} for key, value in self.calendars.items()]
            return httpx.Response(200, json={"items": items})
        if path == "/users/me/calendarList/primary":
            return httpx.Response(200, json={"id": "anna@example.com", "primary": True})
        parts = path.split("/")
        if len(parts) >= 4 and parts[1] == "calendars" and parts[3] == "events":
            calendar = unquote(parts[2])
            if calendar not in self.calendars:
                return httpx.Response(404, json={"error": {"code": 404}})
            writable = self.calendars[calendar]["accessRole"] in {"owner", "writer"}
            if len(parts) == 4 and request.method == "POST":
                if not writable:
                    return httpx.Response(
                        403, json={"error": {"errors": [{"reason": "forbidden"}]}}
                    )
                body = json.loads(request.content)
                key = (calendar, body["id"])
                if key in self.events:
                    return httpx.Response(409, json={"error": {"code": 409}})
                body["etag"] = f'"v{next(_COUNTER)}"'
                body["status"] = "confirmed"
                self.events[key] = body
                return httpx.Response(200, json=body)
            key = (calendar, unquote(parts[4]))
            current = self.events.get(key)
            if request.method == "GET":
                return (
                    httpx.Response(200, json=current)
                    if current
                    else httpx.Response(404, json={"error": {"code": 404}})
                )
            if current is None:
                return httpx.Response(404, json={"error": {"code": 404}})
            if request.headers.get("if-match") not in {None, current["etag"]}:
                return httpx.Response(412, json={"error": {"code": 412}})
            if request.method == "PUT":
                body = json.loads(request.content)
                body["id"] = key[1]
                body.setdefault("status", "confirmed")
                body["etag"] = f'"v{next(_COUNTER)}"'
                self.events[key] = body
                return httpx.Response(200, json=body)
            if request.method == "DELETE":
                current["status"] = "cancelled"
                current["etag"] = f'"v{next(_COUNTER)}"'
                return httpx.Response(204)
        return httpx.Response(404, json={"error": {"code": 404}})


def rate_limited() -> httpx.Response:
    return httpx.Response(
        403,
        headers={"Retry-After": "12"},
        json={"error": {"errors": [{"reason": "rateLimitExceeded"}]}},
    )
