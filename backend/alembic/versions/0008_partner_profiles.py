"""Partner profiles and profile preferences

Revision ID: 0008
Revises: 0007
Create Date: 2026-08-24
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql
from uuid6 import uuid7

revision = "0008"
down_revision = "0007"
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


def _privacy_class() -> sa.Enum:
    return sa.Enum(
        "SPACE_SHARED",
        "OWNER_ONLY",
        name="privacy_class",
        native_enum=False,
        create_constraint=True,
    )


def upgrade() -> None:
    op.create_table(
        "partner_profiles",
        sa.Column("id", UUID, nullable=False),
        sa.Column("space_id", UUID, nullable=False),
        sa.Column("owner_id", UUID, nullable=False),
        sa.Column("privacy_class", _privacy_class(), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_partner_profiles"),
        sa.ForeignKeyConstraint(
            ["space_id"],
            ["spaces.id"],
            name="fk_partner_profiles_space_id_spaces",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["accounts.id"],
            name="fk_partner_profiles_owner_id_accounts",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "space_id",
            "owner_id",
            name="uq_partner_profiles_space_id_owner_id",
        ),
        sa.CheckConstraint("privacy_class = 'SPACE_SHARED'", name="privacy_is_space_shared"),
    )
    op.create_index("ix_partner_profiles_space_id", "partner_profiles", ["space_id"])

    op.create_table(
        "profile_preferences",
        sa.Column("id", UUID, nullable=False),
        sa.Column("profile_id", UUID, nullable=True),
        sa.Column("account_id", UUID, nullable=False),
        sa.Column("space_id", UUID, nullable=False),
        sa.Column("owner_id", UUID, nullable=False),
        sa.Column("privacy_class", _privacy_class(), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("topic", sa.String(length=120), nullable=False),
        sa.Column("sentiment", sa.String(length=16), nullable=False),
        sa.Column("visibility", sa.String(length=32), nullable=False),
        sa.Column("crypto_version", sa.SmallInteger(), server_default=sa.text("0"), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_profile_preferences"),
        sa.ForeignKeyConstraint(
            ["profile_id"],
            ["partner_profiles.id"],
            name="fk_profile_preferences_profile_id_partner_profiles",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            name="fk_profile_preferences_account_id_accounts",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["space_id"],
            ["spaces.id"],
            name="fk_profile_preferences_space_id_spaces",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["accounts.id"],
            name="fk_profile_preferences_owner_id_accounts",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "category IN ('FOOD', 'DRINK', 'FLOWERS', 'MOVIES', 'SERIES', 'MUSIC', "
            "'HOBBIES', 'ACTIVITIES', 'TRAVEL', 'RESTAURANTS', 'COLORS', 'OTHER')",
            name="category_is_known",
        ),
        sa.CheckConstraint(
            "sentiment IN ('LOVE', 'LIKE', 'NEUTRAL', 'DISLIKE', 'AVOID')",
            name="sentiment_is_known",
        ),
        sa.CheckConstraint(
            "visibility IN ('SELF_PROFILE', 'PRIVATE_PARTNER_NOTE')",
            name="visibility_is_known",
        ),
        sa.CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
        sa.CheckConstraint(
            "(visibility = 'SELF_PROFILE' AND account_id = owner_id "
            "AND privacy_class = 'SPACE_SHARED' AND profile_id IS NOT NULL) OR "
            "(visibility = 'PRIVATE_PARTNER_NOTE' AND account_id <> owner_id "
            "AND privacy_class = 'OWNER_ONLY' AND profile_id IS NULL)",
            name="visibility_matches_owner_and_privacy",
        ),
    )
    op.create_index("ix_profile_preferences_space_id", "profile_preferences", ["space_id"])
    op.create_index("ix_profile_preferences_owner_id", "profile_preferences", ["owner_id"])
    op.create_index(
        "ix_profile_preferences_space_id_account_id_visibility",
        "profile_preferences",
        ["space_id", "account_id", "visibility"],
    )

    # Give every existing membership one visible profile. Keep UUIDv7 for the
    # backfill as well; gen_random_uuid() would generate UUIDv4.
    bind = op.get_bind()
    memberships = sa.table(
        "memberships",
        sa.column("space_id", UUID),
        sa.column("account_id", UUID),
    )
    partner_profiles = sa.table(
        "partner_profiles",
        sa.column("id", UUID),
        sa.column("space_id", UUID),
        sa.column("owner_id", UUID),
        sa.column("privacy_class", sa.String()),
    )
    memberships_rows = bind.execute(
        sa.select(memberships.c.space_id, memberships.c.account_id)
    ).all()
    if memberships_rows:
        bind.execute(
            partner_profiles.insert(),
            [
                {
                    "id": uuid7(),
                    "space_id": row.space_id,
                    "owner_id": row.account_id,
                    "privacy_class": "SPACE_SHARED",
                }
                for row in memberships_rows
            ],
        )


def downgrade() -> None:
    op.drop_index(
        "ix_profile_preferences_space_id_account_id_visibility",
        table_name="profile_preferences",
    )
    op.drop_index("ix_profile_preferences_owner_id", table_name="profile_preferences")
    op.drop_index("ix_profile_preferences_space_id", table_name="profile_preferences")
    op.drop_table("profile_preferences")
    op.drop_index("ix_partner_profiles_space_id", table_name="partner_profiles")
    op.drop_table("partner_profiles")
