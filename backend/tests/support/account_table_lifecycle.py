"""Reviewed account_id columns that deliberately survive core account deletion."""

RETAINED_ACCOUNT_TABLES = {
    "account_deletions": "Completion and restore-reconciliation evidence.",
    "memberships": "Ended membership attributes shared history to its pseudonymous author.",
    "entitlement_grants": "Keeps the surviving Space grant and its billing sponsor.",
    "store_purchase_references": "Opaque store reference for purchase reconciliation.",
    "demo_canonical_identities": "Synthetic persona registry used by demo maintenance.",
    "partner_nicknames": "Subject ID. The surviving owner's private nickname belongs to them.",
    "profile_preferences": "Subject ID. Cascade own profiles and remove notes by owner.",
}
