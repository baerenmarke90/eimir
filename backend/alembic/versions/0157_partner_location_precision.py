"""Add the owner's sharing precision to partner location consents (#1792, PO 2026-11-17).

Revision ID: 0157
Revises: 0156
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0157"
down_revision = "0156"
branch_labels = None
depends_on = None

_TABLE = "partner_location_consents"
_CHECK = "precision_is_known"


def upgrade() -> None:
    # Existing shares keep their approximate behaviour.
    op.add_column(
        _TABLE,
        sa.Column(
            "precision",
            sa.String(length=12),
            nullable=False,
            server_default="APPROXIMATE",
        ),
    )
    op.create_check_constraint(
        _CHECK,
        _TABLE,
        "precision IN ('APPROXIMATE', 'PRECISE')",
    )


def downgrade() -> None:
    op.drop_constraint(op.f(f"ck_{_TABLE}_{_CHECK}"), _TABLE, type_="check")
    op.drop_column(_TABLE, "precision")
