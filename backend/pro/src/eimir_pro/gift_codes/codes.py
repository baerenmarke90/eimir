"""Gift code format, normalization and keyed lookup hash (ServerAdmin part 5).

A code reads ``EIMIR-XXXX-XXXX``. The alphabet leaves out look-alike
characters (0/O, 1/I/L) so a code can be read aloud or typed from a screenshot.
Only a keyed hash of the canonical code is stored for lookup, so a database
dump does not reveal redeemable codes.
"""

from __future__ import annotations

import hashlib
import hmac
import re
import secrets

from eimir.config import get_settings

ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_PREFIX = "EIMIR"
_BODY_LENGTH = 8
_PURPOSE = b"eimir.gift_code.lookup.v1"
_SEPARATORS = re.compile(r"[\s\-\u2013\u2014]+")


def generate_code() -> str:
    """Return a fresh random code in canonical form."""
    body = "".join(secrets.choice(ALPHABET) for _ in range(_BODY_LENGTH))
    return f"{_PREFIX}-{body[:4]}-{body[4:]}"


def normalize(raw: str) -> str | None:
    """Return the canonical form of a typed code, or ``None`` when it is invalid."""
    cleaned = _SEPARATORS.sub("", raw).upper()
    if cleaned.startswith(_PREFIX):
        cleaned = cleaned[len(_PREFIX) :]
    if len(cleaned) != _BODY_LENGTH or any(char not in ALPHABET for char in cleaned):
        return None
    return f"{_PREFIX}-{cleaned[:4]}-{cleaned[4:]}"


def lookup_hash(code: str) -> str:
    """Keyed hex digest of a canonical code, used as the database lookup value."""
    key = hmac.new(get_settings().cursor_signing_secret, _PURPOSE, hashlib.sha256).digest()
    return hmac.new(key, code.encode("utf-8"), hashlib.sha256).hexdigest()
