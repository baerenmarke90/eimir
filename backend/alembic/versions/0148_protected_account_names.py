"""Give accounts a protected payload for the display name (#797).

``accounts.display_name`` was a plain column, so a database dump listed every
person by name. From this revision the application writes the name into a
``ProtectedPayload`` and leaves the column NULL.

The new ``payload`` column is nullable on purpose. Alembic runs without the
encryption keys and cannot seal a payload for the rows that already exist; they
keep their name in the old column and a NULL payload until the worker job (or
``python -m eimir.security migrate-columns``) has moved it.

Revision ID: 0148
Revises: 0147
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0148"
down_revision = "0147"
branch_labels = None
depends_on = None

TABLE = "accounts"


def upgrade() -> None:
    op.alter_column(TABLE, "display_name", existing_type=sa.String(120), nullable=True)
    op.add_column(
        TABLE,
        sa.Column("crypto_version", sa.SmallInteger(), server_default="0", nullable=False),
    )
    op.add_column(TABLE, sa.Column("payload", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    # The older code reads only the column. A name that already moved into a
    # payload cannot be brought back without the encryption keys, so a downgrade
    # is refused while such rows exist instead of silently losing them.
    op.execute(
        f"""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM {TABLE} WHERE payload IS NOT NULL) THEN
                RAISE EXCEPTION
                    'Names already moved into protected payloads; this downgrade would lose them.';
            END IF;
        END
        $$;
        """
    )
    op.drop_column(TABLE, "payload")
    op.drop_column(TABLE, "crypto_version")
    op.alter_column(TABLE, "display_name", existing_type=sa.String(120), nullable=False)
