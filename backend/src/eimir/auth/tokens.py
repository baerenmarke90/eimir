"""Token generation and verification.

Deliberately opaque random tokens rather than JWTs.

A common JWT advantage is that the server can validate one without a database
lookup. That advantage does not apply here: every request for space data must
look up membership anyway, so one additional indexed lookup is negligible.

Opaque tokens provide two properties that matter more for a private couple
service than saving that lookup:

- revocation takes effect immediately. A JWT remains valid until expiry even
  after a device has been reported stolen;
- there is no signing key that must be rotated, distributed, and protected.

Only the hash is stored. A token has full entropy from ``secrets.token_urlsafe``,
so SHA-256 is sufficient: there is no dictionary to attack, and a slow scheme
such as bcrypt would only add latency to every request.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta

ACCESS_TOKEN_BYTES = 32
REFRESH_TOKEN_BYTES = 32

ACCESS_TOKEN_LIFETIME = timedelta(minutes=15)

# Sliding window: every rotation resets it. It limits how long an unused device
# may remain idle before requiring a new sign-in.
REFRESH_TOKEN_LIFETIME = timedelta(days=60)

# Hard session lifetime calculated from sign-in and never extended by rotation.
#
# Without it the session lifetime is unbounded: a regularly refreshed session
# can keep moving the sliding window forever. That would also leave the family
# and its replay history unbounded, and a stolen device could remain signed in
# indefinitely.
#
# Once this lifetime expires no rotation helps; a new sign-in and therefore a
# new token family is required.
SESSION_ABSOLUTE_LIFETIME = timedelta(days=180)


def generate_token(size: int = ACCESS_TOKEN_BYTES) -> str:
    """Generate a new secret. Only the caller receives its plaintext value."""
    return secrets.token_urlsafe(size)


def hash_token(token: str) -> str:
    """Return the hash representation used for persistence."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def tokens_equal(left: str, right: str) -> bool:
    """Compare two hashes in constant time.

    ``==`` can stop at the first differing character, allowing timing to leak a
    valid value one character at a time.
    """
    return secrets.compare_digest(left, right)
