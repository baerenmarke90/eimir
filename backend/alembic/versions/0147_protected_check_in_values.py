"""Give the daily check-in table a protected payload for vibe and energy (#797).

``daily_check_ins.vibe`` and ``energy_level`` were plain columns, so a database
dump showed how each person felt day by day. From this revision the application
writes both values into a ``ProtectedPayload`` and leaves the columns NULL.

The new ``payload`` column is nullable on purpose. Alembic runs without the
encryption keys and cannot seal a payload for the rows that already exist; they
keep their values in the old columns and a NULL payload until the worker job
(or ``python -m eimir.security migrate-columns``) has moved them.

``has_dimension`` (at least one of the two columns is set) is widened: a row now
holds its values in the payload or, until it is moved, in the old columns. A row
with neither is still rejected.

Revision ID: 0147
Revises: 0146
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0147"
down_revision = "0146"
branch_labels = None
depends_on = None

TABLE = "daily_check_ins"


def upgrade() -> None:
    op.drop_constraint("has_dimension", TABLE, type_="check")
    op.add_column(
        TABLE,
        sa.Column("crypto_version", sa.SmallInteger(), server_default="0", nullable=False),
    )
    op.add_column(TABLE, sa.Column("payload", postgresql.JSONB(), nullable=True))
    op.create_check_constraint(
        "has_dimension",
        TABLE,
        "payload IS NOT NULL OR vibe IS NOT NULL OR energy_level IS NOT NULL",
    )


def downgrade() -> None:
    # The older code reads only the columns. A value that already moved into a
    # payload cannot be brought back without the encryption keys, so a downgrade
    # is refused while such rows exist instead of silently losing them.
    op.execute(
        f"""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM {TABLE} WHERE payload IS NOT NULL) THEN
                RAISE EXCEPTION
                    'Values already moved into protected payloads; this downgrade would lose them.';
            END IF;
        END
        $$;
        """
    )
    op.drop_constraint("has_dimension", TABLE, type_="check")
    op.drop_column(TABLE, "payload")
    op.drop_column(TABLE, "crypto_version")
    op.create_check_constraint(
        "has_dimension", TABLE, "vibe IS NOT NULL OR energy_level IS NOT NULL"
    )
