"""Collection kind, item completion details and several pinned Dashboard lists (#1808).

Revision ID: 0125
Revises: 0124
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0125"
down_revision = "0124"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    # Presentation variant of a Collection; every existing Collection is generic.
    op.add_column(
        "collections",
        sa.Column("kind", sa.String(16), server_default=sa.text("'GENERIC'"), nullable=False),
    )
    op.create_check_constraint("kind_is_known", "collections", "kind IN ('GENERIC', 'SHOPPING')")

    # Who completed an Item and when. Items completed before this change keep
    # both columns NULL, because the actor was never recorded.
    op.add_column("collection_items", sa.Column("completed_by", UUID, nullable=True))
    op.add_column(
        "collection_items", sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_foreign_key(
        "fk_collection_items_completed_by_accounts",
        "collection_items",
        "accounts",
        ["completed_by"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_check_constraint(
        "completion_details_only_when_completed",
        "collection_items",
        "completed OR (completed_by IS NULL AND completed_at IS NULL)",
    )
    op.create_index("ix_collection_items_completed_by", "collection_items", ["completed_by"])

    # A person may show several shared lists on Wir. The first selected list
    # of every existing preference becomes its only entry; the legacy single
    # column stays as a mirror for application rollbacks.
    op.create_table(
        "dashboard_module_collections",
        sa.Column("preference_id", UUID, nullable=False),
        sa.Column("collection_id", UUID, nullable=False),
        sa.Column("position", sa.SmallInteger(), nullable=False),
        sa.CheckConstraint("position >= 0", name="position_is_non_negative"),
        sa.ForeignKeyConstraint(
            ["preference_id"],
            ["dashboard_module_preferences.id"],
            name="fk_dashboard_module_collections_preference",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["collection_id"],
            ["collections.id"],
            name="fk_dashboard_module_collections_collection",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "preference_id", "collection_id", name="pk_dashboard_module_collections"
        ),
        sa.UniqueConstraint(
            "preference_id",
            "position",
            name="uq_dashboard_module_collections_preference_id_position",
            deferrable=True,
            initially="DEFERRED",
        ),
    )
    op.create_index(
        "ix_dashboard_module_collections_collection_id",
        "dashboard_module_collections",
        ["collection_id"],
    )
    op.execute(
        """
        INSERT INTO dashboard_module_collections (preference_id, collection_id, position)
        SELECT id, selected_collection_id, 0
        FROM dashboard_module_preferences
        WHERE selected_collection_id IS NOT NULL
        """
    )


def downgrade() -> None:
    # Restore the single-selection column from the first entry of each preference.
    op.execute(
        """
        UPDATE dashboard_module_preferences AS preference
        SET selected_collection_id = first_entry.collection_id
        FROM (
            SELECT DISTINCT ON (preference_id) preference_id, collection_id
            FROM dashboard_module_collections
            ORDER BY preference_id, position
        ) AS first_entry
        WHERE preference.id = first_entry.preference_id
        """
    )
    op.drop_index(
        "ix_dashboard_module_collections_collection_id", table_name="dashboard_module_collections"
    )
    op.drop_table("dashboard_module_collections")

    op.drop_index("ix_collection_items_completed_by", table_name="collection_items")
    op.drop_constraint("completion_details_only_when_completed", "collection_items", type_="check")
    op.drop_constraint(
        "fk_collection_items_completed_by_accounts", "collection_items", type_="foreignkey"
    )
    op.drop_column("collection_items", "completed_at")
    op.drop_column("collection_items", "completed_by")

    op.drop_constraint("kind_is_known", "collections", type_="check")
    op.drop_column("collections", "kind")
