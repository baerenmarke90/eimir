"""The audit action enum, its table constraint and the latest migration agree (#2189)."""

from __future__ import annotations

from typing import cast

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import CheckConstraint, Table

from eimir.administration.models import AdministrationAction, InstanceAdministrationActionEvent

SUPPORT_REPORT_ACTIONS = {
    "support_report.state_set",
    "support_report.reply_sent",
    "support_report.ticket_created",
    "support_report.ticket_cleared",
    "support_report.archived",
    "support_report.unarchived",
    "support_report.deleted",
}


def _constraint_actions() -> set[str]:
    table = cast(Table, InstanceAdministrationActionEvent.__table__)
    constraint = next(
        item
        for item in table.constraints
        if isinstance(item, CheckConstraint)
        and item.name == "ck_instance_administration_action_events_action_valid"
    )
    text = str(constraint.sqltext)
    listed = text.split("(", 1)[1].rstrip(")")
    return {part.strip().strip("'") for part in listed.split(",")}


def test_the_support_report_actions_are_audit_actions() -> None:
    assert {action.value for action in AdministrationAction} >= SUPPORT_REPORT_ACTIONS


def test_the_table_constraint_admits_every_action() -> None:
    assert _constraint_actions() == {action.value for action in AdministrationAction}


def test_the_migration_admits_every_action_and_chains_after_0176() -> None:
    script = ScriptDirectory.from_config(Config("alembic.ini")).get_revision("0177")
    migration = script.module

    assert script.down_revision == "0176"
    assert set(migration.ACTIONS) == {action.value for action in AdministrationAction}
    assert len(migration.ACTIONS) == len(set(migration.ACTIONS))
