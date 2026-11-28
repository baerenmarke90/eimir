"""Wire models of the gift code and Pro overview API (ServerAdmin part 5, design 5.4-5.6).

The operator views carry the plain codes, because the operator copies and passes
them on. The couple's redemption answer never carries a code: only the new Pro
end and whether it extended Pro the Space already had.

The batch limits (count, duration, deadline, note length) are checked by the
service, so a violation answers ``GIFT_CODE_BATCH_INVALID`` rather than the
generic validation code; the field descriptions state them.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AfterValidator, AwareDatetime, ConfigDict, Field

from eimir.api.schema import ApiModel
from eimir.core.clock import ensure_utc

GiftCodeStateView = Literal["open", "handed_out", "redeemed", "revoked", "expired"]
GiftOriginView = Literal["manual", "code"]
UtcDatetime = Annotated[datetime, AfterValidator(ensure_utc)]
"""An instant always answered in UTC, whatever time zone the database session reads it in."""
CODE_INPUT_MAX_LENGTH = 64
"""Room for a pasted code with spaces, dashes and the prefix (15 canonical characters)."""


class GiftCodeBatchCreate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    count: int = Field(description="Number of codes, 1 to 100.")
    duration_months: int = Field(description="Pro time one code gives: 1, 3, 6 or 12 months.")
    redeemable_until: AwareDatetime | None = Field(
        default=None,
        description=(
            "Last instant a code can be redeemed, with an offset. The web client sends the "
            "end of the chosen local day as a UTC instant. It must fall on a later UTC day "
            "than today and at most 24 months ahead; omitted, it is 12 months from now."
        ),
    )
    note: str | None = Field(
        default=None,
        description="Private operator note, at most 120 characters after trimming.",
    )


class GiftCodeHandedOutUpdate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    handed_out: bool = Field(strict=True)


class GiftCodeView(ApiModel):
    """One code with its derived state; ``redeemedSpaceId`` links to the Space file."""

    id: UUID
    code: str
    state: GiftCodeStateView
    handed_out_at: UtcDatetime | None
    redeemed_at: UtcDatetime | None
    redeemed_space_id: UUID | None


class GiftCodeBatchSummaryView(ApiModel):
    """One batch with the number of its codes in each state."""

    id: UUID
    note: str | None
    duration_months: int
    redeemable_until: UtcDatetime
    created_at: UtcDatetime
    revoked_at: UtcDatetime | None
    total: int
    open: int
    handed_out: int
    redeemed: int
    revoked: int
    expired: int


class GiftCodeBatchView(GiftCodeBatchSummaryView):
    """A batch with its codes in creation order."""

    codes: list[GiftCodeView]


class ProPlayStatesView(ApiModel):
    """Spaces by their deciding Google Play grant."""

    active: int
    cancelled_running: int
    payment_problem: int
    ended_30d: int


class RunningGiftView(ApiModel):
    """A Space's running gift with its latest end; ``effectiveUntil`` null means unlimited."""

    space_id: UUID
    origin: GiftOriginView
    batch_note: str | None
    effective_until: UtcDatetime | None


class ProOverviewView(ApiModel):
    """Aggregates only: no names and no codes."""

    spaces_total: int
    spaces_premium: int
    premium_by_play: int
    premium_by_gift: int = Field(
        description="Premium only through a gift; a Space with Google Play counts under Play."
    )
    play: ProPlayStatesView
    cancellations_30d: int
    running_gifts: list[RunningGiftView] = Field(
        description="At most 50, sorted by end; unlimited gifts last."
    )
    running_gifts_total: int
    batches: list[GiftCodeBatchSummaryView] = Field(description="Newest first.")


class GiftCodeRedeemRequest(ApiModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(
        max_length=CODE_INPUT_MAX_LENGTH,
        description="The code as typed: case, spaces, dashes and the EIMIR prefix do not matter.",
    )


class GiftCodeRedemptionView(ApiModel):
    """The Space's new Pro end; never the code."""

    effective_until: UtcDatetime
    extended: bool = Field(description="Whether the code extended Pro the Space already had.")
