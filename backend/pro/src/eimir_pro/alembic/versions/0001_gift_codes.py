"""Gift code batches and codes (ServerAdmin part 5).

The first revision of the Pro plugin chain. It runs after the Core chain
(``eimir.plugins.migrations``) and records itself in ``alembic_version_pro``.
It references the Core tables ``accounts``, ``spaces`` and
``entitlement_grants`` only; no Core revision references these tables. The
older Pro tables stay in the Core chain (Decision 0017, decision 6).

Revision ID: 0001
Revises:
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "gift_code_batches",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("note", sa.String(length=120), nullable=True),
        sa.Column("duration_months", sa.Integer(), nullable=False),
        sa.Column("redeemable_until", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_gift_code_batches")),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["accounts.id"],
            ondelete="SET NULL",
            name=op.f("fk_gift_code_batches_created_by_accounts"),
        ),
        sa.ForeignKeyConstraint(
            ["revoked_by"],
            ["accounts.id"],
            ondelete="SET NULL",
            name=op.f("fk_gift_code_batches_revoked_by_accounts"),
        ),
        sa.CheckConstraint(
            "duration_months IN (1, 3, 6, 12)",
            name=op.f("ck_gift_code_batches_duration_months_allowed"),
        ),
    )
    op.create_table(
        "gift_codes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("batch_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("crypto_version", sa.SmallInteger(), server_default=sa.text("0"), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("lookup_hash", sa.String(length=64), nullable=False),
        sa.Column("handed_out_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("redeemed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("redeemed_space_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("redeemed_grant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_gift_codes")),
        sa.ForeignKeyConstraint(
            ["batch_id"],
            ["gift_code_batches.id"],
            ondelete="CASCADE",
            name=op.f("fk_gift_codes_batch_id_gift_code_batches"),
        ),
        sa.ForeignKeyConstraint(
            ["revoked_by"],
            ["accounts.id"],
            ondelete="SET NULL",
            name=op.f("fk_gift_codes_revoked_by_accounts"),
        ),
        sa.ForeignKeyConstraint(
            ["redeemed_space_id"],
            ["spaces.id"],
            ondelete="SET NULL",
            name=op.f("fk_gift_codes_redeemed_space_id_spaces"),
        ),
        sa.ForeignKeyConstraint(
            ["redeemed_grant_id"],
            ["entitlement_grants.id"],
            ondelete="SET NULL",
            name=op.f("fk_gift_codes_redeemed_grant_id_entitlement_grants"),
        ),
        sa.UniqueConstraint("lookup_hash", name=op.f("uq_gift_codes_lookup_hash")),
        sa.CheckConstraint(
            "NOT (redeemed_at IS NOT NULL AND revoked_at IS NOT NULL)",
            name=op.f("ck_gift_codes_not_redeemed_and_revoked"),
        ),
    )
    op.create_index(op.f("ix_gift_codes_batch_id"), "gift_codes", ["batch_id"])
    op.create_index(op.f("ix_gift_codes_redeemed_space_id"), "gift_codes", ["redeemed_space_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_gift_codes_redeemed_space_id"), table_name="gift_codes")
    op.drop_index(op.f("ix_gift_codes_batch_id"), table_name="gift_codes")
    op.drop_table("gift_codes")
    op.drop_table("gift_code_batches")
