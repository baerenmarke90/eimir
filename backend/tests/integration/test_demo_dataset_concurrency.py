"""Concurrency coverage for the canonical-demo dataset mutation boundary (#690).

Before this boundary existed, the only cross-process lock in the demo reset
path guarded scheduler bookkeeping (`demo.reset._lock`, whether a pending
reset Job already exists), not the dataset mutation itself: a manual CLI
`create`/`ensure`/`reset` could still race a scheduled worker reset, or two
manual invocations could race each other, against the same reserved Lea/Alex
Space. A sequential test cannot exercise that race; it needs two genuinely
concurrent transactions.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeoutError
from datetime import date
from threading import Event

import pytest
from sqlalchemy import select

from eimir.attachments import service as attachment_service
from eimir.attachments.models import Attachment
from eimir.config import Environment
from eimir.demo import service as demo_service
from eimir.identity.models import Account
from eimir.media import get_media_store
from eimir.relationship.models import Membership, MembershipStatus, Space
from tests.conftest import requires_database

pytestmark = [pytest.mark.integration, requires_database]

REFERENCE_DATE = date(2026, 8, 24)
DEMO_PASSWORD = "canonical-demo-dataset-concurrency-password"


def _seed(maker):  # type: ignore[no-untyped-def]
    with maker() as session:
        result = demo_service.create_demo_space(
            session,
            environment=Environment.TEST,
            lea_password=DEMO_PASSWORD,
            alex_password=DEMO_PASSWORD,
            reference_date=REFERENCE_DATE,
        )
        session.commit()
        return result.lea_id, result.alex_id, result.space_id


def _reset(maker):  # type: ignore[no-untyped-def]
    with maker() as session:
        result = demo_service.reset_demo_space(
            session,
            environment=Environment.TEST,
            reference_date=REFERENCE_DATE,
        )
        session.commit()
        return result


def _ensure(maker):  # type: ignore[no-untyped-def]
    """The CLI's `ensure` action: `create_demo_space` against an already-seeded dataset."""
    with maker() as session:
        result = demo_service.create_demo_space(
            session,
            environment=Environment.TEST,
            lea_password=DEMO_PASSWORD,
            alex_password=DEMO_PASSWORD,
            reference_date=REFERENCE_DATE,
        )
        session.commit()
        return result


def _assert_waiting(future) -> None:  # type: ignore[no-untyped-def]
    """Prove a contender reached the lock but cannot cross the held boundary."""
    with pytest.raises(FutureTimeoutError):
        future.result(timeout=0.2)


def _active_shared_space(session, lea_id, alex_id) -> Space:  # type: ignore[no-untyped-def]
    memberships = list(
        session.execute(
            select(Membership).where(
                Membership.account_id.in_([lea_id, alex_id]),
                Membership.status == MembershipStatus.ACTIVE.value,
            )
        ).scalars()
    )
    space_ids = {membership.space_id for membership in memberships}
    assert len(space_ids) == 1, f"expected exactly one canonical active Space, found {space_ids}"
    assert len(memberships) == 2
    space_id = next(iter(space_ids))
    space = session.get(Space, space_id)
    assert space is not None
    return space


def test_concurrent_resets_leave_exactly_one_canonical_space(
    production_client, monkeypatch: pytest.MonkeyPatch
) -> None:  # type: ignore[no-untyped-def]
    """Two `reset` invocations racing must not each create a replacement Space."""
    _client, maker = production_client
    lea_id, alex_id, initial_space_id = _seed(maker)

    reached_lock = Event()
    original_lock = demo_service._lock_canonical_demo_dataset

    def announced_lock(session):  # type: ignore[no-untyped-def]
        reached_lock.set()
        original_lock(session)

    monkeypatch.setattr(demo_service, "_lock_canonical_demo_dataset", announced_lock)

    holding = maker()
    try:
        # Complete the first reset's work but hold its transaction open: its
        # advisory dataset lock is only released on commit.
        first = demo_service.reset_demo_space(
            holding, environment=Environment.TEST, reference_date=REFERENCE_DATE
        )
        first_space_id = first.space_id
        assert first_space_id != initial_space_id

        first_attachments = list(
            holding.execute(
                select(Attachment).where(Attachment.space_id == first_space_id)
            ).scalars()
        )
        first_storage_keys = {
            attachment_service.storage_key_for(attachment) for attachment in first_attachments
        }
        assert first_storage_keys

        with ThreadPoolExecutor(max_workers=1) as pool:
            second = pool.submit(_reset, maker)
            assert reached_lock.wait(timeout=5)
            _assert_waiting(second)

            holding.commit()
            second_result = second.result(timeout=30)
    finally:
        holding.close()

    second_space_id = second_result.space_id
    assert second_space_id != first_space_id
    assert second_space_id != initial_space_id

    with maker() as check:
        canonical = _active_shared_space(check, lea_id, alex_id)
        assert canonical.id == second_space_id
        assert check.get(Space, initial_space_id) is None
        assert check.get(Space, first_space_id) is None

        # The first reset's own Space and attachments are gone too: the
        # second reset (once unblocked) deleted them exactly like any other
        # ordinary reset, rather than racing around them.
        assert (
            not check.execute(select(Attachment.id).where(Attachment.space_id == first_space_id))
            .scalars()
            .all()
        )
        store = get_media_store()
        for storage_key in first_storage_keys:
            assert not store.exists(storage_key)


def test_ensure_waiting_behind_reset_observes_existing_space_without_creating_second(
    production_client, monkeypatch: pytest.MonkeyPatch
) -> None:  # type: ignore[no-untyped-def]
    """`ensure` (idempotent create) racing a `reset` must not produce a second Space."""
    _client, maker = production_client
    lea_id, alex_id, initial_space_id = _seed(maker)

    reached_lock = Event()
    original_lock = demo_service._lock_canonical_demo_dataset

    def announced_lock(session):  # type: ignore[no-untyped-def]
        reached_lock.set()
        original_lock(session)

    monkeypatch.setattr(demo_service, "_lock_canonical_demo_dataset", announced_lock)

    holding = maker()
    try:
        reset_result = demo_service.reset_demo_space(
            holding, environment=Environment.TEST, reference_date=REFERENCE_DATE
        )
        reset_space_id = reset_result.space_id
        assert reset_space_id != initial_space_id

        with ThreadPoolExecutor(max_workers=1) as pool:
            ensure = pool.submit(_ensure, maker)
            assert reached_lock.wait(timeout=5)
            _assert_waiting(ensure)

            holding.commit()
            ensure_result = ensure.result(timeout=30)
    finally:
        holding.close()

    # The waiting `ensure` observed the already-committed canonical Space and
    # reported it back rather than creating a second replacement.
    assert ensure_result.created is False
    assert ensure_result.space_id == reset_space_id

    with maker() as check:
        canonical = _active_shared_space(check, lea_id, alex_id)
        assert canonical.id == reset_space_id
        assert check.get(Space, initial_space_id) is None
        names = {
            account.display_name
            for account in check.execute(
                select(Account).where(Account.id.in_([lea_id, alex_id]))
            ).scalars()
        }
        assert names == {"Lea Sommer", "Alex Winter"}
