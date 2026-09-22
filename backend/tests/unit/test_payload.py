"""The boundary between metadata and protected content.

These tests verify the metadata/payload separation and the plaintext
(``disabled``) behavior of the persistence boundary. Encrypted behavior is
covered by ``test_payload_encryption.py``.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from eimir.db.protected_payload import ProtectedPayloadJSON
from eimir.domain.payload import (
    CRYPTO_VERSION_CLIENT_SEALED,
    CRYPTO_VERSION_PLAINTEXT,
    ProtectedPayload,
    is_readable_by_server,
)


class MemoryPayload(ProtectedPayload):
    title: str = ""
    body: str = ""


class OtherPayload(ProtectedPayload):
    secret: str


class TestSealUnseal:
    def test_is_lossless(self) -> None:
        original = MemoryPayload(title="Nordsee", body="Es war windig.")
        assert MemoryPayload.unseal(original.seal()) == original

    def test_produces_json_compatible_values(self) -> None:
        sealed = MemoryPayload(title="Nordsee", body="x").seal()
        assert sealed == {"title": "Nordsee", "body": "x"}

    def test_missing_payload_does_not_raise(self) -> None:
        """After migration there will be rows the server cannot read.

        They must not break a list operation.
        """
        assert MemoryPayload.unseal(None) == MemoryPayload()
        assert MemoryPayload.unseal({}) == MemoryPayload()

    def test_unknown_field_is_rejected(self) -> None:
        """Silently discarding a field would lose data."""
        with pytest.raises(ValidationError):
            MemoryPayload.unseal({"title": "x", "gibt_es_nicht": 1})


class TestCryptoVersion:
    def test_version_1_is_plaintext(self) -> None:
        assert MemoryPayload.crypto_version == CRYPTO_VERSION_PLAINTEXT

    def test_server_can_read_plaintext(self) -> None:
        assert is_readable_by_server(CRYPTO_VERSION_PLAINTEXT)

    def test_server_cannot_read_sealed_payload(self) -> None:
        """Derived functions should be able to skip the row instead of guessing."""
        assert not is_readable_by_server(CRYPTO_VERSION_CLIENT_SEALED)


@pytest.fixture(autouse=True)
def _plaintext_mode(encryption) -> None:  # type: ignore[no-untyped-def]
    encryption.apply("disabled")


class TestPersistenceBoundary:
    def test_writes_only_concrete_payload_class(self) -> None:
        storage = ProtectedPayloadJSON(MemoryPayload)
        payload = MemoryPayload(title="Nordsee", body="Es war windig.")
        assert storage.process_bind_param(payload, postgresql.dialect()) == payload.seal()

    def test_raw_dictionary_is_rejected_before_database(self) -> None:
        storage = ProtectedPayloadJSON(MemoryPayload)
        with pytest.raises(TypeError, match="MemoryPayload required"):
            storage.process_bind_param(  # type: ignore[arg-type]
                {"title": "Nordsee", "body": "Klartext"}, postgresql.dialect()
            )

    def test_reads_typed_payload_back(self) -> None:
        storage = ProtectedPayloadJSON(MemoryPayload)
        loaded = storage.process_result_value(
            {"title": "Nordsee", "body": "Es war windig."}, postgresql.dialect()
        )
        assert loaded == MemoryPayload(title="Nordsee", body="Es war windig.")

    def test_foreign_payload_class_is_rejected(self) -> None:
        storage = ProtectedPayloadJSON(MemoryPayload)
        with pytest.raises(TypeError, match="MemoryPayload required"):
            storage.process_bind_param(  # type: ignore[arg-type]
                OtherPayload(secret="falsch"), postgresql.dialect()
            )
