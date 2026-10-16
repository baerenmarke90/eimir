"""Query boundary for private resources.

Everything a domain needs to enforce privacy lives here, and only here. A
domain describes its data with ``PrivateResourceMixin`` and calls these
functions; it does not restate visibility predicates. A second handwritten
guard would be a second place for authorization to drift.

The authorization condition is always part of the query. This module
intentionally has no function that validates an already-loaded row: by then the
row would already have been read before permission was checked.
"""

from __future__ import annotations

from typing import cast
from uuid import UUID

from sqlalchemy import Select, select
from sqlalchemy.exc import InvalidRequestError
from sqlalchemy.orm import Session

from eimir.authorization.models import PrivateResource, PrivateResourceMixin
from eimir.authorization.privacy import (
    AuthorizationContext,
    AuthorizationErrorCode,
    ResourceAbsence,
)
from eimir.authorization.rules import Access, access_clause
from eimir.core.errors import ForbiddenError
from eimir.core.ids import parse_id


def _rule_model[ResourceT: PrivateResourceMixin](
    model: type[ResourceT],
) -> type[PrivateResource]:
    """Adapt the ORM model to the structural rule interface.

    SQLAlchemy exposes mapped descriptors at runtime in exactly the form
    ``PrivateResource`` describes. Without the SQLAlchemy mypy plugin, mypy
    cannot prove that structural match across inherited declarative mixins. The
    cast therefore lives only at this central type boundary; domain models stay
    constrained to ``PrivateResourceMixin`` and never define privacy rules
    themselves.
    """
    return cast(type[PrivateResource], model)


def absence_of(model: type[PrivateResourceMixin]) -> ResourceAbsence:
    return model.privacy_absence


def readable[ResourceT: PrivateResourceMixin](
    model: type[ResourceT], context: AuthorizationContext
) -> Select[tuple[ResourceT]]:
    """Entry point for every list, search, and count query.

    Starting here makes the visibility predicate impossible to forget: it is
    already in the statement before the domain adds filters, ordering, and
    limits. A ``count()`` based on this statement therefore counts only visible
    rows; otherwise the count itself would disclose information.
    """
    return select(model).where(access_clause(_rule_model(model), context, Access.READ))


def writable[ResourceT: PrivateResourceMixin](
    model: type[ResourceT], context: AuthorizationContext
) -> Select[tuple[ResourceT]]:
    """Equivalent query entry point for write access."""
    return select(model).where(access_clause(_rule_model(model), context, Access.WRITE))


def _identifier(value: UUID | str) -> UUID | None:
    return value if isinstance(value, UUID) else parse_id(value)


def require_readable[ResourceT: PrivateResourceMixin](
    session: Session,
    model: type[ResourceT],
    context: AuthorizationContext,
    resource_id: UUID | str,
) -> ResourceT:
    """Read a resource or report it as absent.

    Malformed ID, unknown ID, another space, and another account's private row
    all produce the same response. The ID is never looked up first and judged
    afterward; it is part of the same authorized query.
    """
    absence = absence_of(model)
    identifier = _identifier(resource_id)
    if identifier is None:
        raise absence.error()

    rule_model = _rule_model(model)
    found = session.execute(
        readable(model, context).where(rule_model.id == identifier)
    ).scalar_one_or_none()

    if found is None:
        raise absence.error()
    return found


def require_readable_shared[ResourceT: PrivateResourceMixin](
    session: Session,
    model: type[ResourceT],
    context: AuthorizationContext,
    resource_id: UUID | str,
) -> ResourceT:
    """Read a resource and hold it against deletion until commit.

    This is for operations that reference another row, such as a plan pointing
    to a place. The row must not disappear between validation and writing the
    reference.

    Deliberately uses ``FOR SHARE`` rather than ``FOR UPDATE``: existence is
    being held, not write ownership. Multiple plans may reference the same
    place concurrently; only deletion of that place must wait.

    If the row disappears in the gap before the lock, the guard responds as for
    an unknown ID, matching ``require_writable_locked``.
    """
    found = require_readable(session, model, context, resource_id)
    try:
        session.refresh(found, with_for_update={"read": True})
    except InvalidRequestError as error:
        raise absence_of(model).error() from error
    return found


def require_writable_locked[ResourceT: PrivateResourceMixin](
    session: Session,
    model: type[ResourceT],
    context: AuthorizationContext,
    resource_id: UUID | str,
) -> ResourceT:
    """Require write access and then hold the row exclusively.

    Used by operations that authorize, inspect additional state, and only then
    write. Without the lock, the inspected state could change between check and
    mutation.

    A concurrent transaction may delete the row between authorization and
    locking. SQLAlchemy reports that as ``InvalidRequestError``; exposing it as
    a 500 would both be incorrect and leak a different response for a recently
    deleted row. The caller therefore receives the same absence response as for
    an unknown ID.
    """
    found = require_writable(session, model, context, resource_id)
    try:
        session.refresh(found, with_for_update=True)
    except InvalidRequestError as error:
        raise absence_of(model).error() from error
    return found


def require_writable[ResourceT: PrivateResourceMixin](
    session: Session,
    model: type[ResourceT],
    context: AuthorizationContext,
    resource_id: UUID | str,
) -> ResourceT:
    """Require write access to a resource.

    Two rejection modes are intentional. Content the account cannot read is
    absent to it and therefore returns 404; a distinct response would reveal
    what ``OWNER_ONLY`` is designed to hide.

    Content the account may read but not change returns 403. Its existence is
    already known, so reporting 404 there would not protect anything and would
    contradict what the client can already display.

    Both questions are answered in one query so no mutable state can change
    between separate read and write checks.
    """
    absence = absence_of(model)
    identifier = _identifier(resource_id)
    if identifier is None:
        raise absence.error()

    rule_model = _rule_model(model)
    row = session.execute(
        select(model, access_clause(rule_model, context, Access.WRITE).label("is_writable"))
        .where(access_clause(rule_model, context, Access.READ))
        .where(rule_model.id == identifier)
    ).one_or_none()

    if row is None:
        raise absence.error()

    found: ResourceT = row[0]
    if not row[1]:
        raise ForbiddenError(
            "This resource belongs to someone else.",
            AuthorizationErrorCode.NOT_RESOURCE_OWNER,
        )
    return found
