"""Google Calendar adapter for automatic Plan sync (#1895).

OAuth uses the already adopted ``google-auth-oauthlib`` web-server flow with
state and PKCE; eimir. never sees Google credentials. The refresh token is
stored encrypted by the caller. API calls go to fixed official endpoints with
``trust_env=False``, no redirects and bounded responses; failures map to
fixed codes and never quote provider text.

Scopes (least privilege for one shared target calendar):

- ``calendar.calendarlist.readonly`` to list calendars and their access role;
- ``calendar.events`` to create, update and delete the managed events.

Events get a deterministic client-supplied id derived from the eimir. UID, so
a retried insert meets HTTP 409 instead of creating a duplicate. Ownership is
proven by a private extended property, never by title or time.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import time
from dataclasses import dataclass, field
from datetime import UTC
from typing import Any
from urllib.parse import quote

import httpx
from pydantic import SecretStr

from eimir_pro.providers.calendar import (
    CalendarAuthError,
    CalendarEvent,
    CalendarEventMissingError,
    CalendarProvider,
    CalendarProviderError,
    CalendarSummary,
    CalendarVersionConflictError,
    RemoteEvent,
)

AUTH_URI = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URI = "https://oauth2.googleapis.com/token"
REVOKE_URI = "https://oauth2.googleapis.com/revoke"
API = "https://www.googleapis.com/calendar/v3"
CALLBACK_PATH = "/api/v1/calendar-sync/google/callback"
SCOPES = (
    "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
    "https://www.googleapis.com/auth/calendar.events",
)
OWNER_PROPERTY = "eimirUid"
_MAX_RESPONSE = 1024 * 1024
_TIMEOUT = httpx.Timeout(15.0, connect=5.0)
_RETRY_AFTER_CEILING = 300.0
_RATE_LIMIT_REASONS = {"rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded"}

logging.getLogger("requests_oauthlib.oauth2_session").setLevel(logging.CRITICAL + 1)


@dataclass(frozen=True)
class GoogleCalendarClient:
    client_id: str = field(repr=False)
    client_secret: SecretStr = field(repr=False)
    redirect_uri: str

    @property
    def binding(self) -> str:
        """Ties a transaction to this client configuration; not a credential."""
        encoded = json.dumps(
            [self.client_id, self.client_secret.get_secret_value(), self.redirect_uri],
            separators=(",", ":"),
        ).encode()
        return hashlib.sha256(encoded).hexdigest()


def _flow(
    client: GoogleCalendarClient, *, state: str | None = None, verifier: str | None = None
) -> Any:
    from google_auth_oauthlib.flow import Flow  # type: ignore[import-untyped]

    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": client.client_id,
                "client_secret": client.client_secret.get_secret_value(),
                "auth_uri": AUTH_URI,
                "token_uri": TOKEN_URI,
            }
        },
        scopes=list(SCOPES),
        state=state,
        code_verifier=verifier,
        autogenerate_code_verifier=verifier is None,
    )
    flow.redirect_uri = client.redirect_uri
    flow.oauth2session.trust_env = False
    return flow


def authorization(client: GoogleCalendarClient) -> tuple[str, str, str]:
    """Consent URL, state and PKCE verifier for one connection attempt."""
    flow = _flow(client)
    try:
        url, state = flow.authorization_url(
            access_type="offline",
            prompt="consent select_account",
            include_granted_scopes="false",
        )
        return str(url), str(state), str(flow.code_verifier)
    finally:
        flow.oauth2session.close()


def exchange(client: GoogleCalendarClient, code: str, state: str, verifier: str) -> str:
    """Exchange the code and return the refresh token; every requested scope is required."""
    flow = _flow(client, state=state, verifier=verifier)
    deadline = time.monotonic() + 25

    def bounded(response: Any, **_: Any) -> Any:
        content = bytearray()
        try:
            for chunk in response.iter_content(chunk_size=4096):
                content.extend(chunk)
                if len(content) > 64 * 1024 or time.monotonic() > deadline:
                    raise CalendarProviderError("CALENDAR_RESPONSE_INVALID")
            response._content = bytes(content)
            response._content_consumed = True
            return response
        finally:
            response.close()

    flow.oauth2session.hooks["response"] = [bounded]
    try:
        token = flow.fetch_token(code=code, timeout=(5, 5), allow_redirects=False, stream=True)
    except Exception:
        # OAuth exceptions can quote codes, tokens and provider response text.
        raise CalendarProviderError("CALENDAR_AUTHORIZATION_FAILED") from None
    finally:
        flow.oauth2session.close()
    refresh = token.get("refresh_token") if isinstance(token, dict) else None
    granted = token.get("scope") if isinstance(token, dict) else None
    scopes = set(granted if isinstance(granted, list) else str(granted or "").split())
    if not isinstance(refresh, str) or not refresh:
        raise CalendarProviderError("CALENDAR_AUTHORIZATION_FAILED")
    if not set(SCOPES) <= scopes:
        # Google lets people untick scopes; without both, sync cannot work.
        raise CalendarProviderError("CALENDAR_SCOPES_MISSING")
    return refresh


def event_id(uid: str) -> str:
    """Deterministic base32hex id (Google allows a-v and 0-9, 5 to 1024 characters)."""
    digest = hashlib.sha256(uid.encode()).digest()
    return base64.b32hexencode(digest).decode().rstrip("=").lower()


def _retry_after(response: httpx.Response) -> float | None:
    value = response.headers.get("retry-after", "").strip()
    if value.isascii() and value.isdecimal() and len(value) <= 6:
        return min(float(value), _RETRY_AFTER_CEILING)
    return None


class GoogleCalendarApi(CalendarProvider):
    def __init__(
        self,
        client: GoogleCalendarClient,
        refresh_token: str,
        *,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._client = client
        self._refresh_token = refresh_token
        self._access_token: str | None = None
        self._http = httpx.Client(
            transport=transport,
            timeout=_TIMEOUT,
            follow_redirects=False,
            trust_env=False,
            headers={"User-Agent": "eimir-calendar/1"},
        )

    def __repr__(self) -> str:
        return "GoogleCalendarApi()"

    # Transport -----------------------------------------------------------------

    def _token(self) -> str:
        if self._access_token:
            return self._access_token
        try:
            response = self._http.post(
                TOKEN_URI,
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": self._refresh_token,
                    "client_id": self._client.client_id,
                    "client_secret": self._client.client_secret.get_secret_value(),
                },
            )
        except httpx.HTTPError:
            raise CalendarProviderError("CALENDAR_UNREACHABLE", retryable=True) from None
        if response.status_code in {400, 401}:
            # invalid_grant: revoked, expired or password change.
            raise CalendarAuthError()
        if response.status_code != 200:
            raise CalendarProviderError("CALENDAR_UNAVAILABLE", retryable=True)
        token = self._json(response).get("access_token")
        if not isinstance(token, str) or not token:
            raise CalendarProviderError("CALENDAR_RESPONSE_INVALID")
        self._access_token = token
        return token

    @staticmethod
    def _json(response: httpx.Response) -> dict[str, Any]:
        if len(response.content) > _MAX_RESPONSE:
            raise CalendarProviderError("CALENDAR_RESPONSE_INVALID")
        try:
            value = response.json()
        except ValueError:
            raise CalendarProviderError("CALENDAR_RESPONSE_INVALID") from None
        if not isinstance(value, dict):
            raise CalendarProviderError("CALENDAR_RESPONSE_INVALID")
        return value

    def _send(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
        body: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> httpx.Response:
        for attempt in range(2):
            try:
                response = self._http.request(
                    method,
                    f"{API}{path}",
                    params=params,
                    json=body,
                    headers={**(headers or {}), "Authorization": f"Bearer {self._token()}"},
                )
            except httpx.HTTPError:
                raise CalendarProviderError("CALENDAR_UNREACHABLE", retryable=True) from None
            if response.status_code == 401 and attempt == 0:
                self._access_token = None
                continue
            break
        if response.status_code == 401:
            raise CalendarAuthError()
        if response.status_code == 429 or (
            response.status_code == 403 and self._reason(response) in _RATE_LIMIT_REASONS
        ):
            raise CalendarProviderError(
                "CALENDAR_RATE_LIMITED", retryable=True, retry_after=_retry_after(response)
            )
        if response.status_code >= 500:
            raise CalendarProviderError("CALENDAR_UNAVAILABLE", retryable=True)
        return response

    def _reason(self, response: httpx.Response) -> str | None:
        try:
            errors = self._json(response).get("error", {}).get("errors", [])
            return str(errors[0].get("reason")) if errors else None
        except (CalendarProviderError, AttributeError, IndexError):
            return None

    def _calendar_path(self, calendar_ref: str) -> str:
        if not calendar_ref or len(calendar_ref) > 1024:
            raise CalendarProviderError("CALENDAR_NOT_FOUND")
        return f"/calendars/{quote(calendar_ref, safe='')}"

    # Mapping -------------------------------------------------------------------

    @staticmethod
    def _resource(event: CalendarEvent) -> dict[str, Any]:
        body: dict[str, Any] = {
            "summary": event.title,
            "sequence": event.sequence,
            "extendedProperties": {"private": {OWNER_PROPERTY: event.uid}},
        }
        description = (
            event.backlink.html_description(event.description)
            if event.backlink is not None
            else event.description
        )
        if description:
            body["description"] = description
        if event.location:
            body["location"] = event.location
        if event.start_date is not None and event.end_date is not None:
            body["start"] = {"date": event.start_date.isoformat()}
            body["end"] = {"date": event.end_date.isoformat()}
        elif event.start is not None:
            start = event.start.astimezone(UTC).isoformat().replace("+00:00", "Z")
            # Google requires an end; an unknown end stays a point in time.
            end_value = event.end or event.start
            end = end_value.astimezone(UTC).isoformat().replace("+00:00", "Z")
            body["start"] = {"dateTime": start, "timeZone": "UTC"}
            body["end"] = {"dateTime": end, "timeZone": "UTC"}
        else:
            raise CalendarProviderError("CALENDAR_EVENT_INVALID")
        return body

    @staticmethod
    def _remote(ref: str, value: dict[str, Any]) -> RemoteEvent:
        private = (value.get("extendedProperties") or {}).get("private") or {}
        uid = private.get(OWNER_PROPERTY)
        etag = value.get("etag")
        return RemoteEvent(
            ref=ref,
            version=etag if isinstance(etag, str) else None,
            uid=uid if isinstance(uid, str) else None,
        )

    def _calendar_failure(self, response: httpx.Response) -> CalendarProviderError:
        if response.status_code in {403}:
            return CalendarProviderError("CALENDAR_NOT_WRITABLE")
        if response.status_code in {404, 410}:
            return CalendarProviderError("CALENDAR_NOT_FOUND")
        return CalendarProviderError("CALENDAR_PROVIDER_ERROR")

    # Contract ------------------------------------------------------------------

    def check(self) -> None:
        response = self._send("GET", "/users/me/calendarList", params={"maxResults": "1"})
        if response.status_code != 200:
            raise self._calendar_failure(response)

    def account_label(self) -> str:
        """The primary calendar id, usually the Google address; shown to the sponsor only."""
        response = self._send("GET", "/users/me/calendarList/primary")
        if response.status_code != 200:
            return "Google"
        value = self._json(response).get("id")
        return value[:200] if isinstance(value, str) and value else "Google"

    def list_calendars(self) -> list[CalendarSummary]:
        calendars: list[CalendarSummary] = []
        page: str | None = None
        for _ in range(5):
            params = {"maxResults": "250", "showHidden": "false"}
            if page:
                params["pageToken"] = page
            response = self._send("GET", "/users/me/calendarList", params=params)
            if response.status_code != 200:
                raise self._calendar_failure(response)
            value = self._json(response)
            for item in value.get("items") or []:
                if not isinstance(item, dict) or not isinstance(item.get("id"), str):
                    continue
                name = item.get("summaryOverride") or item.get("summary") or item["id"]
                calendars.append(
                    CalendarSummary(
                        ref=item["id"],
                        name=str(name)[:200],
                        writable=item.get("accessRole") in {"owner", "writer"},
                        primary=item.get("primary") is True,
                    )
                )
            page = (
                value.get("nextPageToken") if isinstance(value.get("nextPageToken"), str) else None
            )
            if not page:
                break
        return sorted(calendars, key=lambda item: (item.name.casefold(), item.ref))[:200]

    def event_ref(self, calendar_ref: str, uid: str) -> str:
        return event_id(uid)

    def get_event(self, calendar_ref: str, event_ref: str) -> RemoteEvent | None:
        response = self._send(
            "GET", f"{self._calendar_path(calendar_ref)}/events/{quote(event_ref, safe='')}"
        )
        if response.status_code in {404, 410}:
            return None
        if response.status_code != 200:
            raise self._calendar_failure(response)
        value = self._json(response)
        if value.get("status") == "cancelled":
            # A deleted event remains readable as cancelled; it is gone for sync.
            return None
        return self._remote(event_ref, value)

    def create_event(self, calendar_ref: str, event: CalendarEvent) -> RemoteEvent:
        ref = event_id(event.uid)
        response = self._send(
            "POST",
            f"{self._calendar_path(calendar_ref)}/events",
            body={"id": ref, **self._resource(event)},
        )
        if response.status_code == 409:
            return self._restore_cancelled(calendar_ref, ref, event)
        if response.status_code != 200:
            raise self._calendar_failure(response)
        return self._remote(ref, self._json(response))

    def _restore_cancelled(self, calendar_ref: str, ref: str, event: CalendarEvent) -> RemoteEvent:
        """Google keeps deleted ids as cancelled; a re-scheduled Plan reuses its own id."""
        path = f"{self._calendar_path(calendar_ref)}/events/{quote(ref, safe='')}"
        response = self._send("GET", path)
        if response.status_code != 200:
            raise CalendarVersionConflictError()
        value = self._json(response)
        current = self._remote(ref, value)
        if value.get("status") != "cancelled" or current.uid != event.uid or not current.version:
            raise CalendarVersionConflictError()
        restored = self._send(
            "PUT",
            path,
            body={**self._resource(event), "status": "confirmed"},
            headers={"If-Match": current.version},
        )
        if restored.status_code != 200:
            raise CalendarVersionConflictError()
        return self._remote(ref, self._json(restored))

    def update_event(
        self, calendar_ref: str, event_ref: str, event: CalendarEvent, expected_version: str
    ) -> RemoteEvent:
        response = self._send(
            "PUT",
            f"{self._calendar_path(calendar_ref)}/events/{quote(event_ref, safe='')}",
            body=self._resource(event),
            headers={"If-Match": expected_version},
        )
        if response.status_code == 412:
            raise CalendarVersionConflictError()
        if response.status_code in {404, 410}:
            raise CalendarEventMissingError()
        if response.status_code != 200:
            raise self._calendar_failure(response)
        return self._remote(event_ref, self._json(response))

    def delete_event(self, calendar_ref: str, event_ref: str, expected_version: str) -> None:
        response = self._send(
            "DELETE",
            f"{self._calendar_path(calendar_ref)}/events/{quote(event_ref, safe='')}",
            headers={"If-Match": expected_version},
        )
        if response.status_code == 412:
            raise CalendarVersionConflictError()
        if response.status_code in {404, 410}:
            raise CalendarEventMissingError()
        if response.status_code not in {200, 204}:
            raise self._calendar_failure(response)

    def revoke(self) -> None:
        try:
            self._http.post(REVOKE_URI, data={"token": self._refresh_token})
        except httpx.HTTPError:
            raise CalendarProviderError("CALENDAR_UNREACHABLE", retryable=True) from None
