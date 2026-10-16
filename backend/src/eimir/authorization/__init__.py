"""Owner and privacy authorization.

The second half of the access question. The tenant guard in
`eimir.relationship.service` establishes whether an account belongs to a
Space; only then does this module decide what the account may see and change
inside that Space.

A domain needs three things:

    class PrivateNote(IdMixin, TimestampMixin, PrivateResourceMixin, Base):
        __tablename__ = "private_notes"
        privacy_absence: ClassVar[ResourceAbsence] = ResourceAbsence(
            "Note not found.", "PRIVATE_NOTE_NOT_FOUND"
        )

    note = require_readable(session, PrivateNote, context, note_id)
    notes = session.execute(readable(PrivateNote, context)).scalars().all()

Nothing more. There is no place where a domain defines its own visibility
condition.
"""

from __future__ import annotations

from eimir.authorization.guard import (
    readable,
    require_readable,
    require_readable_shared,
    require_writable,
    require_writable_locked,
    writable,
)
from eimir.authorization.models import PrivateResource, PrivateResourceMixin
from eimir.authorization.privacy import (
    ENFORCEABLE_PRIVACY_CLASSES,
    AuthorizationContext,
    AuthorizationErrorCode,
    ContentVisibility,
    PrivacyClass,
    ResourceAbsence,
    SharedWrite,
    privacy_class_type,
    privacy_for,
    visibility_of,
)
from eimir.authorization.rules import Access, access_clause, privacy_clause

__all__ = [
    "ENFORCEABLE_PRIVACY_CLASSES",
    "Access",
    "AuthorizationContext",
    "AuthorizationErrorCode",
    "ContentVisibility",
    "PrivacyClass",
    "PrivateResource",
    "PrivateResourceMixin",
    "ResourceAbsence",
    "SharedWrite",
    "access_clause",
    "privacy_class_type",
    "privacy_clause",
    "privacy_for",
    "readable",
    "require_readable",
    "require_readable_shared",
    "require_writable",
    "require_writable_locked",
    "visibility_of",
    "writable",
]
