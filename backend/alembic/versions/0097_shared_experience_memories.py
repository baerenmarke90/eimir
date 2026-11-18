"""Add canonical experience origins and their existing notification channel.

Revision ID: 0097
Revises: 0096
"""

import sqlalchemy as sa
from alembic import op

revision = "0097"
down_revision = "0096"
branch_labels = None
depends_on = None

_PREVIOUS_KINDS = (
    "'COMMENT_CREATED', 'THINKING_OF_YOU', 'PARTNER_KISS', 'PARTNER_CHECK_IN', 'REMINDER_DUE'"
)


def _notification_catalog(kinds: str) -> None:
    for table, name in (
        ("notifications", "notification_kind_allowed"),
        ("notification_preferences", "notif_pref_kind_allowed"),
    ):
        op.drop_constraint(name, table, type_="check")
        op.create_check_constraint(name, table, f"kind IN ({kinds})")


def upgrade() -> None:
    op.add_column("memories", sa.Column("experience_kind", sa.String(16), nullable=True))
    op.create_check_constraint(
        "memory_experience_kind_allowed",
        "memories",
        "experience_kind IS NULL OR experience_kind IN ('HAPPINESS', 'TIME_TRAVEL')",
    )
    for name, columns in (
        (
            "ix_memories_space_experience_created_id",
            ["space_id", "experience_kind", "created_at", "id"],
        ),
        (
            "ix_memories_space_experience_author_created_id",
            ["space_id", "owner_id", "created_at", "id"],
        ),
    ):
        op.create_index(
            name, "memories", columns, postgresql_where=sa.text("experience_kind IS NOT NULL")
        )
    _notification_catalog(_PREVIOUS_KINDS + ", 'COUPLE_EXPERIENCE_SHARED'")


def downgrade() -> None:
    # Derived delivery/preferences can be dropped; all canonical authored text survives.
    op.execute("DELETE FROM notifications WHERE kind = 'COUPLE_EXPERIENCE_SHARED'")
    op.execute("DELETE FROM notification_preferences WHERE kind = 'COUPLE_EXPERIENCE_SHARED'")
    op.execute("DELETE FROM dashboard_module_preferences WHERE module_key = 'shared_experience'")
    _notification_catalog(_PREVIOUS_KINDS)
    op.drop_index("ix_memories_space_experience_author_created_id", table_name="memories")
    op.drop_index("ix_memories_space_experience_created_id", table_name="memories")
    op.drop_constraint("memory_experience_kind_allowed", "memories", type_="check")
    op.drop_column("memories", "experience_kind")
