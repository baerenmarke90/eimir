"""Automatic eimir. → calendar sync lifecycle (#1895).

Direction is one-way: Plans are the source of truth and are written into one
shared target calendar per Space. External changes are detected through the
provider version (ETag) and are never overwritten silently.

Every server operation re-validates membership, Pro (``integration.external_sync``)
and connection ownership. Provider I/O happens in background jobs, except for
the explicit connect/list actions of the sponsoring person.
"""

from __future__ import annotations

import logging
from base64 import urlsafe_b64encode
from dataclasses import dataclass, replace
from datetime import timedelta
from typing import Any, Literal
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from eimir.auth import rate_limit
from eimir.authorization.privacy import AuthorizationContext
from eimir.calendar_sync.models import (
    CalendarConnection,
    CalendarConnectionPayload,
    CalendarProviderKind,
    ConnectionStatus,
    LinkState,
    PlanCalendarLink,
    PlanCalendarLinkPayload,
    SpaceCalendarTarget,
    SpaceCalendarTargetPayload,
    TargetStatus,
)
from eimir.config import get_settings
from eimir.core import clock
from eimir.core.errors import (
    ConflictError,
    NotFoundError,
    PremiumEntitlementRequiredError,
    ServiceUnavailableError,
    ValidationError,
)
from eimir.db.locks import lock_subject
from eimir.domain.events import EventType
from eimir.entitlements import service as entitlements
from eimir.entitlements.models import Capability
from eimir.i18n import DEFAULT_LOCALE, account_locale, text
from eimir.identity.effects import has_active_membership
from eimir.identity.models import Account
from eimir.jobs import queue
from eimir.jobs.errors import RetryableJobError
from eimir.jobs.models import Job, JobStatus
from eimir.outbox.models import OutboxEvent
from eimir.places.models import Place
from eimir.plans import discreet
from eimir.plans.models import Plan, PlanStatus
from eimir.providers.caldav import CalDavAccount, CalDavClient, origin_label
from eimir.providers.calendar import (
    CalendarAuthError,
    CalendarEvent,
    CalendarEventLink,
    CalendarEventMissingError,
    CalendarProvider,
    CalendarProviderError,
    CalendarSummary,
    CalendarVersionConflictError,
)
from eimir.providers.calendar_transport import CalendarTransportError
from eimir.security.keyring import EncryptionMode

log = logging.getLogger(__name__)

CAPABILITY = Capability.INTEGRATION_EXTERNAL_SYNC.value
PLAN_JOB = "calendar_sync.plan"
SPACE_JOB = "calendar_sync.space"
PLAN_EVENTS = frozenset(
    {
        EventType.PLAN_CREATED,
        EventType.PLAN_UPDATED,
        EventType.PLAN_DELETED,
        EventType.PLAN_COMPLETED,
    }
)
_RETRY_BASE = timedelta(minutes=1)
_FULL_SYNC_LIMIT = 500

# Codes that need a person instead of a retry. Each maps to a calm UI state.
REASON_PRO_REQUIRED = "PRO_REQUIRED"
REASON_CONNECTION_BROKEN = "CONNECTION_BROKEN"
REASON_CALENDAR_UNAVAILABLE = "CALENDAR_UNAVAILABLE"
REASON_PAUSED_BY_PARTNER = "PAUSED"
REASON_EVENT_CHANGED = "EVENT_CHANGED"
REASON_EVENT_MISSING = "EVENT_MISSING"
REASON_KEPT_CHANGED = "KEPT_CHANGED"
_CALENDAR_LOST_CODES = {"CALENDAR_NOT_FOUND", "CALENDAR_NOT_WRITABLE"}


# Availability -----------------------------------------------------------------


def available() -> bool:
    settings = get_settings()
    return settings.calendar_sync_enabled and settings.encryption_mode is EncryptionMode.REQUIRED


def _require_available() -> None:
    if not available():
        raise ServiceUnavailableError(
            "Calendar sync is not available on this instance.", "CALENDAR_SYNC_UNAVAILABLE"
        )


def require_pro(session: Session, space_id: UUID) -> None:
    if not entitlements.has_capability(session, space_id, CAPABILITY, lock_grants=True):
        raise PremiumEntitlementRequiredError(CAPABILITY)


def _private_hosts() -> frozenset[str]:
    return frozenset(get_settings().calendar_caldav_private_hosts)


# Providers --------------------------------------------------------------------


def provider_for(connection: CalendarConnection) -> CalendarProvider:
    payload = connection.payload
    if payload.account_id != connection.account_id:
        raise ServiceUnavailableError("Calendar connection is unavailable.", "CALENDAR_UNAVAILABLE")
    if connection.provider == CalendarProviderKind.CALDAV.value:
        if not payload.caldav_url or payload.caldav_username is None:
            raise ServiceUnavailableError(
                "Calendar connection is unavailable.", "CALENDAR_UNAVAILABLE"
            )
        return CalDavClient(
            CalDavAccount(
                url=payload.caldav_url,
                username=payload.caldav_username,
                password=payload.caldav_password or "",
                home_path=payload.caldav_home_path,
                calendar_path=payload.caldav_calendar_path,
            ),
            private_hosts=_private_hosts(),
        )
    if connection.provider == CalendarProviderKind.GOOGLE.value:
        from eimir.calendar_sync import google

        return google.provider_for(connection)
    raise ServiceUnavailableError("Calendar connection is unavailable.", "CALENDAR_UNAVAILABLE")


def _provider_failure(error: CalendarProviderError) -> ValidationError | ServiceUnavailableError:
    """Map an interactive provider failure to a fixed client-facing code."""
    if error.retryable:
        return ServiceUnavailableError("The calendar server is not reachable.", error.code)
    return ValidationError("The calendar connection failed.", error.code)


# Connections (sponsor only) -------------------------------------------------------


def own_connection(session: Session, account_id: UUID, connection_id: UUID) -> CalendarConnection:
    row = session.get(CalendarConnection, connection_id)
    if row is None or row.account_id != account_id:
        raise NotFoundError("Calendar connection not found.", "CALENDAR_CONNECTION_NOT_FOUND")
    return row


def connections_of(session: Session, account_id: UUID) -> list[CalendarConnection]:
    return list(
        session.execute(
            select(CalendarConnection)
            .where(CalendarConnection.account_id == account_id)
            .order_by(CalendarConnection.created_at, CalendarConnection.id)
        ).scalars()
    )


def connect_caldav(
    session: Session,
    auth: AuthorizationContext,
    *,
    url: str,
    username: str,
    password: str,
) -> tuple[CalendarConnection, list[CalendarSummary]]:
    """Discover a CalDAV account and store it encrypted for this Account only."""
    _require_available()
    require_pro(session, auth.space_id)
    rate_limit.check(
        session,
        "calendar-connect",
        str(auth.account_id),
        rate_limit.Limit(10, timedelta(minutes=15)),
    )
    try:
        discovered = CalDavClient(
            CalDavAccount(
                url=url.strip(),
                username=username.strip(),
                password=password,
                home_path=None,
                calendar_path=None,
            ),
            private_hosts=_private_hosts(),
        ).discover()
        client = CalDavClient(discovered, private_hosts=_private_hosts())
        calendars = client.list_calendars()
    except CalendarTransportError as error:
        raise ValidationError("The calendar address is invalid.", str(error)) from None
    except CalendarProviderError as error:
        raise _provider_failure(error) from None
    if not calendars:
        raise ValidationError("No calendar was found.", "CALENDAR_NOT_FOUND")
    lock_subject(session, "calendar-connection", str(auth.account_id))
    row = CalendarConnection(
        account_id=auth.account_id,
        provider=CalendarProviderKind.CALDAV.value,
        status=ConnectionStatus.ACTIVE.value,
        payload=CalendarConnectionPayload(
            account_id=auth.account_id,
            label=f"{discovered.username} · {origin_label(discovered.url)}",
            caldav_url=discovered.url,
            caldav_username=discovered.username,
            caldav_password=discovered.password,
            caldav_home_path=discovered.home_path,
            caldav_calendar_path=discovered.calendar_path,
        ),
    )
    session.add(row)
    session.flush()
    return row, calendars


def list_calendars(
    session: Session, auth: AuthorizationContext, connection_id: UUID
) -> list[CalendarSummary]:
    _require_available()
    row = own_connection(session, auth.account_id, connection_id)
    if row.status == ConnectionStatus.PENDING.value:
        # A returned consent is usable only after the person confirmed it.
        raise NotFoundError("Calendar connection not found.", "CALENDAR_CONNECTION_NOT_FOUND")
    try:
        calendars = provider_for(row).list_calendars()
    except CalendarAuthError:
        _mark_connection_broken(session, row)
        raise ValidationError("The calendar connection failed.", "CALENDAR_AUTH_FAILED") from None
    except CalendarProviderError as error:
        raise _provider_failure(error) from None
    return calendars


def remove_connection(session: Session, auth: AuthorizationContext, connection_id: UUID) -> None:
    """Delete credentials and every target they sponsor; external events stay."""
    # Removing credentials is a privacy right and stays available after Pro expiry.
    row = own_connection(session, auth.account_id, connection_id)
    try:
        provider_for(row).revoke()
    except (CalendarProviderError, ServiceUnavailableError):
        log.info("calendar grant revocation skipped", extra={"provider": row.provider})
    session.delete(row)
    session.flush()


def _mark_connection_broken(session: Session, row: CalendarConnection) -> None:
    row.status = ConnectionStatus.BROKEN.value
    for target in session.execute(
        select(SpaceCalendarTarget).where(SpaceCalendarTarget.connection_id == row.id)
    ).scalars():
        _suspend(target, REASON_CONNECTION_BROKEN)
    session.flush()


# Space target (shared) ---------------------------------------------------------


def target_of(
    session: Session, space_id: UUID, *, lock: bool = False
) -> SpaceCalendarTarget | None:
    statement = select(SpaceCalendarTarget).where(SpaceCalendarTarget.space_id == space_id)
    if lock:
        statement = statement.with_for_update()
    return session.execute(statement).scalar_one_or_none()


def target_token(space_id: UUID, target: SpaceCalendarTarget | None) -> str:
    return f"{target.id}:{target.version}" if target else f"{space_id}:calendar-target:absent"


def _check_token(space_id: UUID, target: SpaceCalendarTarget | None, expected: str) -> None:
    if expected != target_token(space_id, target):
        raise ConflictError(
            "The shared calendar changed in the meantime.", "CALENDAR_TARGET_CHANGED"
        )


def set_target(
    session: Session,
    auth: AuthorizationContext,
    *,
    connection_id: UUID,
    calendar_ref: str,
    expected: str,
) -> SpaceCalendarTarget:
    """Make one calendar of the caller's connection the Space's shared target."""
    _require_available()
    require_pro(session, auth.space_id)
    connection = own_connection(session, auth.account_id, connection_id)
    if connection.status != ConnectionStatus.ACTIVE.value:
        raise ValidationError("The calendar connection failed.", "CALENDAR_AUTH_FAILED")
    try:
        calendars = provider_for(connection).list_calendars()
    except CalendarAuthError:
        _mark_connection_broken(session, connection)
        raise ValidationError("The calendar connection failed.", "CALENDAR_AUTH_FAILED") from None
    except CalendarProviderError as error:
        raise _provider_failure(error) from None
    # The reference must come from the provider's own list, never a client value.
    chosen = next((item for item in calendars if item.ref == calendar_ref), None)
    if chosen is None:
        raise ValidationError("The calendar was not found.", "CALENDAR_NOT_FOUND")
    if not chosen.writable:
        raise ValidationError("eimir. may not write to this calendar.", "CALENDAR_NOT_WRITABLE")

    lock_subject(session, "calendar-target", str(auth.space_id))
    target = target_of(session, auth.space_id, lock=True)
    _check_token(auth.space_id, target, expected)
    payload = SpaceCalendarTargetPayload(
        space_id=auth.space_id,
        calendar_ref=chosen.ref,
        calendar_name=chosen.name,
        calendar_primary=chosen.primary,
    )
    if target is None:
        target = SpaceCalendarTarget(
            space_id=auth.space_id,
            connection_id=connection.id,
            sponsor_account_id=auth.account_id,
            provider=connection.provider,
            status=TargetStatus.ACTIVE.value,
            payload=payload,
        )
        session.add(target)
    else:
        same_calendar = (
            target.connection_id == connection.id and target.payload.calendar_ref == chosen.ref
        )
        if not same_calendar:
            # Earlier events stay in the previous calendar; new mapping starts fresh.
            session.execute(delete(PlanCalendarLink).where(PlanCalendarLink.target_id == target.id))
        target.connection_id = connection.id
        target.sponsor_account_id = auth.account_id
        target.provider = connection.provider
        target.payload = payload
        target.status = TargetStatus.ACTIVE.value
        target.status_reason = None
        target.version += 1
    session.flush()
    request_space_sync(session, auth.space_id)
    return target


def pause_target(
    session: Session, auth: AuthorizationContext, expected: str
) -> SpaceCalendarTarget:
    target = _locked_target(session, auth, expected)
    target.status = TargetStatus.PAUSED.value
    target.status_reason = REASON_PAUSED_BY_PARTNER
    target.version += 1
    session.flush()
    return target


def resume_target(
    session: Session, auth: AuthorizationContext, expected: str
) -> SpaceCalendarTarget:
    _require_available()
    require_pro(session, auth.space_id)
    target = _locked_target(session, auth, expected)
    connection = session.get(CalendarConnection, target.connection_id)
    if connection is None or connection.status != ConnectionStatus.ACTIVE.value:
        raise ValidationError("The calendar connection failed.", "CALENDAR_AUTH_FAILED")
    target.status = TargetStatus.ACTIVE.value
    target.status_reason = None
    target.version += 1
    session.flush()
    request_space_sync(session, auth.space_id)
    return target


def end_target(session: Session, auth: AuthorizationContext, expected: str) -> None:
    """Stop the shared sync. Synced events stay in the external calendar."""
    target = _locked_target(session, auth, expected)
    session.delete(target)
    session.flush()


def _locked_target(
    session: Session, auth: AuthorizationContext, expected: str
) -> SpaceCalendarTarget:
    lock_subject(session, "calendar-target", str(auth.space_id))
    target = target_of(session, auth.space_id, lock=True)
    _check_token(auth.space_id, target, expected)
    if target is None:
        raise NotFoundError("No shared calendar is set.", "CALENDAR_TARGET_NOT_FOUND")
    return target


def request_space_sync(session: Session, space_id: UUID) -> None:
    if not _job_pending(session, SPACE_JOB, {"space_id": str(space_id)}):
        queue.enqueue(session, SPACE_JOB, {"space_id": str(space_id)})


def request_manual_sync(session: Session, auth: AuthorizationContext) -> SpaceCalendarTarget:
    _require_available()
    require_pro(session, auth.space_id)
    target = target_of(session, auth.space_id)
    if target is None:
        raise NotFoundError("No shared calendar is set.", "CALENDAR_TARGET_NOT_FOUND")
    if target.status == TargetStatus.SUSPENDED.value and target.status_reason in {
        REASON_PRO_REQUIRED,
        REASON_CALENDAR_UNAVAILABLE,
    }:
        # Pro is back or the calendar may be reachable again: try once more.
        target.status = TargetStatus.ACTIVE.value
        target.status_reason = None
        target.version += 1
    # Failed links get a fresh chance; conflicts keep waiting for a decision.
    for link in session.execute(
        select(PlanCalendarLink).where(
            PlanCalendarLink.target_id == target.id,
            PlanCalendarLink.state == LinkState.FAILED.value,
        )
    ).scalars():
        link.state = LinkState.PENDING.value
        link.reason = None
    session.flush()
    request_space_sync(session, auth.space_id)
    return target


def resolve_conflict(
    session: Session,
    auth: AuthorizationContext,
    plan_id: UUID,
    action: Literal["OVERWRITE", "DETACH", "DISMISS"],
) -> PlanCalendarLink | None:
    """A person decides about one externally changed or kept event."""
    target = target_of(session, auth.space_id)
    if target is None:
        raise NotFoundError("No shared calendar is set.", "CALENDAR_TARGET_NOT_FOUND")
    link = session.execute(
        select(PlanCalendarLink)
        .where(PlanCalendarLink.target_id == target.id, PlanCalendarLink.plan_id == plan_id)
        .with_for_update()
    ).scalar_one_or_none()
    if link is None or link.state not in {LinkState.CONFLICT.value, LinkState.KEPT.value}:
        raise NotFoundError("Nothing to decide for this Plan.", "CALENDAR_CONFLICT_NOT_FOUND")
    if action == "DISMISS" or link.state == LinkState.KEPT.value:
        if link.state != LinkState.KEPT.value:
            raise ValidationError("Choose how to continue.", "CALENDAR_CONFLICT_ACTION_INVALID")
        session.delete(link)
        session.flush()
        return None
    if action == "DETACH":
        link.state = LinkState.DETACHED.value
        link.reason = None
        session.flush()
        return link
    _require_available()
    require_pro(session, auth.space_id)
    # Overwrite: forget the stale version; the job re-reads the current event.
    link.state = LinkState.PENDING.value
    link.reason = "OVERWRITE"
    session.flush()
    _enqueue_plan(session, auth.space_id, plan_id)
    return link


# Triggers ---------------------------------------------------------------------


def _job_pending(session: Session, kind: str, payload: dict[str, str]) -> bool:
    return (
        session.execute(
            select(Job.id)
            .where(
                Job.kind == kind,
                Job.status == JobStatus.PENDING.value,
                Job.payload.contains(payload),
            )
            .limit(1)
        ).scalar_one_or_none()
        is not None
    )


def _enqueue_plan(session: Session, space_id: UUID, plan_id: UUID) -> None:
    payload = {"space_id": str(space_id), "plan_id": str(plan_id)}
    # The job always reads the current Plan, so one pending job covers all edits.
    if not _job_pending(session, PLAN_JOB, payload):
        queue.enqueue(session, PLAN_JOB, payload)


def on_outbox_event(session: Session, event: OutboxEvent, event_type: EventType) -> None:
    """Outbox projection hook: schedule a sync for a changed Plan of a synced Space."""
    if event_type not in PLAN_EVENTS or event.subject_id is None or not available():
        return
    target = target_of(session, event.space_id)
    if target is None or target.status == TargetStatus.PAUSED.value:
        return
    _enqueue_plan(session, event.space_id, event.subject_id)


def on_membership_ended(session: Session, account_id: UUID, space_id: UUID) -> None:
    """A sponsor who leaves the Space takes their credentials' target with them."""
    session.execute(
        delete(SpaceCalendarTarget).where(
            SpaceCalendarTarget.space_id == space_id,
            SpaceCalendarTarget.sponsor_account_id == account_id,
        )
    )


# Jobs -------------------------------------------------------------------------


def _suspend(target: SpaceCalendarTarget, reason: str) -> None:
    if target.status != TargetStatus.SUSPENDED.value or target.status_reason != reason:
        target.status = TargetStatus.SUSPENDED.value
        target.status_reason = reason
        target.version += 1


@dataclass(frozen=True)
class _Context:
    target: SpaceCalendarTarget
    connection: CalendarConnection
    provider: CalendarProvider


def _runnable(session: Session, space_id: UUID) -> _Context | None:
    """Re-validate every precondition; suspend visibly instead of failing silently."""
    if not available():
        return None
    target = target_of(session, space_id, lock=True)
    if target is None or target.status == TargetStatus.PAUSED.value:
        return None
    if target.status == TargetStatus.SUSPENDED.value and target.status_reason in {
        REASON_CONNECTION_BROKEN,
        REASON_CALENDAR_UNAVAILABLE,
    }:
        return None
    if not entitlements.has_capability(session, space_id, CAPABILITY):
        _suspend(target, REASON_PRO_REQUIRED)
        return None
    if target.status == TargetStatus.SUSPENDED.value:
        # Pro came back: continue automatically.
        target.status = TargetStatus.ACTIVE.value
        target.status_reason = None
        target.version += 1
    if not has_active_membership(session, account_id=target.sponsor_account_id, space_id=space_id):
        session.delete(target)
        return None
    connection = session.get(CalendarConnection, target.connection_id)
    if connection is None or connection.status != ConnectionStatus.ACTIVE.value:
        _suspend(target, REASON_CONNECTION_BROKEN)
        return None
    try:
        provider = provider_for(connection)
    except CalendarAuthError:
        _mark_connection_broken(session, connection)
        return None
    except (CalendarProviderError, ServiceUnavailableError):
        # E.g. the operator removed the Google client configuration.
        _suspend(target, REASON_CALENDAR_UNAVAILABLE)
        return None
    return _Context(target, connection, provider)


def _event_for(session: Session, plan: Plan, uid: str) -> CalendarEvent | None:
    """The external event shape; discreet Plans carry only the list title and time."""
    if plan.status == PlanStatus.IDEA.value:
        return None
    if plan.planned_on is None and plan.planned_start is None:
        return None
    if plan.discreet:
        title = discreet.list_title(plan) or "eimir."
        description = None
        location = None
    else:
        title = plan.payload.title
        description = plan.payload.description or None
        place = session.get(Place, plan.place_id) if plan.place_id else None
        location = place.payload.name if place is not None else None
    if plan.planned_on is not None:
        last = plan.planned_until or plan.planned_on
        return CalendarEvent(
            uid=uid,
            title=title,
            description=description,
            location=location,
            sequence=plan.version,
            start_date=plan.planned_on,
            end_date=last + timedelta(days=1),
        )
    return CalendarEvent(
        uid=uid,
        title=title,
        description=description,
        location=location,
        sequence=plan.version,
        start=plan.planned_start,
        end=plan.planned_end,
    )


def _uid(target: SpaceCalendarTarget, plan_id: UUID) -> str:
    # Distinct from the one-time .ics UID so a manual import never collides.
    return f"{plan_id}-{target.id}@sync.eimir"


def sync_plan(session: Session, payload: dict[str, Any]) -> None:
    space_id = UUID(payload["space_id"])
    plan_id = UUID(payload["plan_id"])
    context = _runnable(session, space_id)
    if context is None:
        return
    target = context.target
    lock_subject(session, "calendar-plan", str(plan_id))
    link = session.execute(
        select(PlanCalendarLink)
        .where(PlanCalendarLink.target_id == target.id, PlanCalendarLink.plan_id == plan_id)
        .with_for_update()
    ).scalar_one_or_none()
    if link is not None and link.state in {LinkState.DETACHED.value, LinkState.KEPT.value}:
        return
    plan = session.get(Plan, plan_id)
    if plan is not None and plan.space_id != space_id:
        return
    try:
        _apply(session, context, plan_id, plan, link)
    except CalendarAuthError:
        _mark_connection_broken(session, context.connection)
    except CalendarProviderError as error:
        _record_failure(session, context, plan_id, link, error)
    else:
        target.last_success_at = clock.now()
    session.flush()


def _apply(
    session: Session,
    context: _Context,
    plan_id: UUID,
    plan: Plan | None,
    link: PlanCalendarLink | None,
) -> None:
    target = context.target
    provider = context.provider
    calendar_ref = target.payload.calendar_ref
    uid = link.payload.uid if link is not None else _uid(target, plan_id)
    event = _event_for(session, plan, uid) if plan is not None else None

    if plan is not None and plan.status == PlanStatus.COMPLETED.value:
        # A completed Plan keeps its last synced event as history.
        return

    if event is None:
        _remove(session, provider, calendar_ref, link)
        return

    if link is None:
        link = PlanCalendarLink(
            space_id=target.space_id,
            target_id=target.id,
            plan_id=plan_id,
            state=LinkState.PENDING.value,
            payload=PlanCalendarLinkPayload(
                space_id=target.space_id,
                event_ref=provider.event_ref(calendar_ref, uid),
                uid=uid,
            ),
        )
        session.add(link)
        session.flush()

    if link.state == LinkState.CONFLICT.value:
        return
    if (
        link.state == LinkState.SYNCED.value
        and plan is not None
        and link.synced_plan_version == plan.version
        and (plan.discreet or link.backlink_plan_version == plan.version)
    ):
        return

    assert plan is not None
    if not plan.discreet:
        sponsor = session.get(Account, target.sponsor_account_id)
        locale = account_locale(sponsor) if sponsor is not None else DEFAULT_LOCALE
        short_id = urlsafe_b64encode(plan.id.bytes).decode("ascii").rstrip("=")
        base_url = get_settings().public_base_url.rstrip("/")
        event = replace(
            event,
            backlink=CalendarEventLink(
                url=f"{base_url}/p/{short_id}", label=text("calendar.plan.open", locale)
            ),
        )
    version = link.payload.provider_version
    overwrite = link.reason == "OVERWRITE"
    if overwrite:
        current = provider.get_event(calendar_ref, link.payload.event_ref)
        version = current.version if current is not None else None

    if version is None:
        try:
            remote = provider.create_event(calendar_ref, event)
        except CalendarVersionConflictError:
            # An earlier attempt may have succeeded without a recorded answer.
            existing = provider.get_event(calendar_ref, link.payload.event_ref)
            if existing is None or existing.uid != uid or existing.version is None:
                _conflict(link, REASON_EVENT_CHANGED)
                return
            remote = provider.update_event(calendar_ref, existing.ref, event, existing.version)
    else:
        try:
            remote = provider.update_event(calendar_ref, link.payload.event_ref, event, version)
        except CalendarVersionConflictError:
            _conflict(link, REASON_EVENT_CHANGED)
            return
        except CalendarEventMissingError:
            _conflict(link, REASON_EVENT_MISSING)
            return
    link.payload = link.payload.model_copy(
        update={"event_ref": remote.ref, "provider_version": remote.version}
    )
    link.state = LinkState.SYNCED.value
    link.reason = None
    link.synced_plan_version = plan.version
    link.backlink_plan_version = plan.version if event.backlink is not None else None
    link.synced_at = clock.now()


def _remove(
    session: Session,
    provider: CalendarProvider,
    calendar_ref: str,
    link: PlanCalendarLink | None,
) -> None:
    """Remove only the clearly managed, unchanged event (Product Owner, 2026-11-15)."""
    if link is None:
        return
    version = link.payload.provider_version
    if link.state != LinkState.SYNCED.value or version is None:
        if link.state in {LinkState.PENDING.value, LinkState.FAILED.value} and version is None:
            # A create may have succeeded unseen; only an exact UID match is ours.
            existing = provider.get_event(calendar_ref, link.payload.event_ref)
            if existing is not None and existing.uid == link.payload.uid and existing.version:
                version = existing.version
            elif existing is None:
                session.delete(link)
                return
            else:
                _keep(link)
                return
        else:
            _keep(link)
            return
    try:
        provider.delete_event(calendar_ref, link.payload.event_ref, version)
    except CalendarEventMissingError:
        pass
    except CalendarVersionConflictError:
        _keep(link)
        return
    session.delete(link)


def _keep(link: PlanCalendarLink) -> None:
    link.state = LinkState.KEPT.value
    link.reason = REASON_KEPT_CHANGED


def _conflict(link: PlanCalendarLink, reason: str) -> None:
    link.state = LinkState.CONFLICT.value
    link.reason = reason


def _record_failure(
    session: Session,
    context: _Context,
    plan_id: UUID,
    link: PlanCalendarLink | None,
    error: CalendarProviderError,
) -> None:
    if error.code in _CALENDAR_LOST_CODES:
        _suspend(context.target, REASON_CALENDAR_UNAVAILABLE)
        return
    if link is not None:
        link.state = LinkState.PENDING.value if error.retryable else LinkState.FAILED.value
        link.reason = error.code
    if error.retryable:
        session.flush()
        not_before = (
            clock.now() + timedelta(seconds=error.retry_after) if error.retry_after else None
        )
        raise RetryableJobError(error.code, retry_not_before=not_before, retry_base=_RETRY_BASE)


def sync_space(session: Session, payload: dict[str, Any]) -> None:
    """Full pass: verify the connection, then schedule every relevant Plan."""
    space_id = UUID(payload["space_id"])
    context = _runnable(session, space_id)
    if context is None:
        return
    try:
        context.provider.check()
    except CalendarAuthError:
        _mark_connection_broken(session, context.connection)
        return
    except CalendarProviderError as error:
        if error.code in _CALENDAR_LOST_CODES:
            _suspend(context.target, REASON_CALENDAR_UNAVAILABLE)
            session.flush()
            return
        if error.retryable:
            raise RetryableJobError(error.code, retry_base=_RETRY_BASE) from None
        raise
    planned = session.execute(
        select(Plan.id)
        .where(Plan.space_id == space_id, Plan.status == PlanStatus.PLANNED.value)
        .order_by(Plan.id)
        .limit(_FULL_SYNC_LIMIT)
    ).scalars()
    linked = session.execute(
        select(PlanCalendarLink.plan_id).where(
            PlanCalendarLink.target_id == context.target.id,
            PlanCalendarLink.state.in_(
                [LinkState.PENDING.value, LinkState.SYNCED.value, LinkState.FAILED.value]
            ),
        )
    ).scalars()
    for plan_id in sorted(set(planned) | set(linked)):
        _enqueue_plan(session, space_id, plan_id)
    session.flush()


# Read model -------------------------------------------------------------------


@dataclass(frozen=True)
class TargetSummary:
    target: SpaceCalendarTarget
    sponsored_by_caller: bool
    synced: int
    pending: int
    conflicts: list[PlanCalendarLink]
    kept: int
    failed: int


def summary(session: Session, auth: AuthorizationContext) -> TargetSummary | None:
    target = target_of(session, auth.space_id)
    if target is None:
        return None
    counts: dict[str, int] = {
        state: count
        for state, count in session.execute(
            select(PlanCalendarLink.state, func.count())
            .where(PlanCalendarLink.target_id == target.id)
            .group_by(PlanCalendarLink.state)
        ).tuples()
    }
    conflicts = list(
        session.execute(
            select(PlanCalendarLink)
            .where(
                PlanCalendarLink.target_id == target.id,
                PlanCalendarLink.state == LinkState.CONFLICT.value,
            )
            .order_by(PlanCalendarLink.updated_at.desc(), PlanCalendarLink.id)
            .limit(50)
        ).scalars()
    )
    pending_jobs = _job_pending(session, SPACE_JOB, {"space_id": str(auth.space_id)})
    return TargetSummary(
        target=target,
        sponsored_by_caller=target.sponsor_account_id == auth.account_id,
        synced=int(counts.get(LinkState.SYNCED.value, 0)),
        pending=int(counts.get(LinkState.PENDING.value, 0)) + (1 if pending_jobs else 0),
        conflicts=conflicts,
        kept=int(counts.get(LinkState.KEPT.value, 0)),
        failed=int(counts.get(LinkState.FAILED.value, 0)),
    )


def plan_link(
    session: Session, auth: AuthorizationContext, plan_id: UUID
) -> PlanCalendarLink | None:
    target = target_of(session, auth.space_id)
    if target is None:
        return None
    return session.execute(
        select(PlanCalendarLink).where(
            PlanCalendarLink.target_id == target.id, PlanCalendarLink.plan_id == plan_id
        )
    ).scalar_one_or_none()
