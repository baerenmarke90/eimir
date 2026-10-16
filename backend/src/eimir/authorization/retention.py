"""Privacy-class based retention cleanup shared by lifecycle workflows."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, cast
from uuid import UUID

from sqlalchemy import delete
from sqlalchemy.orm import Session

if TYPE_CHECKING:
    from sqlalchemy import CursorResult

from eimir.authorization.privacy import PrivacyClass
from eimir.db.base import Base

# Attachment rows are always OWNER_ONLY technical upload records, but a bound
# attachment may belong to retained SPACE_SHARED content. The attachment
# binding/MediaStore lifecycle therefore owns those rows and must decide using
# the parent reference rather than owner_id alone.
_OWNER_ONLY_CLEANUP_EXCLUSIONS = frozenset({"attachments"})


@dataclass(frozen=True, slots=True)
class OwnerOnlyCleanupResult:
    total: int
    by_table: dict[str, int]


def _register_privacy_models() -> None:
    """Populate Base.metadata with every production privacy-aware domain model.

    Imports stay local to avoid turning the authorization package into a module
    initialization hub. Tests may register additional probe tables; those are
    intentionally discovered by the metadata scan as well.
    """
    from eimir.attachments import models as _attachments  # noqa: F401
    from eimir.chapters import models as _chapters  # noqa: F401
    from eimir.collections import models as _collections  # noqa: F401
    from eimir.comments import models as _comments  # noqa: F401
    from eimir.gift_ideas import models as _gift_ideas  # noqa: F401
    from eimir.heart_moments import models as _heart_moments  # noqa: F401
    from eimir.identity import models as _identity  # noqa: F401
    from eimir.memories import models as _memories  # noqa: F401
    from eimir.milestones import models as _milestones  # noqa: F401
    from eimir.people import models as _people  # noqa: F401
    from eimir.places import models as _places  # noqa: F401
    from eimir.plans import models as _plans  # noqa: F401
    from eimir.private_collections import models as _private_collections  # noqa: F401
    from eimir.private_notes import models as _private_notes  # noqa: F401
    from eimir.profiles import models as _profiles  # noqa: F401
    from eimir.relationship import models as _relationship  # noqa: F401
    from eimir.reminders import models as _reminders  # noqa: F401
    from eimir.wishes import models as _wishes  # noqa: F401


def owner_only_cleanup_table_names() -> tuple[str, ...]:
    """Return the current privacy-aware tables covered by Account cleanup."""
    _register_privacy_models()
    return tuple(
        table.name
        for table in reversed(Base.metadata.sorted_tables)
        if table.name not in _OWNER_ONLY_CLEANUP_EXCLUSIONS
        and "owner_id" in table.c
        and "privacy_class" in table.c
    )


def _hard_delete_owner_only(
    session: Session,
    owner_id: UUID,
    *,
    space_id: UUID | None,
) -> OwnerOnlyCleanupResult:
    """Delete OWNER_ONLY rows, optionally constrained to one Space.

    Account deletion passes ``space_id=None`` and therefore keeps its existing
    Account-wide semantics. Space offboarding supplies a Space ID; privacy-aware
    tables without a Space key are then deliberately left alone because the
    lifecycle has no authority to classify account-global state as belonging to
    the exited relationship.
    """
    _register_privacy_models()
    counts: dict[str, int] = {}

    for table in reversed(Base.metadata.sorted_tables):
        if table.name in _OWNER_ONLY_CLEANUP_EXCLUSIONS:
            continue
        if "owner_id" not in table.c or "privacy_class" not in table.c:
            continue
        if space_id is not None and "space_id" not in table.c:
            continue

        predicates = [
            table.c.owner_id == owner_id,
            table.c.privacy_class == PrivacyClass.OWNER_ONLY.value,
        ]
        if space_id is not None:
            predicates.append(table.c.space_id == space_id)

        result = cast(
            "CursorResult[Any]",
            session.execute(delete(table).where(*predicates)),
        )
        affected = int(result.rowcount or 0)
        if affected:
            counts[table.name] = affected

    return OwnerOnlyCleanupResult(total=sum(counts.values()), by_table=counts)


def hard_delete_owner_only(session: Session, owner_id: UUID) -> OwnerOnlyCleanupResult:
    """Hard-delete every OWNER_ONLY row belonging to one Account.

    The privacy class is the authoritative predicate. Shared rows owned or
    authored by the same Account are deliberately untouched. Foreign-key-safe
    reverse metadata order removes child privacy-aware rows before parents;
    non-privacy children continue to use their existing database cascades.
    """
    return _hard_delete_owner_only(session, owner_id, space_id=None)


def hard_delete_owner_only_in_space(
    session: Session,
    owner_id: UUID,
    space_id: UUID,
) -> OwnerOnlyCleanupResult:
    """Hard-delete one Account's OWNER_ONLY rows scoped to one exited Space.

    This is the #518 counterpart to Account-wide cleanup. It cannot touch the
    partner's private rows or the same Account's private rows in another Space,
    and it never reclassifies private data as shared.
    """
    return _hard_delete_owner_only(session, owner_id, space_id=space_id)
