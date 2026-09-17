"""Finite, deterministic, backend-owned Discover selection.

Candidate queries return only Story identity and non-sensitive ordering
metadata. Every query has an explicit SQL limit. Full protected payloads are
loaded only after the daily snapshot references have been reauthorized by the
canonical shared-Story predicate.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from enum import StrEnum
from typing import TYPE_CHECKING, Any, cast
from uuid import UUID

from sqlalchemy import and_, case, delete, exists, extract, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

if TYPE_CHECKING:
    from sqlalchemy import CursorResult

from eimir.attachments.binding import MemoryAttachment
from eimir.attachments.models import Attachment, AttachmentStatus, MediaType
from eimir.authorization import AuthorizationContext, PrivacyClass, readable
from eimir.core import clock
from eimir.core.ids import parse_id
from eimir.heart_moments.models import HeartMoment
from eimir.memories.models import Memory
from eimir.milestones.models import Milestone
from eimir.relationship.models import Membership, MembershipStatus
from eimir.story import service as story_service
from eimir.story.service import StoryKind, StoryModel, StoryRow
from eimir.story.view_models import DiscoverSelectionSnapshot, StoryItemViewAggregate

ALGORITHM_VERSION = "discover-v1"
TARGET_ITEM_COUNT = 8
SNAPSHOT_RETENTION = timedelta(hours=48)

DATE_WINDOW_DAYS = 7
DATE_POOL_LIMIT_PER_KIND = 12
LONG_UNSEEN_MIN_AGE_DAYS = 365
LONG_UNSEEN_POOL_LIMIT_PER_KIND = 12
EARLY_HISTORY_POOL_LIMIT_PER_KIND = 6
HEART_MOMENT_POOL_LIMIT = 8
MILESTONE_POOL_LIMIT = 8
PHOTO_MEMORY_POOL_LIMIT = 12
SERENDIPITY_POOL_LIMIT_PER_KIND_PER_BAND = 2
FALLBACK_POOL_LIMIT_PER_KIND = 12
AFFINITY_POOL_LIMIT_PER_KIND = 6
AFFINITY_MIN_DISTINCT_DAYS = 3

_MODELS: dict[StoryKind, StoryModel] = {
    StoryKind.MEMORY: Memory,
    StoryKind.HEART_MOMENT: HeartMoment,
    StoryKind.MILESTONE: Milestone,
}


class CandidateIntent(StrEnum):
    EXACT_DATE = "EXACT_DATE"
    NEAR_DATE = "NEAR_DATE"
    LONG_UNSEEN = "LONG_UNSEEN"
    EARLY_HISTORY = "EARLY_HISTORY"
    HEART_MOMENT = "HEART_MOMENT"
    MILESTONE = "MILESTONE"
    PHOTO_MEMORY = "PHOTO_MEMORY"
    SERENDIPITY = "SERENDIPITY"
    FALLBACK = "FALLBACK"


@dataclass(frozen=True)
class StoryRef:
    kind: StoryKind
    item_id: UUID


@dataclass
class Candidate:
    ref: StoryRef
    effective_date: date
    created_at: datetime
    intents: set[CandidateIntent] = field(default_factory=set)
    date_distance_days: int | None = None
    own_last_viewed_at: datetime | None = None
    affinity_score: int | None = None
    affinity_last_viewed_at: datetime | None = None


@dataclass(frozen=True)
class SelectionDecision:
    ordered_refs: tuple[StoryRef, ...]
    affinity_influenced_ref: StoryRef | None


@dataclass(frozen=True)
class DiscoverReadResult:
    selection_date: date
    rows: list[StoryRow]


def _authorized_descriptors(kind: StoryKind, context: AuthorizationContext) -> Any:
    """Build one descriptor-only query inside the canonical Story universe."""
    model = _MODELS[kind]
    effective_date = _candidate_effective_date(model)
    statement = readable(model, context).with_only_columns(
        model.id.label("id"),
        effective_date.label("effective_date"),
        model.created_at.label("created_at"),
    )
    if kind is StoryKind.HEART_MOMENT:
        statement = statement.where(HeartMoment.privacy_class == PrivacyClass.SPACE_SHARED.value)
    return statement


def _candidate_effective_date(model: StoryModel) -> Any:
    """Use the canonical effective day without hiding non-null date indexes."""
    if model is Memory:
        return story_service.effective_date_expression(model)
    return model.happened_on


def _candidate_from_row(kind: StoryKind, row: Any, intent: CandidateIntent) -> Candidate:
    return Candidate(
        ref=StoryRef(kind=kind, item_id=row.id),
        effective_date=row.effective_date,
        created_at=clock.ensure_utc(row.created_at),
        intents={intent},
    )


def _merge(pool: dict[StoryRef, Candidate], incoming: Candidate) -> None:
    current = pool.get(incoming.ref)
    if current is None:
        pool[incoming.ref] = incoming
        return
    current.intents.update(incoming.intents)
    if incoming.date_distance_days is not None:
        if current.date_distance_days is None:
            current.date_distance_days = incoming.date_distance_days
        else:
            current.date_distance_days = min(
                current.date_distance_days, incoming.date_distance_days
            )
    if incoming.own_last_viewed_at is not None:
        current.own_last_viewed_at = incoming.own_last_viewed_at


def _date_distance(source: date, selection_date: date) -> int:
    occurrences = (
        clock.annual_occurrence(year, source.month, source.day)
        for year in range(selection_date.year - 1, selection_date.year + 2)
    )
    return min(abs((occurrence - selection_date).days) for occurrence in occurrences)


def _date_pairs(selection_date: date, window_days: int) -> set[tuple[int, int]]:
    dates = {
        selection_date + timedelta(days=offset) for offset in range(-window_days, window_days + 1)
    }
    pairs = {(value.month, value.day) for value in dates}
    # Canonical annual occurrence maps February 29 to February 28 in a
    # non-leap target year. Include the raw February-29 source pair whenever
    # that canonical occurrence falls anywhere inside the requested window.
    if any(value == clock.annual_occurrence(value.year, 2, 29) for value in dates):
        pairs.add((2, 29))
    return pairs


def _add_date_candidates(
    session: Session,
    context: AuthorizationContext,
    selection_date: date,
    pool: dict[StoryRef, Candidate],
) -> None:
    pair_sets = {
        window: _date_pairs(selection_date, window) for window in (0, 1, 3, DATE_WINDOW_DAYS)
    }

    def pair_filter(effective_date: Any, pairs: set[tuple[int, int]]) -> Any:
        return or_(
            *(
                and_(
                    extract("month", effective_date) == month,
                    extract("day", effective_date) == day,
                )
                for month, day in sorted(pairs)
            )
        )

    for kind, model in _MODELS.items():
        effective_date = _candidate_effective_date(model)
        filters = {
            window: pair_filter(effective_date, pairs) for window, pairs in pair_sets.items()
        }
        relaxation_rank = case(
            (filters[0], 0),
            (filters[1], 1),
            (filters[3], 3),
            else_=DATE_WINDOW_DAYS,
        )
        rows = session.execute(
            _authorized_descriptors(kind, context)
            .where(
                extract("year", effective_date) < selection_date.year,
                filters[DATE_WINDOW_DAYS],
            )
            .order_by(
                relaxation_rank,
                effective_date.desc(),
                model.created_at.desc(),
                model.id,
            )
            .limit(DATE_POOL_LIMIT_PER_KIND)
        ).all()
        for row in rows:
            distance = _date_distance(row.effective_date, selection_date)
            if distance > DATE_WINDOW_DAYS:
                continue
            intent = CandidateIntent.EXACT_DATE if distance == 0 else CandidateIntent.NEAR_DATE
            candidate = _candidate_from_row(kind, row, intent)
            candidate.date_distance_days = distance
            _merge(pool, candidate)


def _add_long_unseen_candidates(
    session: Session,
    context: AuthorizationContext,
    selection_date: date,
    pool: dict[StoryRef, Candidate],
) -> None:
    oldest_allowed = selection_date - timedelta(days=LONG_UNSEEN_MIN_AGE_DAYS)
    aggregate = StoryItemViewAggregate
    for kind, model in _MODELS.items():
        effective_date = _candidate_effective_date(model)
        statement = (
            readable(model, context)
            .outerjoin(
                aggregate,
                and_(
                    aggregate.space_id == context.space_id,
                    aggregate.viewer_account_id == context.account_id,
                    aggregate.item_kind == kind.value,
                    aggregate.item_id == model.id,
                ),
            )
            .with_only_columns(
                model.id.label("id"),
                effective_date.label("effective_date"),
                model.created_at.label("created_at"),
                aggregate.last_viewed_at.label("own_last_viewed_at"),
            )
            .where(effective_date <= oldest_allowed)
        )
        if kind is StoryKind.HEART_MOMENT:
            statement = statement.where(
                HeartMoment.privacy_class == PrivacyClass.SPACE_SHARED.value
            )
        rows = session.execute(
            statement.order_by(
                aggregate.last_viewed_at.is_not(None),
                aggregate.last_viewed_at.asc().nullsfirst(),
                effective_date.asc(),
                model.id,
            ).limit(LONG_UNSEEN_POOL_LIMIT_PER_KIND)
        ).all()
        for row in rows:
            candidate = _candidate_from_row(kind, row, CandidateIntent.LONG_UNSEEN)
            candidate.own_last_viewed_at = row.own_last_viewed_at
            _merge(pool, candidate)


def _add_early_history_candidates(
    session: Session,
    context: AuthorizationContext,
    pool: dict[StoryRef, Candidate],
) -> None:
    for kind, model in _MODELS.items():
        effective_date = _candidate_effective_date(model)
        rows = session.execute(
            _authorized_descriptors(kind, context)
            .order_by(effective_date.asc(), model.created_at.asc(), model.id)
            .limit(EARLY_HISTORY_POOL_LIMIT_PER_KIND)
        ).all()
        for row in rows:
            _merge(pool, _candidate_from_row(kind, row, CandidateIntent.EARLY_HISTORY))


def _add_kind_candidates(
    session: Session,
    context: AuthorizationContext,
    pool: dict[StoryRef, Candidate],
    *,
    kind: StoryKind,
    intent: CandidateIntent,
    limit: int,
) -> None:
    model = _MODELS[kind]
    effective_date = _candidate_effective_date(model)
    rows = session.execute(
        _authorized_descriptors(kind, context)
        .order_by(effective_date.desc(), model.created_at.desc(), model.id)
        .limit(limit)
    ).all()
    for row in rows:
        _merge(pool, _candidate_from_row(kind, row, intent))


def _add_photo_candidates(
    session: Session,
    context: AuthorizationContext,
    pool: dict[StoryRef, Candidate],
) -> None:
    ready_image = exists(
        select(1)
        .select_from(MemoryAttachment)
        .join(Attachment, Attachment.id == MemoryAttachment.attachment_id)
        .where(
            MemoryAttachment.memory_id == Memory.id,
            Attachment.space_id == context.space_id,
            Attachment.status == AttachmentStatus.READY.value,
            Attachment.media_type == MediaType.IMAGE.value,
        )
    )
    effective_date = _candidate_effective_date(Memory)
    rows = session.execute(
        _authorized_descriptors(StoryKind.MEMORY, context)
        .where(ready_image)
        .order_by(effective_date.desc(), Memory.created_at.desc(), Memory.id)
        .limit(PHOTO_MEMORY_POOL_LIMIT)
    ).all()
    for row in rows:
        _merge(
            pool,
            _candidate_from_row(StoryKind.MEMORY, row, CandidateIntent.PHOTO_MEMORY),
        )


def _years_ago(value: date, years: int) -> date:
    return clock.annual_occurrence(value.year - years, value.month, value.day)


def _seed_number(
    context: AuthorizationContext,
    selection_date: date,
    domain: str,
    *,
    algorithm_version: str,
) -> int:
    material = "|".join(
        (
            algorithm_version,
            str(context.space_id),
            str(context.account_id),
            selection_date.isoformat(),
            domain,
        )
    )
    return int.from_bytes(hashlib.sha256(material.encode()).digest(), "big")


def _bounded_window_rows(
    session: Session,
    context: AuthorizationContext,
    *,
    kind: StoryKind,
    start: date,
    end: date,
    pivot: date,
    limit: int,
) -> list[Any]:
    model = _MODELS[kind]
    effective_date = _candidate_effective_date(model)
    first = session.execute(
        _authorized_descriptors(kind, context)
        .where(effective_date >= pivot, effective_date >= start, effective_date <= end)
        .order_by(effective_date.asc(), model.created_at.asc(), model.id)
        .limit(limit)
    ).all()
    if len(first) == limit or pivot <= start:
        return list(first)
    wrapped = session.execute(
        _authorized_descriptors(kind, context)
        .where(effective_date >= start, effective_date < pivot, effective_date <= end)
        .order_by(effective_date.asc(), model.created_at.asc(), model.id)
        .limit(limit - len(first))
    ).all()
    return [*first, *wrapped]


def _add_serendipity_candidates(
    session: Session,
    context: AuthorizationContext,
    selection_date: date,
    pool: dict[StoryRef, Candidate],
    *,
    algorithm_version: str,
) -> None:
    bands = (
        (_years_ago(selection_date, 1), selection_date),
        (_years_ago(selection_date, 3), _years_ago(selection_date, 1) - timedelta(days=1)),
        (_years_ago(selection_date, 7), _years_ago(selection_date, 3) - timedelta(days=1)),
        (date(story_service.MIN_YEAR, 1, 1), _years_ago(selection_date, 7) - timedelta(days=1)),
    )
    for band_index, (start, end) in enumerate(bands):
        if end < start:
            continue
        span = (end - start).days + 1
        for kind in StoryKind:
            seed = _seed_number(
                context,
                selection_date,
                f"serendipity:{band_index}:{kind.value}",
                algorithm_version=algorithm_version,
            )
            pivot = start + timedelta(days=seed % span)
            rows = _bounded_window_rows(
                session,
                context,
                kind=kind,
                start=start,
                end=end,
                pivot=pivot,
                limit=SERENDIPITY_POOL_LIMIT_PER_KIND_PER_BAND,
            )
            for row in rows:
                _merge(pool, _candidate_from_row(kind, row, CandidateIntent.SERENDIPITY))


def _add_fallback_candidates(
    session: Session,
    context: AuthorizationContext,
    selection_date: date,
    pool: dict[StoryRef, Candidate],
    *,
    algorithm_version: str,
) -> None:
    start = date(story_service.MIN_YEAR, 1, 1)
    end = selection_date
    span = (end - start).days + 1
    for kind in StoryKind:
        seed = _seed_number(
            context,
            selection_date,
            f"fallback:{kind.value}",
            algorithm_version=algorithm_version,
        )
        pivot = start + timedelta(days=seed % span)
        rows = _bounded_window_rows(
            session,
            context,
            kind=kind,
            start=start,
            end=end,
            pivot=pivot,
            limit=FALLBACK_POOL_LIMIT_PER_KIND,
        )
        for row in rows:
            _merge(pool, _candidate_from_row(kind, row, CandidateIntent.FALLBACK))


def _active_partner_id(session: Session, context: AuthorizationContext) -> UUID | None:
    rows = (
        session.execute(
            select(Membership.account_id)
            .where(
                Membership.space_id == context.space_id,
                Membership.status == MembershipStatus.ACTIVE.value,
                Membership.account_id != context.account_id,
            )
            .order_by(Membership.account_id)
            .limit(2)
        )
        .scalars()
        .all()
    )
    return rows[0] if len(rows) == 1 else None


def _annotate_partner_affinity(
    session: Session,
    context: AuthorizationContext,
    pool: dict[StoryRef, Candidate],
) -> None:
    partner_id = _active_partner_id(session, context)
    if partner_id is None:
        return
    aggregate = StoryItemViewAggregate
    for kind, model in _MODELS.items():
        statement = (
            _authorized_descriptors(kind, context)
            .join(
                aggregate,
                and_(
                    aggregate.space_id == context.space_id,
                    aggregate.viewer_account_id == partner_id,
                    aggregate.item_kind == kind.value,
                    aggregate.item_id == model.id,
                ),
            )
            .add_columns(
                aggregate.distinct_view_days_capped.label("affinity_score"),
                aggregate.last_viewed_at.label("affinity_last_viewed_at"),
            )
            .where(aggregate.distinct_view_days_capped >= AFFINITY_MIN_DISTINCT_DAYS)
            .order_by(
                aggregate.distinct_view_days_capped.desc(),
                aggregate.last_viewed_at.desc(),
                model.id,
            )
            .limit(AFFINITY_POOL_LIMIT_PER_KIND)
        )
        for row in session.execute(statement).all():
            candidate = pool.get(StoryRef(kind=kind, item_id=row.id))
            # Affinity is only a signal on an independently eligible candidate;
            # it never expands the candidate universe.
            if candidate is not None:
                candidate.affinity_score = int(row.affinity_score)
                candidate.affinity_last_viewed_at = clock.ensure_utc(row.affinity_last_viewed_at)


def generate_candidates(
    session: Session,
    context: AuthorizationContext,
    selection_date: date,
    *,
    algorithm_version: str = ALGORITHM_VERSION,
) -> list[Candidate]:
    """Run all small, explicitly bounded descriptor candidate pools."""
    pool: dict[StoryRef, Candidate] = {}
    _add_date_candidates(session, context, selection_date, pool)
    _add_long_unseen_candidates(session, context, selection_date, pool)
    _add_early_history_candidates(session, context, pool)
    _add_kind_candidates(
        session,
        context,
        pool,
        kind=StoryKind.HEART_MOMENT,
        intent=CandidateIntent.HEART_MOMENT,
        limit=HEART_MOMENT_POOL_LIMIT,
    )
    _add_kind_candidates(
        session,
        context,
        pool,
        kind=StoryKind.MILESTONE,
        intent=CandidateIntent.MILESTONE,
        limit=MILESTONE_POOL_LIMIT,
    )
    _add_photo_candidates(session, context, pool)
    _add_serendipity_candidates(
        session,
        context,
        selection_date,
        pool,
        algorithm_version=algorithm_version,
    )
    _add_fallback_candidates(
        session,
        context,
        selection_date,
        pool,
        algorithm_version=algorithm_version,
    )
    _annotate_partner_affinity(session, context, pool)
    return list(pool.values())


_BASE_INTENT_RANK: dict[CandidateIntent, int] = {
    CandidateIntent.EXACT_DATE: 0,
    CandidateIntent.NEAR_DATE: 1,
    CandidateIntent.PHOTO_MEMORY: 2,
    CandidateIntent.LONG_UNSEEN: 3,
    CandidateIntent.EARLY_HISTORY: 4,
    CandidateIntent.HEART_MOMENT: 5,
    CandidateIntent.MILESTONE: 6,
    CandidateIntent.SERENDIPITY: 7,
    CandidateIntent.FALLBACK: 8,
}


def _stable_tie(
    candidate: Candidate,
    context: AuthorizationContext,
    selection_date: date,
    domain: str,
    algorithm_version: str,
) -> bytes:
    material = "|".join(
        (
            algorithm_version,
            str(context.space_id),
            str(context.account_id),
            selection_date.isoformat(),
            domain,
            candidate.ref.kind.value,
            str(candidate.ref.item_id),
        )
    )
    return hashlib.sha256(material.encode()).digest()


def _intent_rank(candidate: Candidate) -> int:
    return min(_BASE_INTENT_RANK[intent] for intent in candidate.intents)


def _lead_key(
    candidate: Candidate,
    context: AuthorizationContext,
    selection_date: date,
    algorithm_version: str,
) -> tuple[int, int, bytes]:
    if CandidateIntent.EXACT_DATE in candidate.intents:
        hierarchy = 0
    elif CandidateIntent.NEAR_DATE in candidate.intents:
        hierarchy = 1
    else:
        hierarchy = 2 + _intent_rank(candidate)
    distance = candidate.date_distance_days or 0
    return (
        hierarchy,
        distance,
        _stable_tie(candidate, context, selection_date, "lead", algorithm_version),
    )


def _fill_key(
    candidate: Candidate,
    context: AuthorizationContext,
    selection_date: date,
    algorithm_version: str,
) -> tuple[int, int, bytes]:
    return (
        _intent_rank(candidate),
        -len(candidate.intents),
        _stable_tie(candidate, context, selection_date, "fill", algorithm_version),
    )


def _affinity_choice(
    ordered: list[Candidate],
    context: AuthorizationContext,
    selection_date: date,
    algorithm_version: str,
) -> Candidate | None:
    """Choose at most one affinity tie-break within an equal base-rank group."""
    groups: dict[int, list[Candidate]] = {}
    for candidate in ordered:
        if candidate.affinity_score is not None:
            groups.setdefault(_intent_rank(candidate), []).append(candidate)
    if not groups:
        return None
    group = groups[min(groups)]
    return min(
        group,
        key=lambda candidate: (
            -cast(int, candidate.affinity_score),
            -int(
                candidate.affinity_last_viewed_at.timestamp()
                if candidate.affinity_last_viewed_at is not None
                else 0
            ),
            _stable_tie(candidate, context, selection_date, "affinity", algorithm_version),
        ),
    )


def _fits(
    candidate: Candidate,
    selected: list[Candidate],
    *,
    month_limit: bool,
    year_limit: bool,
    kind_limit: bool,
    day_limit: bool,
) -> bool:
    if day_limit and any(item.effective_date == candidate.effective_date for item in selected):
        return False
    if month_limit and any(
        (item.effective_date.year, item.effective_date.month)
        == (candidate.effective_date.year, candidate.effective_date.month)
        for item in selected
    ):
        return False
    if (
        year_limit
        and sum(item.effective_date.year == candidate.effective_date.year for item in selected) >= 2
    ):
        return False
    return not (kind_limit and sum(item.ref.kind is candidate.ref.kind for item in selected) >= 3)


def select_candidates(
    candidates: list[Candidate],
    context: AuthorizationContext,
    selection_date: date,
    *,
    algorithm_version: str = ALGORITHM_VERSION,
) -> SelectionDecision:
    """Select the lead and fill with ordered diversity relaxation."""
    if not candidates:
        return SelectionDecision(ordered_refs=(), affinity_influenced_ref=None)

    unique = {candidate.ref: candidate for candidate in candidates}
    lead = min(
        unique.values(),
        key=lambda candidate: _lead_key(candidate, context, selection_date, algorithm_version),
    )
    remaining = [candidate for candidate in unique.values() if candidate.ref != lead.ref]
    remaining.sort(
        key=lambda candidate: _fill_key(candidate, context, selection_date, algorithm_version)
    )

    affinity = _affinity_choice(remaining, context, selection_date, algorithm_version)
    influenced: StoryRef | None = None
    if affinity is not None:
        same_rank_indices = [
            index
            for index, candidate in enumerate(remaining)
            if _intent_rank(candidate) == _intent_rank(affinity)
        ]
        if same_rank_indices:
            first_index = same_rank_indices[0]
            affinity_index = remaining.index(affinity)
            if affinity_index != first_index:
                remaining.pop(affinity_index)
                remaining.insert(first_index, affinity)
                influenced = affinity.ref

    selected = [lead]
    passes = (
        (True, True, True, True),
        (False, True, True, True),
        (False, False, True, True),
        (False, False, False, True),
        (False, False, False, False),
    )
    for month_limit, year_limit, kind_limit, day_limit in passes:
        for candidate in remaining:
            if candidate in selected:
                continue
            if _fits(
                candidate,
                selected,
                month_limit=month_limit,
                year_limit=year_limit,
                kind_limit=kind_limit,
                day_limit=day_limit,
            ):
                selected.append(candidate)
                if len(selected) == TARGET_ITEM_COUNT:
                    return SelectionDecision(
                        ordered_refs=tuple(item.ref for item in selected),
                        affinity_influenced_ref=(
                            influenced if influenced in {item.ref for item in selected} else None
                        ),
                    )
    return SelectionDecision(
        ordered_refs=tuple(item.ref for item in selected),
        affinity_influenced_ref=(
            influenced if influenced in {item.ref for item in selected} else None
        ),
    )


def _serialize_refs(refs: tuple[StoryRef, ...]) -> list[dict[str, str]]:
    return [{"kind": ref.kind.value, "itemId": str(ref.item_id)} for ref in refs]


def _parse_refs(value: object) -> list[StoryRef]:
    if not isinstance(value, list):
        return []
    refs: list[StoryRef] = []
    seen: set[StoryRef] = set()
    for raw in value:
        if not isinstance(raw, dict):
            continue
        kind_raw = raw.get("kind")
        item_id_raw = raw.get("itemId")
        if not isinstance(kind_raw, str) or not isinstance(item_id_raw, str):
            continue
        try:
            kind = StoryKind(kind_raw)
        except ValueError:
            continue
        item_id = parse_id(item_id_raw)
        if item_id is None:
            continue
        ref = StoryRef(kind=kind, item_id=item_id)
        if ref not in seen:
            refs.append(ref)
            seen.add(ref)
    return refs[:TARGET_ITEM_COUNT]


def _snapshot_refs(
    session: Session,
    context: AuthorizationContext,
    selection_date: date,
    *,
    algorithm_version: str,
) -> list[StoryRef]:
    existing = session.get(
        DiscoverSelectionSnapshot,
        (context.space_id, context.account_id, selection_date),
    )
    if existing is not None:
        return _parse_refs(existing.ordered_item_refs)

    decision = select_candidates(
        generate_candidates(
            session,
            context,
            selection_date,
            algorithm_version=algorithm_version,
        ),
        context,
        selection_date,
        algorithm_version=algorithm_version,
    )
    serialized = _serialize_refs(decision.ordered_refs)
    statement = (
        insert(DiscoverSelectionSnapshot)
        .values(
            space_id=context.space_id,
            viewer_account_id=context.account_id,
            selection_date=selection_date,
            algorithm_version=algorithm_version,
            ordered_item_refs=serialized,
        )
        .on_conflict_do_nothing(
            index_elements=[
                DiscoverSelectionSnapshot.space_id,
                DiscoverSelectionSnapshot.viewer_account_id,
                DiscoverSelectionSnapshot.selection_date,
            ]
        )
        .returning(DiscoverSelectionSnapshot.ordered_item_refs)
    )
    winner = session.execute(statement).scalar_one_or_none()
    if winner is not None:
        return _parse_refs(winner)

    persisted = session.get(
        DiscoverSelectionSnapshot,
        (context.space_id, context.account_id, selection_date),
        populate_existing=True,
    )
    if persisted is None:
        raise RuntimeError("Discover snapshot conflict winner was not visible.")
    return _parse_refs(persisted.ordered_item_refs)


def _reauthorize_rows(
    session: Session,
    context: AuthorizationContext,
    refs: list[StoryRef],
) -> list[StoryRow]:
    by_kind: dict[StoryKind, list[UUID]] = {kind: [] for kind in StoryKind}
    for ref in refs:
        by_kind[ref.kind].append(ref.item_id)

    found: dict[StoryRef, StoryRow] = {}
    for kind, identifiers in by_kind.items():
        if not identifiers:
            continue
        rows = session.execute(
            _authorized_descriptors(kind, context)
            .where(_MODELS[kind].id.in_(identifiers))
            .limit(TARGET_ITEM_COUNT)
        ).all()
        for row in rows:
            ref = StoryRef(kind=kind, item_id=row.id)
            found[ref] = StoryRow(
                kind=kind,
                effective_date=row.effective_date,
                created_at=clock.ensure_utc(row.created_at),
                id=row.id,
            )
    return [found[ref] for ref in refs if ref in found]


def read_discover(
    session: Session,
    context: AuthorizationContext,
    *,
    account_timezone: str,
    at: datetime | None = None,
    algorithm_version: str = ALGORITHM_VERSION,
) -> DiscoverReadResult:
    """Materialize or read today's snapshot, then reauthorize every reference."""
    instant = clock.ensure_utc(at if at is not None else clock.now())
    selection_date = clock.today_in(account_timezone, at=instant)
    refs = _snapshot_refs(
        session,
        context,
        selection_date,
        algorithm_version=algorithm_version,
    )
    return DiscoverReadResult(
        selection_date=selection_date,
        rows=_reauthorize_rows(session, context, refs),
    )


def prune_expired_snapshots(session: Session, *, at: datetime | None = None) -> int:
    """Remove snapshots older than the fixed 48-hour retention window."""
    instant = clock.ensure_utc(at if at is not None else clock.now())
    result = cast(
        "CursorResult[object]",
        session.execute(
            delete(DiscoverSelectionSnapshot).where(
                DiscoverSelectionSnapshot.created_at < instant - SNAPSHOT_RETENTION
            )
        ),
    )
    return int(result.rowcount or 0)
