"""Prepare preference topics and Place coordinates for the protected payload (#797).

Both values were stored in plain columns, outside encryption at rest. From this
revision the application writes them into the row's ``ProtectedPayload`` and
leaves the columns NULL.

This migration only makes room for that; it moves no value. Alembic runs without
the encryption keys and cannot seal a payload, so existing rows keep their value
in the old column until the worker job (or ``python -m eimir.security
migrate-columns``) has moved it. The columns are dropped in a later revision,
once no installation can still hold values in them.

- ``profile_preferences.topic`` becomes nullable.
- ``places.has_coordinates`` records the one fact queries still need in SQL
  (can this place be put on a map), set here from the existing columns.

Revision ID: 0146
Revises: 0145
"""

import sqlalchemy as sa
from alembic import op

revision = "0146"
down_revision = "0145"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("profile_preferences", "topic", existing_type=sa.String(120), nullable=True)
    op.add_column(
        "places",
        sa.Column("has_coordinates", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.execute("UPDATE places SET has_coordinates = TRUE WHERE latitude IS NOT NULL")


def downgrade() -> None:
    # The older code reads only the columns. A value that already moved into a
    # payload cannot be brought back without the encryption keys, so a downgrade
    # is refused while such rows exist instead of silently losing them.
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM profile_preferences WHERE topic IS NULL)
               OR EXISTS (SELECT 1 FROM places WHERE has_coordinates AND latitude IS NULL)
            THEN
                RAISE EXCEPTION
                    'Values already moved into protected payloads; this downgrade would lose them.';
            END IF;
        END
        $$;
        """
    )
    op.drop_column("places", "has_coordinates")
    op.alter_column("profile_preferences", "topic", existing_type=sa.String(120), nullable=False)
