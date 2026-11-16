"""The create-receipt fingerprint is keyed with an installation secret (#797)."""

from __future__ import annotations

import hashlib

import pytest

from eimir.config import get_settings
from eimir.core import request_fingerprint

CANONICAL = '{"body":"a short private comment","type":"COMMENT","v":1}'


@pytest.fixture
def signing_key(monkeypatch: pytest.MonkeyPatch):  # type: ignore[no-untyped-def]
    def use(value: str) -> None:
        monkeypatch.setenv("EIMIR_CURSOR_SIGNING_KEY", value)
        get_settings.cache_clear()

    yield use
    monkeypatch.undo()
    get_settings.cache_clear()


def test_stored_value_is_not_the_plain_hash_of_the_request(signing_key) -> None:  # type: ignore[no-untyped-def]
    signing_key("a" * 48)
    plain = hashlib.sha256(CANONICAL.encode("utf-8")).hexdigest()

    fingerprint = request_fingerprint.digest(CANONICAL)

    # Hashing a guessed request no longer reproduces what the database holds.
    assert fingerprint != plain
    assert len(fingerprint) == 64
    assert fingerprint == request_fingerprint.digest(CANONICAL)
    assert fingerprint != request_fingerprint.digest(CANONICAL.replace("short", "long"))
    # What is persisted is an ordinary string without the unkeyed digest attached.
    stored = str(fingerprint)
    assert type(stored) is str
    assert not hasattr(stored, "legacy")


def test_the_fingerprint_depends_on_the_installation_secret(signing_key) -> None:  # type: ignore[no-untyped-def]
    signing_key("a" * 48)
    first = request_fingerprint.digest(CANONICAL)
    signing_key("b" * 48)

    assert request_fingerprint.digest(CANONICAL) != first


def test_a_receipt_from_before_the_change_is_still_recognized(signing_key) -> None:  # type: ignore[no-untyped-def]
    signing_key("a" * 48)
    presented = request_fingerprint.digest(CANONICAL)
    unkeyed_receipt = hashlib.sha256(CANONICAL.encode("utf-8")).hexdigest()

    assert request_fingerprint.matches(str(presented), presented)
    assert request_fingerprint.matches(unkeyed_receipt, presented)

    other = request_fingerprint.digest(CANONICAL.replace("short", "long"))
    assert not request_fingerprint.matches(str(presented), other)
    assert not request_fingerprint.matches(unkeyed_receipt, other)
    # A bare string carries no unkeyed digest and only matches itself.
    assert not request_fingerprint.matches(unkeyed_receipt, str(presented))
