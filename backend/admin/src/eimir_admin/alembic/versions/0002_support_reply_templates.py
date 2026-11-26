"""Reply templates of the operator (#2327).

The second revision of the operator plugin chain. The table references no other
table: templates are operator text, shared by all ServerAdmins. Downgrading to
``0001`` deletes every template.

Revision ID: 0002
Revises: 0001
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "support_reply_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=40), nullable=False),
        sa.Column("text", sa.String(length=500), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_support_reply_templates")),
    )
    op.create_index(
        "uq_support_reply_templates_name_lower",
        "support_reply_templates",
        [sa.text("lower(name)")],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_support_reply_templates_name_lower", table_name="support_reply_templates")
    op.drop_table("support_reply_templates")
