"""Keep app designs readable after downgrading before Zu zweit and Handschrift.

The existing string column accepts the new identifiers without a schema or data
change on upgrade. Older application versions cannot decode them when reading
the saved preference. An explicit database downgrade therefore resets just
these two designs to Verbunden and invalidates their appearance ETag.

Revision ID: 0158
Revises: 0157
"""

import sqlalchemy as sa
from alembic import op

revision = "0158"
down_revision = "0157"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE app_icon_preferences "
            "SET wir_design = 'connected', version = version + 1 "
            "WHERE wir_design IN ('quiet_together', 'handwriting')"
        )
    )
