"""Allow Collection Item creates to carry a request identity (#1808, decision 0015).

Adds ``COLLECTION_ITEM`` to the closed catalog of ``create_receipts`` resource types.

Revision ID: 0128
Revises: 0127
"""

import sqlalchemy as sa
from alembic import op

revision = "0128"
down_revision = "0127"
branch_labels = None
depends_on = None

_BEFORE = ("COMMENT", "WISH", "PLAN", "MILESTONE", "HEART_MOMENT")
_AFTER = (*_BEFORE, "COLLECTION_ITEM")


def _in_list(values: tuple[str, ...]) -> str:
    return "resource_type IN (" + ", ".join(f"'{value}'" for value in values) + ")"


def upgrade() -> None:
    op.drop_constraint("create_receipt_resource_type_allowed", "create_receipts", type_="check")
    op.create_check_constraint(
        "create_receipt_resource_type_allowed", "create_receipts", _in_list(_AFTER)
    )


def downgrade() -> None:
    # Receipts of the removed type only guard retries for at most 24 hours.
    op.execute(sa.text("DELETE FROM create_receipts WHERE resource_type = 'COLLECTION_ITEM'"))
    op.drop_constraint("create_receipt_resource_type_allowed", "create_receipts", type_="check")
    op.create_check_constraint(
        "create_receipt_resource_type_allowed", "create_receipts", _in_list(_BEFORE)
    )
