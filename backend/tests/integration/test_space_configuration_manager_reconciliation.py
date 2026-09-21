"""Legacy Space configuration-manager reconciliation via ServerAdmin."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.administration.models import (
    AdministrationAction,
    InstanceAdministrationActionEvent,
)
from eimir.auth import recent_auth
from eimir.config import get_settings
from eimir.core.clock import now
from eimir.identity.models import AccountEmail, DeviceSession
from eimir.relationship import service as relationship
from eimir.relationship.models import Membership, Space
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

ADMIN_EMAIL = "configuration-reconciliation-operator@example.test"


@pytest.fixture
def server_admin_allowlist(monkeypatch):  # type: ignore[no-untyped-def]
    monkeypatch.setenv("EIMIR_SERVER_ADMIN_EMAILS", f'["{ADMIN_EMAIL}"]')
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _admin(session: Session):  # type: ignore[no-untyped-def]
    account = make_account(session, "Configuration reconciliation operator")
    session.add(
        AccountEmail(
            account_id=account.id,
            email=ADMIN_EMAIL,
            is_primary=True,
            verified_at=now(),
        )
    )
    session.flush()
    return account, sign_in(session, account)


def _grant_recent_admin_action(session: Session, account) -> None:  # type: ignore[no-untyped-def]
    device_session = session.execute(
        select(DeviceSession).where(DeviceSession.account_id == account.id)
    ).scalar_one()
    recent_auth.issue_grant(
        session,
        account,
        device_session,
        purpose=recent_auth.RecentAuthenticationPurpose.SERVER_ADMIN_ACTION,
        method=recent_auth.RecentAuthenticationMethod.LOCAL_PASSWORD,
    )


def _path(space_id) -> str:  # type: ignore[no-untyped-def]
    return f"/api/v1/server-admin/spaces/{space_id}/configuration-manager/reconcile"


def _legacy_space(session: Session):  # type: ignore[no-untyped-def]
    first = make_account(session, "Legacy first partner")
    second = make_account(session, "Legacy second partner")
    space = make_space(session, first)
    relationship.add_member(session, space.id, second)
    space.configuration_manager_account_id = None
    session.flush()
    return space, first, second


def test_reconciliation_requires_server_admin(
    client,
    session: Session,
) -> None:
    space, first, _ = _legacy_space(session)
    caller = make_account(session, "Ordinary caller")
    token = sign_in(session, caller)

    response = client.post(
        _path(space.id),
        json={"accountId": str(first.id)},
        headers=auth(token),
    )

    assert response.status_code == 403
    assert response.json()["code"] == "SERVER_ADMIN_REQUIRED"
    session.refresh(space)
    assert space.configuration_manager_account_id is None


def test_reconciliation_requires_recent_admin_authentication(
    client,
    session: Session,
    server_admin_allowlist,
) -> None:
    admin, token = _admin(session)
    del admin
    space, first, _ = _legacy_space(session)

    response = client.post(
        _path(space.id),
        json={"accountId": str(first.id)},
        headers=auth(token),
    )

    assert response.status_code == 403
    assert response.json()["code"] == recent_auth.RecentAuthenticationErrorCode.REQUIRED
    session.refresh(space)
    assert space.configuration_manager_account_id is None


def test_reconciliation_assigns_active_member_and_records_privileged_audit(
    client,
    session: Session,
    server_admin_allowlist,
) -> None:
    admin, token = _admin(session)
    _grant_recent_admin_action(session, admin)
    space, first, second = _legacy_space(session)

    response = client.post(
        _path(space.id),
        json={"accountId": str(second.id)},
        headers=auth(token),
    )

    assert response.status_code == 200
    assert response.json() == {
        "spaceId": str(space.id),
        "configurationManagerAccountId": str(second.id),
    }

    session.refresh(space)
    assert space.configuration_manager_account_id == second.id

    memberships = {
        membership.account_id: membership
        for membership in session.execute(
            select(Membership).where(Membership.space_id == space.id)
        ).scalars()
    }
    assert relationship.can_manage_space_configuration(space, memberships[second.id])
    assert not relationship.can_manage_space_configuration(space, memberships[first.id])

    event = session.execute(
        select(InstanceAdministrationActionEvent).where(
            InstanceAdministrationActionEvent.action
            == AdministrationAction.SPACE_CONFIGURATION_MANAGER_RECONCILED.value,
            InstanceAdministrationActionEvent.target_space_id == space.id,
        )
    ).scalar_one()
    assert event.actor_id == admin.id
    assert event.target_account_id == second.id
    assert event.effect_count is None


def test_reconciliation_rejects_non_active_target_without_side_effects(
    client,
    session: Session,
    server_admin_allowlist,
) -> None:
    admin, token = _admin(session)
    _grant_recent_admin_action(session, admin)
    space, _, second = _legacy_space(session)
    second_membership = session.execute(
        select(Membership).where(
            Membership.space_id == space.id,
            Membership.account_id == second.id,
        )
    ).scalar_one()
    relationship.end_membership(session, second_membership)
    session.flush()

    response = client.post(
        _path(space.id),
        json={"accountId": str(second.id)},
        headers=auth(token),
    )

    assert response.status_code == 422
    assert response.json()["code"] == "SPACE_CONFIGURATION_MANAGER_TARGET_NOT_ACTIVE"
    session.refresh(space)
    assert space.configuration_manager_account_id is None
    audit_count = session.execute(
        select(func.count())
        .select_from(InstanceAdministrationActionEvent)
        .where(
            InstanceAdministrationActionEvent.action
            == AdministrationAction.SPACE_CONFIGURATION_MANAGER_RECONCILED.value
        )
    ).scalar_one()
    assert audit_count == 0


def test_reconciliation_rejects_active_member_from_another_space(
    client,
    session: Session,
    server_admin_allowlist,
) -> None:
    admin, token = _admin(session)
    _grant_recent_admin_action(session, admin)
    space, _, _ = _legacy_space(session)
    outsider = make_account(session, "Other Space member")
    make_space(session, outsider)

    response = client.post(
        _path(space.id),
        json={"accountId": str(outsider.id)},
        headers=auth(token),
    )

    assert response.status_code == 422
    assert response.json()["code"] == "SPACE_CONFIGURATION_MANAGER_TARGET_NOT_ACTIVE"
    session.refresh(space)
    assert space.configuration_manager_account_id is None


def test_reconciliation_never_overwrites_existing_authority(
    client,
    session: Session,
    server_admin_allowlist,
) -> None:
    admin, token = _admin(session)
    _grant_recent_admin_action(session, admin)
    first = make_account(session, "Existing manager")
    second = make_account(session, "Other active partner")
    space = make_space(session, first)
    relationship.add_member(session, space.id, second)
    session.flush()

    response = client.post(
        _path(space.id),
        json={"accountId": str(second.id)},
        headers=auth(token),
    )

    assert response.status_code == 409
    assert response.json()["code"] == "SPACE_CONFIGURATION_MANAGER_ALREADY_ASSIGNED"
    session.refresh(space)
    assert space.configuration_manager_account_id == first.id


def test_concurrent_reconciliation_has_exactly_one_winner(
    production_client,
    server_admin_allowlist,
) -> None:
    client, maker = production_client
    with maker() as setup:
        admin, token = _admin(setup)
        _grant_recent_admin_action(setup, admin)
        space, first, second = _legacy_space(setup)
        space_id = space.id
        first_id = first.id
        second_id = second.id
        setup.commit()

    start = Barrier(2)

    def reconcile(account_id):  # type: ignore[no-untyped-def]
        start.wait(timeout=5)
        return client.post(
            _path(space_id),
            json={"accountId": str(account_id)},
            headers=auth(token),
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(reconcile, [first_id, second_id]))

    assert sorted(response.status_code for response in responses) == [200, 409]
    winner = next(response for response in responses if response.status_code == 200)
    loser = next(response for response in responses if response.status_code == 409)
    assert loser.json()["code"] == "SPACE_CONFIGURATION_MANAGER_ALREADY_ASSIGNED"

    with maker() as verifier:
        stored_space = verifier.get(Space, space_id)
        assert stored_space is not None
        assert (
            str(stored_space.configuration_manager_account_id)
            == winner.json()["configurationManagerAccountId"]
        )
        audit_count = verifier.execute(
            select(func.count())
            .select_from(InstanceAdministrationActionEvent)
            .where(
                InstanceAdministrationActionEvent.action
                == AdministrationAction.SPACE_CONFIGURATION_MANAGER_RECONCILED.value,
                InstanceAdministrationActionEvent.target_space_id == space_id,
            )
        ).scalar_one()
        assert audit_count == 1
