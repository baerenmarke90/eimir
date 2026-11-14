"""Record which curated date idea a Wish was saved from.

Additive and nullable: existing Wishes keep ``NULL``. A downgrade drops only the
provenance reference; the Wishes and their protected content stay intact.

Revision ID: 0133
Revises: 0132
"""

import sqlalchemy as sa
from alembic import op

revision = "0133"
down_revision = "0132"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("wishes", sa.Column("date_idea_id", sa.String(length=64), nullable=True))
    op.create_index(
        "ix_wishes_space_id_date_idea_id",
        "wishes",
        ["space_id", "date_idea_id"],
        postgresql_where=sa.text("date_idea_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_wishes_space_id_date_idea_id", table_name="wishes")
    op.drop_column("wishes", "date_idea_id")
