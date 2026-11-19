"""Store personal settings that follow the Account across devices.

Product Owner request 2026-11-18: personal settings must be the same on every
device after sign-in. One owner-only document exists per Account (``space_id``
NULL) and at most one per Account and Space. The allowlisted key set is
validated by the application; the document holds only display and behaviour
choices, never content, credentials or device-bound state.

Revision ID: 0161
Revises: 0160
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0161"
down_revision = "0160"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "personal_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("space_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("schema_version", sa.SmallInteger(), nullable=False),
        sa.Column("settings", postgresql.JSONB(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.PrimaryKeyConstraint("id", name="pk_personal_settings"),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            ondelete="CASCADE",
            name="fk_personal_settings_account_id_accounts",
        ),
        sa.ForeignKeyConstraint(
            ["space_id"],
            ["spaces.id"],
            ondelete="CASCADE",
            name="fk_personal_settings_space_id_spaces",
        ),
    )
    op.create_index("ix_personal_settings_space_id", "personal_settings", ["space_id"])
    op.create_index(
        "uq_personal_settings_account_id",
        "personal_settings",
        ["account_id"],
        unique=True,
        postgresql_where=sa.text("space_id IS NULL"),
    )
    op.create_index(
        "uq_personal_settings_account_id_space_id",
        "personal_settings",
        ["account_id", "space_id"],
        unique=True,
        postgresql_where=sa.text("space_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_table("personal_settings")
