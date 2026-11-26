"""The portability allowlist: which Core tables travel in a bundle (Decision 0020).

An operator export carries only what is listed here. Everything else cannot enter
the archive because it has no entry. ``tests/unit/test_allowlist_guard.py`` reflects
over every table of the Core schema and requires each one to be classified either as
exported or as deliberately excluded, so a new table cannot be forgotten silently.
"""

from __future__ import annotations

FILE_TABLES: dict[str, tuple[str, ...]] = {
    "space.json": ("space_profiles",),
    "profiles.json": ("partner_profiles", "partner_nicknames", "profile_preferences"),
    "people.json": ("related_persons", "important_dates"),
    "memories.json": ("memories", "memory_attachments", "memory_plans", "memory_wishes"),
    "heart-moments.json": ("heart_moments", "heart_moment_attachments", "heart_moment_plans"),
    "milestones.json": ("milestones", "milestone_plans"),
    "comments.json": ("comments",),
    "wishes.json": ("wishes",),
    "plans.json": (
        "plans",
        "plan_attachments",
        "plan_file_attachments",
        "plan_collections",
        "plan_notes",
    ),
    "places.json": (
        "places",
        "place_memories",
        "place_milestones",
        "place_heart_moments",
    ),
    "chapters.json": (
        "chapters",
        "chapter_memories",
        "chapter_milestones",
        "chapter_heart_moments",
    ),
    "collections.json": ("collections", "collection_items", "collection_suggestions"),
    "shared-notes.json": ("shared_notes",),
    "reminders.json": ("reminders", "reminder_offsets", "reminder_preferences"),
    "rules.json": ("rule_preferences",),
    "recaps.json": ("recap_editions", "recap_sources", "recap_reflections"),
    "private/notes.json": ("private_notes",),
    "private/gift-ideas.json": ("gift_ideas",),
    "private/collections.json": ("private_collections", "private_collection_items"),
    # The shared garden (slice S1b). Games are not exported.
    "garden.json": (
        "gardens",
        "garden_plants",
        "garden_waterings",
        "garden_readers",
        "garden_visitor_names",
        "garden_bouquets",
    ),
}
# Tables of a Pro feature that stay in the Core migration chain, so the target database has
# them whether or not the plugin is loaded. They are still handled only when they exist.
GARDEN_FILE = "garden.json"
GARDEN_TABLES = FILE_TABLES[GARDEN_FILE]
OPTIONAL_TABLES = frozenset(GARDEN_TABLES)
PRIVATE_FILES = frozenset(name for name in FILE_TABLES if name.startswith("private/"))
PRIVATE_ROOTS = frozenset({"private_notes", "gift_ideas", "private_collections"})
ACCOUNT_SCOPED_CONFIG_TABLES = frozenset({"rule_preferences", "reminder_preferences"})
CHILD_PARENT: dict[str, tuple[str, str]] = {
    "collection_items": ("collection_id", "collections"),
    "collection_suggestions": ("collection_id", "collections"),
    "private_collection_items": ("collection_id", "private_collections"),
    "reminder_offsets": ("reminder_id", "reminders"),
    "reminder_preferences": ("reminder_id", "reminders"),
    "memory_attachments": ("memory_id", "memories"),
    "plan_attachments": ("plan_id", "plans"),
    "plan_file_attachments": ("plan_id", "plans"),
    "heart_moment_attachments": ("heart_moment_id", "heart_moments"),
    "recap_sources": ("edition_id", "recap_editions"),
}
RELATION_REQUIREMENTS: dict[str, tuple[tuple[str, str], ...]] = {
    "plan_collections": (("plan_id", "plans"), ("collection_id", "collections")),
    "plan_notes": (("plan_id", "plans"), ("note_id", "shared_notes")),
    "memory_plans": (("memory_id", "memories"), ("plan_id", "plans")),
    "heart_moment_plans": (("heart_moment_id", "heart_moments"), ("plan_id", "plans")),
    "milestone_plans": (("milestone_id", "milestones"), ("plan_id", "plans")),
    "memory_wishes": (("memory_id", "memories"), ("wish_id", "wishes")),
    "place_memories": (("place_id", "places"), ("memory_id", "memories")),
    "place_milestones": (("place_id", "places"), ("milestone_id", "milestones")),
    "place_heart_moments": (("place_id", "places"), ("heart_moment_id", "heart_moments")),
    "chapter_memories": (("chapter_id", "chapters"), ("memory_id", "memories")),
    "chapter_milestones": (("chapter_id", "chapters"), ("milestone_id", "milestones")),
    "chapter_heart_moments": (
        ("chapter_id", "chapters"),
        ("heart_moment_id", "heart_moments"),
    ),
}
# Columns that reference a member account. ``completed_by`` is optional (#1808):
# an item completed before the actor was recorded has none.
ACCOUNT_REFERENCE_COLUMNS = frozenset(
    {"owner_id", "created_by", "account_id", "completed_by", "edited_by"}
)
# Further columns that hold a member account, per table. They have no foreign key, so the
# generic ``*_id`` handling would not insist on a mapping for them.
TABLE_ACCOUNT_COLUMNS: dict[str, frozenset[str]] = {
    "garden_plants": frozenset({"sender_id", "receiver_id"}),
    "garden_bouquets": frozenset({"giver_id", "receiver_id"}),
}
# Array columns whose elements are member accounts.
ACCOUNT_ARRAY_COLUMNS: dict[str, frozenset[str]] = {
    "garden_bouquets": frozenset({"flower_senders"}),
}


def account_columns(table_name: str) -> frozenset[str]:
    """Every column of the table that refers to one member account."""
    return ACCOUNT_REFERENCE_COLUMNS | TABLE_ACCOUNT_COLUMNS.get(table_name, frozenset())


INSERT_ORDER = (
    "space_profiles",
    "partner_profiles",
    "partner_nicknames",
    "profile_preferences",
    "related_persons",
    "important_dates",
    "memories",
    "heart_moments",
    "milestones",
    "wishes",
    "places",
    "plans",
    "chapters",
    "collections",
    "collection_items",
    "collection_suggestions",
    "shared_notes",
    "private_notes",
    "gift_ideas",
    "private_collections",
    "private_collection_items",
    "reminders",
    "reminder_offsets",
    "reminder_preferences",
    "rule_preferences",
    "comments",
    "recap_editions",
    "recap_sources",
    "recap_reflections",
    "memory_plans",
    "heart_moment_plans",
    "milestone_plans",
    "memory_wishes",
    "plan_collections",
    "plan_notes",
    "place_memories",
    "place_milestones",
    "place_heart_moments",
    "chapter_memories",
    "chapter_milestones",
    "chapter_heart_moments",
    "memory_attachments",
    "plan_attachments",
    "plan_file_attachments",
    "heart_moment_attachments",
    "gardens",
    "garden_plants",
    "garden_readers",
    "garden_visitor_names",
    "garden_waterings",
    "garden_bouquets",
)


# Tables the exporter reads outside FILE_TABLES. Each one feeds ``accounts.json`` or the
# media section of the bundle; the import ignores or re-derives them as noted.
ACCOUNT_DOCUMENT_TABLES: dict[str, str] = {
    "attachments": "Media metadata (media/index.json) and, per item, its stored files.",
    "accounts": "Member display names, birthday, locale and timezone (accounts.json).",
    "account_emails": "Verified email of each member, used to map members on import.",
    "memberships": "Which accounts are active members of the exported Space.",
    "app_icon_preferences": "Personal appearance choices; export-only, import never applies them.",
    "personal_settings": "The member's saved choices; export-only.",
    "wish_selection_rounds": "Current wish selection occasion; export-only decision state.",
    "wish_selection_candidates": "Candidates of the current wish selection; export-only.",
    "wish_selections": "The member's own choices in the current round; export-only.",
    "gentle_profiles": "The member's gentle-prompt settings; export-only.",
    "gentle_memory_exclusions": "Memories the member excluded from gentle prompts; export-only.",
    "photo_source_connections": "Photo-source markers (provider, origin), never credentials.",
    "google_account_hints": "The Google account hint (email) of the member, never tokens.",
    # Support conversations with the operator (#2189, #2245): the requesting person's own
    # reports and the reply they received are part of the personal data copy (Art. 15, 20 GDPR).
    "support_reports": "The requester's own reports (personal scope); export-only.",
    "support_report_replies": "The reply to each of the requester's own reports; export-only.",
}

# Every other Core table, deliberately not exported, with the reason. A table that is
# neither here, in FILE_TABLES nor in ACCOUNT_DOCUMENT_TABLES fails the allowlist guard.
EXCLUDED_TABLES: dict[str, str] = {
    # Authentication, sessions and credentials: never portable.
    "account_deletions": "Account deletion state.",
    "account_recovery_tokens": "Credential material.",
    "auth_identities": "Sign-in identities of the old instance.",
    "consumed_refresh_tokens": "Session state.",
    "device_sessions": "Session state.",
    "email_verification_tokens": "Credential material.",
    "invitations": "Open invitations belong to the old instance.",
    "magic_link_tokens": "Credential material.",
    "oidc_auth_requests": "Transient sign-in state.",
    "rate_limit_events": "Runtime abuse counters.",
    "recent_auth_grants": "Transient sign-in state.",
    "recent_auth_oidc": "Transient sign-in state.",
    "recent_auth_webauthn": "Transient sign-in state.",
    "signup_proofs": "Transient sign-up state.",
    "terms_acceptances": "Legal acceptance is given again on the target instance.",
    "webauthn_challenges": "Transient sign-in state.",
    "webauthn_credentials": "Passkeys are bound to the old instance and domain.",
    # Jobs, outbox, delivery and notification projections: runtime state.
    "activities": "Activity projection, rebuilt from content.",
    "email_deliveries": "Delivery log.",
    "jobs": "Job queue of the old instance.",
    "notification_preferences": "Set up again in the target.",
    "notifications": "Notification projection; set up again in the target.",
    "outbox_events": "Outbox of the old instance.",
    "push_deliveries": "Delivery log.",
    "push_endpoint_secrets": "Device credentials.",
    "push_endpoints": "Devices of the old instance.",
    "push_preview_secrets": "Device credentials.",
    "thinking_of_you_requests": "Transient gesture requests.",
    "support_gesture_requests": "Transient gesture requests.",
    "attachment_playback_grants": "Short-lived playback grants.",
    "reminder_occurrences": "Not part of bundle v1; follows from reminders.",
    "story_item_view_aggregates": "Not part of bundle v1.",
    "discover_selection_snapshots": "Not part of bundle v1.",
    "create_receipts": "Idempotency receipts.",
    "memory_create_receipts": "Idempotency receipts.",
    "context_tag_suggestions": "Not part of bundle v1.",
    "gentle_occasions": "Not part of bundle v1.",
    # Entitlements and billing: belong to the account and the instance.
    "entitlement_grants": "Entitlements are never copied between instances.",
    "store_purchase_references": "Store purchases belong to the old instance.",
    # Instance administration and demo data.
    "demo_canonical_identities": "Demo data.",
    "instance_administration_action_events": "Instance administration log.",
    "instance_administration_events": "Instance administration log.",
    "instance_administration_settings": "Instance administration.",
    # ServerAdmin monitoring (#2317): operational state of the old instance.
    "monitoring_alert_states": "Alert state of the old instance.",
    "operational_metric_hours": "Operational history of the old instance.",
    "request_metric_minutes": "Request counters of the old instance.",
    "worker_heartbeats": "Worker liveness of the old instance.",
    # ServerAdmin part 3 (#2324): an operator decision on the old instance.
    "space_storage_quota_overrides": "Individual quotas are set again by the target's operator.",
    "instance_bootstrap_state": "Instance administration.",
    "spaces": "The target Space exists already; the Space identity is not copied.",
    "space_configurations": "Instance-level Space configuration.",
    # Set up again in the target (decision of 2026-11-23).
    "once_devices": "One-time messages are set up again in the target.",
    "once_messages": "One-time messages are set up again in the target.",
    "once_receptions": "One-time messages are set up again in the target.",
    "partner_location_consents": "Location sharing is consented to again in the target.",
    "photo_location_drafts": "Location drafts.",
    "presence_device_credentials": "Location sharing is set up again in the target.",
    "presence_snapshots": "Location sharing is set up again in the target.",
    "space_presence": "Location sharing is set up again in the target.",
    "calendar_connections": "Calendar sync is set up again in the target.",
    "calendar_oauth_transactions": "Calendar sync is set up again in the target.",
    "plan_calendar_links": "Calendar sync is set up again in the target.",
    "space_calendar_targets": "Calendar sync is set up again in the target.",
    "photo_source_selections": "Photo sources are set up again in the target.",
    # Games are not exported (decision of 2026-11-23).
    "couple_games": "Games are not exported.",
    "heart_hunt_rounds": "Games are not exported.",
    "picture_ping_pong": "Games are not exported.",
    # Personal interface preferences and small per-account state; not part of bundle v1.
    "account_profile_attachments": "Not part of bundle v1.",
    "daily_check_in_vibe_notes": "Not part of bundle v1.",
    "daily_check_ins": "Not part of bundle v1.",
    "daily_quote_preferences": "Not part of bundle v1; set up again.",
    "dashboard_module_collections": "Not part of bundle v1; set up again.",
    "dashboard_module_preferences": "Not part of bundle v1; set up again.",
    "wish_date_proposals": "Not part of bundle v1.",
    "wish_reminders": "Not part of bundle v1.",
    # Operator-side technical link of a support report to the operator's ticket (#2189). It is
    # not personal content of the reporter, so it stays out of the personal data copy (#2245).
    "support_report_tickets": "Operator-side ticket link of a report; not the person's content.",
    # The operator's reply templates (#2327): operator text shared by all ServerAdmins.
    "support_reply_templates": "Operator's reply templates; operator text, not a person's content.",
    # The Transfer Bundle's own tables (feature removed by Decision 0020).
    "transfer_exports": "Transfer Bundle bookkeeping of the removed self-service feature.",
    "transfer_imports": "Transfer Bundle bookkeeping of the removed self-service feature.",
    "transfer_skipped_videos": "Transfer Bundle bookkeeping of the removed self-service feature.",
}
