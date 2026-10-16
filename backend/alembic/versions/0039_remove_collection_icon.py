"""Remove legacy icon field from collection payloads.

Revision ID: 0039
Revises: 0038
Create Date: 2026-09-03
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0039"
down_revision = "0038"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Remove 'icon' key from collections payload where crypto_version = 0
    op.execute(
        sa.text(
            """
            UPDATE collections
            SET payload = payload - 'icon'
            WHERE crypto_version = 0 AND payload ? 'icon';
            """
        )
    )
    # Remove 'icon' key from private_collections payload where crypto_version = 0
    op.execute(
        sa.text(
            """
            UPDATE private_collections
            SET payload = payload - 'icon'
            WHERE crypto_version = 0 AND payload ? 'icon';
            """
        )
    )


def downgrade() -> None:
    # Downgrade restores 'icon': null so older models deserialize cleanly
    op.execute(
        sa.text(
            """
            UPDATE collections
            SET payload = jsonb_set(payload, '{icon}', 'null'::jsonb, true)
            WHERE crypto_version = 0 AND NOT (payload ? 'icon');
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE private_collections
            SET payload = jsonb_set(payload, '{icon}', 'null'::jsonb, true)
            WHERE crypto_version = 0 AND NOT (payload ? 'icon');
            """
        )
    )
