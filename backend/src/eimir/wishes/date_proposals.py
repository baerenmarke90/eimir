"""Offer a specific appointment for a shared Wish and resolve it with a partner."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.core import clock
from eimir.core.errors import ConflictError, NotFoundError, ValidationError
from eimir.core.ids import new_id
from eimir.create_receipts import service as create_receipts
from eimir.create_receipts.models import CreateReceiptResourceType
from eimir.domain.events import DomainEvent, EventType, PublicEventPayload
from eimir.identity import effects as account_effects
from eimir.identity.models import Account
from eimir.outbox import service as outbox
from eimir.plans import service as plans
from eimir.relationship import service as relationship
from eimir.relationship.models import Membership, MembershipStatus
from eimir.wishes import concealment
from eimir.wishes import service as wishes
from eimir.wishes.models import Wish, WishDateProposal, WishStatus

DATE_PROPOSAL_CHANGED = "WISH_DATE_PROPOSAL_CHANGED"
DATE_PROPOSAL_PARTNER_REQUIRED = "WISH_DATE_PROPOSAL_PARTNER_REQUIRED"
DATE_PROPOSAL_FUTURE_REQUIRED = "WISH_DATE_PROPOSAL_FUTURE_REQUIRED"
DATE_PROPOSAL_DIFFERENT_TIME_REQUIRED = "WISH_DATE_PROPOSAL_DIFFERENT_TIME_REQUIRED"
_RECEIPT_TYPE = CreateReceiptResourceType.WISH_DATE_PROPOSAL.value


@dataclass(frozen=True)
class ProposalState:
    can_propose: bool
    proposal: WishDateProposal | None


def _active_accounts(session: Session, space_id: UUID) -> set[UUID]:
    return set(
        session.scalars(
            select(Membership.account_id)
            .join(Account, Account.id == Membership.account_id)
            .where(
                Membership.space_id == space_id,
                Membership.status == MembershipStatus.ACTIVE.value,
                Account.disabled_at.is_(None),
            )
        )
    )


def _partner(session: Session, context: AuthorizationContext) -> UUID | None:
    accounts = _active_accounts(session, context.space_id)
    if context.account_id not in accounts:
        raise NotFoundError("Space not found.", relationship.SpaceErrorCode.NOT_FOUND)
    return next(iter(accounts - {context.account_id})) if len(accounts) == 2 else None


def _current(session: Session, wish: Wish) -> WishDateProposal | None:
    return session.scalar(
        select(WishDateProposal)
        .where(WishDateProposal.wish_id == wish.id, WishDateProposal.space_id == wish.space_id)
        .execution_options(populate_existing=True)
    )


def _live(proposal: WishDateProposal, accounts: set[UUID]) -> bool:
    return (
        proposal.accepted_plan_id is None
        and proposal.planned_start > clock.now()
        and {proposal.proposed_by, proposal.recipient_id} == accounts
    )


def current_for_notice(
    session: Session, *, space_id: UUID, wish_id: UUID, proposal_id: UUID
) -> WishDateProposal | None:
    """Resolve a pending notification reference without replaying replaced proposals."""
    proposal = session.scalar(
        select(WishDateProposal)
        .join(Wish, (Wish.id == WishDateProposal.wish_id) & (Wish.space_id == space_id))
        .where(
            Wish.status == WishStatus.OPEN.value,
            WishDateProposal.space_id == space_id,
            WishDateProposal.wish_id == wish_id,
            WishDateProposal.id == proposal_id,
        )
        .execution_options(populate_existing=True)
    )
    if proposal is not None and _live(proposal, _active_accounts(session, space_id)):
        return proposal
    return None


def get_state(session: Session, context: AuthorizationContext, wish_id: str) -> ProposalState:
    wish = wishes.get_wish(session, context, wish_id)
    if wish.status != WishStatus.OPEN.value:
        return ProposalState(False, None)
    partner_id = _partner(session, context)
    if partner_id is None:
        return ProposalState(False, None)
    proposal = _current(session, wish)
    if proposal is not None and _live(proposal, {context.account_id, partner_id}):
        return ProposalState(True, proposal)
    return ProposalState(True, None)


def _lock_context(
    session: Session, context: AuthorizationContext, wish_id: str
) -> tuple[Wish, UUID, WishDateProposal | None]:
    observed_wish = wishes.get_wish(session, context, wish_id)
    # Match partner Push delivery and account deletion: ordered Accounts before
    # the Space or Wish. Proposal/receipt and Plan writes also take Account
    # foreign-key locks.
    partner_id = _partner(session, context)
    if (
        partner_id is None
        or account_effects.lock_enabled_accounts(session, {context.account_id, partner_id}) is None
    ):
        raise ConflictError("A date proposal needs both partners.", DATE_PROPOSAL_PARTNER_REQUIRED)
    relationship.lock_space(session, context.space_id)
    wish = wishes.lock(session, context, observed_wish.id)
    if _partner(session, context) != partner_id:
        raise ConflictError("A date proposal needs both partners.", DATE_PROPOSAL_PARTNER_REQUIRED)
    return wish, partner_id, _current(session, wish)


def _changed() -> ConflictError:
    return ConflictError("This Wish date proposal has changed.", DATE_PROPOSAL_CHANGED)


def _record(
    session: Session,
    proposal: WishDateProposal,
    *,
    actor_id: UUID,
    recipient_id: UUID,
    event_type: EventType,
) -> None:
    plan_id = proposal.accepted_plan_id
    outbox.record(
        session,
        DomainEvent(
            type=event_type,
            actor_id=actor_id,
            space_id=proposal.space_id,
            subject_type="wish" if plan_id is None else "plan",
            subject_id=proposal.wish_id if plan_id is None else plan_id,
            payload=PublicEventPayload(
                recipient_id=recipient_id,
                occurrence_id=proposal.id,
                due_at=proposal.planned_start,
            ),
        ),
    )


def propose(
    session: Session,
    context: AuthorizationContext,
    wish_id: str,
    *,
    planned_start: datetime,
    client_request_id: UUID,
    counter_against: UUID | None = None,
) -> ProposalState:
    wish, partner_id, proposal = _lock_context(session, context, wish_id)
    if wish.status != WishStatus.OPEN.value:
        raise _changed()
    concealment.ensure_visible(session, context, wish.id)
    is_counter = counter_against is not None
    planned_start = clock.ensure_utc(planned_start)
    accounts = {context.account_id, partner_id}
    fingerprint = create_receipts.fingerprint(
        _RECEIPT_TYPE,
        {
            "wish_id": str(wish.id),
            "planned_start": planned_start.isoformat(),
            "counter_against": str(counter_against) if counter_against else None,
        },
    )
    receipt_id = create_receipts.claim(
        session,
        context,
        resource_type=_RECEIPT_TYPE,
        key=client_request_id,
        request_fingerprint=fingerprint,
    )
    if receipt_id is None:
        original_id = create_receipts.resolve(
            session,
            context,
            resource_type=_RECEIPT_TYPE,
            key=client_request_id,
            request_fingerprint=fingerprint,
        )
        if proposal is not None and proposal.id == original_id and _live(proposal, accounts):
            return ProposalState(True, proposal)
        raise _changed()

    if proposal is not None and _live(proposal, accounts):
        if proposal.id != counter_against or proposal.recipient_id != context.account_id:
            raise _changed()
        if proposal.planned_start == planned_start:
            raise ValidationError(
                "Choose a different time for a counterproposal.",
                DATE_PROPOSAL_DIFFERENT_TIME_REQUIRED,
            )
    elif is_counter:
        raise _changed()
    if planned_start <= clock.now():
        raise ValidationError("Choose a future appointment.", DATE_PROPOSAL_FUTURE_REQUIRED)

    if proposal is None:
        proposal = WishDateProposal(wish_id=wish.id, space_id=wish.space_id)
        session.add(proposal)
    proposal.id = new_id()
    proposal.proposed_by = context.account_id
    proposal.recipient_id = partner_id
    proposal.planned_start = planned_start
    proposal.counter = is_counter
    _record(
        session,
        proposal,
        actor_id=context.account_id,
        recipient_id=partner_id,
        event_type=EventType.WISH_DATE_COUNTERED if is_counter else EventType.WISH_DATE_PROPOSED,
    )
    session.flush()
    create_receipts.attach(session, receipt_id, proposal.id)
    return ProposalState(True, proposal)


def accept(
    session: Session, context: AuthorizationContext, wish_id: str, proposal_id: UUID
) -> UUID:
    wish, partner_id, proposal = _lock_context(session, context, wish_id)
    if (
        proposal is None
        or proposal.id != proposal_id
        or proposal.recipient_id != context.account_id
        or proposal.proposed_by != partner_id
    ):
        raise _changed()
    if proposal.accepted_plan_id is not None:
        return proposal.accepted_plan_id
    if wish.status != WishStatus.OPEN.value or proposal.planned_start <= clock.now():
        raise _changed()

    result = plans.convert_wish_to_plan(
        session,
        context,
        wish.id,
        expected_version=wish.version,
        title=None,
        description=wish.payload.description,
        place_id=None,
        planned_start=proposal.planned_start,
        accepted_proposal_id=proposal.id,
    )
    proposal.accepted_plan_id = result.plan.id
    _record(
        session,
        proposal,
        actor_id=context.account_id,
        recipient_id=partner_id,
        event_type=EventType.WISH_DATE_ACCEPTED,
    )
    session.flush()
    return result.plan.id


def dismiss(
    session: Session,
    context: AuthorizationContext,
    wish_id: str,
    proposal_id: UUID,
    *,
    decline: bool,
) -> None:
    wish, partner_id, proposal = _lock_context(session, context, wish_id)
    if (
        wish.status != WishStatus.OPEN.value
        or proposal is None
        or proposal.id != proposal_id
        or not _live(proposal, {context.account_id, partner_id})
    ):
        raise _changed()
    expected_actor = proposal.recipient_id if decline else proposal.proposed_by
    if expected_actor != context.account_id:
        raise _changed()
    session.delete(proposal)
    session.flush()


def purge_space(session: Session, space_id: UUID) -> None:
    """End transient appointment negotiations when either partner leaves."""
    session.execute(delete(WishDateProposal).where(WishDateProposal.space_id == space_id))
