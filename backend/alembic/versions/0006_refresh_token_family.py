"""Refresh token family replay history

Revision ID: 0006
Revises: 0005
Create Date: 2026-08-24
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql
from uuid6 import uuid7

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "consumed_refresh_tokens",
        sa.Column("id", UUID, nullable=False),
        sa.Column("device_session_id", UUID, nullable=False),
        # Store only the hash. This table must not become a second source of
        # authentication proofs.
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "consumed_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["device_session_id"],
            ["device_sessions.id"],
            name="fk_consumed_refresh_tokens_device_session_id_device_sessions",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_consumed_refresh_tokens"),
        sa.UniqueConstraint("token_hash", name="uq_consumed_refresh_tokens_token_hash"),
    )
    op.create_index(
        "ix_consumed_refresh_tokens_device_session_id",
        "consumed_refresh_tokens",
        ["device_session_id"],
    )

    # Carry over the single predecessor generation previously retained so an
    # upgrade does not temporarily lose replay detection already achieved.
    # This loop runs in Python because IDs must be UUIDv7 and PostgreSQL 17
    # does not provide a native generator for them. There is at most one row
    # per device session.
    connection = op.get_bind()
    existing = connection.execute(
        sa.text(
            """
            SELECT id, previous_refresh_token_hash
              FROM device_sessions
             WHERE previous_refresh_token_hash IS NOT NULL
            """
        )
    ).fetchall()
    for session_id, token_hash in existing:
        connection.execute(
            sa.text(
                """
                INSERT INTO consumed_refresh_tokens
                    (id, device_session_id, token_hash, consumed_at)
                VALUES (:id, :device_session_id, :token_hash, CURRENT_TIMESTAMP)
                """
            ),
            {
                "id": uuid7(),
                "device_session_id": session_id,
                "token_hash": token_hash,
            },
        )

    op.drop_column("device_sessions", "previous_refresh_token_hash")


def downgrade() -> None:
    op.add_column(
        "device_sessions",
        sa.Column("previous_refresh_token_hash", sa.String(length=64), nullable=True),
    )

    # The downgrade leaves only the old single-slot window: the most recently
    # consumed generation. Older generations can no longer be attributed,
    # which is exactly the gap this upgrade closes.
    op.execute(
        sa.text(
            """
            UPDATE device_sessions AS target
               SET previous_refresh_token_hash = newest.token_hash
              FROM (
                    SELECT DISTINCT ON (device_session_id)
                           device_session_id, token_hash
                      FROM consumed_refresh_tokens
                     ORDER BY device_session_id, consumed_at DESC, id DESC
                   ) AS newest
             WHERE target.id = newest.device_session_id
            """
        )
    )

    op.drop_index("ix_consumed_refresh_tokens_device_session_id", "consumed_refresh_tokens")
    op.drop_table("consumed_refresh_tokens")
