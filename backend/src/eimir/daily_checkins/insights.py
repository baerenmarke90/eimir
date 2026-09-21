"""Authoritative longitudinal Vibe/Energy insights service.

This module provides the Pro capability boundary for longitudinal Vibe and Energy
evaluations under #1151.

Strict authorization and privacy order:
1. Authenticate caller and verify Space membership (AuthorizationContext).
2. Space configuration and module enablement checked.
3. Privacy / Mutual Reveal evaluated per day: if MUTUAL_REVEAL is active and the caller
   did not submit a check-in for that dimension on that day, the partner's value is HIDDEN.
4. Tenant boundary enforced: only data from the caller's authorized Space is queried.
5. Zero diagnostic, clinical, or causal claims: insights remain descriptive and non-judgmental.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.core.errors import ConflictError, ErrorCode, ValidationError
from eimir.daily_checkins.context import DailyCheckInErrorCode, resolve_space_day
from eimir.daily_checkins.models import DailyCheckIn
from eimir.daily_checkins.service import (
    PartnerDimensionProjection,
    PartnerRevealState,
    _active_partner_account_id,
)
from eimir.relationship import configuration as configuration_service
from eimir.relationship.models import DailyCheckInVisibilityMode


@dataclass(frozen=True)
class DailyInsightDayEntry:
    checked_on: date
    own_vibe: str | None
    own_energy: int | None
    partner_vibe: PartnerDimensionProjection | None
    partner_energy: PartnerDimensionProjection | None


@dataclass(frozen=True)
class DailyInsightSummary:
    total_days: int
    days_with_own_check_in: int
    days_with_partner_check_in: int
    days_with_mutual_check_in: int


@dataclass(frozen=True)
class DailyInsightsResult:
    start_date: date
    end_date: date
    daily_context_timezone: str
    vibe_enabled: bool
    energy_enabled: bool
    days: list[DailyInsightDayEntry]
    summary: DailyInsightSummary


def get_daily_insights(
    session: Session,
    authorization: AuthorizationContext,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    at: datetime | None = None,
) -> DailyInsightsResult:
    """Return longitudinal Daily Check-in insights for the authorized Space.

    Caller must have passed tenant authorization and the commercial Pro capability
    check (Capability.DAILY_INSIGHTS).
    """
    configuration = configuration_service.load(session, authorization.space_id)
    if configuration is None:
        raise ConflictError(
            "Daily Check-in configuration is unavailable for this Space.",
            DailyCheckInErrorCode.CONTEXT_UNAVAILABLE,
        )

    if configuration.daily_context_timezone is None:
        raise ConflictError(
            "Daily Check-in requires a valid shared Space time zone.",
            DailyCheckInErrorCode.CONTEXT_UNAVAILABLE,
        )

    current_space_day = resolve_space_day(configuration.daily_context_timezone, at=at)

    effective_end = end_date if end_date is not None else current_space_day
    effective_start = start_date if start_date is not None else (effective_end - timedelta(days=6))

    if effective_start > effective_end:
        raise ValidationError(
            "start_date must be less than or equal to end_date.",
            ErrorCode.VALIDATION_FAILED,
        )

    # Cap maximum window to 90 days to prevent excessive payload sizes
    if (effective_end - effective_start).days > 90:
        raise ValidationError(
            "Insight date range cannot exceed 90 days.",
            ErrorCode.VALIDATION_FAILED,
        )

    vibe_enabled = configuration.vibe_check_enabled
    energy_enabled = configuration.energy_check_in_enabled

    partner_id = _active_partner_account_id(session, authorization)

    # Strictly space-scoped query
    account_ids = [authorization.account_id]
    if partner_id is not None:
        account_ids.append(partner_id)

    statement = (
        select(DailyCheckIn)
        .where(
            DailyCheckIn.space_id == authorization.space_id,
            DailyCheckIn.account_id.in_(account_ids),
            DailyCheckIn.checked_on.between(effective_start, effective_end),
        )
        .order_by(DailyCheckIn.checked_on.asc())
    )
    rows = session.execute(statement).scalars().all()

    # Index by (checked_on, account_id)
    indexed: dict[tuple[date, UUID], DailyCheckIn] = {
        (row.checked_on, row.account_id): row for row in rows
    }

    days: list[DailyInsightDayEntry] = []
    own_checkin_days = 0
    partner_checkin_days = 0
    mutual_checkin_days = 0

    curr = effective_start
    while curr <= effective_end:
        own_row = indexed.get((curr, authorization.account_id))
        own_vibe = own_row.vibe if own_row and vibe_enabled else None
        own_energy = own_row.energy_level if own_row and energy_enabled else None

        has_own = (own_vibe is not None) or (own_energy is not None)
        if has_own:
            own_checkin_days += 1

        partner_row = indexed.get((curr, partner_id)) if partner_id is not None else None

        partner_vibe_proj: PartnerDimensionProjection | None = None
        if vibe_enabled:
            if partner_id is None or partner_row is None or partner_row.vibe is None:
                partner_vibe_proj = PartnerDimensionProjection(
                    state=PartnerRevealState.NO_CHECK_IN,
                    value=None,
                )
            elif (
                configuration.vibe_visibility_mode == DailyCheckInVisibilityMode.MUTUAL_REVEAL
                and own_vibe is None
            ):
                partner_vibe_proj = PartnerDimensionProjection(
                    state=PartnerRevealState.HIDDEN_UNTIL_SELF_CHECK_IN,
                    value=None,
                )
            else:
                partner_vibe_proj = PartnerDimensionProjection(
                    state=PartnerRevealState.VISIBLE,
                    value=partner_row.vibe,
                )

        partner_energy_proj: PartnerDimensionProjection | None = None
        if energy_enabled:
            if partner_id is None or partner_row is None or partner_row.energy_level is None:
                partner_energy_proj = PartnerDimensionProjection(
                    state=PartnerRevealState.NO_CHECK_IN,
                    value=None,
                )
            elif (
                configuration.energy_visibility_mode == DailyCheckInVisibilityMode.MUTUAL_REVEAL
                and own_energy is None
            ):
                partner_energy_proj = PartnerDimensionProjection(
                    state=PartnerRevealState.HIDDEN_UNTIL_SELF_CHECK_IN,
                    value=None,
                )
            else:
                partner_energy_proj = PartnerDimensionProjection(
                    state=PartnerRevealState.VISIBLE,
                    value=partner_row.energy_level,
                )

        partner_vibe_visible = (
            partner_vibe_proj is not None and partner_vibe_proj.state == PartnerRevealState.VISIBLE
        )
        partner_energy_visible = (
            partner_energy_proj is not None
            and partner_energy_proj.state == PartnerRevealState.VISIBLE
        )
        has_partner_visible = partner_vibe_visible or partner_energy_visible

        if has_partner_visible:
            partner_checkin_days += 1
        if has_own and has_partner_visible:
            mutual_checkin_days += 1

        days.append(
            DailyInsightDayEntry(
                checked_on=curr,
                own_vibe=own_vibe,
                own_energy=own_energy,
                partner_vibe=partner_vibe_proj,
                partner_energy=partner_energy_proj,
            )
        )
        curr += timedelta(days=1)

    total_days = (effective_end - effective_start).days + 1
    summary = DailyInsightSummary(
        total_days=total_days,
        days_with_own_check_in=own_checkin_days,
        days_with_partner_check_in=partner_checkin_days,
        days_with_mutual_check_in=mutual_checkin_days,
    )

    return DailyInsightsResult(
        start_date=effective_start,
        end_date=effective_end,
        daily_context_timezone=configuration.daily_context_timezone,
        vibe_enabled=vibe_enabled,
        energy_enabled=energy_enabled,
        days=days,
        summary=summary,
    )
