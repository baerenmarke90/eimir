"""API projection of rediscovery wording facts (#1790 C2).

The same additive object is attached to the Wir rediscovery card
(``DashboardView.retrospectiveRediscovery``) and the Momente lead card
(``DiscoverSelection.leadRediscovery``). See ``eimir.story.rediscovery`` for
the privacy contract.
"""

from __future__ import annotations

from uuid import UUID

from pydantic import Field
from sqlalchemy.orm import Session

from eimir.api.schema import ApiModel
from eimir.authorization import AuthorizationContext
from eimir.story import rediscovery
from eimir.story.rediscovery import PartOfDay, RediscoveryKind


class RediscoveryContext(ApiModel):
    """Viewer-safe facts a rediscovery card may phrase as a varying line."""

    place_name: str | None = Field(default=None, description="First linked couple-shared Place.")
    chapter_title: str | None = Field(default=None, description="First linked Chapter.")
    tag: str | None = Field(default=None, description="First authored tag of a Memory.")
    excerpt: str | None = Field(
        default=None, description="First words of a Memory or Milestone body; never the full body."
    )
    excerpt_truncated: bool = False
    photo_count: int = Field(default=0, ge=0)
    video_count: int = Field(default=0, ge=0)
    part_of_day: PartOfDay | None = Field(
        default=None,
        description="Coarse capture part of day of a non-sensitive photo from the moment's day.",
    )


def project_rediscovery(
    session: Session,
    authorization: AuthorizationContext,
    kind: str | None,
    item_id: UUID | None,
) -> RediscoveryContext | None:
    """Project wording facts for a Memory, Heart Moment, or Milestone source."""
    if kind is None or item_id is None or kind not in RediscoveryKind.__members__:
        return None
    context = rediscovery.rediscovery_context(session, authorization, kind, item_id)
    if context is None:
        return None
    return RediscoveryContext(
        place_name=context.place_name,
        chapter_title=context.chapter_title,
        tag=context.tag,
        excerpt=context.excerpt,
        excerpt_truncated=context.excerpt_truncated,
        photo_count=context.photo_count,
        video_count=context.video_count,
        part_of_day=context.part_of_day,
    )
