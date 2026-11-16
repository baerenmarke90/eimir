"""Viewer-safe wording context for rediscovery cards (#1790 C2).

Rediscovery cards on Wir ("Erinnert ihr euch?") and Momente ("Wisst ihr
noch?") vary their wording instead of using a bare date as their title. The
client chooses and phrases the variant; this module only supplies the source
facts the existing card payloads do not already carry.

Privacy contract:

- Context is only produced for a source that is readable by the viewer *and*
  shared with the couple (``SPACE_SHARED``). An owner-only source gets no
  context at all, so its private body, tags, or capture time never enter
  generated wording. Date-only variants still work client-side.
- Related Places and Chapters are always couple-shared by schema constraint
  and are additionally loaded through ``readable()``.
- Body text is reduced to its first words server-side; the full body never
  enters this projection.
- Photo capture time is reduced to a coarse part of day, taken only from a
  READY, non-sensitive image captured on the moment's own calendar day.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from enum import StrEnum
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from eimir.attachments import binding
from eimir.attachments.models import AttachmentStatus, MediaType
from eimir.authorization import AuthorizationContext, PrivacyClass, readable
from eimir.chapters.models import Chapter
from eimir.heart_moments import media as heart_media
from eimir.heart_moments.models import HeartMoment
from eimir.memories.models import Memory
from eimir.milestones.models import Milestone
from eimir.places.models import Place
from eimir.relations.models import (
    ChapterHeartMoment,
    ChapterMemory,
    ChapterMilestone,
    PlaceHeartMoment,
    PlaceMemory,
    PlaceMilestone,
)

EXCERPT_MAX_WORDS = 8
EXCERPT_MAX_CHARS = 72


class RediscoveryKind(StrEnum):
    MEMORY = "MEMORY"
    HEART_MOMENT = "HEART_MOMENT"
    MILESTONE = "MILESTONE"


class PartOfDay(StrEnum):
    MORNING = "MORNING"
    AFTERNOON = "AFTERNOON"
    EVENING = "EVENING"
    NIGHT = "NIGHT"


@dataclass(frozen=True)
class RediscoveryContext:
    place_name: str | None = None
    chapter_title: str | None = None
    tag: str | None = None
    excerpt: str | None = None
    excerpt_truncated: bool = False
    photo_count: int = 0
    video_count: int = 0
    part_of_day: PartOfDay | None = None


def part_of_day(hour: int) -> PartOfDay:
    """Map a wall-clock hour to the coarse bucket used by the wording."""
    if 5 <= hour < 12:
        return PartOfDay.MORNING
    if 12 <= hour < 17:
        return PartOfDay.AFTERNOON
    if 17 <= hour < 22:
        return PartOfDay.EVENING
    return PartOfDay.NIGHT


def first_words(text: str | None) -> tuple[str | None, bool]:
    """Return the first words of ``text`` and whether anything was cut."""
    words = (text or "").split()
    if not words:
        return None, False
    kept: list[str] = []
    for word in words[:EXCERPT_MAX_WORDS]:
        candidate = " ".join([*kept, word])
        if len(candidate) > EXCERPT_MAX_CHARS:
            break
        kept.append(word)
    if not kept:
        # A single very long token: cut it rather than emit nothing.
        return words[0][:EXCERPT_MAX_CHARS], True
    excerpt = " ".join(kept)
    return excerpt, len(kept) < len(words)


# Relation tables per source kind; typed loosely because SQLAlchemy models
# share no common declarative base type beyond ``Base``.
_MODELS: dict[RediscoveryKind, tuple[Any, Any, Any, Any, Any]] = {
    RediscoveryKind.MEMORY: (
        Memory,
        PlaceMemory,
        PlaceMemory.memory_id,
        ChapterMemory,
        ChapterMemory.memory_id,
    ),
    RediscoveryKind.HEART_MOMENT: (
        HeartMoment,
        PlaceHeartMoment,
        PlaceHeartMoment.heart_moment_id,
        ChapterHeartMoment,
        ChapterHeartMoment.heart_moment_id,
    ),
    RediscoveryKind.MILESTONE: (
        Milestone,
        PlaceMilestone,
        PlaceMilestone.milestone_id,
        ChapterMilestone,
        ChapterMilestone.milestone_id,
    ),
}


def rediscovery_context(
    session: Session,
    authorization: AuthorizationContext,
    kind: RediscoveryKind | str,
    item_id: UUID,
) -> RediscoveryContext | None:
    """Return wording facts for one rediscovery source, or ``None``.

    ``None`` means the source is unreadable or not couple-shared; the client
    then falls back to date-derived wording only.
    """
    kind = RediscoveryKind(kind)
    model, place_relation, place_fk, chapter_relation, chapter_fk = _MODELS[kind]
    source: Memory | HeartMoment | Milestone | None = session.execute(
        readable(model, authorization).where(model.id == item_id)
    ).scalar_one_or_none()
    if source is None or source.privacy_class != PrivacyClass.SPACE_SHARED.value:
        return None

    places = list(
        session.execute(
            readable(Place, authorization)
            .join(place_relation, place_relation.place_id == Place.id)
            .where(place_fk == item_id)
            .order_by(place_relation.created_at, Place.id)
        ).scalars()
    )
    if isinstance(source, Memory) and source.payload.place_order:
        order = source.payload.place_order
        places.sort(key=lambda place: order.index(place.id) if place.id in order else len(order))
    chapter = session.execute(
        readable(Chapter, authorization)
        .join(chapter_relation, chapter_relation.chapter_id == Chapter.id)
        .where(chapter_fk == item_id)
        .order_by(chapter_relation.created_at, Chapter.id)
        .limit(1)
    ).scalar_one_or_none()

    tag: str | None = None
    excerpt: str | None = None
    truncated = False
    if isinstance(source, Memory):
        gallery = binding.attachments_of_memories(session, [source.id]).get(source.id, [])
        tag = source.payload.tags[0] if source.payload.tags else None
        excerpt, truncated = first_words(source.payload.body)
        moment_day: date | None = source.happened_on or source.created_at.date()
    elif isinstance(source, HeartMoment):
        gallery = heart_media.galleries(session, [source]).get(source.id, [])
        moment_day = source.happened_on
    else:
        gallery = []
        excerpt, truncated = first_words(source.payload.body)
        moment_day = source.happened_on

    ready = [
        entry.attachment for entry in gallery if entry.attachment.status == AttachmentStatus.READY
    ]
    photos = [attachment for attachment in ready if attachment.media_type == MediaType.IMAGE]
    videos = [attachment for attachment in ready if attachment.media_type == MediaType.VIDEO]
    bucket: PartOfDay | None = None
    for photo in photos:
        captured = photo.payload.captured_at
        if photo.payload.is_sensitive or captured is None:
            continue
        # EXIF DateTimeOriginal is camera wall-clock time without an offset.
        if moment_day is not None and captured.date() == moment_day:
            bucket = part_of_day(captured.hour)
            break

    return RediscoveryContext(
        place_name=places[0].payload.name if places else None,
        chapter_title=chapter.payload.title if chapter is not None else None,
        tag=tag,
        excerpt=excerpt,
        excerpt_truncated=truncated,
        photo_count=len(photos),
        video_count=len(videos),
        part_of_day=bucket,
    )
