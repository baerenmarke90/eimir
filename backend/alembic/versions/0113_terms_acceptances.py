"""Record terms-of-use acceptance for new eimir. Cloud Accounts.

Revision ID: 0113
Revises: 0112
Create Date: 2026-11-05

``terms_acceptances`` keeps one row per Account and accepted version. A signup
proof may carry the version accepted in the signup form for its existing short
lifetime. Existing Accounts and proofs are not changed: they simply carry no
acceptance.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0113"
down_revision = "0112"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "terms_acceptances",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version", sa.String(64), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("origin", sa.String(32), nullable=False),
        sa.CheckConstraint(
            "origin IN ('signup_request', 'signup_redemption')",
            name=op.f("ck_terms_acceptances_origin_is_known"),
        ),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            name=op.f("fk_terms_acceptances_account_id_accounts"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_terms_acceptances")),
        sa.UniqueConstraint(
            "account_id", "version", name=op.f("uq_terms_acceptances_account_id_version")
        ),
    )
    op.create_index(op.f("ix_terms_acceptances_account_id"), "terms_acceptances", ["account_id"])
    op.add_column(
        "signup_proofs", sa.Column("accepted_terms_version", sa.String(64), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("signup_proofs", "accepted_terms_version")
    op.drop_index(op.f("ix_terms_acceptances_account_id"), table_name="terms_acceptances")
    op.drop_table("terms_acceptances")
