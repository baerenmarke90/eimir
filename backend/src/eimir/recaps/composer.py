"""Recap composition: the selection pool, requests and the life of an edition.

Requesting and preparing periods, retaining completed ones, noticing late
entries and weighing newer versions compose something new, which is Premium
(``relationship.passport``). The Core read and reflection functions stay in
``eimir.recaps.service``.
"""

from __future__ import annotations

from datetime import date, timedelta
from uuid import UUID

from sqlalchemy import String, cast, delete, func, select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, PrivacyClass
from eimir.chapters.models import Chapter
from eimir.core import clock
from eimir.core.errors import ErrorCode, ValidationError
from eimir.core.ids import new_id
from eimir.jobs import queue
from eimir.jobs.models import Job, JobStatus
from eimir.recaps import freshness, mood, notices, words
from eimir.recaps.composition import Candidate, period_bounds
from eimir.recaps.models import (
    RecapEdition,
    RecapFilm,
    RecapKind,
    RecapPayload,
    RecapSource,
    RecapSourceKind,
)
from eimir.recaps.presentation import source_metadata
from eimir.recaps.service import CAPABILITY, calendar_context, ensure_capability, unprepared
from eimir.relations.models import ChapterHeartMoment, ChapterMemory, ChapterMilestone

GENERATE_JOB = "recap.generate.v1"
BACKFILL_JOB = "recap.backfill.v1"
# A follow-up scan of one Space once a changed period has had time to settle.
REFRESH_JOB = "recap.refresh.v1"
# Earlier periods are prepared in small delayed batches so a long shared history
# never monopolizes the worker or the single local inference slot.
BACKFILL_BATCH = 6
BACKFILL_DELAY = timedelta(minutes=2)
# A completed period stays open for late entries and curation for one week (#1744).
FINALISE_AFTER = timedelta(days=7)
FINALISE_BATCH = 50


def candidates(
    session: Session,
    context: AuthorizationContext,
    starts: date,
    through: date,
    variant: int = 0,
    *,
    per_month: int = 4,
    starting_only: bool = False,
) -> list[Candidate]:
    """A bounded pool drawn across the full period, before any content is read.

    The monthly film reads a wider pool, limited to moments that start in the
    month, because its selection depends on content rather than on chance.
    """
    source = source_metadata(context)
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
        .where(
            source.c.day <= through,
            source.c.day >= starts if starting_only else source.c.through >= starts,
        )
        .subquery()
    )
    values = (
        session.execute(
            select(ranked).where(ranked.c.rank <= per_month).order_by(ranked.c.day, ranked.c.id)
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
        and _generation_waiting(session, existing)
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
    _enqueue_generation(session, context, existing)
    return existing


def _enqueue_generation(
    session: Session, context: AuthorizationContext, value: RecapEdition
) -> None:
    queue.enqueue(
        session,
        GENERATE_JOB,
        {
            "space_id": str(context.space_id),
            "account_id": str(context.account_id),
            "edition_id": str(value.id),
            "request_token": str(value.request_token),
        },
        max_attempts=3,
    )


def _generation_waiting(session: Session, value: RecapEdition) -> bool:
    return (
        session.scalar(
            select(Job.id)
            .where(
                Job.kind == GENERATE_JOB,
                Job.status.in_((JobStatus.PENDING.value, JobStatus.RUNNING.value)),
                Job.payload["request_token"].astext == str(value.request_token),
            )
            .limit(1)
        )
        is not None
    )


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
    unsettled = track_late_entries(session, context, today)
    finalise_completed(session, context, today, unsettled=unsettled)
    remaining = max(len(earlier) - BACKFILL_BATCH, 0)
    if remaining:
        schedule_backfill(session, context)
    return remaining


def finalise_completed(
    session: Session,
    context: AuthorizationContext,
    today: date,
    *,
    unsettled: set[UUID] | frozenset[UUID] = frozenset(),
) -> int:
    """Retain completed periods once their grace week has passed; no manual step.

    Only the default variant of a period without a retained edition is finalised.
    A stale automatic proposal is first recomposed over the whole period, while a
    curated selection is kept exactly as the couple left it. A proposal whose
    material is still settling (``unsettled``) waits for its recomposition. A
    retained edition records the readiness notice it earns (#1744).
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
            RecapEdition.supersedes_id.is_(None),
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
            or value.id in unsettled
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
        notices.announce_retained(session, context, value, today)
        finalised += 1
    return finalised


def track_late_entries(session: Session, context: AuthorizationContext, today: date) -> set[UUID]:
    """Notice late entries in composed periods and act once a period is quiet (#1744).

    An automatic proposal is recomposed over its period. A retained edition gets
    a candidate version with the same frozen look; ``settle_version`` keeps it
    only when the late material is significant. Curated selections and manual
    variants are left alone. A year waits while one of its months is settling,
    so it picks up the month's final highlight. Returns the proposals that must
    not be retained in this run.
    """
    session.execute(select(func.pg_advisory_xact_lock(context.space_id.int & ((1 << 63) - 1))))
    now = clock.now()
    current = freshness.fingerprints(session, context)
    groups: dict[freshness.Period, list[RecapEdition]] = {}
    for row in session.scalars(
        select(RecapEdition)
        .where(RecapEdition.space_id == context.space_id, RecapEdition.variant == 0)
        .order_by(RecapEdition.id)
        .with_for_update()
    ):
        groups.setdefault((row.kind, row.year, row.month), []).append(row)
    unsettled: set[UUID] = set()
    busy_years: set[int] = set()
    follow_up = False
    for period in sorted(groups, key=lambda key: (key[0] != RecapKind.MONTH.value, key[1], key[2])):
        kind, year, _ = period
        if kind == RecapKind.YEAR.value and year in busy_years:
            continue
        rows = groups[period]
        live = next((row for row in rows if row.saved_at is None), None)
        kept = [row for row in rows if row.saved_at is not None]
        retained = max(kept, key=lambda row: row.saved_at or row.created_at) if kept else None
        if live is not None and live.supersedes_id is not None:
            if live.status == "PENDING" and _generation_waiting(session, live):
                busy_years.add(year)
            else:
                # A candidate version that can no longer finish is discarded;
                # the next run weighs the period again.
                session.execute(delete(RecapEdition).where(RecapEdition.id == live.id))
                session.expunge(live)
            continue
        if live is not None:
            if live.status == "PENDING":
                busy_years.add(year)
                continue
            if live.customized or live.status not in {"READY", "EMPTY"}:
                continue
            target, is_retained = live, False
        elif retained is not None and not retained.customized:
            target, is_retained = retained, True
        else:
            continue
        material = current.get(period, freshness.EMPTY)
        seen = freshness.observe(
            target.material_digest,
            target.observed_digest,
            target.observed_at,
            material,
            now,
            retained=is_retained,
        )
        if (target.observed_digest, target.observed_at) != (seen.observed_digest, seen.observed_at):
            target.observed_digest, target.observed_at = seen.observed_digest, seen.observed_at
        if seen.step is freshness.Step.BASELINE:
            target.material_digest = material
            target.material_at = func.now()
        elif seen.step is freshness.Step.WAIT:
            busy_years.add(year)
            follow_up = True
            if not is_retained:
                unsettled.add(target.id)
        elif seen.step is freshness.Step.ACT:
            busy_years.add(year)
            if is_retained:
                start_version(session, context, target, today)
            else:
                unsettled.add(target.id)
                _requeue(session, context, target, today)
    if follow_up:
        schedule_refresh(session, context)
    return unsettled


def _requeue(
    session: Session, context: AuthorizationContext, value: RecapEdition, today: date
) -> None:
    _, through, partial = period_bounds(RecapKind(value.kind), value.year, value.month, today)
    value.through_on, value.is_partial = through, partial
    value.status = "PENDING"
    value.request_token = new_id()
    session.flush()
    _enqueue_generation(session, context, value)


def start_version(
    session: Session, context: AuthorizationContext, retained: RecapEdition, today: date
) -> RecapEdition:
    """Compose a candidate newer version of a retained edition with its frozen look."""
    starts, through, _ = period_bounds(
        RecapKind(retained.kind), retained.year, retained.month, today
    )
    film = retained.payload.film
    draft = RecapEdition(
        id=new_id(),
        space_id=retained.space_id,
        kind=retained.kind,
        year=retained.year,
        month=retained.month,
        variant=0,
        timezone=retained.timezone,
        locale=retained.locale,
        starts_on=starts,
        through_on=through,
        is_partial=False,
        status="PENDING",
        request_token=new_id(),
        payload=RecapPayload(
            mood=retained.payload.mood, film=RecapFilm(look=film.look) if film else None
        ),
        supersedes_id=retained.id,
    )
    session.add(draft)
    session.flush()
    _enqueue_generation(session, context, draft)
    return draft


def settle_version(
    session: Session, context: AuthorizationContext, draft: RecapEdition, today: date
) -> bool:
    """Keep a composed candidate version only when its late material is significant.

    Late moments are selected moments the retained film did not show and that
    were created or changed after it was composed. The version is kept when one
    of them becomes the highlight or at least ``LATE_MOMENTS`` join the film;
    then the retained edition stays readable and the new one is announced once.
    Otherwise the candidate is discarded and the retained edition records that
    it has weighed this material, so the same material is not weighed again.
    """
    retained = (
        session.scalar(
            select(RecapEdition)
            .where(
                RecapEdition.id == draft.supersedes_id,
                RecapEdition.space_id == context.space_id,
            )
            .with_for_update()
        )
        if draft.supersedes_id
        else None
    )
    session.flush()
    selected = [
        f"{kind}:{source_id}"
        for kind, source_id in session.execute(
            select(RecapSource.kind, RecapSource.source_id)
            .where(RecapSource.edition_id == draft.id)
            .order_by(RecapSource.position)
        )
    ]
    keep = False
    if retained is not None and retained.saved_at is not None and draft.status == "READY":
        previous = {
            f"{kind}:{source_id}"
            for kind, source_id in session.execute(
                select(RecapSource.kind, RecapSource.source_id).where(
                    RecapSource.edition_id == retained.id
                )
            )
        }
        since = retained.material_at or retained.generated_at or retained.saved_at
        changed = freshness.changed_since(
            session, context, [key for key in selected if key not in previous], since
        )
        late = freshness.late_moments(previous, selected, changed)
        film = draft.payload.film
        keep = freshness.significant(late, film.highlight_key if film else None)
    if retained is not None:
        retained.material_digest = draft.material_digest
        retained.observed_digest = retained.observed_at = None
    if keep:
        draft.saved_at = clock.now()
        notices.announce_retained(session, context, draft, today, grew=True)
    else:
        session.execute(delete(RecapEdition).where(RecapEdition.id == draft.id))
        session.expunge(draft)
    return keep


def schedule_refresh(session: Session, context: AuthorizationContext) -> None:
    """One follow-up scan of the Space after the quiet period, at most one waiting."""
    waiting = session.scalar(
        select(Job.id)
        .where(
            Job.kind == REFRESH_JOB,
            Job.status == JobStatus.PENDING.value,
            Job.payload["space_id"].astext == str(context.space_id),
        )
        .limit(1)
    )
    if waiting is None:
        queue.enqueue(
            session,
            REFRESH_JOB,
            {"space_id": str(context.space_id), "account_id": str(context.account_id)},
            delay=freshness.QUIET + timedelta(minutes=5),
            max_attempts=3,
        )


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
