"""Keyed fingerprint of a normalized create request (decision 0012, #797).

A create receipt keeps a fingerprint of the request so that a replay with the
same ``Idempotency-Key`` can be told apart from a different request under that
key. The fingerprint covers user content (a comment body, a Memory title).

It used to be a plain SHA-256. Anyone holding a database dump could therefore
test guesses against it: hash a candidate request and compare. Short texts are
guessable. The fingerprint is now an HMAC under an installation secret, so the
stored value says nothing without that secret.

The key is derived from the cursor signing secret with a purpose label instead
of adding a setting: both are installation-specific integrity secrets with the
same lifetime, and neither value is ever shown to a client. Replacing that
secret makes receipts written before the change unmatchable for the rest of
their 24-hour retention, exactly as it invalidates open cursors.
"""

from __future__ import annotations

import hashlib
import hmac

from eimir.config import get_settings

_PURPOSE = b"eimir/create-receipt-fingerprint/v1"


class RequestFingerprint(str):
    """The keyed digest, carrying the unkeyed digest older receipts still hold.

    A ``str`` so that it passes through every call site unchanged. ``legacy`` is
    only ever compared against a stored value, never stored itself.
    """

    __slots__ = ("legacy",)
    legacy: str


def _key() -> bytes:
    return hmac.new(get_settings().cursor_signing_secret, _PURPOSE, hashlib.sha256).digest()


def digest(canonical: str) -> RequestFingerprint:
    """Fingerprint the canonical JSON form of a create request."""
    data = canonical.encode("utf-8")
    value = RequestFingerprint(hmac.new(_key(), data, hashlib.sha256).hexdigest())
    value.legacy = hashlib.sha256(data).hexdigest()
    return value


def matches(stored: str, presented: str) -> bool:
    """Whether a stored receipt fingerprint belongs to the presented request.

    A receipt written before the fingerprint was keyed holds the unkeyed digest.
    It is honored until it expires, so a create whose response was lost just
    before an upgrade can still be replayed instead of failing as a reused key.
    """
    if hmac.compare_digest(stored, presented):
        return True
    legacy = getattr(presented, "legacy", None)
    return isinstance(legacy, str) and hmac.compare_digest(stored, legacy)
