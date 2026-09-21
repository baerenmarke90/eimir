"""ProtectedPayload encryption at rest against a real PostgreSQL (issue #797)."""

from __future__ import annotations

import json
from datetime import date
from uuid import UUID

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from eimir.authorization import PrivacyClass
from eimir.domain.payload import CRYPTO_VERSION_PLAINTEXT, CRYPTO_VERSION_SERVER_AEAD
from eimir.memories.models import Memory, MemoryPayload
from eimir.security import lifecycle
from eimir.security.errors import DecryptionError, PlaintextRejectedError
from eimir.security.runtime import get_key_ring
from eimir.wishes.models import Wish, WishPayload
from tests.conftest import make_account, make_space, requires_database
from tests.support.encryption import encoded_key

pytestmark = [pytest.mark.integration, requires_database]

TITLE = "Baltic sailing trip"
BODY = "We danced in the rain and nobody saw it."


@pytest.fixture
def space(session: Session):  # type: ignore[no-untyped-def]
    account = make_account(session, "Enc Anna")
    return make_space(session, account), account


def _memory(session: Session, space, title: str = TITLE) -> Memory:  # type: ignore[no-untyped-def]
    space_row, account = space
    memory = Memory(
        space_id=space_row.id,
        owner_id=account.id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        happened_on=date(2026, 5, 1),
        payload=MemoryPayload(title=title, body=BODY),
    )
    session.add(memory)
    session.flush()
    return memory


def _raw(session: Session, memory_id: UUID) -> tuple[str, int]:
    row = session.execute(
        text("SELECT payload::text, crypto_version FROM memories WHERE id = :id"),
        {"id": memory_id},
    ).one()
    return row[0], row[1]


def _reload(session: Session, memory: Memory) -> MemoryPayload:
    session.expire(memory)
    return memory.payload


def _memory_status(session: Session):  # type: ignore[no-untyped-def]
    return next(r for r in lifecycle.payload_status(session) if r.table == "memories")


def test_raw_row_is_ciphertext_and_reads_return_plaintext(
    session: Session, space, encryption
) -> None:  # type: ignore[no-untyped-def]
    encryption.apply("required")
    memory = _memory(session, space)

    raw, version = _raw(session, memory.id)
    assert "Baltic" not in raw
    assert "rain" not in raw
    assert json.loads(raw)["_enc"] == CRYPTO_VERSION_SERVER_AEAD
    assert version == CRYPTO_VERSION_SERVER_AEAD

    assert _reload(session, memory) == MemoryPayload(title=TITLE, body=BODY)


def test_update_rewrites_the_envelope_with_a_fresh_key(session: Session, space, encryption) -> None:  # type: ignore[no-untyped-def]
    encryption.apply("required")
    memory = _memory(session, space)
    before = json.loads(_raw(session, memory.id)[0])

    memory.payload = MemoryPayload(title="Renamed", body=BODY)
    session.flush()

    after = json.loads(_raw(session, memory.id)[0])
    assert after["wk"] != before["wk"]
    assert after["ct"] != before["ct"]
    assert _reload(session, memory).title == "Renamed"


def test_disabled_mode_keeps_plaintext_and_refuses_ciphertext(
    session: Session, space, encryption
) -> None:  # type: ignore[no-untyped-def]
    encryption.apply("disabled")
    plain = _memory(session, space)
    raw, version = _raw(session, plain.id)
    assert "Baltic" in raw
    assert version == CRYPTO_VERSION_PLAINTEXT

    encryption.apply("required")
    sealed = _memory(session, space, title="Encrypted memory")
    encryption.apply("disabled")
    session.expire(sealed)
    with pytest.raises(DecryptionError):
        _ = sealed.payload


def test_wrong_and_missing_keys_fail_closed_on_read(session: Session, space, encryption) -> None:  # type: ignore[no-untyped-def]
    encryption.apply("required", keys={"k1": encoded_key()})
    memory = _memory(session, space)

    encryption.apply("required", keys={"k1": encoded_key()})  # same id, other key
    session.expire(memory)
    with pytest.raises(DecryptionError):
        _ = memory.payload

    encryption.apply("required", keys={"unrelated": encoded_key()})
    session.expire(memory)
    with pytest.raises(DecryptionError, match="not configured"):
        _ = memory.payload


def test_tampered_ciphertext_fails_authentication(session: Session, space, encryption) -> None:  # type: ignore[no-untyped-def]
    encryption.apply("required")
    memory = _memory(session, space)
    envelope = json.loads(_raw(session, memory.id)[0])
    envelope["ct"] = ("A" if envelope["ct"][0] != "A" else "B") + envelope["ct"][1:]
    session.execute(
        text("UPDATE memories SET payload = CAST(:p AS jsonb) WHERE id = :id"),
        {"p": json.dumps(envelope), "id": memory.id},
    )
    with pytest.raises(DecryptionError):
        _reload(session, memory)


def test_a_ciphertext_moved_to_another_payload_type_is_rejected(
    session: Session, space, encryption
) -> None:  # type: ignore[no-untyped-def]
    encryption.apply("required")
    memory = _memory(session, space)
    _, account = space
    space_row = space[0]
    wish = Wish(
        space_id=space_row.id,
        owner_id=account.id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        payload=WishPayload(title="Wish"),
    )
    session.add(wish)
    session.flush()
    session.execute(
        text(
            "UPDATE wishes SET payload = (SELECT payload FROM memories WHERE id = :m) WHERE id = :w"
        ),
        {"m": memory.id, "w": wish.id},
    )
    session.expire(wish)
    with pytest.raises(DecryptionError):
        _ = wish.payload


class TestLegacyMigration:
    def _legacy_rows(self, session: Session, space, encryption, count: int) -> list[Memory]:  # type: ignore[no-untyped-def]
        encryption.apply("disabled")
        rows = [_memory(session, space, title=f"Legacy {index} seahorse") for index in range(count)]
        encryption.apply("migrating")
        return rows

    def test_required_mode_rejects_legacy_plaintext_but_migrating_reads_it(
        self, session: Session, space, encryption
    ) -> None:  # type: ignore[no-untyped-def]
        (row,) = self._legacy_rows(session, space, encryption, 1)
        session.expire(row)
        assert row.payload.title.startswith("Legacy 0")

        encryption.apply("required", keys=dict(_current_keys(encryption)))
        session.expire(row)
        with pytest.raises(PlaintextRejectedError):
            _ = row.payload

    def test_migration_encrypts_every_row_and_is_idempotent(
        self, session: Session, space, encryption
    ) -> None:  # type: ignore[no-untyped-def]
        rows = self._legacy_rows(session, space, encryption, 5)
        assert _memory_status(session).plaintext == 5

        ring = get_key_ring()
        result = lifecycle.migrate_payloads(session, ring, batch_size=2)
        assert result["memories"].converted == 5

        status = _memory_status(session)
        assert status.plaintext == 0
        assert status.by_crypto_version[CRYPTO_VERSION_SERVER_AEAD] == 5
        assert status.inconsistent == 0
        for row in rows:
            raw, version = _raw(session, row.id)
            assert "seahorse" not in raw
            assert version == CRYPTO_VERSION_SERVER_AEAD
            assert _reload(session, row).title.endswith("seahorse")

        again = lifecycle.migrate_payloads(session, ring, batch_size=2)
        assert again["memories"].converted == 0

    def test_interrupted_migration_leaves_readable_mixed_state_and_resumes(
        self, session: Session, space, encryption, monkeypatch: pytest.MonkeyPatch
    ) -> None:  # type: ignore[no-untyped-def]
        rows = self._legacy_rows(session, space, encryption, 6)
        ring = get_key_ring()

        from eimir.security.payload_envelope import PayloadProtector

        original = PayloadProtector.protect
        calls = {"count": 0}

        def crash_on_fourth(self, plain, *, context):  # type: ignore[no-untyped-def]
            calls["count"] += 1
            if calls["count"] == 4:
                raise RuntimeError("simulated crash")
            return original(self, plain, context=context)

        monkeypatch.setattr(PayloadProtector, "protect", crash_on_fourth)
        with pytest.raises(RuntimeError):
            lifecycle.migrate_payloads(session, ring, batch_size=2)
        monkeypatch.setattr(PayloadProtector, "protect", original)

        # Some rows converted, the rest still whole plaintext, every row readable.
        status = _memory_status(session)
        assert 0 < status.by_crypto_version[CRYPTO_VERSION_SERVER_AEAD] < 6
        assert status.inconsistent == 0
        for row in rows:
            assert _reload(session, row).title.startswith("Legacy")

        lifecycle.migrate_payloads(session, ring, batch_size=2)
        assert _memory_status(session).plaintext == 0

    def test_concurrent_application_write_wins_over_the_migration(
        self, session: Session, space, encryption, monkeypatch: pytest.MonkeyPatch
    ) -> None:  # type: ignore[no-untyped-def]
        (row,) = self._legacy_rows(session, space, encryption, 1)
        ring = get_key_ring()

        from eimir.security.payload_envelope import PayloadProtector

        original = PayloadProtector.protect

        def write_in_between(self, plain, *, context):  # type: ignore[no-untyped-def]
            session.execute(
                text("UPDATE memories SET payload = CAST(:p AS jsonb) WHERE id = :id"),
                {"p": json.dumps({"title": "Edited meanwhile", "body": "x"}), "id": row.id},
            )
            return original(self, plain, context=context)

        monkeypatch.setattr(PayloadProtector, "protect", write_in_between)
        result = lifecycle.migrate_payloads(session, ring)
        monkeypatch.setattr(PayloadProtector, "protect", original)

        assert result["memories"].skipped_concurrent == 1
        assert "Edited meanwhile" in _raw(session, row.id)[0]

    def test_status_detects_inconsistent_rows_and_verify_fails(
        self, session: Session, space, encryption
    ) -> None:  # type: ignore[no-untyped-def]
        encryption.apply("required")
        memory = _memory(session, space)
        session.execute(
            text("UPDATE memories SET crypto_version = 0 WHERE id = :id"), {"id": memory.id}
        )
        assert _memory_status(session).inconsistent == 1
        assert not lifecycle.verify_payloads(session, get_key_ring()).ok


class TestRotation:
    def test_rotation_preserves_authorized_reads_and_allows_revoking_the_old_key(
        self, session: Session, space, encryption
    ) -> None:  # type: ignore[no-untyped-def]
        old, new = encoded_key(), encoded_key()
        encryption.apply("required", keys={"2026-01": old})
        memory = _memory(session, space)
        assert json.loads(_raw(session, memory.id)[0])["kid"] == "2026-01"

        # Rotate: new active key, old key still configured for reading.
        encryption.apply("required", keys={"2026-01": old, "2026-02": new})
        assert _reload(session, memory).title == TITLE
        assert _memory_status(session).by_key_id == {"2026-01": 1}

        result = lifecycle.rewrap_payloads(session, get_key_ring())
        assert result["memories"].converted == 1
        assert _memory_status(session).by_key_id == {"2026-02": 1}
        assert lifecycle.rewrap_payloads(session, get_key_ring())["memories"].converted == 0

        # Revoke the old key: everything is still readable.
        encryption.apply("required", keys={"2026-02": new})
        assert _reload(session, memory).title == TITLE
        assert lifecycle.verify_payloads(session, get_key_ring()).ok


def test_verify_reports_counts_without_content(session: Session, space, encryption) -> None:  # type: ignore[no-untyped-def]
    encryption.apply("required")
    _memory(session, space)
    report = lifecycle.verify_payloads(session, get_key_ring())
    assert report.ok
    assert report.checked["memories"] == 1
    assert "Baltic" not in repr(report)


def _current_keys(encryption):  # type: ignore[no-untyped-def]
    import os

    return json.loads(os.environ["EIMIR_ENCRYPTION_KEYS"])
