"""Retain shared HeartMoment and Milestone links to canonical Plans.

Revision ID: 0119
Revises: 0118
"""

import sqlalchemy as sa
from alembic import op

revision = "0119"
down_revision = "0118"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table, source, source_table in (
        ("heart_moment_plans", "heart_moment_id", "heart_moments"),
        ("milestone_plans", "milestone_id", "milestones"),
    ):
        columns = [
            sa.Column(source, sa.UUID(), primary_key=True),
            sa.Column("plan_id", sa.UUID(), primary_key=True),
            sa.Column("space_id", sa.UUID(), nullable=False),
            sa.Column(
                "created_by",
                sa.UUID(),
                sa.ForeignKey("accounts.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
        ]
        constraints = [
            sa.ForeignKeyConstraint(
                ["plan_id", "space_id"], ["plans.id", "plans.space_id"], ondelete="CASCADE"
            ),
        ]
        if source_table == "heart_moments":
            columns.append(
                sa.Column(
                    "source_privacy_class",
                    sa.Enum(
                        "SPACE_SHARED",
                        "OWNER_ONLY",
                        name="privacy_class",
                        native_enum=False,
                        create_constraint=True,
                    ),
                    nullable=False,
                )
            )
            constraints.extend(
                [
                    sa.CheckConstraint(
                        "source_privacy_class = 'SPACE_SHARED'", name="relation_source_is_shared"
                    ),
                    sa.ForeignKeyConstraint(
                        [source, "space_id", "source_privacy_class"],
                        [
                            "heart_moments.id",
                            "heart_moments.space_id",
                            "heart_moments.privacy_class",
                        ],
                        ondelete="CASCADE",
                        onupdate="CASCADE",
                    ),
                ]
            )
        else:
            constraints.append(
                sa.ForeignKeyConstraint(
                    [source, "space_id"],
                    [f"{source_table}.id", f"{source_table}.space_id"],
                    ondelete="CASCADE",
                )
            )
        op.create_table(table, *columns, *constraints)
        op.create_index(f"ix_{table}_plan_id", table, ["plan_id"])
        op.create_index(f"ix_{table}_space_id", table, ["space_id"])


def downgrade() -> None:
    op.drop_table("milestone_plans")
    op.drop_table("heart_moment_plans")
