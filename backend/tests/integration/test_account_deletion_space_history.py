"""#518/#669 integration coverage for Account deletion and Space relationship history."""

from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.core.clock import now
from eimir.core.errors import ConflictError
from eimir.identity.deletion import apply_accepted_tombstone
from eimir.relationship import policy, service
from eimir.relationship.models import Invitation, Membership, MembershipStatus
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]


def test_account_deletion_history_locks_space_and_revokes_all_open_invitations(
    session: Session,
) -> None:
    survivor = make_account(session, "Survivor")
    deleting = make_account(session, "Deleting")
    space = make_space(session, survivor)

    # This models a still-open token issued while the Space had room. It was
    # created by the surviving Account, so creator-only deletion cleanup would
    # incorrectly leave it open when the other Membership ends.
    stale_invitation = Invitation(
        space_id=space.id,
        created_by=survivor.id,
        token_hash="b" * 64,
        expires_at=now() + timedelta(hours=1),
    )
    session.add(stale_invitation)
    service.add_member(session, space.id, deleting)
    session.flush()

    accepted_at = now()
    result = apply_accepted_tombstone(session, deleting.id, accepted_at=accepted_at)

    assert result is not None
    membership = session.execute(
        select(Membership).where(
            Membership.space_id == space.id,
            Membership.account_id == deleting.id,
        )
    ).scalar_one()
    assert membership.status == MembershipStatus.LEFT.value
    assert membership.ended_at == accepted_at
    assert stale_invitation.revoked_at == accepted_at
    assert space.offboarding_purge_at is None

    replacement = make_account(session, "Replacement")
    with pytest.raises(ConflictError) as error:
        service.add_member(session, space.id, replacement)
    assert error.value.code == service.SpaceErrorCode.RELATIONSHIP_ENDED


def test_account_deletion_freezes_deadline_when_it_removes_last_active_membership(
    session: Session,
) -> None:
    deleting = make_account(session, "Deleting")
    space = make_space(session, deleting)
    session.flush()

    accepted_at = now()
    result = apply_accepted_tombstone(session, deleting.id, accepted_at=accepted_at)

    assert result is not None
    membership = session.execute(
        select(Membership).where(
            Membership.space_id == space.id,
            Membership.account_id == deleting.id,
        )
    ).scalar_one()
    assert membership.status == MembershipStatus.LEFT.value
    assert membership.ended_at == accepted_at
    assert space.offboarding_purge_at == policy.purge_eligible_at(accepted_at)
