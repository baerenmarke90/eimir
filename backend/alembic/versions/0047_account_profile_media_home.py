"""Account-owned storage home for Account-global profile media.

Revision ID: 0047
Revises: 0046
Create Date: 2026-09-07

``attachments.space_id`` becomes nullable so an Account-global profile avatar
can leave the Space it was uploaded into (#692). ``NULL`` means the owning
Account is the authoritative lifecycle parent; every other attachment keeps its
Space key and its existing cascade.

No data is rewritten here. Adoption moves a provider object between storage
homes, which a schema migration must not attempt: it has no MediaStore, no
retry semantics, and no way to undo a provider write when the transaction rolls
back. Existing avatars therefore stay Space-owned until the runtime adopts
them, which happens when the avatar is next replaced or when its Space reaches
final offboarding retention. The retention path adopts before it deletes the
Space, so no already-bound avatar is lost in the meantime.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0047"
down_revision = "0046"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.alter_column(
        "attachments",
        "space_id",
        existing_type=UUID,
        nullable=True,
    )


def downgrade() -> None:
    # Account-owned rows have no Space to fall back to, and inventing one would
    # move private media into a tenant that never uploaded it. Dropping the
    # binding and the row is the only reversal that keeps tenant isolation
    # intact. Their provider objects live under the Account storage prefix and
    # are not reachable from a schema migration; removing that prefix is an
    # operator step documented with the downgrade.
    op.execute(
        sa.text(
            "DELETE FROM account_profile_attachments WHERE attachment_id IN "
            "(SELECT id FROM attachments WHERE space_id IS NULL)"
        )
    )
    op.execute(sa.text("DELETE FROM attachments WHERE space_id IS NULL"))
    op.alter_column(
        "attachments",
        "space_id",
        existing_type=UUID,
        nullable=False,
    )
