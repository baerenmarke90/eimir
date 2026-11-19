"""Remove account-owned data left behind by completed pseudonymization.

Revision ID: 0163
Revises: 0162
"""

from alembic import op

revision = "0163"
down_revision = "0162"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Advance by the immutable account key, including completed rows restored
    # from earlier backups. Only grants pointing at that recipient are reset.
    op.execute("""
        DO $cleanup$
        DECLARE
            batch uuid[];
            last_id uuid;
        BEGIN
            LOOP
                SELECT array_agg(account_id ORDER BY account_id) INTO batch FROM (
                    SELECT account_id FROM account_deletions WHERE status = 'COMPLETED'
                        AND (last_id IS NULL OR account_id > last_id)
                    ORDER BY account_id LIMIT 250
                ) pending;
                EXIT WHEN batch IS NULL;
                DELETE FROM daily_check_ins WHERE account_id = ANY(batch);
                DELETE FROM daily_insight_feedback WHERE account_id = ANY(batch);
                DELETE FROM daily_quote_preferences WHERE account_id = ANY(batch);
                DELETE FROM dashboard_module_preferences WHERE account_id = ANY(batch);
                DELETE FROM notification_preferences WHERE account_id = ANY(batch);
                DELETE FROM once_devices WHERE account_id = ANY(batch);
                DELETE FROM once_receptions WHERE account_id = ANY(batch);
                DELETE FROM garden_readers WHERE account_id = ANY(batch);
                DELETE FROM garden_waterings WHERE account_id = ANY(batch);
                DELETE FROM recent_auth_grants WHERE account_id = ANY(batch);
                DELETE FROM recent_auth_oidc WHERE account_id = ANY(batch);
                DELETE FROM recent_auth_webauthn WHERE account_id = ANY(batch);
                DELETE FROM space_presence WHERE account_id = ANY(batch);
                DELETE FROM wish_reminders WHERE account_id = ANY(batch);
                DELETE FROM presence_snapshots p WHERE p.account_id = ANY(batch) OR EXISTS (
                    SELECT 1 FROM partner_location_consents c
                    WHERE (c.space_id, c.account_id) = (p.space_id, p.account_id)
                    AND c.recipient_account_id = ANY(batch));
                DELETE FROM presence_device_credentials p
                WHERE p.account_id = ANY(batch) OR EXISTS (
                    SELECT 1 FROM partner_location_consents c
                    WHERE (c.space_id, c.account_id) = (p.space_id, p.account_id)
                    AND c.recipient_account_id = ANY(batch));
                DELETE FROM partner_location_consents WHERE account_id = ANY(batch);
                UPDATE partner_location_consents SET recipient_account_id = NULL,
                    level = 'OFF',
                    indefinite = false, expires_at = NULL, suspended_at = NULL,
                    generation = generation + 1, updated_at = now()
                WHERE recipient_account_id = ANY(batch);
                last_id := batch[cardinality(batch)];
            END LOOP;
        END $cleanup$;
    """)


def downgrade() -> None:
    # Deleted personal data cannot be reconstructed.
    pass
