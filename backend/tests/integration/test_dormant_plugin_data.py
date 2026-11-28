"""Startup warning for data of plugins that are not loaded (Decision 0017, decision 5).

Not a Pro feature module: the Core-only CI job runs it with ``EIMIR_PLUGINS=""``
and without the Pro distribution. The data belongs to a fake plugin
(``tests.support.fake_plugin``). In the plugin-loaded configuration the Core-only
cases simulate the absent plugin.
"""

from __future__ import annotations

import logging
from collections.abc import Iterator
from contextlib import contextmanager, nullcontext

import pytest
from sqlalchemy.orm import Session

from eimir.entitlements.models import Capability
from eimir.plugins import dormant
from eimir.relationship import service as relationship_service
from tests.conftest import make_account, make_space, requires_database
from tests.support.fake_plugin import (
    ACCOUNT_PREFERENCES,
    COUPLE_ITEMS,
    FakePlugin,
    count_rows,
    insert_row,
    install_fake_plugin_tables,
    loaded,
)
from tests.support.plugins import plugins_loaded, without_plugins

pytestmark = [pytest.mark.integration, requires_database]


@contextmanager
def core_only() -> Iterator[None]:
    with nullcontext() if not plugins_loaded() else without_plugins():
        yield


@contextmanager
def plugin_loaded() -> Iterator[None]:
    """A plugin that provides both capabilities of the fake tables is loaded."""
    with loaded(FakePlugin(Capability.DAILY_QUOTE, Capability.GAMES_COUPLE)):
        yield


@pytest.fixture(autouse=True)
def fake_plugin_tables(session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    """Two plugin tables: one per Account and one per Space (two capabilities)."""
    install_fake_plugin_tables(session, monkeypatch, ACCOUNT_PREFERENCES, COUPLE_ITEMS)


def _warnings(caplog: pytest.LogCaptureFixture) -> list[logging.LogRecord]:
    return [
        record
        for record in caplog.records
        if record.name == dormant.__name__ and record.levelno == logging.WARNING
    ]


@pytest.fixture
def dormant_rows(session: Session):  # type: ignore[no-untyped-def]
    anna, ben = make_account(session, "Anna"), make_account(session, "Ben")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    insert_row(session, ACCOUNT_PREFERENCES, account_id=anna.id)
    insert_row(session, ACCOUNT_PREFERENCES, account_id=ben.id)
    insert_row(session, COUPLE_ITEMS, space_id=space.id, sender_id=anna.id, receiver_id=ben.id)
    return anna, ben, space


def test_core_only_with_plugin_data_warns_once_with_names_and_counts_only(  # type: ignore[no-untyped-def]
    session: Session, dormant_rows, caplog: pytest.LogCaptureFixture
) -> None:
    anna, ben, space = dormant_rows
    caplog.set_level(logging.DEBUG, logger=dormant.__name__)
    with core_only():
        found = dormant.warn_dormant_plugin_data(session.connection())
    assert found == {
        "daily.quote": {"fake_account_preferences": 2},
        "games.couple": {"fake_couple_items": 1},
    }
    [record] = _warnings(caplog)
    message = record.getMessage()
    assert "daily.quote: fake_account_preferences (2)" in message
    assert "games.couple: fake_couple_items (1)" in message
    assert "EIMIR_PLUGINS" in message and "untouched" in message
    assert record.dormant_plugin_data == found  # type: ignore[attr-defined]
    for identifier in (anna.id, ben.id, space.id):
        assert str(identifier) not in caplog.text
    # The check only reads.
    assert count_rows(session, ACCOUNT_PREFERENCES) == 2


def test_core_only_without_plugin_data_logs_no_warning(  # type: ignore[no-untyped-def]
    session: Session, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG, logger=dormant.__name__)
    with core_only():
        assert dormant.warn_dormant_plugin_data(session.connection()) == {}
    assert _warnings(caplog) == []


def test_with_the_plugin_loaded_no_table_is_checked(  # type: ignore[no-untyped-def]
    session: Session, dormant_rows, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG, logger=dormant.__name__)
    with plugin_loaded():
        assert dormant.warn_dormant_plugin_data(session.connection()) == {}
    assert _warnings(caplog) == []


def test_large_tables_are_reported_as_at_least_the_limit(  # type: ignore[no-untyped-def]
    session: Session,
    dormant_rows,
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(dormant, "COUNT_LIMIT", 1)
    caplog.set_level(logging.DEBUG, logger=dormant.__name__)
    with core_only():
        dormant.warn_dormant_plugin_data(session.connection())
    [record] = _warnings(caplog)
    assert "fake_account_preferences (at least 1)" in record.getMessage()
    assert "fake_couple_items (1)" in record.getMessage()


def test_a_missing_table_is_skipped_and_the_rest_still_counted(  # type: ignore[no-untyped-def]
    session: Session,
    dormant_rows,
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from dataclasses import replace

    from eimir.plugins import lifecycle

    with core_only():
        rows = lifecycle.absent_tables()
    missing = replace(rows[0], table="plugin_table_that_does_not_exist")
    monkeypatch.setattr(dormant, "absent_tables", lambda: (missing, *rows))
    caplog.set_level(logging.DEBUG, logger=dormant.__name__)
    found = dormant.warn_dormant_plugin_data(session.connection())
    assert "plugin_table_that_does_not_exist" not in str(found)
    assert found["daily.quote"] == {"fake_account_preferences": 2}
    assert any("skipped a table" in record.getMessage() for record in caplog.records)
    # The caller's transaction is still usable after the failed statement.
    assert count_rows(session, ACCOUNT_PREFERENCES) == 2


def test_a_database_error_never_stops_the_start(  # type: ignore[no-untyped-def]
    caplog: pytest.LogCaptureFixture,
) -> None:
    class Unreachable:
        def connect(self):  # type: ignore[no-untyped-def]
            raise OSError("database unavailable")

    caplog.set_level(logging.DEBUG, logger=dormant.__name__)
    with core_only():
        assert dormant.warn_dormant_plugin_data(Unreachable()) == {}  # type: ignore[arg-type]
    assert _warnings(caplog) == []
    assert any("check skipped" in record.getMessage() for record in caplog.records)


def test_the_warning_runs_once_per_process(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[object] = []
    monkeypatch.setattr(dormant, "_warned", False)
    monkeypatch.setattr(dormant, "warn_dormant_plugin_data", calls.append)
    dormant.warn_dormant_plugin_data_once("engine")  # type: ignore[arg-type]
    dormant.warn_dormant_plugin_data_once("engine")  # type: ignore[arg-type]
    assert calls == ["engine"]
