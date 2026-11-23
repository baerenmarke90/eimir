"""Migration 0166 creates the skipped-video table; its downgrade removes it again (#2141)."""

from __future__ import annotations

from uuid import uuid4

import pytest
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from eimir.db.base import Base
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]

_MEMORY = text(
    "INSERT INTO memories (id, space_id, owner_id, privacy_class, payload, version, "
    "crypto_version) VALUES (:id, :space, :owner, 'SPACE_SHARED', CAST('{}' AS jsonb), 1, 0)"
)
_ROW = text(
    "INSERT INTO transfer_skipped_videos (id, space_id, memory_id, heart_moment_id, owner_id, "
    "source_attachment_id, checksum, size, mime_type, position) VALUES (:id, :space, :memory, "
    "NULL, :owner, :source, :checksum, :size, 'video/mp4', 0)"
)


def test_the_table_is_created_by_upgrade_removed_by_downgrade_and_follows_its_memory(session):  # type: ignore[no-untyped-def]
    account = make_account(session, "Migration author")
    space = make_space(session, account)
    session.flush()
    migration = ScriptDirectory.from_config(Config("alembic.ini")).get_revision("0166").module
    context = MigrationContext.configure(
        session.connection(), opts={"target_metadata": Base.metadata}
    )
    with Operations.context(context):
        migration.downgrade()
        assert not inspect(session.connection()).has_table("transfer_skipped_videos")

        migration.upgrade()
        assert inspect(session.connection()).has_table("transfer_skipped_videos")

        memory_id, source = uuid4(), uuid4()
        session.execute(_MEMORY, {"id": memory_id, "space": space.id, "owner": account.id})
        values = {
            "space": space.id,
            "memory": memory_id,
            "owner": account.id,
            "source": source,
            "checksum": "a" * 64,
            "size": 10,
        }
        session.execute(_ROW, {"id": uuid4(), **values})
        # The same video is remembered once per gallery, with a real checksum and size.
        for broken in ({}, {"checksum": "short"}, {"size": 0}):
            with pytest.raises(IntegrityError), session.begin_nested():
                session.execute(_ROW, {"id": uuid4(), **values, "source": source, **broken})
        # It disappears with its Memory.
        session.execute(text("DELETE FROM memories WHERE id = :id"), {"id": memory_id})
        assert session.execute(text("SELECT count(*) FROM transfer_skipped_videos")).scalar() == 0

        migration.downgrade()
        assert not inspect(session.connection()).has_table("transfer_skipped_videos")
        migration.upgrade()
