"""M4-C coverage for the complete canonical demo orchestration."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.config import Environment
from eimir.demo import create_demo_space
from eimir.demo.reminders import MANUAL_REMINDER_TITLE
from eimir.reminders import rules
from eimir.reminders.models import Reminder, ReminderPreference, ReminderSource
from eimir.reminders.runtime_models import RulePreference
from tests.conftest import requires_database

pytestmark = [pytest.mark.integration, requires_database]

REFERENCE_DATE = date(2026, 8, 24)
DEMO_PASSWORD = "canonical-demo-reminder-test-password"


def test_complete_demo_includes_stable_reminder_and_rule_examples(session: Session) -> None:
    first = create_demo_space(
        session,
        environment=Environment.TEST,
        lea_password=DEMO_PASSWORD,
        alex_password=DEMO_PASSWORD,
        reference_date=REFERENCE_DATE,
    )
    second = create_demo_space(
        session,
        environment=Environment.TEST,
        lea_password=DEMO_PASSWORD,
        alex_password=DEMO_PASSWORD,
        reference_date=REFERENCE_DATE,
    )

    assert first.space_id == second.space_id

    reminders = list(
        session.execute(select(Reminder).where(Reminder.space_id == first.space_id)).scalars()
    )
    manual = [
        reminder
        for reminder in reminders
        if reminder.source == ReminderSource.MANUAL.value
        and reminder.payload.title == MANUAL_REMINDER_TITLE
    ]
    assert len(manual) == 1

    generated_rule_keys = {
        reminder.rule_key
        for reminder in reminders
        if reminder.source == ReminderSource.GENERATED.value
    }
    assert {
        rules.IMPORTANT_DATE_RULE,
        rules.RELATED_PERSON_BIRTHDAY_RULE,
        rules.RELATIONSHIP_ANNIVERSARY_RULE,
        rules.PLAN_START_RULE,
    } <= generated_rule_keys

    alex_mute = session.execute(
        select(ReminderPreference).where(
            ReminderPreference.reminder_id == manual[0].id,
            ReminderPreference.account_id == first.alex_id,
        )
    ).scalar_one()
    assert alex_mute.muted is True

    alex_plan_rule = session.execute(
        select(RulePreference).where(
            RulePreference.account_id == first.alex_id,
            RulePreference.space_id == first.space_id,
            RulePreference.rule_key == rules.PLAN_START_RULE,
        )
    ).scalar_one()
    assert alex_plan_rule.enabled is False
