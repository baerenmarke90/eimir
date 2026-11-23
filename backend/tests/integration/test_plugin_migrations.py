"""A plugin chain runs after Core, with its own version table (Decision 0017, decision 6; #2182).

Not a Pro feature module: the Core-only CI job runs it with ``EIMIR_PLUGINS=""``.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy import Connection, Engine, inspect, text

from eimir.plugins.contract import MigrationSpec
from eimir.plugins.migrations import upgrade_chain
from tests.conftest import requires_database

pytestmark = [pytest.mark.integration, requires_database]

VERSION_TABLE = "alembic_version_probe"
TABLE = "plugin_migration_probe"

_CREATE = f'''
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "probe_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "{TABLE}",
        sa.Column("id", sa.Integer, primary_key=True),
        # A plugin table may reference Core tables.
        sa.Column(
            "account_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )


def downgrade():
    op.drop_table("{TABLE}")
'''

_FAIL = """
from alembic import op

revision = "probe_0002"
down_revision = "probe_0001"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("SELECT * FROM a_table_that_does_not_exist")


def downgrade():
    pass
"""


def _chain(tmp_path: Path, *revisions: str) -> MigrationSpec:
    location = tmp_path / "chain"
    (location / "versions").mkdir(parents=True)
    for number, source in enumerate(revisions, start=1):
        (location / "versions" / f"probe_{number:04d}.py").write_text(source, encoding="utf-8")
    return MigrationSpec(script_location=str(location), version_table=VERSION_TABLE)


def _drop(connection: Connection) -> None:
    with connection.begin():
        connection.execute(text(f"DROP TABLE IF EXISTS {TABLE}"))
        connection.execute(text(f"DROP TABLE IF EXISTS {VERSION_TABLE}"))


@pytest.fixture
def connection(engine: Engine) -> Iterator[Connection]:
    with engine.connect() as connection:
        _drop(connection)
        try:
            yield connection
        finally:
            if connection.in_transaction():
                connection.rollback()
            _drop(connection)


def _tables(connection: Connection) -> set[str]:
    return set(inspect(connection).get_table_names())


def _core_versions(connection: Connection) -> list[str] | None:
    if "alembic_version" not in _tables(connection):
        return None
    return sorted(connection.execute(text("SELECT version_num FROM alembic_version")).scalars())


def test_a_plugin_chain_has_its_own_version_table(connection: Connection, tmp_path: Path) -> None:
    core_before = _core_versions(connection)
    connection.rollback()
    spec = _chain(tmp_path, _CREATE)

    assert upgrade_chain(connection, "probe", spec) is True
    # Running it again is a no-op at the head.
    assert upgrade_chain(connection, "probe", spec) is True

    assert not connection.in_transaction()
    assert {TABLE, VERSION_TABLE} <= _tables(connection)
    versions = connection.execute(text(f"SELECT version_num FROM {VERSION_TABLE}")).scalars()
    assert list(versions) == ["probe_0001"]
    # The Core chain never sees the plugin revision.
    assert _core_versions(connection) == core_before
    connection.rollback()


def test_a_chain_without_revisions_creates_no_table(connection: Connection, tmp_path: Path) -> None:
    assert upgrade_chain(connection, "probe", _chain(tmp_path)) is False

    assert VERSION_TABLE not in _tables(connection)
    connection.rollback()


def test_a_failing_plugin_revision_fails_and_rolls_back(
    connection: Connection, tmp_path: Path
) -> None:
    spec = _chain(tmp_path, _CREATE, _FAIL)

    with pytest.raises(Exception, match="a_table_that_does_not_exist"):
        upgrade_chain(connection, "probe", spec)

    # The whole chain ran in one transaction: nothing of it stays.
    assert not connection.in_transaction()
    assert not {TABLE, VERSION_TABLE} & _tables(connection)
    connection.rollback()
