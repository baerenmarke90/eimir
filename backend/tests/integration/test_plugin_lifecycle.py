"""Core's manifest executor for an absent plugin (Decision 0017, decision 4).

The per-feature files cover purges at partner join, membership end, a member
leaving and account deletion; this file covers expiry of short-lived state, the
personal export and the rule that the executor never runs for a loaded plugin.
"""

from __future__ import annotations

from datetime import timedelta
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.auth import sessions
from eimir.authorization import AuthorizationContext
from eimir.core.clock import now
from eimir.photo_sources.models import PhotoConnection, PhotoConnectionPayload
from eimir.plugins import lifecycle
from eimir.presence.models import (
    PresenceDeviceCredential,
    PresencePositionPayload,
    PresenceSnapshot,
)
from eimir.relationship.service import add_member
from eimir.transfer.models import TransferScope
from tests.conftest import make_account, make_space, requires_database
from tests.support.plugins import requires_pro, without_plugins

pytestmark = [pytest.mark.integration, requires_database]


def _count(session: Session, model: type) -> int:  # type: ignore[type-arg]
    return int(session.scalar(select(func.count()).select_from(model)) or 0)


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    owner, partner = make_account(session, "Anna"), make_account(session, "Ben")
    space = make_space(session, owner)
    add_member(session, space.id, partner)
    session.flush()
    return owner, partner, space


def _presence(session: Session, couple, *, expires_in: timedelta) -> None:  # type: ignore[no-untyped-def]
    owner, _, space = couple
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
                expires_at=now() + expires_in,
            ),
        ]
    )
    session.flush()


@requires_pro
def test_with_the_plugin_loaded_the_executor_leaves_its_tables_alone(session, couple) -> None:  # type: ignore[no-untyped-def]
    """No double execution: the loaded plugin's hooks own its tables."""
    _presence(session, couple, expires_in=-timedelta(minutes=1))
    assert lifecycle.absent_tables() == ()
    assert lifecycle.prune_expired(session) == 0
    assert (
        lifecycle.apply_event(
            session, lifecycle.LifecycleEvent.ACCOUNT_DELETED, account_id=couple[0].id
        )
        == 0
    )
    assert _count(session, PresenceSnapshot) == 1
    assert _count(session, PresenceDeviceCredential) == 1


def test_without_the_plugin_short_lived_presence_state_goes(session, couple) -> None:  # type: ignore[no-untyped-def]
    _presence(session, couple, expires_in=-timedelta(minutes=1))
    with without_plugins():
        assert {row.table for row in lifecycle.absent_tables()} >= {"presence_snapshots"}
        lifecycle.prune_expired(session)
    session.flush()
    # Locations are deleted at once without the plugin; credentials at their expiry.
    assert _count(session, PresenceSnapshot) == 0
    assert _count(session, PresenceDeviceCredential) == 0


def test_without_the_plugin_a_valid_credential_stays_until_its_expiry(session, couple) -> None:  # type: ignore[no-untyped-def]
    _presence(session, couple, expires_in=timedelta(hours=1))
    with without_plugins():
        lifecycle.prune_expired(session)
    session.flush()
    assert _count(session, PresenceSnapshot) == 0
    assert _count(session, PresenceDeviceCredential) == 1


def test_without_the_plugin_the_personal_export_keeps_the_plugin_keys(session, couple) -> None:  # type: ignore[no-untyped-def]
    owner, partner, space = couple
    for account in (owner, partner):
        session.add(
            PhotoConnection(
                account_id=account.id,
                provider="immich",
                payload=PhotoConnectionPayload(
                    account_id=account.id,
                    origin=f"https://photos-{account.id.hex[:6]}.example.test",
                    api_key="not-exported",
                    provider_account_id=uuid4(),
                ),
            )
        )
    session.flush()
    authorization = AuthorizationContext(account_id=owner.id, space_id=space.id)
    loaded = lifecycle.export_account_document(session, authorization, TransferScope.PERSONAL)
    with without_plugins():
        absent = lifecycle.export_account_document(session, authorization, TransferScope.PERSONAL)
        shared = lifecycle.export_account_document(session, authorization, TransferScope.SHARED)
    assert loaded == absent
    assert absent["personalPhotoSources"] == [
        {"source": "immich", "origin": f"https://photos-{owner.id.hex[:6]}.example.test"}
    ]
    assert "personalGoogleAccountHint" not in absent
    assert shared == {}
