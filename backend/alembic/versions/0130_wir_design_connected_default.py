"""Make "connected" the default personal Wir design (Product Owner decision 2026-11-14).

Every stored ``warm`` preference becomes ``connected``: the server cannot tell an
explicit ``warm`` choice from the former default, and the Product Owner accepted
that. Stored ``modern`` and ``classic`` choices stay untouched. ``warm`` remains
selectable afterwards and is then stored as an explicit choice.

The row ``version`` is deliberately not incremented. A client holding an older
concurrency token keeps a valid token and simply reads the new default.

Revision ID: 0130
Revises: 0129
"""

import sqlalchemy as sa
from alembic import op

revision = "0130"
down_revision = "0129"
branch_labels = None
depends_on = None

_TABLE = "app_icon_preferences"
_COLUMN = "wir_design"


def _replace(previous: str, replacement: str) -> None:
    op.execute(
        sa.text(
            f"UPDATE {_TABLE} SET {_COLUMN} = :replacement WHERE {_COLUMN} = :previous"
        ).bindparams(previous=previous, replacement=replacement)
    )


def upgrade() -> None:
    _replace("warm", "connected")
    op.alter_column(
        _TABLE,
        _COLUMN,
        existing_type=sa.String(24),
        existing_nullable=False,
        server_default="connected",
    )


def downgrade() -> None:
    # The previous release does not know "connected". Explicit "warm" choices
    # saved after the upgrade are indistinguishable from it and stay "warm".
    _replace("connected", "warm")
    op.alter_column(
        _TABLE,
        _COLUMN,
        existing_type=sa.String(24),
        existing_nullable=False,
        server_default="warm",
    )
