"""Add the personal person-colour pair to the appearance preference.

Revision ID: 0142
Revises: 0141
"""

import sqlalchemy as sa
from alembic import op

revision = "0142"
down_revision = "0141"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "app_icon_preferences",
        sa.Column("person_colours", sa.String(24), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("app_icon_preferences", "person_colours")
