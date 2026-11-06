"""Make related people collaborative Space content under PO decision #1683.

Revision ID: 0116
Revises: 0115
"""

from alembic import op

revision = "0116"
down_revision = "0115"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The composite FK cascades only the copied person class, never a date's
    # independent privacy/owner. Retain all identities, media and preferences.
    op.execute(
        "UPDATE related_persons SET privacy_class = 'SPACE_SHARED', "
        "version = version + 1, updated_at = CURRENT_TIMESTAMP "
        "WHERE privacy_class <> 'SPACE_SHARED'"
    )
    op.create_check_constraint(
        "people_are_shared", "related_persons", "privacy_class = 'SPACE_SHARED'"
    )


def downgrade() -> None:
    # Reversing the schema must not fabricate former privacy or erase content.
    op.drop_constraint("people_are_shared", "related_persons", type_="check")
