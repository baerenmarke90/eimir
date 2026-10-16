"""Read and write the SpaceProfile.

Relationship-related Space attributes: start date, whether shared time is
shown, and in which form.

Writes use optimistic concurrency exclusively. Two partners often edit the
same profile from their phones in short succession. Without a version check,
the second write would silently overwrite the first. The conflict must be
surfaced to the person rather than hidden.
"""

from __future__ import annotations

from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from eimir.core.errors import ConflictError, ErrorCode, NotFoundError, ValidationError
from eimir.relationship.models import DurationDisplayMode, Space, SpaceProfile
from eimir.relationship.service import SpaceErrorCode
from eimir.reminders import runtime as reminder_runtime

EARLIEST_RELATIONSHIP_START = date(1900, 1, 1)
"""Lower bound for a relationship start date.

This is not a domain prohibition but a typo filter. A shifted year would
otherwise produce six-digit counts of "shared days".
"""


class SpaceProfileErrorCode:
    START_IN_FUTURE = "RELATIONSHIP_START_IN_FUTURE"
    START_TOO_EARLY = "RELATIONSHIP_START_TOO_EARLY"


def load(session: Session, space_id: UUID) -> SpaceProfile | None:
    """Load a Space profile without creating it.

    Deliberately scope by `space_id` rather than exposing lookup by profile ID:
    there is no data access based only on a resource ID.
    """
    return session.execute(
        select(SpaceProfile).where(SpaceProfile.space_id == space_id)
    ).scalar_one_or_none()


def _locked_profile(session: Session, space_id: UUID) -> SpaceProfile:
    """Load the profile for writing and serialize concurrent writers.

    The Space row is the serialization point. A second writer waits here,
    then reads the already written state and therefore observes a higher
    version. The 409 is deterministic rather than timing-dependent.

    If the profile is missing, create it. `create_space` normally creates one;
    a Space without a profile is legacy state, not a reason to reject an
    update.
    """
    space = session.execute(
        select(Space).where(Space.id == space_id).with_for_update()
    ).scalar_one_or_none()
    if space is None:
        raise NotFoundError("Space not found.", SpaceErrorCode.NOT_FOUND)

    profile = session.execute(
        select(SpaceProfile)
        .where(SpaceProfile.space_id == space_id)
        .execution_options(populate_existing=True)
    ).scalar_one_or_none()

    if profile is None:
        profile = SpaceProfile(space_id=space_id)
        session.add(profile)
        session.flush()

    return profile


def _validate_start(started_on: date | None, today: date) -> None:
    if started_on is None:
        return
    if started_on > today:
        raise ValidationError(
            "The relationship cannot start in the future.",
            SpaceProfileErrorCode.START_IN_FUTURE,
        )
    if started_on < EARLIEST_RELATIONSHIP_START:
        raise ValidationError(
            "The relationship start date is implausibly early.",
            SpaceProfileErrorCode.START_TOO_EARLY,
        )


def update(
    session: Session,
    space_id: UUID,
    *,
    expected_version: int,
    relationship_started_on: date | None,
    show_relationship_duration: bool,
    duration_display_mode: DurationDisplayMode,
    today: date,
) -> SpaceProfile:
    """Replace the full profile when the expected version still matches.

    `expected_version` is the state the caller read. A mismatch means the
    partner wrote in the meantime: return 409 and mutate nothing.

    `today` is the calendar day in the caller's timezone. It determines
    whether a date lies in the future; otherwise a start date of "today" west
    of UTC could become invalid depending on the time of day.
    """
    profile = _locked_profile(session, space_id)

    if profile.version != expected_version:
        raise ConflictError(
            "The space profile was changed by someone else.",
            ErrorCode.VERSION_CONFLICT,
        )

    start_changed = profile.relationship_started_on != relationship_started_on
    _validate_start(relationship_started_on, today)

    profile.relationship_started_on = relationship_started_on
    profile.show_relationship_duration = show_relationship_duration
    profile.duration_display_mode = duration_display_mode.value

    try:
        session.flush()
    except StaleDataError as stale:
        # Independent second line of defense. The version column participates
        # in the UPDATE; even if the serialization above were ever bypassed,
        # this still produces the same conflict rather than a lost update.
        # Rollback belongs at the request transaction boundary, not here: a
        # partial rollback inside this operation would also undo preceding
        # work that is part of the same transaction.
        raise ConflictError(
            "The space profile was changed by someone else.",
            ErrorCode.VERSION_CONFLICT,
        ) from stale

    if start_changed:
        reminder_runtime.reconcile_space(session, space_id)
    return profile
