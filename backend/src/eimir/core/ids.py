"""Identifiers for persistent domain objects.

UUIDv7 rather than sequential numbers. An enumerable public ID reveals object
counts and invites probing; both are security problems in a multi-tenant
system rather than cosmetic concerns.

UUIDv7 carries time in its leading bits and is therefore sortable. As a
primary key, this keeps the index mostly append-oriented instead of splitting
at random positions on every insert.
"""

from __future__ import annotations

from uuid import UUID

from uuid6 import uuid7


def new_id() -> UUID:
    """Return a new identifier for a domain object."""
    return uuid7()


def parse_id(value: str) -> UUID | None:
    """Parse an ID from a string, or return None when it is not valid.

    Deliberately does not raise: a malformed ID in a request is an expected
    case and must produce a clean response rather than a 500 error.
    """
    try:
        return UUID(value)
    except (ValueError, AttributeError, TypeError):
        return None
