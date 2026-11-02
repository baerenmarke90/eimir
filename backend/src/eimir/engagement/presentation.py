"""Current authorized titles shared by the inbox and encrypted device previews."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, PrivacyClass, readable
from eimir.engagement.models import EngagementTarget
from eimir.reminders.models import Reminder, ReminderSource


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
        if target_type in {EngagementTarget.TRANSFER_EXPORT, EngagementTarget.TRANSFER_IMPORT}:
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
