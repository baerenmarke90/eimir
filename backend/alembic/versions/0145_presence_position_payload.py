"""Keep the partner-location position inside an encrypted payload (#797, #1792).

``presence_snapshots`` stored the snapped latitude, longitude and accuracy in
plain columns, so a database dump showed where a sharing person was. They move
into a ``ProtectedPayload`` column, which encryption at rest stores as
ciphertext.

Existing snapshots are deleted instead of converted: a migration runs without
the encryption keys and cannot seal a payload, and a snapshot lives at most 24
hours and is published again by the sharing device. Until that next publish the
partner sees no distance and no map area. Consent rows are not touched.

Revision ID: 0145
Revises: 0144
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0145"
down_revision = "0144"
branch_labels = None
depends_on = None

TABLE = "presence_snapshots"


def upgrade() -> None:
    op.execute(f"DELETE FROM {TABLE}")
    # Dropping a column also drops the range checks that only reference it.
    op.drop_column(TABLE, "latitude")
    op.drop_column(TABLE, "longitude")
    op.drop_column(TABLE, "accuracy_meters")
    op.add_column(
        TABLE,
        sa.Column("crypto_version", sa.SmallInteger(), server_default="0", nullable=False),
    )
    op.add_column(TABLE, sa.Column("payload", postgresql.JSONB(), nullable=False))


def downgrade() -> None:
    # The older code cannot read a sealed position, so snapshots are dropped again.
    op.execute(f"DELETE FROM {TABLE}")
    op.drop_column(TABLE, "payload")
    op.drop_column(TABLE, "crypto_version")
    op.add_column(TABLE, sa.Column("latitude", sa.Numeric(5, 2), nullable=False))
    op.add_column(TABLE, sa.Column("longitude", sa.Numeric(6, 2), nullable=False))
    op.add_column(TABLE, sa.Column("accuracy_meters", sa.Integer(), nullable=False))
    op.create_check_constraint("latitude_in_range", TABLE, "latitude BETWEEN -90 AND 90")
    op.create_check_constraint("longitude_in_range", TABLE, "longitude BETWEEN -180 AND 180")
    op.create_check_constraint("accuracy_is_coarse", TABLE, "accuracy_meters >= 1000")
