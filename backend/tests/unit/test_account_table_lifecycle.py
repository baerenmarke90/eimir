"""Every production account_id must have a reviewed deletion boundary."""

from eimir_pro.plugin import personal_account_models

from eimir.db.base import Base
from eimir.db.registry import load_all_models
from eimir.identity.deletion import PERSONAL_ACCOUNT_ROWS
from tests.support.account_table_lifecycle import RETAINED_ACCOUNT_TABLES


def test_account_id_tables_have_an_explicit_lifecycle() -> None:
    load_all_models()
    actual = {t.name for t in Base.metadata.tables.values() if "account_id" in t.c}
    direct = {model.__tablename__ for model in (*PERSONAL_ACCOUNT_ROWS, *personal_account_models())}
    existing_cleanup = {
        "identity and credentials removed by apply_core_cleanup": {
            "account_emails",
            "account_recovery_tokens",
            "auth_identities",
            "device_sessions",
            "oidc_auth_requests",
            "webauthn_challenges",
            "webauthn_credentials",
            "terms_acceptances",
        },
        "personal settings and provider connections removed by apply_core_cleanup": {
            "app_icon_preferences",
            "personal_settings",
            "push_endpoints",
            "calendar_connections",
            "calendar_oauth_transactions",
            "google_account_hints",
            "photo_source_connections",
            "photo_source_selections",
        },
        "gentle.purge_account and both receipt services": {
            "gentle_memory_exclusions",
            "gentle_occasions",
            "gentle_profiles",
            "create_receipts",
            "memory_create_receipts",
        },
        "retryable media cleanup removes the Account avatar and its binding": {
            "account_profile_attachments"
        },
        "async account cleanup removes recipient settings": {
            "reminder_preferences",
            "rule_preferences",
        },
    }
    policies = [direct, *existing_cleanup.values(), set(RETAINED_ACCOUNT_TABLES)]
    assert sum(map(len, policies)) == len(set.union(*policies)), "Ambiguous account lifecycle"
    assert actual == set.union(*policies)
