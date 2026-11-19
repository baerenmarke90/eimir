"""Bind browser and iOS push endpoints to the registering device session.

Revision ID: 0125
Revises: 0124
"""

import sqlalchemy as sa
from alembic import op

revision = "0125"
down_revision = "0124"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "push_preview_secrets",
        sa.Column("neutral_reference", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("push_endpoints", sa.Column("device_session_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        op.f("fk_push_endpoints_device_session_id_device_sessions"),
        "push_endpoints",
        "device_sessions",
        ["device_session_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_push_endpoints_device_session_id", "push_endpoints", ["device_session_id"])
    op.create_index(
        "ix_push_endpoints_active_destination",
        "push_endpoints",
        ["provider_key", "fingerprint"],
        postgresql_where=sa.text("disabled_at IS NULL AND provider_key IN ('apns', 'webpush')"),
    )


def downgrade() -> None:
    op.execute("DELETE FROM push_endpoints WHERE provider_key IN ('apns', 'webpush')")
    op.drop_index("ix_push_endpoints_active_destination", table_name="push_endpoints")
    op.drop_index("ix_push_endpoints_device_session_id", table_name="push_endpoints")
    op.drop_constraint(
        op.f("fk_push_endpoints_device_session_id_device_sessions"),
        "push_endpoints",
        type_="foreignkey",
    )
    op.drop_column("push_endpoints", "device_session_id")
    op.drop_column("push_preview_secrets", "neutral_reference")
