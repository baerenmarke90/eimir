"""Send a shared list to the partner (#1907 E2).

A deliberate gesture: the partner gets one notification and the list is added at
the end of their personal "pinned list" Dashboard selection. It never reorders,
removes or hides anything of theirs, and it never changes the list itself.
"""

from __future__ import annotations

from datetime import timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.collections import service
from eimir.core import clock
from eimir.core.errors import ConflictError, NotFoundError
from eimir.dashboard import preferences as dashboard_preferences
from eimir.domain.events import DomainEvent, EventType, PublicEventPayload
from eimir.identity.models import Account
from eimir.outbox import service as outbox_service
from eimir.outbox.models import OutboxEvent
from eimir.relationship import service as relationship
from eimir.relationship.models import Membership, MembershipStatus

# One notification per sender and list in this window; the list is still added.
RESEND_PACING = timedelta(minutes=30)
NO_PARTNER_CODE = "COLLECTION_NO_PARTNER"


def _partner_ids(session: Session, context: AuthorizationContext) -> list[UUID]:
    members = list(
        session.scalars(
            select(Membership.account_id)
            .join(Account, Account.id == Membership.account_id)
            .where(
                Membership.space_id == context.space_id,
                Membership.status == MembershipStatus.ACTIVE.value,
                Account.disabled_at.is_(None),
            )
            .order_by(Membership.id)
        )
    )
    if context.account_id not in members:
        # The guard owns the unknown-Space answer; this only protects direct callers.
        raise NotFoundError("Space not found.", relationship.SpaceErrorCode.NOT_FOUND)
    return [account_id for account_id in members if account_id != context.account_id]


def _add_to_wir(session: Session, *, account_id: UUID, space_id: UUID, collection_id: UUID) -> None:
    """Append to the partner's pinned lists; their order, visibility and limit stay theirs."""
    state = next(
        state
        for state in dashboard_preferences.read_module_preferences(
            session, account_id=account_id, space_id=space_id
        )
        if state.key is dashboard_preferences.DashboardModuleKey.PINNED_COLLECTION
    )
    current = list(state.selected_collection_ids)
    if not current and state.selected_collection_id is not None:
        current = [state.selected_collection_id]
    if collection_id in current:
        return
    if len(current) >= dashboard_preferences.MAX_SELECTED_COLLECTIONS:
        # The technical bound wins over the gesture; the notification still opens the list.
        return
    dashboard_preferences.set_module_preference(
        session,
        account_id=account_id,
        space_id=space_id,
        module_key=dashboard_preferences.DashboardModuleKey.PINNED_COLLECTION.value,
        visible=None,
        item_limit=None,
        selected_collection_ids=[*current, collection_id],
        selected_collection_ids_changed=True,
    )


def send_to_partner(session: Session, context: AuthorizationContext, collection_id: str) -> None:
    collection = service.get_collection(session, context, collection_id)
    partners = _partner_ids(session, context)
    if not partners:
        raise ConflictError("There is no partner to send this list to.", NO_PARTNER_CODE)
    now = clock.now()
    for partner_id in partners:
        _add_to_wir(
            session,
            account_id=partner_id,
            space_id=context.space_id,
            collection_id=collection.id,
        )
        # Pending and projected events both count, so a quick second tap stays silent.
        recent = session.scalar(
            select(OutboxEvent.id).where(
                OutboxEvent.space_id == context.space_id,
                OutboxEvent.event_type == EventType.COLLECTION_SENT.value,
                OutboxEvent.subject_id == collection.id,
                OutboxEvent.actor_id == context.account_id,
                OutboxEvent.created_at > now - RESEND_PACING,
            )
        )
        if recent is not None:
            continue
        outbox_service.record(
            session,
            DomainEvent(
                type=EventType.COLLECTION_SENT,
                space_id=context.space_id,
                actor_id=context.account_id,
                subject_type="collection",
                subject_id=collection.id,
                resource_version=collection.version,
                payload=PublicEventPayload(recipient_id=partner_id),
            ),
        )
