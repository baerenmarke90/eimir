"""Add the follow-up link and series grouping for repeated Wishes (#1816).

Revision ID: 0123
Revises: 0122
"""

import sqlalchemy as sa
from alembic import op

revision = "0123"
down_revision = "0122"
branch_labels = None
depends_on = None

UUID = sa.UUID()


def upgrade() -> None:
    op.add_column("wishes", sa.Column("followed_from_wish_id", UUID, nullable=True))
    op.add_column("wishes", sa.Column("series_id", UUID, nullable=True))
    op.add_column(
        "wishes",
        sa.Column(
            "series_position", sa.SmallInteger(), server_default=sa.text("1"), nullable=False
        ),
    )
    # Every existing Wish is the first of its own series.
    op.execute("UPDATE wishes SET series_id = id")
    op.alter_column("wishes", "series_id", nullable=False)
    op.create_check_constraint(
        "series_position_is_positive",
        "wishes",
        "series_position >= 1",
    )
    # Composite so a repeat cannot reference a Wish from another space; the
    # column list keeps NOT NULL ``space_id`` out of the SET NULL action.
    op.create_foreign_key(
        "fk_wishes_followed_from_wish_id_wishes",
        "wishes",
        "wishes",
        ["followed_from_wish_id", "space_id"],
        ["id", "space_id"],
        ondelete="SET NULL (followed_from_wish_id)",
    )
    op.create_index("ix_wishes_followed_from_wish_id", "wishes", ["followed_from_wish_id"])
    op.create_index("ix_wishes_space_id_series_id", "wishes", ["space_id", "series_id"])


def downgrade() -> None:
    op.drop_index("ix_wishes_space_id_series_id", table_name="wishes")
    op.drop_index("ix_wishes_followed_from_wish_id", table_name="wishes")
    op.drop_constraint("fk_wishes_followed_from_wish_id_wishes", "wishes", type_="foreignkey")
    op.drop_constraint("series_position_is_positive", "wishes", type_="check")
    op.drop_column("wishes", "series_position")
    op.drop_column("wishes", "series_id")
    op.drop_column("wishes", "followed_from_wish_id")
