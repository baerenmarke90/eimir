"""Herzversteck rules: hide, search under fog, find, keep, expire (#1907 H3).

The server owns the secret. A seeker's tap is evaluated here and only a coarse
warmth answer comes back, so the heart position is never serialized for the
seeker before the round is FOUND. The photo travels through the ordinary
attachment pipeline (sealed on Android, metadata stripped); this module only
binds it to the round and deletes it on the retention schedule.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.attachments import binding
from eimir.attachments import service as attachments
from eimir.attachments.models import Attachment, MediaType
from eimir.authorization import AuthorizationContext
from eimir.core import clock
from eimir.core.errors import ConflictError, NotFoundError, ValidationError
from eimir.domain.events import DomainEvent, EventType, PublicEventPayload
from eimir.memories.models import Memory
from eimir.outbox import service as outbox
from eimir.relationship.models import Membership, MembershipStatus
from eimir_pro.heart_hunt.models import HeartHuntRound, HeartRoundState

FOUND_RETENTION = timedelta(days=14)
"""A found round's photo is deleted this long after it was found (Product Owner)."""
UNFOUND_EXPIRY = timedelta(days=30)
"""Bounded lifetime of a round nobody found; proposed value, confirmed with the PO."""
MAX_STORED_TAPS = 150
"""Tap marks kept so a reopened round restores its clearings; further taps still count."""

SCALE = 1000
FOUND_RADIUS = 0.09
WARMTH_REACH = 0.7
VERTICAL_WEIGHT = 1.25
"""The photo frame is 4:5, so a vertical step counts 1.25 horizontal steps."""

PARTNER_NOT_AVAILABLE = "PARTNER_NOT_AVAILABLE"
ROUND_NOT_FOUND = "HEART_ROUND_NOT_FOUND"
ROUND_OPEN = "HEART_ROUND_OPEN"


@dataclass(frozen=True)
class TapOutcome:
    level: int
    meter: int
    found: bool
    round: HeartHuntRound


def absent() -> NotFoundError:
    return NotFoundError("Round not found.", ROUND_NOT_FOUND)


def _partner_of(session: Session, context: AuthorizationContext) -> UUID:
    partner = session.execute(
        select(Membership.account_id)
        .where(
            Membership.space_id == context.space_id,
            Membership.status == MembershipStatus.ACTIVE.value,
            Membership.account_id != context.account_id,
        )
        .order_by(Membership.account_id)
        .limit(1)
    ).scalar_one_or_none()
    if partner is None:
        raise NotFoundError("Partner not available.", PARTNER_NOT_AVAILABLE)
    return partner


def warmth(tap_x: int, tap_y: int, heart_x: int, heart_y: int) -> tuple[int, int, bool]:
    """Return (word level 0..3, meter percent in steps of 5, found) for one tap.

    The meter is deliberately coarse so repeated taps cannot be triangulated to
    a pixel; the words and the found radius are the game's own grammar.
    """
    dx = (tap_x - heart_x) / SCALE
    dy = (tap_y - heart_y) / SCALE * VERTICAL_WEIGHT
    distance = math.hypot(dx, dy)
    ratio = max(0.0, 1 - distance / WARMTH_REACH)
    level = 3 if ratio > 0.8 else 2 if ratio > 0.55 else 1 if ratio > 0.3 else 0
    meter = round(ratio * 20) * 5
    return level, meter, distance < FOUND_RADIUS


def _in_frame(value: int) -> bool:
    return 0 <= value <= SCALE


def create_round(
    session: Session,
    context: AuthorizationContext,
    *,
    request_id: UUID,
    attachment_id: UUID,
    heart_x: int,
    heart_y: int,
) -> HeartHuntRound:
    if not (_in_frame(heart_x) and _in_frame(heart_y)):
        raise ValidationError("The heart must lie inside the photo.", "HEART_OUT_OF_FRAME")
    # The hider's own Membership serializes concurrent sends of one hider.
    own = session.execute(
        select(Membership)
        .where(
            Membership.space_id == context.space_id,
            Membership.account_id == context.account_id,
            Membership.status == MembershipStatus.ACTIVE.value,
        )
        .with_for_update()
    ).scalar_one_or_none()
    if own is None:
        raise NotFoundError("Partner space not available.", PARTNER_NOT_AVAILABLE)
    previous = session.scalar(
        select(HeartHuntRound).where(
            HeartHuntRound.space_id == context.space_id,
            HeartHuntRound.hider_id == context.account_id,
            HeartHuntRound.request_id == request_id,
        )
    )
    if previous is not None:
        if previous.attachment_id != attachment_id:
            raise ConflictError("Request identity was already used.", "HEART_REQUEST_CONFLICT")
        return previous
    seeker_id = _partner_of(session, context)
    open_round = session.scalar(
        select(HeartHuntRound.id).where(
            HeartHuntRound.space_id == context.space_id,
            HeartHuntRound.hider_id == context.account_id,
            HeartHuntRound.state == HeartRoundState.HIDDEN.value,
        )
    )
    if open_round is not None:
        raise ConflictError("A heart of yours is still hidden.", ROUND_OPEN)

    locked = binding.lock_for_binding(session, [attachment_id])
    photo = binding.ensure_bindable(
        locked.get(attachment_id),
        space_id=context.space_id,
        account_id=context.account_id,
    )
    if photo.media_type != MediaType.IMAGE.value:
        raise ValidationError("Only a photo can hide a heart.", "HEART_PHOTO_REQUIRED")
    binding.ensure_unlinked(session, attachment_id)

    at = clock.now()
    heart_round = HeartHuntRound(
        space_id=context.space_id,
        hider_id=context.account_id,
        seeker_id=seeker_id,
        request_id=request_id,
        attachment_id=photo.id,
        heart_x=heart_x,
        heart_y=heart_y,
        state=HeartRoundState.HIDDEN.value,
        taps=[],
        tap_count=0,
        best_level=0,
        created_at=at,
        purge_after=at + UNFOUND_EXPIRY,
    )
    session.add(heart_round)
    session.flush()
    _record(session, context, heart_round, EventType.HEART_HUNT_HIDDEN, recipient_id=seeker_id)
    return heart_round


def _record(
    session: Session,
    context: AuthorizationContext,
    heart_round: HeartHuntRound,
    event: EventType,
    *,
    recipient_id: UUID,
) -> None:
    outbox.record(
        session,
        DomainEvent(
            type=event,
            space_id=context.space_id,
            actor_id=context.account_id,
            subject_type="heart_hunt_round",
            subject_id=heart_round.id,
            payload=PublicEventPayload(recipient_id=recipient_id),
        ),
    )


def _participant_round(
    session: Session,
    context: AuthorizationContext,
    round_id: UUID,
    *,
    lock: bool = False,
) -> HeartHuntRound:
    statement = select(HeartHuntRound).where(
        HeartHuntRound.id == round_id,
        HeartHuntRound.space_id == context.space_id,
        HeartHuntRound.purge_after > clock.now(),
        (HeartHuntRound.hider_id == context.account_id)
        | (HeartHuntRound.seeker_id == context.account_id),
    )
    if lock:
        statement = statement.with_for_update()
    heart_round = session.scalar(statement)
    if heart_round is None:
        raise absent()
    return heart_round


def list_rounds(
    session: Session, context: AuthorizationContext, *, limit: int = 6
) -> list[HeartHuntRound]:
    return list(
        session.scalars(
            select(HeartHuntRound)
            .where(
                HeartHuntRound.space_id == context.space_id,
                HeartHuntRound.purge_after > clock.now(),
                (HeartHuntRound.hider_id == context.account_id)
                | (HeartHuntRound.seeker_id == context.account_id),
            )
            .order_by(HeartHuntRound.created_at.desc(), HeartHuntRound.id.desc())
            .limit(limit)
        )
    )


def tap(
    session: Session,
    context: AuthorizationContext,
    round_id: UUID,
    *,
    x: int,
    y: int,
) -> TapOutcome:
    if not (_in_frame(x) and _in_frame(y)):
        raise ValidationError("The tap must lie inside the photo.", "HEART_TAP_OUT_OF_FRAME")
    heart_round = _participant_round(session, context, round_id, lock=True)
    if heart_round.seeker_id != context.account_id:
        # The hider never searches their own heart; absence keeps the oracle closed.
        raise absent()
    level, meter, found = warmth(x, y, heart_round.heart_x, heart_round.heart_y)
    if heart_round.state == HeartRoundState.FOUND.value:
        return TapOutcome(3, 100, True, heart_round)
    heart_round.tap_count += 1
    heart_round.best_level = max(heart_round.best_level, level)
    if len(heart_round.taps) < MAX_STORED_TAPS:
        heart_round.taps = [*heart_round.taps, [x, y]]
    if found:
        at = clock.now()
        heart_round.state = HeartRoundState.FOUND.value
        heart_round.found_at = at
        heart_round.best_level = 3
        heart_round.purge_after = at + FOUND_RETENTION
        session.flush()
        _record(
            session,
            context,
            heart_round,
            EventType.HEART_HUNT_FOUND,
            recipient_id=heart_round.hider_id,
        )
    session.flush()
    return TapOutcome(level, meter, found, heart_round)


def mark_kept(
    session: Session, context: AuthorizationContext, round_id: UUID, *, memory_id: UUID
) -> HeartHuntRound:
    """Record that a participant saved this round's photo as a shared Memory."""
    heart_round = _participant_round(session, context, round_id, lock=True)
    if heart_round.state != HeartRoundState.FOUND.value:
        raise ConflictError("Only a found heart can be kept.", "HEART_NOT_FOUND_YET")
    memory = session.scalar(
        select(Memory).where(Memory.id == memory_id, Memory.space_id == context.space_id)
    )
    if memory is None or memory.owner_id != context.account_id:
        raise NotFoundError("Moment not found.", "RESOURCE_NOT_FOUND")
    if heart_round.kept_memory_id is None:
        heart_round.kept_memory_id = memory.id
        session.flush()
    return heart_round


def can_read_photo(session: Session, context: AuthorizationContext, round_id: UUID) -> bool:
    """Read authorization of the round's photo: exactly the two participants."""
    return (
        session.scalar(
            select(HeartHuntRound.id).where(
                HeartHuntRound.id == round_id,
                HeartHuntRound.space_id == context.space_id,
                HeartHuntRound.purge_after > clock.now(),
                (HeartHuntRound.hider_id == context.account_id)
                | (HeartHuntRound.seeker_id == context.account_id),
            )
        )
        is not None
    )


def purge_due(session: Session, *, current_time: datetime | None = None, limit: int = 100) -> int:
    """Delete due rounds and hand their photos to the media cleanup (no bytes here)."""
    instant = current_time or clock.now()
    due = list(
        session.scalars(
            select(HeartHuntRound)
            .where(HeartHuntRound.purge_after <= instant)
            .order_by(HeartHuntRound.purge_after, HeartHuntRound.id)
            .limit(limit)
            .with_for_update(skip_locked=True)
        )
    )
    for heart_round in due:
        attachment_id = heart_round.attachment_id
        session.delete(heart_round)
        session.flush()
        if attachment_id is not None:
            attachment = session.get(Attachment, attachment_id, with_for_update=True)
            if attachment is not None:
                attachments.mark_for_deletion(session, attachment)
    session.flush()
    return len(due)


def view_state(heart_round: HeartHuntRound, account_id: UUID) -> dict[str, Any]:
    """Role-aware projection; the heart is revealed to the hider and after FOUND only."""
    hider = heart_round.hider_id == account_id
    found = heart_round.state == HeartRoundState.FOUND.value
    return {
        "role": "HIDER" if hider else "SEEKER",
        "reveal_heart": hider or found,
    }


__all__ = [
    "FOUND_RETENTION",
    "MAX_STORED_TAPS",
    "UNFOUND_EXPIRY",
    "TapOutcome",
    "create_round",
    "list_rounds",
    "mark_kept",
    "purge_due",
    "purge_space",
    "tap",
    "view_state",
    "warmth",
]


def purge_space(session: Session, space_id: UUID) -> None:
    """Delete every round of a Space and hand its photos to the media cleanup.

    Used when a partner leaves: a hidden photo must not outlive the pair.
    """
    rounds = list(
        session.scalars(
            select(HeartHuntRound).where(HeartHuntRound.space_id == space_id).with_for_update()
        )
    )
    for heart_round in rounds:
        attachment_id = heart_round.attachment_id
        session.delete(heart_round)
        session.flush()
        if attachment_id is not None:
            attachment = session.get(Attachment, attachment_id, with_for_update=True)
            if attachment is not None:
                attachments.mark_for_deletion(session, attachment)
    session.flush()
