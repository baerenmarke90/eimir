"""Add explicit opt-in for RelatedPerson birthdays on the Dashboard.

Revision ID: 0049
Revises: 0048
Create Date: 2026-09-09

#699 Finding 1: a shared `RelatedPerson` birthday may appear in Dashboard
`upcoming` only when its owner explicitly opts it in. Default off, so
existing rows do not suddenly surface a third-party birthday on `/today`
after this migration - #617 stays intact until someone deliberately turns
this on for a specific person.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0049"
down_revision = "0048"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "related_persons",
        sa.Column(
            "show_birthday_on_dashboard",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.create_check_constraint(
        "dashboard_visibility_needs_a_birthday",
        "related_persons",
        "show_birthday_on_dashboard IS FALSE OR birthday IS NOT NULL",
    )


def downgrade() -> None:
    op.drop_constraint("dashboard_visibility_needs_a_birthday", "related_persons", type_="check")
    op.drop_column("related_persons", "show_birthday_on_dashboard")
