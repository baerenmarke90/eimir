"""Wire models of the operator support-report API (#2189).

A list item never carries the note: the text of a report is read one report at a
time, in the detail. The detail names the reporter by the opaque account id
only; the operator finds the person through the ServerAdmin account directory.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import ConfigDict, StringConstraints

from eimir.api.schema import ApiModel
from eimir.api.v1.support_reports import ClientContextBody
from eimir.support_reports.models import SupportReportKind, SupportReportState
from eimir.support_reports.payload import REPLY_MAX_CHARACTERS
from eimir_admin.support_tickets.models import TicketState


class SupportReportTicketSummary(ApiModel):
    """The tracker ticket of a report: where it lives, never what it says."""

    tracker: str
    state: TicketState
    url: str | None
    number: int | None


class SupportReportOperatorReply(ApiModel):
    """The one reply sent to the reporter, as plain text."""

    text: str
    replied_at: datetime


class SupportReportListItem(ApiModel):
    """One report in the list: triage facts only, no note text."""

    id: UUID
    kind: SupportReportKind
    state: SupportReportState
    created_at: datetime
    failure_reference: str | None
    app_version: str
    build: str
    has_reply: bool
    ticket: SupportReportTicketSummary | None


class SupportReportListView(ApiModel):
    items: list[SupportReportListItem]
    next_cursor: str | None
    has_more: bool
    # Reports still in state NEW across all states, whatever the list filter.
    new_count: int


class SupportReportDetailView(SupportReportListItem):
    """One report in full, with its reply and ticket link."""

    note: str | None
    request_id: str | None
    client: ClientContextBody
    account_id: UUID
    reply: SupportReportOperatorReply | None
    # Whether a tracker is configured, so a ticket could be created for this report.
    ticket_available: bool


class SupportReportStateUpdate(ApiModel):
    """Strict request: an unknown field or state is rejected."""

    model_config = ConfigDict(extra="forbid")

    state: SupportReportState


class SupportReportReplyCreate(ApiModel):
    """Strict request: the reply is trimmed plain text of 1 to 500 characters."""

    model_config = ConfigDict(extra="forbid")

    text: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=REPLY_MAX_CHARACTERS),
    ]
