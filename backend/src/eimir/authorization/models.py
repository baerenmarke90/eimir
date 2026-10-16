"""Columns that make a resource authorizable.

This is a mixin rather than a universal content table. A shared content table
would force unrelated domains into one schema, make every foreign-key
relationship generic, and place the entire data set behind one query surface.
Each domain keeps its own table; only the shape of these columns and the rule
that operates on them are shared.
"""

from __future__ import annotations

from typing import ClassVar, Protocol
from uuid import UUID

from sqlalchemy import ForeignKey
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.authorization.privacy import (
    DEFAULT_ABSENCE,
    ResourceAbsence,
    SharedWrite,
    privacy_class_type,
)


class PrivateResource(Protocol):
    """Structural interface required by the authorization guard.

    Deliberately structural: the guard operates on shape rather than an
    inheritance hierarchy. Any model exposing these columns can be authorized
    regardless of which declarative mixins compose it.
    """

    id: Mapped[UUID]
    space_id: Mapped[UUID]
    owner_id: Mapped[UUID]
    privacy_class: Mapped[str]

    privacy_absence: ClassVar[ResourceAbsence]
    shared_write: ClassVar[SharedWrite]


class PrivateResourceMixin:
    """Space, owner, and privacy class for a domain table.

    ``space_id`` answers the tenant question, ``owner_id`` the ownership
    question, and ``privacy_class`` selects which authorization rule applies.
    All three are mandatory: a resource without a class would have implicit
    visibility.

    Ownership belongs to the account rather than the membership. Ending and
    later restoring a membership must not transfer ownership of private data.
    """

    privacy_absence: ClassVar[ResourceAbsence] = DEFAULT_ABSENCE
    """This domain's response for a resource absent to the caller.

    It is declared once per domain instead of passed at every call site so the
    same resource cannot gradually acquire different absence responses whose
    differences reveal information.
    """

    shared_write: ClassVar[SharedWrite] = SharedWrite.AUTHOR_ONLY
    """Who may modify shared rows in this domain.

    The default is the narrower author-only policy. A domain that needs
    collaborative write access opts in explicitly, so forgetting a declaration
    cannot accidentally make partner-owned content writable.
    """

    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    owner_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    privacy_class: Mapped[str] = mapped_column(privacy_class_type(), nullable=False)
