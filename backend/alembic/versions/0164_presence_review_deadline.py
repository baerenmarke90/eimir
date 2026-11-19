"""Track the next periodic review of each active location grant."""

import sqlalchemy as sa
from alembic import op

revision = "0164"
down_revision = "0163"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "partner_location_consents",
        sa.Column(
            "next_review_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_partner_location_due",
        "partner_location_consents",
        ["next_review_at", "id"],
        postgresql_where=sa.text("level <> 'OFF' AND suspended_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_partner_location_due", table_name="partner_location_consents")
    op.drop_column("partner_location_consents", "next_review_at")
