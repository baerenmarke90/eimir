"""Bind a Cloud signup proof to the invitation presented at email request.

Revision ID: 0086
Revises: 0085
Create Date: 2026-10-19

Only the invitation hash is retained for the proof's existing short lifetime.
Old proofs remain nullable and retain their original client continuation.
No Account, Space, Membership, or existing invitation is changed.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0086"
down_revision = "0085"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("signup_proofs", sa.Column("invitation_token_hash", sa.String(64), nullable=True))


def downgrade() -> None:
    # A pending bound proof must never silently become an ordinary signup.
    op.execute(
        "UPDATE signup_proofs SET revoked_at = now() "
        "WHERE invitation_token_hash IS NOT NULL AND consumed_at IS NULL AND revoked_at IS NULL"
    )
    op.drop_column("signup_proofs", "invitation_token_hash")
