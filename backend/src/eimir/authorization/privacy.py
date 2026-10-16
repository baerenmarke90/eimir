"""Privacy classes: the vocabulary domains use to declare visibility.

The tenant guard answers "does this account belong to this space?". That is not
enough for private content because the partner belongs to the same space but
may still not be allowed to read a resource. This module answers the second
question: "which privacy class does this resource have, and what does that mean
for this account?"

There is no implicit public class. A resource without a class cannot be stored.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from uuid import UUID

from sqlalchemy import Enum as SqlEnum

from eimir.core.errors import NotFoundError


class PrivacyClass(StrEnum):
    """Classes defined by specification section 7.

    The list is complete so code, specification, and ``docs/PRIVACY-MODEL.md``
    use the same vocabulary. Being listed does not mean a class is currently
    enforceable; enforcement additionally requires a query rule and storage
    representation.
    """

    SPACE_SHARED = "SPACE_SHARED"
    OWNER_ONLY = "OWNER_ONLY"
    TEMPORARY_SHARED = "TEMPORARY_SHARED"
    EPHEMERAL_CONTEXT = "EPHEMERAL_CONTEXT"
    SYSTEM_METADATA = "SYSTEM_METADATA"


class SharedWrite(StrEnum):
    """Who may modify a ``SPACE_SHARED`` row.

    ``SPACE_SHARED`` answers the read question unambiguously: both partners.
    It does not determine write access. Memory and Milestone remain author-only
    under specification section 14, while shared M3 planning/list resources
    Wish, Plan, Place, Chapter, and Collection explicitly use collaborative
    write semantics under M3-D01.

    This is a domain property rather than a privacy-class property, so the
    model declares it once instead of routes adding exceptions.

    ``OWNER_ONLY`` has no such choice: only the owner may write, and the partner
    is treated like any other non-owner.
    """

    AUTHOR_ONLY = "AUTHOR_ONLY"
    COLLABORATIVE = "COLLABORATIVE"


class ContentVisibility(StrEnum):
    """Domain visibility from specification section 15.

    Requests name visibility rather than a privacy class. ``privacyClass`` is a
    server-side derivation and is never a client-settable field.

    The type lives here rather than in one domain because several domains use
    the same vocabulary: RelatedPerson, ImportantDate, and HeartMoment should
    not depend on whichever feature happened to need it first.
    """

    SHARED = "SHARED"
    PRIVATE = "PRIVATE"


def privacy_for(visibility: ContentVisibility) -> PrivacyClass:
    """Derive privacy class from domain visibility, not from request input."""
    if visibility is ContentVisibility.SHARED:
        return PrivacyClass.SPACE_SHARED
    return PrivacyClass.OWNER_ONLY


def visibility_of(privacy_class: str) -> ContentVisibility:
    if privacy_class == PrivacyClass.SPACE_SHARED.value:
        return ContentVisibility.SHARED
    return ContentVisibility.PRIVATE


ENFORCEABLE_PRIVACY_CLASSES: tuple[PrivacyClass, ...] = (
    PrivacyClass.SPACE_SHARED,
    PrivacyClass.OWNER_ONLY,
)
"""Classes for which the server currently has a query rule.

A class the server cannot enforce must not appear in persisted data. Otherwise
rows would exist without an implemented protection rule, and adding a rule
later would retroactively change the meaning of existing data.

Adding a class therefore requires three coordinated changes: a rule in
``authorization.rules``, an entry here, and a migration expanding the accepted
values of existing tables.
"""


def privacy_class_type() -> SqlEnum:
    """Column type for ``privacy_class``.

    This is constrained data rather than free text: the database accepts only
    classes the server enforces. ``native_enum=False`` stores VARCHAR plus
    CHECK, so adding a value requires an ordinary migration rather than a
    PostgreSQL type change with limited downgrade support.
    """
    return SqlEnum(
        *(privacy_class.value for privacy_class in ENFORCEABLE_PRIVACY_CLASSES),
        name="privacy_class",
        native_enum=False,
        create_constraint=True,
        validate_strings=True,
    )


@dataclass(frozen=True)
class AuthorizationContext:
    """Who is asking and within which space.

    Created only from an already-verified tenant context. Both values are
    server-derived: account from the bearer token and space from verified
    membership. Neither comes from a request body.
    """

    account_id: UUID
    space_id: UUID


@dataclass(frozen=True)
class ResourceAbsence:
    """How a domain reports a resource that is absent to the caller.

    One response intentionally covers three causes: malformed ID, nonexistent
    resource, or an existing resource the account must not know about. Distinct
    responses would turn the error path into an existence oracle.
    """

    detail: str
    code: str

    def error(self) -> NotFoundError:
        return NotFoundError(self.detail, self.code)


class AuthorizationErrorCode:
    RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND"
    NOT_RESOURCE_OWNER = "NOT_RESOURCE_OWNER"


DEFAULT_ABSENCE = ResourceAbsence("Resource not found.", AuthorizationErrorCode.RESOURCE_NOT_FOUND)
"""Fallback for domains that do not define their own absence response."""
