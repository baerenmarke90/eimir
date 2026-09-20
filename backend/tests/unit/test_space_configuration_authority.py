"""M7-S0 authoritative Space-configuration management capability."""

from __future__ import annotations

from uuid import UUID, uuid4

from eimir.relationship.models import Membership, MembershipStatus, Space
from eimir.relationship.service import can_manage_space_configuration


def membership_for(*, space_id: UUID, account_id: UUID, active: bool = True) -> Membership:
    return Membership(
        space_id=space_id,
        account_id=account_id,
        status=(MembershipStatus.ACTIVE.value if active else MembershipStatus.LEFT.value),
    )


def test_only_persisted_manager_has_configuration_capability() -> None:
    space_id = uuid4()
    manager_id = uuid4()
    partner_id = uuid4()
    space = Space(id=space_id, configuration_manager_account_id=manager_id)

    assert can_manage_space_configuration(
        space,
        membership_for(space_id=space_id, account_id=manager_id),
    )
    assert not can_manage_space_configuration(
        space,
        membership_for(space_id=space_id, account_id=partner_id),
    )


def test_legacy_unassigned_space_fails_closed() -> None:
    space_id = uuid4()
    account_id = uuid4()
    space = Space(id=space_id, configuration_manager_account_id=None)

    assert not can_manage_space_configuration(
        space,
        membership_for(space_id=space_id, account_id=account_id),
    )


def test_former_manager_loses_configuration_capability() -> None:
    space_id = uuid4()
    manager_id = uuid4()
    space = Space(id=space_id, configuration_manager_account_id=manager_id)

    assert not can_manage_space_configuration(
        space,
        membership_for(space_id=space_id, account_id=manager_id, active=False),
    )


def test_membership_from_another_space_cannot_reuse_manager_identity() -> None:
    manager_id = uuid4()
    space = Space(id=uuid4(), configuration_manager_account_id=manager_id)

    assert not can_manage_space_configuration(
        space,
        membership_for(space_id=uuid4(), account_id=manager_id),
    )
