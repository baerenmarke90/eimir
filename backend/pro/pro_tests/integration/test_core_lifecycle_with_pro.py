"""Core's lifecycle executor against the real Pro plugin and its tables.

Core's own lifecycle tests (``tests/integration/test_plugin_lifecycle.py`` and
``test_core_only_lifecycle.py``) use a fake plugin so that they run in the public
Core CI, which installs Core alone. The two cases below need the real Pro models
and the real Pro plugin object, so they run only here, where Pro is installed.
"""

from __future__ import annotations

from datetime import date, timedelta
from uuid import uuid4

import pytest
from eimir_pro.presence.models import (
    PresenceDeviceCredential,
    PresencePositionPayload,
    PresenceSnapshot,
)
from eimir_pro.quotes.models import DailyQuotePreference
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.auth import sessions
from eimir.config import Environment
from eimir.core.clock import now
from eimir.demo import create_demo_space
from eimir.plugins import lifecycle
from eimir.plugins.manifest import PLUGIN_TABLES, PRO_CAPABILITIES
from eimir.relationship.service import add_member
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]


def _count(session: Session, model: type) -> int:  # type: ignore[type-arg]
    return int(session.scalar(select(func.count()).select_from(model)) or 0)


def test_with_the_pro_plugin_loaded_the_executor_leaves_its_tables_alone(session: Session) -> None:
    """No double execution: the loaded Pro plugin's hooks own its real tables."""
    owner, partner = make_account(session, "Anna"), make_account(session, "Ben")
    space = make_space(session, owner)
    add_member(session, space.id, partner)
    device_session, _ = sessions.start_session(session, owner)
    session.flush()
    keys = {"space_id": space.id, "account_id": owner.id}
    session.add_all(
        [
            PresenceSnapshot(
                **keys,
                captured_at=now(),
                expires_at=now() + timedelta(hours=1),
                consent_generation=1,
                payload=PresencePositionPayload(latitude=0, longitude=0, accuracy_meters=1000),
            ),
            PresenceDeviceCredential(
                **keys,
                device_id=uuid4(),
                device_session_id=device_session.id,
                token_hash=uuid4().hex * 2,
                consent_generation=1,
                expires_at=now() - timedelta(minutes=1),
            ),
        ]
    )
    session.flush()
    # Only the Pro plugin is loaded: its tables are never absent. The operator
    # plugin's table is (its capability is not loaded here) but has no purge rule.
    pro_tables = {row.table for row in PLUGIN_TABLES if row.capability.value in PRO_CAPABILITIES}
    assert {row.table for row in lifecycle.absent_tables()}.isdisjoint(pro_tables)
    assert lifecycle.prune_expired(session) == 0
    assert (
        lifecycle.apply_event(
            session, lifecycle.LifecycleEvent.ACCOUNT_DELETED, account_id=owner.id
        )
        == 0
    )
    assert _count(session, PresenceSnapshot) == 1
    assert _count(session, PresenceDeviceCredential) == 1


def test_with_the_plugin_the_demo_has_quote_preferences(session: Session) -> None:
    result = create_demo_space(
        session,
        environment=Environment.TEST,
        lea_password="plugin-demo-test-password",
        alex_password="plugin-demo-test-password",
        reference_date=date(2026, 8, 24),
    )
    session.flush()
    accounts = (result.lea_id, result.alex_id)
    preferences = session.scalars(
        select(DailyQuotePreference).where(DailyQuotePreference.account_id.in_(accounts))
    ).all()
    assert len(preferences) == 2
