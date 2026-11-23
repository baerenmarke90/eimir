"""A signed-in person's problem report or feedback (#2189).

Reports belong to the reporter's Account. The endpoint refuses while the
operator has not enabled support reports, so no client is told "received" when
nobody reads the reports.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Self
from uuid import UUID

from fastapi import APIRouter, Response, status
from pydantic import ConfigDict, StringConstraints, field_validator, model_validator

from eimir.api.deps import CurrentAccount, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.auth import rate_limit
from eimir.config import get_settings
from eimir.core.errors import NotFoundError
from eimir.support_reports import service
from eimir.support_reports.models import SupportReportKind, SupportReportState
from eimir.support_reports.payload import (
    NOTE_MAX_CHARACTERS,
    ClientContext,
    FailureReference,
    SupportReportPayload,
)

router = APIRouter(prefix="/support-reports", tags=["support"])

ACTION_HOURLY = "support_report_hourly"
ACTION_DAILY = "support_report_daily"


class FailureReferenceBody(ApiModel, FailureReference):
    """The generalized failure reference on the wire (camelCase)."""


class ClientContextBody(ApiModel, ClientContext):
    """App and device context on the wire (camelCase)."""


class SupportReportCreate(ApiModel):
    """Strict request: an unknown field is rejected, not stored."""

    model_config = ConfigDict(extra="forbid")

    client_request_id: UUID
    kind: SupportReportKind
    note: Annotated[
        str | None,
        StringConstraints(strip_whitespace=True, max_length=NOTE_MAX_CHARACTERS),
    ] = None
    failure: FailureReferenceBody | None = None
    client: ClientContextBody

    @field_validator("note")
    @classmethod
    def blank_note_is_absent(cls, value: str | None) -> str | None:
        return value or None

    @model_validator(mode="after")
    def kind_shapes_the_content(self) -> Self:
        if self.kind is SupportReportKind.FEEDBACK:
            if self.note is None:
                raise ValueError("Feedback requires a note.")
            if self.failure is not None:
                raise ValueError("Feedback carries no failure reference.")
        return self

    def to_payload(self) -> SupportReportPayload:
        return SupportReportPayload(
            note=self.note,
            failure=(
                FailureReference.model_validate(self.failure.model_dump())
                if self.failure is not None
                else None
            ),
            client=ClientContext.model_validate(self.client.model_dump()),
        )


class SupportReportCreated(ApiModel):
    id: UUID
    state: SupportReportState
    created_at: datetime


@router.post(
    "",
    response_model=SupportReportCreated,
    status_code=status.HTTP_201_CREATED,
    operation_id="createSupportReport",
    responses={
        status.HTTP_200_OK: {
            "model": SupportReportCreated,
            "description": "The request was already received; the original report is returned.",
        },
        **problem_responses(401, 404, 409, 422, 429),
    },
)
def create_support_report(
    body: SupportReportCreate,
    account: CurrentAccount,
    session: DbSession,
    response: Response,
) -> SupportReportCreated:
    """Store a report once per client request identity."""
    if not get_settings().support_reports_enabled:
        raise NotFoundError("Support reports are not available.", service.REPORT_NOT_FOUND)

    response.headers["Cache-Control"] = "private, no-store"
    payload = body.to_payload()

    # A replay answers before the rate limit so a retry after a lost response
    # never spends budget or fails because the budget is used up.
    existing = service.find_replay(
        session,
        account_id=account.id,
        client_request_id=body.client_request_id,
        kind=body.kind,
        payload=payload,
    )
    if existing is not None:
        response.status_code = status.HTTP_200_OK
        return SupportReportCreated.model_validate(existing)

    rate_limit.check(session, ACTION_HOURLY, str(account.id), rate_limit.SUPPORT_REPORT_HOURLY)
    rate_limit.check(session, ACTION_DAILY, str(account.id), rate_limit.SUPPORT_REPORT_DAILY)
    report, created = service.create_report(
        session,
        account_id=account.id,
        client_request_id=body.client_request_id,
        kind=body.kind,
        payload=payload,
    )
    if not created:
        response.status_code = status.HTTP_200_OK
    return SupportReportCreated.model_validate(report)
