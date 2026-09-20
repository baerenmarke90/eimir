"""Real Alembic upgrade coverage for revision 0062 Space configuration authority."""

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
        sa.text(
            "SELECT configuration_manager_account_id FROM spaces WHERE id = :space_id"
        ),
        {"space_id": space_id},
    ).scalar_one()


@pytest.mark.integration
@requires_database
def test_0062_upgrade_backfills_only_unambiguous_retained_membership_authority(
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
    # 0062 transition, and restore the repository's current head in finally.
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
            assert (
                _configuration_manager(connection, single_active_space)
                == single_active_account
            )
            assert _configuration_manager(connection, two_active_space) is None
            assert (
                _configuration_manager(connection, single_ended_space)
                == single_ended_account
            )
            assert _configuration_manager(connection, retained_history_space) is None

            retained_statuses = set(
                connection.execute(
                    sa.text(
                        "SELECT status FROM memberships WHERE space_id = :space_id"
                    ),
                    {"space_id": retained_history_space},
                ).scalars()
            )
            assert retained_statuses == {"ACTIVE", "LEFT"}
    finally:
        try:
            with engine.begin() as connection:
                for space_id in space_ids:
                    connection.execute(
                        sa.text("DELETE FROM spaces WHERE id = :id"), {"id": space_id}
                    )
                for account_id in account_ids:
                    connection.execute(
                        sa.text("DELETE FROM accounts WHERE id = :id"), {"id": account_id}
                    )
        except Exception:
            pass
        alembic.command.upgrade(config, "head")
