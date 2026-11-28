"""Ticket links of support reports (#2189).

The first revision of the operator plugin chain. It runs after the Core chain
(``eimir.plugins.migrations``) and records itself in ``alembic_version_admin``.
It references the Core table ``support_reports`` only; no Core revision
references this table.

Revision ID: 0001
Revises:
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "support_report_tickets",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("report_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tracker", sa.String(length=32), nullable=False),
        sa.Column("url", sa.String(length=512), nullable=True),
        sa.Column("number", sa.Integer(), nullable=True),
        sa.Column("state", sa.String(length=16), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_support_report_tickets")),
        sa.ForeignKeyConstraint(
            ["report_id"],
            ["support_reports.id"],
            ondelete="CASCADE",
            name=op.f("fk_support_report_tickets_report_id_support_reports"),
        ),
        sa.UniqueConstraint("report_id", name=op.f("uq_support_report_tickets_report_id")),
        sa.CheckConstraint(
            "state IN ('PENDING', 'CREATED')",
            name=op.f("ck_support_report_tickets_state_allowed"),
        ),
    )


def downgrade() -> None:
    op.drop_table("support_report_tickets")
