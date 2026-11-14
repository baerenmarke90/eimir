"""Keep Wir appearance readable after downgrading before Handschrift support.

The existing column accepts the new identifier on upgrade. Older application
versions cannot decode it, so downgrade resets only that preference and
invalidates its appearance ETag.

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
    pass


def downgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE app_icon_preferences "
            "SET wir_design = 'connected', version = version + 1 "
            "WHERE wir_design = 'handwriting'"
        )
    )
