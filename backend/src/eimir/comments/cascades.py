"""Atomic comment cascades at the persistence boundary.

The listeners run after the corresponding parent UPDATE/DELETE inside the
same database commit. At that point the parent is already exclusively locked.
A concurrent comment create that reads the parent with FOR SHARE is therefore
serialized cleanly.
"""

from __future__ import annotations

from sqlalchemy import Connection, delete, event, inspect

from eimir.authorization import PrivacyClass
from eimir.comments.models import Comment, CommentTarget
from eimir.heart_moments.models import HeartMoment
from eimir.memories.models import Memory
from eimir.milestones.models import Milestone


def _delete_for_parent(
    connection: Connection,
    *,
    space_id: object,
    target_type: CommentTarget,
    target_id: object,
) -> None:
    connection.execute(
        delete(Comment).where(
            Comment.space_id == space_id,
            Comment.target_type == target_type.value,
            Comment.target_id == target_id,
        )
    )


@event.listens_for(Memory, "after_delete")
def _memory_deleted(_mapper: object, connection: Connection, target: Memory) -> None:
    _delete_for_parent(
        connection,
        space_id=target.space_id,
        target_type=CommentTarget.MEMORY,
        target_id=target.id,
    )


@event.listens_for(Milestone, "after_delete")
def _milestone_deleted(_mapper: object, connection: Connection, target: Milestone) -> None:
    _delete_for_parent(
        connection,
        space_id=target.space_id,
        target_type=CommentTarget.MILESTONE,
        target_id=target.id,
    )


@event.listens_for(HeartMoment, "after_delete")
def _heart_moment_deleted(_mapper: object, connection: Connection, target: HeartMoment) -> None:
    _delete_for_parent(
        connection,
        space_id=target.space_id,
        target_type=CommentTarget.HEART_MOMENT,
        target_id=target.id,
    )


@event.listens_for(HeartMoment, "after_update")
def _heart_moment_made_private(
    _mapper: object,
    connection: Connection,
    target: HeartMoment,
) -> None:
    history = inspect(target).attrs.privacy_class.history
    if not history.has_changes() or target.privacy_class != PrivacyClass.OWNER_ONLY.value:
        return
    _delete_for_parent(
        connection,
        space_id=target.space_id,
        target_type=CommentTarget.HEART_MOMENT,
        target_id=target.id,
    )
