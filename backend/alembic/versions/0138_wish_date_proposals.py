"""Persist exact Wish date proposals and reuse the create receipt ledger.

Revision ID: 0138
Revises: 0137
"""

import sqlalchemy as sa
from alembic import op

revision = "0138"
down_revision = "0137"
branch_labels = None
depends_on = None

_RECEIPT_TYPES = "'COMMENT', 'WISH', 'PLAN', 'MILESTONE', 'HEART_MOMENT', 'COLLECTION_ITEM'"


def _update_receipt_catalog(include_proposals: bool) -> None:
    name = "create_receipt_resource_type_allowed"
    receipt_types = (
        f"{_RECEIPT_TYPES}, 'WISH_DATE_PROPOSAL'" if include_proposals else _RECEIPT_TYPES
    )
    op.drop_constraint(name, "create_receipts", type_="check")
    op.create_check_constraint(name, "create_receipts", f"resource_type IN ({receipt_types})")


def upgrade() -> None:
    op.create_table(
        "wish_date_proposals",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("wish_id", sa.Uuid(), nullable=False, unique=True),
        sa.Column("space_id", sa.Uuid(), nullable=False),
        sa.Column(
            "proposed_by",
            sa.Uuid(),
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "recipient_id",
            sa.Uuid(),
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("planned_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("counter", sa.Boolean(), nullable=False),
        sa.Column("accepted_plan_id", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(
            ["wish_id", "space_id"], ["wishes.id", "wishes.space_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["accepted_plan_id", "space_id"], ["plans.id", "plans.space_id"], ondelete="CASCADE"
        ),
        sa.CheckConstraint("proposed_by <> recipient_id", name="partners_are_distinct"),
    )
    op.create_index("ix_wish_date_proposals_space_id", "wish_date_proposals", ["space_id"])
    _update_receipt_catalog(True)


def downgrade() -> None:
    op.execute("DELETE FROM create_receipts WHERE resource_type = 'WISH_DATE_PROPOSAL'")
    _update_receipt_catalog(False)
    op.drop_table("wish_date_proposals")
