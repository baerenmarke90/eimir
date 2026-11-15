"""Negotiate content excerpts without changing legacy protected preview keys.

Revision ID: 0109
Revises: 0108
"""

import sqlalchemy as sa
from alembic import op

revision = "0109"
down_revision = "0108"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "push_preview_secrets",
        sa.Column(
            "preview_version", sa.SmallInteger(), nullable=False, server_default=sa.text("1")
        ),
    )
    op.create_check_constraint(
        "preview_protocol_version_valid", "push_preview_secrets", "preview_version IN (1, 2)"
    )


def downgrade() -> None:
    op.drop_constraint("preview_protocol_version_valid", "push_preview_secrets", type_="check")
    op.drop_column("push_preview_secrets", "preview_version")
