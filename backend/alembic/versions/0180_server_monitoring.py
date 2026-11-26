"""ServerAdmin monitoring: heartbeats, request metrics, history, alerts (#2317).

Revision ID: 0180
Revises: 0179
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0180"
down_revision = "0179"
branch_labels = None
depends_on = None

_OLD_SETTINGS = "setting IN ('registration_enabled', 'maintenance_mode')"
_NEW_SETTINGS = (
    "setting IN ('registration_enabled', 'maintenance_mode', 'monitoring_alerts_enabled')"
)


def upgrade() -> None:
    op.create_table(
        "worker_heartbeats",
        sa.Column("worker_name", sa.String(128), primary_key=True),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("build_revision", sa.String(64), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_progress_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("role IN ('worker', 'video-worker')", name="role_valid"),
    )
    op.create_table(
        "request_metric_minutes",
        sa.Column("minute", sa.DateTime(timezone=True), primary_key=True),
        sa.Column("requests", sa.Integer(), nullable=False),
        sa.Column("server_errors", sa.Integer(), nullable=False),
        sa.Column("latency_buckets", postgresql.JSONB(), nullable=False),
    )
    op.create_table(
        "operational_metric_hours",
        sa.Column("hour", sa.DateTime(timezone=True), primary_key=True),
        sa.Column("requests", sa.Integer(), nullable=False),
        sa.Column("server_errors", sa.Integer(), nullable=False),
        sa.Column("p95_ms", sa.Integer(), nullable=True),
        sa.Column("new_accounts", sa.Integer(), nullable=False),
        sa.Column("active_spaces", sa.Integer(), nullable=False),
        sa.Column("stored_bytes", sa.BigInteger(), nullable=False),
        sa.Column("disk_used_bytes", sa.BigInteger(), nullable=True),
        sa.Column("disk_total_bytes", sa.BigInteger(), nullable=True),
        sa.Column("failed_jobs", sa.Integer(), nullable=False),
        sa.Column("failed_emails", sa.Integer(), nullable=False),
        sa.Column("failed_pushes", sa.Integer(), nullable=False),
    )
    op.create_table(
        "monitoring_alert_states",
        sa.Column("code", sa.String(64), primary_key=True),
        sa.Column("active_since", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("high_water_mark", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "instance_administration_settings",
        sa.Column(
            "monitoring_alerts_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    op.drop_constraint(
        op.f("ck_instance_administration_events_setting_valid"),
        "instance_administration_events",
        type_="check",
    )
    op.create_check_constraint("setting_valid", "instance_administration_events", _NEW_SETTINGS)


def downgrade() -> None:
    op.execute(
        "DELETE FROM instance_administration_events WHERE setting = 'monitoring_alerts_enabled'"
    )
    op.drop_constraint(
        op.f("ck_instance_administration_events_setting_valid"),
        "instance_administration_events",
        type_="check",
    )
    op.create_check_constraint("setting_valid", "instance_administration_events", _OLD_SETTINGS)
    op.drop_column("instance_administration_settings", "monitoring_alerts_enabled")
    op.drop_table("monitoring_alert_states")
    op.drop_table("operational_metric_hours")
    op.drop_table("request_metric_minutes")
    op.drop_table("worker_heartbeats")
