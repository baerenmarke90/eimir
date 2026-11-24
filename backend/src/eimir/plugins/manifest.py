"""Core lifecycle manifest of every plugin-owned table (Decision 0017, decision 4).

A Core instance can run without the plugin after it once ran with it. Deletion,
retention and encryption must stay correct in that state, so Core owns
this declarative description of the plugin tables and never needs the plugin's
ORM classes for them. A new plugin table needs a row here in the same change;
``tests/unit/test_plugin_manifest.py`` enforces that.

Each row names the table, the capability that owns it, its scope columns (the
Space column and every column holding an Account id), for tables with an
encrypted ``payload`` column the crypto context its ciphertext is bound to, for
tables that own attachments the attachment rule, and the lifecycle rules Core
applies when the owning plugin is **not** loaded (``eimir.plugins.lifecycle``).
With the plugin loaded, its hooks own the lifecycle of its tables and these
rules do not run. Beside the rows, Core declares the job kinds and notification
targets that belong to plugins.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from eimir.engagement.models import EngagementTarget
from eimir.entitlements.models import Capability


class LifecycleEvent(StrEnum):
    """A Core lifecycle point at which plugin rows may have to go."""

    PARTNER_JOINED = "PARTNER_JOINED"
    """A partner joined the Space (``relationship.service.add_member``)."""
    MEMBERSHIP_ENDED = "MEMBERSHIP_ENDED"
    """A membership ended (``relationship.service.end_membership``)."""
    MEMBER_LEFT = "MEMBER_LEFT"
    """A member left the Space themself (``relationship.offboarding.leave_space``)."""
    ACCOUNT_DELETED = "ACCOUNT_DELETED"
    """An Account was deleted (``identity.deletion.apply_core_cleanup``)."""


@dataclass(frozen=True)
class Purge:
    """Delete the rows of the event's Space, or of the event's Account.

    Space events match ``space_column`` and, when ``account_column`` is set, that
    column against the event's Account. ``ACCOUNT_DELETED`` matches only
    ``account_column`` against the deleted Account.
    """

    event: LifecycleEvent
    account_column: str | None = None
    dependents: tuple[str, ...] = ()
    """Tables whose rows with the same ``space_id`` and ``account_id`` go with each matched row."""


@dataclass(frozen=True)
class AttachmentRule:
    """A plugin row that owns at most one attachment."""

    parent_type: str
    """The attachment parent type of the shared vocabulary, for example ``HEART_HUNT_ROUND``."""
    column: str
    """The column holding the attachment id."""
    owner_column: str
    """The Account column whose attachment is private to that Account for account cleanup."""


@dataclass(frozen=True)
class PluginTable:
    """One plugin-owned table as Core must know it without the plugin."""

    table: str
    capability: Capability
    space_column: str | None
    account_columns: tuple[str, ...]
    protected_payload_context: str | None = None
    """``ProtectedPayload.crypto_context()`` of the ``payload`` column, if encrypted."""
    attachment: AttachmentRule | None = None
    purge_on: tuple[Purge, ...] = ()
    expires_columns: tuple[str, ...] = ()
    """A row is due for deletion once any of these timestamps has passed."""
    transient: bool = False
    """Short-lived state that is deleted entirely while its plugin is absent."""
    notification_targets: tuple[EngagementTarget, ...] = ()
    """Notification targets that point at this table's ``id``; deleted with the row."""


_GAMES = Capability.GAMES_COUPLE
_SYNC = Capability.INTEGRATION_EXTERNAL_SYNC
_ONCE = Capability.PARTNER_ONCE_MESSAGES
_PRESENCE = Capability.PRESENCE_LOCATION
_QUOTE = Capability.DAILY_QUOTE
_QUICK_ACTIONS = Capability.PARTNER_QUICK_ACTIONS_EXTENDED
_OPERATOR = Capability.SUPPORT_OPERATOR

_JOINED = Purge(LifecycleEvent.PARTNER_JOINED)
_ENDED = Purge(LifecycleEvent.MEMBERSHIP_ENDED)
_COUPLE_CHANGE = (_JOINED, _ENDED)
_ACCOUNT = Purge(LifecycleEvent.ACCOUNT_DELETED, "account_id")

PLUGIN_TABLES: tuple[PluginTable, ...] = (
    # Couple games: garden, heart hunt, picture ping-pong and remote rounds. They
    # belong to one couple and go when the couple changes.
    PluginTable("gardens", _GAMES, "space_id", (), purge_on=_COUPLE_CHANGE),
    PluginTable(
        "garden_plants",
        _GAMES,
        "space_id",
        ("sender_id", "receiver_id"),
        purge_on=_COUPLE_CHANGE,
        notification_targets=(EngagementTarget.GARDEN_SEED,),
    ),
    PluginTable(
        "garden_waterings",
        _GAMES,
        "space_id",
        ("account_id",),
        purge_on=(*_COUPLE_CHANGE, _ACCOUNT),
    ),
    PluginTable(
        "garden_readers",
        _GAMES,
        "space_id",
        ("account_id",),
        purge_on=(*_COUPLE_CHANGE, _ACCOUNT),
    ),
    PluginTable("garden_visitor_names", _GAMES, "space_id", (), purge_on=_COUPLE_CHANGE),
    PluginTable(
        "garden_bouquets",
        _GAMES,
        "space_id",
        ("giver_id", "receiver_id"),
        purge_on=_COUPLE_CHANGE,
        notification_targets=(EngagementTarget.GARDEN_BOUQUET,),
    ),
    PluginTable(
        "heart_hunt_rounds",
        _GAMES,
        "space_id",
        ("hider_id", "seeker_id"),
        attachment=AttachmentRule("HEART_HUNT_ROUND", "attachment_id", "hider_id"),
        purge_on=(_ENDED,),
        expires_columns=("purge_after",),
    ),
    PluginTable(
        "picture_ping_pong",
        _GAMES,
        "space_id",
        ("started_by", "drawer_id"),
        protected_payload_context="PicturePayload",
        purge_on=_COUPLE_CHANGE,
        notification_targets=(EngagementTarget.PICTURE_GAME,),
    ),
    PluginTable(
        "couple_games",
        _GAMES,
        "space_id",
        ("started_by", "ended_by", "waiting_on_id"),
        protected_payload_context="CoupleGamePayload",
        purge_on=_COUPLE_CHANGE,
        notification_targets=(
            EngagementTarget.WHO_OF_US_GAME,
            EngagementTarget.WISH_DETECTIVE_GAME,
            EngagementTarget.OUR_MOMENTS_GAME,
        ),
    ),
    # Once messages: sending is Premium, reception and deletion are not paywallable.
    # Without the plugin a message goes as soon as its claim window or lifetime
    # ends; the plugin keeps an emptied receipt after the claim window instead.
    PluginTable(
        "once_messages",
        _ONCE,
        "space_id",
        ("sender_id", "recipient_id"),
        protected_payload_context="OnceEnvelope",
        purge_on=(_ENDED,),
        expires_columns=("expires_at", "claim_until"),
        notification_targets=(EngagementTarget.ONCE_MESSAGE,),
    ),
    PluginTable("once_devices", _ONCE, "space_id", ("account_id",), purge_on=(_ENDED, _ACCOUNT)),
    PluginTable("once_receptions", _ONCE, "space_id", ("account_id",), purge_on=(_ENDED, _ACCOUNT)),
    # Calendar sync.
    PluginTable(
        "calendar_connections",
        _SYNC,
        None,
        ("account_id",),
        protected_payload_context="CalendarConnectionPayload",
        purge_on=(_ACCOUNT,),
    ),
    PluginTable(
        "calendar_oauth_transactions",
        _SYNC,
        "space_id",
        ("account_id",),
        protected_payload_context="CalendarOAuthPayload",
        purge_on=(_ACCOUNT,),
        transient=True,
    ),
    PluginTable(
        "space_calendar_targets",
        _SYNC,
        "space_id",
        ("sponsor_account_id",),
        protected_payload_context="SpaceCalendarTargetPayload",
        # A leaving sponsor takes their credentials' target with them.
        purge_on=(Purge(LifecycleEvent.MEMBER_LEFT, "sponsor_account_id"),),
    ),
    PluginTable(
        "plan_calendar_links",
        _SYNC,
        "space_id",
        (),
        protected_payload_context="PlanCalendarLinkPayload",
    ),
    # Photo sources.
    PluginTable(
        "photo_source_connections",
        _SYNC,
        None,
        ("account_id",),
        protected_payload_context="PhotoConnectionPayload",
        purge_on=(_ACCOUNT,),
    ),
    PluginTable(
        "photo_source_selections",
        _SYNC,
        "space_id",
        ("account_id",),
        protected_payload_context="PhotoSelectionPayload",
        purge_on=(_ACCOUNT,),
        transient=True,
    ),
    PluginTable(
        "google_account_hints",
        _SYNC,
        None,
        ("account_id",),
        protected_payload_context="GoogleAccountHintPayload",
        purge_on=(_ACCOUNT,),
    ),
    # Extended partner gestures: content-free idempotency and pacing receipts.
    # Who sent which gesture to whom ends with either Account; the notification
    # they produced is a Core row without a plugin target and stays readable.
    PluginTable(
        "support_gesture_requests",
        _QUICK_ACTIONS,
        "space_id",
        ("sender_account_id", "recipient_account_id"),
        purge_on=(
            Purge(LifecycleEvent.ACCOUNT_DELETED, "sender_account_id"),
            Purge(LifecycleEvent.ACCOUNT_DELETED, "recipient_account_id"),
        ),
    ),
    # Daily quote.
    PluginTable("daily_quote_preferences", _QUOTE, None, ("account_id",), purge_on=(_ACCOUNT,)),
    # Partner location: own consent, Stop and deletion are not paywallable.
    # Without the plugin a deleted recipient's received consents are deleted
    # (the plugin resets them to OFF for the remaining partner instead).
    PluginTable(
        "partner_location_consents",
        _PRESENCE,
        "space_id",
        ("account_id", "recipient_account_id"),
        purge_on=(
            _ACCOUNT,
            # The consent owner's location and publish credential stop with it.
            Purge(
                LifecycleEvent.ACCOUNT_DELETED,
                "recipient_account_id",
                dependents=("presence_snapshots", "presence_device_credentials"),
            ),
        ),
    ),
    PluginTable(
        "presence_snapshots",
        _PRESENCE,
        "space_id",
        ("account_id",),
        protected_payload_context="PresencePositionPayload",
        purge_on=(_ACCOUNT,),
        transient=True,
    ),
    PluginTable(
        "presence_device_credentials",
        _PRESENCE,
        "space_id",
        ("account_id",),
        purge_on=(_ACCOUNT,),
        expires_columns=("expires_at",),
    ),
    # Operator plugin: the tracker ticket of a support report. It holds no scope
    # column; the row cascades with its report (``ON DELETE CASCADE``), so the
    # retention of reports and the deletion of the reporter's Account remove it.
    PluginTable("support_report_tickets", _OPERATOR, None, ()),
)

PLUGIN_TABLE_NAMES = frozenset(row.table for row in PLUGIN_TABLES)

PRO_CAPABILITIES = frozenset(
    {
        Capability.GAMES_COUPLE.value,
        Capability.INTEGRATION_EXTERNAL_SYNC.value,
        Capability.MEDIA_VIDEO_UPLOAD.value,
        Capability.MEMORIES_MAP.value,
        Capability.PARTNER_ONCE_MESSAGES.value,
        Capability.PARTNER_QUICK_ACTIONS_EXTENDED.value,
        Capability.PRESENCE_LOCATION.value,
        Capability.RELATIONSHIP_PASSPORT.value,
        Capability.THEME_BESPOKE_PACKS.value,
        Capability.DAILY_QUOTE.value,
        Capability.PLANNING_DATE_INSPIRATION.value,
    }
)
"""Capabilities implemented by the Pro plugin; granted only while it is loaded.

The capabilities without any implementation (including ``daily.insights``,
whose Einblicke implementation was removed and archived in #2210) keep
today's behavior and join this set when an implementation lands in a plugin.
"""

ADMIN_CAPABILITIES = frozenset({Capability.SUPPORT_OPERATOR.value})
"""Capabilities implemented by the operator plugin (``eimir-admin``); never part of a grant."""

PLUGIN_CAPABILITIES = PRO_CAPABILITIES | ADMIN_CAPABILITIES
"""Every capability a plugin owns; effective only while a loaded plugin provides it."""

PLUGIN_JOB_KINDS = frozenset(
    {
        "calendar_sync.plan",
        "calendar_sync.space",
        "attachment_video_validation",
        "heart_hunt_retention",
        "once_message_expiry",
        "photo_selection_cleanup",
        "photo_selection_expire",
        "presence_retention",
        "recap.announce.v1",
        "recap.backfill.v1",
        "recap.generate.v1",
        "recap.refresh.v1",
        "recap.scan.v1",
    }
)
"""Job kinds only a plugin handles. A worker without that plugin leaves them unclaimed."""

PLUGIN_ENGAGEMENT_TARGETS = frozenset(
    {
        EngagementTarget.ONCE_MESSAGE,
        EngagementTarget.GARDEN_SEED,
        EngagementTarget.GARDEN_BOUQUET,
        EngagementTarget.PICTURE_GAME,
        EngagementTarget.WHO_OF_US_GAME,
        EngagementTarget.WISH_DETECTIVE_GAME,
        EngagementTarget.OUR_MOMENTS_GAME,
    }
)
"""Notification targets whose currency only a plugin decides; never current without it."""


def attachment_rules() -> tuple[tuple[PluginTable, AttachmentRule], ...]:
    """The plugin tables that own attachments, with their rule."""
    return tuple((row, row.attachment) for row in PLUGIN_TABLES if row.attachment is not None)


def protected_payload_tables() -> tuple[PluginTable, ...]:
    """The plugin tables whose ``payload`` column is encrypted at rest."""
    return tuple(row for row in PLUGIN_TABLES if row.protected_payload_context is not None)
