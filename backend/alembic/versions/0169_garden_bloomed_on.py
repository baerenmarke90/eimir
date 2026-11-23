"""Remember the day a garden plant first bloomed (#2158 G).

The garden's history shows the first bloom of each plant on its day. Plants
already knew whether they ever bloomed (`bloomed`, revision 0153) but not
when. The new nullable `bloomed_on` holds the couple's calendar day of the
first bloom from now on. Earlier blooms keep no day: it cannot be derived
reliably (a tulip rests until spring, a bouquet resets the stage), so the
history simply leaves them out instead of showing an invented date.

Revision ID: 0169
Revises: 0168
"""

import sqlalchemy as sa
from alembic import op

revision = "0169"
down_revision = "0168"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("garden_plants", sa.Column("bloomed_on", sa.Date(), nullable=True))
    op.create_check_constraint(
        "bloomed_on_needs_bloom", "garden_plants", "bloomed_on IS NULL OR bloomed"
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_garden_plants_bloomed_on_needs_bloom"), "garden_plants", type_="check"
    )
    op.drop_column("garden_plants", "bloomed_on")
