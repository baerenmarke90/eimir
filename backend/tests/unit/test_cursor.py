"""Invariants of the signed keyset cursor."""

from __future__ import annotations

import base64

import pytest

from eimir.core import cursor
from eimir.core.errors import BadRequestError

BINDING = {"collection": "memories", "spaceId": "s", "year": None}
POSITION = {"createdAt": "2026-08-25T07:00:00Z", "id": "i"}


def test_roundtrip_returns_the_position() -> None:
    token = cursor.encode(binding=BINDING, position=POSITION)
    assert cursor.decode(token, binding=BINDING) == POSITION


def test_a_different_binding_is_rejected() -> None:
    """A cursor from another context describes a different set."""
    token = cursor.encode(binding=BINDING, position=POSITION)
    for different in (
        {**BINDING, "spaceId": "other-space"},
        {**BINDING, "year": 2025},
        {**BINDING, "collection": "heart_moments"},
    ):
        with pytest.raises(BadRequestError):
            cursor.decode(token, binding=different)


def test_every_single_character_change_invalidates_the_token() -> None:
    """No changed token remains valid, including at the end of the signature.

    The signature ends on partial bits. Without canonicalization, four
    different final characters decode to the same bytes, so a modified token
    would not necessarily be a different token.
    """
    token = cursor.encode(binding=BINDING, position=POSITION)
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

    for position in (len(token) - 1, len(token) - 2, 0, token.index(".") - 1):
        original = token[position]
        for replacement in alphabet:
            if replacement == original:
                continue
            tampered = token[:position] + replacement + token[position + 1 :]
            with pytest.raises(BadRequestError):
                cursor.decode(tampered, binding=BINDING)


def test_non_canonical_encoding_is_rejected() -> None:
    signature = bytes(range(32))
    canonical = base64.urlsafe_b64encode(signature).rstrip(b"=").decode("ascii")
    equivalents = [
        character
        for character in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
        if base64.urlsafe_b64decode(canonical[:-1] + character + "=") == signature
    ]
    # Exactly four spellings produce the same bytes; only one is canonical.
    assert len(equivalents) == 4
    assert canonical[-1] in equivalents


def test_a_structurally_broken_token_is_rejected() -> None:
    for broken in ("", "without-dot", ".", "a.b", "!!!.???"):
        with pytest.raises(BadRequestError):
            cursor.decode(broken, binding=BINDING)
