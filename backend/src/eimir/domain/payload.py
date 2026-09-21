"""Boundary between metadata and protected content.

There is NO end-to-end encryption. This module does not implement it and must
not be presented as if it did. What exists is application-controlled encryption
at rest (issue #797): the server encrypts protected payloads with keys its
operator controls, and the running application can read them.

What it does is draw the boundary now so it does not need to be introduced
throughout the whole application later.

    Metadata                 ProtectedPayload
    ------------------       -----------------
    id, space_id             title
    author_id                body
    happened_on              other sensitive fields
    created_at
    crypto_version

`crypto_version = 0` is legacy plaintext; `crypto_version = 2` is an
application-encrypted envelope (see `eimir.security.payload_envelope`). Version 1
stays reserved for client-side encryption, which does not exist.

The consequence for everything built on top of this boundary: dashboards,
recaps, rules, and notifications should work from metadata. Anything requiring
plaintext will stop working after that transition, and that dependency should
be visible while writing the feature rather than years later.
"""

from __future__ import annotations

from typing import Any, ClassVar, Self

from pydantic import BaseModel, ConfigDict

CRYPTO_VERSION_PLAINTEXT = 0
"""Plaintext. Product version 1."""

CRYPTO_VERSION_CLIENT_SEALED = 1
"""Reserved for client-side encryption. Not implemented yet."""

CRYPTO_VERSION_SERVER_AEAD = 2
"""Server-side AEAD envelope under operator-controlled keys. NOT end-to-end."""


class ProtectedPayload(BaseModel):
    """Base class for the protected part of a domain object.

    Domain objects derive from this class and add their sensitive fields. The
    rest of the object - everything needed for sorting, filtering, and linking
    - remains outside it.
    """

    model_config = ConfigDict(extra="forbid")

    crypto_version: ClassVar[int] = CRYPTO_VERSION_PLAINTEXT

    @classmethod
    def crypto_context(cls) -> str:
        """Stable label authenticated with every encrypted payload of this type.

        Defaults to the class name. Renaming a payload class changes this value
        and makes existing ciphertext unreadable, so a rename must pin the old
        label by overriding this method. ``test_payload_encryption`` pins the
        labels of every registered payload type to catch an accidental rename.
        """
        return cls.__name__

    def seal(self) -> dict[str, Any]:
        """Convert the payload to its persisted representation.

        This is the plaintext JSON mapping. Encryption is applied one layer
        below, in `ProtectedPayloadJSON`, so domain code never handles
        ciphertext and never decides whether a value is encrypted.
        """
        return self.model_dump(mode="json")

    @classmethod
    def unseal(cls, stored: dict[str, Any] | None) -> Self:
        """Read a stored payload.

        A missing payload produces an empty object rather than an exception:
        after a transition to real encryption there may be rows the server
        cannot read. Such rows must not break an entire list.
        """
        return cls.model_validate(stored or {})


def is_readable_by_server(crypto_version: int) -> bool:
    """Return whether the server can read this row's content.

    Intended for derived features that depend on plaintext. They should be
    able to skip the row rather than guess.
    """
    return crypto_version in (CRYPTO_VERSION_PLAINTEXT, CRYPTO_VERSION_SERVER_AEAD)
