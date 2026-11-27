"""Gift code and Pro overview routes (ServerAdmin part 5, design sections 5.4-5.6).

Two routers. ``admin_router`` serves the ServerAdmin Pro area: the overview
figures, batch creation, the batch view with its plain codes, and the handed-out
and revoke actions. ``router`` serves the couple's redemption. Both exist only
on eimir. Cloud (``server_admin.pro_area_available``); elsewhere every route
answers 404, and only after the caller passed authentication and authorization
(ServerAdmin role, Space membership), so the answer reveals nothing to others.

The plain code goes into no problem detail and no log line: the operator views
carry it in the body only, and the redemption answer never carries it.
"""

from __future__ import annotations

from collections import Counter
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Response
from sqlalchemy.orm import Session

from eimir.api.deps import CurrentServerAdmin, DbSession, Tenant, TenantContext
from eimir.api.errors import problem_responses
from eimir.api.v1.server_admin import pro_area_available
from eimir.config import get_settings
from eimir.core import clock
from eimir.core.errors import NotFoundError
from eimir.core.ids import parse_id
from eimir.identity.models import Account
from eimir_pro.api.gift_code_models import (
    GiftCodeBatchCreate,
    GiftCodeBatchSummaryView,
    GiftCodeBatchView,
    GiftCodeHandedOutUpdate,
    GiftCodeRedeemRequest,
    GiftCodeRedemptionView,
    GiftCodeView,
    ProOverviewView,
    ProPlayStatesView,
    RunningGiftView,
)
from eimir_pro.gift_codes import overview as pro_overview
from eimir_pro.gift_codes import redemption, service
from eimir_pro.gift_codes.models import GiftCodeBatch
from eimir_pro.gift_codes.service import BatchSummary, GiftCodeErrorCode

NO_STORE = "private, no-store"
PRO_AREA_NOT_FOUND = "PRO_AREA_NOT_FOUND"
"""The ServerAdmin Pro area does not exist on this server (not eimir. Cloud)."""
REDEMPTION_NOT_FOUND = "GIFT_CODE_REDEMPTION_NOT_FOUND"
"""Redeeming gift codes does not exist on this server (not eimir. Cloud)."""


def _no_store(response: Response) -> None:
    response.headers["Cache-Control"] = NO_STORE


admin_router = APIRouter(
    prefix="/server-admin/pro",
    tags=["server-admin-pro"],
    dependencies=[Depends(_no_store)],
)
router = APIRouter(tags=["gift-codes"])


def _require_pro_area(admin: CurrentServerAdmin) -> Account:
    """A ServerAdmin, and only on eimir. Cloud.

    The deployment is checked after the authorization, so a caller who is not
    a ServerAdmin learns nothing about it.
    """
    if not pro_area_available(get_settings()):
        raise NotFoundError("The Pro area is not available.", PRO_AREA_NOT_FOUND)
    return admin


def _require_redemption(tenant: Tenant) -> TenantContext:
    """A member of the Space, and only on eimir. Cloud; a non-member gets the Space 404."""
    if not pro_area_available(get_settings()):
        raise NotFoundError("Gift codes are not available.", REDEMPTION_NOT_FOUND)
    return tenant


ProOperator = Annotated[Account, Depends(_require_pro_area)]
RedeemingMember = Annotated[TenantContext, Depends(_require_redemption)]
BatchIdPath = Annotated[str, Path(alias="batchId", max_length=64)]
CodeIdPath = Annotated[str, Path(alias="codeId", max_length=64)]


def _batch_id(value: str) -> UUID:
    """Unknown and malformed ids are the same 404."""
    parsed = parse_id(value)
    if parsed is None:
        raise NotFoundError("Gift code batch not found.", GiftCodeErrorCode.BATCH_NOT_FOUND)
    return parsed


def _code_id(value: str) -> UUID:
    parsed = parse_id(value)
    if parsed is None:
        raise NotFoundError("Gift code not found.", GiftCodeErrorCode.NOT_FOUND)
    return parsed


def _summary_view(summary: BatchSummary) -> GiftCodeBatchSummaryView:
    return GiftCodeBatchSummaryView(
        id=summary.id,
        note=summary.note,
        duration_months=summary.duration_months,
        redeemable_until=summary.redeemable_until,
        created_at=summary.created_at,
        revoked_at=summary.revoked_at,
        total=summary.total,
        open=summary.open,
        handed_out=summary.handed_out,
        redeemed=summary.redeemed,
        revoked=summary.revoked,
        expired=summary.expired,
    )


def _batch_view(session: Session, batch: GiftCodeBatch, at: datetime) -> GiftCodeBatchView:
    """The batch with its codes; the counts derive from the same states the codes show."""
    codes = [
        GiftCodeView(
            id=code.id,
            code=code.payload.code,
            state=service.code_state(code, batch, at),
            handed_out_at=code.handed_out_at,
            redeemed_at=code.redeemed_at,
            redeemed_space_id=code.redeemed_space_id,
        )
        for code in service.list_codes(session, batch.id)
    ]
    counts = Counter(code.state for code in codes)
    return GiftCodeBatchView(
        id=batch.id,
        note=batch.note,
        duration_months=batch.duration_months,
        redeemable_until=batch.redeemable_until,
        created_at=batch.created_at,
        revoked_at=batch.revoked_at,
        total=len(codes),
        open=counts["open"],
        handed_out=counts["handed_out"],
        redeemed=counts["redeemed"],
        revoked=counts["revoked"],
        expired=counts["expired"],
        codes=codes,
    )


@admin_router.get(
    "/overview",
    response_model=ProOverviewView,
    operation_id="getProOverview",
    responses=problem_responses(401, 403, 404),
)
def get_pro_overview(_: ProOperator, session: DbSession) -> ProOverviewView:
    """Pro figures, Google Play states, running gifts and the gift code batches.

    Aggregates only: no names and no codes.
    """
    at = clock.now()
    figures = pro_overview.overview(session, at)
    return ProOverviewView(
        spaces_total=figures.spaces_total,
        spaces_premium=figures.spaces_premium,
        premium_by_play=figures.premium_by_play,
        premium_by_gift=figures.premium_by_gift,
        play=ProPlayStatesView(
            active=figures.play.active,
            cancelled_running=figures.play.cancelled_running,
            payment_problem=figures.play.payment_problem,
            ended_30d=figures.play.ended_30d,
        ),
        cancellations_30d=figures.cancellations_30d,
        running_gifts=[
            RunningGiftView(
                space_id=gift.space_id,
                origin=gift.origin,
                batch_note=gift.batch_note,
                effective_until=gift.effective_until,
            )
            for gift in figures.running_gifts
        ],
        running_gifts_total=figures.running_gifts_total,
        batches=[_summary_view(summary) for summary in service.list_batches(session, at)],
    )


@admin_router.post(
    "/gift-code-batches",
    response_model=GiftCodeBatchView,
    status_code=201,
    operation_id="createGiftCodeBatch",
    responses=problem_responses(401, 403, 404, 422),
)
def create_gift_code_batch(
    body: GiftCodeBatchCreate, admin: ProOperator, session: DbSession
) -> GiftCodeBatchView:
    """Create a batch of fresh codes and return it with the plain codes."""
    batch = service.create_batch(
        session,
        actor_id=admin.id,
        count=body.count,
        duration_months=body.duration_months,
        redeemable_until=body.redeemable_until,
        note=body.note,
    )
    return _batch_view(session, batch, clock.now())


@admin_router.get(
    "/gift-code-batches/{batchId}",
    response_model=GiftCodeBatchView,
    operation_id="getGiftCodeBatch",
    responses=problem_responses(401, 403, 404, 422),
)
def get_gift_code_batch(
    batch_id_text: BatchIdPath, _: ProOperator, session: DbSession
) -> GiftCodeBatchView:
    """One batch with each code's state; a redeemed code names the Space by its id."""
    batch = service.get_batch(session, _batch_id(batch_id_text))
    return _batch_view(session, batch, clock.now())


@admin_router.post(
    "/gift-code-batches/{batchId}/revoke",
    response_model=GiftCodeBatchView,
    operation_id="revokeGiftCodeBatch",
    responses=problem_responses(401, 403, 404, 422),
)
def revoke_gift_code_batch(
    batch_id_text: BatchIdPath, admin: ProOperator, session: DbSession
) -> GiftCodeBatchView:
    """Revoke every unredeemed code of the batch; redeemed codes and their grants stay."""
    batch = service.revoke_batch(session, _batch_id(batch_id_text), admin.id)
    return _batch_view(session, batch, clock.now())


@admin_router.put(
    "/gift-codes/{codeId}/handed-out",
    response_model=GiftCodeBatchView,
    operation_id="setGiftCodeHandedOut",
    responses=problem_responses(401, 403, 404, 422),
)
def set_gift_code_handed_out(
    code_id_text: CodeIdPath,
    body: GiftCodeHandedOutUpdate,
    _: ProOperator,
    session: DbSession,
) -> GiftCodeBatchView:
    """Mark or unmark an open code as passed on; returns the code's updated batch."""
    code = service.set_handed_out(session, _code_id(code_id_text), body.handed_out)
    return _batch_view(session, service.get_batch(session, code.batch_id), clock.now())


@admin_router.post(
    "/gift-codes/{codeId}/revoke",
    response_model=GiftCodeBatchView,
    operation_id="revokeGiftCode",
    responses=problem_responses(401, 403, 404, 422),
)
def revoke_gift_code(
    code_id_text: CodeIdPath, admin: ProOperator, session: DbSession
) -> GiftCodeBatchView:
    """Revoke one unredeemed code; returns the code's updated batch."""
    code = service.revoke_code(session, _code_id(code_id_text), admin.id)
    return _batch_view(session, service.get_batch(session, code.batch_id), clock.now())


@router.post(
    "/spaces/{spaceId}/gift-codes/redeem",
    response_model=GiftCodeRedemptionView,
    operation_id="redeemGiftCode",
    responses=problem_responses(401, 404, 409, 422, 429),
)
def redeem_gift_code(
    member: RedeemingMember,
    session: DbSession,
    response: Response,
    body: GiftCodeRedeemRequest,
) -> GiftCodeRedemptionView:
    """Redeem a gift code for the Space; any member may, also before the partner joined.

    Problems: ``GIFT_CODE_INVALID`` (unknown, malformed, revoked or expired),
    ``GIFT_CODE_USED``, ``GIFT_CODE_SUBSCRIPTION_ACTIVE`` and
    ``GIFT_CODE_UNLIMITED`` (the code stays unused), ``RATE_LIMITED``. Every
    attempt counts against the limits, also a refused or successful one.
    """
    response.headers["Cache-Control"] = NO_STORE
    result = redemption.redeem(
        session,
        space_id=member.space_id,
        account_id=member.account.id,
        raw_code=body.code,
        at=clock.now(),
    )
    return GiftCodeRedemptionView(effective_until=result.effective_until, extended=result.extended)
