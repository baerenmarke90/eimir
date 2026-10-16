"""Signed opaque keyset cursors.

A cursor identifies a position in a sorted, already-authorized set. It is not
secret, but it is not a client-controlled field either: if a client could
choose it freely, it could continue a query past a filter boundary. Each
cursor therefore carries an HMAC signature over its complete contents and the
context in which it was issued.

The binding is the important part. A cursor from another Space or from
different filters is not a valid continuation point even when its signature
is valid, because it describes a position in a different set. The context is
therefore included in the signed data and checked against the current request
when redeemed instead of merely being supplied alongside it.

Each domain defines its keyset position (`position`) and the context to which
the cursor is bound (`binding`); this module knows neither sort keys nor
filters. Memories, HeartMoments, and later Story can therefore share the same
signing and binding mechanism without each collection implementing its own
variant, which otherwise risks subtle divergence in one binding check.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
from typing import Any

from eimir.config import get_settings
from eimir.core.errors import BadRequestError, ErrorCode

CURSOR_VERSION = 1
"""Included in the signature. A cursor from an older version is invalid rather
than something to interpret on a best-effort basis."""


def _signing_key() -> bytes:
    return get_settings().cursor_signing_secret


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _b64decode(value: str) -> bytes:
    """Decode unpadded Base64url only in its canonical representation.

    A token ends on partial bits that the decoder discards. Without this
    check, the same bytes would have multiple valid spellings: for a 32-byte
    signature, four different final characters decode identically. A changed
    token would then not necessarily be a different token, which is exactly
    the property a signature is meant to guarantee.
    """
    padding = "=" * (-len(value) % 4)
    raw = base64.urlsafe_b64decode(value + padding)
    if base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii") != value:
        raise ValueError("non-canonical base64")
    return raw


def invalid_cursor() -> BadRequestError:
    """Return the same response for every cursor failure.

    Tampering, a foreign Space, changed filters, and malformed Base64 all end
    the same way. Distinguishing them would reveal which assumption was
    correct.
    """
    return BadRequestError("The cursor is invalid for this request.", ErrorCode.INVALID_CURSOR)


def encode(*, binding: dict[str, Any], position: dict[str, Any]) -> str:
    """Sign a position and binding into an opaque token."""
    payload = {"v": CURSOR_VERSION, "b": binding, "p": position}
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    signature = hmac.new(_signing_key(), raw, hashlib.sha256).digest()
    return f"{_b64encode(raw)}.{_b64encode(signature)}"


def decode(token: str, *, binding: dict[str, Any]) -> dict[str, Any]:
    """Verify a token and return its position.

    The signature is checked before parsing the contents so no manipulated
    payload reaches the parser. The embedded binding must then match the
    expected binding exactly.
    """
    try:
        raw_part, signature_part = token.split(".", 1)
        raw = _b64decode(raw_part)
        supplied = _b64decode(signature_part)
    except (ValueError, TypeError) as error:
        raise invalid_cursor() from error

    expected = hmac.new(_signing_key(), raw, hashlib.sha256).digest()
    if not hmac.compare_digest(supplied, expected):
        raise invalid_cursor()

    try:
        payload: dict[str, Any] = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError) as error:
        raise invalid_cursor() from error

    if payload.get("v") != CURSOR_VERSION or payload.get("b") != binding:
        raise invalid_cursor()

    position = payload.get("p")
    if not isinstance(position, dict):
        raise invalid_cursor()
    return position
