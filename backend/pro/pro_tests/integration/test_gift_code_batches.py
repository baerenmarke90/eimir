"""Operator side of gift code batches (ServerAdmin part 5, design sections 5.1-5.3)."""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from uuid import uuid4

import pytest
from eimir_pro.gift_codes import service
from eimir_pro.gift_codes.codes import add_months, lookup_hash
from eimir_pro.gift_codes.models import GiftCode, GiftCodeBatch
from eimir_pro.plugin import plugin
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.core import clock
from eimir.core.errors import NotFoundError, ValidationError
from eimir.entitlements.models import (
    EntitlementGrant,
    EntitlementSourceType,
    EntitlementStatus,
    EntitlementTier,
)
from eimir.security import lifecycle
from tests.conftest import make_account, make_space, requires_database
from tests.support.plugins import without_plugins

pytestmark = [pytest.mark.integration, requires_database]

CODE_FORMAT = re.compile(
    r"EIMIR-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}"
)


def _batch(session: Session, *, count: int = 3, **overrides: object) -> GiftCodeBatch:
    actor = make_account(session, "Operator")
    arguments: dict[str, object] = {
        "actor_id": actor.id,
        "count": count,
        "duration_months": 3,
        "redeemable_until": None,
        "note": "Spring promotion",
    }
    arguments.update(overrides)
    return service.create_batch(session, **arguments)  # type: ignore[arg-type]


def _redeem(session: Session, code: GiftCode, at: datetime) -> EntitlementGrant:
    """Mark a code redeemed the way the redemption path will, with its grant."""
    founder = make_account(session, "Founder")
    space = make_space(session, founder)
    grant = EntitlementGrant(
        space_id=space.id,
        source_type=EntitlementSourceType.ADMIN_GRANT.value,
        external_reference=f"gift-code:{code.id}",
        status=EntitlementStatus.ACTIVE.value,
        tier=EntitlementTier.PREMIUM.value,
        effective_from=clock.now(),
        effective_until=clock.now() + timedelta(days=90),
        metadata_={"giftCodeBatchId": str(code.batch_id)},
    )
    session.add(grant)
    session.flush()
    code.redeemed_at = at
    code.redeemed_space_id = space.id
    code.redeemed_grant_id = grant.id
    session.flush()
    return grant


def test_a_batch_has_distinct_encrypted_codes_and_defaults_to_twelve_months(
    session: Session,
) -> None:
    before = clock.now()
    batch = _batch(session, count=10)
    after = clock.now()

    assert batch.duration_months == 3
    assert batch.note == "Spring promotion"
    assert batch.created_by is not None
    assert add_months(before, 12) <= batch.redeemable_until <= add_months(after, 12)

    session.expire_all()
    codes = service.list_codes(session, batch.id)
    assert len(codes) == 10
    plain = [code.payload.code for code in codes]
    assert len(set(plain)) == 10
    assert all(CODE_FORMAT.fullmatch(value) for value in plain)
    assert [code.lookup_hash for code in codes] == [lookup_hash(value) for value in plain]
    assert all(code.handed_out_at is None and code.redeemed_at is None for code in codes)


def test_a_blank_note_is_stored_as_none(session: Session) -> None:
    batch = _batch(session, count=1, note="   ")

    assert batch.note is None


@pytest.mark.parametrize(
    "overrides",
    [
        {"count": 0},
        {"count": 101},
        {"duration_months": 2},
        {"note": "x" * 121},
        {"redeemable_until": "yesterday"},
        {"redeemable_until": "beyond"},
    ],
    ids=["count-0", "count-101", "duration-2", "note-121", "until-yesterday", "until-25-months"],
)
def test_out_of_range_batch_values_are_refused(
    session: Session, overrides: dict[str, object]
) -> None:
    current = clock.now()
    if overrides.get("redeemable_until") == "yesterday":
        overrides = {"redeemable_until": current - timedelta(days=1)}
    elif overrides.get("redeemable_until") == "beyond":
        overrides = {"redeemable_until": add_months(current, 24) + timedelta(days=1)}
    batches_before = session.scalar(select(func.count()).select_from(GiftCodeBatch))

    with pytest.raises(ValidationError) as raised:
        _batch(session, **overrides)

    assert raised.value.code == "GIFT_CODE_BATCH_INVALID"
    assert session.scalar(select(func.count()).select_from(GiftCodeBatch)) == batches_before


def test_the_largest_batch_and_the_latest_deadline_are_accepted(session: Session) -> None:
    deadline = add_months(clock.now(), 24) - timedelta(minutes=1)

    batch = _batch(session, count=100, duration_months=12, redeemable_until=deadline)

    assert batch.redeemable_until == deadline
    assert len(service.list_codes(session, batch.id)) == 100


def test_generation_retries_on_a_lookup_hash_collision(
    session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    existing = service.list_codes(session, _batch(session, count=1).id)[0].payload.code
    candidates = iter([existing, "EIMIR-CCCC-CCCC", "EIMIR-CCCC-CCCC", "EIMIR-DDDD-DDDD"])
    monkeypatch.setattr(service, "generate_code", lambda: next(candidates))

    batch = _batch(session, count=2)

    assert sorted(code.payload.code for code in service.list_codes(session, batch.id)) == [
        "EIMIR-CCCC-CCCC",
        "EIMIR-DDDD-DDDD",
    ]


def test_handed_out_toggles_and_revoking_a_code_ends_it(session: Session) -> None:
    batch = _batch(session)
    code = service.list_codes(session, batch.id)[0]
    at = clock.now()
    assert service.code_state(code, batch, at) == "open"

    service.set_handed_out(session, code.id, True)
    assert service.code_state(code, batch, at) == "handed_out"
    marked_at = code.handed_out_at
    service.set_handed_out(session, code.id, True)
    assert code.handed_out_at == marked_at

    service.set_handed_out(session, code.id, False)
    assert service.code_state(code, batch, at) == "open"

    revoker = make_account(session, "Revoking operator")
    service.revoke_code(session, code.id, revoker.id)
    assert service.code_state(code, batch, at) == "revoked"
    assert code.revoked_by == revoker.id
    first_revoked_at = code.revoked_at
    service.revoke_code(session, code.id, batch.created_by)  # type: ignore[arg-type]
    assert (code.revoked_at, code.revoked_by) == (first_revoked_at, revoker.id)
    with pytest.raises(ValidationError) as raised:
        service.set_handed_out(session, code.id, True)
    assert raised.value.code == "GIFT_CODE_NOT_OPEN"


def test_a_redeemed_code_cannot_be_revoked(session: Session) -> None:
    batch = _batch(session, count=1)
    code = service.list_codes(session, batch.id)[0]
    _redeem(session, code, clock.now())

    with pytest.raises(ValidationError) as raised:
        service.revoke_code(session, code.id, batch.created_by)  # type: ignore[arg-type]

    assert raised.value.code == "GIFT_CODE_ALREADY_REDEEMED"
    assert code.revoked_at is None


def test_revoking_a_batch_keeps_redeemed_codes_and_their_grants(session: Session) -> None:
    batch = _batch(session)
    redeemed, handed_out, untouched = service.list_codes(session, batch.id)
    grant = _redeem(session, redeemed, clock.now())
    service.set_handed_out(session, handed_out.id, True)
    actor = make_account(session, "Second operator")

    service.revoke_batch(session, batch.id, actor.id)

    at = clock.now()
    assert batch.revoked_at is not None
    assert batch.revoked_by == actor.id
    assert service.code_state(redeemed, batch, at) == "redeemed"
    assert service.code_state(handed_out, batch, at) == "revoked"
    assert service.code_state(untouched, batch, at) == "revoked"
    assert redeemed.revoked_at is None
    assert redeemed.revoked_by is None
    assert (handed_out.revoked_by, untouched.revoked_by) == (actor.id, actor.id)
    session.refresh(grant)
    assert grant.status == EntitlementStatus.ACTIVE.value


def test_codes_past_the_deadline_are_expired_unless_redeemed(session: Session) -> None:
    batch = _batch(session)
    open_code, handed_out, redeemed = service.list_codes(session, batch.id)
    service.set_handed_out(session, handed_out.id, True)
    _redeem(session, redeemed, clock.now())
    later = batch.redeemable_until + timedelta(seconds=1)

    assert service.code_state(open_code, batch, batch.redeemable_until) == "open"
    assert service.code_state(open_code, batch, later) == "expired"
    assert service.code_state(handed_out, batch, later) == "expired"
    assert service.code_state(redeemed, batch, later) == "redeemed"


def test_batches_are_listed_newest_first_with_counts_per_state(session: Session) -> None:
    older = _batch(session, count=2)
    older.created_at = clock.now() - timedelta(days=3)
    newer = _batch(session, count=5)
    open_code, handed_out, redeemed, revoked, _ = service.list_codes(session, newer.id)
    service.set_handed_out(session, handed_out.id, True)
    _redeem(session, redeemed, clock.now())
    service.revoke_code(session, revoked.id, newer.created_by)  # type: ignore[arg-type]
    del open_code
    session.flush()

    summaries = [
        summary
        for summary in service.list_batches(session, clock.now())
        if summary.id in {older.id, newer.id}
    ]

    assert [summary.id for summary in summaries] == [newer.id, older.id]
    first, second = summaries
    assert (first.total, first.open, first.handed_out, first.redeemed, first.revoked) == (
        5,
        2,
        1,
        1,
        1,
    )
    assert first.expired == 0
    assert first.note == "Spring promotion"
    assert first.duration_months == 3
    expired = service.list_batches(session, older.redeemable_until + timedelta(seconds=1))
    older_expired = next(summary for summary in expired if summary.id == older.id)
    assert (older_expired.open, older_expired.expired) == (0, 2)
    assert (second.total, second.open) == (2, 2)


def test_unknown_batches_and_codes_are_not_found(session: Session) -> None:
    with pytest.raises(NotFoundError) as batch_missing:
        service.get_batch(session, uuid4())
    with pytest.raises(NotFoundError) as code_missing:
        service.set_handed_out(session, uuid4(), True)
    with pytest.raises(NotFoundError) as revoke_missing:
        service.revoke_batch(session, uuid4(), uuid4())

    assert batch_missing.value.code == "GIFT_CODE_BATCH_NOT_FOUND"
    assert code_missing.value.code == "GIFT_CODE_NOT_FOUND"
    assert revoke_missing.value.code == "GIFT_CODE_BATCH_NOT_FOUND"


def test_get_batch_returns_the_batch(session: Session) -> None:
    batch = _batch(session, count=1)

    assert service.get_batch(session, batch.id) is batch


def test_pruning_keeps_open_and_recent_batches_and_removes_old_finished_ones(
    session: Session,
) -> None:
    at = clock.now()
    open_batch = _batch(session, count=1)

    old_finished = _batch(session, count=1)
    old_finished.created_at = add_months(at, -25)
    old_finished.redeemable_until = add_months(at, -13)
    _redeem(session, service.list_codes(session, old_finished.id)[0], add_months(at, -25))

    recently_redeemed = _batch(session, count=1)
    recently_redeemed.created_at = add_months(at, -25)
    recently_redeemed.redeemable_until = add_months(at, -13)
    _redeem(session, service.list_codes(session, recently_redeemed.id)[0], add_months(at, -23))

    old_expired = _batch(session, count=1)
    old_expired.created_at = add_months(at, -40)
    old_expired.redeemable_until = add_months(at, -28)
    session.flush()
    old_finished_id, old_expired_id = old_finished.id, old_expired.id

    service.prune_batches(session, at)
    session.expire_all()

    remaining = set(session.scalars(select(GiftCodeBatch.id)))
    assert open_batch.id in remaining
    assert recently_redeemed.id in remaining
    assert old_finished_id not in remaining
    assert old_expired_id not in remaining
    assert (
        session.scalar(
            select(func.count())
            .select_from(GiftCode)
            .where(GiftCode.batch_id.in_((old_finished_id, old_expired_id)))
        )
        == 0
    )


def test_the_plugin_retention_hook_prunes_batches(session: Session) -> None:
    old_expired = _batch(session, count=1)
    old_expired.created_at = add_months(clock.now(), -40)
    old_expired.redeemable_until = add_months(clock.now(), -28)
    session.flush()
    batch_id = old_expired.id

    plugin.prune_expired(session)
    session.expire_all()

    assert session.get(GiftCodeBatch, batch_id) is None


def test_encryption_status_reports_the_existing_chain_table_without_the_plugin(
    session: Session,
) -> None:
    """A chain table that exists is covered also after the plugin was removed."""
    _batch(session, count=2)

    with without_plugins():
        reports = {report.table: report for report in lifecycle.payload_status(session)}

    assert {"gift_codes"} <= set(reports)
    assert sum(reports["gift_codes"].by_crypto_version.values()) >= 2
