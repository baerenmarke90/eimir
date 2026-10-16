"""Related person avatar attachment.

Revision ID: 0040
Revises: 0039
Create Date: 2026-09-04
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0040"
down_revision = "0039"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.add_column(
        "related_persons",
        sa.Column("avatar_attachment_id", UUID, nullable=True),
    )
    op.create_foreign_key(
        "fk_related_persons_avatar_attachment_id_attachments",
        "related_persons",
        "attachments",
        ["avatar_attachment_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_unique_constraint(
        "uq_related_persons_avatar_attachment",
        "related_persons",
        ["avatar_attachment_id"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_related_persons_avatar_attachment", "related_persons", type_="unique")
    op.drop_constraint(
        "fk_related_persons_avatar_attachment_id_attachments", "related_persons", type_="foreignkey"
    )
    op.drop_column("related_persons", "avatar_attachment_id")
