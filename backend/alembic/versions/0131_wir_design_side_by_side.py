"""Keep Wir appearance readable after downgrading before Seite an Seite support.

The existing string column accepts the new identifier without a schema or data
change on upgrade. Older application versions cannot decode that identifier
when reading the saved preference. An explicit database downgrade therefore
resets just that design to Verbunden and invalidates its appearance ETag.

Revision ID: 0131
Revises: 0130
"""

import sqlalchemy as sa
from alembic import op

revision = "0131"
down_revision = "0130"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE app_icon_preferences "
            "SET wir_design = 'connected', version = version + 1 "
            "WHERE wir_design = 'side_by_side'"
        )
    )
