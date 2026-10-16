"""Optional ``Idempotency-Key`` request header (decision 0012).

The key is a client-generated UUID that names one user-initiated save. It is a
request identity only: it never authorizes anything and is always resolved
inside the caller's own Account and Space.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header

from eimir.core.errors import ErrorCode, ValidationError


def parse_idempotency_key(value: str) -> UUID:
    """Read a canonical, hyphenated UUID; anything else is a validation error."""
    raw = value.strip()
    try:
        key = UUID(raw)
    except ValueError:
        key = None
    if key is None or str(key) != raw.lower():
        raise ValidationError(
            "The Idempotency-Key header must be a UUID.",
            ErrorCode.IDEMPOTENCY_KEY_MALFORMED,
        )
    return key


def idempotency_key(
    key: Annotated[
        str | None,
        Header(
            alias="Idempotency-Key",
            description=(
                "Optional request identity (a UUID chosen by the client for one save). "
                "Repeating the same request with the same key returns the original "
                "result instead of creating it again; the key is scoped to the "
                "authenticated Account and Space and is retained for a bounded time."
            ),
        ),
    ] = None,
) -> UUID | None:
    return None if key is None else parse_idempotency_key(key)


IdempotencyKey = Annotated[UUID | None, Depends(idempotency_key)]
