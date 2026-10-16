"""Add the Cloud self-service signup proof.

Revision ID: 0053
Revises: 0052
Create Date: 2026-09-14

#923: a magic link is bound to an existing AccountEmail and cannot represent an
address that has no Account yet. `signup_proofs` holds the short-lived,
single-use proof that a person controls an address before Cloud self-service
onboarding decides whether to sign into the Account owning it or to create one.
Only the SHA-256 hash of the secret is stored.

The change is purely additive. Downgrade drops the table: proofs that are still
open at that moment stop working and the person requests a new link. No
Account, Membership, or session row references this table, so nothing else is
lost.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0053"
down_revision = "0052"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "signup_proofs",
        sa.Column("id", UUID, nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_signup_proofs"),
        sa.UniqueConstraint("token_hash", name="uq_signup_proofs_token_hash"),
        sa.CheckConstraint("email = lower(email)", name="email_is_lowercase"),
    )
    op.create_index("ix_signup_proofs_email", "signup_proofs", ["email"])
    op.create_index("ix_signup_proofs_expires_at", "signup_proofs", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_signup_proofs_expires_at", table_name="signup_proofs")
    op.drop_index("ix_signup_proofs_email", table_name="signup_proofs")
    op.drop_table("signup_proofs")
