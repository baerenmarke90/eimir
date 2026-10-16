"""M3 typed content relations between places and shared content.

Revision ID: 0022
Revises: 0021
Create Date: 2026-08-27
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)

# The two targets with a uniform shape. `heart_moments` is handled separately
# below because only there relation validity depends on the privacy class, and
# that dependency becomes part of the key.
#
# `place_plans` and `place_chapters` deliberately do not exist: `Plan.placeId`
# is canonical and single-valued, while `Chapter` does not exist until S5
# (M3-D08/D31).
_TARGETS = ("memories", "milestones")

_TARGET_COLUMNS = {"memories": "memory_id", "milestones": "milestone_id"}


def _privacy_class() -> sa.Enum:
    return sa.Enum(
        "SPACE_SHARED",
        "OWNER_ONLY",
        name="privacy_class",
        native_enum=False,
        create_constraint=True,
    )


def _relation_columns(target_column: str) -> list[sa.Column]:
    """Return the shared shape of every relation join table.

    `space_id` is stored in the join row even though it can be derived from
    both sides. That is the point: because the *same* column participates in
    both composite foreign keys, a relation cannot connect rows from different
    Spaces. Same-Space is therefore a schema property rather than a rule a
    service must remember (M3-D08).
    """
    return [
        sa.Column("place_id", UUID, nullable=False),
        sa.Column(target_column, UUID, nullable=False),
        sa.Column("space_id", UUID, nullable=False),
        sa.Column("created_by", UUID, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    ]


def upgrade() -> None:
    # Targets for the composite foreign keys. Without these unique constraints
    # PostgreSQL cannot reference the pair (id, space_id).
    op.create_unique_constraint("uq_memories_id_space_id", "memories", ["id", "space_id"])
    op.create_unique_constraint("uq_milestones_id_space_id", "milestones", ["id", "space_id"])

    # HeartMoment additionally carries privacy class in the key. It is why
    # this slice is sensitive at all, and the schema carries the invariant
    # rather than leaving it to a service rule.
    op.create_unique_constraint(
        "uq_heart_moments_id_space_id_privacy",
        "heart_moments",
        ["id", "space_id", "privacy_class"],
    )

    for target in _TARGETS:
        table = f"place_{target}"
        target_column = _TARGET_COLUMNS[target]

        op.create_table(
            table,
            *_relation_columns(target_column),
            # The primary key is also uniqueness: the same relation cannot
            # exist twice. A duplicate PUT is therefore idempotent and needs
            # no preceding SELECT (M3-D26).
            sa.PrimaryKeyConstraint("place_id", target_column, name=f"pk_{table}"),
            sa.ForeignKeyConstraint(
                ["place_id", "space_id"],
                ["places.id", "places.space_id"],
                name=f"fk_{table}_place_id_places",
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                [target_column, "space_id"],
                [f"{target}.id", f"{target}.space_id"],
                name=f"fk_{table}_{target_column}_{target}",
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["created_by"],
                ["accounts.id"],
                name=f"fk_{table}_created_by_accounts",
                ondelete="CASCADE",
            ),
        )
        # Reverse lookup for places linked to a target and cleanup on target
        # deletion.
        op.create_index(f"ix_{table}_{target_column}", table, [target_column])
        op.create_index(f"ix_{table}_space_id", table, ["space_id"])
        op.create_index(
            f"ix_{table}_place_id_created_at",
            table,
            ["place_id", "created_at", target_column],
        )

    # HeartMoments may be related only while shared (M3-D09).
    #
    # The join row carries the target privacy class and pins it to
    # `SPACE_SHARED` with a CHECK. The foreign key references
    # `(id, space_id, privacy_class)` and cascades updates. If a HeartMoment
    # changes to `OWNER_ONLY` without removing its relations first, the update
    # propagates the class into the join row and the CHECK aborts the
    # transaction.
    #
    # The service removes relations in the same transaction and therefore
    # never hits that constraint. This is the safety floor beneath the
    # service: the state "private but provable through a shared relation"
    # cannot be persisted even by a later code path unaware of the rule.
    op.create_table(
        "place_heart_moments",
        *_relation_columns("heart_moment_id"),
        sa.Column("target_privacy_class", _privacy_class(), nullable=False),
        sa.PrimaryKeyConstraint("place_id", "heart_moment_id", name="pk_place_heart_moments"),
        sa.CheckConstraint(
            "target_privacy_class = 'SPACE_SHARED'",
            name="relation_target_is_shared",
        ),
        sa.ForeignKeyConstraint(
            ["place_id", "space_id"],
            ["places.id", "places.space_id"],
            name="fk_place_heart_moments_place_id_places",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["heart_moment_id", "space_id", "target_privacy_class"],
            ["heart_moments.id", "heart_moments.space_id", "heart_moments.privacy_class"],
            name="fk_place_heart_moments_heart_moment_id_heart_moments",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["accounts.id"],
            name="fk_place_heart_moments_created_by_accounts",
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ix_place_heart_moments_heart_moment_id",
        "place_heart_moments",
        ["heart_moment_id"],
    )
    op.create_index("ix_place_heart_moments_space_id", "place_heart_moments", ["space_id"])
    op.create_index(
        "ix_place_heart_moments_place_id_created_at",
        "place_heart_moments",
        ["place_id", "created_at", "heart_moment_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_place_heart_moments_place_id_created_at", table_name="place_heart_moments")
    op.drop_index("ix_place_heart_moments_space_id", table_name="place_heart_moments")
    op.drop_index("ix_place_heart_moments_heart_moment_id", table_name="place_heart_moments")
    op.drop_table("place_heart_moments")

    for target in _TARGETS:
        table = f"place_{target}"
        target_column = _TARGET_COLUMNS[target]
        op.drop_index(f"ix_{table}_place_id_created_at", table_name=table)
        op.drop_index(f"ix_{table}_space_id", table_name=table)
        op.drop_index(f"ix_{table}_{target_column}", table_name=table)
        op.drop_table(table)

    op.drop_constraint("uq_heart_moments_id_space_id_privacy", "heart_moments", type_="unique")
    op.drop_constraint("uq_milestones_id_space_id", "milestones", type_="unique")
    op.drop_constraint("uq_memories_id_space_id", "memories", type_="unique")
