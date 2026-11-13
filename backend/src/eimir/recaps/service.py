"""Space-authorized recap preparation, source projection and editorial writes."""

from __future__ import annotations

from collections import Counter
from datetime import date, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import Date, String, cast, delete, func, literal, select, union_all
from sqlalchemy.orm import Session

from eimir.attachments.binding import attachments_of_memories
from eimir.attachments.models import AttachmentStatus
from eimir.authorization import AuthorizationContext, PrivacyClass, readable
from eimir.chapters.models import Chapter
from eimir.core import clock
from eimir.core.errors import (
    ConflictError,
    ErrorCode,
    NotFoundError,
    PremiumEntitlementRequiredError,
    ValidationError,
)
from eimir.core.ids import new_id, parse_id
from eimir.entitlements import service as entitlements
from eimir.heart_moments.models import HeartMoment
from eimir.identity.models import Account
from eimir.jobs import queue
from eimir.jobs.models import Job, JobStatus
from eimir.memories.models import Memory
from eimir.milestones.models import Milestone
from eimir.plans.media import photos_of_plans
from eimir.plans.models import Plan, PlanStatus
from eimir.recaps import mood, words
from eimir.recaps.composition import MANUAL_SELECTION_LIMIT, Candidate, period_bounds
from eimir.recaps.models import (
    RecapEdition,
    RecapKind,
    RecapPayload,
    RecapReflection,
    RecapReflectionPayload,
    RecapSource,
    RecapSourceKind,
)
from eimir.relations.models import ChapterHeartMoment, ChapterMemory, ChapterMilestone
from eimir.relationship.models import Membership, Space, SpaceConfiguration

CAPABILITY = "relationship.passport"
GENERATE_JOB = "recap.generate.v1"
BACKFILL_JOB = "recap.backfill.v1"
# Earlier periods are prepared in small delayed batches so a long shared history
# never monopolizes the worker or the single local inference slot.
BACKFILL_BATCH = 6
BACKFILL_DELAY = timedelta(minutes=2)
# A completed period stays open for late entries and curation for one week (#1744).
FINALISE_AFTER = timedelta(days=7)
FINALISE_BATCH = 50
MODELS: dict[RecapSourceKind, Any] = {
    RecapSourceKind.MEMORY: Memory,
    RecapSourceKind.HEART_MOMENT: HeartMoment,
    RecapSourceKind.MILESTONE: Milestone,
    RecapSourceKind.CHAPTER: Chapter,
    RecapSourceKind.PLAN: Plan,
}


def can_compose(
    session: Session, context: AuthorizationContext, *, lock_grants: bool = False
) -> bool:
    return entitlements.has_capability(
        session, context.space_id, CAPABILITY, lock_grants=lock_grants
    )


def ensure_capability(session: Session, space_id: UUID, capability: str) -> None:
    if not entitlements.has_capability(session, space_id, capability):
        raise PremiumEntitlementRequiredError(capability)


def calendar_context(session: Session, context: AuthorizationContext) -> tuple[str, str]:
    space = session.get(Space, context.space_id)
    configuration = session.scalar(
        select(SpaceConfiguration).where(SpaceConfiguration.space_id == context.space_id)
    )
    founder = (
        session.get(Account, space.configuration_manager_account_id)
        if space and space.configuration_manager_account_id
        else None
    )
    if founder is None:
        founder = session.scalar(
            select(Account)
            .join(Membership, Membership.account_id == Account.id)
            .where(Membership.space_id == context.space_id)
            .order_by(Membership.created_at, Membership.id)
            .limit(1)
        )
    zone = (
        configuration.daily_context_timezone
        if configuration and configuration.daily_context_timezone
        else founder.timezone
        if founder
        else "UTC"
    )
    return clock.resolve_zone(zone).key, founder.locale if founder else "en"


def _date_column(kind: RecapSourceKind, model: Any) -> Any:
    if kind == RecapSourceKind.CHAPTER:
        return func.coalesce(model.start_on, cast(func.timezone("UTC", model.created_at), Date))
    if kind == RecapSourceKind.PLAN:
        return model.experienced_on
    return func.coalesce(model.happened_on, cast(func.timezone("UTC", model.created_at), Date))


def _metadata(context: AuthorizationContext) -> Any:
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


def candidates(
    session: Session, context: AuthorizationContext, starts: date, through: date, variant: int = 0
) -> list[Candidate]:
    """A bounded pool drawn across the full period, before any content is read."""
    source = _metadata(context)
    ranked = (
        select(
            source,
            func.row_number()
            .over(
                partition_by=(source.c.kind, func.extract("month", source.c.day)),
                order_by=(func.md5(cast(source.c.id, String) + str(variant)), source.c.id),
            )
            .label("rank"),
        )
        .where(source.c.day <= through, source.c.through >= starts)
        .subquery()
    )
    values = (
        session.execute(
            select(ranked).where(ranked.c.rank <= 4).order_by(ranked.c.day, ranked.c.id)
        )
        .mappings()
        .all()
    )
    result = [
        Candidate(RecapSourceKind(item["kind"]), item["id"], item["day"], item["version"])
        for item in values
    ]
    # Explicit chapter links prevent a single trip from occupying every spread.
    groups: dict[tuple[RecapSourceKind, UUID], str] = {}
    for kind, relation, column in (
        (RecapSourceKind.MEMORY, ChapterMemory, ChapterMemory.memory_id),
        (RecapSourceKind.HEART_MOMENT, ChapterHeartMoment, ChapterHeartMoment.heart_moment_id),
        (RecapSourceKind.MILESTONE, ChapterMilestone, ChapterMilestone.milestone_id),
    ):
        ids = [item.id for item in result if item.kind == kind]
        if ids:
            links = session.execute(
                select(column, relation.chapter_id)
                .join(Chapter, Chapter.id == relation.chapter_id)
                .where(
                    relation.space_id == context.space_id,
                    column.in_(ids),
                    Chapter.privacy_class == PrivacyClass.SPACE_SHARED.value,
                )
                .order_by(relation.chapter_id)
            )
            for source_id, chapter_id in links:
                groups.setdefault((kind, source_id), str(chapter_id))
    loved = words.loved_memories(
        session, context, [item.id for item in result if item.kind == RecapSourceKind.MEMORY]
    )
    return [
        Candidate(
            i.kind,
            i.id,
            i.occurred_on,
            i.version,
            str(i.id) if i.kind == RecapSourceKind.CHAPTER else groups.get((i.kind, i.id)),
            i.id in loved,
        )
        for i in result
    ]


def facts(
    session: Session, context: AuthorizationContext, value: RecapEdition
) -> dict[str, Any] | None:
    """Counted shared entries of the frozen period; never an inferred relationship claim."""
    source = _metadata(context)
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


def periods(session: Session, context: AuthorizationContext, today: date) -> list[dict[str, Any]]:
    source = _metadata(context)
    from eimir.memories.periods import merged_intervals

    ranges = session.execute(
        select(source.c.day, source.c.through).where(source.c.day <= today).distinct()
    ).all()
    intervals = merged_intervals(
        [
            (
                max(starts, date(1900, 1, 1)).year * 12 + max(starts, date(1900, 1, 1)).month - 1,
                min(through, today).year * 12 + min(through, today).month - 1,
            )
            for starts, through in ranges
        ]
    )
    months = {
        (month // 12, month % 12 + 1)
        for first, last in intervals
        for month in range(first, last + 1)
    }
    keys = {(RecapKind.MONTH, int(year), int(month)) for year, month in months}
    keys |= {(RecapKind.YEAR, int(year), 0) for year, _ in months}
    keys |= {(RecapKind.MONTH, today.year, today.month), (RecapKind.YEAR, today.year, 0)}
    return [
        {"kind": kind, "year": year, "month": month}
        for kind, year, month in sorted(
            keys, key=lambda value: (value[1], value[2], value[0]), reverse=True
        )
    ]


def edition(
    session: Session,
    context: AuthorizationContext,
    edition_id: UUID | str,
    *,
    write: bool = False,
    version: int | None = None,
) -> RecapEdition:
    parsed_id = parse_id(str(edition_id))
    if parsed_id is None:
        raise NotFoundError("Recap not found.", "RESOURCE_NOT_FOUND")
    statement = select(RecapEdition).where(
        RecapEdition.id == parsed_id, RecapEdition.space_id == context.space_id
    )
    if write:
        statement = statement.with_for_update()
    value = session.scalar(statement.execution_options(populate_existing=True))
    if value is None:
        raise NotFoundError("Recap not found.", "RESOURCE_NOT_FOUND")
    if version is not None and value.version != version:
        raise ConflictError("The recap changed. Read it again.", ErrorCode.VERSION_CONFLICT)
    return value


def request_period(
    session: Session,
    context: AuthorizationContext,
    kind: RecapKind,
    year: int,
    month: int,
    *,
    variant: int = 0,
    refresh: bool = False,
) -> RecapEdition:
    ensure_capability(session, context.space_id, CAPABILITY)
    zone, locale = calendar_context(session, context)
    today = clock.today_in(zone)
    try:
        starts, through, partial = period_bounds(kind, year, month, today)
    except ValueError:
        raise ValidationError("Invalid recap period.", ErrorCode.VALIDATION_FAILED) from None
    if not 0 <= variant <= 3:
        raise ValidationError("Invalid recap variant.", ErrorCode.VALIDATION_FAILED)
    session.execute(select(func.pg_advisory_xact_lock(context.space_id.int & ((1 << 63) - 1))))
    existing = session.scalar(
        select(RecapEdition)
        .where(
            RecapEdition.space_id == context.space_id,
            RecapEdition.kind == kind.value,
            RecapEdition.year == year,
            RecapEdition.month == month,
            RecapEdition.variant == variant,
            RecapEdition.saved_at.is_(None),
        )
        .with_for_update()
    )
    if existing is None and not refresh:
        saved = session.scalar(
            select(RecapEdition)
            .where(
                RecapEdition.space_id == context.space_id,
                RecapEdition.kind == kind.value,
                RecapEdition.year == year,
                RecapEdition.month == month,
                RecapEdition.variant == variant,
                RecapEdition.saved_at.is_not(None),
                RecapEdition.through_on == through,
                RecapEdition.is_partial == partial,
            )
            .order_by(RecapEdition.saved_at.desc())
            .limit(1)
        )
        if saved:
            return saved
    pending = (
        existing is not None
        and existing.status == "PENDING"
        and session.scalar(
            select(Job.id)
            .where(
                Job.kind == GENERATE_JOB,
                Job.status.in_((JobStatus.PENDING.value, JobStatus.RUNNING.value)),
                Job.payload["request_token"].astext == str(existing.request_token),
            )
            .limit(1)
        )
        is not None
    )
    if existing and (
        pending
        or (
            not refresh
            and existing.status in {"READY", "EMPTY"}
            and (
                existing.customized
                or (existing.through_on == through and existing.is_partial == partial)
            )
        )
    ):
        return existing
    if existing is None:
        existing = RecapEdition(
            id=new_id(),
            space_id=context.space_id,
            kind=kind.value,
            year=year,
            month=month,
            variant=variant,
            timezone=zone,
            locale=locale,
            starts_on=starts,
            through_on=through,
            is_partial=partial,
            status="PENDING",
            request_token=new_id(),
            payload=RecapPayload(),
        )
        session.add(existing)
    else:
        # One deliberate retry per minute bounds local inference work.
        if (
            refresh
            and existing.updated_at
            and clock.now() - clock.ensure_utc(existing.updated_at) < timedelta(seconds=60)
        ):
            return existing
        existing.through_on = through
        existing.is_partial = partial
        existing.status = "PENDING"
        existing.request_token = new_id()
    session.flush()
    queue.enqueue(
        session,
        GENERATE_JOB,
        {
            "space_id": str(context.space_id),
            "account_id": str(context.account_id),
            "edition_id": str(existing.id),
            "request_token": str(existing.request_token),
        },
        max_attempts=3,
    )
    return existing


def unprepared(
    session: Session, context: AuthorizationContext, today: date
) -> list[dict[str, Any]]:
    """Periods with shared material that have no edition yet, newest first."""
    existing = {
        (kind, year, month)
        for kind, year, month in session.execute(
            select(RecapEdition.kind, RecapEdition.year, RecapEdition.month)
            .where(RecapEdition.space_id == context.space_id)
            .distinct()
        )
    }
    return [
        item
        for item in periods(session, context, today)
        if (item["kind"].value, item["year"], item["month"]) not in existing
    ]


def prepare_current(session: Session, context: AuthorizationContext) -> int:
    """Request the current periods and one batch of earlier ones; return what is left."""
    zone, _ = calendar_context(session, context)
    today = clock.today_in(zone)
    previous = date(today.year, today.month, 1) - timedelta(days=1)
    current = [
        (RecapKind.MONTH, today.year, today.month),
        (RecapKind.YEAR, today.year, 0),
        (RecapKind.MONTH, previous.year, previous.month),
        (RecapKind.YEAR, today.year - 1, 0),
    ]
    for kind, year, month in current:
        # Completed empty historical periods do not create decorative editions.
        if year != today.year or (kind == RecapKind.MONTH and month != today.month):
            starts, through, _ = period_bounds(kind, year, month, today)
            if not candidates(session, context, starts, through):
                continue
        request_period(session, context, kind, year, month)
    session.flush()
    earlier = unprepared(session, context, today)
    for item in earlier[:BACKFILL_BATCH]:
        request_period(session, context, item["kind"], item["year"], item["month"])
    finalise_completed(session, context, today)
    remaining = max(len(earlier) - BACKFILL_BATCH, 0)
    if remaining:
        schedule_backfill(session, context)
    return remaining


def finalise_completed(session: Session, context: AuthorizationContext, today: date) -> int:
    """Retain completed periods once their grace week has passed; no manual step.

    Only the default variant of a period without a retained edition is finalised.
    A stale automatic proposal is first recomposed over the whole period, while a
    curated selection is kept exactly as the couple left it.
    """
    session.execute(select(func.pg_advisory_xact_lock(context.space_id.int & ((1 << 63) - 1))))
    live = session.scalars(
        select(RecapEdition)
        .where(
            RecapEdition.space_id == context.space_id,
            RecapEdition.saved_at.is_(None),
            RecapEdition.variant == 0,
            RecapEdition.status == "READY",
            RecapEdition.starts_on <= today - FINALISE_AFTER,
        )
        .order_by(RecapEdition.year, RecapEdition.month, RecapEdition.id)
        .limit(FINALISE_BATCH)
        .with_for_update()
    ).all()
    taken = {
        (kind, year, month)
        for kind, year, month in session.execute(
            select(RecapEdition.kind, RecapEdition.year, RecapEdition.month).where(
                RecapEdition.space_id == context.space_id,
                RecapEdition.saved_at.is_not(None),
                RecapEdition.variant == 0,
            )
        )
    }
    finalised = 0
    for value in live:
        kind = RecapKind(value.kind)
        _, through, partial = period_bounds(kind, value.year, value.month, today)
        if (
            partial
            or through > today - FINALISE_AFTER
            or (value.kind, value.year, value.month) in taken
        ):
            continue
        if value.is_partial or value.through_on != through:
            if not value.customized:
                request_period(session, context, kind, value.year, value.month)
                continue
            # The couple's own selection stands; only the frozen period is completed.
            value.through_on, value.is_partial = through, False
            value.payload = value.payload.model_copy(
                update={
                    "mood": mood.refreshed(
                        session,
                        context.space_id,
                        kind,
                        value.starts_on,
                        through,
                        value.payload.mood,
                    )
                }
            )
        value.saved_at = clock.now()
        finalised += 1
    return finalised


def schedule_backfill(session: Session, context: AuthorizationContext) -> None:
    """Keep at most one waiting continuation per Space."""
    session.execute(select(func.pg_advisory_xact_lock(context.space_id.int & ((1 << 63) - 1))))
    waiting = session.scalar(
        select(Job.id)
        .where(
            Job.kind == BACKFILL_JOB,
            Job.status == JobStatus.PENDING.value,
            Job.payload["space_id"].astext == str(context.space_id),
        )
        .limit(1)
    )
    if waiting is None:
        queue.enqueue(
            session,
            BACKFILL_JOB,
            {"space_id": str(context.space_id), "account_id": str(context.account_id)},
            delay=BACKFILL_DELAY,
            max_attempts=3,
        )


def source_material(
    session: Session,
    context: AuthorizationContext,
    item: Candidate,
    *,
    lock: bool = False,
    own_words: bool = False,
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
    attachment = None
    sensitive = False
    from eimir.attachments.binding import cover_of
    from eimir.heart_moments.media import galleries as heart_galleries

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
        attachment, sensitive = photo.id, photo.payload.is_sensitive
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
        result["quote"] = words.quote(session, context, item.kind, item.id, value.owner_id)
        result["mutual_reaction"] = (
            words.mutual_reaction(words.partners(session, context.space_id), payload, attachment)
            if item.kind == RecapSourceKind.MEMORY
            else None
        )
    return result


def materials(
    session: Session, context: AuthorizationContext, value: RecapEdition
) -> tuple[list[dict[str, Any]], bool]:
    result = []
    unchanged = True
    refs = session.scalars(
        select(RecapSource).where(RecapSource.edition_id == value.id).order_by(RecapSource.position)
    ).all()
    for ref in refs:
        metadata = _metadata(context)
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
            }
        )
    # The reaction line stays rare: only the first few in reading order keep it.
    shown = 0
    for item in result:
        if item.get("mutual_reaction"):
            shown += 1
            if shown > words.REACTION_LINES_PER_EDITION:
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
            "mood": mood.visible(session, context.space_id, value.payload)
            if value.status == "READY"
            else None,
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
        }
    )
    return result


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
    source = _metadata(context)
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
        )
        result.append(item)
    return result


def replace_sources(
    session: Session, context: AuthorizationContext, value: RecapEdition, keys: list[str]
) -> None:
    if value.saved_at:
        raise ConflictError("A saved edition cannot be recomposed.", ErrorCode.VERSION_CONFLICT)
    pool = candidates(session, context, value.starts_on, value.through_on, value.variant)
    existing = {item.key: item for item in pool}
    current = session.scalars(select(RecapSource).where(RecapSource.edition_id == value.id)).all()
    for ref in current:
        if f"{ref.kind}:{ref.source_id}" not in existing:
            material, _ = materials(session, context, value)
            for item in material:
                if item["available"]:
                    existing[item["key"]] = Candidate(
                        RecapSourceKind(item["kind"]),
                        item["id"],
                        item["occurred_on"],
                        item["version"],
                    )
            break
    if (
        len(keys) > MANUAL_SELECTION_LIMIT
        or len(set(keys)) != len(keys)
        or any(key not in existing for key in keys)
    ):
        raise ValidationError(
            "Only eligible shared period sources can be selected.", ErrorCode.VALIDATION_FAILED
        )
    session.execute(delete(RecapSource).where(RecapSource.edition_id == value.id))
    for position, key in enumerate(keys):
        chosen = existing[key]
        session.add(
            RecapSource(
                edition_id=value.id,
                kind=chosen.kind.value,
                source_id=chosen.id,
                source_version=chosen.version,
                position=position,
            )
        )
    value.payload = RecapPayload(mood=value.payload.mood)
    value.generated_by = "RULES"
    value.customized = True
    value.status = "READY" if keys else "EMPTY"
    value.request_token = new_id()


def write_reflection(
    session: Session,
    context: AuthorizationContext,
    value: RecapEdition,
    text_value: str,
    shared: bool,
    expected_version: int,
) -> None:
    if not text_value.strip():
        raise ValidationError("Reflection must contain text.", ErrorCode.VALIDATION_FAILED)
    privacy = PrivacyClass.SPACE_SHARED.value if shared else PrivacyClass.OWNER_ONLY.value
    existing = session.scalar(
        select(RecapReflection)
        .where(
            RecapReflection.edition_id == value.id,
            RecapReflection.space_id == context.space_id,
            RecapReflection.owner_id == context.account_id,
            RecapReflection.privacy_class == privacy,
        )
        .with_for_update()
    )
    if existing is None:
        ensure_capability(session, context.space_id, CAPABILITY)
        if expected_version != 0:
            raise ConflictError("Reflection changed.", ErrorCode.VERSION_CONFLICT)
        existing = RecapReflection(
            space_id=context.space_id,
            owner_id=context.account_id,
            privacy_class=privacy,
            edition_id=value.id,
            payload=RecapReflectionPayload(text=text_value),
        )
        session.add(existing)
    else:
        if existing.version != expected_version:
            raise ConflictError("Reflection changed.", ErrorCode.VERSION_CONFLICT)
        existing.payload = RecapReflectionPayload(text=text_value)
    # A private draft and its deliberately shared counterpart are distinct rows.
    session.flush()


def withdraw_reflection(
    session: Session, context: AuthorizationContext, value: RecapEdition, expected_version: int
) -> None:
    own = session.scalar(
        readable(RecapReflection, context)
        .where(
            RecapReflection.edition_id == value.id,
            RecapReflection.owner_id == context.account_id,
            RecapReflection.privacy_class == PrivacyClass.SPACE_SHARED.value,
        )
        .with_for_update()
    )
    if own is None:
        raise NotFoundError("Reflection not found.", "RESOURCE_NOT_FOUND")
    if own.version != expected_version:
        raise ConflictError("Reflection changed.", ErrorCode.VERSION_CONFLICT)
    session.delete(own)


def store_selection(session: Session, value: RecapEdition, selected: list[Candidate]) -> None:
    session.execute(delete(RecapSource).where(RecapSource.edition_id == value.id))
    for position, source in enumerate(selected):
        session.add(
            RecapSource(
                edition_id=value.id,
                kind=source.kind.value,
                source_id=source.id,
                source_version=source.version,
                position=position,
            )
        )
