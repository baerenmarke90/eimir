"""Story query.

Three content types and optional chapter markers, one ordering, one cursor.
The structure follows M2-D08:
`effectiveDate = happenedOn ?? UTC_DATE(createdAt)` and the complete key
`(effectiveDate, createdAt, kindRank, id)`.

Two concepts are deliberately not redefined here because they already exist:
visibility and cursor mechanics. Each leg starts from `readable()` and only
changes projected columns instead of spelling the condition out a second
time, which is where privacy filters otherwise start to drift. Cursor signing
and binding come from `core.cursor`, just as for every other collection.

#1021 superseded M2-D22 for the Timeline: `readable()` already resolves
`OWNER_ONLY` correctly (owner yes, partner no), so a private HeartMoment now
stays part of its author's own Timeline instead of being excluded outright.
One privacy rule, expressed once, with the account making the request
deciding the result rather than the module. `read_shared_story_counts`
deliberately keeps the stricter `SPACE_SHARED`-only leg on top of that
because it feeds the relationship-shared Dashboard count (#809), which must
not grow when an account marks their own HeartMoment private. `_leg`'s
`shared_only` flag is the single place that distinction lives; nothing else
in this module reimplements privacy.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from enum import StrEnum
from typing import Any, Literal
from uuid import UUID

from sqlalchemy import Date, Integer, Select, cast, func, literal, select, tuple_, union_all
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, PrivacyClass, readable
from eimir.authorization.guard import absence_of
from eimir.chapters.models import Chapter
from eimir.core import clock
from eimir.core import cursor as cursor_codec
from eimir.core.ids import parse_id
from eimir.heart_moments.models import HeartMoment
from eimir.identity.models import Account
from eimir.memories import experiences
from eimir.memories.models import Memory
from eimir.milestones.models import Milestone

DEFAULT_LIMIT = 50
MAX_LIMIT = 100
MIN_YEAR = 1900
MAX_YEAR = 2100


class StoryKind(StrEnum):
    MEMORY = "MEMORY"
    HEART_MOMENT = "HEART_MOMENT"
    MILESTONE = "MILESTONE"


class StoryOrder(StrEnum):
    ASC = "ASC"
    DESC = "DESC"


_KIND_RANK: dict[StoryKind, int] = {
    StoryKind.MEMORY: 1,
    StoryKind.HEART_MOMENT: 2,
    StoryKind.MILESTONE: 3,
}
"""M2-D08. The rank is part of the sort key and therefore part of the
contract rather than an implementation detail: for equal effective date and
creation time it determines ordering and thus cursor position."""

_CHAPTER_KIND_RANK = 4
"""Chapter markers extend only the optional timeline projection, not StoryKind."""

type StoryModel = type[Memory] | type[HeartMoment] | type[Milestone]
"""The three source types explicitly rather than an open base class.

`PrivateResourceMixin` would be more general but would lose `happened_on`,
`created_at`, and `id`, and with them the type check that every union leg
actually produces the same key."""

_MODELS: dict[StoryKind, StoryModel] = {
    StoryKind.MEMORY: Memory,
    StoryKind.HEART_MOMENT: HeartMoment,
    StoryKind.MILESTONE: Milestone,
}


@dataclass(frozen=True)
class StoryRow:
    """One query row containing only key and identity.

    The query deliberately returns only key and identity. Domain objects are
    loaded in batches afterwards; otherwise a page of one hundred entries
    could produce three hundred individual queries.
    """

    kind: StoryKind
    effective_date: date
    created_at: datetime
    id: UUID


@dataclass(frozen=True)
class ChapterTimelineRow:
    """One dated chapter marker sharing the timeline's complete sort key."""

    kind: Literal["CHAPTER"]
    effective_date: date
    created_at: datetime
    id: UUID
    position: int


@dataclass(frozen=True)
class StoryPageResult:
    items: list[StoryRow]
    next_cursor: str | None
    has_more: bool
    chapter_markers: list[ChapterTimelineRow] = field(default_factory=list)


@dataclass(frozen=True)
class SharedStoryCounts:
    """All-time counts for the relationship-shared Story projection (#809)."""

    memories: int
    heart_moments: int
    milestones: int


def effective_date_expression(model: StoryModel) -> Any:
    """Use `happenedOn`, falling back to the UTC calendar date of `createdAt`.

    The M2-D08 rule lives once for all three types. HeartMoment and Milestone
    have non-null `happened_on`, so the coalesce is a no-op there, but using a
    shared expression prevents the branches from drifting.
    """
    return func.coalesce(
        model.happened_on,
        cast(func.timezone("UTC", model.created_at), Date),
    )


def _leg(
    kind: StoryKind,
    context: AuthorizationContext,
    *,
    year: int | None,
    shared_only: bool = False,
) -> Select[Any]:
    """Build one authorized union leg before selecting projected columns.

    `with_only_columns` retains the WHERE condition from `readable()` and
    changes only the projection. Story therefore cannot acquire a separate
    visibility condition.

    `shared_only` narrows the leg further to `SPACE_SHARED` HeartMoments,
    for the one caller (`read_shared_story_counts`) that needs the stricter
    relationship-shared projection rather than the viewer-authorized one. The
    default leaves `readable()`'s owner/partner resolution as the only
    privacy rule in effect, which is what the Timeline itself needs (#1021).
    """
    model = _MODELS[kind]
    effective_date = effective_date_expression(model)
    statement = readable(model, context).with_only_columns(
        literal(_KIND_RANK[kind]).label("kind_rank"),
        effective_date.label("effective_date"),
        model.created_at.label("created_at"),
        model.id.label("id"),
    )
    if kind is StoryKind.MEMORY:
        statement = statement.where(experiences.roots_only())
    if shared_only and kind is StoryKind.HEART_MOMENT:
        statement = statement.where(model.privacy_class == PrivacyClass.SPACE_SHARED.value)
    if year is not None:
        statement = statement.where(
            (
                func.coalesce(Memory.happened_until, effective_date)
                if model is Memory
                else effective_date
            )
            >= date(year, 1, 1),
            effective_date <= date(year, 12, 31),
        )
    return statement


def _chapter_leg(context: AuthorizationContext, *, year: int | None) -> Select[Any]:
    """Project one marker at an explicit chapter start, never at a fallback date."""
    statement = (
        readable(Chapter, context)
        .where(Chapter.start_on.is_not(None))
        .with_only_columns(
            literal(_CHAPTER_KIND_RANK).label("kind_rank"),
            Chapter.start_on.label("effective_date"),
            Chapter.created_at.label("created_at"),
            Chapter.id.label("id"),
        )
    )
    if year is not None:
        statement = statement.where(
            Chapter.start_on >= date(year, 1, 1),
            Chapter.start_on <= date(year, 12, 31),
        )
    return statement


def require_readable_story_item(
    session: Session,
    context: AuthorizationContext,
    *,
    kind: StoryKind,
    item_id: UUID | str,
) -> UUID:
    """Require one viewer-authorized Story item and hold it for the current transaction.

    Intentional-view writes use this exact Story leg rather than recreating
    HeartMoment visibility rules. Viewer-authorized rather than shared-only
    (#1021): an account may open its own OWNER_ONLY HeartMoment from its own
    Timeline, and that presentation is as intentional a view as any shared
    one. The lock orders the receipt against a concurrent target delete or
    visibility transition.
    """
    model = _MODELS[kind]
    identifier = item_id if isinstance(item_id, UUID) else parse_id(item_id)
    if identifier is None:
        raise absence_of(model).error()
    found = session.execute(
        _leg(kind, context, year=None).where(model.id == identifier).with_for_update(read=True)
    ).one_or_none()
    if found is None and kind is StoryKind.MEMORY:
        canonical_id = session.scalar(
            readable(Memory, context)
            .where(Memory.id == identifier)
            .with_only_columns(Memory.experience_root_id)
        )
        if canonical_id is not None and canonical_id != identifier:
            identifier = canonical_id
            found = session.execute(
                _leg(kind, context, year=None)
                .where(model.id == identifier)
                .with_for_update(read=True)
            ).one_or_none()
    if found is None:
        raise absence_of(model).error()
    return identifier


def read_shared_story_counts(
    session: Session,
    context: AuthorizationContext,
) -> SharedStoryCounts:
    """Count the relationship-shared Story without materializing Story rows.

    This is deliberately the stricter `shared_only` leg, not the
    viewer-authorized Timeline leg: it feeds the relationship-shared
    Dashboard count (#809), which must stay `SPACE_SHARED`-only so an
    account's own private HeartMoment never inflates a "shared with your
    partner" count (#1021).
    """
    experiences.reconcile(session, context)
    combined = union_all(
        *(_leg(kind, context, year=None, shared_only=True) for kind in StoryKind)
    ).subquery("shared_story_counts")
    rows = session.execute(
        select(combined.c.kind_rank, func.count())
        .group_by(combined.c.kind_rank)
        .order_by(combined.c.kind_rank)
    ).all()
    counts = {int(kind_rank): int(count) for kind_rank, count in rows}
    return SharedStoryCounts(
        memories=counts.get(_KIND_RANK[StoryKind.MEMORY], 0),
        heart_moments=counts.get(_KIND_RANK[StoryKind.HEART_MOMENT], 0),
        milestones=counts.get(_KIND_RANK[StoryKind.MILESTONE], 0),
    )


def _cursor_binding(
    context: AuthorizationContext,
    kinds: tuple[StoryKind, ...],
    year: int | None,
    order: StoryOrder,
    include_chapters: bool,
) -> dict[str, Any]:
    """Return the parameters to which a Story cursor is bound.

    `limit` is deliberately absent: a smaller or larger page continues from
    the same point. Anything changing the result set or its ordering belongs
    in the binding because otherwise the cursor would point into a list that
    no longer exists.

    `accountId` binds the cursor to the requesting account (#1021). Since the
    Timeline became viewer-authorized, two accounts in the same Space can now
    have genuinely different authorized result sets — one account's own
    OWNER_ONLY HeartMoments are woven into their Timeline at their ordinary
    sort position but are absent from their partner's. Without this, a cursor
    minted from one account's page could satisfy the other account's binding
    check (same Space, same filters) while pointing at a position the
    partner's own authorized set never produced, silently skipping or
    repeating rows for them. A mismatched `accountId` fails the same generic
    `INVALID_CURSOR` response as every other binding mismatch, so this closes
    the gap without adding a new failure mode or disclosing anything.
    """
    binding = {
        "collection": "story",
        "spaceId": str(context.space_id),
        "accountId": str(context.account_id),
        "kinds": [kind.value for kind in kinds],
        "year": year,
        "order": order.value,
    }
    if include_chapters:
        # Preserve cursors from the existing content-only contract while
        # preventing their reuse against the expanded result set (#1635).
        binding["includeChapters"] = True
    return binding


def _encode_cursor(
    *,
    context: AuthorizationContext,
    kinds: tuple[StoryKind, ...],
    year: int | None,
    order: StoryOrder,
    include_chapters: bool,
    item: StoryRow | ChapterTimelineRow,
) -> str:
    return cursor_codec.encode(
        binding=_cursor_binding(context, kinds, year, order, include_chapters),
        position={
            "effectiveDate": item.effective_date.isoformat(),
            "createdAt": item.created_at.astimezone(UTC).isoformat().replace("+00:00", "Z"),
            "kind": str(item.kind),
            "id": str(item.id),
        },
    )


def _decode_cursor(
    token: str,
    *,
    context: AuthorizationContext,
    kinds: tuple[StoryKind, ...],
    year: int | None,
    order: StoryOrder,
    include_chapters: bool,
) -> tuple[date, datetime, int, UUID]:
    position = cursor_codec.decode(
        token, binding=_cursor_binding(context, kinds, year, order, include_chapters)
    )
    effective_date_raw = position.get("effectiveDate")
    created_at_raw = position.get("createdAt")
    kind_raw = position.get("kind")
    id_raw = position.get("id")
    if not all(
        isinstance(value, str) for value in (effective_date_raw, created_at_raw, kind_raw, id_raw)
    ):
        raise cursor_codec.invalid_cursor()
    try:
        effective_date = date.fromisoformat(str(effective_date_raw))
        created_at = datetime.fromisoformat(str(created_at_raw).replace("Z", "+00:00"))
        if kind_raw == "CHAPTER" and include_chapters:
            kind_rank = _CHAPTER_KIND_RANK
        else:
            kind_rank = _KIND_RANK[StoryKind(str(kind_raw))]
        item_id = UUID(str(id_raw))
    except ValueError as error:
        raise cursor_codec.invalid_cursor() from error
    if created_at.tzinfo is None:
        raise cursor_codec.invalid_cursor()
    return effective_date, created_at.astimezone(UTC), kind_rank, item_id


def read_timeline(
    session: Session,
    context: AuthorizationContext,
    *,
    kinds: tuple[StoryKind, ...] = (),
    year: int | None = None,
    order: StoryOrder = StoryOrder.DESC,
    cursor: str | None = None,
    limit: int = DEFAULT_LIMIT,
    include_chapters: bool = False,
) -> StoryPageResult:
    """Return one page of the viewer-authorized timeline.

    An empty `kinds` means all three content types. Only that unfiltered view
    may opt into chapter start markers. Both share the same page limit and
    cursor; markers never become Story content or related-moment candidates.
    The filter narrows the already
    authorized set and never expands it. Viewer-authorized (#1021): the
    result set is `readable()` for the requesting account, so it includes
    that account's own OWNER_ONLY HeartMoments at their ordinary sort
    position, but never the partner's.
    """
    experiences.reconcile(session, context)
    include_chapters = include_chapters and not kinds
    selected = kinds or tuple(StoryKind)
    legs = [_leg(kind, context, year=year) for kind in selected]
    if include_chapters:
        legs.append(_chapter_leg(context, year=year))
    combined = union_all(*legs).subquery("story")

    key = (
        combined.c.effective_date,
        combined.c.created_at,
        combined.c.kind_rank,
        combined.c.id,
    )
    statement = select(*key)

    if cursor is not None:
        position = _decode_cursor(
            cursor,
            context=context,
            kinds=selected,
            year=year,
            order=order,
            include_chapters=include_chapters,
        )
        # Row comparison instead of a nested OR cascade: PostgreSQL compares
        # the tuple lexicographically and therefore implements M2-D08 exactly,
        # strictly after the complete key and never as an offset.
        comparison = tuple_(*key)
        # Cursor values carry their column types so the database comparison is
        # the same operation as the ordering above it.
        counterpart = tuple_(
            *(literal(value, column.type) for value, column in zip(position, key, strict=True))
        )
        statement = statement.where(
            comparison < counterpart if order is StoryOrder.DESC else comparison > counterpart
        )

    direction = (
        [column.desc() for column in key]
        if order is StoryOrder.DESC
        else [column.asc() for column in key]
    )
    rows = session.execute(statement.order_by(*direction).limit(limit + 1)).all()

    has_more = len(rows) > limit
    items: list[StoryRow | ChapterTimelineRow] = []
    for page_position, row in enumerate(rows[:limit]):
        if row.kind_rank == _CHAPTER_KIND_RANK:
            items.append(
                ChapterTimelineRow(
                    kind="CHAPTER",
                    effective_date=row.effective_date,
                    created_at=row.created_at,
                    id=row.id,
                    position=page_position,
                )
            )
        else:
            items.append(
                StoryRow(
                    kind=_kind_of_rank(row.kind_rank),
                    effective_date=row.effective_date,
                    created_at=row.created_at,
                    id=row.id,
                )
            )
    next_cursor = None
    if has_more and items:
        next_cursor = _encode_cursor(
            context=context,
            kinds=selected,
            year=year,
            order=order,
            include_chapters=include_chapters,
            item=items[-1],
        )
    return StoryPageResult(
        items=[item for item in items if isinstance(item, StoryRow)],
        chapter_markers=[item for item in items if isinstance(item, ChapterTimelineRow)],
        next_cursor=next_cursor,
        has_more=has_more,
    )


def _kind_of_rank(rank: int) -> StoryKind:
    for kind, value in _KIND_RANK.items():
        if value == rank:
            return kind
    raise RuntimeError(f"Unknown story kind rank: {rank}")


def viewer_today(session: Session, context: AuthorizationContext) -> date:
    zone = session.scalar(select(Account.timezone).where(Account.id == context.account_id))
    return clock.today_in(zone or "UTC")


def read_available_years(
    session: Session,
    context: AuthorizationContext,
    *,
    kinds: tuple[StoryKind, ...] = (),
    include_chapters: bool = False,
) -> list[int]:
    """Return distinct authorized calendar years for the selected kinds in descending order.

    The active `year` filter is deliberately ignored: users need the full set of
    available years to change their selection, even when viewing a single year or
    when arriving from a deep link with 0 results (#618).

    Viewer-authorized like the Timeline itself (#1021): `readable()` alone
    decides which years an account's own OWNER_ONLY HeartMoments contribute,
    with no separate HeartMoment-only clause to keep in sync with `_leg`.
    """
    from eimir.memories.periods import merged_intervals

    legs = []
    for kind in kinds or tuple(StoryKind):
        model = _MODELS[kind]
        starts = effective_date_expression(model)
        through = func.coalesce(Memory.happened_until, starts) if model is Memory else starts
        legs.append(
            readable(model, context).with_only_columns(
                cast(func.extract("year", starts), Integer).label("first"),
                cast(func.extract("year", through), Integer).label("last"),
            )
        )
    if include_chapters and not kinds:
        start_year = cast(func.extract("year", Chapter.start_on), Integer)
        end_year = cast(func.extract("year", Chapter.end_on), Integer)
        through_year = func.greatest(
            start_year, func.coalesce(end_year, viewer_today(session, context).year)
        )
        legs.append(
            readable(Chapter, context)
            .where(Chapter.start_on.is_not(None))
            .with_only_columns(start_year.label("first"), through_year.label("last"))
        )
    combined = union_all(*legs).subquery("story_years")
    rows = session.execute(select(combined.c.first, combined.c.last).distinct()).all()
    intervals = merged_intervals([(int(row.first), int(row.last)) for row in rows])
    return [year for first, last in reversed(intervals) for year in range(last, first - 1, -1)]
