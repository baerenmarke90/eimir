"""Remember who imported a skipped video (#2141).

Only the member who imported a Transfer Bundle without its videos sees,
recovers and dismisses those videos; the partner never does. ``owner_id`` stays
the owner a recovered video gets, which in a shared bundle is often the partner,
so the importing member needs a column of its own. Existing rows take the
creator of their import while it still exists, otherwise the video's owner.

Revision ID: 0167
Revises: 0166
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0167"
down_revision = "0166"
branch_labels = None
depends_on = None

TABLE = "transfer_skipped_videos"


def upgrade() -> None:
    op.add_column(TABLE, sa.Column("imported_by", postgresql.UUID(as_uuid=True), nullable=True))
    op.execute(
        """
        UPDATE transfer_skipped_videos AS skipped
        SET imported_by = imports.created_by
        FROM transfer_imports AS imports
        WHERE skipped.import_id = imports.id
        """
    )
    op.execute(
        "UPDATE transfer_skipped_videos SET imported_by = owner_id WHERE imported_by IS NULL"
    )
    op.alter_column(TABLE, "imported_by", nullable=False)
    op.create_foreign_key(
        op.f("fk_transfer_skipped_videos_imported_by_accounts"),
        TABLE,
        "accounts",
        ["imported_by"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_transfer_skipped_videos_importer", TABLE, ["space_id", "imported_by"])


def downgrade() -> None:
    op.drop_index("ix_transfer_skipped_videos_importer", table_name=TABLE)
    op.drop_constraint(
        op.f("fk_transfer_skipped_videos_imported_by_accounts"), TABLE, type_="foreignkey"
    )
    op.drop_column(TABLE, "imported_by")
