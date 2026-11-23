"""Create, read and triage support reports (#2189).

This module is the service interface an operator plugin calls; no Core module
imports a plugin. Return values carry the opaque ``account_id`` only, never an
email address or display name.

A report is created once per ``(account_id, client_request_id)``. A client that
loses the response retries with the same identity and gets the original report
back instead of a second one.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import and_, or_, select
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from eimir.core import clock
from eimir.core import cursor as cursor_codec
from eimir.core.errors import ConflictError, ErrorCode, NotFoundError
from eimir.core.ids import new_id
from eimir.security.runtime import get_payload_protector
from eimir.support_reports.models import SupportReport, SupportReportKind, SupportReportState
from eimir.support_reports.payload import SupportReportPayload

REPORT_NOT_FOUND = "RESOURCE_NOT_FOUND"


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


def find_replay(
    session: Session,
    *,
    account_id: UUID,
    client_request_id: UUID,
    kind: SupportReportKind,
    payload: SupportReportPayload,
) -> SupportReport | None:
    """Return the report an identical earlier request created, if any.

    ``None`` means the request identity is unused. The same identity with a
    different kind or payload is a client defect and is never merged into the
    original report.
    """
    existing = _find(session, account_id, client_request_id)
    if existing is None:
        return None
    if existing.kind != kind.value or existing.payload != payload:
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
