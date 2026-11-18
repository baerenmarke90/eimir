"""Let the couple name the garden's visitors.

#1907 H3 follow-up (Product Owner request, prototype step 5 "Eure Besucher").
Either partner may give each visiting animal one shared name; the duck pair
shares one name. Like the garden name, a row exists only while a visitor has a
name, holds at most 40 characters and leaves with the couple. The closed set of
animals is checked in the database. Nothing else about the visitors is stored.

Revision ID: 0160
Revises: 0159
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0160"
down_revision = "0159"
branch_labels = None
depends_on = None

_ANIMALS = "'SNAIL', 'RABBIT', 'HEDGEHOG', 'DUCKS', 'SQUIRREL', 'DEER'"


def upgrade() -> None:
    op.create_table(
        "garden_visitor_names",
        sa.Column(
            "space_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("spaces.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("animal", sa.String(16), primary_key=True),
        sa.Column("name", sa.String(40), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            f"animal IN ({_ANIMALS})", name=op.f("ck_garden_visitor_names_animal_allowed")
        ),
        sa.CheckConstraint(
            "length(btrim(name)) > 0", name=op.f("ck_garden_visitor_names_name_not_blank")
        ),
    )


def downgrade() -> None:
    op.drop_table("garden_visitor_names")
