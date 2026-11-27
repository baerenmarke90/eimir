"""Allow encrypted device preview v4: operator notices name their topic (#2337).

Preview v4 keeps every v3 field and meaning; an operator notice then carries its
closed topic code and may stay valid for up to an hour. The negotiated version
is stored per FCM endpoint like v3 (0170). A downgrade returns v4 endpoints to
v3, which every v4 app also reads.

Revision ID: 0183
Revises: 0182
"""

from alembic import op

revision = "0183"
down_revision = "0182"
branch_labels = None
depends_on = None

TABLE = "push_preview_secrets"
CONSTRAINT = "preview_protocol_version_valid"


def upgrade() -> None:
    op.drop_constraint(CONSTRAINT, TABLE, type_="check")
    op.create_check_constraint(CONSTRAINT, TABLE, "preview_version IN (1, 2, 3, 4)")


def downgrade() -> None:
    op.execute("UPDATE push_preview_secrets SET preview_version = 3 WHERE preview_version = 4")
    op.drop_constraint(CONSTRAINT, TABLE, type_="check")
    op.create_check_constraint(CONSTRAINT, TABLE, "preview_version IN (1, 2, 3)")
