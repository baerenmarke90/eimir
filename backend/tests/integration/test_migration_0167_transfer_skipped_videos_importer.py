"""Migration 0167 remembers who imported a skipped video; downgrade removes it (#2141)."""

from __future__ import annotations

from datetime import timedelta
from uuid import uuid4

import pytest
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from eimir.core.clock import now
from eimir.db.base import Base
from eimir.relationship import service as relationship_service
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]

_MEMORY = text(
    "INSERT INTO memories (id, space_id, owner_id, privacy_class, payload, version, "
    "crypto_version) VALUES (:id, :space, :owner, 'SPACE_SHARED', CAST('{}' AS jsonb), 1, 0)"
)
_IMPORT = text(
    "INSERT INTO transfer_imports (id, space_id, created_by, status, artifact_size, expires_at, "
    "created_at, updated_at) VALUES (:id, :space, :creator, 'COMPLETED', 1, :expires, now(), "
    "now())"
)
_ROW = text(
    "INSERT INTO transfer_skipped_videos (id, space_id, memory_id, owner_id, import_id, "
    "source_attachment_id, checksum, size, mime_type, position) VALUES (:id, :space, :memory, "
    ":owner, :import_id, :source, :checksum, 10, 'video/mp4', 0)"
)


def _columns(session) -> set[str]:  # type: ignore[no-untyped-def]
    return {
        column["name"]
        for column in inspect(session.connection()).get_columns("transfer_skipped_videos")
    }


def test_existing_rows_take_their_importer_and_the_column_follows_the_account(session):  # type: ignore[no-untyped-def]
    anna, ben = make_account(session, "Anna"), make_account(session, "Ben")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    session.flush()
    migration = ScriptDirectory.from_config(Config("alembic.ini")).get_revision("0167").module
    context = MigrationContext.configure(
        session.connection(), opts={"target_metadata": Base.metadata}
    )
    with Operations.context(context):
        migration.downgrade()
        assert "imported_by" not in _columns(session)

        memory = uuid4()
        session.execute(_MEMORY, {"id": memory, "space": space.id, "owner": anna.id})
        anna_import = uuid4()
        session.execute(
            _IMPORT,
            {
                "id": anna_import,
                "space": space.id,
                "creator": anna.id,
                "expires": now() + timedelta(days=1),
            },
        )
        # Ben owns the first video, but Anna imported it.
        with_import, without_import = uuid4(), uuid4()
        common = {"space": space.id, "memory": memory, "checksum": "a" * 64}
        session.execute(
            _ROW,
            {
                **common,
                "id": with_import,
                "owner": ben.id,
                "import_id": anna_import,
                "source": uuid4(),
            },
        )
        # The import of the second one has expired: its owner is the best guess.
        session.execute(
            _ROW,
            {**common, "id": without_import, "owner": ben.id, "import_id": None, "source": uuid4()},
        )

        migration.upgrade()

        importers = dict(
            session.execute(text("SELECT id, imported_by FROM transfer_skipped_videos")).all()
        )
        assert importers == {with_import: anna.id, without_import: ben.id}
        with pytest.raises(IntegrityError), session.begin_nested():
            session.execute(
                text("UPDATE transfer_skipped_videos SET imported_by = NULL WHERE id = :id"),
                {"id": with_import},
            )

        migration.downgrade()
        assert "imported_by" not in _columns(session)
        migration.upgrade()
        assert "imported_by" in _columns(session)
