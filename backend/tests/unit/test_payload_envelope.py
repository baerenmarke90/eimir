"""ProtectedPayload envelope: confidentiality, integrity, modes, rotation."""

from __future__ import annotations

import json
from typing import Any

import pytest

from eimir.domain.payload import CRYPTO_VERSION_PLAINTEXT, CRYPTO_VERSION_SERVER_AEAD
from eimir.security.errors import (
    DecryptionError,
    EncryptionConfigurationError,
    PlaintextRejectedError,
)
from eimir.security.keyring import EncryptionMode, KeyRing
from eimir.security.payload_envelope import (
    PayloadProtector,
    is_encrypted,
    stored_crypto_version,
    stored_key_id,
)
from tests.support.encryption import key_ring, random_key

PLAIN = {"title": "Anniversary dinner", "body": "We said yes in the rain ❤"}
CTX = "MemoryPayload"


def _protector(mode: EncryptionMode = EncryptionMode.REQUIRED, ring: KeyRing | None = None):
    return PayloadProtector(mode, ring or key_ring("k1"))


def test_persisted_form_contains_no_plaintext() -> None:
    stored = _protector().protect(PLAIN, context=CTX)
    rendered = json.dumps(stored)
    assert "Anniversary" not in rendered
    assert "rain" not in rendered
    assert set(stored) == {"_enc", "kid", "wk", "n", "ct"}
    assert stored_crypto_version(stored) == CRYPTO_VERSION_SERVER_AEAD


def test_round_trip_including_unicode() -> None:
    protector = _protector()
    assert protector.reveal(protector.protect(PLAIN, context=CTX), context=CTX) == PLAIN


def test_every_write_is_distinct_even_for_identical_content() -> None:
    protector = _protector()
    first = protector.protect(PLAIN, context=CTX)
    second = protector.protect(PLAIN, context=CTX)
    assert first["ct"] != second["ct"]
    assert first["wk"] != second["wk"]
    assert first["n"] != second["n"]


def test_wrong_key_fails_closed() -> None:
    stored = _protector().protect(PLAIN, context=CTX)
    with pytest.raises(DecryptionError):
        _protector(ring=key_ring("k1")).reveal(stored, context=CTX)


def test_missing_key_id_fails_closed() -> None:
    stored = _protector().protect(PLAIN, context=CTX)
    with pytest.raises(DecryptionError, match="not configured"):
        _protector(ring=key_ring("unrelated")).reveal(stored, context=CTX)


@pytest.mark.parametrize("field", ["wk", "n", "ct"])
def test_tampering_with_any_field_fails_authentication(field: str) -> None:
    protector = _protector()
    stored = protector.protect(PLAIN, context=CTX)
    value = stored[field]
    stored[field] = ("A" if value[0] != "A" else "B") + value[1:]
    with pytest.raises(DecryptionError):
        protector.reveal(stored, context=CTX)


def test_a_ciphertext_cannot_be_replayed_into_another_payload_type() -> None:
    protector = _protector()
    stored = protector.protect(PLAIN, context="MemoryPayload")
    with pytest.raises(DecryptionError):
        protector.reveal(stored, context="PlanPayload")


def test_unsupported_or_malformed_envelopes_are_rejected() -> None:
    protector = _protector()
    good = protector.protect(PLAIN, context=CTX)
    for broken in (
        {**good, "_enc": 99},
        {**good, "extra": "x"},
        {k: v for k, v in good.items() if k != "kid"},
        {**good, "kid": 5},
        {**good, "ct": 5},
        {**good, "wk": "@@@"},
    ):
        with pytest.raises(DecryptionError):
            protector.reveal(broken, context=CTX)


def test_required_mode_rejects_plaintext() -> None:
    with pytest.raises(PlaintextRejectedError):
        _protector(EncryptionMode.REQUIRED).reveal(dict(PLAIN), context=CTX)
    with pytest.raises(PlaintextRejectedError):
        _protector(EncryptionMode.REQUIRED).reveal({}, context=CTX)


def test_migrating_mode_reads_legacy_plaintext_but_writes_ciphertext() -> None:
    protector = _protector(EncryptionMode.MIGRATING)
    assert protector.reveal(dict(PLAIN), context=CTX) == PLAIN
    assert is_encrypted(protector.protect(PLAIN, context=CTX))
    assert protector.write_crypto_version == CRYPTO_VERSION_SERVER_AEAD


def test_disabled_mode_is_plaintext_and_refuses_to_pass_ciphertext_through() -> None:
    disabled = PayloadProtector(EncryptionMode.DISABLED, None)
    assert disabled.protect(PLAIN, context=CTX) == PLAIN
    assert disabled.write_crypto_version == CRYPTO_VERSION_PLAINTEXT
    encrypted = _protector().protect(PLAIN, context=CTX)
    with pytest.raises(DecryptionError):
        disabled.reveal(encrypted, context=CTX)


def test_encrypting_mode_without_keys_is_a_configuration_error() -> None:
    with pytest.raises(EncryptionConfigurationError):
        PayloadProtector(EncryptionMode.REQUIRED, None)


def test_rotation_rewraps_the_key_and_leaves_the_ciphertext_untouched() -> None:
    old_key, new_key = random_key(), random_key()
    old_ring = KeyRing({"2026-01": old_key}, "2026-01")
    stored = PayloadProtector(EncryptionMode.REQUIRED, old_ring).protect(PLAIN, context=CTX)

    rotated = PayloadProtector(
        EncryptionMode.REQUIRED, KeyRing({"2026-01": old_key, "2026-02": new_key}, "2026-02")
    )
    assert rotated.reveal(stored, context=CTX) == PLAIN

    rewrapped = rotated.rewrap(stored, context=CTX)
    assert rewrapped is not None
    assert stored_key_id(rewrapped) == "2026-02"
    assert (rewrapped["n"], rewrapped["ct"]) == (stored["n"], stored["ct"])
    assert rotated.rewrap(rewrapped, context=CTX) is None

    # Revoking the old key: re-wrapped rows stay readable, the rest do not.
    revoked = PayloadProtector(EncryptionMode.REQUIRED, KeyRing({"2026-02": new_key}, "2026-02"))
    assert revoked.reveal(rewrapped, context=CTX) == PLAIN
    with pytest.raises(DecryptionError):
        revoked.reveal(stored, context=CTX)


def test_rewrap_refuses_plaintext() -> None:
    with pytest.raises(PlaintextRejectedError):
        _protector().rewrap(dict(PLAIN), context=CTX)


def test_failures_never_echo_content() -> None:
    protector = _protector()
    stored: dict[str, Any] = protector.protect(PLAIN, context=CTX)
    stored["ct"] = stored["ct"][:-2] + "AA"
    with pytest.raises(DecryptionError) as raised:
        protector.reveal(stored, context=CTX)
    assert "Anniversary" not in str(raised.value)
    assert stored["ct"] not in str(raised.value)
