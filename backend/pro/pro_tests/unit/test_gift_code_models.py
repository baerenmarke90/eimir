"""The gift code tables of the Pro plugin (ServerAdmin part 5, design section 5.3).

The metadata tests need no database: table names, the encrypted code, the unique
lookup hash, the foreign keys and both check constraints by name.
"""

from __future__ import annotations

from typing import cast

from eimir_pro.gift_codes.models import GiftCode, GiftCodeBatch, GiftCodePayload
from sqlalchemy import CheckConstraint, ForeignKeyConstraint, String, Table, UniqueConstraint
from sqlalchemy.schema import ColumnDefault

from eimir.db.protected_payload import ProtectedPayloadJSON
from eimir.plugins.manifest import PLUGIN_TABLES

BATCHES = cast(Table, GiftCodeBatch.__table__)
CODES = cast(Table, GiftCode.__table__)


def _checks(table: Table) -> dict[str, str]:
    return {
        str(c.name): str(c.sqltext) for c in table.constraints if isinstance(c, CheckConstraint)
    }


def _foreign_keys(table: Table) -> dict[str, tuple[str, str | None]]:
    return {
        key.elements[0].parent.name: (key.elements[0].target_fullname, key.ondelete)
        for key in table.constraints
        if isinstance(key, ForeignKeyConstraint)
    }


def test_the_table_names() -> None:
    assert BATCHES.name == "gift_code_batches"
    assert CODES.name == "gift_codes"


def test_the_batch_columns_and_references() -> None:
    assert set(BATCHES.columns.keys()) == {
        "id",
        "note",
        "duration_months",
        "redeemable_until",
        "created_by",
        "created_at",
        "revoked_at",
        "revoked_by",
    }
    assert cast(String, BATCHES.columns["note"].type).length == 120
    assert {column.name for column in BATCHES.columns if column.nullable} == {
        "note",
        "created_by",
        "revoked_at",
        "revoked_by",
    }
    assert BATCHES.columns["created_at"].server_default is not None
    assert _foreign_keys(BATCHES) == {
        "created_by": ("accounts.id", "SET NULL"),
        "revoked_by": ("accounts.id", "SET NULL"),
    }


def test_the_batch_duration_is_checked_in_the_database() -> None:
    assert _checks(BATCHES) == {
        "ck_gift_code_batches_duration_months_allowed": "duration_months IN (1, 3, 6, 12)"
    }


def test_the_code_columns_and_references() -> None:
    assert set(CODES.columns.keys()) == {
        "id",
        "batch_id",
        "payload",
        "crypto_version",
        "lookup_hash",
        "handed_out_at",
        "redeemed_at",
        "revoked_at",
        "revoked_by",
        "redeemed_space_id",
        "redeemed_grant_id",
    }
    assert {column.name for column in CODES.columns if column.nullable} == {
        "handed_out_at",
        "redeemed_at",
        "revoked_at",
        "revoked_by",
        "redeemed_space_id",
        "redeemed_grant_id",
    }
    assert _foreign_keys(CODES) == {
        "batch_id": ("gift_code_batches.id", "CASCADE"),
        "revoked_by": ("accounts.id", "SET NULL"),
        "redeemed_space_id": ("spaces.id", "SET NULL"),
        "redeemed_grant_id": ("entitlement_grants.id", "SET NULL"),
    }
    assert CODES.columns["batch_id"].index is True
    assert CODES.columns["redeemed_space_id"].index is True


def test_the_code_itself_is_encrypted_and_only_its_hash_is_unique() -> None:
    column = CODES.columns["payload"]
    assert isinstance(column.type, ProtectedPayloadJSON)
    assert column.type.payload_type is GiftCodePayload
    assert set(GiftCodePayload.model_fields) == {"code"}
    default = CODES.columns["crypto_version"].default
    assert isinstance(default, ColumnDefault)
    assert default.arg == 0
    assert cast(String, CODES.columns["lookup_hash"].type).length == 64
    uniques = [c for c in CODES.constraints if isinstance(c, UniqueConstraint)]
    assert [[column.name for column in unique.columns] for unique in uniques] == [["lookup_hash"]]


def test_a_code_is_never_both_redeemed_and_revoked() -> None:
    assert _checks(CODES) == {
        "ck_gift_codes_not_redeemed_and_revoked": (
            "NOT (redeemed_at IS NOT NULL AND revoked_at IS NOT NULL)"
        )
    }


def test_the_manifest_knows_both_tables_as_operator_data() -> None:
    rows = {row.table: row for row in PLUGIN_TABLES}

    for name in ("gift_code_batches", "gift_codes"):
        row = rows[name]
        assert row.capability.value == "gift_codes.operator"
        assert row.space_column is None
        assert row.purge_on == ()
    assert rows["gift_codes"].protected_payload_context == "GiftCodePayload"
    assert rows["gift_code_batches"].account_columns == ("created_by", "revoked_by")
    assert rows["gift_codes"].account_columns == ("revoked_by",)
    assert rows["gift_code_batches"].protected_payload_context is None
