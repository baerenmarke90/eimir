"""Source checks for explicit shared-Wish date notices."""

from datetime import datetime
from typing import Any

from sqlalchemy import String, and_, cast, func, or_, select
from sqlalchemy.orm import Session

from eimir.core import clock
from eimir.engagement.models import (
    WISH_DATE_NOTICE_KINDS,
    EngagementTarget,
    Notification,
    NotificationKind,
)
from eimir.identity import effects as account_effects
from eimir.identity.models import Account
from eimir.outbox.models import OutboxEvent
from eimir.plans.models import Plan, PlanStatus
from eimir.relationship.models import Membership, MembershipStatus, Space
from eimir.wishes import date_proposals
from eimir.wishes.models import Wish, WishDateProposal, WishStatus

_PENDING_KINDS = WISH_DATE_NOTICE_KINDS - {NotificationKind.WISH_DATE_ACCEPTED}


def event_is_current(session: Session, event: OutboxEvent) -> bool:
    proposal_id = event.payload.occurrence_id
    due_at = event.payload.due_at
    if not proposal_id or not due_at or due_at <= clock.now() or not event.actor_id:
        return False
    if event.event_type in _PENDING_KINDS and event.subject_type == "wish":
        proposal = date_proposals.current_for_notice(
            session, space_id=event.space_id, wish_id=event.subject_id, proposal_id=proposal_id
        )
        return bool(
            proposal
            and proposal.proposed_by == event.actor_id
            and proposal.recipient_id == event.payload.recipient_id
            and proposal.planned_start == due_at
            and proposal.counter == (event.event_type == NotificationKind.WISH_DATE_COUNTERED)
        )
    if event.event_type != NotificationKind.WISH_DATE_ACCEPTED or event.subject_type != "plan":
        return False
    return (
        session.scalar(
            select(WishDateProposal.id)
            .join(Plan, Plan.id == WishDateProposal.accepted_plan_id)
            .where(
                WishDateProposal.id == proposal_id,
                WishDateProposal.space_id == event.space_id,
                WishDateProposal.recipient_id == event.actor_id,
                WishDateProposal.proposed_by == event.payload.recipient_id,
                WishDateProposal.planned_start == due_at,
                Plan.id == event.subject_id,
                Plan.space_id == event.space_id,
                Plan.planned_start == due_at,
                Plan.status == PlanStatus.PLANNED.value,
            )
        )
        is not None
    )


def current_predicate() -> Any:
    """Do not count or open a notice after its referenced revision is stale."""
    occurrence_key = func.jsonb_extract_path_text(OutboxEvent.payload, "occurrence_id")
    pending = (
        select(WishDateProposal.id)
        .join(Wish, Wish.id == WishDateProposal.wish_id)
        .join(
            OutboxEvent,
            cast(WishDateProposal.id, String) == occurrence_key,
        )
        .where(
            OutboxEvent.id == Notification.source_event_id,
            OutboxEvent.event_type == Notification.kind,
            OutboxEvent.subject_type == "wish",
            OutboxEvent.subject_id == Wish.id,
            OutboxEvent.space_id == Notification.space_id,
            Notification.target_type == EngagementTarget.WISH.value,
            Notification.target_id == Wish.id,
            WishDateProposal.space_id == Notification.space_id,
            WishDateProposal.proposed_by == Notification.actor_id,
            WishDateProposal.recipient_id == Notification.recipient_account_id,
            WishDateProposal.planned_start == Notification.expires_at,
            WishDateProposal.accepted_plan_id.is_(None),
            Wish.status == WishStatus.OPEN.value,
        )
        .correlate(Notification)
        .exists()
    )
    accepted = (
        select(WishDateProposal.id)
        .join(Plan, Plan.id == WishDateProposal.accepted_plan_id)
        .join(OutboxEvent, cast(WishDateProposal.id, String) == occurrence_key)
        .where(
            OutboxEvent.id == Notification.source_event_id,
            OutboxEvent.event_type == Notification.kind,
            OutboxEvent.subject_type == "plan",
            OutboxEvent.subject_id == Plan.id,
            OutboxEvent.space_id == Notification.space_id,
            Notification.target_type == EngagementTarget.PLAN.value,
            Plan.id == Notification.target_id,
            Plan.space_id == Notification.space_id,
            Plan.planned_start == Notification.expires_at,
            Plan.status == PlanStatus.PLANNED.value,
            WishDateProposal.space_id == Notification.space_id,
            WishDateProposal.recipient_id == Notification.actor_id,
            WishDateProposal.proposed_by == Notification.recipient_account_id,
            WishDateProposal.planned_start == Notification.expires_at,
        )
        .correlate(Notification)
        .exists()
    )
    current_actor = (
        select(Account.id)
        .join(Membership, Membership.account_id == Account.id)
        .where(
            Account.id == Notification.actor_id,
            Account.disabled_at.is_(None),
            Membership.space_id == Notification.space_id,
            Membership.status == MembershipStatus.ACTIVE.value,
        )
        .correlate(Notification)
        .exists()
    )
    return or_(
        Notification.kind.not_in(tuple(WISH_DATE_NOTICE_KINDS)),
        and_(
            current_actor,
            or_(
                and_(Notification.kind.in_(tuple(_PENDING_KINDS)), pending),
                and_(Notification.kind == NotificationKind.WISH_DATE_ACCEPTED.value, accepted),
            ),
        ),
    )


def lock_delivery_target(session: Session, notice: Notification) -> bool:
    """Serialize detail handoff with departure and changes to the linked source."""
    if notice.actor_id is None or notice.target_id is None:
        return False
    locked_space = session.scalar(
        select(Space.id).where(Space.id == notice.space_id).with_for_update(read=True, nowait=True)
    )
    if locked_space is None or not all(
        account_effects.has_active_membership(
            session, account_id=account_id, space_id=notice.space_id
        )
        for account_id in (notice.actor_id, notice.recipient_account_id)
    ):
        return False
    target_type = Plan if notice.kind == NotificationKind.WISH_DATE_ACCEPTED else Wish
    return (
        session.scalar(
            select(target_type.id)
            .where(target_type.id == notice.target_id, target_type.space_id == notice.space_id)
            .with_for_update(read=True, nowait=True)
        )
        is not None
    )


def appointment_start(notice: Notification, *, concealed: bool = False) -> datetime | None:
    """These kinds expire at their exact, already-authorized appointment time."""
    return notice.expires_at if not concealed and notice.kind in WISH_DATE_NOTICE_KINDS else None
