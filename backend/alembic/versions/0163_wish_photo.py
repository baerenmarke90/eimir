"""Bind an optional single photo to a shared Wish.

A Wish may hold one validated image (for example a photo shared from a messenger
together with a mountain-hut link). The link itself lives in the protected Wish
payload and needs no column. Like ``plans.cover_attachment_id`` the photo is an
exclusive attachment binding: the unique constraint keeps one attachment from
serving two Wishes, and ``SET NULL`` leaves the Wish intact if the attachment
row is purged.

Revision ID: 0163
Revises: 0162
Create Date: 2026-11-18
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0163"
down_revision = "0162"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("wishes", sa.Column("photo_attachment_id", postgresql.UUID(as_uuid=True)))
    op.create_foreign_key(
        "fk_wishes_photo_attachment_id_attachments",
        "wishes",
        "attachments",
        ["photo_attachment_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_unique_constraint("uq_wishes_photo_attachment", "wishes", ["photo_attachment_id"])


def downgrade() -> None:
    op.drop_constraint("uq_wishes_photo_attachment", "wishes", type_="unique")
    op.drop_constraint("fk_wishes_photo_attachment_id_attachments", "wishes", type_="foreignkey")
    op.drop_column("wishes", "photo_attachment_id")
