"""Reading recap editions: the Core read path, independent of how they were composed.

A stored edition stays readable, exportable and restorable on every server
(Decision 0017, #2085). Reading re-authorizes every source, answer, place,
comment, reaction and attachment on each request, so a withdrawn, deleted or
newly sensitive item disappears at once; nothing here composes, ranks or stores.
Composition (candidates, film cut, look, jobs) builds on these functions.
"""

from __future__ import annotations

import re
from collections import Counter
from collections.abc import Iterable
from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy import Date, cast, func, literal, select, union_all
from sqlalchemy.orm import Session

from eimir.attachments.binding import BoundAttachment, attachments_of_memories
from eimir.attachments.models import AttachmentStatus
from eimir.authorization import AuthorizationContext, PrivacyClass, readable
from eimir.chapters.models import Chapter
from eimir.comments.models import Comment
from eimir.heart_moments.media import galleries as heart_galleries
from eimir.heart_moments.models import HeartMoment
from eimir.identity.models import Account
from eimir.memories import experiences
from eimir.memories.models import Memory, MemoryPayload
from eimir.milestones.models import Milestone
from eimir.places.models import Place
from eimir.plans import discreet
from eimir.plans.media import photos_of_plans
from eimir.plans.models import Plan, PlanStatus
from eimir.recaps.composition import Candidate
from eimir.recaps.models import (
    FilmMedia,
    MoodRhythm,
    RecapEdition,
    RecapFilm,
    RecapKind,
    RecapPayload,
    RecapReflection,
    RecapSource,
    RecapSourceKind,
)
from eimir.relations.models import PlaceHeartMoment, PlaceMemory, PlaceMilestone
from eimir.relationship import configuration as configuration_service
from eimir.relationship.models import Membership, MembershipStatus

MODELS: dict[RecapSourceKind, Any] = {
    RecapSourceKind.MEMORY: Memory,
    RecapSourceKind.HEART_MOMENT: HeartMoment,
    RecapSourceKind.MILESTONE: Milestone,
    RecapSourceKind.CHAPTER: Chapter,
    RecapSourceKind.PLAN: Plan,
}
TAG_LIMIT = 12
QUOTE_LIMIT = 140
WORDS_LIMIT = 140
ANSWER_LIMIT = 120
# Reactions shown as a line; sad or merely "like" reactions are never highlighted.
POSITIVE_REACTIONS = frozenset({"LOVE", "LAUGH", "CELEBRATE"})
# The line should stay rare so it keeps its meaning.
REACTION_LINES_PER_EDITION = 3


# --- Shared source metadata -------------------------------------------------------


def _date_column(kind: RecapSourceKind, model: Any) -> Any:
    if kind == RecapSourceKind.CHAPTER:
        return func.coalesce(model.start_on, cast(func.timezone("UTC", model.created_at), Date))
    if kind == RecapSourceKind.PLAN:
        return model.experienced_on
    return func.coalesce(model.happened_on, cast(func.timezone("UTC", model.created_at), Date))


def source_metadata(context: AuthorizationContext) -> Any:
    """Kind, id, day span and version of every readable shared moment; no content."""
    legs = []

    for kind, model in MODELS.items():
        day = _date_column(kind, model)
        statement = readable(model, context).where(
            model.privacy_class == PrivacyClass.SPACE_SHARED.value,
            model.crypto_version.in_((0, 2)),
        )
        if kind == RecapSourceKind.PLAN:
            statement = statement.where(
                model.status == PlanStatus.COMPLETED.value, model.experienced_on.is_not(None)
            )
        if kind == RecapSourceKind.MEMORY:
            # Both answers to one guided question are one moment, not two.
            statement = statement.where(experiences.roots_only())
        legs.append(
            statement.with_only_columns(
                literal(kind.value).label("kind"),
                model.id.label("id"),
                day.label("day"),
                (
                    func.coalesce(Memory.happened_until, day)
                    if kind == RecapSourceKind.MEMORY
                    else day
                ).label("through"),
                model.version.label("version"),
            )
        )
    return union_all(*legs).subquery()


# --- The couple's own words around a source ---------------------------------------
# Read live with the source and reauthorized on every read, never stored in an
# edition, so editing or deleting a comment or reaction is reflected at once.


def cut(text: str, limit: int = QUOTE_LIMIT) -> str:
    """Whitespace-normalised text cut at a word boundary; never reworded."""
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    head = text[:limit]
    boundary = head.rfind(" ")
    head = head[:boundary] if boundary > limit // 2 else head
    return re.sub(r"[\s,;:.\-\u2013\u2014]+$", "", head) + "…"


def excerpt(text: str, limit: int = WORDS_LIMIT) -> str:
    """Whole sentences first, else a word boundary; the couple's words are never reworded."""
    value = " ".join(text.split())
    if len(value) <= limit:
        return value
    kept = ""
    for sentence in re.split(r"(?<=[.!?…])\s+", value):
        candidate = f"{kept} {sentence}".strip()
        if len(candidate) > limit:
            break
        kept = candidate
    if len(kept) >= 40:
        return f"{kept} …"
    head = value[:limit]
    boundary = head.rfind(" ")
    return f"{head[:boundary] if boundary > limit // 2 else head} …"


def quote(
    session: Session,
    context: AuthorizationContext,
    kind: RecapSourceKind,
    source_id: UUID,
    author_id: UUID,
) -> dict[str, Any] | None:
    """The newest comment written by a member other than the entry's author."""
    comment = session.scalar(
        readable(Comment, context)
        .where(
            Comment.target_type == kind.value,
            Comment.target_id == source_id,
            Comment.privacy_class == PrivacyClass.SPACE_SHARED.value,
            Comment.crypto_version.in_((0, 2)),
            Comment.owner_id != author_id,
        )
        .order_by(Comment.created_at.desc(), Comment.id.desc())
        .limit(1)
    )
    text = cut(comment.payload.body) if comment is not None else ""
    if comment is None or not text:
        return None
    # The name is protected content, so the row is loaded and read in Python.
    author = session.get(Account, comment.owner_id)
    name = author.display_name if author is not None else ""
    return {"text": text, "author_id": comment.owner_id, "author_name": name}


def partners(session: Session, space_id: UUID) -> frozenset[UUID] | None:
    """Both active members, or None while the Space does not have exactly two."""
    members = frozenset(
        session.scalars(
            select(Membership.account_id).where(
                Membership.space_id == space_id,
                Membership.status == MembershipStatus.ACTIVE.value,
            )
        )
    )
    return members if len(members) == 2 else None


def mutual_reaction(
    members: frozenset[UUID] | None, payload: MemoryPayload, cover_id: UUID | None
) -> str | None:
    """The reaction both members gave the cover photo, only when it is the same positive one."""
    if members is None or cover_id is None:
        return None
    given = {
        reaction.account_id: str(reaction.reaction)
        for reaction in payload.photo_reactions
        if reaction.attachment_id == cover_id and reaction.account_id in members
    }
    kinds = set(given.values())
    if len(given) == 2 and len(kinds) == 1 and (kind := kinds.pop()) in POSITIVE_REACTIONS:
        return kind
    return None


# --- Live film extras --------------------------------------------------------------


def answers_of(
    session: Session, context: AuthorizationContext, roots: list[Memory]
) -> dict[UUID, list[Memory]]:
    """Each partner's own response to a guided happiness or time-travel question."""
    grouped = experiences.responses(
        session, context, [root for root in roots if root.experience_kind]
    )
    return {
        root_id: [
            entry
            for entry in entries
            if entry.privacy_class == PrivacyClass.SPACE_SHARED.value
            and (entry.payload.body or "").strip()
        ]
        for root_id, entries in grouped.items()
    }


def place_names(
    session: Session, context: AuthorizationContext, keyed: dict[RecapSourceKind, list[UUID]]
) -> dict[UUID, str]:
    """The first linked Place of each moment, read through the Place authorization."""
    result: dict[UUID, str] = {}
    for kind, relation, column in (
        (RecapSourceKind.MEMORY, PlaceMemory, PlaceMemory.memory_id),
        (RecapSourceKind.HEART_MOMENT, PlaceHeartMoment, PlaceHeartMoment.heart_moment_id),
        (RecapSourceKind.MILESTONE, PlaceMilestone, PlaceMilestone.milestone_id),
    ):
        ids = keyed.get(kind, [])
        if not ids:
            continue
        rows = session.execute(
            readable(Place, context)
            .join(relation, relation.place_id == Place.id)
            .where(column.in_(ids), Place.archived.is_(False))
            .with_only_columns(column, Place)
            .order_by(relation.created_at, Place.id)
        )
        for parent_id, place in rows:
            name = (place.payload.name or "").strip()
            if name:
                result.setdefault(parent_id, name)
    return result


def readable_media(
    session: Session,
    context: AuthorizationContext,
    stored: list[FilmMedia],
    bound: dict[UUID, list[BoundAttachment]],
) -> list[dict[str, Any]]:
    """Stored picks that are still bound, ready and not marked sensitive."""
    current = {
        entry.attachment.id: entry.attachment
        for entries in bound.values()
        for entry in entries
        if entry.attachment.status == AttachmentStatus.READY
        and not entry.attachment.payload.is_sensitive
    }
    return [
        {
            "attachment_id": media.attachment_id,
            "parent_id": media.parent_id,
            "kind": "VIDEO" if media.video else "IMAGE",
            "clip_start_seconds": media.clip_start,
            "clip_seconds": media.clip_seconds,
            "shape": media.shape,
            "focus_x": media.focus_x,
            "focus_y": media.focus_y,
        }
        for media in stored
        if media.attachment_id in current
    ]


def source_extras(
    session: Session,
    context: AuthorizationContext,
    kind: RecapSourceKind,
    value: Any,
    stored: list[FilmMedia] | None,
) -> dict[str, Any]:
    """Live answers, place and media of one source of a film edition."""
    extras: dict[str, Any] = {"answers": [], "place_name": None, "media": []}
    places = place_names(session, context, {kind: [value.id]})
    extras["place_name"] = places.get(value.id)
    bound: dict[UUID, list[BoundAttachment]] = {}
    if kind == RecapSourceKind.MEMORY:
        responses = answers_of(session, context, [value]).get(
            value.experience_root_id or value.id, []
        )
        names = (
            {
                account.id: account.display_name
                for account in session.scalars(
                    select(Account).where(Account.id.in_({entry.owner_id for entry in responses}))
                )
            }
            if responses
            else {}
        )
        extras["answers"] = [
            {
                "text": excerpt(entry.payload.body, ANSWER_LIMIT),
                "author_id": entry.owner_id,
                "author_name": names.get(entry.owner_id, ""),
            }
            for entry in responses
        ]
        bound = attachments_of_memories(session, [value.id, *(entry.id for entry in responses)])
    elif kind == RecapSourceKind.HEART_MOMENT:
        bound = heart_galleries(session, [value])
    elif kind == RecapSourceKind.PLAN and not value.discreet:
        bound = photos_of_plans(session, [value])
    if stored:
        extras["media"] = readable_media(session, context, stored, bound)
    return extras


def month_tags(
    session: Session, context: AuthorizationContext, value: RecapEdition
) -> list[dict[str, Any]]:
    """Authored tags of the month's shared moments, most used first; read live."""
    starts, through = value.starts_on, value.through_on
    counts: Counter[str] = Counter()
    for model in (Memory, HeartMoment):
        day = func.coalesce(model.happened_on, cast(func.timezone("UTC", model.created_at), Date))
        statement = readable(model, context).where(
            model.privacy_class == PrivacyClass.SPACE_SHARED.value,
            model.crypto_version.in_((0, 2)),
            day >= starts,
            day <= through,
        )
        if model is Memory:
            statement = statement.where(experiences.roots_only())
        rows: Iterable[Any] = session.scalars(statement)
        for item in rows:
            counts.update(dict.fromkeys(item.payload.tags or [], 1))
    ranked = sorted(counts.items(), key=lambda pair: (-pair[1], pair[0].casefold()))
    return [{"label": label, "count": count} for label, count in ranked[:TAG_LIMIT]]


# --- Frozen mood rhythm --------------------------------------------------------------


def partner_pair(session: Session, space_id: UUID) -> tuple[UUID, UUID] | None:
    """Both active members in query order, or None while the Space does not have two."""
    members = list(
        session.scalars(
            select(Membership.account_id).where(
                Membership.space_id == space_id,
                Membership.status == MembershipStatus.ACTIVE.value,
            )
        )
    )
    return (members[0], members[1]) if len(members) == 2 else None


def vibe_enabled(session: Session, space_id: UUID) -> bool:
    configuration = configuration_service.load(session, space_id)
    return bool(configuration and configuration.vibe_check_enabled)


def visible_mood(session: Session, space_id: UUID, payload: RecapPayload) -> MoodRhythm | None:
    """Serve the frozen aggregate only while both partners and the Vibe module remain."""
    mood = payload.mood
    if mood is None or partner_pair(session, space_id) is None:
        return None
    return mood if vibe_enabled(session, space_id) else None


# --- Edition projection ---------------------------------------------------------------


def facts(
    session: Session, context: AuthorizationContext, value: RecapEdition
) -> dict[str, Any] | None:
    """Counted shared entries of the frozen period; never an inferred relationship claim."""
    source = source_metadata(context)
    active_day = func.greatest(source.c.day, value.starts_on)
    # Keep all facts on the same snapshot when sources change during the read.
    entries = session.execute(
        select(active_day, source.c.kind, func.count())
        .where(source.c.day <= value.through_on, source.c.through >= value.starts_on)
        .group_by(active_day, source.c.kind)
    ).all()
    if not entries:
        return None

    counts: Counter[str] = Counter()
    days: set[date] = set()
    monthly_counts: Counter[int] = Counter()
    for day, kind, count in entries:
        counts[kind] += count
        days.add(day)
        monthly_counts[day.month] += count

    busiest = None
    if value.kind == RecapKind.YEAR.value:
        leading = monthly_counts.most_common(2)
        # A tie or a single entry is not a meaningful "most active month".
        if leading[0][1] > 1 and (len(leading) == 1 or leading[0][1] > leading[1][1]):
            busiest = leading[0][0]
    return {
        "memories": counts[RecapSourceKind.MEMORY.value],
        "heart_moments": counts[RecapSourceKind.HEART_MOMENT.value],
        "milestones": counts[RecapSourceKind.MILESTONE.value],
        "chapters": counts[RecapSourceKind.CHAPTER.value],
        "plans": counts[RecapSourceKind.PLAN.value],
        "active_days": len(days),
        "busiest_month": busiest,
    }


def source_material(
    session: Session,
    context: AuthorizationContext,
    item: Candidate,
    *,
    lock: bool = False,
    own_words: bool = False,
    film: RecapFilm | None = None,
) -> dict[str, Any] | None:
    model = MODELS[item.kind]
    statement = readable(model, context).where(
        model.id == item.id,
        model.privacy_class == PrivacyClass.SPACE_SHARED.value,
        model.crypto_version.in_((0, 2)),
    )
    if lock:
        statement = statement.with_for_update()
    value = session.scalar(statement.execution_options(populate_existing=True))
    if value is None:
        return None
    if item.kind == RecapSourceKind.PLAN and value.status != PlanStatus.COMPLETED.value:
        return None
    payload = value.payload
    title = payload.text if item.kind == RecapSourceKind.HEART_MOMENT else payload.title
    excerpt = (
        payload.text
        if item.kind == RecapSourceKind.HEART_MOMENT
        else getattr(payload, "body", None) or getattr(payload, "description", None)
    )
    # A discreet Plan presents only its list title; photos stay concealed (#1790 F3).
    concealed = isinstance(value, Plan) and value.discreet
    if concealed:
        title, excerpt = discreet.list_title(value), None
    attachment = None
    sensitive = False
    from eimir.attachments.binding import cover_of

    gallery = (
        attachments_of_memories(session, [item.id])
        if item.kind == RecapSourceKind.MEMORY
        else photos_of_plans(session, [value])
        if item.kind == RecapSourceKind.PLAN
        else heart_galleries(session, [value])
        if item.kind == RecapSourceKind.HEART_MOMENT
        else {}
    )
    photo = cover_of(
        gallery.get(item.id, []), getattr(payload, "selected_cover_attachment_id", None)
    )
    if photo and photo.status == AttachmentStatus.READY:
        attachment, sensitive = photo.id, photo.payload.is_sensitive or concealed
    result = {
        "key": item.key,
        "kind": item.kind,
        "id": item.id,
        "occurred_on": item.occurred_on,
        "version": value.version,
        "title": title[:300] if title else None,
        "excerpt": excerpt[:800] if excerpt else None,
        "preview_attachment_id": attachment,
        "preview_is_sensitive": sensitive,
        "available": True,
    }
    if own_words:
        result["quote"] = quote(session, context, item.kind, item.id, value.owner_id)
        result["mutual_reaction"] = (
            mutual_reaction(partners(session, context.space_id), payload, attachment)
            if item.kind == RecapSourceKind.MEMORY
            else None
        )
    if film is not None:
        result.update(source_extras(session, context, item.kind, value, film.media.get(item.key)))
    return result


def materials(
    session: Session, context: AuthorizationContext, value: RecapEdition
) -> tuple[list[dict[str, Any]], bool]:
    result = []
    unchanged = True
    refs = session.scalars(
        select(RecapSource).where(RecapSource.edition_id == value.id).order_by(RecapSource.position)
    ).all()
    film = value.payload.film
    for ref in refs:
        metadata = source_metadata(context)
        interval = session.execute(
            select(metadata.c.day, metadata.c.through).where(
                metadata.c.kind == ref.kind, metadata.c.id == ref.source_id
            )
        ).first()
        day = interval.day if interval else None
        current = (
            source_material(
                session,
                context,
                Candidate(
                    RecapSourceKind(ref.kind),
                    ref.source_id,
                    day or value.starts_on,
                    ref.source_version,
                ),
                own_words=True,
                film=film,
            )
            if day
            and interval
            and interval.day <= value.through_on
            and interval.through >= value.starts_on
            else None
        )
        if current is None or current["version"] != ref.source_version:
            unchanged = False
        result.append(
            current
            or {
                "key": f"{ref.kind}:{ref.source_id}",
                "kind": ref.kind,
                "id": ref.source_id,
                "occurred_on": None,
                "version": None,
                "title": None,
                "excerpt": None,
                "preview_attachment_id": None,
                "preview_is_sensitive": False,
                "available": False,
                "media": [],
                "answers": [],
                "place_name": None,
            }
        )
    # The reaction line stays rare: only the first few in reading order keep it.
    shown = 0
    for item in result:
        if item.get("mutual_reaction"):
            shown += 1
            if shown > REACTION_LINES_PER_EDITION:
                item["mutual_reaction"] = None
    return result, unchanged


def project(session: Session, context: AuthorizationContext, value: RecapEdition) -> dict[str, Any]:
    sources, unchanged = materials(session, context, value)
    notes = session.scalars(
        readable(RecapReflection, context).where(RecapReflection.edition_id == value.id)
    ).all()
    shared = [note for note in notes if note.privacy_class == PrivacyClass.SPACE_SHARED.value]
    draft = next(
        (
            note
            for note in notes
            if note.owner_id == context.account_id
            and note.privacy_class == PrivacyClass.OWNER_ONLY.value
        ),
        None,
    )
    author_ids = {note.owner_id for note in shared}
    names = (
        {
            a.id: a.display_name
            for a in session.scalars(select(Account).where(Account.id.in_(author_ids))).all()
        }
        if author_ids
        else {}
    )
    result = {
        key: getattr(value, key)
        for key in (
            "id",
            "kind",
            "year",
            "month",
            "variant",
            "version",
            "starts_on",
            "through_on",
            "is_partial",
            "status",
            "theme",
            "generated_at",
            "saved_at",
            "locale",
        )
    }
    result.update(
        {
            "headline": value.payload.headline if unchanged else None,
            "introduction": value.payload.introduction if unchanged else None,
            "sources": sources,
            "facts": facts(session, context, value) if value.status == "READY" else None,
            "mood": visible_mood(session, context.space_id, value.payload)
            if value.status == "READY"
            else None,
            "film": film_view(session, context, value) if value.status == "READY" else None,
            "reflections": [
                {
                    "id": n.id,
                    "owner_id": n.owner_id,
                    "display_name": names.get(n.owner_id, ""),
                    "text": n.payload.text,
                    "version": n.version,
                }
                for n in shared
            ],
            "own_draft": {"text": draft.payload.text, "version": draft.version} if draft else None,
            "supersedes_id": value.supersedes_id,
            "superseded_by_id": successors(session, [value]).get(value.id),
        }
    )
    return result


def successors(session: Session, values: list[RecapEdition]) -> dict[UUID, UUID]:
    """The newest kept version that extends each retained edition, if any."""
    if not values:
        return {}
    result: dict[UUID, UUID] = {}
    for supersedes_id, edition_id in session.execute(
        select(RecapEdition.supersedes_id, RecapEdition.id)
        .where(
            RecapEdition.supersedes_id.in_([value.id for value in values]),
            RecapEdition.saved_at.is_not(None),
        )
        .order_by(RecapEdition.saved_at)
    ):
        result[supersedes_id] = edition_id
    return result


def film_view(
    session: Session, context: AuthorizationContext, value: RecapEdition
) -> dict[str, Any] | None:
    """The frozen look and the guaranteed highlights; never scores or reasons."""
    film = value.payload.film
    if film is None:
        return None
    return {
        **film.look.model_dump(),
        "highlight_key": film.highlight_key,
        "month_highlights": [
            {"month": int(month), "key": key}
            for month, key in sorted(film.months.items(), key=lambda pair: int(pair[0]))
        ],
        "tags": month_tags(session, context, value),
    }


def summaries(
    session: Session, context: AuthorizationContext, values: list[RecapEdition]
) -> list[dict[str, Any]]:
    """Batch source eligibility; read only one cover per edition on overview pages."""
    if not values:
        return []
    refs = session.scalars(
        select(RecapSource)
        .where(RecapSource.edition_id.in_([v.id for v in values]))
        .order_by(RecapSource.position)
    ).all()
    source = source_metadata(context)
    ids = {ref.source_id for ref in refs}
    current = (
        {
            (row.kind, row.id): (row.version, row.day, row.through)
            for row in session.execute(select(source).where(source.c.id.in_(ids)))
        }
        if ids
        else {}
    )
    result = []
    later = successors(session, values)
    for value in values:
        owned = [ref for ref in refs if ref.edition_id == value.id]
        unchanged = all(
            current.get((ref.kind, ref.source_id), (None, None))[0] == ref.source_version
            and current[(ref.kind, ref.source_id)][1] <= value.through_on
            and current[(ref.kind, ref.source_id)][2] >= value.starts_on
            for ref in owned
        )
        cover = None
        for ref in owned:
            metadata = current.get((ref.kind, ref.source_id))
            if metadata and metadata[1] <= value.through_on and metadata[2] >= value.starts_on:
                cover = source_material(
                    session,
                    context,
                    Candidate(RecapSourceKind(ref.kind), ref.source_id, metadata[1], metadata[0]),
                )
                if cover:
                    break
        item = {
            key: getattr(value, key)
            for key in (
                "id",
                "kind",
                "year",
                "month",
                "variant",
                "version",
                "starts_on",
                "through_on",
                "is_partial",
                "status",
                "theme",
                "generated_at",
                "saved_at",
                "locale",
            )
        }
        item.update(
            headline=value.payload.headline if unchanged else None,
            introduction=value.payload.introduction if unchanged else None,
            sources=[cover] if cover else [],
            reflections=[],
            own_draft=None,
            supersedes_id=value.supersedes_id,
            superseded_by_id=later.get(value.id),
        )
        result.append(item)
    return result
