"""Add shared-note activity kinds and one feed entry per note and kind (#1969).

The activity feed lists a shared note as "written" and "changed". Both entries
carry references only. The partial unique index keeps one entry per note and
kind, so repeated edits move the single "changed" entry instead of stacking.

Revision ID: 0152
Revises: 0151
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0152"
down_revision = "0151"
branch_labels = None
depends_on = None

_KINDS = (
    "'MEMORY_CREATED', 'MILESTONE_CREATED', 'HEART_MOMENT_CREATED', 'WISH_CREATED', "
    "'PLAN_CREATED', 'PLAN_COMPLETED', 'PLACE_CREATED', 'CHAPTER_CREATED', "
    "'COLLECTION_CREATED', 'COMMENT_CREATED'"
)
_NEW_KINDS = "'SHARED_NOTE_CREATED', 'SHARED_NOTE_CHANGED'"
_INDEX = "uq_activities_shared_note_target_kind"


def _kinds(new: bool) -> None:
    op.drop_constraint(op.f("ck_activities_activity_kind_allowed"), "activities", type_="check")
    kinds = _KINDS + (f", {_NEW_KINDS}" if new else "")
    op.create_check_constraint("activity_kind_allowed", "activities", f"kind IN ({kinds})")


def upgrade() -> None:
    _kinds(True)
    op.create_index(
        _INDEX,
        "activities",
        ["space_id", "target_id", "kind"],
        unique=True,
        postgresql_where=sa.text(
            "kind IN ('SHARED_NOTE_CREATED', 'SHARED_NOTE_CHANGED') AND target_type = 'SHARED_NOTE'"
        ),
    )


def downgrade() -> None:
    op.drop_index(_INDEX, table_name="activities")
    # Entries of the removed kinds would violate the narrower rule.
    op.execute(
        "DELETE FROM activities WHERE kind IN ('SHARED_NOTE_CREATED', 'SHARED_NOTE_CHANGED')"
    )
    _kinds(False)
