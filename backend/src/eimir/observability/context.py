"""Observability context variables.

Stores request ID, correlation ID, account ID, and space ID across async tasks
and thread executions using standard library contextvars.
"""

from __future__ import annotations

from contextvars import ContextVar, Token
from uuid import UUID

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)
correlation_id_var: ContextVar[str | None] = ContextVar("correlation_id", default=None)
account_id_var: ContextVar[str | None] = ContextVar("account_id", default=None)
space_id_var: ContextVar[str | None] = ContextVar("space_id", default=None)


def get_request_id() -> str | None:
    """Return the active request ID or None."""
    return request_id_var.get()


def set_request_id(request_id: str | None) -> Token[str | None]:
    """Set the active request ID and return the token for resetting."""
    return request_id_var.set(request_id)


def get_correlation_id() -> str | None:
    """Return the active correlation ID or None."""
    return correlation_id_var.get()


def set_correlation_id(correlation_id: str | None) -> Token[str | None]:
    """Set the active correlation ID and return the token for resetting."""
    return correlation_id_var.set(correlation_id)


def get_account_id() -> str | None:
    """Return the active account ID or None."""
    return account_id_var.get()


def set_account_id(account_id: str | None) -> Token[str | None]:
    """Set the active account ID and return the token for resetting."""
    return account_id_var.set(account_id)


def get_space_id() -> str | None:
    """Return the active space ID or None."""
    return space_id_var.get()


def set_space_id(space_id: str | None) -> Token[str | None]:
    """Set the active space ID and return the token for resetting."""
    return space_id_var.set(space_id)


def bind_actor_context(
    account_id: UUID | str | None = None,
    space_id: UUID | str | None = None,
) -> None:
    """Convenience helper to set actor and space identifiers in context."""
    if account_id is not None:
        set_account_id(str(account_id))
    if space_id is not None:
        set_space_id(str(space_id))


def reset_context() -> None:
    """Reset all observability context variables to None."""
    set_request_id(None)
    set_correlation_id(None)
    set_account_id(None)
    set_space_id(None)
