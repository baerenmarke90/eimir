"""Prepare a related person's relationship for the protected payload (#797).

``related_persons.relationship`` (mother, friend, colleague and so on) was a
plain column. Together with a reminder it told a database dump that a Space has
a mother whose birthday falls on a given day. From this revision the application
writes the value into the row's ``ProtectedPayload`` and leaves the column NULL.

This migration only makes room for that; it moves no value. Alembic runs without
the encryption keys and cannot seal a payload, so existing rows keep their value
in the old column until the worker job (or ``python -m eimir.security
migrate-columns``) has moved it. The column is dropped in a later revision, once
no installation can still hold values in it.

- ``related_persons.relationship`` becomes nullable. ``relationship_is_known``
  stays and keeps guarding a value that is still in the column.

Revision ID: 0154
Revises: 0153
"""

import sqlalchemy as sa
from alembic import op

revision = "0154"
down_revision = "0153"
branch_labels = None
depends_on = None

TABLE = "related_persons"


def upgrade() -> None:
    op.alter_column(TABLE, "relationship", existing_type=sa.String(16), nullable=True)


def downgrade() -> None:
    # The older code reads only the column. A value that already moved into a
    # payload cannot be brought back without the encryption keys, so a downgrade
    # is refused while such rows exist instead of silently losing them.
    op.execute(
        f"""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM {TABLE} WHERE relationship IS NULL) THEN
                RAISE EXCEPTION
                    'Values already moved into protected payloads; this downgrade would lose them.';
            END IF;
        END
        $$;
        """
    )
    op.alter_column(TABLE, "relationship", existing_type=sa.String(16), nullable=False)
