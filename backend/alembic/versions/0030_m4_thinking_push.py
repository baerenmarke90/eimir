"""M4-B Thinking-of-you and provider-neutral PushDelivery.

Revision ID: 0030
Revises: 0029
Create Date: 2026-08-30
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0030"
down_revision: str | None = "0029"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.drop_constraint("notification_kind_allowed", "notifications", type_="check")
    op.create_check_constraint(
        "notification_kind_allowed",
        "notifications",
        "kind IN ('COMMENT_CREATED', 'THINKING_OF_YOU')",
    )

    op.create_table(
        "thinking_of_you_requests",
        sa.Column("id", UUID, nullable=False),
        sa.Column("space_id", UUID, nullable=False),
        sa.Column("sender_account_id", UUID, nullable=False),
        sa.Column("recipient_account_id", UUID, nullable=False),
        sa.Column("client_request_id", UUID, nullable=False),
        sa.Column("source_event_id", UUID, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_thinking_of_you_requests"),
        sa.ForeignKeyConstraint(
            ["space_id"],
            ["spaces.id"],
            name="fk_thinking_requests_space_id_spaces",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["sender_account_id"],
            ["accounts.id"],
            name="fk_thinking_requests_sender_account_id_accounts",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["recipient_account_id"],
            ["accounts.id"],
            name="fk_thinking_requests_recipient_account_id_accounts",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "sender_account_id <> recipient_account_id",
            name="thinking_sender_ne_recipient",
        ),
        sa.UniqueConstraint(
            "source_event_id",
            name="uq_thinking_of_you_requests_source_event_id",
        ),
        sa.UniqueConstraint(
            "space_id",
            "sender_account_id",
            "client_request_id",
            name="uq_thinking_requests_sender_space_client",
        ),
    )
    op.create_index(
        "ix_thinking_requests_sender_space_created",
        "thinking_of_you_requests",
        ["sender_account_id", "space_id", "created_at"],
    )

    op.create_table(
        "push_endpoints",
        sa.Column("id", UUID, nullable=False),
        sa.Column("account_id", UUID, nullable=False),
        sa.Column("provider_key", sa.String(length=64), nullable=False),
        sa.Column("endpoint_value", sa.String(length=2048), nullable=False),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("disabled_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_push_endpoints"),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            name="fk_push_endpoints_account_id_accounts",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "account_id",
            "provider_key",
            "fingerprint",
            name="uq_push_endpoints_account_provider_fingerprint",
        ),
    )
    op.create_index(
        "ix_push_endpoints_account_active",
        "push_endpoints",
        ["account_id", "disabled_at"],
    )

    op.create_table(
        "push_deliveries",
        sa.Column("id", UUID, nullable=False),
        sa.Column("notification_id", UUID, nullable=False),
        sa.Column("push_endpoint_id", UUID, nullable=False),
        sa.Column("provider_key", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("attempts", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("last_error_code", sa.String(length=64), nullable=True),
        sa.Column("provider_message_id", sa.String(length=256), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_push_deliveries"),
        sa.ForeignKeyConstraint(
            ["notification_id"],
            ["notifications.id"],
            name="fk_push_deliveries_notification_id_notifications",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["push_endpoint_id"],
            ["push_endpoints.id"],
            name="fk_push_deliveries_push_endpoint_id_push_endpoints",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "status IN ('PENDING', 'RETRYING', 'SUCCEEDED', 'FAILED', 'UNAVAILABLE')",
            name="push_delivery_status_allowed",
        ),
        sa.CheckConstraint(
            "attempts >= 0",
            name="push_delivery_attempts_non_negative",
        ),
        sa.UniqueConstraint(
            "notification_id",
            "push_endpoint_id",
            name="uq_push_deliveries_notification_endpoint",
        ),
    )
    op.create_index(
        "ix_push_deliveries_status_created",
        "push_deliveries",
        ["status", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_push_deliveries_status_created", table_name="push_deliveries")
    op.drop_table("push_deliveries")
    op.drop_index("ix_push_endpoints_account_active", table_name="push_endpoints")
    op.drop_table("push_endpoints")
    op.drop_index(
        "ix_thinking_requests_sender_space_created",
        table_name="thinking_of_you_requests",
    )
    op.drop_table("thinking_of_you_requests")

    op.drop_constraint("notification_kind_allowed", "notifications", type_="check")
    op.create_check_constraint(
        "notification_kind_allowed",
        "notifications",
        "kind IN ('COMMENT_CREATED')",
    )
