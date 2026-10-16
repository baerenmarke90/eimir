"""Product-policy integration coverage for #669 Space offboarding."""

from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from eimir.relationship import offboarding, policy, service
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]


def test_first_exit_does_not_start_whole_space_retention(session: Session) -> None:
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    space = make_space(session, anna)
    service.add_member(session, space.id, ben)
    session.flush()

    result = offboarding.leave_space(session, anna, space.id)
    session.flush()

    assert result.membership.ended_at is not None
    assert space.offboarding_purge_at is None


def test_final_self_exit_freezes_v1_purge_deadline(session: Session) -> None:
    anna = make_account(session, "Anna")
    space = make_space(session, anna)
    session.flush()

    result = offboarding.leave_space(session, anna, space.id)
    session.flush()

    assert result.membership.ended_at is not None
    assert space.offboarding_purge_at == policy.purge_eligible_at(result.membership.ended_at)

    frozen = space.offboarding_purge_at
    repeated = offboarding.leave_space(session, anna, space.id)
    session.flush()

    assert repeated.changed is False
    assert space.offboarding_purge_at == frozen
