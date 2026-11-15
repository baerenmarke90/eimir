"""Learn labels only from currently readable parents; no plaintext search index."""

from collections import Counter
from typing import Literal
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, PrivacyClass, readable
from eimir.context_tags.models import TagSuggestion
from eimir.core.errors import NotFoundError
from eimir.heart_moments.models import HeartMoment
from eimir.memories.models import Memory
from eimir.plans.models import Plan
from eimir.wishes.models import Wish

ParentKind = Literal["MEMORY", "HEART_MOMENT", "PLAN", "WISH"]
TagParent = Memory | HeartMoment | Plan | Wish
_PARENTS: dict[ParentKind, type[Memory] | type[HeartMoment] | type[Plan] | type[Wish]] = {
    "MEMORY": Memory,
    "HEART_MOMENT": HeartMoment,
    "PLAN": Plan,
    "WISH": Wish,
}


def learned_labels(
    session: Session, context: AuthorizationContext, *, shared_only: bool = False
) -> list[str]:
    counts: Counter[str] = Counter()
    spelling: dict[str, str] = {}
    models: tuple[type[Memory] | type[HeartMoment] | type[Plan] | type[Wish], ...] = (
        Memory,
        HeartMoment,
        Plan,
        Wish,
    )
    for model in models:
        query = readable(model, context)
        if shared_only:
            query = query.where(model.privacy_class == PrivacyClass.SPACE_SHARED.value)
        for parent in session.scalars(
            query.order_by(model.updated_at.desc(), model.id.desc()).limit(500)
        ):
            for label in parent.payload.tags:
                normalized = label.casefold()
                counts[normalized] += 1
                spelling.setdefault(normalized, label)
    return [spelling[key] for key, _count in counts.most_common(24)]


def suggestions(
    session: Session,
    context: AuthorizationContext,
    kind: ParentKind | None = None,
    parent_id: UUID | None = None,
    *,
    shared_only: bool = False,
) -> tuple[list[str], list[str]]:
    if parent_id is not None:
        model = _PARENTS[kind] if kind is not None else Memory
        if session.scalar(readable(model, context).where(model.id == parent_id)) is None:
            raise NotFoundError("Moment not found.", "RESOURCE_NOT_FOUND")
    # Shared editors must never offer labels learned from a personal source.
    shared_only = shared_only or kind in {"MEMORY", "PLAN", "WISH"}
    learned = learned_labels(session, context, shared_only=shared_only)
    if kind in {"PLAN", "WISH"}:
        return learned, []
    memory_sources = readable(Memory, context)
    heart_sources = readable(HeartMoment, context)
    if shared_only:
        memory_sources = memory_sources.where(
            Memory.privacy_class == PrivacyClass.SPACE_SHARED.value
        )
        heart_sources = heart_sources.where(
            HeartMoment.privacy_class == PrivacyClass.SPACE_SHARED.value
        )
    query = select(TagSuggestion).where(
        TagSuggestion.space_id == context.space_id,
        or_(
            TagSuggestion.memory_id.in_(
                memory_sources.with_only_columns(Memory.id).where(
                    Memory.version == TagSuggestion.source_version
                )
            ),
            TagSuggestion.heart_moment_id.in_(
                heart_sources.with_only_columns(HeartMoment.id).where(
                    HeartMoment.version == TagSuggestion.source_version
                )
            ),
        ),
    )
    if parent_id is not None:
        query = query.where(
            TagSuggestion.memory_id == parent_id
            if kind == "MEMORY"
            else TagSuggestion.heart_moment_id == parent_id
        )
    used = {label.casefold() for label in learned}
    proposed: list[str] = []
    for item in session.scalars(query.order_by(TagSuggestion.generated_at.desc()).limit(24)):
        for label in item.payload.tags:
            if label.casefold() not in used:
                proposed.append(label)
                used.add(label.casefold())
    return learned, proposed[:8]
