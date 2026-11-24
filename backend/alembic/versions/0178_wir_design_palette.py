"""Store an optional palette independently of the personal app design.

Revision ID: 0178
Revises: 0177
"""

import sqlalchemy as sa
from alembic import op

revision = "0178"
down_revision = "0177"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("app_icon_preferences", sa.Column("wir_design_palette", sa.String(24)))


def downgrade() -> None:
    op.drop_column("app_icon_preferences", "wir_design_palette")
