"""Allow the detailed encrypted device preview v3 (#2158).

Preview v3 carries every notice's real content, still encrypted for the
recipient's own device. The negotiated version is stored per FCM endpoint like
v2 (0109). A downgrade returns v3 endpoints to v2, which every v3 app also reads.

Revision ID: 0170
Revises: 0169
"""

from alembic import op

revision = "0170"
down_revision = "0169"
branch_labels = None
depends_on = None

TABLE = "push_preview_secrets"
CONSTRAINT = "preview_protocol_version_valid"


def upgrade() -> None:
    op.drop_constraint(CONSTRAINT, TABLE, type_="check")
    op.create_check_constraint(CONSTRAINT, TABLE, "preview_version IN (1, 2, 3)")


def downgrade() -> None:
    op.execute("UPDATE push_preview_secrets SET preview_version = 2 WHERE preview_version = 3")
    op.drop_constraint(CONSTRAINT, TABLE, type_="check")
    op.create_check_constraint(CONSTRAINT, TABLE, "preview_version IN (1, 2)")
