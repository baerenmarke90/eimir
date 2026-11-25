"""Core's manifest executor for an absent plugin (Decision 0017, decision 4).

The per-feature files cover purges at partner join, membership end, a member
leaving and account deletion; this file covers expiry of short-lived state, the
rule that the executor never runs for a loaded plugin, and that the rows of the
real manifest match the migrated schema.

No Pro table is needed except where a test says so: the executor is exercised on
a fake plugin (``tests.support.fake_plugin``), so the file runs in the public
Core CI, which installs Core alone. The real Pro tables, as the Pro plugin owns
them, are covered in ``backend/pro/pro_tests``.
"""

from __future__ import annotations

from datetime import date, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from eimir.config import Environment
from eimir.core.clock import now
from eimir.demo import create_demo_space
from eimir.entitlements.models import Capability
from eimir.plugins import dormant, lifecycle
from eimir.plugins.manifest import PLUGIN_TABLES, LifecycleEvent
from tests.conftest import make_account, make_space, requires_database
from tests.support.fake_plugin import (
    ALL_TABLES,
    CREDENTIALS,
    MEMBER_STATE,
    PICKER_SESSIONS,
    FakePlugin,
    count_rows,
    insert_row,
    install_fake_plugin_tables,
    loaded,
)
from tests.support.plugins import CHAIN_PLUGIN_TABLES, without_plugins

pytestmark = [pytest.mark.integration, requires_database]

ALL_CAPABILITIES = tuple(table.row.capability for table in ALL_TABLES)


@pytest.fixture
def fake_tables(session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    install_fake_plugin_tables(session, monkeypatch, *ALL_TABLES)


def _rows(session: Session, space_id, account_id, *, expires_in: timedelta) -> None:  # type: ignore[no-untyped-def]
    """One row of every kind the executor treats differently, expired or not."""
    keys = {"space_id": space_id, "account_id": account_id}
    insert_row(session, PICKER_SESSIONS, **keys, expires_at=now() + expires_in)
    insert_row(session, CREDENTIALS, **keys, expires_at=now() + expires_in)
    insert_row(session, MEMBER_STATE, **keys)


def test_with_the_plugin_loaded_the_executor_leaves_its_tables_alone(
    session: Session, fake_tables: None
) -> None:
    """No double execution: the loaded plugin's hooks own its tables."""
    space_id, account_id = uuid4(), uuid4()
    _rows(session, space_id, account_id, expires_in=-timedelta(minutes=1))
    plugin = FakePlugin(*ALL_CAPABILITIES)
    with loaded(plugin):
        assert lifecycle.absent_tables() == ()
        assert lifecycle.prune_expired(session) == 0
        for event in LifecycleEvent:
            assert (
                lifecycle.apply_event(session, event, space_id=space_id, account_id=account_id) == 0
            )
        # The Core entry points call the plugin's hooks, and only those.
        lifecycle.partner_joined(session, space_id)
        lifecycle.membership_ended(session, space_id, account_id)
        lifecycle.member_left(session, space_id, account_id)
        lifecycle.account_deleted(session, account_id)
        lifecycle.security_retention(session)
    assert plugin.calls == [
        ("partner_joined", (space_id,)),
        ("membership_ended", (space_id, account_id)),
        ("member_left", (space_id, account_id)),
        ("account_deleted", (account_id,)),
        ("prune_expired", ()),
    ]
    for table in (PICKER_SESSIONS, CREDENTIALS, MEMBER_STATE):
        assert count_rows(session, table) == 1, table.name


def test_the_executor_runs_only_for_the_capabilities_no_loaded_plugin_provides(
    session: Session, fake_tables: None
) -> None:
    space_id, account_id = uuid4(), uuid4()
    _rows(session, space_id, account_id, expires_in=-timedelta(minutes=1))
    plugin = FakePlugin(Capability.PRESENCE_LOCATION)
    with loaded(plugin):
        assert {row.capability for row in lifecycle.absent_tables()} == {
            table.row.capability
            for table in ALL_TABLES
            if table.row.capability is not Capability.PRESENCE_LOCATION
        }
        lifecycle.security_retention(session)
    # The loaded plugin's expired credential is its own to delete; the absent plugin's goes.
    assert count_rows(session, CREDENTIALS) == 1
    assert count_rows(session, PICKER_SESSIONS) == 0


def test_without_the_plugin_short_lived_state_goes(session: Session, fake_tables: None) -> None:
    _rows(session, uuid4(), uuid4(), expires_in=-timedelta(minutes=1))
    with without_plugins():
        assert {row.table for row in lifecycle.absent_tables()} >= {
            PICKER_SESSIONS.name,
            CREDENTIALS.name,
        }
        assert lifecycle.prune_expired(session) == 2
    # Sessions are deleted at once without the plugin; credentials at their expiry.
    assert count_rows(session, PICKER_SESSIONS) == 0
    assert count_rows(session, CREDENTIALS) == 0
    # A row without any expiry rule is not retention's to delete.
    assert count_rows(session, MEMBER_STATE) == 1


def test_without_the_plugin_a_valid_credential_stays_until_its_expiry(
    session: Session, fake_tables: None
) -> None:
    _rows(session, uuid4(), uuid4(), expires_in=timedelta(hours=1))
    with without_plugins():
        assert lifecycle.prune_expired(session) == 1
    assert count_rows(session, PICKER_SESSIONS) == 0
    assert count_rows(session, CREDENTIALS) == 1
    with without_plugins():
        # Retention at a later instant sees the credential as expired.
        assert lifecycle.prune_expired(session, at=now() + timedelta(hours=2)) == 1
    assert count_rows(session, CREDENTIALS) == 0


def test_without_the_plugin_the_demo_has_no_plugin_examples(session: Session) -> None:
    """C19: the demo seeds quote preferences and a location share only through the plugin."""
    with without_plugins():
        result = create_demo_space(
            session,
            environment=Environment.TEST,
            lea_password="core-only-demo-test-password",
            alex_password="core-only-demo-test-password",
            reference_date=date(2026, 8, 24),
        )
    session.flush()
    assert result.created
    assert (
        session.execute(
            text("SELECT count(*) FROM daily_quote_preferences WHERE account_id IN (:lea, :alex)"),
            {"lea": result.lea_id, "alex": result.alex_id},
        ).scalar_one()
        == 0
    )
    assert (
        session.execute(
            text("SELECT count(*) FROM partner_location_consents WHERE space_id = :space"),
            {"space": result.space_id},
        ).scalar_one()
        == 0
    )


# The real manifest rows against the migrated schema. In the public Core CI the
# Pro tables come from the Core migration chain, so this is where a manifest row
# that names a missing column fails there.


def _real_plugin_tables():  # type: ignore[no-untyped-def]
    return [row for row in PLUGIN_TABLES if row.table not in CHAIN_PLUGIN_TABLES]


@pytest.mark.parametrize("row", _real_plugin_tables(), ids=lambda row: row.table)
def test_every_real_manifest_row_matches_the_migrated_table(session: Session, row) -> None:  # type: ignore[no-untyped-def]
    columns = {column["name"] for column in inspect(session.connection()).get_columns(row.table)}
    needed = {*row.account_columns, *row.expires_columns}
    if row.space_column:
        needed.add(row.space_column)
    if row.notification_targets or row.attachment is not None:
        needed.add("id")
    if row.attachment is not None:
        needed |= {row.attachment.column, row.attachment.owner_column}
    if row.protected_payload_context is not None:
        needed |= {"payload", "crypto_version"}
    for rule in row.purge_on:
        if rule.account_column:
            needed.add(rule.account_column)
    assert needed <= columns, f"{row.table}: missing {sorted(needed - columns)}"


def test_the_executor_statements_of_the_real_manifest_run_on_the_migrated_schema(
    session: Session,
) -> None:
    """Every purge, expiry and dependent statement is valid SQL against the real tables."""
    anna = make_account(session, "Anna")
    space = make_space(session, anna)
    with without_plugins():
        for event in LifecycleEvent:
            assert lifecycle.apply_event(session, event, space_id=space.id, account_id=anna.id) == 0
        assert lifecycle.prune_expired(session) == 0
        assert dormant.dormant_plugin_data(session.connection()) == {}
