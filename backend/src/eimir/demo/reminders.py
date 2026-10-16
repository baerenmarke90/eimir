"""M4-C Reminder and Rule examples for the canonical demo Space."""

from __future__ import annotations

from datetime import date, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.demo.service import DemoSeedResult
from eimir.reminders import rules, runtime
from eimir.reminders import service as reminder_service
from eimir.reminders.models import Reminder, ReminderScheduleType, ReminderSource

MANUAL_REMINDER_TITLE = "Gemeinsamer Fototag"


def ensure_reminder_examples(
    session: Session,
    result: DemoSeedResult,
    *,
    reference_date: date,
) -> None:
    """Idempotently add visible M4-C examples through normal Reminder services."""
    lea_context = AuthorizationContext(account_id=result.lea_id, space_id=result.space_id)
    alex_context = AuthorizationContext(account_id=result.alex_id, space_id=result.space_id)

    # Generate Rule-owned reminders from the already seeded shared important
    # date, birthday, relationship anniversary and planned Plans.
    runtime.reconcile_space(session, result.space_id)

    manual_reminders = list(
        session.execute(
            select(Reminder).where(
                Reminder.space_id == result.space_id,
                Reminder.source == ReminderSource.MANUAL.value,
            )
        ).scalars()
    )
    manual = next(
        (
            reminder
            for reminder in manual_reminders
            if reminder.payload.title == MANUAL_REMINDER_TITLE
        ),
        None,
    )
    if manual is None:
        target = reference_date + timedelta(days=45)
        manual = reminder_service.create_reminder(
            session,
            lea_context,
            title=MANUAL_REMINDER_TITLE,
            description="Einmal im Jahr bewusst neue gemeinsame Fotos machen.",
            schedule=reminder_service.ScheduleDefinition(
                type=ReminderScheduleType.ANNUAL,
                annual_month=target.month,
                annual_day=target.day,
                local_time=time(18, 30),
            ),
            offsets=[7, 1],
        ).reminder

    # Show recipient-specific Reminder behavior without changing the shared
    # definition: Alex has muted the canonical manual Reminder.
    reminder_service.set_preference(
        session,
        alex_context,
        manual.id,
        muted=True,
    )

    # Show a real per-recipient Rule preference. Generated Plan reminders stay
    # present for the Space, while Alex has disabled their delivery.
    plan_rule = rules.require(rules.PLAN_START_RULE)
    runtime.set_rule_preference(
        session,
        account_id=alex_context.account_id,
        space_id=alex_context.space_id,
        rule=plan_rule,
        enabled=False,
        parameters={"daysBefore": list(plan_rule.default_days_before)},
    )
