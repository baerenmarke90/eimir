"""Wire models of the operator support-report API (#2189).

A list item carries only a preview of the note (at most 160 characters, #2327);
the full text of a report is read one report at a time, in the detail. The
detail names the reporter by the opaque account id only; the operator finds the
person through the ServerAdmin account directory.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import AwareDatetime, ConfigDict, StringConstraints

from eimir.api.errors import ProblemDetails
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
    # When the link was reserved: the age of a pending link shows a stuck attempt.
    created_at: datetime


class SupportReportOperatorReply(ApiModel):
    """The one reply sent to the reporter, as plain text."""

    text: str
    replied_at: datetime


class SupportReportFacts(ApiModel):
    """The triage facts shared by the list item and the detail."""

    id: UUID
    kind: SupportReportKind
    state: SupportReportState
    created_at: datetime
    # Set while the operator has archived the report; independent of the state.
    archived_at: datetime | None
    failure_reference: str | None
    app_version: str
    build: str
    # From the client context, for the card's meta line.
    platform: str
    os: str
    has_reply: bool
    ticket: SupportReportTicketSummary | None


class SupportReportListItem(SupportReportFacts):
    """One report in the list: triage facts and a short note preview, never the full note."""

    # The note's first 160 characters on one line, or null without a note.
    note_preview: str | None


class SupportReportStateCounts(ApiModel):
    """Unarchived reports per triage state, whatever the list filter."""

    new: int
    in_progress: int
    closed: int


class SupportReportListView(ApiModel):
    items: list[SupportReportListItem]
    next_cursor: str | None
    has_more: bool
    # Unarchived reports still in state NEW, whatever the list filter.
    new_count: int
    state_counts: SupportReportStateCounts


class SupportReportDetailView(SupportReportFacts):
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


class SupportReportsSeen(ApiModel):
    """Strict request: the reports that were new up to ``through`` (#2342)."""

    model_config = ConfigDict(extra="forbid")

    through: AwareDatetime


class SupportReportsSeenResult(ApiModel):
    """How many reports moved from new to in progress."""

    moved: int


class SupportReportArchiveUpdate(ApiModel):
    """Strict request: archive (true) or unarchive (false) one report."""

    model_config = ConfigDict(extra="forbid")

    archived: bool


class SupportReportReplyCreate(ApiModel):
    """Strict request: the reply is trimmed plain text of 1 to 500 characters."""

    model_config = ConfigDict(extra="forbid")

    text: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=REPLY_MAX_CHARACTERS),
    ]


TICKET_TITLE_MAX_CHARACTERS = 256
TICKET_BODY_MAX_CHARACTERS = 65_536


class SupportReportTicketCreate(ApiModel):
    """Strict request: what the operator wrote; the technical footer is added by the server."""

    model_config = ConfigDict(extra="forbid")

    title: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True, min_length=1, max_length=TICKET_TITLE_MAX_CHARACTERS
        ),
    ]
    body: Annotated[str, StringConstraints(max_length=TICKET_BODY_MAX_CHARACTERS)]


class SupportReportTicketProblem(ProblemDetails):
    """Error body of the ticket routes: the usual problem plus the link or the retry flag."""

    # Set when the report already has a link, otherwise null.
    ticket: SupportReportTicketSummary | None
    # Set when the tracker call failed: whether another attempt can succeed.
    retryable: bool | None
