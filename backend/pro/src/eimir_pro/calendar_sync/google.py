"""Google Calendar connection lifecycle (#1895).

The consent runs in a browser that may not be the one holding the eimir.
session (the Android app hands it to the system browser). Instead of a
browser-binding cookie, a returning consent only creates a *pending*
connection. It becomes usable after the signed-in person confirms the shown
Google account inside eimir.; a forwarded or injected consent therefore
cannot silently attach a foreign calendar to someone's Plans.
"""

from __future__ import annotations

import hashlib
import logging
from datetime import timedelta
from typing import Literal
from urllib.parse import urlsplit
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from eimir.auth import rate_limit
from eimir.authorization.privacy import AuthorizationContext
from eimir.config import get_settings
from eimir.core import clock
from eimir.core.errors import NotFoundError, ServiceUnavailableError, ValidationError
from eimir.db.locks import lock_subject
from eimir.identity.effects import has_active_membership
from eimir_pro.calendar_sync import service
from eimir_pro.calendar_sync.models import (
    CalendarConnection,
    CalendarConnectionPayload,
    CalendarOAuthPayload,
    CalendarOAuthTransaction,
    CalendarProviderKind,
    ConnectionStatus,
)
from eimir_pro.providers import google_calendar
from eimir_pro.providers.calendar import CalendarAuthError, CalendarProviderError, CalendarSummary

TRANSACTION_LIFETIME = timedelta(minutes=10)
# Long enough to come back from Google's window later; purged only when the
# same Account starts another consent, never by merely opening the settings.
PENDING_LIFETIME = timedelta(hours=24)

# Registered by the Android app (AndroidManifest.xml); carries the outcome only.
APP_RETURN_URL = "de.eimir.app://calendar/google"

Outcome = Literal["connected", "denied", "failed", "expired"]
ReturnTo = Literal["web", "page", "app"]

log = logging.getLogger(__name__)


def _logged(outcome: Outcome, reason: str) -> Outcome:
    # Fixed codes only: never the state, code, token or provider text.
    log.info("calendar google consent", extra={"outcome": outcome, "reason": reason})
    return outcome


def client() -> google_calendar.GoogleCalendarClient | None:
    settings = get_settings()
    secret = settings.google_calendar_client_secret
    base = settings.public_base_url.rstrip("/")
    parsed = urlsplit(base)
    if (
        not settings.google_calendar_client_id
        or secret is None
        or parsed.scheme != "https"
        or not parsed.hostname
        or parsed.path not in ("", "/")
    ):
        return None
    return google_calendar.GoogleCalendarClient(
        client_id=settings.google_calendar_client_id,
        client_secret=secret,
        redirect_uri=f"{base}{google_calendar.CALLBACK_PATH}",
    )


def available() -> bool:
    return service.available() and client() is not None


def _require_client() -> google_calendar.GoogleCalendarClient:
    configured = client()
    if not service.available() or configured is None:
        raise ServiceUnavailableError(
            "Google Calendar is not set up on this instance.", "CALENDAR_GOOGLE_UNAVAILABLE"
        )
    return configured


def _state_hash(state: str) -> str:
    return hashlib.sha256(state.encode()).hexdigest()


def provider_for(connection: CalendarConnection) -> google_calendar.GoogleCalendarApi:
    configured = _require_client()
    token = connection.payload.google_refresh_token
    if not token or connection.payload.google_client_binding != configured.binding:
        # A rotated operator client cannot use refresh tokens of another client.
        raise CalendarAuthError()
    return google_calendar.GoogleCalendarApi(configured, token)


def purge_stale(session: Session, account_id: UUID) -> None:
    now = clock.now()
    session.execute(
        delete(CalendarOAuthTransaction).where(
            CalendarOAuthTransaction.account_id == account_id,
            CalendarOAuthTransaction.expires_at <= now,
        )
    )
    session.execute(
        delete(CalendarConnection).where(
            CalendarConnection.account_id == account_id,
            CalendarConnection.status == ConnectionStatus.PENDING.value,
            CalendarConnection.created_at <= now - PENDING_LIFETIME,
        )
    )


def start(session: Session, auth: AuthorizationContext, return_to: ReturnTo = "page") -> str:
    """Create one consent attempt and return Google's authorization URL."""
    configured = _require_client()
    service.require_pro(session, auth.space_id)
    rate_limit.check(
        session,
        "calendar-google-start",
        str(auth.account_id),
        rate_limit.Limit(10, timedelta(minutes=15)),
    )
    purge_stale(session, auth.account_id)
    url, state, verifier = google_calendar.authorization(configured)
    session.add(
        CalendarOAuthTransaction(
            account_id=auth.account_id,
            space_id=auth.space_id,
            state_hash=_state_hash(state),
            expires_at=clock.now() + TRANSACTION_LIFETIME,
            payload=CalendarOAuthPayload(
                account_id=auth.account_id,
                space_id=auth.space_id,
                code_verifier=verifier,
                client_binding=configured.binding,
                return_to=return_to,
            ),
        )
    )
    session.flush()
    return url


def complete(
    session: Session, *, state: str | None, code: str | None, error: str | None
) -> tuple[Outcome, ReturnTo]:
    """Public callback: consume the attempt exactly once and store a pending connection.

    Returns the outcome and where the person started (``web`` returns to the
    settings page in the same tab, ``app`` hands the outcome back to the
    Android app, ``page`` shows the localized return page).
    """
    if not state or len(state) > 512:
        return _logged("failed", "STATE_MISSING"), "page"
    configured = client()
    transaction = session.execute(
        select(CalendarOAuthTransaction)
        .where(CalendarOAuthTransaction.state_hash == _state_hash(state))
        .with_for_update()
    ).scalar_one_or_none()
    if transaction is None:
        return _logged("expired", "TRANSACTION_UNKNOWN"), "page"
    session.delete(transaction)
    session.flush()
    payload = transaction.payload
    return_to: ReturnTo = (
        "web" if payload.return_to == "web" else "app" if payload.return_to == "app" else "page"
    )
    if (
        transaction.expires_at <= clock.now()
        or payload.account_id != transaction.account_id
        or configured is None
        or payload.client_binding != configured.binding
    ):
        return _logged("expired", "TRANSACTION_EXPIRED"), return_to
    if error or not code or len(code) > 2048:
        if error == "access_denied":
            return _logged("denied", "ACCESS_DENIED"), return_to
        return _logged("failed", "PROVIDER_ERROR"), return_to
    if not has_active_membership(
        session, account_id=transaction.account_id, space_id=transaction.space_id
    ):
        return _logged("failed", "MEMBERSHIP_ENDED"), return_to
    try:
        refresh = google_calendar.exchange(configured, code, state, payload.code_verifier)
        api = google_calendar.GoogleCalendarApi(configured, refresh)
        label = api.account_label()
    except CalendarProviderError as failure:
        return _logged("failed", failure.code), return_to
    lock_subject(session, "calendar-connection", str(transaction.account_id))
    session.add(
        CalendarConnection(
            account_id=transaction.account_id,
            provider=CalendarProviderKind.GOOGLE.value,
            status=ConnectionStatus.PENDING.value,
            payload=CalendarConnectionPayload(
                account_id=transaction.account_id,
                label=label,
                google_refresh_token=refresh,
                google_client_binding=configured.binding,
            ),
        )
    )
    session.flush()
    return _logged("connected", "PENDING_CREATED"), return_to


def confirm(
    session: Session, auth: AuthorizationContext, connection_id: UUID
) -> tuple[CalendarConnection, list[CalendarSummary]]:
    """The signed-in person accepts the shown Google account; then calendars are listed."""
    _require_client()
    service.require_pro(session, auth.space_id)
    row = service.own_connection(session, auth.account_id, connection_id)
    if row.provider != CalendarProviderKind.GOOGLE.value:
        raise NotFoundError("Calendar connection not found.", "CALENDAR_CONNECTION_NOT_FOUND")
    if row.status == ConnectionStatus.PENDING.value:
        if row.created_at <= clock.now() - PENDING_LIFETIME:
            session.delete(row)
            session.flush()
            raise ValidationError("The Google consent expired.", "CALENDAR_GOOGLE_EXPIRED")
        row.status = ConnectionStatus.ACTIVE.value
        row.version += 1
        session.flush()
    calendars = service.list_calendars(session, auth, row.id)
    return row, calendars
