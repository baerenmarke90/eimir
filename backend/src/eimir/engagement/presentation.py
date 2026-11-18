"""Current authorized titles shared by the inbox and encrypted device previews."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, PrivacyClass, readable
from eimir.engagement.models import EngagementTarget
from eimir.plans import discreet
from eimir.plans.models import Plan
from eimir.reminders.models import Reminder, ReminderSource


def recap_period_key(kind: str, year: int, month: int) -> str:
    """``YYYY`` for a year recap, ``YYYY-MM`` for a month recap."""
    return f"{year:04d}" if kind == "YEAR" else f"{year:04d}-{month:02d}"


def target_titles(
    session: Session,
    context: AuthorizationContext,
    targets: set[tuple[EngagementTarget, UUID]],
) -> dict[tuple[EngagementTarget, UUID], str]:
    from eimir.engagement import service

    by_type: dict[EngagementTarget, set[UUID]] = {}
    for target_type, target_id in targets:
        by_type.setdefault(target_type, set()).add(target_id)
    titles: dict[tuple[EngagementTarget, UUID], str] = {}
    for target_type, ids in by_type.items():
        if target_type in {
            EngagementTarget.ONCE_MESSAGE,
            EngagementTarget.TRANSFER_EXPORT,
            EngagementTarget.TRANSFER_IMPORT,
        }:
            continue
        if target_type is EngagementTarget.RECAP:
            # A recap presents only its period as a machine key ("2026-10" or
            # "2026") that clients localize; never a title or source content.
            from eimir.recaps.models import RecapEdition

            for row in session.execute(
                select(
                    RecapEdition.id, RecapEdition.kind, RecapEdition.year, RecapEdition.month
                ).where(RecapEdition.id.in_(ids), RecapEdition.space_id == context.space_id)
            ):
                titles[(target_type, row.id)] = recap_period_key(row.kind, row.year, row.month)
            continue
        model = service._TARGET_MODELS.get(target_type)
        if model is None:
            continue
        statement = readable(model, context).where(
            model.id.in_(ids), model.privacy_class == PrivacyClass.SPACE_SHARED.value
        )
        if target_type is EngagementTarget.REMINDER:
            statement = statement.where(Reminder.source == ReminderSource.MANUAL.value)
        for row in session.scalars(statement):
            if isinstance(row, Plan):
                # A discreet Plan only ever presents its list title (#1790 F3).
                plan_title = discreet.list_title(row)
                if plan_title:
                    titles[(target_type, row.id)] = plan_title
                continue
            field = (
                "text"
                if target_type is EngagementTarget.HEART_MOMENT
                else "name"
                if target_type is EngagementTarget.PLACE
                else "title"
            )
            title = getattr(getattr(row, "payload", None), field, None)
            if title:
                titles[(target_type, row.id)] = title
    return titles


def concealed_targets(
    session: Session,
    targets: set[tuple[EngagementTarget, UUID]],
) -> set[tuple[EngagementTarget, UUID]]:
    """Return the already-authorized targets that are discreet Plans (#1790 F3)."""
    plan_ids = {
        target_id for target_type, target_id in targets if target_type is EngagementTarget.PLAN
    }
    return {
        (EngagementTarget.PLAN, plan_id)
        for plan_id in discreet.discreet_plan_ids(session, plan_ids)
    }


def selection_sizes(
    session: Session,
    context: AuthorizationContext,
    targets: set[tuple[EngagementTarget, UUID]],
) -> dict[UUID, int]:
    """Candidate count of the caller's current round, for its invitation copy only."""
    ids = {
        target_id
        for target_type, target_id in targets
        if target_type is EngagementTarget.WISH_SELECTION
    }
    if not ids:
        return {}
    from eimir.wish_selections import service as wish_selections

    current = wish_selections.get_selection(session, context)
    if current.round is None or current.round.id not in ids:
        return {}
    return {current.round.id: current.round.candidate_count}
