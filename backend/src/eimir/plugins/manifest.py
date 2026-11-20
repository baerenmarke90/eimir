"""Core lifecycle manifest of every plugin-owned table (Decision 0017, decision 4).

A Core instance can run without the plugin after it once ran with it. Deletion,
retention, encryption and export must stay correct in that state, so Core owns
this declarative description of the plugin tables and never needs the plugin's
ORM classes for them. A new plugin table needs a row here in the same change;
``tests/unit/test_plugin_manifest.py`` enforces that.

Each row names the table, the capability that owns it, its scope columns (the
Space column and every column holding an Account id) and, for tables with an
encrypted ``payload`` column, the crypto context its ciphertext is bound to.
The rules that act on these rows (purges, expiry, attachments, export, job
kinds) join this format together with the Core call sites they replace.
"""

from __future__ import annotations

from dataclasses import dataclass

from eimir.entitlements.models import Capability


@dataclass(frozen=True)
class PluginTable:
    """One plugin-owned table as Core must know it without the plugin."""

    table: str
    capability: Capability
    space_column: str | None
    account_columns: tuple[str, ...]
    protected_payload_context: str | None = None
    """``ProtectedPayload.crypto_context()`` of the ``payload`` column, if encrypted."""


_GAMES = Capability.GAMES_COUPLE
_SYNC = Capability.INTEGRATION_EXTERNAL_SYNC
_ONCE = Capability.PARTNER_ONCE_MESSAGES
_PRESENCE = Capability.PRESENCE_LOCATION
_QUOTE = Capability.DAILY_QUOTE

PLUGIN_TABLES: tuple[PluginTable, ...] = (
    # Couple games: garden, heart hunt, picture ping-pong and remote rounds.
    PluginTable("gardens", _GAMES, "space_id", ()),
    PluginTable("garden_plants", _GAMES, "space_id", ("sender_id", "receiver_id")),
    PluginTable("garden_waterings", _GAMES, "space_id", ("account_id",)),
    PluginTable("garden_readers", _GAMES, "space_id", ("account_id",)),
    PluginTable("garden_visitor_names", _GAMES, "space_id", ()),
    PluginTable("garden_bouquets", _GAMES, "space_id", ("giver_id", "receiver_id")),
    PluginTable("heart_hunt_rounds", _GAMES, "space_id", ("hider_id", "seeker_id")),
    PluginTable(
        "picture_ping_pong",
        _GAMES,
        "space_id",
        ("started_by", "drawer_id"),
        protected_payload_context="PicturePayload",
    ),
    PluginTable(
        "couple_games",
        _GAMES,
        "space_id",
        ("started_by", "ended_by", "waiting_on_id"),
        protected_payload_context="CoupleGamePayload",
    ),
    # Once messages: sending is Premium, reception and deletion are not paywallable.
    PluginTable(
        "once_messages",
        _ONCE,
        "space_id",
        ("sender_id", "recipient_id"),
        protected_payload_context="OnceEnvelope",
    ),
    PluginTable("once_devices", _ONCE, "space_id", ("account_id",)),
    PluginTable("once_receptions", _ONCE, "space_id", ("account_id",)),
    # Calendar sync.
    PluginTable(
        "calendar_connections",
        _SYNC,
        None,
        ("account_id",),
        protected_payload_context="CalendarConnectionPayload",
    ),
    PluginTable(
        "calendar_oauth_transactions",
        _SYNC,
        "space_id",
        ("account_id",),
        protected_payload_context="CalendarOAuthPayload",
    ),
    PluginTable(
        "space_calendar_targets",
        _SYNC,
        "space_id",
        ("sponsor_account_id",),
        protected_payload_context="SpaceCalendarTargetPayload",
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
    ),
    PluginTable(
        "photo_source_selections",
        _SYNC,
        "space_id",
        ("account_id",),
        protected_payload_context="PhotoSelectionPayload",
    ),
    PluginTable(
        "google_account_hints",
        _SYNC,
        None,
        ("account_id",),
        protected_payload_context="GoogleAccountHintPayload",
    ),
    # Daily quote.
    PluginTable("daily_quote_preferences", _QUOTE, None, ("account_id",)),
    # Partner location: own consent, Stop and deletion are not paywallable.
    PluginTable(
        "partner_location_consents",
        _PRESENCE,
        "space_id",
        ("account_id", "recipient_account_id"),
    ),
    PluginTable(
        "presence_snapshots",
        _PRESENCE,
        "space_id",
        ("account_id",),
        protected_payload_context="PresencePositionPayload",
    ),
    PluginTable("presence_device_credentials", _PRESENCE, "space_id", ("account_id",)),
)

PLUGIN_TABLE_NAMES = frozenset(row.table for row in PLUGIN_TABLES)


def protected_payload_tables() -> tuple[PluginTable, ...]:
    """The plugin tables whose ``payload`` column is encrypted at rest."""
    return tuple(row for row in PLUGIN_TABLES if row.protected_payload_context is not None)
