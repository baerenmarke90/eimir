"""A fake plugin and its manifest, for the lifecycle tests of Core's manifest executor.

Core's manifest executor (``eimir.plugins.lifecycle``, ``manifest``, ``dormant``)
works on the table descriptions of ``eimir.plugins.manifest``, never on a
plugin's models. Its tests therefore need no Pro table: they declare a few fake
plugin tables with their own manifest rows, create them for the length of one
test, and let the executor run against them. The public Core CI installs Core
alone, so these tests cover the executor there (Decision 0017, #2182).

Each fake table is a ``TEMP`` table of the test's connection. It is visible to
every statement the executor runs in the test transaction (the executor names
tables without a schema), and it disappears with the rolled-back transaction, so
no test leaves anything behind and the shared test schema stays untouched.

Which behaviour a fake table exercises is stated at its definition. The rows use
real ``Capability`` values and real ``EngagementTarget`` values because both are
Core vocabulary; only the table names are fake.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from eimir.engagement.models import EngagementTarget
from eimir.entitlements.models import Capability
from eimir.plugins import lifecycle as plugin_lifecycle
from eimir.plugins import loader
from eimir.plugins.manifest import AttachmentRule, LifecycleEvent, PluginTable, Purge
from eimir.security import lifecycle as security_lifecycle


@dataclass(frozen=True)
class FakeTable:
    """A fake plugin table: its manifest row and the columns beyond ``id``."""

    row: PluginTable
    columns: str
    """SQL column definitions after ``id``, for example ``space_id uuid NOT NULL``."""

    @property
    def name(self) -> str:
        return self.row.table

    def create(self, session: Session) -> None:
        session.execute(
            text(
                f"CREATE TEMP TABLE {self.name} "
                f"(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), {self.columns})"
            )
        )


_ENDED = Purge(LifecycleEvent.MEMBERSHIP_ENDED)
_COUPLE_CHANGE = (Purge(LifecycleEvent.PARTNER_JOINED), _ENDED)
_ACCOUNT = Purge(LifecycleEvent.ACCOUNT_DELETED, "account_id")

COUPLE_ITEMS = FakeTable(
    PluginTable(
        "fake_couple_items",
        Capability.GAMES_COUPLE,
        "space_id",
        ("sender_id", "receiver_id"),
        purge_on=_COUPLE_CHANGE,
        notification_targets=(EngagementTarget.GARDEN_SEED,),
    ),
    "space_id uuid NOT NULL, sender_id uuid NOT NULL, receiver_id uuid NOT NULL",
)
"""Rows of one couple: they go when a partner joins or a membership ends, with their notices."""

SEALED_NOTES = FakeTable(
    PluginTable(
        "fake_sealed_notes",
        Capability.PARTNER_ONCE_MESSAGES,
        "space_id",
        ("sender_id", "recipient_id"),
        protected_payload_context="FakeNotePayload",
        purge_on=(_ENDED,),
        expires_columns=("expires_at", "claim_until"),
        notification_targets=(EngagementTarget.ONCE_MESSAGE,),
    ),
    "space_id uuid NOT NULL, sender_id uuid NOT NULL, recipient_id uuid NOT NULL, "
    "expires_at timestamptz NOT NULL, claim_until timestamptz, "
    "payload jsonb NOT NULL, crypto_version smallint NOT NULL DEFAULT 0",
)
"""Content with a lifetime and a claim window; the only fake table with an encrypted payload."""

MEMBER_STATE = FakeTable(
    PluginTable(
        "fake_member_state",
        Capability.PARTNER_ONCE_MESSAGES,
        "space_id",
        ("account_id",),
        purge_on=(_ENDED, _ACCOUNT, Purge(LifecycleEvent.MEMBER_LEFT, "account_id")),
    ),
    "space_id uuid NOT NULL, account_id uuid NOT NULL",
)
"""One member's rows in a Space: they go with the couple, the member's leaving or deletion."""

PICKER_SESSIONS = FakeTable(
    PluginTable(
        "fake_picker_sessions",
        Capability.INTEGRATION_EXTERNAL_SYNC,
        "space_id",
        ("account_id",),
        purge_on=(_ACCOUNT,),
        expires_columns=("expires_at",),
        transient=True,
    ),
    "space_id uuid NOT NULL, account_id uuid NOT NULL, expires_at timestamptz NOT NULL",
)
"""Short-lived state: deleted entirely while its plugin is absent, expired or not."""

CREDENTIALS = FakeTable(
    PluginTable(
        "fake_credentials",
        Capability.PRESENCE_LOCATION,
        "space_id",
        ("account_id",),
        purge_on=(_ACCOUNT,),
        expires_columns=("expires_at",),
    ),
    "space_id uuid NOT NULL, account_id uuid NOT NULL, expires_at timestamptz NOT NULL",
)
"""Rows that stay until their expiry."""

CONSENTS = FakeTable(
    PluginTable(
        "fake_consents",
        Capability.PRESENCE_LOCATION,
        "space_id",
        ("account_id", "recipient_account_id"),
        purge_on=(
            _ACCOUNT,
            # The owner's credentials stop with the consent they are bound to.
            Purge(
                LifecycleEvent.ACCOUNT_DELETED,
                "recipient_account_id",
                dependents=("fake_credentials",),
            ),
        ),
    ),
    "space_id uuid NOT NULL, account_id uuid NOT NULL, recipient_account_id uuid NOT NULL",
)
"""A rule with dependents: matched rows take the dependent rows of the same Space and Account."""

ACCOUNT_PREFERENCES = FakeTable(
    PluginTable(
        "fake_account_preferences",
        Capability.DAILY_QUOTE,
        None,
        ("account_id",),
        purge_on=(_ACCOUNT,),
    ),
    "account_id uuid NOT NULL",
)
"""A table without a Space column."""

ROUNDS = FakeTable(
    PluginTable(
        "fake_rounds",
        Capability.GAMES_COUPLE,
        "space_id",
        ("hider_id", "seeker_id"),
        attachment=AttachmentRule("ROUND", "attachment_id", "hider_id"),
        purge_on=(_ENDED,),
    ),
    "space_id uuid NOT NULL, hider_id uuid NOT NULL, seeker_id uuid NOT NULL, attachment_id uuid",
)
"""A row that owns one attachment: deleting the row hands the attachment to the media cleanup."""

ALL_TABLES = (
    COUPLE_ITEMS,
    SEALED_NOTES,
    MEMBER_STATE,
    PICKER_SESSIONS,
    CREDENTIALS,
    CONSENTS,
    ACCOUNT_PREFERENCES,
    ROUNDS,
)


class FakePlugin:
    """A loaded plugin that provides some capabilities and records its lifecycle hooks.

    It implements only what the lifecycle functions call. Install it with
    ``loaded(plugin)``.
    """

    name = "fake"

    def __init__(self, *capabilities: Capability) -> None:
        self._capabilities = frozenset(capability.value for capability in capabilities)
        self.calls: list[tuple[str, tuple[UUID, ...]]] = []

    def capabilities(self) -> frozenset[str]:
        return self._capabilities

    def on_partner_joined(self, session: Session, space_id: UUID) -> None:
        self.calls.append(("partner_joined", (space_id,)))

    def on_membership_ended(self, session: Session, space_id: UUID, account_id: UUID) -> None:
        self.calls.append(("membership_ended", (space_id, account_id)))

    def on_member_left(self, session: Session, space_id: UUID, account_id: UUID) -> None:
        self.calls.append(("member_left", (space_id, account_id)))

    def on_account_deleted(self, session: Session, account_id: UUID) -> None:
        self.calls.append(("account_deleted", (account_id,)))

    def prune_expired(self, session: Session) -> None:
        self.calls.append(("prune_expired", ()))


def install_fake_plugin_tables(
    session: Session, monkeypatch: pytest.MonkeyPatch, *tables: FakeTable
) -> None:
    """Create ``tables`` for this test and make them the whole plugin manifest.

    Core's manifest executor, its dormant-data check and the encryption lifecycle
    then see only these tables. The real manifest rows are replaced, so nothing
    here depends on which plugin tables the installed distributions own.
    """
    for table in tables:
        table.create(session)
    rows = tuple(table.row for table in tables)
    monkeypatch.setattr(plugin_lifecycle, "PLUGIN_TABLES", rows)
    monkeypatch.setattr(
        security_lifecycle,
        "protected_payload_tables",
        lambda: tuple(row for row in rows if row.protected_payload_context is not None),
    )


@contextmanager
def loaded(*plugins: FakePlugin) -> Iterator[None]:
    """Make ``loaded_plugins()`` report exactly ``plugins`` inside the block."""
    previous = loader.loaded_plugins()
    loader._loaded = loader.LoadedPlugins(plugins)  # type: ignore[arg-type]
    try:
        yield
    finally:
        loader._loaded = previous


def insert_row(session: Session, table: FakeTable, **values: Any) -> UUID:
    """Insert one row and return its id. ``payload`` is stored as JSON."""
    columns = list(values)
    placeholders = [
        f"CAST(:{name} AS jsonb)" if name == "payload" else f":{name}" for name in columns
    ]
    parameters = {
        name: json.dumps(value) if name == "payload" else value for name, value in values.items()
    }
    identifier = session.execute(
        text(
            f"INSERT INTO {table.name} ({', '.join(columns)}) "
            f"VALUES ({', '.join(placeholders)}) RETURNING id"
        ),
        parameters,
    ).scalar_one()
    return identifier  # type: ignore[no-any-return]


def count_rows(session: Session, table: FakeTable, where: str = "true", **parameters: Any) -> int:
    return int(
        session.execute(
            text(f"SELECT count(*) FROM {table.name} WHERE {where}"), parameters
        ).scalar_one()
    )


def row_ids(session: Session, table: FakeTable) -> set[UUID]:
    return set(session.execute(text(f"SELECT id FROM {table.name}")).scalars())
