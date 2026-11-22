"""Monthly and yearly films on authorized shared material: compose once, read live.

Composition reads the bounded period pool, measures photo quality on the stored
thumbnails and freezes the look and the curated media in the protected edition
payload. Reading re-authorizes every source, answer, place and attachment, so a
withdrawn, deleted or newly sensitive item disappears at once.
"""

from __future__ import annotations

import contextlib
from collections.abc import Iterable
from dataclasses import replace
from typing import Any
from uuid import UUID

from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.attachments import service as attachments
from eimir.attachments.binding import BoundAttachment, attachments_of_memories
from eimir.attachments.models import AttachmentStatus, MediaType
from eimir.authorization import AuthorizationContext, PrivacyClass, readable
from eimir.heart_moments.media import galleries as heart_galleries
from eimir.heart_moments.models import HeartMoment
from eimir.identity.models import Account
from eimir.memories.models import Memory
from eimir.milestones.models import Milestone
from eimir.plans.media import photos_of_plans
from eimir.plans.models import Plan
from eimir.recaps.composition import Candidate
from eimir.recaps.models import (
    FilmLook,
    FilmMedia,
    RecapEdition,
    RecapFilm,
    RecapKind,
    RecapSource,
    RecapSourceKind,
)
from eimir.recaps.presentation import (
    ANSWER_LIMIT,
    POSITIVE_REACTIONS,
    answers_of,
    excerpt,
    partners,
    place_names,
)
from eimir.relationship.models import Membership, MembershipStatus
from eimir_pro.recap_composition import film

# Titles the app writes when a memory is saved without one; they are not the couple's words.
FALLBACK_TITLE_PREFIXES = ("Erinnerung vom ", "Memory from ")
QualityCache = dict[UUID, film.PhotoQuality | None]


def is_fallback_title(title: str | None) -> bool:
    value = (title or "").strip()
    return not value or any(
        value.startswith(prefix) and any(ch.isdigit() for ch in value[len(prefix) :])
        for prefix in FALLBACK_TITLE_PREFIXES
    )


def _load(
    session: Session, context: AuthorizationContext, model: Any, ids: list[UUID]
) -> dict[UUID, Any]:
    if not ids:
        return {}
    statement = readable(model, context).where(
        model.id.in_(ids),
        model.privacy_class == PrivacyClass.SPACE_SHARED.value,
        model.crypto_version.in_((0, 2)),
    )
    return {value.id: value for value in session.scalars(statement)}


def birthdays(session: Session, space_id: UUID) -> set[tuple[int, int]]:
    """Month and day of the active members' own birthdays."""
    accounts = session.scalars(
        select(Account)
        .join(Membership, Membership.account_id == Account.id)
        .where(
            Membership.space_id == space_id,
            Membership.status == MembershipStatus.ACTIVE.value,
            Account.disabled_at.is_(None),
        )
    )
    return {(value.birthday.month, value.birthday.day) for value in accounts if value.birthday}


def measure(attachment: Any, cache: QualityCache) -> film.PhotoQuality | None:
    """Quality from the stored thumbnail; any read or decode problem means 'unknown'."""
    if attachment.id in cache:
        return cache[attachment.id]
    quality = None
    if attachment.has_thumbnail:
        with (
            contextlib.suppress(Exception),
            attachments.open_content(attachment, variant=attachments.THUMBNAIL_VARIANT) as raw,
            Image.open(raw) as image,
        ):
            image.draft("RGB", (160, 160))
            quality = film.measure(image)
    cache[attachment.id] = quality
    return quality


def _pictures(
    bound: Iterable[BoundAttachment],
    parent_id: UUID,
    cover: UUID | None,
    cache: QualityCache,
    *,
    concealed: bool = False,
) -> list[film.Photo]:
    photos = []
    for entry in sorted(bound, key=lambda item: item.position):
        attachment = entry.attachment
        if attachment.status != AttachmentStatus.READY or attachment.media_type not in (
            MediaType.IMAGE,
            MediaType.VIDEO,
        ):
            continue
        sensitive = concealed or bool(attachment.payload.is_sensitive)
        photos.append(
            film.Photo(
                attachment_id=str(attachment.id),
                parent_id=str(parent_id),
                video=attachment.media_type == MediaType.VIDEO,
                seconds=float(attachment.duration_seconds or 0),
                sensitive=sensitive,
                selected_cover=attachment.id == cover,
                quality=None if sensitive else measure(attachment, cache),
            )
        )
    return photos


def _mutual(members: frozenset[UUID] | None, memory: Memory) -> tuple[bool, int]:
    reactions = memory.payload.photo_reactions
    if members is None:
        return False, len(reactions)
    given: dict[UUID, dict[UUID, str]] = {}
    for reaction in reactions:
        if reaction.account_id in members:
            given.setdefault(reaction.attachment_id, {})[reaction.account_id] = str(
                reaction.reaction
            )
    mutual = any(
        len(values) == 2
        and len(set(values.values())) == 1
        and next(iter(values.values())) in POSITIVE_REACTIONS
        for values in given.values()
    )
    return mutual, len(reactions)


def moments(
    session: Session,
    context: AuthorizationContext,
    pool: list[Candidate],
    cache: QualityCache,
) -> list[film.Moment]:
    """Countable signals of every shared moment in the pool, read once per job."""
    keyed: dict[RecapSourceKind, list[UUID]] = {}
    for item in pool:
        keyed.setdefault(item.kind, []).append(item.id)
    memories = _load(session, context, Memory, keyed.get(RecapSourceKind.MEMORY, []))
    hearts = _load(session, context, HeartMoment, keyed.get(RecapSourceKind.HEART_MOMENT, []))
    milestones = _load(session, context, Milestone, keyed.get(RecapSourceKind.MILESTONE, []))
    plans = _load(session, context, Plan, keyed.get(RecapSourceKind.PLAN, []))
    answers = answers_of(session, context, list(memories.values()))
    answer_ids = [entry.id for entries in answers.values() for entry in entries]
    memory_media = attachments_of_memories(session, [*memories, *answer_ids])
    heart_media = heart_galleries(session, list(hearts.values()))
    plan_media = photos_of_plans(session, list(plans.values()))
    places = place_names(session, context, keyed)
    members = partners(session, context.space_id)
    days = birthdays(session, context.space_id)

    result = []
    for item in pool:
        birthday = (item.occurred_on.month, item.occurred_on.day) in days
        base = film.Moment(
            key=item.key,
            kind=item.kind.value,
            occurred_on=item.occurred_on,
            has_place=item.id in places,
            birthday=birthday,
        )
        if item.kind == RecapSourceKind.MEMORY and (memory := memories.get(item.id)):
            responses = (
                answers.get(memory.experience_root_id or memory.id, [])
                if memory.experience_kind
                else []
            )
            photos = _pictures(
                memory_media.get(memory.id, []),
                memory.id,
                memory.payload.selected_cover_attachment_id,
                cache,
            )
            for entry in responses:
                if entry.id != memory.id:
                    photos += _pictures(memory_media.get(entry.id, []), entry.id, None, cache)
            mutual, reactions = _mutual(members, memory)
            text = " ".join(entry.payload.body for entry in responses) if responses else ""
            result.append(
                replace(
                    base,
                    through_on=memory.happened_until,
                    has_title=not is_fallback_title(memory.payload.title),
                    words=len(text.split()),
                    answers=len(responses),
                    answer_chars=sum(len(excerpt(e.payload.body, ANSWER_LIMIT)) for e in responses),
                    mutual_reaction=mutual,
                    reactions=reactions,
                    photos=tuple(photos),
                )
            )
        elif item.kind == RecapSourceKind.HEART_MOMENT and (heart := hearts.get(item.id)):
            result.append(
                replace(
                    base,
                    words=len((heart.payload.text or "").split()),
                    photos=tuple(
                        _pictures(
                            heart_media.get(heart.id, []),
                            heart.id,
                            heart.payload.selected_cover_attachment_id,
                            cache,
                        )
                    ),
                )
            )
        elif item.kind == RecapSourceKind.PLAN and (plan := plans.get(item.id)):
            result.append(
                replace(
                    base,
                    photos=tuple(
                        _pictures(
                            plan_media.get(plan.id, []),
                            plan.id,
                            None,
                            cache,
                            concealed=plan.discreet,
                        )
                    ),
                )
            )
        elif item.kind == RecapSourceKind.CHAPTER or (
            item.kind == RecapSourceKind.MILESTONE and item.id in milestones
        ):
            result.append(base)
    return result


def look_payload(look: film.Look) -> FilmLook:
    return FilmLook(
        mood=look.mood,
        transitions=list(look.transitions),
        cover=look.cover,
        motions=list(look.motions),
        layouts={scene: list(order) for scene, order in look.layouts.items()},
        accents=list(look.accents),
        pace=look.pace,
    )


def look_from(payload: FilmLook) -> film.Look:
    first, second = payload.transitions
    return film.Look(
        mood=payload.mood,
        transitions=(first, second),
        cover=payload.cover,
        motions=tuple(payload.motions),
        layouts={scene: tuple(order) for scene, order in payload.layouts.items()},
        accents=tuple(payload.accents),
        pace=payload.pace,
    )


def previous_looks(session: Session, value: RecapEdition) -> list[film.Look]:
    """Frozen looks of the latest earlier editions of the same kind, oldest first."""
    rows = session.scalars(
        select(RecapEdition)
        .where(
            RecapEdition.space_id == value.space_id,
            RecapEdition.kind == value.kind,
            RecapEdition.variant == 0,
            RecapEdition.id != value.id,
            (RecapEdition.year * 12 + RecapEdition.month) < value.year * 12 + value.month,
        )
        .order_by(
            RecapEdition.year.desc(),
            RecapEdition.month.desc(),
            RecapEdition.saved_at.desc().nulls_last(),
        )
        .limit(film.LOOK_MEMORY * 3)
    )
    looks: list[film.Look] = []
    periods: set[tuple[int, int]] = set()
    for edition in rows:
        if (edition.year, edition.month) in periods or edition.payload.film is None:
            continue
        periods.add((edition.year, edition.month))
        looks.append(look_from(edition.payload.film.look))
        if len(looks) == film.LOOK_MEMORY:
            break
    return list(reversed(looks))


def counterpart_looks(session: Session, value: RecapEdition) -> list[film.Look]:
    """The December film and the year film of one year never share a mood or pair."""
    if value.kind == RecapKind.MONTH.value and value.month != 12:
        return []
    other = (
        (RecapKind.YEAR.value, 0)
        if value.kind == RecapKind.MONTH.value
        else (
            RecapKind.MONTH.value,
            12,
        )
    )
    edition = session.scalar(
        select(RecapEdition)
        .where(
            RecapEdition.space_id == value.space_id,
            RecapEdition.kind == other[0],
            RecapEdition.year == value.year,
            RecapEdition.month == other[1],
            RecapEdition.variant == 0,
        )
        .order_by(RecapEdition.saved_at.desc().nulls_last())
        .limit(1)
    )
    if edition is None or edition.payload.film is None:
        return []
    return [look_from(edition.payload.film.look)]


def frozen_months(session: Session, value: RecapEdition) -> dict[int, film.FrozenMonth]:
    """The selection and highlight each composed monthly film of the year froze."""
    editions = session.scalars(
        select(RecapEdition)
        .where(
            RecapEdition.space_id == value.space_id,
            RecapEdition.kind == RecapKind.MONTH.value,
            RecapEdition.year == value.year,
            RecapEdition.variant == 0,
            RecapEdition.status == "READY",
        )
        .order_by(RecapEdition.month, RecapEdition.saved_at.desc().nulls_last())
    )
    result: dict[int, film.FrozenMonth] = {}
    for edition in editions:
        if edition.month in result or edition.payload.film is None:
            continue
        keys = session.execute(
            select(RecapSource.kind, RecapSource.source_id)
            .where(RecapSource.edition_id == edition.id)
            .order_by(RecapSource.position)
        ).all()
        result[edition.month] = film.FrozenMonth(
            highlight=edition.payload.film.highlight_key,
            keys=tuple(f"{kind}:{source_id}" for kind, source_id in keys),
        )
    return result


def _seed(value: RecapEdition) -> str:
    return f"{value.space_id}:{value.kind}:{value.year}:{value.month}:{value.variant}"


def _frozen_look(
    session: Session,
    value: RecapEdition,
    seed: str,
    result: film.Cut | film.YearCut,
) -> FilmLook:
    # A look is chosen once and then frozen, so reopening never changes it.
    existing = value.payload.film
    if existing is not None:
        return existing.look
    return look_payload(
        film.choose_look(
            seed,
            previous_looks(session, value),
            counterpart_looks(session, value),
            tone=result.tone,
            pictures=result.pictures,
            pace=film.pace_for(len(result.keys), yearly=isinstance(result, film.YearCut)),
        )
    )


def _film_media(media: dict[str, tuple[film.Media, ...]]) -> dict[str, list[FilmMedia]]:
    return {
        key: [
            FilmMedia(
                attachment_id=UUID(item.attachment_id),
                parent_id=UUID(item.parent_id),
                video=item.video,
                clip_start=item.clip_start,
                clip_seconds=item.clip_seconds,
                shape=item.shape,
                focus_x=item.focus_x,
                focus_y=item.focus_y,
            )
            for item in items
        ]
        for key, items in media.items()
    }


def compose_year(
    session: Session,
    context: AuthorizationContext,
    value: RecapEdition,
    pool: list[Candidate],
    cache: QualityCache,
) -> tuple[list[Candidate], RecapFilm]:
    """The year as month chapters; composed monthly films keep their choices."""
    seed = _seed(value)
    frozen = frozen_months(session, value)
    # Months with a film contribute only what that film chose (plus milestones),
    # which also bounds the photos measured for a whole year.
    bounded = [
        item
        for item in pool
        if item.occurred_on.month not in frozen
        or item.kind == RecapSourceKind.MILESTONE
        or item.key in frozen[item.occurred_on.month].keys
    ]
    signals = moments(session, context, bounded, cache)
    result = film.year_cut(
        signals,
        seed,
        frozen,
        lambda month: f"{value.space_id}:{RecapKind.MONTH.value}:{value.year}:{month}:0",
    )
    by_key = {item.key: item for item in bounded}
    selected = [by_key[key] for key in result.keys if key in by_key]
    return selected, RecapFilm(
        look=_frozen_look(session, value, seed, result),
        highlight_key=result.highlight,
        months={str(month): key for month, key in result.months.items()},
        media=_film_media(result.media),
    )


def compose(
    session: Session,
    context: AuthorizationContext,
    value: RecapEdition,
    pool: list[Candidate],
    cache: QualityCache,
) -> tuple[list[Candidate], RecapFilm]:
    seed = f"{value.space_id}:MONTH:{value.year}:{value.month}:{value.variant}"
    signals = moments(session, context, pool, cache)
    result = film.cut(signals, seed)
    by_key = {item.key: item for item in pool}
    selected = [by_key[key] for key in result.keys if key in by_key]
    return selected, RecapFilm(
        look=_frozen_look(session, value, seed, result),
        highlight_key=result.highlight,
        media=_film_media(result.media),
    )
