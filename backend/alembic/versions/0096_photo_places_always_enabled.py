"""Keep selected-photo Places enabled after retiring the settings switch.

Revision ID: 0096
Revises: 0095
"""

from alembic import op

revision = "0096"
down_revision = "0095"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Advance revisions so a pre-upgrade writer cannot reuse the old preference.
    # Previously stripped GPS is never reconstructed or backfilled.
    op.execute(
        "UPDATE accounts SET photo_locations_enabled = true, "
        "photo_locations_version = photo_locations_version + 1 "
        "WHERE photo_locations_enabled = false"
    )


def downgrade() -> None:
    # The retired per-account off choices are not reconstructible. Keep all
    # content and the current enabled default when rolling the code back.
    pass
