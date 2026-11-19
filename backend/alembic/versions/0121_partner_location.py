"""Add owner-controlled partner location consent and ephemeral presence snapshots.

Revision ID: 0121
Revises: 0120
"""

import sqlalchemy as sa
from alembic import op

revision = "0121"
down_revision = "0120"
branch_labels = None
depends_on = None

UUID = sa.UUID()


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    ]


def upgrade() -> None:
    op.create_table(
        "partner_location_consents",
        sa.Column("id", UUID, nullable=False),
        sa.Column("space_id", UUID, nullable=False),
        sa.Column("account_id", UUID, nullable=False),
        sa.Column("recipient_account_id", UUID, nullable=True),
        sa.Column("level", sa.String(length=24), nullable=False),
        sa.Column("indefinite", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("generation", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column("suspended_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_partner_location_consents"),
        sa.ForeignKeyConstraint(
            ["space_id"],
            ["spaces.id"],
            name="fk_partner_location_consents_space_id_spaces",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            name="fk_partner_location_consents_account_id_accounts",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["recipient_account_id"],
            ["accounts.id"],
            name="fk_partner_location_consents_recipient_account_id_accounts",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "space_id", "account_id", name="uq_partner_location_consents_space_account"
        ),
        sa.CheckConstraint(
            "level IN ('OFF', 'DISTANCE', 'DISTANCE_AND_MAP')",
            name="level_is_known",
        ),
        sa.CheckConstraint(
            "level = 'OFF' OR recipient_account_id IS NOT NULL",
            name="active_has_recipient",
        ),
        sa.CheckConstraint(
            "level = 'OFF' OR (indefinite AND expires_at IS NULL) "
            "OR (NOT indefinite AND expires_at IS NOT NULL)",
            name="duration_is_explicit",
        ),
        sa.CheckConstraint("generation >= 1", name="generation_is_positive"),
    )
    op.create_table(
        "presence_snapshots",
        sa.Column("id", UUID, nullable=False),
        sa.Column("space_id", UUID, nullable=False),
        sa.Column("account_id", UUID, nullable=False),
        sa.Column("latitude", sa.Numeric(5, 2), nullable=False),
        sa.Column("longitude", sa.Numeric(6, 2), nullable=False),
        sa.Column("accuracy_meters", sa.Integer(), nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consent_generation", sa.Integer(), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_presence_snapshots"),
        sa.ForeignKeyConstraint(
            ["space_id"],
            ["spaces.id"],
            name="fk_presence_snapshots_space_id_spaces",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            name="fk_presence_snapshots_account_id_accounts",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("space_id", "account_id", name="uq_presence_snapshots_space_account"),
        sa.CheckConstraint("latitude BETWEEN -90 AND 90", name="latitude_in_range"),
        sa.CheckConstraint("longitude BETWEEN -180 AND 180", name="longitude_in_range"),
        sa.CheckConstraint("accuracy_meters >= 1000", name="accuracy_is_coarse"),
    )
    op.create_index(
        "ix_presence_snapshots_expires_at", "presence_snapshots", ["expires_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_presence_snapshots_expires_at", table_name="presence_snapshots")
    op.drop_table("presence_snapshots")
    op.drop_table("partner_location_consents")
