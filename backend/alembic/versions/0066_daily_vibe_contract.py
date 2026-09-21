"""Freeze the typed V1 Vibe catalog on shared Daily Check-in rows.

Revision ID: 0066
Revises: 0065
Create Date: 2026-09-21
"""

from __future__ import annotations

from alembic import op

revision = "0066"
down_revision = "0065"
branch_labels = None
depends_on = None

_VIBE_CHECK = (
    "vibe IS NULL OR vibe IN "
    "('GOOD', 'OKAY', 'STRESSED', 'SAD', 'NEEDS_CONNECTION', 'NEEDS_SPACE')"
)


def upgrade() -> None:
    op.drop_constraint("vibe_contract_pending", "daily_check_ins", type_="check")
    op.create_check_constraint("vibe_is_known", "daily_check_ins", _VIBE_CHECK)


def downgrade() -> None:
    # Revision 0065 cannot represent Vibe at all. Preserve combined Energy rows
    # by clearing only Vibe and remove Vibe-only rows before restoring the old
    # vibe-is-null contract; otherwise has_dimension would reject them.
    op.execute("DELETE FROM daily_check_ins WHERE vibe IS NOT NULL AND energy_level IS NULL")
    op.execute("UPDATE daily_check_ins SET vibe = NULL WHERE vibe IS NOT NULL")
    op.drop_constraint("vibe_is_known", "daily_check_ins", type_="check")
    op.create_check_constraint("vibe_contract_pending", "daily_check_ins", "vibe IS NULL")
