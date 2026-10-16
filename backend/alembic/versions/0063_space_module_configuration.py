"""Create typed Space module configuration.

Revision ID: 0063
Revises: 0062
Create Date: 2026-09-20

The resource is deliberately typed rather than a free-form feature map. Its
initial values match docs/m7/SPACE-MODULE-CONFIGURATION.md v1.0.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql
from uuid6 import uuid7

revision = "0063"
down_revision = "0062"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


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
        "space_configurations",
        sa.Column("id", UUID, nullable=False),
        sa.Column("space_id", UUID, nullable=False),
        sa.Column("vibe_check_enabled", sa.Boolean(), nullable=False),
        sa.Column("energy_check_in_enabled", sa.Boolean(), nullable=False),
        sa.Column("love_notes_enabled", sa.Boolean(), nullable=False),
        sa.Column("support_gestures_enabled", sa.Boolean(), nullable=False),
        sa.Column("shared_achievements_enabled", sa.Boolean(), nullable=False),
        sa.Column("daily_questions_enabled", sa.Boolean(), nullable=False),
        sa.Column("daily_context_timezone", sa.String(length=64), nullable=True),
        sa.Column("vibe_visibility_mode", sa.String(length=24), nullable=False),
        sa.Column("energy_visibility_mode", sa.String(length=24), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_space_configurations"),
        sa.ForeignKeyConstraint(
            ["space_id"],
            ["spaces.id"],
            name="fk_space_configurations_space_id_spaces",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("space_id", name="uq_space_configurations_space_id"),
        sa.CheckConstraint(
            "vibe_visibility_mode IN ('IMMEDIATE', 'MUTUAL_REVEAL')",
            name="vibe_visibility_mode_is_known",
        ),
        sa.CheckConstraint(
            "energy_visibility_mode IN ('IMMEDIATE', 'MUTUAL_REVEAL')",
            name="energy_visibility_mode_is_known",
        ),
    )

    bind = op.get_bind()
    spaces = sa.table("spaces", sa.column("id", UUID))
    configurations = sa.table(
        "space_configurations",
        sa.column("id", UUID),
        sa.column("space_id", UUID),
        sa.column("vibe_check_enabled", sa.Boolean()),
        sa.column("energy_check_in_enabled", sa.Boolean()),
        sa.column("love_notes_enabled", sa.Boolean()),
        sa.column("support_gestures_enabled", sa.Boolean()),
        sa.column("shared_achievements_enabled", sa.Boolean()),
        sa.column("daily_questions_enabled", sa.Boolean()),
        sa.column("daily_context_timezone", sa.String()),
        sa.column("vibe_visibility_mode", sa.String()),
        sa.column("energy_visibility_mode", sa.String()),
        sa.column("version", sa.Integer()),
    )
    existing_spaces = bind.execute(sa.select(spaces.c.id)).all()
    if existing_spaces:
        bind.execute(
            configurations.insert(),
            [
                {
                    "id": uuid7(),
                    "space_id": row.id,
                    "vibe_check_enabled": False,
                    "energy_check_in_enabled": False,
                    "love_notes_enabled": False,
                    "support_gestures_enabled": True,
                    "shared_achievements_enabled": False,
                    "daily_questions_enabled": False,
                    "daily_context_timezone": None,
                    "vibe_visibility_mode": "IMMEDIATE",
                    "energy_visibility_mode": "IMMEDIATE",
                    "version": 1,
                }
                for row in existing_spaces
            ],
        )


def downgrade() -> None:
    op.drop_table("space_configurations")
