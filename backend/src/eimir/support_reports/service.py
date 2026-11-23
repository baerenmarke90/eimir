"""Create, read and triage support reports (#2189).

This module is the service interface an operator plugin calls; no Core module
imports a plugin. Return values carry the opaque ``account_id`` only, never an
email address or display name.

A report is created once per ``(account_id, client_request_id)``. A client that
loses the response retries with the same identity and gets the original report
back instead of a second one.

A report receives at most one reply. The reply never changes the report's
``state``, which is only the operator's own triage marker.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, NamedTuple, cast
from uuid import UUID

from sqlalchemy import Select, and_, delete, func, or_, select
from sqlalchemy.dialects import postgresql
from sqlalchemy.engine import CursorResult
from sqlalchemy.orm import Session

from eimir.core import clock
from eimir.core import cursor as cursor_codec
from eimir.core.errors import ConflictError, ErrorCode, NotFoundError, ValidationError
from eimir.core.ids import new_id
from eimir.domain.events import DomainEvent, EventType, PublicEventPayload
from eimir.outbox import service as outbox_service
from eimir.relationship.models import Membership, MembershipStatus
from eimir.security.runtime import get_payload_protector
from eimir.support_reports.models import (
    SupportReport,
    SupportReportKind,
    SupportReportReplyRow,
    SupportReportState,
)
from eimir.support_reports.payload import (
    REPLY_MAX_CHARACTERS,
    SupportReportPayload,
    SupportReportReply,
)

REPORT_NOT_FOUND = "RESOURCE_NOT_FOUND"
REPLY_ALREADY_SENT = "SUPPORT_REPORT_ALREADY_REPLIED"
REPLY_SUBJECT_TYPE = "support_report"

CLOSED_RETENTION = timedelta(days=90)
"""How long a closed report is kept, counted from ``closed_at``."""

MAX_RETENTION = timedelta(days=365)
"""How long any report is kept at most, counted from ``created_at``."""

UNREAD_WARNING_AGE = timedelta(days=14)
"""A ``NEW`` report older than this means reports are not being read."""


@dataclass(frozen=True, slots=True)
class Page[ItemT]:
    """One page of a keyset-paginated collection."""

    items: list[ItemT]
    next_cursor: str | None
    has_more: bool


def _find(session: Session, account_id: UUID, client_request_id: UUID) -> SupportReport | None:
    return session.execute(
        select(SupportReport).where(
            SupportReport.account_id == account_id,
            SupportReport.client_request_id == client_request_id,
        )
    ).scalar_one_or_none()


def payloads_match_for_replay(stored: SupportReportPayload, incoming: SupportReportPayload) -> bool:
    """True when ``incoming`` repeats the report content of ``stored``.

    Only the person's content counts: the note and the attached failure. The
    client context is collected again on every attempt (local time, theme and
    online state change between a lost response and its retry), so it is
    ignored here and the stored report keeps the first attempt's context.
    """
    return stored.note == incoming.note and stored.failure == incoming.failure


def find_replay(
    session: Session,
    *,
    account_id: UUID,
    client_request_id: UUID,
    kind: SupportReportKind,
    payload: SupportReportPayload,
) -> SupportReport | None:
    """Return the report an earlier request with the same content created.

    ``None`` means the request identity is unused. A repeated request matches
    when kind, note and failure are equal (see ``payloads_match_for_replay``);
    a newer client context does not make it a different report. The same
    identity with a different kind, note or failure is a client defect and is
    never merged into the original report.
    """
    existing = _find(session, account_id, client_request_id)
    if existing is None:
        return None
    if existing.kind != kind.value or not payloads_match_for_replay(existing.payload, payload):
        raise ConflictError(
            "The request identity was already used for a different report.",
            ErrorCode.IDEMPOTENCY_KEY_REUSED,
        )
    return existing


def create_report(
    session: Session,
    *,
    account_id: UUID,
    client_request_id: UUID,
    kind: SupportReportKind,
    payload: SupportReportPayload,
) -> tuple[SupportReport, bool]:
    """Create a report, or return the original one for a replayed request.

    The second value is ``True`` only for a newly created report. The unique
    ``(account_id, client_request_id)`` index serializes concurrent identical
    requests: the loser of ``INSERT ... ON CONFLICT DO NOTHING`` re-reads the
    winner's committed row.
    """
    existing = find_replay(
        session,
        account_id=account_id,
        client_request_id=client_request_id,
        kind=kind,
        payload=payload,
    )
    if existing is not None:
        return existing, False

    created_id = session.execute(
        postgresql.insert(SupportReport)
        .values(
            id=new_id(),
            account_id=account_id,
            client_request_id=client_request_id,
            kind=kind.value,
            state=SupportReportState.NEW.value,
            created_at=clock.now(),
            # A Core-level insert bypasses the mapper event that keeps this in
            # step with the payload column, so it is stated here.
            crypto_version=get_payload_protector().write_crypto_version,
            payload=payload,
        )
        .on_conflict_do_nothing(index_elements=["account_id", "client_request_id"])
        .returning(SupportReport.id)
    ).scalar_one_or_none()

    if created_id is None:
        # A concurrent identical request committed first: replay it.
        winner = find_replay(
            session,
            account_id=account_id,
            client_request_id=client_request_id,
            kind=kind,
            payload=payload,
        )
        if winner is None:
            raise RuntimeError("Support report vanished after an insert conflict.")
        return winner, False

    report = session.execute(
        select(SupportReport).where(SupportReport.id == created_id)
    ).scalar_one()
    return report, True


def get_report(session: Session, report_id: UUID) -> SupportReport | None:
    return session.get(SupportReport, report_id)


def count_new(session: Session) -> int:
    """Return how many reports are still in state ``NEW``."""
    return session.execute(
        select(func.count())
        .select_from(SupportReport)
        .where(SupportReport.state == SupportReportState.NEW.value)
    ).scalar_one()


def oldest_new_at(session: Session) -> datetime | None:
    """Return the creation time of the oldest ``NEW`` report, if there is one."""
    return session.execute(
        select(func.min(SupportReport.created_at)).where(
            SupportReport.state == SupportReportState.NEW.value
        )
    ).scalar_one()


def support_reports_unread_warning(
    *, enabled: bool, oldest_new_at: datetime | None, now: datetime
) -> bool:
    """Whether reports are being collected but not read.

    True only while the feature is enabled and the oldest ``NEW`` report is
    strictly more than ``UNREAD_WARNING_AGE`` old. A report exactly at the
    threshold does not warn yet.
    """
    if not enabled or oldest_new_at is None:
        return False
    return clock.ensure_utc(now) - clock.ensure_utc(oldest_new_at) > UNREAD_WARNING_AGE


def _cursor_binding(state: SupportReportState | None) -> dict[str, Any]:
    return {"collection": "support_reports", "state": state.value if state else None}


def _encode_cursor(report: SupportReport, state: SupportReportState | None) -> str:
    return cursor_codec.encode(
        binding=_cursor_binding(state),
        position={
            "createdAt": report.created_at.astimezone(UTC).isoformat().replace("+00:00", "Z"),
            "id": str(report.id),
        },
    )


def _decode_cursor(token: str, state: SupportReportState | None) -> tuple[datetime, UUID]:
    position = cursor_codec.decode(token, binding=_cursor_binding(state))
    created_raw = position.get("createdAt")
    id_raw = position.get("id")
    if not isinstance(created_raw, str) or not isinstance(id_raw, str):
        raise cursor_codec.invalid_cursor()
    try:
        created_at = datetime.fromisoformat(created_raw.replace("Z", "+00:00"))
        report_id = UUID(id_raw)
    except ValueError as error:
        raise cursor_codec.invalid_cursor() from error
    if created_at.tzinfo is None:
        raise cursor_codec.invalid_cursor()
    return created_at.astimezone(UTC), report_id


def list_reports(
    session: Session,
    *,
    state: SupportReportState | None,
    limit: int,
    cursor: str | None,
) -> Page[SupportReport]:
    """List reports newest first, optionally of one state."""
    if limit < 1:
        raise ValueError("limit must be at least 1")
    statement = select(SupportReport)
    if state is not None:
        statement = statement.where(SupportReport.state == state.value)
    if cursor is not None:
        created_at, report_id = _decode_cursor(cursor, state)
        statement = statement.where(
            or_(
                SupportReport.created_at < created_at,
                and_(SupportReport.created_at == created_at, SupportReport.id < report_id),
            )
        )
    statement = statement.order_by(SupportReport.created_at.desc(), SupportReport.id.desc()).limit(
        limit + 1
    )
    rows = list(session.execute(statement).scalars().all())
    has_more = len(rows) > limit
    items = rows[:limit]
    next_cursor = _encode_cursor(items[-1], state) if has_more else None
    return Page(items=items, next_cursor=next_cursor, has_more=has_more)


def set_state(session: Session, report_id: UUID, state: SupportReportState) -> SupportReport:
    """Set the operator's triage marker.

    ``closed_at`` is set when a report becomes ``CLOSED`` and cleared when it
    leaves that state. Closing an already closed report keeps the original
    time, so retention is not extended by a repeated call.
    """
    report = get_report(session, report_id)
    if report is None:
        raise NotFoundError("Support report not found.", REPORT_NOT_FOUND)
    if state is SupportReportState.CLOSED:
        if report.closed_at is None:
            report.closed_at = clock.now()
    else:
        report.closed_at = None
    report.state = state.value
    session.flush()
    return report


def _reply_text(text: str) -> str:
    """Validate the operator's reply text; it is stored and shown as plain text."""
    stripped = text.strip()
    if not stripped:
        raise ValidationError("The reply must not be empty.", ErrorCode.VALIDATION_FAILED)
    if len(stripped) > REPLY_MAX_CHARACTERS:
        raise ValidationError(
            f"The reply must be at most {REPLY_MAX_CHARACTERS} characters.",
            ErrorCode.VALIDATION_FAILED,
        )
    return stripped


def send_reply(
    session: Session,
    *,
    report_id: UUID,
    text: str,
    operator_id: UUID | None,
) -> SupportReport:
    """Store the single reply to a report, announce it and return the report.

    A second reply conflicts: the unique ``report_id`` serializes concurrent
    replies, so the loser of ``INSERT ... ON CONFLICT DO NOTHING`` is refused
    rather than overwriting the winner. The report's ``state`` is not changed.

    The reply records one ``SUPPORT_REPLY`` outbox event in the same
    transaction, in the Space of the reporter's most recent active Membership,
    because a notification lives in a Space. A reporter without an active
    Membership keeps the stored reply and gets no notice. ``operator_id`` is
    accepted but deliberately unused: the notice is attributed to the team, not
    to an operator account, so no operator identity reaches the reporter.
    """
    del operator_id
    reply_text = _reply_text(text)
    report = get_report(session, report_id)
    if report is None:
        raise NotFoundError("Support report not found.", REPORT_NOT_FOUND)

    replied_at = clock.now()
    stored_id = session.execute(
        postgresql.insert(SupportReportReplyRow)
        .values(
            id=new_id(),
            report_id=report_id,
            replied_at=replied_at,
            # A Core-level insert bypasses the mapper event that keeps this in
            # step with the payload column, so it is stated here.
            crypto_version=get_payload_protector().write_crypto_version,
            payload=SupportReportReply(text=reply_text, replied_at=replied_at),
        )
        .on_conflict_do_nothing(index_elements=["report_id"])
        .returning(SupportReportReplyRow.id)
    ).scalar_one_or_none()
    if stored_id is None:
        raise ConflictError("The report already has a reply.", REPLY_ALREADY_SENT)

    space_id = session.execute(reporter_space_statement(report.account_id)).scalar_one_or_none()
    if space_id is not None:
        outbox_service.record(
            session,
            reply_event(report_id=report.id, reporter_id=report.account_id, space_id=space_id),
        )
    return report


def reporter_space_statement(account_id: UUID) -> Select[tuple[UUID]]:
    """Select the Space of the account's most recently joined active Membership."""
    return (
        select(Membership.space_id)
        .where(
            Membership.account_id == account_id,
            Membership.status == MembershipStatus.ACTIVE.value,
        )
        .order_by(
            Membership.joined_at.desc().nulls_last(),
            Membership.created_at.desc(),
            Membership.id.desc(),
        )
        .limit(1)
    )


def reply_event(*, report_id: UUID, reporter_id: UUID, space_id: UUID) -> DomainEvent:
    """The reply announcement: references only, never the reply or report text."""
    return DomainEvent(
        type=EventType.SUPPORT_REPLY,
        space_id=space_id,
        actor_id=None,
        subject_type=REPLY_SUBJECT_TYPE,
        subject_id=report_id,
        payload=PublicEventPayload(recipient_id=reporter_id),
    )


@dataclass(frozen=True, slots=True)
class ReporterReply:
    """The reply as the reporter sees it, with the date of the report it answers."""

    text: str
    replied_at: datetime
    reported_at: datetime


def get_reply(session: Session, *, report_id: UUID, account_id: UUID) -> ReporterReply | None:
    """Return the reply to the reporter's own report, otherwise ``None``.

    A report of another account and a report without a reply are
    indistinguishable. ``replied_at`` is read from its column, which is the
    authority for the time. ``reported_at`` is the report's ``created_at``.
    """
    row = session.execute(
        select(SupportReportReplyRow, SupportReport.created_at)
        .join(SupportReport, SupportReport.id == SupportReportReplyRow.report_id)
        .where(SupportReport.id == report_id, SupportReport.account_id == account_id)
    ).one_or_none()
    if row is None:
        return None
    reply, reported_at = row
    return ReporterReply(
        text=reply.payload.text, replied_at=reply.replied_at, reported_at=reported_at
    )


class RetentionCutoffs(NamedTuple):
    """Reports older than these instants are expired."""

    closed_before: datetime
    created_before: datetime


def retention_cutoffs(now: datetime) -> RetentionCutoffs:
    """The instants before which a closed report, or any report, has expired."""
    instant = clock.ensure_utc(now)
    return RetentionCutoffs(
        closed_before=instant - CLOSED_RETENTION,
        created_before=instant - MAX_RETENTION,
    )


def prune_expired(session: Session) -> int:
    """Delete expired reports and return how many were removed.

    A report expires ``CLOSED_RETENTION`` after it was closed, and in any state
    ``MAX_RETENTION`` after it was created. A report exactly at a cutoff is
    kept. The replies of a deleted report leave through the foreign key's
    ``ON DELETE CASCADE``. Account deletion needs no counterpart here: the
    reporter's reports are already part of ``identity.deletion``.
    """
    cutoffs = retention_cutoffs(clock.now())
    result = cast(
        "CursorResult[object]",
        session.execute(
            delete(SupportReport).where(
                or_(
                    and_(
                        SupportReport.state == SupportReportState.CLOSED.value,
                        SupportReport.closed_at < cutoffs.closed_before,
                    ),
                    SupportReport.created_at < cutoffs.created_before,
                )
            )
        ),
    )
    return int(result.rowcount or 0)
