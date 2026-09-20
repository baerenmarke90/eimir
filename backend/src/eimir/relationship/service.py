"""Membership and access to a Space.

This module contains the product's central security invariant. Every access to
Space data goes through `require_membership` BEFORE any resource is loaded.

There is no data access based only on a resource ID.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.core.clock import now
from eimir.core.errors import ConflictError, NotFoundError
from eimir.db.locks import lock_subject
from eimir.identity.models import Account
from eimir.relationship import policy
from eimir.relationship.models import (
    MAX_ACTIVE_PARTNERS,
    Membership,
    MembershipRole,
    MembershipStatus,
    Space,
    SpaceProfile,
)

FOUNDER_SPACE_LOCK = "founder_space"
"""Namespace serializing first-Space creation for one founding Account.

"This Account has no active Membership" is decided on rows that do not exist
yet, so a row lock cannot close the window between that check and the insert.
"""


class SpaceErrorCode:
    NOT_FOUND = "SPACE_NOT_FOUND"
    FULL = "SPACE_FULL"
    ALREADY_MEMBER = "ACCOUNT_ALREADY_MEMBER"
    RELATIONSHIP_ENDED = "SPACE_RELATIONSHIP_ENDED"
    ACTIVE_SPACE_EXISTS = "ACCOUNT_HAS_ACTIVE_SPACE"


def require_membership(session: Session, account: Account, space_id: UUID) -> Membership:
    """Return and share-lock the active Membership, or privacy-safe 404.

    Deliberately use NotFoundError rather than ForbiddenError because a 403
    confirms that the Space exists. Someone probing foreign IDs must not learn
    which ones exist. To the caller, another Space is indistinguishable from
    one that does not exist.

    The read lock is also the #518 lifecycle barrier. A request that has been
    authorized for this Account holds the Membership in `ACTIVE` state until
    its transaction finishes. Self-offboarding takes an exclusive lock on the
    same row before changing it to `LEFT`, so an already-authorized mutation
    must commit or roll back before the exit can become durable; a request that
    starts afterwards sees no active Membership and cannot create a stale
    post-exit effect.
    """
    membership = session.execute(
        select(Membership)
        .where(
            Membership.account_id == account.id,
            Membership.space_id == space_id,
            Membership.status == MembershipStatus.ACTIVE.value,
        )
        .with_for_update(read=True)
    ).scalar_one_or_none()

    if membership is None:
        raise NotFoundError("Space not found.", SpaceErrorCode.NOT_FOUND)

    return membership


def can_manage_space_configuration(space: Space, membership: Membership) -> bool:
    """Return the authoritative Space-configuration management capability.

    Callers consume this capability instead of reconstructing founder authority
    from Membership order, join timestamps, invitation history, or client state.
    A former member cannot keep configuration authority after offboarding.
    """

    return (
        membership.is_active
        and membership.space_id == space.id
        and space.configuration_manager_account_id is not None
        and membership.account_id == space.configuration_manager_account_id
    )


def _ensure_partner_profile(session: Session, space_id: UUID, account_id: UUID) -> None:
    """Couple profile lifecycle to membership lifecycle.

    Keep the import local so the Relationship and Profiles domains do not
    create a cyclic module initialization dependency.
    """
    from eimir.profiles.service import ensure_profile

    ensure_profile(session, space_id, account_id)


def create_space(session: Session, founder: Account) -> Space:
    """Create a Space and add the founder as a partner."""
    space = Space(configuration_manager_account_id=founder.id)
    session.add(space)
    session.flush()

    session.add(SpaceProfile(space_id=space.id))
    session.add(
        Membership(
            space_id=space.id,
            account_id=founder.id,
            role=MembershipRole.PARTNER.value,
            status=MembershipStatus.ACTIVE.value,
            joined_at=now(),
        )
    )
    session.flush()
    _ensure_partner_profile(session, space.id, founder.id)
    return space


def create_first_space(session: Session, founder: Account) -> Space:
    """Create a private Space for an Account that has no active Membership.

    This is the self-service entry into Flow B (#923). The founder is always the
    authenticated caller; there is no way to name another Account.

    The advisory lock is taken before the Membership read, so concurrent or
    retried requests for the same Account are ordered: the first creates the
    Space and every later one observes its committed Membership and is
    rejected, never silently given a second Space. An Account that already
    has an active Membership uses ordinary Space selection instead.

    Ended relationship history is not consulted and never reused: a new Space
    is always a fresh Space, so former Memberships are neither reactivated nor
    merged.
    """
    lock_subject(session, FOUNDER_SPACE_LOCK, str(founder.id))
    active = session.execute(
        select(Membership.id)
        .where(
            Membership.account_id == founder.id,
            Membership.status == MembershipStatus.ACTIVE.value,
        )
        .limit(1)
    ).scalar_one_or_none()
    if active is not None:
        raise ConflictError(
            "This Account already has an active Space.",
            SpaceErrorCode.ACTIVE_SPACE_EXISTS,
        )
    return create_space(session, founder)


def active_memberships(session: Session, space_id: UUID) -> Sequence[Membership]:
    return (
        session.execute(
            select(Membership).where(
                Membership.space_id == space_id,
                Membership.status == MembershipStatus.ACTIVE.value,
            )
        )
        .scalars()
        .all()
    )


def lock_space(session: Session, space_id: UUID) -> Space:
    """Lock the shared relationship lifecycle row or return privacy-safe 404."""
    space = session.execute(
        select(Space).where(Space.id == space_id).with_for_update()
    ).scalar_one_or_none()
    if space is None:
        raise NotFoundError("Space not found.", SpaceErrorCode.NOT_FOUND)
    return space


def freeze_offboarding_purge_deadline_if_orphaned(
    session: Session,
    space_id: UUID,
) -> datetime | None:
    """Freeze the product-policy deadline when a Space first becomes zero-active.

    The Space row is the relationship lifecycle serialization boundary. Keeping
    the resulting timestamp on that row makes later policy changes prospective:
    an already-orphaned Space never has its promised deletion deadline silently
    recomputed from a newer retention duration.

    Empty Spaces and malformed ended Memberships without ``ended_at`` fail
    closed and receive no destructive deadline. Callers that end Memberships
    should already hold the Space lifecycle lock; reacquiring it here is safe
    and keeps this helper correct for future authoritative callers.
    """
    space = lock_space(session, space_id)
    if space.offboarding_purge_at is not None:
        return space.offboarding_purge_at

    memberships = list(
        session.execute(
            select(Membership).where(Membership.space_id == space_id).order_by(Membership.id)
        ).scalars()
    )
    if not memberships:
        return None
    if any(membership.status == MembershipStatus.ACTIVE.value for membership in memberships):
        return None

    ended_at = [membership.ended_at for membership in memberships]
    if any(value is None for value in ended_at):
        return None

    orphaned_at = max(value for value in ended_at if value is not None)
    space.offboarding_purge_at = policy.purge_eligible_at(orphaned_at)
    return space.offboarding_purge_at


def has_ended_membership(session: Session, space_id: UUID) -> bool:
    """Return whether this Space has entered relationship-history state."""
    return (
        session.execute(
            select(Membership.id)
            .where(
                Membership.space_id == space_id,
                Membership.status.in_(
                    (MembershipStatus.LEFT.value, MembershipStatus.REMOVED.value)
                ),
            )
            .limit(1)
        ).scalar_one_or_none()
        is not None
    )


def ensure_joinable_space_locked(session: Session, space_id: UUID) -> Space:
    """Lock a Space and reject ordinary joining after any Membership ended."""
    space = lock_space(session, space_id)
    if has_ended_membership(session, space_id):
        raise ConflictError(
            "This relationship history cannot accept another partner.",
            SpaceErrorCode.RELATIONSHIP_ENDED,
        )
    return space


def add_member(session: Session, space_id: UUID, account: Account) -> Membership:
    """Add an account to a joinable Space.

    The upper bound and the #518 history lock are enforced here rather than
    only when accepting an invitation. A couple Space has at most two active
    partners, and once any Membership has ended its history cannot be reused for
    a later relationship.

    The Space row serializes the checks and mutation until commit, so two
    different invitations cannot claim the final free slot concurrently and an
    invitation cannot race a concurrent offboarding transition.
    """
    ensure_joinable_space_locked(session, space_id)

    existing = session.execute(
        select(Membership).where(
            Membership.space_id == space_id,
            Membership.account_id == account.id,
        )
    ).scalar_one_or_none()

    if existing is not None and existing.is_active:
        raise ConflictError("Account is already a member.", SpaceErrorCode.ALREADY_MEMBER)

    if len(active_memberships(session, space_id)) >= MAX_ACTIVE_PARTNERS:
        raise ConflictError("This space already has two partners.", SpaceErrorCode.FULL)

    # An ended Membership can only exist when the Space is history-locked, so
    # ensure_joinable_space_locked() has already rejected that state. Ordinary
    # joining therefore never reactivates a former relationship implicitly.
    membership = Membership(
        space_id=space_id,
        account_id=account.id,
        role=MembershipRole.PARTNER.value,
        status=MembershipStatus.ACTIVE.value,
        joined_at=now(),
    )
    session.add(membership)
    session.flush()
    _ensure_partner_profile(session, space_id, account.id)
    return membership


def end_membership(
    session: Session,
    membership: Membership,
    *,
    removed: bool = False,
) -> None:
    """End a membership without deleting it.

    Deleting it would make it impossible to determine later who created
    content.
    """
    from eimir.memories import create_receipts
    from eimir.story import view_service

    view_service.purge_viewer_for_space(
        session,
        space_id=membership.space_id,
        viewer_account_id=membership.account_id,
    )
    create_receipts.purge_account_in_space(
        session,
        space_id=membership.space_id,
        account_id=membership.account_id,
    )
    membership.status = MembershipStatus.REMOVED.value if removed else MembershipStatus.LEFT.value
    membership.ended_at = now()


def partner_of(session: Session, space_id: UUID, account: Account) -> Account | None:
    """Return the other active partner, if one exists."""
    members = active_memberships(session, space_id)
    for membership in members:
        if membership.account_id != account.id:
            return session.get(Account, membership.account_id)
    return None
