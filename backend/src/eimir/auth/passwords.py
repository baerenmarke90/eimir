"""Password derivation.

Argon2id is the current recommended standard. Unlike tokens, passwords should
use an intentionally slow scheme: they have low entropy and would otherwise be
cheap to test against a dictionary.

This is the only place in the project that needs a cryptography library. Token
handling uses the standard library.
"""

from __future__ import annotations

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from eimir.core.errors import ValidationError

# Lower bound against obviously weak passwords. No character-class rules:
# length protects better than mandatory special characters that mostly cause
# people to choose values such as "Password1!".
MIN_PASSWORD_LENGTH = 12
MAX_PASSWORD_LENGTH = 4096

_hasher = PasswordHasher()


class PasswordErrorCode:
    TOO_SHORT = "PASSWORD_TOO_SHORT"
    TOO_LONG = "PASSWORD_TOO_LONG"


def validate(password: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValidationError(
            f"The password must be at least {MIN_PASSWORD_LENGTH} characters.",
            PasswordErrorCode.TOO_SHORT,
        )
    # An upper bound is necessary because Argon2 processes the full input; an
    # extremely long password would otherwise be a cheap way to consume server
    # resources.
    if len(password) > MAX_PASSWORD_LENGTH:
        raise ValidationError("The password is too long.", PasswordErrorCode.TOO_LONG)


def hash_password(password: str) -> str:
    validate(password)
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    """Verify a password, returning False instead of raising on failure.

    A failed sign-in is an expected case rather than an application error, and
    the caller must not need to distinguish a wrong password from a malformed
    stored hash.
    """
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    """Return whether the hash was produced with outdated parameters.

    If parameters are strengthened later, existing passwords migrate on the
    next successful sign-in.
    """
    try:
        return _hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return False


DUMMY_HASH = _hasher.hash("not-real-only-for-timing-equalization")
"""Hash used for comparison when no account exists.

Without it, an unknown address would return measurably faster than a wrong
password, revealing which addresses are registered.
"""
