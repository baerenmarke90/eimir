"""Allow the pinned Dashboard module to select one shared Collection.

Revision ID: 0068
Revises: 0067
Create Date: 2026-09-21
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0068"
down_revision = "0067"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.add_column(
        "dashboard_module_preferences",
        sa.Column("selected_collection_id", UUID, nullable=True),
    )
    op.create_foreign_key(
        "fk_dashboard_pref_selected_collection",
        "dashboard_module_preferences",
        "collections",
        ["selected_collection_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_dashboard_module_preferences_selected_collection_id",
        "dashboard_module_preferences",
        ["selected_collection_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_dashboard_module_preferences_selected_collection_id",
        table_name="dashboard_module_preferences",
    )
    op.drop_constraint(
        "fk_dashboard_pref_selected_collection",
        "dashboard_module_preferences",
        type_="foreignkey",
    )
    op.drop_column("dashboard_module_preferences", "selected_collection_id")
