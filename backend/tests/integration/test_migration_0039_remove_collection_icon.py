"""Real Alembic migration lifecycle test for revision 0039 (removing collection icon)."""

from __future__ import annotations

import json
import os
from uuid import uuid4

import alembic.command
import alembic.config
import pytest
import sqlalchemy as sa
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from eimir.collections.models import Collection
from eimir.private_collections.models import PrivateCollection
from tests.conftest import requires_database


@pytest.mark.integration
@requires_database
def test_real_alembic_migration_0039_lifecycle(
    engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    test_db_url = os.environ.get("EIMIR_TEST_DATABASE_URL")
    if test_db_url:
        monkeypatch.setenv("EIMIR_DATABASE_URL", test_db_url)
    config = alembic.config.Config("alembic.ini")

    account_id = uuid4()
    space_id = uuid4()
    col_shared_id = uuid4()
    item_shared_1 = uuid4()
    item_shared_2 = uuid4()
    pcol_id = uuid4()
    pitem_id = uuid4()
    col_crypto1_id = uuid4()

    # 1. Downgrade to 0038
    alembic.command.downgrade(config, "0038")

    try:
        # 2. Insert test data before migration 0039
        with engine.begin() as conn:
            conn.execute(
                sa.text(
                    """
                    INSERT INTO accounts (
                        id, display_name, locale, timezone, version, created_at, updated_at
                    )
                    VALUES (:id, 'Migr User', 'de-DE', 'Europe/Berlin', 1, now(), now())
                    """
                ),
                {"id": account_id},
            )
            conn.execute(
                sa.text(
                    """
                    INSERT INTO spaces (id, created_at, updated_at)
                    VALUES (:id, now(), now())
                    """
                ),
                {"id": space_id},
            )
            conn.execute(
                sa.text(
                    """
                    INSERT INTO memberships (
                        id, space_id, account_id, status, role, created_at, updated_at
                    )
                    VALUES (:id, :space_id, :account_id, 'ACTIVE', 'PARTNER', now(), now())
                    """
                ),
                {"id": uuid4(), "space_id": space_id, "account_id": account_id},
            )

            # Collection with items, completed state, position, and legacy icon (crypto_version=0)
            conn.execute(
                sa.text(
                    """
                    INSERT INTO collections (
                        id, space_id, owner_id, privacy_class, crypto_version,
                        payload, version, created_at, updated_at
                    )
                    VALUES (
                        :id, :space_id, :owner_id, 'SPACE_SHARED', 0,
                        CAST(:payload AS jsonb), 1, now(), now()
                    )
                    """
                ),
                {
                    "id": col_shared_id,
                    "space_id": space_id,
                    "owner_id": account_id,
                    "payload": json.dumps({"title": "Packing List", "icon": "suitcase"}),
                },
            )
            conn.execute(
                sa.text(
                    """
                    INSERT INTO collection_items (
                        id, collection_id, created_by, position, completed,
                        crypto_version, payload, version, created_at, updated_at
                    )
                    VALUES
                    (:id1, :col_id, :account_id, 0, false, 0,
                     '{"title": "Passport"}'::jsonb, 1, now(), now()),
                    (:id2, :col_id, :account_id, 1, true, 0,
                     '{"title": "Camera"}'::jsonb, 1, now(), now())
                    """
                ),
                {
                    "col_id": col_shared_id,
                    "account_id": account_id,
                    "id1": item_shared_1,
                    "id2": item_shared_2,
                },
            )

            # Private Collection with items and legacy icon (crypto_version=0)
            conn.execute(
                sa.text(
                    """
                    INSERT INTO private_collections (
                        id, space_id, owner_id, privacy_class, crypto_version,
                        payload, version, created_at, updated_at
                    )
                    VALUES (
                        :id, :space_id, :owner_id, 'OWNER_ONLY', 0,
                        CAST(:payload AS jsonb), 1, now(), now()
                    )
                    """
                ),
                {
                    "id": pcol_id,
                    "space_id": space_id,
                    "owner_id": account_id,
                    "payload": json.dumps({"title": "Gift Ideas", "icon": "gift"}),
                },
            )
            conn.execute(
                sa.text(
                    """
                    INSERT INTO private_collection_items (
                        id, collection_id, position, completed, crypto_version,
                        payload, version, created_at, updated_at
                    )
                    VALUES (:id, :col_id, 0, false, 0, '{"title": "Book"}'::jsonb, 1, now(), now())
                    """
                ),
                {"col_id": pcol_id, "id": pitem_id},
            )

            # Encrypted collection (crypto_version=1): must NOT be touched
            conn.execute(
                sa.text(
                    """
                    INSERT INTO collections (
                        id, space_id, owner_id, privacy_class, crypto_version,
                        payload, version, created_at, updated_at
                    )
                    VALUES (
                        :id, :space_id, :owner_id, 'SPACE_SHARED', 1,
                        CAST(:payload AS jsonb), 1, now(), now()
                    )
                    """
                ),
                {
                    "id": col_crypto1_id,
                    "space_id": space_id,
                    "owner_id": account_id,
                    "payload": json.dumps({"ciphertext": "xyz", "icon": "must_not_touch"}),
                },
            )

        # 3. Execute real Alembic migration 0039
        alembic.command.upgrade(config, "0039")

        # 4. Verify post-upgrade state
        with engine.connect() as conn:
            payload_shared = conn.execute(
                sa.text("SELECT payload FROM collections WHERE id = :id"),
                {"id": col_shared_id},
            ).scalar_one()
            assert "icon" not in payload_shared
            assert payload_shared["title"] == "Packing List"

            payload_private = conn.execute(
                sa.text("SELECT payload FROM private_collections WHERE id = :id"),
                {"id": pcol_id},
            ).scalar_one()
            assert "icon" not in payload_private
            assert payload_private["title"] == "Gift Ideas"

            # Verify crypto_version=1 was not touched
            payload_crypto1 = conn.execute(
                sa.text("SELECT payload FROM collections WHERE id = :id"),
                {"id": col_crypto1_id},
            ).scalar_one()
            assert payload_crypto1.get("icon") == "must_not_touch"

            # Verify items, positions, and completed state are intact
            items = conn.execute(
                sa.text(
                    "SELECT position, completed, payload FROM collection_items "
                    "WHERE collection_id = :col_id ORDER BY position"
                ),
                {"col_id": col_shared_id},
            ).fetchall()
            assert len(items) == 2
            assert items[0][0] == 0 and items[0][1] is False and items[0][2]["title"] == "Passport"
            assert items[1][0] == 1 and items[1][1] is True and items[1][2]["title"] == "Camera"

        # Verify ORM compatibility with strict ProtectedPayload extra='forbid'
        with Session(engine) as s:
            orm_col = s.get(Collection, col_shared_id)
            assert orm_col is not None
            assert orm_col.payload.title == "Packing List"

            orm_pcol = s.get(PrivateCollection, pcol_id)
            assert orm_pcol is not None
            assert orm_pcol.payload.title == "Gift Ideas"

        # 5. Execute real Alembic downgrade to 0038
        alembic.command.downgrade(config, "0038")

        with engine.connect() as conn:
            down_payload_shared = conn.execute(
                sa.text("SELECT payload FROM collections WHERE id = :id"),
                {"id": col_shared_id},
            ).scalar_one()
            assert "icon" in down_payload_shared
            assert down_payload_shared["icon"] is None
            assert down_payload_shared["title"] == "Packing List"

            down_payload_private = conn.execute(
                sa.text("SELECT payload FROM private_collections WHERE id = :id"),
                {"id": pcol_id},
            ).scalar_one()
            assert "icon" in down_payload_private
            assert down_payload_private["icon"] is None
            assert down_payload_private["title"] == "Gift Ideas"

        # 6. Execute real Alembic re-upgrade to 0039
        alembic.command.upgrade(config, "0039")

        with engine.connect() as conn:
            reup_payload = conn.execute(
                sa.text("SELECT payload FROM collections WHERE id = :id"),
                {"id": col_shared_id},
            ).scalar_one()
            assert "icon" not in reup_payload
            assert reup_payload["title"] == "Packing List"

    finally:
        # Cleanup test data and ensure database is left at head revision
        try:
            with engine.begin() as conn:
                conn.execute(sa.text("DELETE FROM spaces WHERE id = :id"), {"id": space_id})
                conn.execute(sa.text("DELETE FROM accounts WHERE id = :id"), {"id": account_id})
        except Exception:
            pass
        alembic.command.upgrade(config, "head")
