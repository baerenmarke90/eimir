"""Persistence coverage for M7-S0 Space configuration authority."""

from __future__ import annotations

import pytest

from eimir.relationship import service
from tests.conftest import make_account, requires_database

pytestmark = [pytest.mark.integration, requires_database]


def test_new_space_persists_founder_as_configuration_manager(session) -> None:  # type: ignore[no-untyped-def]
    founder = make_account(session, "Founder")

    space = service.create_space(session, founder)

    assert space.configuration_manager_account_id == founder.id
