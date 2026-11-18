"""Calendar sync endpoints (#1895): private connections, one shared Space target.

Credentials are accepted only in the connect request body and are never
returned. The partner sees the shared target (provider, calendar name, who
connected it, status) but never the connection, its label or its credentials.
"""

from __future__ import annotations

from datetime import datetime
from html import escape
from typing import Annotated, Literal, cast
from uuid import UUID

from fastapi import APIRouter, Path, Query, Request, Response, status
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import ConfigDict, Field, SecretStr

from eimir.api.authors import resolve_author_summary
from eimir.api.concurrency import IfMatchToken
from eimir.api.deps import Authorization, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel, AuthorSummary
from eimir.calendar_sync import google, service
from eimir.calendar_sync.models import (
    CalendarConnection,
    LinkState,
    PlanCalendarLink,
    SpaceCalendarTarget,
)
from eimir.config import get_settings
from eimir.core.errors import ConflictError
from eimir.entitlements.service import has_capability
from eimir.i18n import request_locale, text
from eimir.providers.calendar import CalendarSummary
from eimir.providers.google_calendar import CALLBACK_PATH

router = APIRouter(tags=["calendar-sync"])
_HEADERS = {"Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer"}
_MAX_CONNECTIONS = 5

ServiceKind = Literal["CALDAV", "GOOGLE"]


class CalendarConnectionView(ApiModel):
    id: UUID
    service: ServiceKind
    label: str = Field(description="Shown only to the connecting person.")
    status: Literal["PENDING", "ACTIVE", "BROKEN"]


class CalendarOption(ApiModel):
    ref: str = Field(description="Opaque provider calendar reference.")
    name: str
    writable: bool
    primary: bool = Field(default=False, description="The account's own main calendar.")


class CalendarConflictView(ApiModel):
    plan_id: UUID
    reason: Literal["EVENT_CHANGED", "EVENT_MISSING"]


class SpaceCalendarTargetView(ApiModel):
    service: ServiceKind
    calendar_name: str
    calendar_primary: bool = Field(
        default=False, description="Shown as the provider's main calendar, not by its raw name."
    )
    sponsor: AuthorSummary
    sponsored_by_me: bool
    connection_id: UUID | None = Field(
        default=None, description="The sponsoring connection; only for the sponsor."
    )
    status: Literal["ACTIVE", "PAUSED", "SUSPENDED"]
    status_reason: str | None = None
    last_success_at: datetime | None = None
    synced_count: int
    pending_count: int
    failed_count: int
    kept_count: int
    conflicts: list[CalendarConflictView]


class CalendarSyncView(ApiModel):
    available: bool = Field(description="The instance offers calendar sync at all.")
    can_sync: bool = Field(description="The Space has eimir. Pro for automatic sync.")
    services: list[ServiceKind]
    connections: list[CalendarConnectionView] = Field(
        description="Only the caller's own connections."
    )
    target: SpaceCalendarTargetView | None = None
    target_token: str


class CalDavConnectionCreate(ApiModel):
    model_config = ConfigDict(extra="forbid")
    url: str = Field(min_length=10, max_length=512)
    username: str = Field(min_length=1, max_length=256)
    password: SecretStr = Field(min_length=1, max_length=1024)
    consent: Literal[True]


class CalendarConnectionCreated(ApiModel):
    connection: CalendarConnectionView
    calendars: list[CalendarOption]


class CalendarList(ApiModel):
    calendars: list[CalendarOption]


class SpaceCalendarTargetSave(ApiModel):
    model_config = ConfigDict(extra="forbid")
    connection_id: UUID
    calendar_ref: str = Field(min_length=1, max_length=1024)


class CalendarConflictResolution(ApiModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["OVERWRITE", "DETACH", "DISMISS"]


LinkStateName = Literal["NOT_SYNCED", "PENDING", "SYNCED", "CONFLICT", "DETACHED", "FAILED", "KEPT"]
TargetStatusName = Literal["ACTIVE", "PAUSED", "SUSPENDED"]


class PlanCalendarSyncView(ApiModel):
    state: LinkStateName
    reason: str | None = None
    synced_at: datetime | None = None
    target_status: TargetStatusName | None = None


def _connection_view(row: CalendarConnection) -> CalendarConnectionView:
    return CalendarConnectionView(
        id=row.id,
        service=row.provider,  # type: ignore[arg-type]
        label=row.payload.label,
        status=row.status,  # type: ignore[arg-type]
    )


def _options(calendars: list[CalendarSummary]) -> list[CalendarOption]:
    return [
        CalendarOption(ref=item.ref, name=item.name, writable=item.writable, primary=item.primary)
        for item in calendars
    ]


def _view(session: DbSession, authorization: Authorization) -> CalendarSyncView:
    summary = service.summary(session, authorization)
    target = summary.target if summary else None
    target_view = None
    if summary is not None and target is not None:
        target_view = SpaceCalendarTargetView(
            service=target.provider,  # type: ignore[arg-type]
            calendar_name=target.payload.calendar_name,
            calendar_primary=target.payload.calendar_primary,
            sponsor=resolve_author_summary(
                session, target.sponsor_account_id, resource="Calendar sponsor"
            ),
            sponsored_by_me=summary.sponsored_by_caller,
            connection_id=target.connection_id if summary.sponsored_by_caller else None,
            status=target.status,  # type: ignore[arg-type]
            status_reason=target.status_reason,
            last_success_at=target.last_success_at,
            synced_count=summary.synced,
            pending_count=summary.pending,
            failed_count=summary.failed,
            kept_count=summary.kept,
            conflicts=[
                CalendarConflictView(plan_id=link.plan_id, reason=link.reason)  # type: ignore[arg-type]
                for link in summary.conflicts
                if link.reason in {"EVENT_CHANGED", "EVENT_MISSING"}
            ],
        )
    available = service.available()
    return CalendarSyncView(
        available=available,
        can_sync=available and has_capability(session, authorization.space_id, service.CAPABILITY),
        services=["CALDAV", "GOOGLE"] if google.available() else ["CALDAV"],
        connections=[
            _connection_view(row)
            for row in (
                service.connections_of(session, authorization.account_id) if available else []
            )
        ],
        target=target_view,
        target_token=service.target_token(authorization.space_id, target),
    )


@router.get(
    "/spaces/{spaceId}/calendar-sync",
    response_model=CalendarSyncView,
    operation_id="getCalendarSync",
    responses=problem_responses(401, 404),
)
def get_calendar_sync(
    authorization: Authorization, session: DbSession, response: Response
) -> CalendarSyncView:
    response.headers.update(_HEADERS)
    return _view(session, authorization)


@router.post(
    "/spaces/{spaceId}/calendar-sync/connections/caldav",
    response_model=CalendarConnectionCreated,
    status_code=status.HTTP_201_CREATED,
    operation_id="connectCalDavCalendar",
    responses=problem_responses(401, 403, 404, 409, 422, 429, 503),
)
def connect_caldav(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: CalDavConnectionCreate,
) -> CalendarConnectionCreated:
    response.headers.update(_HEADERS)
    if len(service.connections_of(session, authorization.account_id)) >= _MAX_CONNECTIONS:
        raise ConflictError("Too many calendar connections.", "CALENDAR_CONNECTION_LIMIT")
    row, calendars = service.connect_caldav(
        session,
        authorization,
        url=body.url,
        username=body.username,
        password=body.password.get_secret_value(),
    )
    return CalendarConnectionCreated(
        connection=_connection_view(row), calendars=_options(calendars)
    )


@router.get(
    "/spaces/{spaceId}/calendar-sync/connections/{connectionId}/calendars",
    response_model=CalendarList,
    operation_id="listConnectionCalendars",
    responses=problem_responses(401, 404, 422, 503),
)
def list_connection_calendars(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    connection_id: Annotated[UUID, Path(alias="connectionId")],
) -> CalendarList:
    response.headers.update(_HEADERS)
    return CalendarList(
        calendars=_options(service.list_calendars(session, authorization, connection_id))
    )


@router.delete(
    "/spaces/{spaceId}/calendar-sync/connections/{connectionId}",
    status_code=204,
    response_class=Response,
    operation_id="removeCalendarConnection",
    responses=problem_responses(401, 404),
)
def remove_connection(
    authorization: Authorization,
    session: DbSession,
    connection_id: Annotated[UUID, Path(alias="connectionId")],
) -> Response:
    service.remove_connection(session, authorization, connection_id)
    return Response(status_code=204, headers=_HEADERS)


@router.put(
    "/spaces/{spaceId}/calendar-sync/target",
    response_model=CalendarSyncView,
    operation_id="setCalendarSyncTarget",
    responses=problem_responses(401, 403, 404, 409, 422, 503),
)
def set_target(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: SpaceCalendarTargetSave,
    expected: IfMatchToken,
) -> CalendarSyncView:
    response.headers.update(_HEADERS)
    service.set_target(
        session,
        authorization,
        connection_id=body.connection_id,
        calendar_ref=body.calendar_ref,
        expected=expected,
    )
    return _view(session, authorization)


@router.delete(
    "/spaces/{spaceId}/calendar-sync/target",
    response_model=CalendarSyncView,
    operation_id="endCalendarSyncTarget",
    responses=problem_responses(401, 404, 409),
)
def end_target(
    authorization: Authorization, session: DbSession, response: Response, expected: IfMatchToken
) -> CalendarSyncView:
    response.headers.update(_HEADERS)
    service.end_target(session, authorization, expected)
    return _view(session, authorization)


@router.post(
    "/spaces/{spaceId}/calendar-sync/target/pause",
    response_model=CalendarSyncView,
    operation_id="pauseCalendarSyncTarget",
    responses=problem_responses(401, 404, 409),
)
def pause_target(
    authorization: Authorization, session: DbSession, response: Response, expected: IfMatchToken
) -> CalendarSyncView:
    response.headers.update(_HEADERS)
    service.pause_target(session, authorization, expected)
    return _view(session, authorization)


@router.post(
    "/spaces/{spaceId}/calendar-sync/target/resume",
    response_model=CalendarSyncView,
    operation_id="resumeCalendarSyncTarget",
    responses=problem_responses(401, 403, 404, 409, 422, 503),
)
def resume_target(
    authorization: Authorization, session: DbSession, response: Response, expected: IfMatchToken
) -> CalendarSyncView:
    response.headers.update(_HEADERS)
    service.resume_target(session, authorization, expected)
    return _view(session, authorization)


@router.post(
    "/spaces/{spaceId}/calendar-sync/sync",
    response_model=CalendarSyncView,
    status_code=status.HTTP_202_ACCEPTED,
    operation_id="requestCalendarSync",
    responses=problem_responses(401, 403, 404, 503),
)
def request_sync(
    authorization: Authorization, session: DbSession, response: Response
) -> CalendarSyncView:
    response.headers.update(_HEADERS)
    service.request_manual_sync(session, authorization)
    return _view(session, authorization)


def _plan_view(
    link: PlanCalendarLink | None, target: SpaceCalendarTarget | None
) -> PlanCalendarSyncView:
    target_status = cast(TargetStatusName | None, target.status if target else None)
    if link is None:
        return PlanCalendarSyncView(state="NOT_SYNCED", target_status=target_status)
    return PlanCalendarSyncView(
        state=LinkState(link.state).value,
        reason=link.reason,
        synced_at=link.synced_at,
        target_status=target_status,
    )


@router.get(
    "/spaces/{spaceId}/calendar-sync/plans/{planId}",
    response_model=PlanCalendarSyncView,
    operation_id="getPlanCalendarSync",
    responses=problem_responses(401, 404),
)
def plan_sync(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    plan_id: Annotated[UUID, Path(alias="planId")],
) -> PlanCalendarSyncView:
    response.headers.update(_HEADERS)
    return _plan_view(
        service.plan_link(session, authorization, plan_id),
        service.target_of(session, authorization.space_id),
    )


@router.post(
    "/spaces/{spaceId}/calendar-sync/plans/{planId}/resolve",
    response_model=PlanCalendarSyncView,
    operation_id="resolvePlanCalendarConflict",
    responses=problem_responses(401, 403, 404, 422, 503),
)
def resolve_conflict(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: CalendarConflictResolution,
    plan_id: Annotated[UUID, Path(alias="planId")],
) -> PlanCalendarSyncView:
    response.headers.update(_HEADERS)
    link = service.resolve_conflict(session, authorization, plan_id, body.action)
    return _plan_view(link, service.target_of(session, authorization.space_id))


class GoogleCalendarStart(ApiModel):
    authorization_url: str = Field(
        description="Google's consent page; open it in the browser and return to eimir. after."
    )


class GoogleCalendarStartRequest(ApiModel):
    model_config = ConfigDict(extra="forbid")
    return_to: Literal["web", "page", "app"] = Field(
        default="page",
        description=(
            "web: Google returns to the calendar settings in the same browser tab; "
            "app: the system browser hands the outcome back to the eimir. Android app; "
            "page: a short return page (kept for older app builds)."
        ),
    )


@router.post(
    "/spaces/{spaceId}/calendar-sync/connections/google",
    response_model=GoogleCalendarStart,
    status_code=status.HTTP_201_CREATED,
    operation_id="startGoogleCalendarConnection",
    responses=problem_responses(401, 403, 404, 409, 429, 503),
)
def start_google(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: GoogleCalendarStartRequest | None = None,
) -> GoogleCalendarStart:
    response.headers.update(_HEADERS)
    if len(service.connections_of(session, authorization.account_id)) >= _MAX_CONNECTIONS:
        raise ConflictError("Too many calendar connections.", "CALENDAR_CONNECTION_LIMIT")
    return_to = body.return_to if body is not None else "page"
    return GoogleCalendarStart(
        authorization_url=google.start(session, authorization, return_to=return_to)
    )


@router.post(
    "/spaces/{spaceId}/calendar-sync/connections/{connectionId}/confirm",
    response_model=CalendarConnectionCreated,
    operation_id="confirmCalendarConnection",
    responses=problem_responses(401, 403, 404, 422, 503),
)
def confirm_connection(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    connection_id: Annotated[UUID, Path(alias="connectionId")],
) -> CalendarConnectionCreated:
    response.headers.update(_HEADERS)
    row, calendars = google.confirm(session, authorization, connection_id)
    return CalendarConnectionCreated(
        connection=_connection_view(row), calendars=_options(calendars)
    )


@router.get(CALLBACK_PATH.removeprefix("/api/v1"), include_in_schema=False)
def google_callback(
    session: DbSession,
    request: Request,
    state: Annotated[str, Query(max_length=1024)] = "",
    code: Annotated[str | None, Query(max_length=4096)] = None,
    error: Annotated[str | None, Query(max_length=128)] = None,
) -> Response:
    """External return page; provider details never reach the browser."""
    outcome, return_to = google.complete(session, state=state, code=code, error=error)
    locale = request_locale(request.headers.get("accept-language"))
    back = f"{get_settings().public_base_url.rstrip('/')}/more/settings/calendar"
    if return_to == "web":
        # Same tab: back to the settings, which show the confirmation directly.
        return RedirectResponse(
            f"{back}?calendarGoogle={outcome}", status_code=303, headers=_HEADERS
        )
    if return_to == "app":
        # The app's own callback: it closes the browser and opens the settings.
        # Only the fixed outcome travels; the signed-in person still confirms.
        return RedirectResponse(
            f"{google.APP_RETURN_URL}?calendarGoogle={outcome}", status_code=303, headers=_HEADERS
        )
    page = (
        f"<!doctype html><html lang={locale}><meta charset=utf-8>"
        "<meta name=viewport content='width=device-width,initial-scale=1'>"
        f"<title>{escape(text('calendar.google.title', locale))}</title>"
        "<body style='font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;"
        "padding:0 1rem;line-height:1.5'>"
        f"<h1 style='font-size:1.4rem'>{escape(text('calendar.google.title', locale))}</h1>"
        f"<p>{escape(text(f'calendar.google.{outcome}', locale))}</p>"
        f"<p><a href='{escape(back, quote=True)}'>"
        f"{escape(text('calendar.google.back', locale))}</a></p>"
        "</body></html>"
    )
    return HTMLResponse(
        page,
        headers={
            **_HEADERS,
            "Content-Security-Policy": (
                "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; "
                "base-uri 'none'; form-action 'none'"
            ),
        },
    )
