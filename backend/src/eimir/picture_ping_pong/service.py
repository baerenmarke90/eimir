"""Authoritative turn order, bounded stroke validation and lifecycle.

The server owns whose turn it is. A hand-over appends one bounded batch of
strokes for the current drawer and passes the turn on; either partner may call
the picture finished early. There are no timers, streaks or penalties: an open
picture simply waits. Distance and location never reach this module.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from math import sin, tau
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, readable
from eimir.core.errors import ConflictError, ErrorCode, NotFoundError, ValidationError
from eimir.domain.events import DomainEvent, EventType, PublicEventPayload
from eimir.memories.models import Memory
from eimir.outbox import service as outbox_service
from eimir.picture_ping_pong.models import (
    GRID,
    MAX_STROKE_VALUES,
    MAX_STROKES_PER_TURN,
    MAX_TURNS,
    MIN_STROKE_VALUES,
    SEED_TURN,
    PicturePayload,
    PicturePingPong,
    PictureStatus,
    PictureStroke,
)
from eimir.relationship import service as relationship
from eimir.relationship.models import Membership, MembershipStatus

ALLOWED_COLOURS = frozenset({"PERSON", "INK", "SUN"})


@dataclass(frozen=True)
class StrokeInput:
    colour: str
    points: list[int]


def _unavailable(detail: str, code: str) -> ConflictError:
    return ConflictError(detail, code)


def _stale() -> ConflictError:
    return ConflictError(
        "The picture changed. Reload it before trying again.",
        ErrorCode.RESOURCE_VERSION_CONFLICT,
    )


def _members(session: Session, space_id: UUID) -> list[UUID]:
    return list(
        session.scalars(
            select(Membership.account_id)
            .where(
                Membership.space_id == space_id,
                Membership.status == MembershipStatus.ACTIVE.value,
            )
            .order_by(Membership.id)
        )
    )


def _partner_of(session: Session, context: AuthorizationContext) -> UUID:
    members = _members(session, context.space_id)
    others = [member for member in members if member != context.account_id]
    if context.account_id not in members or len(members) != 2 or len(others) != 1:
        raise _unavailable(
            "Picture ping-pong needs exactly two partners in the Space.",
            "PICTURE_PING_PONG_COUPLE_REQUIRED",
        )
    return others[0]


def get_picture(session: Session, context: AuthorizationContext) -> PicturePingPong | None:
    return session.scalar(
        select(PicturePingPong).where(PicturePingPong.space_id == context.space_id)
    )


def _seed_stroke() -> PictureStroke:
    """A random, gentle starting squiggle so nobody faces a blank page."""
    rng = random.Random()
    base = rng.randint(380, 620)
    amplitude = rng.randint(90, 190)
    frequency = rng.uniform(1.0, 2.2)
    phase = rng.uniform(0, tau)
    values: list[int] = []
    steps = 14
    for index in range(steps + 1):
        progress = index / steps
        x = int(140 + progress * 720)
        y = int(base + amplitude * sin(phase + progress * tau * frequency))
        values.extend((x, max(60, min(GRID - 60, y))))
    return PictureStroke(turn=SEED_TURN, author_id=None, colour="INK", points=values)


def start(session: Session, context: AuthorizationContext) -> PicturePingPong:
    """Open a new picture; the partner who opens it draws first."""
    relationship.lock_space(session, context.space_id)
    _partner_of(session, context)
    picture = get_picture(session, context)
    if picture is not None and picture.status == PictureStatus.DRAWING.value:
        raise _unavailable(
            "A picture is still open. Finish it before starting a new one.",
            "PICTURE_PING_PONG_ALREADY_OPEN",
        )
    payload = PicturePayload(strokes=[_seed_stroke()])
    if picture is None:
        picture = PicturePingPong(
            space_id=context.space_id,
            started_by=context.account_id,
            status=PictureStatus.DRAWING.value,
            drawer_id=context.account_id,
            turns_done=0,
            finished_early=False,
            payload=payload,
        )
        session.add(picture)
    else:
        picture.started_by = context.account_id
        picture.status = PictureStatus.DRAWING.value
        picture.drawer_id = context.account_id
        picture.turns_done = 0
        picture.finished_early = False
        picture.saved_memory_id = None
        picture.payload = payload
    session.flush()
    return picture


def validate_strokes(strokes: list[StrokeInput]) -> None:
    if not 1 <= len(strokes) <= MAX_STROKES_PER_TURN:
        raise ValidationError(
            f"A turn has one to {MAX_STROKES_PER_TURN} strokes.",
            ErrorCode.VALIDATION_FAILED,
        )
    for stroke in strokes:
        values = stroke.points
        if (
            stroke.colour not in ALLOWED_COLOURS
            or len(values) % 2 != 0
            or not MIN_STROKE_VALUES <= len(values) <= MAX_STROKE_VALUES
            or any(not 0 <= value <= GRID for value in values)
        ):
            raise ValidationError("A stroke is not valid.", ErrorCode.VALIDATION_FAILED)


def hand_over(
    session: Session,
    context: AuthorizationContext,
    *,
    expected_turns_done: int,
    strokes: list[StrokeInput],
) -> PicturePingPong:
    """Add the drawer's strokes and pass the picture on (or finish it)."""
    relationship.lock_space(session, context.space_id)
    partner = _partner_of(session, context)
    picture = get_picture(session, context)
    if picture is None or picture.turns_done != expected_turns_done:
        raise _stale()
    if picture.status != PictureStatus.DRAWING.value:
        raise _unavailable("The picture is finished.", "PICTURE_PING_PONG_FINISHED")
    if picture.drawer_id != context.account_id:
        raise _unavailable("It is not your turn.", "PICTURE_PING_PONG_NOT_YOUR_TURN")
    validate_strokes(strokes)
    turn = picture.turns_done + 1
    picture.payload = PicturePayload(
        strokes=[
            *picture.payload.strokes,
            *(
                PictureStroke(
                    turn=turn,
                    author_id=context.account_id,
                    colour=stroke.colour,  # type: ignore[arg-type]
                    points=list(stroke.points),
                )
                for stroke in strokes
            ),
        ]
    )
    picture.turns_done = turn
    if turn >= MAX_TURNS:
        picture.status = PictureStatus.FINISHED.value
        picture.drawer_id = None
    else:
        picture.drawer_id = partner
    session.flush()
    if picture.drawer_id is not None:
        outbox_service.record(
            session,
            DomainEvent(
                type=EventType.PICTURE_PING_PONG_TURN,
                space_id=context.space_id,
                actor_id=context.account_id,
                subject_type="picture_ping_pong",
                subject_id=picture.id,
                resource_version=picture.version,
                payload=PublicEventPayload(recipient_id=partner),
            ),
        )
    return picture


def finish(
    session: Session, context: AuthorizationContext, *, expected_turns_done: int
) -> PicturePingPong:
    """Either partner may call the picture finished once something was drawn."""
    relationship.lock_space(session, context.space_id)
    _partner_of(session, context)
    picture = get_picture(session, context)
    if picture is None or picture.turns_done != expected_turns_done:
        raise _stale()
    if picture.status != PictureStatus.DRAWING.value:
        raise _unavailable("The picture is finished.", "PICTURE_PING_PONG_FINISHED")
    if picture.turns_done < 1:
        raise _unavailable(
            "Draw at least one turn before finishing.", "PICTURE_PING_PONG_NOTHING_DRAWN"
        )
    picture.status = PictureStatus.FINISHED.value
    picture.drawer_id = None
    picture.finished_early = True
    session.flush()
    return picture


def mark_saved(
    session: Session, context: AuthorizationContext, *, memory_id: UUID
) -> PicturePingPong:
    """Remember that the finished picture lives in Momente (explicit save only)."""
    relationship.lock_space(session, context.space_id)
    _partner_of(session, context)
    picture = get_picture(session, context)
    if picture is None:
        raise NotFoundError("Picture not found.", "PICTURE_PING_PONG_NOT_FOUND")
    if picture.status != PictureStatus.FINISHED.value:
        raise _unavailable("The picture is not finished yet.", "PICTURE_PING_PONG_NOT_FINISHED")
    if picture.saved_memory_id is not None:
        raise _unavailable("The picture is already in Momente.", "PICTURE_PING_PONG_ALREADY_SAVED")
    found = session.scalar(
        readable(Memory, context).where(Memory.id == memory_id).with_only_columns(Memory.id)
    )
    if found is None:
        raise NotFoundError("Memory not found.", "PICTURE_PING_PONG_MEMORY_NOT_FOUND")
    picture.saved_memory_id = memory_id
    session.flush()
    return picture


def purge_space(session: Session, space_id: UUID) -> None:
    """Drop the temporary picture when the couple changes; Memories stay."""
    session.execute(delete(PicturePingPong).where(PicturePingPong.space_id == space_id))
    session.flush()
