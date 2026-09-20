"""Real Alembic upgrade coverage for the 0061 -> 0062 -> 0063 configuration chain."""

from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import alembic.command
import alembic.config
import pytest
import sqlalchemy as sa
from sqlalchemy.engine import Connection, Engine

from tests.conftest import requires_database


def _current_revision(connection: Connection) -> str:
    return str(connection.execute(sa.text("SELECT version_num FROM alembic_version")).scalar_one())


def _configuration_manager(connection: Connection, space_id: UUID) -> UUID | None:
    return connection.execute(
        sa.text("SELECT configuration_manager_account_id FROM spaces WHERE id = :space_id"),
        {"space_id": space_id},
    ).scalar_one()


@pytest.mark.integration
@requires_database
def test_0061_to_0063_upgrade_preserves_safe_authority_and_backfills_configuration(
    engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    test_db_url = os.environ.get("EIMIR_TEST_DATABASE_URL")
    if test_db_url:
        monkeypatch.setenv("EIMIR_DATABASE_URL", test_db_url)
    config = alembic.config.Config("alembic.ini")

    single_active_account = uuid4()
    pair_first_account = uuid4()
    pair_second_account = uuid4()
    single_ended_account = uuid4()
    retained_former_account = uuid4()
    retained_active_account = uuid4()

    single_active_space = uuid4()
    two_active_space = uuid4()
    single_ended_space = uuid4()
    retained_history_space = uuid4()

    account_ids = (
        single_active_account,
        pair_first_account,
        pair_second_account,
        single_ended_account,
        retained_former_account,
        retained_active_account,
    )
    space_ids = (
        single_active_space,
        two_active_space,
        single_ended_space,
        retained_history_space,
    )

    joined_first = datetime(2025, 1, 1, tzinfo=UTC)
    joined_second = joined_first + timedelta(days=30)

    # Exercise the real installed-schema path rather than create_all metadata.
    # This remains valid when later migrations exist: return to 0061, prove the
    # real 0062 authority transition followed by 0063 configuration backfill,
    # then restore the repository's current head in finally.
    alembic.command.upgrade(config, "head")
    alembic.command.downgrade(config, "0061")

    try:
        with engine.begin() as connection:
            assert _current_revision(connection) == "0061"

            connection.execute(
                sa.text(
                    """
                    INSERT INTO accounts (
                        id, display_name, locale, timezone, version, created_at, updated_at
                    )
                    VALUES (
                        :id, :display_name, 'de-DE', 'Europe/Berlin', 1, now(), now()
                    )
                    """
                ),
                [
                    {"id": account_id, "display_name": f"Migration {index}"}
                    for index, account_id in enumerate(account_ids, start=1)
                ],
            )
            connection.execute(
                sa.text(
                    """
                    INSERT INTO spaces (id, created_at, updated_at)
                    VALUES (:id, now(), now())
                    """
                ),
                [{"id": space_id} for space_id in space_ids],
            )
            connection.execute(
                sa.text(
                    """
                    INSERT INTO memberships (
                        id, space_id, account_id, status, role,
                        joined_at, ended_at, created_at, updated_at
                    )
                    VALUES (
                        :id, :space_id, :account_id, :status, 'PARTNER',
                        :joined_at, :ended_at, now(), now()
                    )
                    """
                ),
                [
                    {
                        "id": uuid4(),
                        "space_id": single_active_space,
                        "account_id": single_active_account,
                        "status": "ACTIVE",
                        "joined_at": joined_first,
                        "ended_at": None,
                    },
                    {
                        "id": uuid4(),
                        "space_id": two_active_space,
                        "account_id": pair_first_account,
                        "status": "ACTIVE",
                        "joined_at": joined_first,
                        "ended_at": None,
                    },
                    {
                        "id": uuid4(),
                        "space_id": two_active_space,
                        "account_id": pair_second_account,
                        "status": "ACTIVE",
                        "joined_at": joined_second,
                        "ended_at": None,
                    },
                    {
                        "id": uuid4(),
                        "space_id": single_ended_space,
                        "account_id": single_ended_account,
                        "status": "LEFT",
                        "joined_at": joined_first,
                        "ended_at": joined_second,
                    },
                    {
                        "id": uuid4(),
                        "space_id": retained_history_space,
                        "account_id": retained_former_account,
                        "status": "LEFT",
                        "joined_at": joined_first,
                        "ended_at": joined_second,
                    },
                    {
                        "id": uuid4(),
                        "space_id": retained_history_space,
                        "account_id": retained_active_account,
                        "status": "ACTIVE",
                        "joined_at": joined_second,
                        "ended_at": None,
                    },
                ],
            )

        alembic.command.upgrade(config, "0062")

        with engine.connect() as connection:
            assert _current_revision(connection) == "0062"
            assert _configuration_manager(connection, single_active_space) == single_active_account
            assert _configuration_manager(connection, two_active_space) is None
            assert _configuration_manager(connection, single_ended_space) == single_ended_account
            assert _configuration_manager(connection, retained_history_space) is None

            retained_statuses = set(
                connection.execute(
                    sa.text("SELECT status FROM memberships WHERE space_id = :space_id"),
                    {"space_id": retained_history_space},
                ).scalars()
            )
            assert retained_statuses == {"ACTIVE", "LEFT"}

        # Exercise the actual chained upgrade rather than testing 0063 on an
        # already-modern schema. Authority assigned (or deliberately left NULL)
        # by 0062 must survive while 0063 creates exactly one deterministic V1
        # configuration for every existing Space.
        alembic.command.upgrade(config, "0063")

        with engine.connect() as connection:
            assert _current_revision(connection) == "0063"
            assert _configuration_manager(connection, single_active_space) == single_active_account
            assert _configuration_manager(connection, two_active_space) is None
            assert _configuration_manager(connection, single_ended_space) == single_ended_account
            assert _configuration_manager(connection, retained_history_space) is None

            for space_id in space_ids:
                configuration = connection.execute(
                    sa.text(
                        """
                        SELECT
                            vibe_check_enabled,
                            energy_check_in_enabled,
                            love_notes_enabled,
                            support_gestures_enabled,
                            shared_achievements_enabled,
                            daily_questions_enabled,
                            daily_context_timezone,
                            vibe_visibility_mode,
                            energy_visibility_mode,
                            version
                        FROM space_configurations
                        WHERE space_id = :space_id
                        """
                    ),
                    {"space_id": space_id},
                ).mappings().one()

                assert configuration["vibe_check_enabled"] is False
                assert configuration["energy_check_in_enabled"] is False
                assert configuration["love_notes_enabled"] is False
                assert configuration["support_gestures_enabled"] is True
                assert configuration["shared_achievements_enabled"] is False
                assert configuration["daily_questions_enabled"] is False
                assert configuration["daily_context_timezone"] is None
                assert configuration["vibe_visibility_mode"] == "IMMEDIATE"
                assert configuration["energy_visibility_mode"] == "IMMEDIATE"
                assert configuration["version"] == 1

        # The database contract must never block Account lifecycle cleanup or
        # transfer authority implicitly. Hard deletion is not the application
        # lifecycle today; this direct delete deliberately exercises only the
        # migration's ON DELETE SET NULL foreign-key behavior.
        with engine.begin() as connection:
            connection.execute(
                sa.text("DELETE FROM accounts WHERE id = :id"), {"id": single_ended_account}
            )
            assert _configuration_manager(connection, single_ended_space) is None

    finally:
        with engine.begin() as connection:
            for space_id in space_ids:
                connection.execute(sa.text("DELETE FROM spaces WHERE id = :id"), {"id": space_id})
            for account_id in account_ids:
                connection.execute(
                    sa.text("DELETE FROM accounts WHERE id = :id"), {"id": account_id}
                )
        alembic.command.upgrade(config, "head")
