"""A proof must not lose invitation intent during either migration direction."""

from __future__ import annotations

import runpy
from uuid import uuid4

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy.engine import Engine

from tests.conftest import requires_database


@pytest.mark.integration
@requires_database
def test_upgrade_preserves_old_proofs_and_downgrade_revokes_pending_bound_proofs(
    engine: Engine,
) -> None:
    migration = runpy.run_path("alembic/versions/0086_signup_invitation_binding.py")
    schema = f"signup_binding_{uuid4().hex}"
    with engine.begin() as connection:
        connection.execute(sa.text(f'CREATE SCHEMA "{schema}"'))
        connection.execute(sa.text(f'SET LOCAL search_path TO "{schema}"'))
        connection.execute(
            sa.text(
                "CREATE TABLE signup_proofs ("
                "id integer PRIMARY KEY, token_hash varchar(64), "
                "consumed_at timestamptz, revoked_at timestamptz)"
            )
        )
        connection.execute(sa.text("INSERT INTO signup_proofs (id, token_hash) VALUES (1, 'old')"))
        with Operations.context(MigrationContext.configure(connection)):
            migration["upgrade"]()
            old = connection.execute(sa.text("SELECT * FROM signup_proofs WHERE id = 1")).one()
            assert old._mapping["token_hash"] == "old"
            assert old._mapping["invitation_token_hash"] is None
            connection.execute(
                sa.text(
                    "INSERT INTO signup_proofs (id, invitation_token_hash, consumed_at) "
                    "VALUES (2, 'bound', NULL), (3, 'spent', now())"
                )
            )
            migration["downgrade"]()
        rows = connection.execute(
            sa.text("SELECT id, consumed_at, revoked_at FROM signup_proofs ORDER BY id")
        ).all()
        assert rows[0].revoked_at is None
        assert rows[1].revoked_at is not None
        assert rows[2].consumed_at is not None
        assert rows[2].revoked_at is None
        assert "invitation_token_hash" not in {
            column["name"] for column in sa.inspect(connection).get_columns("signup_proofs")
        }
        connection.execute(sa.text(f'DROP SCHEMA "{schema}" CASCADE'))
