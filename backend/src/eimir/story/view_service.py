"""Write-side behavior for privacy-minimized intentional Story views."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, cast
from uuid import UUID

from sqlalchemy import case, delete, func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

if TYPE_CHECKING:
    from sqlalchemy import CursorResult

from eimir.authorization import AuthorizationContext
from eimir.core import clock
from eimir.story import service as story_service
from eimir.story.service import StoryKind
from eimir.story.view_models import StoryItemViewAggregate

DISTINCT_VIEW_DAY_CAP = 5
RETENTION_MONTHS = 12


def record_intentional_view(
    session: Session,
    context: AuthorizationContext,
    *,
    account_timezone: str,
    kind: StoryKind,
    item_id: UUID | str,
    viewed_at: datetime | None = None,
) -> None:
    """Record one authorized detail presentation without creating an event history.

    The Story source row is share-locked through the canonical shared-Story
    predicate before the aggregate write. A concurrent delete or HeartMoment
    privacy transition therefore wins wholly before or wholly after this write.
    """
    identifier = story_service.require_shared_story_item(
        session,
        context,
        kind=kind,
        item_id=item_id,
    )
    instant = clock.ensure_utc(viewed_at if viewed_at is not None else clock.now())
    local_date = clock.today_in(account_timezone, at=instant)
    initial = insert(StoryItemViewAggregate).values(
        space_id=context.space_id,
        viewer_account_id=context.account_id,
        item_kind=kind.value,
        item_id=identifier,
        distinct_view_days_capped=1,
        last_counted_local_date=local_date,
        last_viewed_at=instant,
    )
    later_local_day = (
        initial.excluded.last_counted_local_date > StoryItemViewAggregate.last_counted_local_date
    )
    statement = initial.on_conflict_do_update(
        index_elements=[
            StoryItemViewAggregate.space_id,
            StoryItemViewAggregate.viewer_account_id,
            StoryItemViewAggregate.item_kind,
            StoryItemViewAggregate.item_id,
        ],
        set_={
            "distinct_view_days_capped": case(
                (
                    later_local_day,
                    func.least(
                        DISTINCT_VIEW_DAY_CAP,
                        StoryItemViewAggregate.distinct_view_days_capped + 1,
                    ),
                ),
                else_=StoryItemViewAggregate.distinct_view_days_capped,
            ),
            "last_counted_local_date": case(
                (later_local_day, initial.excluded.last_counted_local_date),
                else_=StoryItemViewAggregate.last_counted_local_date,
            ),
            "last_viewed_at": func.greatest(
                StoryItemViewAggregate.last_viewed_at,
                initial.excluded.last_viewed_at,
            ),
        },
    )
    session.execute(statement)


def purge_target(
    session: Session,
    *,
    space_id: UUID,
    kind: StoryKind,
    item_id: UUID,
) -> int:
    """Remove all viewers' aggregate state for one Story source item."""
    result = cast(
        "CursorResult[object]",
        session.execute(
            delete(StoryItemViewAggregate).where(
                StoryItemViewAggregate.space_id == space_id,
                StoryItemViewAggregate.item_kind == kind.value,
                StoryItemViewAggregate.item_id == item_id,
            )
        ),
    )
    return int(result.rowcount or 0)


def purge_viewer_for_space(
    session: Session,
    *,
    space_id: UUID,
    viewer_account_id: UUID,
) -> int:
    """Remove one departing viewer's aggregate state from one Space."""
    result = cast(
        "CursorResult[object]",
        session.execute(
            delete(StoryItemViewAggregate).where(
                StoryItemViewAggregate.space_id == space_id,
                StoryItemViewAggregate.viewer_account_id == viewer_account_id,
            )
        ),
    )
    return int(result.rowcount or 0)


def purge_viewer(session: Session, *, viewer_account_id: UUID) -> int:
    """Remove all aggregate state owned by an Account deletion subject."""
    result = cast(
        "CursorResult[object]",
        session.execute(
            delete(StoryItemViewAggregate).where(
                StoryItemViewAggregate.viewer_account_id == viewer_account_id
            )
        ),
    )
    return int(result.rowcount or 0)


def retention_cutoff(at: datetime) -> datetime:
    """Return the instant exactly twelve calendar months before ``at``."""
    instant = clock.ensure_utc(at)
    try:
        return instant.replace(year=instant.year - 1)
    except ValueError:
        # February 29 has no counterpart in a non-leap previous year.
        return instant.replace(year=instant.year - 1, day=28)


def prune_expired(session: Session, *, at: datetime | None = None) -> int:
    """Delete aggregates whose latest intentional view is over twelve months old."""
    cutoff = retention_cutoff(at if at is not None else clock.now())
    result = cast(
        "CursorResult[object]",
        session.execute(
            delete(StoryItemViewAggregate).where(StoryItemViewAggregate.last_viewed_at < cutoff)
        ),
    )
    return int(result.rowcount or 0)
