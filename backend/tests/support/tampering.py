"""Deterministic tampering of unpadded base64url tokens.

Replacing trailing characters of a base64 string is not a reliable tamper: the
replacement can equal the original characters, or only change the unused
padding bits of the final character, so the decoded bytes stay identical and
the "tampered" value is still valid. Flipping a bit of a decoded byte always
changes the bytes and re-encodes canonically.
"""

from __future__ import annotations

import base64


def flip_base64url_byte(value: str, index: int) -> str:
    """Return ``value`` with the lowest bit of decoded byte ``index`` flipped.

    ``value`` and the result use unpadded base64url, the encoding of protected
    payload envelopes and signed cursors.
    """
    raw = bytearray(base64.urlsafe_b64decode(value + "=" * (-len(value) % 4)))
    raw[index] ^= 0x01
    return base64.urlsafe_b64encode(bytes(raw)).rstrip(b"=").decode("ascii")


def tamper_cursor_signature(cursor: str) -> str:
    """Return a signed cursor whose signature differs in exactly one bit."""
    payload, signature = cursor.split(".", 1)
    return f"{payload}.{flip_base64url_byte(signature, 0)}"
