"""Reset once-message reception: receiving now needs the eimir. app (#683).

Receiving devices registered before this revision cannot be told apart from
browser registrations, so every registration ends here (PO decision
2026-11-19). Each person turns reception on again once in the app. Pending
ciphertext was encrypted for the removed keys and can no longer be opened, so
it goes too, with its notices; it would have expired within 24 hours anyway.
The version bump makes any open consent screen reload before it acts.
"""

from alembic import op

revision = "0165"
down_revision = "0164"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DELETE FROM notifications WHERE target_type = 'ONCE_MESSAGE'")
    op.execute("DELETE FROM once_messages")
    op.execute("DELETE FROM once_devices")
    op.execute("UPDATE once_receptions SET enabled = false, version = version + 1 WHERE enabled")


def downgrade() -> None:
    # Removed keys and ciphertext cannot be restored; reception stays off
    # until a person turns it on again.
    pass
