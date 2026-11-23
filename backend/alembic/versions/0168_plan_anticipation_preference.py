"""A three-state countdown preference replaces the opt-in flag (#2158 D).

The Wir countdown now shows the next upcoming Plan automatically. A Plan can
still be pinned (``ALWAYS``) or kept off the countdown (``NEVER``). Until now
``false`` only meant "not chosen", never an explicit refusal, so existing
``false`` rows become ``AUTOMATIC`` and existing ``true`` rows become ``ALWAYS``.

A new column replaces the flag instead of reinterpreting it as a nullable
boolean: Transfer bundles copy Plan rows column by column, and a bundle from
before this revision must stay unambiguous on import (see
``eimir.transfer.service._prepare_row``).

Downgrade restores the flag: only ``ALWAYS`` becomes ``true``; ``AUTOMATIC``
and ``NEVER`` both become ``false``, which is what the earlier code showed.

Revision ID: 0168
Revises: 0167
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0168"
down_revision = "0167"
branch_labels = None
depends_on = None

INDEX = "ix_plans_space_id_anticipation"


def upgrade() -> None:
    op.add_column(
        "plans",
        sa.Column(
            "anticipation",
            sa.String(length=16),
            nullable=False,
            server_default=sa.text("'AUTOMATIC'"),
        ),
    )
    op.execute("UPDATE plans SET anticipation = 'ALWAYS' WHERE anticipation_enabled IS TRUE")
    op.create_check_constraint(
        "anticipation_is_known",
        "plans",
        "anticipation IN ('AUTOMATIC', 'ALWAYS', 'NEVER')",
    )
    op.drop_index(INDEX, table_name="plans")
    op.drop_column("plans", "anticipation_enabled")
    op.create_index(INDEX, "plans", ["space_id", "anticipation", "status"])


def downgrade() -> None:
    op.add_column(
        "plans",
        sa.Column(
            "anticipation_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.execute("UPDATE plans SET anticipation_enabled = true WHERE anticipation = 'ALWAYS'")
    op.drop_index(INDEX, table_name="plans")
    op.drop_constraint("anticipation_is_known", "plans", type_="check")
    op.drop_column("plans", "anticipation")
    op.create_index(INDEX, "plans", ["space_id", "anticipation_enabled", "status"])
